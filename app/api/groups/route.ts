import {identity,db,failure,body,text,accessProject,HttpError} from '../shared';
const headers={'Cache-Control':'private, no-store'};
async function list(project:string,role:string){
 const [groups,members]=await db().batch([
  db().prepare('SELECT id,name,description FROM project_groups WHERE project=? ORDER BY normalized_name,id').bind(project),
  db().prepare('SELECT m.group_id,m.user FROM group_members m JOIN project_groups g ON g.id=m.group_id JOIN projects p ON p.id=g.project WHERE g.project=? AND (m.user=p.owner OR EXISTS (SELECT 1 FROM members pm WHERE pm.project=p.id AND pm.user=m.user)) ORDER BY m.user').bind(project),
 ]);
 const groupRows=groups.results as {id:string;name:string;description:string}[],memberRows=members.results as {group_id:string;user:string}[];
 return {groups:groupRows.map(group=>({...group,memberIds:memberRows.filter(member=>member.group_id===group.id).map(member=>member.user)})),role};
}
function fail(error:unknown){if(error instanceof Error&&/UNIQUE constraint failed: project_groups\.(project|normalized_name)/.test(error.message))error=new HttpError(409,'A group with this name already exists in this project.');const response=failure(error);response.headers.set('Cache-Control','private, no-store');return response;}
async function input(data:Record<string,unknown>,project:string){
 const name=text(data.name,80,true).trim(),description=data.description===undefined?'':text(data.description,300).trim();
 if(!Array.isArray(data.memberIds)||data.memberIds.length>100)throw new HttpError(400,'Choose up to 100 current project members.');
 const memberIds=[...new Set(data.memberIds.map(id=>text(id,150,true)))];
 const allowed=(await db().prepare('SELECT owner AS user FROM projects WHERE id=? UNION SELECT user FROM members WHERE project=?').bind(project,project).all()).results.map(row=>row.user);
 if(memberIds.some(id=>!allowed.includes(id)))throw new HttpError(400,'Choose only current project members.');
 return {name,description,memberIds,normalized:name.normalize('NFKC').toLowerCase()};
}
// Membership is organizational only: access continues to come from the project's roles.
function insertMembers(id:string,project:string,members:string[]){return db().prepare('INSERT INTO group_members (group_id,user) SELECT ?,j.value FROM json_each(?) j JOIN profiles pr ON pr.id=j.value WHERE EXISTS (SELECT 1 FROM project_groups g JOIN projects p ON p.id=g.project WHERE g.id=? AND p.id=? AND (p.owner=j.value OR EXISTS (SELECT 1 FROM members m WHERE m.project=p.id AND m.user=j.value)))').bind(id,JSON.stringify(members),id,project);}
export async function GET(r:Request){try{const user=await identity(r),project=text(new URL(r.url).searchParams.get('project'),100,true),p=await accessProject(project,user);return Response.json(await list(project,String(p.role)),{headers});}catch(error){return fail(error);}}
export async function POST(r:Request){try{const user=await identity(r),data=await body(r),project=text(data.project,100,true);await accessProject(project,user,'owner');const {name,description,memberIds,normalized}=await input(data,project),id=crypto.randomUUID(),now=Date.now();
 const saved=await db().batch([db().prepare('INSERT INTO project_groups (id,project,name,normalized_name,description,created,updated) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM project_groups WHERE project=?)<50 RETURNING id').bind(id,project,name,normalized,description,now,now,project),insertMembers(id,project,memberIds)]);
 if(!saved[0].results.length)throw new HttpError(429,'This project can have up to 50 groups.');return Response.json(await list(project,'owner'),{status:201,headers});}catch(error){return fail(error);}}
export async function PATCH(r:Request){try{const user=await identity(r),data=await body(r),project=text(data.project,100,true),id=text(data.id,100,true);await accessProject(project,user,'owner');if(!await db().prepare('SELECT id FROM project_groups WHERE id=? AND project=?').bind(id,project).first())throw new HttpError(404,'Group not found.');const {name,description,memberIds,normalized}=await input(data,project);
 const saved=await db().batch([db().prepare('UPDATE project_groups SET name=?,normalized_name=?,description=?,updated=? WHERE id=? AND project=? RETURNING id').bind(name,normalized,description,Date.now(),id,project),db().prepare('DELETE FROM group_members WHERE group_id IN (SELECT id FROM project_groups WHERE id=? AND project=?)').bind(id,project),insertMembers(id,project,memberIds)]);
 if(!saved[0].results.length)throw new HttpError(404,'Group not found.');return Response.json(await list(project,'owner'),{headers});}catch(error){return fail(error);}}
export async function DELETE(r:Request){try{const user=await identity(r),data=await body(r),project=text(data.project,100,true),id=text(data.id,100,true);await accessProject(project,user,'owner');const removed=await db().prepare('DELETE FROM project_groups WHERE id=? AND project=? RETURNING id').bind(id,project).first();if(!removed)throw new HttpError(404,'Group not found.');return Response.json(await list(project,'owner'),{headers});}catch(error){return fail(error);}}
