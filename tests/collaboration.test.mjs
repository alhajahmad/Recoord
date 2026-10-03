import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('shared projects enforce invitations, roles, private chats, conflicts, revocation, and deletion',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={
  prepare(query){return {bind(...args){const statement=sql.prepare(query);return {
   async first(){return statement.get(...args)||null},
   async all(){return {results:statement.all(...args)}},
   async run(){return statement.run(...args)}
  }}}},
  async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}
 };
 globalThis.__testEnv={DB};
 const dir=await mkdtemp(join(tmpdir(),'recoord-tests-'));let routes={};
 try{
 for(const name of ['workspace','team','export','data','messages','summary']){
  const output=join(dir,name+'.mjs');await build({entryPoints:[resolve('app/api/'+name+'/route.ts')],outfile:output,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__testEnv':'export async function getChatGPTUser(){return globalThis.__testUser}',loader:'js'}))}}]});routes[name]=await import(pathToFileURL(output))}
 const users={owner:{userId:'owner',email:'owner@example.com',displayName:'Owner'},editor:{userId:'editor',email:'editor@example.com',displayName:'Editor'},viewer:{userId:'viewer',email:'viewer@example.com',displayName:'Viewer'},stranger:{userId:'stranger',email:'stranger@example.com',displayName:'Stranger'}};
 async function req(who,route,method='GET',data,query=''){globalThis.__testUser=users[who]||null;const response=await routes[route][method](new Request('https://recoord.test/api/'+route+query,{method,headers:{origin:'https://recoord.test','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}));return {status:response.status,data:await response.json()}}
 assert.equal((await req(null,'workspace')).status,401);
 assert.equal((await req('owner','workspace','POST',{kind:'project',id:'p',title:'Shared launch',goal:'Launch',context:''})).status,200);
 const inv=await req('owner','team','POST',{action:'invite',project:'p',email:'editor@example.com',role:'editor'});assert.equal(inv.status,200);
 assert.equal((await req('stranger','team','POST',{action:'accept',id:inv.data.id})).status,404);
 assert.equal((await req('editor','team')).data.invitations.length,1);
 assert.equal((await req('editor','team','POST',{action:'accept',id:inv.data.id})).status,200);
 assert.equal((await req('editor','workspace')).data.projects[0].role,'editor');
 const vi=await req('owner','team','POST',{action:'invite',project:'p',email:'viewer@example.com',role:'viewer'});await req('viewer','team','POST',{action:'accept',id:vi.data.id});
 assert.equal((await req('viewer','team','POST',{action:'task',project:'p',title:'Unauthorized'})).status,403);
 assert.equal((await req('editor','team','POST',{action:'invite',project:'p',email:'x@example.com',role:'editor'})).status,403);
 assert.equal((await req('editor','workspace','DELETE',{kind:'project',id:'p'})).status,403);
 assert.equal((await req('editor','team','POST',{action:'task',project:'p',title:'Write homepage',assignee:'editor',due:'2026-11-01'})).status,200);
 let board=(await req('viewer','team','GET',null,'?project=p')).data;assert.equal(board.tasks.length,1);const task=board.tasks[0];
 assert.equal((await req('editor','team','POST',{action:'task',project:'p',...task,status:'done'})).status,200);
 assert.equal((await req('editor','team','POST',{action:'task',project:'p',...task,status:'doing'})).status,409);
 assert.equal((await req('editor','workspace','POST',{kind:'document',id:'doc',project:'p',title:'Homepage',content:'Shared text'})).status,200);
 assert.equal((await req('viewer','workspace','PATCH',{kind:'document',id:'doc',version:1,title:'bad',content:'bad'})).status,403);
 assert.equal((await req('owner','workspace','PATCH',{kind:'document',id:'doc',version:1,title:'Homepage',content:'Reviewed text'})).status,200);
 assert.equal((await req('editor','workspace','PATCH',{kind:'document',id:'doc',version:1,title:'Homepage',content:'stale'})).status,409);
 assert.equal((await req('editor','team','POST',{action:'comment',project:'p',document:'doc',content:'Please review',mentions:['owner']})).status,200);
 assert.equal((await req('editor','team','POST',{action:'comment',project:'p',content:'bad mention',mentions:['stranger']})).status,404);
 assert.equal((await req('owner','team','POST',{action:'decision',project:'p',content:'Launch on Friday'})).status,200);
 sql.prepare('INSERT INTO conversations VALUES (?,?,?,?,?)').run('private','owner','p','Private conversation',1);sql.prepare('INSERT INTO messages VALUES (?,?,?,?,?)').run('msg','private','user','PRIVATE TEXT',1);
 assert.equal((await req('editor','messages','GET',null,'?id=private')).data.length,0);
 const exp=await req('viewer','export','GET',null,'?project=p');assert.equal(exp.data.documents[0].content,'Reviewed text');assert.equal(exp.data.comments.length,1);assert(!JSON.stringify(exp.data).includes('PRIVATE TEXT'));
 const originalFetch=globalThis.fetch;
 globalThis.__testEnv.AI_API_KEY='test-only';globalThis.__testEnv.AI_BASE_URL='https://model.example/v1';globalThis.__testEnv.AI_MODEL='test-model';
 globalThis.fetch=async(_url,options)=>{const payload=JSON.parse(options.body);assert(!JSON.stringify(payload).includes('PRIVATE TEXT'));return Response.json({choices:[{message:{content:JSON.stringify({summary:'One task is complete. Launch is planned for Friday.',suggestions:['Review mobile layout']})}}]})};
 try{assert.equal((await req('viewer','summary','POST',{project:'p'})).status,403);const summary=await req('editor','summary','POST',{project:'p'});assert.equal(summary.status,200);assert.deepEqual(summary.data.suggestions,['Review mobile layout']);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM tasks').get().n,1)}finally{globalThis.fetch=originalFetch}
 assert.equal((await req('stranger','export','GET',null,'?project=p')).status,404);
 assert.equal((await req('stranger','workspace','GET',null,'?project=p')).status,404);
 await req('owner','team','POST',{action:'remove',project:'p',user:'editor'});
 assert.equal((await req('editor','team','GET',null,'?project=p')).status,404);
 assert.equal((await req('editor','workspace','PATCH',{kind:'document',id:'doc',version:2,title:'bad',content:'bad'})).status,404);
 assert.equal((await req('owner','data','DELETE',{confirm:'DELETE MY DATA'})).status,200);
 for(const table of ['projects','tasks','members','documents','comments','decisions','activities','conversations','messages'])assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM '+table).get().count,0,table+' cascaded');
 }finally{sql.close();await rm(dir,{recursive:true,force:true})}
});
