import {assertInviteDomain} from '../../lib/project-policy';
import {identity,db,failure,body,text,HttpError,accessProject,activity} from '../shared';
const fields="p.id,p.name,d.username,d.visibility,d.bio,d.title,d.company,d.location,d.website,d.photo,d.skills,d.looking_for AS lookingFor";
const pair=(a:string,b:string)=>JSON.stringify([a,b].sort());
const blockedSql='SELECT id FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)';
async function blocked(a:string,b:string){return !!await db().prepare(blockedSql).bind(a,b,b,a).first()}
async function relationship(a:string,b:string){if(a===b)return 'self';const row=await db().prepare('SELECT sender,status FROM connections WHERE id=?').bind(pair(a,b)).first();return row?.status==='accepted'?'connected':row?row.sender===a?'outgoing':'incoming':'none'}
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
async function socialQuota(user:string){const key='network:'+user+':'+new Date().toISOString().slice(0,10);const saved=await db().prepare('INSERT INTO quotas (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<50 RETURNING count').bind(key).first();if(!saved)throw new HttpError(429,'You have reached today’s limit of 50 connection requests and project invitations. Try again tomorrow.');}
export async function GET(r:Request){try{
 const u=await identity(r),q=new URL(r.url).searchParams,username=q.get('username');
 if(username){const p=await db().prepare('SELECT '+fields+' FROM profiles p JOIN profile_details d ON p.id=d.id WHERE d.username=?').bind(username.toLowerCase()).first();if(!p||(p.id!==u&&p.visibility!=='members')||await blocked(u,String(p.id)))throw new HttpError(404,'Profile not available.');return json({profile:{...p,relationship:await relationship(u,String(p.id))}})}
 if(q.get('mode')==='network'){
  const rows=(await db().prepare('SELECT c.sender,c.recipient,c.status,c.created,c.updated,'+fields+' FROM connections c JOIN profiles p ON p.id=CASE WHEN c.sender=? THEN c.recipient ELSE c.sender END LEFT JOIN profile_details d ON d.id=p.id WHERE (c.sender=? OR c.recipient=?) AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.owner=? AND b.target=p.id) OR (b.target=? AND b.owner=p.id)) ORDER BY c.updated DESC LIMIT 500').bind(u,u,u,u,u).all()).results;
  const incoming:unknown[]=[],outgoing:unknown[]=[],connections:unknown[]=[];
  for(const row of rows){const rel=row.status==='accepted'?'connected':row.sender===u?'outgoing':'incoming';const person=row.visibility==='members'?{...row,relationship:rel}:{id:row.id,name:row.name,username:null,visibility:'private',relationship:rel};delete (person as Record<string,unknown>).sender;delete (person as Record<string,unknown>).recipient;delete (person as Record<string,unknown>).status;(rel==='connected'?connections:rel==='incoming'?incoming:outgoing).push(person)}
  const blockedPeople=(await db().prepare('SELECT p.id,p.name FROM blocks b JOIN profiles p ON b.target=p.id WHERE b.owner=? ORDER BY b.created DESC LIMIT 500').bind(u).all()).results;
  return json({incoming,outgoing,connections,blocked:blockedPeople});
 }
 const search=(q.get('q')??'').trim().slice(0,100),pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
 const rows=(await db().prepare("SELECT "+fields+" FROM profiles p JOIN profile_details d ON d.id=p.id WHERE d.visibility='members' AND d.username IS NOT NULL AND p.id<>? AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.owner=? AND b.target=p.id) OR (b.target=? AND b.owner=p.id)) AND (?='' OR p.name LIKE ? ESCAPE '\\' OR d.username LIKE ? ESCAPE '\\' OR d.skills LIKE ? ESCAPE '\\' OR d.looking_for LIKE ? ESCAPE '\\') ORDER BY p.name,p.id LIMIT 60").bind(u,u,u,search,pattern,pattern,pattern,pattern).all()).results;
 return json({profiles:await Promise.all(rows.map(async p=>({...p,relationship:await relationship(u,String(p.id))})))});
 }catch(e){return failure(e)}}
