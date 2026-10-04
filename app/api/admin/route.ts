import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {db,failure,HttpError} from '../shared';

// A personal, read-only overview. Project membership never grants site administration.
export async function GET(_request:Request){try{
 const user=await getChatGPTUser();if(!user)throw new HttpError(401,'Please sign in to continue.');
 const u=user.userId,e=env as unknown as Record<string,string>,now=new Date(),day=now.toISOString().slice(0,10);
 const accessible='SELECT id FROM projects WHERE owner=? OR id IN (SELECT project FROM members WHERE user=?)';
 const database=db();
 const [profile,projects,people,quota,counts,activity]=await Promise.all([
  database.prepare("SELECT p.id,p.name,p.email,d.username,COALESCE(d.visibility,'private') AS visibility FROM profiles p LEFT JOIN profile_details d ON d.id=p.id WHERE p.id=?").bind(u).first(),
  database.prepare(`SELECT p.id,p.title,p.updated,CASE WHEN p.owner=? THEN 'owner' ELSE (SELECT role FROM members WHERE project=p.id AND user=? LIMIT 1) END AS role,(SELECT COUNT(DISTINCT user) FROM members WHERE project=p.id AND user<>p.owner)+1 AS memberCount,(SELECT COUNT(*) FROM tasks WHERE project=p.id) AS taskCount,(SELECT COUNT(*) FROM documents WHERE project=p.id) AS documentCount FROM projects p WHERE p.id IN (${accessible}) ORDER BY p.updated DESC,p.id`).bind(u,u,u,u).all(),
  database.prepare(`SELECT p.owner AS id,COALESCE(pr.name,'Project owner') AS name,p.id AS projectId,p.title AS projectTitle,'owner' AS role FROM projects p LEFT JOIN profiles pr ON pr.id=p.owner WHERE p.id IN (${accessible}) UNION ALL SELECT m.user AS id,COALESCE(pr.name,'Member') AS name,p.id AS projectId,p.title AS projectTitle,m.role FROM members m JOIN projects p ON p.id=m.project LEFT JOIN profiles pr ON pr.id=m.user WHERE p.id IN (${accessible}) AND m.user<>p.owner ORDER BY projectTitle,name`).bind(u,u,u,u).all(),
  database.prepare('SELECT count FROM quotas WHERE key=?').bind(u+':'+day).first<{count:number}>(),
  database.prepare('SELECT (SELECT COUNT(*) FROM projects WHERE owner=?) AS ownedProjects,(SELECT COUNT(*) FROM conversations WHERE owner=?) AS conversations,(SELECT COUNT(*) FROM documents WHERE owner=?) AS documents,(SELECT COUNT(*) FROM posts WHERE author=?) AS posts,(SELECT COUNT(*) FROM direct_messages WHERE sender=?) AS sentMessages').bind(u,u,u,u,u).first(),
  database.prepare(`SELECT a.id,a.project AS projectId,p.title AS projectTitle,COALESCE(pr.name,'Former member') AS actorName,a.content,a.created FROM activities a JOIN projects p ON p.id=a.project LEFT JOIN profiles pr ON pr.id=a.actor WHERE a.project IN (${accessible}) ORDER BY a.created DESC,a.id DESC LIMIT 50`).bind(u,u).all(),
 ]);
 const requests=Number(quota?.count)||0,dailyLimit=Math.max(1,Math.min(Number(e.AI_DAILY_REQUEST_LIMIT)||50,1000));
 const configured=Boolean(e.AI_BASE_URL&&e.AI_MODEL&&e.AI_API_KEY);
 const checkedAt=now.toISOString();
 return Response.json({checkedAt,scope:'personal',profile:profile??{id:u,name:user.displayName,email:user.email,username:null,visibility:'private'},projects:projects.results,people:people.results,
  usage:{day,requests,dailyLimit,remaining:Math.max(0,dailyLimit-requests),resetsAt:new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString(),maxOutputTokens:Math.max(256,Math.min(Number(e.AI_MAX_OUTPUT_TOKENS)||2048,4096)),note:'Reserved AI requests today, including attempts that may fail. Limits reset at midnight UTC. A shared site limit may also apply.'},counts,
  provider:{configured,label:e.AI_PROVIDER_LABEL||'AI provider',model:e.AI_MODEL||null},health:{database:'available',provider:configured?'configured':'not-configured',providerChecked:false},activity:activity.results,
  retention:{automaticDeletion:false,exportAvailable:true,deleteAvailable:true,description:'Saved content stays until deleted. No scheduled retention policy is configured. Account data deletion also removes owned projects and direct conversation history for both participants; contributions to other people’s projects remain with attribution removed. Hosting and model-provider retention are managed separately.'},
  capabilities:{apiKeys:true,adminKeys:false,billing:false,tunnels:false,webhooks:false,auditLogging:false,apiCallLogging:false}
 },{headers:{'Cache-Control':'no-store'}});
 }catch(error){const response=failure(error);response.headers.set('Cache-Control','no-store');return response}}
