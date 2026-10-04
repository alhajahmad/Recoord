import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('social profiles keep private data private and enforce connection authority, blocks, invitations and deletion',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__networkEnv={DB};const dir=await mkdtemp(join(tmpdir(),'recoord-network-')),routes={};
 try{
  for(const name of ['profile','network','export','data','team']){const outfile=join(dir,name+'.mjs');await build({entryPoints:[resolve('app/api/'+name+'/route.ts')],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__networkEnv':'export async function getChatGPTUser(){return globalThis.__networkUser}',loader:'js'}));}}]});routes[name]=await import(pathToFileURL(outfile));}
  async function req(user,route='network',method='GET',data,query='',origin='https://recoord.test'){globalThis.__networkUser=user?{userId:user,email:user+'@example.com',displayName:user}:null;const response=await routes[route][method](new Request('https://recoord.test/api/'+route+query,{method,headers:{origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}));return {status:response.status,data:await response.json()};}
  const details={name:'Alice',bio:'Private bio',title:'Builder',company:'',location:'',website:'',photo:'',skills:'Design',lookingFor:'Teammates'};
  assert.equal((await req(null)).status,401);
  assert.equal((await req('alice','profile','PATCH',{...details,username:'alice'})).status,200);
  assert.equal((await req('bob','profile')).data.visibility,'private');
  assert.equal((await req('bob','network','GET',null,'?username=alice')).status,404);
  assert.equal((await req('bob')).data.profiles.length,0);
  assert.equal((await req('alice','profile','PATCH',{...details,username:'a!'})).status,400);
  assert.equal((await req('alice','profile','PATCH',{...details,visibility:'members',username:''})).status,400);
  assert.equal((await req('alice','profile','PATCH',{...details,username:'Alice',visibility:'members'})).status,200);
  assert.equal((await req('bob','profile','PATCH',{...details,username:'ALICE'})).status,409);
  const visible=(await req('bob')).data.profiles[0];assert.equal(visible.username,'alice');assert(!('email' in visible));assert.equal(visible.relationship,'none');
  assert.equal((await req('bob','network','GET',null,'?q=design')).data.profiles.length,1);
  assert.equal((await req('bob','network','GET',null,'?q=%')).data.profiles.length,0);
  assert.equal((await req('bob','network','POST',{action:'request',user:'alice'},'','https://evil.test')).status,403);
  assert.equal((await req('bob','network','POST',{action:'request',user:'alice'})).status,200);
  assert.equal((await req('bob','network','POST',{action:'accept',user:'alice'})).status,403);
  assert.equal((await req('alice','network','POST',{action:'cancel',user:'bob'})).status,403);
  const incoming=(await req('alice','network','GET',null,'?mode=network')).data.incoming[0];assert.equal(incoming.name,'bob');assert(!('bio' in incoming));assert(!('email' in incoming));
  assert.equal((await req('alice','network','POST',{action:'accept',user:'bob'})).status,200);
  assert.equal((await req('bob','network','POST',{action:'request',user:'alice'})).status,409);
  assert.equal((await req('alice','network','GET',null,'?mode=network')).data.connections.length,1);
  assert.equal((await req('bob','network','POST',{action:'remove',user:'alice'})).status,200);
  await req('bob','network','POST',{action:'request',user:'alice'});assert.equal((await req('alice','network','POST',{action:'decline',user:'bob'})).status,200);
  await req('bob','network','POST',{action:'request',user:'alice'});assert.equal((await req('bob','network','POST',{action:'cancel',user:'alice'})).status,200);
  const quotaKey='network:bob:'+new Date().toISOString().slice(0,10);sql.prepare('UPDATE quotas SET count=50 WHERE key=?').run(quotaKey);assert.equal((await req('bob','network','POST',{action:'request',user:'alice'})).status,429);sql.prepare('UPDATE quotas SET count=0 WHERE key=?').run(quotaKey);
  sql.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run('p','bob','Launch','','',1);
  assert.equal((await req('bob','network','POST',{action:'invite',user:'alice',project:'p'})).status,403);
  await req('bob','network','POST',{action:'request',user:'alice'});await req('alice','network','POST',{action:'accept',user:'bob'});
  const invited=await req('bob','network','POST',{action:'invite',user:'alice',project:'p'});assert.equal(invited.status,200);assert(!JSON.stringify(invited.data).includes('example.com'));assert.equal(sql.prepare('SELECT role FROM invitations').get().role,'viewer');
  assert.equal((await req('alice','network','POST',{action:'invite',user:'bob',project:'p'})).status,404);
  await req('bob','network','POST',{action:'request',user:'alice'});await req('alice','network','POST',{action:'accept',user:'bob'});
  assert.equal((await req('alice','network','POST',{action:'block',user:'bob'})).status,200);
  assert.equal(sql.prepare('SELECT count(*) n FROM connections').get().n,0);assert.equal(sql.prepare('SELECT count(*) n FROM invitations').get().n,0);assert.equal((await req('bob','team','POST',{action:'invite',project:'p',email:'alice@example.com',role:'viewer'})).status,404);assert.equal((await req('alice','team','POST',{action:'accept',id:invited.data.id})).status,404);
  assert.equal((await req('bob','network','POST',{action:'request',user:'alice'})).status,404);
  assert.equal((await req('bob','network','POST',{action:'invite',user:'alice',project:'p'})).status,404);
  assert.equal((await req('bob','network','GET',null,'?username=alice')).status,404);
  assert.equal((await req('bob')).data.profiles.length,0);
  assert.equal((await req('alice','network','GET',null,'?mode=network')).data.blocked.length,1);
  assert.equal((await req('bob','export')).data.social.blocks.length,0);
  assert.equal((await req('alice','export')).data.social.blocks[0].target,'bob');
  await req('alice','network','POST',{action:'unblock',user:'bob'});
  await req('bob','network','POST',{action:'request',user:'alice'});
  assert.equal((await req('alice','profile','PATCH',{...details,visibility:'private'})).status,200);
  assert.equal((await req('alice','profile')).data.username,'alice');
  assert.equal((await req('bob','network','GET',null,'?username=alice')).status,404);
  assert.equal((await req('alice','network','POST',{action:'accept',user:'bob'})).status,200);
  const privateConnection=(await req('bob','network','GET',null,'?mode=network')).data.connections[0];assert(!('bio' in privateConnection));assert.equal(privateConnection.username,null);
  assert.equal((await req('alice','data','DELETE',{confirm:'DELETE MY DATA'})).status,200);
  assert.equal(sql.prepare('SELECT count(*) n FROM connections').get().n,0);assert.equal(sql.prepare('SELECT count(*) n FROM profile_details WHERE id=?').get('alice').n,0);
 }finally{sql.close();await rm(dir,{recursive:true,force:true});}
});
