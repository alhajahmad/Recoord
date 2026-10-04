import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('project departure and owner removal clean scoped memberships and assignments',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__teamMembershipEnv={DB,AI_BASE_URL:'https://model.test/v1',AI_MODEL:'test',AI_API_KEY:'secret'};const dir=await mkdtemp(join(tmpdir(),'recoord-keys-'));
 const originalFetch=globalThis.fetch;let fetches=0;globalThis.fetch=async()=>{fetches++;throw new Error("Unexpected external call")};
 try{
  const routes={};for(const [name,path] of ['team'].map(name=>[name,'app/api/'+name+'/route.ts'])){const outfile=join(dir,name.replaceAll('/','-')+'.mjs');await build({entryPoints:[resolve(path)],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__teamMembershipEnv':'export async function getChatGPTUser(){return globalThis.__teamMembershipUser}',loader:'js'}));}}]});routes[name]=await import(pathToFileURL(outfile));}
  async function req(user,data,origin='https://recoord.test'){globalThis.__teamMembershipUser=user?{userId:user,email:user+'@example.test',displayName:user}:null;const response=await routes.team.POST(new Request('https://recoord.test/api/team',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(data)}));return {status:response.status,data:await response.json()};}
  for(const id of ['owner','viewer','editor','outsider'])sql.prepare('INSERT INTO profiles VALUES (?,?,?)').run(id,id+'@example.test',id);
  for(const p of ['p','other']){sql.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(p,'owner',p,'Goal','Context',1);sql.prepare('INSERT INTO project_groups VALUES (?,?,?,?,?,?,?)').run('group-'+p,p,'Team','team','',1,1);for(const role of ['viewer','editor']){sql.prepare('INSERT INTO members VALUES (?,?,?,?)').run(p+'-'+role,p,role,role);sql.prepare('INSERT INTO group_members VALUES (?,?)').run('group-'+p,role);sql.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?)').run(p+'-task-'+role,p,'Task',role,null,'todo',1,1)}}
  const snapshot=()=>JSON.stringify(['members','group_members','tasks'].map(t=>sql.prepare('SELECT * FROM '+t).all()));const initial=snapshot();
  const leave={action:'leave',project:'p'};assert.equal((await req(null,leave)).status,401);assert.equal((await req('viewer',leave,'https://evil.test')).status,403);assert.equal((await req('outsider',leave)).status,404);assert.equal((await req('owner',leave)).status,400);
  assert.equal((await req('editor',{action:'remove',project:'p',user:'viewer'})).status,403);assert.equal((await req('viewer',{action:'remove',project:'p',user:'editor'})).status,403);assert.equal(snapshot(),initial);
  assert.equal((await req('viewer',{...leave,user:'editor'})).status,200);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM members WHERE project='p' AND user='viewer'").get().n,0);assert.equal(sql.prepare("SELECT COUNT(*) n FROM group_members WHERE group_id='group-p' AND user='viewer'").get().n,0);assert.equal(sql.prepare("SELECT assignee FROM tasks WHERE id='p-task-viewer'").get().assignee,null);assert.equal(sql.prepare("SELECT version FROM tasks WHERE id='p-task-viewer'").get().version,2);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM members WHERE project='p' AND user='editor'").get().n,1);assert.equal(sql.prepare("SELECT assignee FROM tasks WHERE id='p-task-editor'").get().assignee,'editor');assert.equal((await req('viewer',leave)).status,404);
  assert.equal((await req('owner',{action:'remove',project:'p',user:'editor'})).status,200);assert.equal(sql.prepare("SELECT COUNT(*) n FROM members WHERE project='p'").get().n,0);assert.equal(sql.prepare("SELECT COUNT(*) n FROM group_members WHERE group_id='group-p'").get().n,0);assert.equal(sql.prepare("SELECT assignee FROM tasks WHERE id='p-task-editor'").get().assignee,null);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM members WHERE project='other'").get().n,2);assert.equal(sql.prepare("SELECT COUNT(*) n FROM group_members WHERE group_id='group-other'").get().n,2);assert(sql.prepare("SELECT assignee,version FROM tasks WHERE project='other'").all().every(t=>t.assignee&&t.version===1));assert.equal(sql.prepare("SELECT COUNT(*) n FROM project_groups").get().n,2);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM activities WHERE project='p'").get().n,2);assert.equal(sql.prepare("SELECT owner FROM projects WHERE id='p'").get().owner,'owner');
 }finally{globalThis.fetch=originalFetch;sql.close();await rm(dir,{recursive:true,force:true});delete globalThis.__teamMembershipEnv;delete globalThis.__teamMembershipUser;}
});
