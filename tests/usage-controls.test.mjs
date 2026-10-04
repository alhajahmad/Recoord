import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('usage preferences persist per user and monthly caps gate AI routes in UTC',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__usageControlsEnv={DB,AI_BASE_URL:'https://model.test/v1',AI_MODEL:'test',AI_API_KEY:'secret'};const dir=await mkdtemp(join(tmpdir(),'recoord-keys-'));
 const originalFetch=globalThis.fetch;const RealDate=Date;let now=RealDate.parse('2026-12-31T23:30:00-08:00');globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
 let fetches=0;globalThis.fetch=async()=>{fetches++;return Response.json({choices:[{message:{content:JSON.stringify({summary:'Project summary',suggestions:[]})}}]})};
 try{
  const routes={};for(const [name,path] of ['usage-preferences','chat','summary'].map(name=>[name,'app/api/'+name+'/route.ts'])){const outfile=join(dir,name.replaceAll('/','-')+'.mjs');await build({entryPoints:[resolve(path)],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__usageControlsEnv':'export async function getChatGPTUser(){return globalThis.__usageControlsUser}',loader:'js'}));}}]});routes[name]=await import(pathToFileURL(outfile));}
  async function req(route,user,method='GET',data,origin='https://recoord.test'){globalThis.__usageControlsUser=user?{userId:user,email:user+'@example.test',displayName:user}:null;const response=await routes[route][method](new Request('https://recoord.test/api/'+route+'?user=bob',{method,headers:{origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}));return {status:response.status,data:await response.json(),headers:response.headers};}
  const prefs=(user,method='GET',data,origin)=>req('usage-preferences',user,method,data,origin);
  assert.equal((await prefs(null)).status,401);assert.equal((await prefs(null,'PATCH',{})).status,401);
  const values={monthlyLimit:1,alertAt:65,alertsEnabled:false};assert.equal((await prefs('alice','PATCH',values,'https://evil.test')).status,403);
  const initial=await prefs('alice');assert.equal(initial.headers.get('Cache-Control'),'no-store');assert.equal(initial.data.month,'2027-01');assert.equal(initial.data.resetsAt,'2027-02-01T00:00:00.000Z');assert.equal(initial.data.monthlyLimit,1000);assert.equal(initial.data.requests,0);
  for(const patch of [{monthlyLimit:0},{monthlyLimit:1000001},{monthlyLimit:1.5},{monthlyLimit:'20'},{alertAt:0},{alertAt:101},{alertAt:1.5},{alertsEnabled:'yes'}])assert.equal((await prefs('alice','PATCH',{...values,...patch})).status,400);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM usage_preferences WHERE owner='alice'").get().n,0);
  const saved=await prefs('alice','PATCH',{...values,owner:'bob',requests:0});assert.equal(saved.status,200);assert.equal(saved.data.monthlyLimit,1);assert.equal(saved.data.alertAt,65);assert.equal(saved.data.alertsEnabled,false);assert.equal((await prefs('alice')).data.monthlyLimit,1);assert.equal((await prefs('bob')).data.monthlyLimit,1000);
  sql.prepare("INSERT INTO projects VALUES ('p','alice','Project','Goal','Context',1)").run();
  assert.equal((await req('summary','alice','POST',{project:'p'})).status,200);assert.equal(fetches,1);assert.equal((await prefs('alice')).data.requests,1);assert.equal((await prefs('alice')).data.remaining,0);assert.equal(sql.prepare("SELECT count FROM quotas WHERE key='month:alice:2027-01'").get().count,1);
  const before=JSON.stringify(sql.prepare('SELECT * FROM quotas ORDER BY key').all());
  assert.equal((await req('chat','alice','POST',{project:'p',id:'chat',requestId:'request',content:'Hello'})).status,429);assert.equal((await req('summary','alice','POST',{project:'p'})).status,429);assert.equal(fetches,1);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM quotas ORDER BY key').all()),before);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM conversations').get().n,0);
  const raised=await prefs('alice','PATCH',{...values,monthlyLimit:2});assert.equal(raised.data.requests,1);assert.equal(raised.data.remaining,1);assert.equal((await req('summary','alice','POST',{project:'p'})).status,200);assert.equal(fetches,2);
  const lowered=await prefs('alice','PATCH',values);assert.equal(lowered.data.requests,2);assert.equal(lowered.data.remaining,0);assert.equal((await req('summary','alice','POST',{project:'p'})).status,429);
  now=RealDate.parse('2027-02-01T00:00:00Z');const next=await prefs('alice');assert.equal(next.data.month,'2027-02');assert.equal(next.data.requests,0);assert.equal(next.data.monthlyLimit,1);assert.equal(next.data.resetsAt,'2027-03-01T00:00:00.000Z');assert.equal((await req('summary','alice','POST',{project:'p'})).status,200);assert.equal(sql.prepare("SELECT count FROM quotas WHERE key='month:alice:2027-01'").get().count,2);assert.equal(sql.prepare("SELECT count FROM quotas WHERE key='month:alice:2027-02'").get().count,1);
 }finally{globalThis.Date=RealDate;globalThis.fetch=originalFetch;sql.close();await rm(dir,{recursive:true,force:true});delete globalThis.__usageControlsEnv;delete globalThis.__usageControlsUser;}
});
