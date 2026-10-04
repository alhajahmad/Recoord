import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('billing preferences require identity and origin, validate fields and remain account scoped',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+f,'utf8'));
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__billingPreferencesEnv={DB,AI_BASE_URL:'https://model.test/v1',AI_MODEL:'test',AI_API_KEY:'secret'};const dir=await mkdtemp(join(tmpdir(),'recoord-keys-'));
 const originalFetch=globalThis.fetch;let fetches=0;globalThis.fetch=async()=>{fetches++;throw new Error("Unexpected external call")};
 try{
  const routes={};for(const [name,path] of ['billing-preferences'].map(name=>[name,'app/api/'+name+'/route.ts'])){const outfile=join(dir,name.replaceAll('/','-')+'.mjs');await build({entryPoints:[resolve(path)],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='env'?'export const env=globalThis.__billingPreferencesEnv':'export async function getChatGPTUser(){return globalThis.__billingPreferencesUser}',loader:'js'}));}}]});routes[name]=await import(pathToFileURL(outfile));}
  async function req(user,method='GET',data,origin='https://recoord.test'){globalThis.__billingPreferencesUser=user?{userId:user,email:user+'@example.test',displayName:user}:null;const response=await routes['billing-preferences'][method](new Request('https://recoord.test/api/billing-preferences?owner=bob',{method,headers:{origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}));return {status:response.status,data:await response.json(),headers:response.headers};}
  const blank={company:'',email:'',purchaseOrder:''},valid={company:'  Company Ltd  ',email:'BILLING@EXAMPLE.TEST',purchaseOrder:' PO-123 '};
  for(const method of ['GET','PATCH']){const result=await req(null,method,method==='PATCH'?valid:undefined);assert.equal(result.status,401);assert.equal(result.headers.get('Cache-Control'),'no-store')}
  assert.equal((await req('alice','PATCH',valid,'https://evil.test')).status,403);assert.equal((await req('alice','PATCH',valid,'')).status,403);
  assert.deepEqual((await req('alice')).data,blank);
  for(const data of [{...valid,company:42},{...valid,company:'x'.repeat(121)},{...valid,email:'x'.repeat(255)},{...valid,email:'invalid'},{...valid,email:'one@two@three.test'},{...valid,email:'one two@example.test'},{...valid,purchaseOrder:'x'.repeat(81)},{...valid,purchaseOrder:null},{...valid,company:'Company\nBad'},{company:'Missing fields'},{...valid,owner:'bob'},{...valid,cardNumber:'4111111111111111'},{...valid,taxId:'secret'},{...valid,address:'Street'}]){const result=await req('alice','PATCH',data);assert.equal(result.status,400,JSON.stringify(data));assert.equal(result.headers.get('Cache-Control'),'no-store')}
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM billing_preferences').get().n,0);
  const saved=await req('alice','PATCH',valid);assert.equal(saved.status,200);assert.equal(saved.headers.get('Cache-Control'),'no-store');assert.deepEqual(saved.data,{company:'Company Ltd',email:'billing@example.test',purchaseOrder:'PO-123'});assert.deepEqual((await req('alice')).data,saved.data);assert.deepEqual((await req('bob')).data,blank);
  assert.equal((await req('bob','PATCH',{company:'Bob Co',email:'bob-billing@example.test',purchaseOrder:'Bob-PO'})).status,200);assert.deepEqual((await req('alice')).data,saved.data);assert.equal(sql.prepare('SELECT COUNT(*) n FROM billing_preferences').get().n,2);
  assert.equal((await req('alice','PATCH',{company:'x'.repeat(120),email:'',purchaseOrder:'x'.repeat(80)})).status,200);assert.equal((await req('alice','PATCH',blank)).status,200);assert.deepEqual((await req('alice')).data,blank);
  assert.equal(fetches,0);sql.prepare("DELETE FROM profiles WHERE id='alice'").run();assert.equal(sql.prepare("SELECT COUNT(*) n FROM billing_preferences WHERE owner='alice'").get().n,0);assert.equal(sql.prepare("SELECT COUNT(*) n FROM billing_preferences WHERE owner='bob'").get().n,1);
 }finally{globalThis.fetch=originalFetch;sql.close();await rm(dir,{recursive:true,force:true});delete globalThis.__billingPreferencesEnv;delete globalThis.__billingPreferencesUser;}
});
