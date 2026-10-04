import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('administration overview is read-only, user scoped and does not expose provider credentials or global usage',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const queries=[];const DB={prepare(query){queries.push(query);return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){throw new Error('Admin reads cannot write')}}}}}};
 globalThis.__adminEnv={DB,AI_BASE_URL:'https://private-provider.example/v1',AI_API_KEY:'secret-api-credential',AI_MODEL:'test-model',AI_PROVIDER_LABEL:'Test provider',AI_DAILY_REQUEST_LIMIT:'70',AI_DAILY_SITE_REQUEST_LIMIT:'999',AI_MAX_OUTPUT_TOKENS:'3072'};
 const dir=await mkdtemp(join(tmpdir(),'recoord-admin-'));
 try{
  const outfile=join(dir,'route.mjs');await build({entryPoints:[resolve('app/api/admin/route.ts')],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__adminEnv':'export async function getChatGPTUser(){return globalThis.__adminUser}',loader:'js'}));}}]});
  const route=await import(pathToFileURL(outfile));
  async function req(user,query=''){globalThis.__adminUser=user?{userId:user,email:user+'@example.test',displayName:user}:null;const response=await route.GET(new Request('https://recoord.test/api/admin'+query));return {status:response.status,data:await response.json(),headers:response.headers};}
  assert.equal((await req(null)).status,401);assert.equal(queries.length,0);
  for(const name of ['alice','bob','eve'])sql.prepare('INSERT INTO profiles VALUES (?,?,?)').run(name,name+'@example.test',name);
  sql.prepare("INSERT INTO profile_details (id,username,visibility) VALUES ('alice','alice_public','members')").run();
  for(const [id,owner] of [['own','alice'],['shared','bob'],['hidden','eve']]){sql.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(id,owner,id+' title','Private goal','Private context',1);sql.prepare('INSERT INTO activities VALUES (?,?,?,?,?)').run('activity-'+id,id,owner,'Activity '+id,1);}
  sql.prepare("INSERT INTO members VALUES ('member','shared','alice','viewer')").run();
  sql.prepare("INSERT INTO documents VALUES ('doc','alice','own','Doc','Private document body',1,1)").run();
  sql.prepare("INSERT INTO documents VALUES ('secret-doc','eve','hidden','Secret doc','Other private document',1,1)").run();
  sql.prepare("INSERT INTO conversations (id,owner,title,updated) VALUES ('chat','alice','Private AI history',1),('secret-chat','eve','Other AI history',1)").run();
  const day=new Date().toISOString().slice(0,10);for(const [key,count] of [['alice:'+day,3],['eve:'+day,17],['site:'+day,555]])sql.prepare('INSERT INTO quotas VALUES (?,?)').run(key,count);
  const response=await req('alice','?user=eve&project=hidden');assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const data=response.data;assert.equal(data.scope,'personal');assert.equal(data.profile.id,'alice');assert.equal(data.profile.username,'alice_public');assert.equal(data.usage.requests,3);assert.equal(data.usage.dailyLimit,70);assert.equal(data.usage.remaining,67);assert.equal(data.usage.maxOutputTokens,3072);
  assert.deepEqual(data.projects.map(p=>p.id).sort(),['own','shared']);assert.equal(data.projects.find(p=>p.id==='shared').role,'viewer');assert.equal(data.projects.find(p=>p.id==='shared').memberCount,2);assert.deepEqual(data.people.map(p=>p.id).sort(),['alice','alice','bob']);assert(data.people.every(p=>!('email' in p)));
  assert.deepEqual(data.counts,{ownedProjects:1,conversations:1,documents:1,posts:0,sentMessages:0});assert.equal(data.activity.length,2);assert(data.activity.every(a=>a.projectId!=='hidden'));assert.equal(data.health.database,'available');assert.equal(data.health.providerChecked,false);assert.equal(data.provider.configured,true);assert.equal(data.capabilities.apiKeys,true);assert.equal(data.capabilities.adminKeys,false);assert.equal(data.capabilities.auditLogging,false);
  const serialized=JSON.stringify(data);for(const secret of ['secret-api-credential','private-provider.example','555','999','eve@example.test','Private document body','Private AI history','Other AI history','Private context'])assert(!serialized.includes(secret),secret+' leaked');
  assert(queries.every(q=>/^SELECT/.test(q)));assert(!queries.some(q=>q.includes('site:')));
  sql.prepare("DELETE FROM members WHERE user='alice'").run();assert.deepEqual((await req('alice')).data.projects.map(p=>p.id),['own']);assert((await req('alice')).data.people.every(p=>p.id==='alice'));
  delete globalThis.__adminEnv.AI_API_KEY;assert.equal((await req('alice')).data.provider.configured,false);
  const fresh=await req('fresh');assert.equal(fresh.data.profile.id,'fresh');assert.equal(fresh.data.usage.requests,0);assert.equal(sql.prepare("SELECT COUNT(*) n FROM profiles WHERE id='fresh'").get().n,0);
  globalThis.__adminEnv.DB={prepare(){throw new Error('storage unavailable')}};const unavailable=await req('alice');assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('Cache-Control'),'no-store');assert(!JSON.stringify(unavailable.data).includes('storage unavailable'));
 }finally{sql.close();await rm(dir,{recursive:true,force:true});delete globalThis.__adminEnv;delete globalThis.__adminUser;}
});
