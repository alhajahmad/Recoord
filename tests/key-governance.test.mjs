import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('key governance controls future issuance while preserving existing keys and user isolation',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__keyGovernanceEnv={DB,AI_BASE_URL:'https://model.test/v1',AI_MODEL:'test',AI_API_KEY:'secret'};const dir=await mkdtemp(join(tmpdir(),'recoord-keys-'));
 const originalFetch=globalThis.fetch;let fetches=0;globalThis.fetch=async()=>{fetches++;throw new Error("Unexpected external call")};
 try{
  const routes={};for(const [name,path] of ['key-governance','developer-keys','v1/project'].map(name=>[name,'app/api/'+name+'/route.ts'])){const outfile=join(dir,name.replaceAll('/','-')+'.mjs');await build({entryPoints:[resolve(path)],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__keyGovernanceEnv':'export async function getChatGPTUser(){return globalThis.__keyGovernanceUser}',loader:'js'}));}}]});routes[name]=await import(pathToFileURL(outfile));}
  async function req(route,user,method='GET',data,origin='https://recoord.test',headers={}){globalThis.__keyGovernanceUser=user?{userId:user,email:user+'@example.test',displayName:user}:null;const response=await routes[route][method](new Request('https://recoord.test/api/'+route+'?owner=bob',{method,headers:{origin,'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined}));return {status:response.status,data:await response.json(),headers:response.headers};}
  const settings=(user,method='GET',data,origin)=>req('key-governance',user,method,data,origin),defaults={creationDisabled:false,maxLifetimeDays:30};
  const noUser=await settings(null);assert.equal(noUser.status,401);assert.equal(noUser.headers.get('Cache-Control'),'private, no-store');assert.equal((await settings(null,'PATCH',defaults)).status,401);
  for(const origin of ['https://evil.test',''])assert.equal((await settings('alice','PATCH',defaults,origin)).status,403);
  const initial=await settings('alice');assert.deepEqual(initial.data,defaults);assert.equal(initial.headers.get('Cache-Control'),'private, no-store');
  for(const data of [{...defaults,creationDisabled:1},{...defaults,creationDisabled:'false'},{...defaults,maxLifetimeDays:0},{...defaults,maxLifetimeDays:31},{...defaults,maxLifetimeDays:1.5},{...defaults,maxLifetimeDays:'7'},{creationDisabled:false},{}]){const invalid=await settings('alice','PATCH',data);assert.equal(invalid.status,400);assert.equal(invalid.headers.get('Cache-Control'),'private, no-store')}
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM key_governance').get().n,0);
  await settings('bob');for(const owner of ['alice','bob'])sql.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(owner+'-p',owner,'Project','Goal','Context',1);
  async function create(user){return req('developer-keys',user,'POST',{project:user+'-p',label:'Key',expires:Date.now()+365*86400000,maxLifetimeDays:365})}
  const oldKey=await create('alice');assert.equal(oldKey.status,201);assert.equal(oldKey.data.record.expiresAt-oldKey.data.record.createdAt,30*86400000);
  assert.equal((await settings('alice','PATCH',{creationDisabled:false,maxLifetimeDays:7})).status,200);const shortKey=await create('alice');assert.equal(shortKey.status,201);assert.equal(shortKey.data.record.expiresAt-shortKey.data.record.createdAt,7*86400000);
  assert.equal(sql.prepare('SELECT expires FROM developer_keys WHERE id=?').get(oldKey.data.record.id).expires,oldKey.data.record.expiresAt);
  assert.equal((await settings('alice','PATCH',{creationDisabled:true,maxLifetimeDays:1})).status,200);const before=sql.prepare("SELECT COUNT(*) n FROM developer_keys WHERE owner='alice'").get().n;const denied=await create('alice');assert.equal(denied.status,403);assert.equal(denied.headers.get('Cache-Control'),'private, no-store');assert.equal(sql.prepare("SELECT COUNT(*) n FROM developer_keys WHERE owner='alice'").get().n,before);
  for(const key of [oldKey.data.key,shortKey.data.key])assert.equal((await req('v1/project',null,'GET',null,'https://recoord.test',{authorization:'Bearer '+key})).status,200);
  const bobPolicy=await settings('bob','PATCH',{...defaults,owner:'alice'});assert.equal(bobPolicy.status,200);assert.deepEqual((await settings('alice')).data,{creationDisabled:true,maxLifetimeDays:1});const bobKey=await create('bob');assert.equal(bobKey.status,201);assert.equal(bobKey.data.record.expiresAt-bobKey.data.record.createdAt,30*86400000);
  assert.equal((await settings('alice','PATCH',{creationDisabled:false,maxLifetimeDays:1})).status,200);const resumed=await create('alice');assert.equal(resumed.status,201);assert.equal(resumed.data.record.expiresAt-resumed.data.record.createdAt,86400000);
  assert.equal((await req('developer-keys','alice','DELETE',{id:oldKey.data.record.id})).status,200);assert.equal((await req('v1/project',null,'GET',null,'https://recoord.test',{authorization:'Bearer '+oldKey.data.key})).status,401);
  assert.equal(fetches,0);
 }finally{globalThis.fetch=originalFetch;sql.close();await rm(dir,{recursive:true,force:true});delete globalThis.__keyGovernanceEnv;delete globalThis.__keyGovernanceUser;}
});
