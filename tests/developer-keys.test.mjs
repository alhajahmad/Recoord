import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

test('project API keys are owner managed, hashed, scoped, bounded, rate limited and revocable',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__keysEnv={DB};const dir=await mkdtemp(join(tmpdir(),'recoord-keys-'));
 const realNow=Date.now;Date.now=()=>1791136800000;
 try{
  const routes={};for(const [name,path] of [['keys','app/api/developer-keys/route.ts'],['project','app/api/v1/project/route.ts']]){const outfile=join(dir,name+'.mjs');await build({entryPoints:[resolve(path)],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__keysEnv':'export async function getChatGPTUser(){return globalThis.__keysUser}',loader:'js'}));}}]});routes[name]=await import(pathToFileURL(outfile));}
  async function manage(user,method='GET',data,origin='https://recoord.test'){globalThis.__keysUser=user?{userId:user,email:user+'@example.test',displayName:user}:null;const response=await routes.keys[method](new Request('https://recoord.test/api/developer-keys',{method,headers:{origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}));return {status:response.status,data:await response.json(),headers:response.headers};}
  async function read(key,query=''){const response=await routes.project.GET(new Request('https://recoord.test/api/v1/project'+query,{headers:key?{authorization:'Bearer '+key}:{}}));return {status:response.status,data:await response.json(),headers:response.headers};}
  for(const id of ['alice','bob','editor','viewer'])sql.prepare('INSERT INTO profiles VALUES (?,?,?)').run(id,id+'@example.test',id);
  for(const [id,owner] of [['p','alice'],['other','bob']])sql.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(id,owner,id+' title',id+' goal','PRIVATE AI CONTEXT',1);
  for(const role of ['viewer','editor'])sql.prepare('INSERT INTO members VALUES (?,?,?,?)').run(role,'p',role,role);
  sql.prepare("INSERT INTO conversations (id,owner,title,updated) VALUES ('chat','alice','PRIVATE AI CHAT',1)").run();
  sql.prepare("INSERT INTO direct_messages (id,sender,recipient,content,created) VALUES ('dm','alice','bob','PRIVATE DIRECT MESSAGE',1)").run();
  const payload={project:'p',label:'Dashboard'};
  assert.equal((await manage(null)).status,401);assert.equal((await manage(null,'POST',payload)).status,401);
  assert.equal((await manage('alice','POST',payload,'https://evil.test')).status,403);assert.equal((await manage('alice','POST',payload,'')).status,403);
  for(const role of ['viewer','editor'])assert.equal((await manage(role,'POST',payload)).status,403);
  assert.equal((await manage('bob','POST',payload)).status,404);assert.equal((await manage('alice','POST',{...payload,label:' '})).status,400);
  const created=await manage('alice','POST',payload);assert.equal(created.status,201);assert.equal(created.headers.get('Cache-Control'),'private, no-store');assert.match(created.data.key,/^rc_[a-f0-9]{64}$/);
  const {key,record}=created.data;assert.equal(record.expiresAt-record.createdAt,30*86400000);assert.equal(record.projectId,'p');
  const stored=sql.prepare('SELECT * FROM developer_keys WHERE id=?').get(record.id);assert.equal(stored.hash,createHash('sha256').update(key).digest('hex'));assert.equal(stored.prefix,key.slice(0,11));assert(!JSON.stringify(stored).includes(key));assert(!('hash' in record));assert(!('key' in record));
  const listed=await manage('alice');assert.equal(listed.data.keys.length,1);assert(!JSON.stringify(listed).includes(key));assert(!JSON.stringify(listed).includes(stored.hash));assert.deepEqual((await manage('bob')).data.keys,[]);
  assert.equal((await manage('bob','DELETE',{id:record.id})).status,404);assert.equal((await manage('alice','DELETE',{id:record.id},'https://evil.test')).status,403);
  assert.equal((await read()).status,401);assert.equal((await read('rc_'+'0'.repeat(64))).status,401);assert.equal((await read('invalid')).status,401);
  for(let i=0;i<101;i++)sql.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?)').run('task'+i,'p','Task '+i,'alice',null,'todo',1,i);
  for(let i=0;i<21;i++)sql.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?,?)').run('doc'+i,'alice','p','Document '+i,'Shared content '+i,1,i);
  sql.prepare("INSERT INTO tasks VALUES ('other-task','other','OTHER PROJECT TASK',NULL,NULL,'todo',1,1)").run();
  const result=await read(key,'?project=other&user=bob');assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'private, no-store');assert.equal(result.data.project.id,'p');assert.equal(result.data.tasks.length,100);assert.equal(result.data.documents.length,20);assert.deepEqual(result.data.truncated,{tasks:true,documents:true});assert.deepEqual(result.data.limits,{tasks:100,documents:20});assert.equal(result.data.tasks[0].id,'task100');
  const serialized=JSON.stringify(result.data);for(const secret of ['PRIVATE AI CONTEXT','PRIVATE AI CHAT','PRIVATE DIRECT MESSAGE','OTHER PROJECT TASK','alice@example.test',key,stored.hash])assert(!serialized.includes(secret),secret+' leaked');assert(result.data.tasks.every(t=>!('assignee' in t)));assert(result.data.documents.every(d=>!('owner' in d)));assert.equal(sql.prepare('SELECT last_used FROM developer_keys WHERE id=?').get(record.id).last_used,Date.now());
  for(let i=1;i<60;i++)assert.equal((await read(key)).status,200);const limited=await read(key);assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
  Date.now=()=>1791136860000;assert.equal((await read(key)).status,200);
  assert.equal((await manage('alice','DELETE',{id:record.id})).status,200);assert.equal((await read(key)).status,401);assert((await manage('alice')).data.keys[0].revokedAt);
  const second=await manage('alice','POST',payload);assert.notEqual(second.data.key,key);sql.prepare('UPDATE developer_keys SET expires=? WHERE id=?').run(Date.now(),second.data.record.id);assert.equal((await read(second.data.key)).status,401);
  const transferred=await manage('alice','POST',payload);sql.prepare("UPDATE projects SET owner='bob' WHERE id='p'").run();assert.equal((await read(transferred.data.key)).status,401);assert.deepEqual((await manage('alice')).data.keys,[]);sql.prepare("UPDATE projects SET owner='alice' WHERE id='p'").run();
  const activeBefore=sql.prepare('SELECT COUNT(*) n FROM developer_keys WHERE owner=? AND revoked IS NULL AND expires>?').get('alice',Date.now()).n;
  const attempts=await Promise.all(Array.from({length:25},(_,i)=>manage('alice','POST',{...payload,label:'Concurrent '+i})));assert.equal(attempts.filter(r=>r.status===201).length,20-activeBefore);assert.equal(attempts.filter(r=>r.status===429).length,25-(20-activeBefore));assert.equal(sql.prepare('SELECT COUNT(*) n FROM developer_keys WHERE owner=? AND revoked IS NULL AND expires>?').get('alice',Date.now()).n,20);
  sql.prepare("DELETE FROM projects WHERE id='p'").run();assert.equal(sql.prepare("SELECT COUNT(*) n FROM developer_keys WHERE project='p'").get().n,0);assert.equal((await read(transferred.data.key)).status,401);
 }finally{Date.now=realNow;sql.close();await rm(dir,{recursive:true,force:true});delete globalThis.__keysEnv;delete globalThis.__keysUser;}
});
