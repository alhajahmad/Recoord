import {identity,db,failure,body,text,HttpError} from '../shared';

const pair=(a:string,b:string)=>JSON.stringify([a,b].sort());
const json=(value:unknown)=>Response.json(value,{headers:{'Cache-Control':'private, no-store'}});
const blockGuard='NOT EXISTS (SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?))';
async function personFor(user:string,target:string){
 if(target===user)throw new HttpError(400,'Choose another person.');
 const person=await db().prepare("SELECT p.id,p.name,CASE WHEN d.visibility='members' THEN d.username ELSE NULL END AS username,CASE WHEN d.visibility='members' THEN d.photo ELSE NULL END AS photo FROM profiles p LEFT JOIN profile_details d ON d.id=p.id WHERE p.id=? AND "+blockGuard).bind(target,user,target,target,user).first();
 if(!person)throw new HttpError(404,'Conversation not available.');
 return person;
}
async function connected(user:string,target:string){return !!await db().prepare("SELECT id FROM connections WHERE id=? AND status='accepted'").bind(pair(user,target)).first()}

export async function GET(request:Request){try{
 const user=await identity(request),query=new URL(request.url).searchParams,target=query.get('user');
 if(!target){
  const conversations=(await db().prepare(`WITH ranked AS (
   SELECT m.*,CASE WHEN sender=? THEN recipient ELSE sender END AS peer,
    ROW_NUMBER() OVER (PARTITION BY CASE WHEN sender=? THEN recipient ELSE sender END ORDER BY created DESC,id DESC) AS position
   FROM direct_messages m WHERE sender=? OR recipient=?
  ) SELECT p.id AS user,p.name,CASE WHEN d.visibility='members' THEN d.photo ELSE NULL END AS photo,
   CASE WHEN d.visibility='members' THEN d.username ELSE NULL END AS username,r.content AS lastMessage,r.created AS updated
   FROM ranked r JOIN profiles p ON p.id=r.peer LEFT JOIN profile_details d ON d.id=p.id
   WHERE r.position=1 AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.owner=? AND b.target=p.id) OR (b.target=? AND b.owner=p.id))
   ORDER BY r.created DESC,r.id DESC LIMIT 200`).bind(user,user,user,user,user,user).all()).results;
  return json({conversations});
 }
 text(target,200,true);
 const person=await personFor(user,target),canSend=await connected(user,target);
 const history=await db().prepare('SELECT id FROM direct_messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?) LIMIT 1').bind(user,target,target,user).first();
 if(!canSend&&!history)throw new HttpError(404,'Conversation not available.');
 const beforeRaw=query.get('before'),before=beforeRaw===null?null:Number(beforeRaw),beforeId=query.get('beforeId');
 if(before!==null&&(!Number.isSafeInteger(before)||before<0)||beforeId!==null&&(before===null||beforeId.length>100))throw new HttpError(400,'Invalid history cursor.');
 const cursor=before===null?'':beforeId!==null?' AND (created<? OR (created=? AND id<?))':' AND created<?';
 const bindings:Array<string|number>=[user,target,target,user];if(before!==null){bindings.push(before);if(beforeId!==null)bindings.push(before,beforeId)}
 const rows=(await db().prepare('SELECT id,sender,recipient,content,created FROM direct_messages WHERE ((sender=? AND recipient=?) OR (sender=? AND recipient=?))'+cursor+' ORDER BY created DESC,id DESC LIMIT 101').bind(...bindings).all()).results;
 const hasMore=rows.length>100,messages=rows.slice(0,100).reverse(),oldest=messages[0];
 return json({person,messages,canSend,hasMore,nextBefore:hasMore?oldest.created:null,nextBeforeId:hasMore?oldest.id:null});
 }catch(error){return failure(error)}}

export async function POST(request:Request){try{
 const sender=await identity(request),data=await body(request),recipient=text(data.user,200,true),content=text(data.content,4000,true).trim(),id=text(data.id,100,true);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new HttpError(400,'Invalid message identifier.');
 await personFor(sender,recipient);
 if(!await connected(sender,recipient))throw new HttpError(403,'Connect with this person before sending a message.');
 const existing=await db().prepare('SELECT id,sender,recipient,content,created FROM direct_messages WHERE id=?').bind(id).first();
 if(existing){if(existing.sender!==sender||existing.recipient!==recipient||existing.content!==content)throw new HttpError(409,'This message identifier is already in use.');return json({message:existing})}
 const key='direct:'+sender+':'+Math.floor(Date.now()/60000);
 if(!await db().prepare('INSERT INTO quotas (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<100 RETURNING count').bind(key).first())throw new HttpError(429,'You are sending messages too quickly. Try again in a minute.');
 const saved=await db().prepare("INSERT INTO direct_messages (id,sender,recipient,content,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM connections WHERE id=? AND status='accepted') AND "+blockGuard+' ON CONFLICT(id) DO NOTHING RETURNING id,sender,recipient,content,created').bind(id,sender,recipient,content,Date.now(),pair(sender,recipient),sender,recipient,recipient,sender).first();
 if(saved)return json({message:saved});
 // An identical retry can race with the original; do not duplicate it or report false success after access changes.
 const retry=await db().prepare('SELECT id,sender,recipient,content,created FROM direct_messages WHERE id=? AND sender=? AND recipient=? AND '+blockGuard+" AND EXISTS (SELECT 1 FROM connections WHERE id=? AND status='accepted')").bind(id,sender,recipient,sender,recipient,recipient,sender,pair(sender,recipient)).first();
 if(retry&&retry.content===content)return json({message:retry});
 throw new HttpError(409,'The conversation changed. Refresh before trying again.');
 }catch(error){return failure(error)}}
