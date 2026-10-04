import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('public work and comments enforce audience, owner authority, blocks, private replies and safe project snapshots',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__sharingEnv={DB};const dir=await mkdtemp(join(tmpdir(),'recoord-sharing-')),routes={};
 try{
  for(const name of ['posts','social-comments']){const outfile=join(dir,name+'.mjs');await build({entryPoints:[resolve('app/api/'+name+'/route.ts')],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__sharingEnv':'export async function getChatGPTUser(){return globalThis.__sharingUser}',loader:'js'}));}}]});routes[name]=await import(pathToFileURL(outfile));}
  async function req(user,route='posts',method='GET',data,query='',origin='https://recoord.test'){globalThis.__sharingUser=user?{userId:user,email:user+'@example.com',displayName:user}:null;const response=await routes[route][method](new Request('https://recoord.test/api/'+route+query,{method,headers:{origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}));return {status:response.status,data:await response.json()};}
  for(const user of ['alice','bob','carol','private']){sql.prepare('INSERT INTO profiles (id,email,name) VALUES (?,?,?)').run(user,user+'@example.com',user);sql.prepare('INSERT INTO profile_details (id,username,visibility,bio,photo) VALUES (?,?,?,?,?)').run(user,user,user==='private'?'private':'members','SECRET_BIO','data:image/jpeg;base64,/9j/AA==');}
  const publish=(u,d)=>req(u,'posts','POST',d),comment=(u,d)=>req(u,'social-comments','POST',d);
  assert.equal((await publish(null,{content:'Anonymous'})).status,401);
  assert.equal((await req('alice','posts','POST',{content:'Cross site'},'','https://evil.test')).status,403);
  assert.equal((await publish('private',{content:'Hidden profile'})).status,400);
  assert.equal((await publish('alice',{content:'',image:'data:image/svg+xml,<svg/>'})).status,400);
  assert.equal((await publish('alice',{content:'Bad link',video:'javascript:alert(1)'})).status,400);
  assert.equal((await publish('alice',{content:'Bad auth URL',workLink:'https://alice:secret@example.com'})).status,400);
  assert.equal((await publish('alice',{content:'x'.repeat(4001)})).status,400);
  assert.equal((await publish('alice',{})).status,400);
  sql.prepare('INSERT INTO projects (id,owner,title,goal,context,updated) VALUES (?,?,?,?,?,?)').run('project','alice','Public project title','SECRET_GOAL','SECRET_INSTRUCTIONS',1);
  assert.equal((await publish('bob',{content:'Steal project',project:'project'})).status,404);
  const id=crypto.randomUUID(),created=await publish('alice',{id,content:'Launch day',project:'project',workLink:'https://example.com/work'});assert.equal(created.status,200);assert.equal(created.data.post.projectTitle,'Public project title');
  assert.equal((await publish('alice',{id,content:'Launch day',project:'project',workLink:'https://example.com/work'})).status,200);assert.equal(sql.prepare('SELECT count(*) n FROM posts').get().n,1);
  assert.equal((await publish('alice',{id,content:'Changed payload'})).status,409);assert.equal((await publish('bob',{id,content:'Hijack'})).status,409);
  const anon=await req(null);assert.equal(anon.data.posts.length,1);assert.equal(anon.data.posts[0].canDelete,false);assert.equal(anon.data.posts[0].name,'alice');assert(!JSON.stringify(anon.data).includes('SECRET'));assert(!JSON.stringify(anon.data).includes('@example.com'));
  const limited=(await publish('alice',{content:'Connections only',audience:'connections'})).data.post;
  assert.equal((await req(null)).data.posts.length,1);assert.equal((await req('bob')).data.posts.length,1);assert.equal((await req('alice')).data.posts.length,2);
  sql.prepare('INSERT INTO connections (id,sender,recipient,status,created,updated) VALUES (?,?,?,?,?,?)').run('ab','alice','bob','accepted',1,1);
  assert.equal((await req('bob')).data.posts.length,2);assert.equal((await req('carol')).data.posts.length,1);
  assert.equal((await req(null,'posts','GET',null,'?id='+limited.id)).status,404);
  assert.equal((await comment('carol',{targetType:'post',target:limited.id,content:'Outside'})).status,404);
  const base={targetType:'post',target:id},publicReply=await comment('bob',{...base,content:'Great work',audience:'public'});assert.equal(publicReply.status,200);
  const privateId=crypto.randomUUID();assert.equal((await comment('bob',{...base,id:privateId,content:'SECRET_REPLY',audience:'private'})).status,200);
  assert.equal((await comment('bob',{...base,id:privateId,content:'SECRET_REPLY',audience:'private'})).status,200);assert.equal(sql.prepare('SELECT count(*) n FROM social_comments').get().n,2);
  assert.equal((await comment('bob',{...base,id:privateId,content:'Different',audience:'private'})).status,409);
  const readComments=(u,target=id,type='post')=>req(u,'social-comments','GET',null,'?targetType='+type+'&target='+target);
  for(const user of [null,'carol']){const r=await readComments(user);assert.equal(r.data.comments.length,1);assert(!JSON.stringify(r.data).includes('SECRET_REPLY'));}
  assert.equal((await readComments('alice')).data.comments.length,2);assert.equal((await readComments('bob')).data.comments.length,2);
  assert.equal((await req('carol','social-comments','DELETE',{id:privateId})).status,403);
  assert.equal((await comment('bob',{targetType:'profile',target:'alice',content:'PROFILE_PRIVATE',audience:'private'})).status,200);
  assert.equal((await readComments(null,'alice','profile')).status,401);assert.equal((await readComments('carol','alice','profile')).data.comments.length,0);assert.equal((await readComments('alice','alice','profile')).data.comments.length,1);
  assert.equal((await comment('bob',{targetType:'profile',target:'private',content:'Unavailable'})).status,404);
  assert.equal((await comment('private',{...base,content:'Private profile public comment',audience:'public'})).status,400);
  assert.equal((await comment('private',{...base,content:'Private profile private comment',audience:'private'})).status,200);
  const privatePerson=(await readComments('alice')).data.comments.find(c=>c.author==='private');assert.equal(privatePerson.photo,'');assert.equal(privatePerson.username,null);
  sql.prepare('INSERT INTO blocks (id,owner,target,created) VALUES (?,?,?,?)').run('block','alice','bob',1);
  assert.equal((await req('bob')).data.posts.length,0);assert.equal((await readComments('bob')).status,404);assert.equal((await comment('bob',{...base,content:'Blocked'})).status,404);
  assert.equal((await readComments('alice')).data.comments.some(c=>c.author==='bob'),false);
  assert.equal((await readComments('carol')).data.comments.some(c=>c.author==='bob'),true); // Blocking does not alter an unrelated viewer's public feed.
  assert.equal((await req('bob','social-comments','DELETE',{id:privateId})).status,200); // Authors can retract even after blocking.
  sql.prepare('DELETE FROM blocks').run();
  const removable=(await readComments('alice')).data.comments.find(c=>c.author==='bob');assert.equal((await req('alice','social-comments','DELETE',{id:removable.id})).status,200);
  sql.prepare("UPDATE profile_details SET visibility='private' WHERE id='alice'").run();assert.equal((await req(null)).data.posts.length,0);assert.equal((await req('bob')).data.posts.length,0);assert.equal((await req('alice')).data.posts.length,2);
  sql.prepare("UPDATE profile_details SET visibility='members' WHERE id='alice'").run();
  const quota='sharing:alice:'+new Date().toISOString().slice(0,10);sql.prepare('UPDATE quotas SET count=100 WHERE key=?').run(quota);assert.equal((await publish('alice',{content:'Over quota'})).status,429);
  assert.equal((await req('bob','posts','DELETE',{id})).status,404);assert.equal((await req('alice','posts','DELETE',{id})).status,200);assert.equal(sql.prepare("SELECT count(*) n FROM social_comments WHERE target_type='post' AND target=?").get(id).n,0);
  assert.equal((await readComments('alice')).status,404);
 }finally{sql.close();await rm(dir,{recursive:true,force:true});}
});
