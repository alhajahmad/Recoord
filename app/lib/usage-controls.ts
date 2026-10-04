import {db,HttpError} from '../api/shared';
export async function usagePreferences(owner:string){
 const row=await db().prepare('SELECT monthly_limit,alert_at,alerts_enabled FROM usage_preferences WHERE owner=?').bind(owner).first();
 const now=new Date(),month=now.toISOString().slice(0,7),resetsAt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
 const monthlyLimit=Number(row?.monthly_limit??1000),requests=Number((await db().prepare('SELECT count FROM quotas WHERE key=?').bind('month:'+owner+':'+month).first())?.count??0);
 return {monthlyLimit,alertAt:Number(row?.alert_at??80),alertsEnabled:row?Boolean(row.alerts_enabled):true,month,requests,remaining:Math.max(0,monthlyLimit-requests),resetsAt};
}
export async function reserveMonthlyRequest(owner:string){
 const preferences=await usagePreferences(owner);
 const reserved=await db().prepare('INSERT INTO quotas (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind('month:'+owner+':'+preferences.month,preferences.monthlyLimit).first();
 if(!reserved)throw new HttpError(429,'Your monthly AI request limit has been reached. Adjust it in Administration → Limits or wait until next month.');
}
