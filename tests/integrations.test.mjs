import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {repositoryPath,projectCalendar,boundedText} from '../app/lib/integrations.ts';

test('repository validation rejects alternate hosts, traversal, credentials, and query injection',()=>{
 assert.equal(repositoryPath('https://github.com/alhajahmad/Recoord/'),'alhajahmad/Recoord');
 for(const value of ['https://evil.test/x/y','https://github.com@evil.test/x','x/..','x/y?token=secret','x/y/readme','x/y\r\nHost:evil.test','x/%2e%2e','https://github.com/x/y#branch'])assert.throws(()=>repositoryPath(value));
});
test('calendar escapes hostile text, folds Unicode by octets, and skips invalid or completed deadlines',()=>{
 const title='Plan, review; ship\\now\r\nBEGIN:VEVENT '+ '日本語🙂'.repeat(40);
 const tasks=[{id:'task',title,due:'2028-02-29',status:'todo'},{id:'bad',title:'Invalid',due:'2026-02-30',status:'todo'},{id:'done',title:'Done',due:'2026-01-01',status:'done'}];
 const result=projectCalendar('p',tasks,new Date('2026-01-01T00:00:00Z'));assert.equal(result.count,1);
 assert(result.content.includes('DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301'));
 assert.equal(result.content.match(/\r\nBEGIN:VEVENT\r\n/g).length,1);
 assert(result.content.includes('Plan\\, review\\; ship\\\\now\\nBEGIN:VEVENT'));
 for(const line of result.content.split('\r\n'))assert(Buffer.byteLength(line)<=75);
 assert(result.content.replace(/\r\n /g,'').includes('日本語🙂'.repeat(40)));
 assert.equal(result.content.match(/UID:[^\r]+/)[0],projectCalendar('p',tasks,new Date('2027-01-01')).content.match(/UID:[^\r]+/)[0]);
});
test('README response is bounded even when the server omits content length',async()=>{
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('a'.repeat(20)));controller.close();}}));
 await assert.rejects(boundedText(response,10),/too large/);
});
test('integrations enforce project roles, import from fixed GitHub API, and export without changing project work',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__integrationEnv={DB};const dir=await mkdtemp(join(tmpdir(),'recoord-integrations-'));const originalFetch=globalThis.fetch;
 try{
 const outfile=join(dir,'route.mjs');await build({entryPoints:[resolve('app/api/integrations/route.ts')],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__integrationEnv':'export async function getChatGPTUser(){return globalThis.__integrationUser}',loader:'js'}));}}]});const route=await import(pathToFileURL(outfile));
 sql.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run('p','owner','Launch','','',1);
 sql.prepare('INSERT INTO members VALUES (?,?,?,?)').run('mv','p','viewer','viewer');sql.prepare('INSERT INTO members VALUES (?,?,?,?)').run('me','p','editor','editor');
 sql.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?)').run('t','p','Ship',null,'2026-11-01','todo',1,1);
 async function req(user,method='GET',data,origin='https://recoord.test'){globalThis.__integrationUser=user?{userId:user,email:user+'@example.com',displayName:user}:null;return route[method](new Request('https://recoord.test/api/integrations?project=p',{method,headers:{origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}));}
 const before=()=>['projects','tasks','documents','activities'].map(t=>JSON.stringify(sql.prepare('SELECT * FROM '+t).all()));const snapshot=before();
 assert.equal((await req(null)).status,401);assert.equal((await req('stranger')).status,404);const exported=await req('viewer');assert.equal(exported.status,200);assert.equal(exported.headers.get('Cache-Control'),'private, no-store');assert((await exported.text()).includes('SUMMARY:Ship'));assert.deepEqual(before(),snapshot);
 let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.github.com/repos/owner/repo/readme');assert.equal(options.redirect,'manual');assert(!options.headers.Authorization);return new Response('# Public README');};
 const payload={project:'p',repository:'owner/repo'};assert.equal((await req('viewer','POST',payload)).status,403);assert.equal((await req('stranger','POST',payload)).status,404);assert.equal((await req('owner','POST',payload,'https://evil.test')).status,403);assert.equal((await req('owner','POST',{...payload,repository:'https://evil.test/x/y'})).status,400);assert.equal(calls,0);
 assert.equal((await req('editor','POST',payload)).status,200);assert.equal(calls,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM documents').get().n,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM activities').get().n,1);
 assert(sql.prepare('SELECT content FROM documents').get().content.includes('# Public README'));
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://evil.test/'}});assert.equal((await req('owner','POST',payload)).status,400);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM documents').get().n,1);
 sql.prepare("UPDATE tasks SET status='done'").run();assert.equal((await req('viewer')).status,400);
 }finally{globalThis.fetch=originalFetch;sql.close();await rm(dir,{recursive:true,force:true});}
});
