import {identity,db,body,failure,HttpError} from '../shared';
import {usagePreferences} from '../../lib/usage-controls';
function noStore(response:Response){response.headers.set('Cache-Control','no-store');return response;}
export async function GET(r:Request){try{return noStore(Response.json(await usagePreferences(await identity(r))))}catch(e){return noStore(failure(e))}}
export async function PATCH(r:Request){try{
 const owner=await identity(r),d=await body(r);
 if(!Number.isInteger(d.monthlyLimit)||d.monthlyLimit<1||d.monthlyLimit>1000000||!Number.isInteger(d.alertAt)||d.alertAt<1||d.alertAt>100||typeof d.alertsEnabled!=='boolean')throw new HttpError(400,'Choose a monthly limit from 1 to 1,000,000 and an alert threshold from 1% to 100%.');
 await db().prepare('INSERT INTO usage_preferences (owner,monthly_limit,alert_at,alerts_enabled,updated) VALUES (?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET monthly_limit=excluded.monthly_limit,alert_at=excluded.alert_at,alerts_enabled=excluded.alerts_enabled,updated=excluded.updated').bind(owner,d.monthlyLimit,d.alertAt,d.alertsEnabled?1:0,Date.now()).run();
 return noStore(Response.json(await usagePreferences(owner)));
}catch(e){return noStore(failure(e))}}
