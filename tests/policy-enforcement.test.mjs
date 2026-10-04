import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('project policies enforce feature access, activity visibility, invitation domains and scoped search',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__policyEnforcementEnv={DB,AI_BASE_URL:'https://model.test/v1',AI_MODEL:'test',AI_API_KEY:'secret'};const dir=await mkdtemp(join(tmpdir(),'recoord-keys-'));
 const originalFetch=globalThis.fetch;let fetches=0;globalThis.fetch=async()=>{fetches++;throw new Error("Unexpected external call")};
 try{
  const routes={};for(const [name,path] of ['team','admin','network','chat','summary','integrations','project-search','developer-keys','v1/project'].map(name=>[name,'app/api/'+name+'/route.ts'])){const outfile=join(dir,name.replaceAll('/','-')+'.mjs');await build({entryPoints:[resolve(path)],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__policyEnforcementEnv':'export async function getChatGPTUser(){return globalThis.__policyEnforcementUser}',loader:'js'}));}}]});routes[name]=await import(pathToFileURL(outfile));}
  const emails={owner:'owner@example.test',editor:'editor@example.test',viewer:'viewer@example.test',allowed:'allowed@example.test',denied:'denied@sub.example.test'};
  async function req(name,user,method='GET',data,query='',extraHeaders={}){globalThis.__policyEnforcementUser=user?{userId:user,email:emails[user]||user+'@example.test',displayName:user}:null;const response=await routes[name][method](new Request('https://recoord.test/api/'+name+query,{method,headers:{origin:'https://recoord.test','Content-Type':'application/json',...extraHeaders},body:data?JSON.stringify(data):undefined}));return {status:response.status,data:await response.json()};}
  const defaults={usageVisibility:'members',logsVisibility:'members',aiEnabled:true,importsEnabled:true,fileSearchEnabled:true,apiEnabled:true,auditEnabled:false,apiLogMode:'disabled',inviteDomains:[]};
  function policy(patch){sql.prepare('INSERT INTO project_policies VALUES (?,?,?,?,?) ON CONFLICT(project) DO UPDATE SET policy=excluded.policy').run('p',JSON.stringify({...defaults,...patch}),1,'change',1)}
  for(const [id,email] of Object.entries(emails)){sql.prepare('INSERT INTO profiles VALUES (?,?,?)').run(id,email,id);sql.prepare('INSERT INTO profile_details (id,visibility) VALUES (?,?)').run(id,'members')}
  for(const [id,owner] of [['p','owner'],['other','denied']])sql.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(id,owner,id+' title','Goal','PRIVATE CONTEXT',1);
  for(const role of ['editor','viewer'])sql.prepare('INSERT INTO members VALUES (?,?,?,?)').run(role,'p',role,role);
  sql.prepare("INSERT INTO activities VALUES ('activity','p','owner','PRIVATE ACTIVITY',1)").run();
  for(const visibility of ['hidden','owner','members']){policy({logsVisibility:visibility});for(const user of ['owner','editor','viewer']){const visible=visibility==='members'||visibility==='owner'&&user==='owner';const team=await req('team',user,'GET',null,'?project=p');assert.equal(team.status,200);assert.equal(team.data.activities.length,visible?1:0);const admin=await req('admin',user);assert.equal(admin.status,200);assert.equal(admin.data.activity.length,visible?1:0)}}
  policy({aiEnabled:false,importsEnabled:false,fileSearchEnabled:false});
  for(const user of ['owner','editor','viewer']){
   assert.equal((await req('chat',user,'POST',{project:'p',id:'c-'+user,requestId:'r-'+user,content:'Summarize'})).status,403);
   assert.equal((await req('summary',user,'POST',{project:'p'})).status,403);
   assert.equal((await req('integrations',user,'POST',{project:'p',repository:'owner/repo'})).status,403);
   assert.equal((await req('project-search',user,'GET',null,'?project=p&q=needle')).status,403);
  }
  assert.equal(fetches,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM quotas').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM conversations').get().n,0);
  policy({});
  sql.prepare("INSERT INTO documents VALUES ('match','owner','p','Needle document','shared needle content',1,2),('escaped','owner','p','literal 100%_ done','literal percent underscore',1,1),('hidden','denied','other','needle private project','secret',1,3)").run();
  sql.prepare("INSERT INTO conversations (id,owner,project,title,updated) VALUES ('chat','viewer','p','needle private chat',1)").run();
  let search=await req('project-search','viewer','GET',null,'?project=p&q=needle');assert.equal(search.status,200);assert.deepEqual(search.data.results.map(r=>r.id),['match']);assert(!JSON.stringify(search).includes('private chat'));
  search=await req('project-search','viewer','GET',null,'?project=p&q='+encodeURIComponent('%_'));assert.deepEqual(search.data.results.map(r=>r.id),['escaped']);
  assert.equal((await req('project-search','denied','GET',null,'?project=p&q=needle')).status,404);assert.equal((await req('project-search',null,'GET',null,'?project=p&q=needle')).status,401);
  assert.equal((await req('project-search','viewer','GET',null,'?project=p&q=n')).status,400);
  for(let i=0;i<25;i++)sql.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?,?)').run('capped'+i,'owner','p','Capped needle','x'.repeat(500),1,i+10);
  search=await req('project-search','viewer','GET',null,'?project=p&q=needle');assert.equal(search.data.results.length,20);assert(search.data.results.every(r=>r.excerpt.length<=400));
  const key=await req('developer-keys','owner','POST',{project:'p',label:'Policy test'});assert.equal(key.status,201);
  assert.equal((await req('v1/project',null,'GET',null,'',{authorization:'Bearer '+key.data.key})).status,200);policy({apiEnabled:false});assert.equal((await req('v1/project',null,'GET',null,'',{authorization:'Bearer '+key.data.key})).status,403);
  policy({inviteDomains:['example.test']});
  for(const email of ['a@sub.example.test','a@evilexample.test','a@example.test.evil'])assert.equal((await req('team','owner','POST',{action:'invite',project:'p',email,role:'viewer'})).status,403);
  assert.equal((await req('team','editor','POST',{action:'invite',project:'p',email:emails.allowed,role:'viewer'})).status,403);
  const invite=await req('team','owner','POST',{action:'invite',project:'p',email:'Allowed@EXAMPLE.TEST',role:'viewer'});assert.equal(invite.status,200);
  assert.equal((await req('team','allowed','POST',{action:'accept',id:invite.data.id})).status,200);
  sql.prepare('INSERT INTO invitations VALUES (?,?,?,?,?)').run('old','p',emails.denied,'viewer',Date.now());assert.equal((await req('team','denied','POST',{action:'accept',id:'old'})).status,403);assert.equal(sql.prepare("SELECT COUNT(*) n FROM members WHERE user='denied' AND project='p'").get().n,0);
  sql.prepare('INSERT INTO connections VALUES (?,?,?,?,?,?)').run(JSON.stringify(['denied','owner']),'owner','denied','accepted',1,1);
  assert.equal((await req('network','owner','POST',{action:'invite',user:'denied',project:'p',role:'viewer'})).status,403);
  policy({inviteDomains:[]});assert.equal((await req('network','owner','POST',{action:'invite',user:'denied',project:'p',role:'viewer'})).status,200);
 }finally{globalThis.fetch=originalFetch;sql.close();await rm(dir,{recursive:true,force:true});delete globalThis.__policyEnforcementEnv;delete globalThis.__policyEnforcementUser;}
});
