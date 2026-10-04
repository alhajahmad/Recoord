import {identity,db,failure,accessProject,HttpError} from '../shared';
import {metricSources} from '../../lib/request-metrics';
export async function GET(r:Request){try{
 const owner=await identity(r),params=new URL(r.url).searchParams,daysText=params.get('days')??'30',source=params.get('source')??'all',project=params.get('project')??'all',key=params.get('key')??'all';
 if(!['7','30','90'].includes(daysText)||source!=='all'&&!metricSources.includes(source as typeof metricSources[number])||!project.length||project.length>150||!key.length||key.length>150)throw new HttpError(400,'Choose valid usage filters.');
 if(project!=='all')await accessProject(project,owner);
 if(key!=='all'&&!await db().prepare('SELECT id FROM developer_keys WHERE id=? AND owner=?').bind(key,owner).first())throw new HttpError(404,'Key not found.');
 const days=Number(daysText),dayMs=86400000,today=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z'),start=today-(days-1)*dayMs;
 const filter='owner=? AND (?=\'all\' OR source=?) AND (?=\'all\' OR project=?) AND (?=\'all\' OR key_id=?)',args=[owner,source,source,project,project,key,key];
 const aggregate='COUNT(*) AS requests,SUM(CASE WHEN status>=200 AND status<400 THEN 1 ELSE 0 END) AS successes,SUM(CASE WHEN status>=400 THEN 1 ELSE 0 END) AS errors';
 const [dailyRows,totalRows,sourceRows,failures,sinceRows]=await db().batch([
 db().prepare(`SELECT strftime('%Y-%m-%d',created/1000,'unixepoch') AS day,${aggregate} FROM request_metrics WHERE ${filter} AND created>=? GROUP BY day ORDER BY day`).bind(...args,start),
 db().prepare(`SELECT ${aggregate},AVG(duration) AS averageDurationMs FROM request_metrics WHERE ${filter} AND created>=?`).bind(...args,start),
 db().prepare(`SELECT source,${aggregate} FROM request_metrics WHERE ${filter} AND created>=? GROUP BY source ORDER BY source`).bind(...args,start),
 db().prepare(`SELECT source,status,created FROM request_metrics WHERE ${filter} AND created>=? AND status>=400 ORDER BY created DESC,id DESC LIMIT 20`).bind(...args,start),
 db().prepare(`SELECT MIN(created) AS since FROM request_metrics WHERE ${filter}`).bind(...args),
 ]);
 const rows=dailyRows.results as {day:string;requests:number;successes:number;errors:number}[],totals=totalRows.results[0] as {requests:number;successes:number|null;errors:number|null;averageDurationMs:number|null};
 const daily=Array.from({length:days},(_,i)=>{const day=new Date(start+i*dayMs).toISOString().slice(0,10);return rows.find(row=>row.day===day)??{day,requests:0,successes:0,errors:0};});
 return Response.json({days,daily,totals:{requests:totals.requests,successes:totals.successes??0,errors:totals.errors??0,averageDurationMs:totals.averageDurationMs==null?null:Math.round(totals.averageDurationMs)},sources:sourceRows.results,recentFailures:failures.results,since:(sinceRows.results[0] as {since:number|null}).since},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){const response=failure(error);response.headers.set('Cache-Control','private, no-store');return response}}