export async function POST(r:Request){try{
 const u=await identity(r),d=await body(r),action=text(d.action,30,true),target=text(d.user,200,true);if(target===u)throw new HttpError(400,'Choose another person.');
 if(!['request','accept','decline','cancel','remove','block','unblock','invite'].includes(action))throw new HttpError(400,'Unknown action.');
 const key=pair(u,target);
 if(action==='unblock'){await db().prepare('DELETE FROM blocks WHERE owner=? AND target=?').bind(u,target).run();return json({ok:true})}
 const person=await db().prepare('SELECT p.id,p.email,d.visibility FROM profiles p LEFT JOIN profile_details d ON d.id=p.id WHERE p.id=?').bind(target).first();
 if(!person)throw new HttpError(404,'Person not available.');
 const connection=await db().prepare('SELECT * FROM connections WHERE id=?').bind(key).first();
 if(action==='block'){
  if(person.visibility!=='members'&&!connection)throw new HttpError(404,'Person not available.');
  await db().batch([db().prepare('INSERT INTO blocks (id,owner,target,created) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify([u,target]),u,target,Date.now()),db().prepare('DELETE FROM connections WHERE id=?').bind(key),db().prepare('DELETE FROM invitations WHERE (project IN (SELECT id FROM projects WHERE owner=?) AND email=(SELECT email FROM profiles WHERE id=?)) OR (project IN (SELECT id FROM projects WHERE owner=?) AND email=(SELECT email FROM profiles WHERE id=?))').bind(u,target,target,u)]);return json({ok:true});
 }
 if(await blocked(u,target))throw new HttpError(404,'Person not available.');
 if(action==='request'){
  if(person.visibility!=='members')throw new HttpError(404,'Person not available.');
  if(connection)throw new HttpError(409,'A connection or request already exists.');
  const pending=await db().prepare("SELECT COUNT(*) AS count FROM connections WHERE sender=? AND status='pending'").bind(u).first();if(Number(pending?.count)>=30)throw new HttpError(429,'You have 30 pending connection requests. Cancel an old request before sending another.');await socialQuota(u);
  await db().prepare("INSERT INTO connections (id,sender,recipient,status,created,updated) SELECT ?,?,?,'pending',?,? WHERE NOT EXISTS (SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)) ON CONFLICT(id) DO NOTHING").bind(key,u,target,Date.now(),Date.now(),u,target,target,u).run();
 }else if(action==='invite'){
  if(connection?.status!=='accepted')throw new HttpError(403,'Connect with this person before inviting them to a project.');
  if(person.visibility!=='members')throw new HttpError(404,'Person not available.');
  const project=text(d.project,100,true),role=d.role??'viewer';if(role!=='viewer'&&role!=='editor')throw new HttpError(400,'Choose viewer or editor access.');await accessProject(project,u,'owner');
  if(await db().prepare('SELECT id FROM members WHERE project=? AND user=?').bind(project,target).first())throw new HttpError(409,'This person is already a member.');
  await assertInviteDomain(project,String(person.email));await socialQuota(u);const id=crypto.randomUUID();await db().batch([db().prepare('DELETE FROM invitations WHERE project=? AND email=?').bind(project,person.email),db().prepare('INSERT INTO invitations (id,project,email,role,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND owner=?) AND EXISTS (SELECT 1 FROM connections WHERE id=? AND status=\'accepted\') AND NOT EXISTS (SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?))').bind(id,project,person.email,role,Date.now(),project,u,key,u,target,target,u),activity(project,u,'Created a profile invitation with '+role+' access.')]);return json({ok:true,id});
 }else{
  if(!connection)throw new HttpError(404,'Connection not found.');
  if(action==='accept'||action==='decline'){if(connection.recipient!==u||connection.status!=='pending')throw new HttpError(403,'Only the recipient can respond to this request.');}
  if(action==='cancel'&&(connection.sender!==u||connection.status!=='pending'))throw new HttpError(403,'Only the sender can cancel this request.');
  if(action==='remove'&&connection.status!=='accepted')throw new HttpError(400,'This connection has not been accepted.');
  if(action==='accept')await db().prepare("UPDATE connections SET status='accepted',updated=? WHERE id=? AND recipient=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?))").bind(Date.now(),key,u,u,target,target,u).run();
  else if(action==='remove')await db().prepare("DELETE FROM connections WHERE id=? AND status='accepted'").bind(key).run();
  else await db().prepare("DELETE FROM connections WHERE id=? AND status='pending' AND "+(action==='cancel'?'sender':'recipient')+'=?').bind(key,u).run();
 }
 return json({ok:true,relationship:await relationship(u,target)});
 }catch(e){return failure(e)}}
