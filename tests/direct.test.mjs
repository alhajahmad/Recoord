import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('direct messages enforce participant access, connections, blocks, idempotency and stable history pagination',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}}};
 globalThis.__directEnv={DB};const dir=await mkdtemp(join(tmpdir(),'recoord-direct-'));
 try{
  const outfile=join(dir,'route.mjs');await build({entryPoints:[resolve('app/api/direct/route.ts')],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__directEnv':'export async function getChatGPTUser(){return globalThis.__directUser}',loader:'js'}));}}]});
  const route=await import(pathToFileURL(outfile));
  async function req(user,method='GET',data,query='',origin='https://recoord.test'){globalThis.__directUser=user?{userId:user,email:user+'@example.com',displayName:user}:null;const response=await route[method](new Request('https://recoord.test/api/direct'+query,{method,headers:{origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}));return {status:response.status,data:await response.json()};}
  assert.equal((await req(null)).status,401);
  for(const name of ['alice','bob','eve'])await req(name);
  const pair=JSON.stringify(['alice','bob']);
  const connect=()=>sql.prepare("INSERT INTO connections (id,sender,recipient,status,created,updated) VALUES (?,?,?,'accepted',1,1)").run(pair,'alice','bob');
  const message={user:'bob',content:'Private message',id:crypto.randomUUID()};
  assert.equal((await req('alice','POST',message)).status,403);
  assert.equal((await req('eve','GET',null,'?user=alice')).status,404);
  connect();
  assert.equal((await req('alice','POST',message,'','https://evil.test')).status,403);
  assert.equal((await req('alice','POST',{...message,id:'bad'})).status,400);
  assert.equal((await req('alice','POST',{...message,content:'x'.repeat(4001)})).status,400);
  assert.equal((await req('alice','POST',message)).status,200);
  assert.equal((await req('alice','POST',message)).status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM direct_messages').get().n,1);
  assert.equal((await req('alice','POST',{...message,content:'Different'})).status,409);
  const reply={user:'alice',content:'Reply',id:crypto.randomUUID()};
  assert.equal((await req('bob','POST',reply)).status,200);
  sql.prepare('UPDATE direct_messages SET created=1 WHERE id=?').run(message.id);sql.prepare('UPDATE direct_messages SET created=2 WHERE id=?').run(reply.id);
  const list=(await req('alice')).data.conversations;assert.equal(list.length,1);assert.equal(list[0].user,'bob');assert.equal(list[0].lastMessage,'Reply');assert(!('email' in list[0]));
  assert.equal((await req('eve')).data.conversations.length,0);
  assert.equal((await req('eve','GET',null,'?user=alice')).status,404);
  const own=(await req('alice','GET',null,'?user=bob')).data;assert.equal(own.messages.length,2);assert.equal(own.canSend,true);assert.equal(own.person.photo,null);assert.equal(own.person.username,null);assert(!('email' in own.person));
  sql.prepare('DELETE FROM connections WHERE id=?').run(pair);
  assert.equal((await req('alice','GET',null,'?user=bob')).data.canSend,false);
  assert.equal((await req('alice','POST',{...message,id:crypto.randomUUID()})).status,403);
  connect();
  sql.prepare('INSERT INTO blocks (id,owner,target,created) VALUES (?,?,?,1)').run('block','bob','alice');
  assert.equal((await req('alice','GET',null,'?user=bob')).status,404);
  assert.equal((await req('bob','GET',null,'?user=alice')).status,404);
  assert.equal((await req('alice')).data.conversations.length,0);
  assert.equal((await req('alice','POST',message)).status,404);
  sql.exec('DELETE FROM blocks');
  sql.exec('DELETE FROM direct_messages');
  const ids=[];for(let n=0;n<205;n++){const id=String(n).padStart(6,'0');ids.push(id);sql.prepare('INSERT INTO direct_messages VALUES (?,?,?,?,?)').run(id,n%2?'bob':'alice',n%2?'alice':'bob','History '+n,1000+Math.floor(n/150));}
  const collected=[];let cursor='';for(let page=0;page<3;page++){const response=await req('alice','GET',null,'?user=bob'+cursor);assert.equal(response.status,200);const data=response.data;collected.unshift(...data.messages.map(m=>m.id));if(data.hasMore){assert.equal(data.messages.length,100);cursor='&before='+data.nextBefore+'&beforeId='+data.nextBeforeId}else assert.equal(page,2);}
  assert.deepEqual(collected,ids);
  assert.equal((await req('alice','GET',null,'?user=bob&before=bad')).status,400);
  assert.equal((await req('alice','GET',null,'?user=bob&beforeId=foo')).status,400);
  const quota='direct:alice:'+Math.floor(Date.now()/60000);sql.prepare('INSERT INTO quotas (key,count) VALUES (?,100) ON CONFLICT(key) DO UPDATE SET count=100').run(quota);
  assert.equal((await req('alice','POST',{...message,id:crypto.randomUUID()})).status,429);
 }finally{sql.close();await rm(dir,{recursive:true,force:true});}
});
