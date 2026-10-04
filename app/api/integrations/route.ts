import {requireProjectFeature} from '../../lib/project-policy';
import {identity,db,failure,body,text,accessProject,activity,HttpError} from '../shared';
import {boundedText,repositoryPath,projectCalendar,type CalendarTask} from '../../lib/integrations';
export async function GET(request:Request){try{
 const user=await identity(request),project=text(new URL(request.url).searchParams.get('project'),100,true);await accessProject(project,user,'read');
 const result=await db().prepare('SELECT id,title,due,status FROM tasks WHERE project=? ORDER BY due,id').bind(project).all();
 const calendar=projectCalendar(project,result.results as CalendarTask[]);
 if(!calendar.count)throw new HttpError(400,'There are no open tasks with valid due dates in this project. Add a deadline to a task, then try again.');
 return new Response(calendar.content,{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="recoord-deadlines.ics"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(error){return failure(error)}}
export async function POST(request:Request){try{
 const user=await identity(request),data=await body(request),project=text(data.project,100,true);await accessProject(project,user,'write');await requireProjectFeature(project,'importsEnabled');
 let repository:string;try{repository=repositoryPath(text(data.repository,250,true));}catch(error){throw new HttpError(400,(error as Error).message);}
 let content:string;
 try{
 const response=await fetch('https://api.github.com/repos/'+repository+'/readme',{headers:{Accept:'application/vnd.github.raw+json','User-Agent':'Recoord','X-GitHub-Api-Version':'2026-03-10'},redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(response.status===404)throw new HttpError(404,'No public README was found. Check the repository name and its visibility.');
 if(response.status===403||response.status===429)throw new HttpError(429,'GitHub is limiting imports right now. Please try again later.');
 if(response.status>=300&&response.status<400)throw new HttpError(400,'This repository has moved. Enter its current GitHub address.');
 if(!response.ok)throw new HttpError(502,'GitHub could not provide this README. Please try again later.');
 content=await boundedText(response,80000);
 }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(502,error instanceof Error&&error.message.includes('too large')?error.message:'The README could not be downloaded. Please try again.');}
 if(!content.trim())throw new HttpError(400,'This repository has an empty README.');
 await accessProject(project,user,'write');await requireProjectFeature(project,'importsEnabled');
 const id=crypto.randomUUID(),title=(repository+' · README').slice(0,100),source='https://github.com/'+repository;
 await db().batch([db().prepare('INSERT INTO documents (id,owner,project,title,content,version,updated) VALUES (?,?,?,?,?,1,?)').bind(id,user,project,title,'Imported from '+source+' on '+new Date().toISOString().slice(0,10)+'. This is a one-time copy.\n\n'+content,Date.now()),activity(project,user,'Imported GitHub README: '+repository)]);
 return Response.json({id,project,title},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error)}}
