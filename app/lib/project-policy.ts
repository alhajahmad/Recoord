import {db,HttpError} from '../api/shared';
export type PolicyValues={usageVisibility:'owner'|'members';logsVisibility:'hidden'|'owner'|'members';aiEnabled:boolean;importsEnabled:boolean;fileSearchEnabled:boolean;apiEnabled:boolean;auditEnabled:boolean;apiLogMode:'disabled'|'per_call'|'all';inviteDomains:string[]};
export type ProjectPolicy=PolicyValues&{project:string;revision:number;updated:number|null};
export const defaultPolicy:PolicyValues={usageVisibility:'members',logsVisibility:'members',aiEnabled:true,importsEnabled:true,fileSearchEnabled:true,apiEnabled:true,auditEnabled:false,apiLogMode:'disabled',inviteDomains:[]};
export const policyFields=Object.keys(defaultPolicy) as (keyof PolicyValues)[];
export function validatePolicy(value:unknown):PolicyValues{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Check the project policy.');const p=value as Record<string,unknown>;
 for(const [key,options] of [['usageVisibility',['owner','members']],['logsVisibility',['hidden','owner','members']],['apiLogMode',['disabled','per_call','all']]] as const)if(!options.includes(p[key] as never))throw new HttpError(400,'Choose a valid '+key+' option.');
 for(const key of ['aiEnabled','importsEnabled','fileSearchEnabled','apiEnabled','auditEnabled'])if(typeof p[key]!=='boolean')throw new HttpError(400,'Choose a valid feature setting.');
 if(!Array.isArray(p.inviteDomains)||p.inviteDomains.length>25)throw new HttpError(400,'Use up to 25 exact invitation domains.');
 const inviteDomains=[...new Set(p.inviteDomains.map((value:unknown)=>{if(typeof value!=='string')throw new HttpError(400,'Enter exact domains such as example.com.');const domain=value.trim().toLowerCase();if(domain.length>253||!domain.includes('.')||!domain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw new HttpError(400,'Enter exact domains such as example.com, without URLs or wildcards.');return domain;}))];
 return {usageVisibility:p.usageVisibility,logsVisibility:p.logsVisibility,aiEnabled:p.aiEnabled,importsEnabled:p.importsEnabled,fileSearchEnabled:p.fileSearchEnabled,apiEnabled:p.apiEnabled,auditEnabled:p.auditEnabled,apiLogMode:p.apiLogMode,inviteDomains} as PolicyValues;
}
export async function getProjectPolicy(project:string):Promise<ProjectPolicy>{const row=await db().prepare('SELECT policy,revision,updated FROM project_policies WHERE project=?').bind(project).first<{policy:string;revision:number;updated:number}>();return {...(row?validatePolicy(JSON.parse(row.policy)):{...defaultPolicy,inviteDomains:[]}),project,revision:row?.revision??0,updated:row?.updated??null};}
export async function requireProjectFeature(project:string,feature:'aiEnabled'|'importsEnabled'|'fileSearchEnabled'|'apiEnabled'){const policy=await getProjectPolicy(project);if(!policy[feature])throw new HttpError(403,'The project owner has disabled this feature.');return policy;}
export async function assertInviteDomain(project:string,email:string){const {inviteDomains}=await getProjectPolicy(project);if(inviteDomains.length&&!inviteDomains.includes(email.trim().toLowerCase().split('@').pop()||''))throw new HttpError(403,'This email domain is not allowed by the project invitation policy.');}
export async function recordProjectApiRead(project:string){const day=new Date().toISOString().slice(0,10);await db().prepare('INSERT INTO project_api_usage (project,day,count) VALUES (?,?,1) ON CONFLICT(project,day) DO UPDATE SET count=count+1').bind(project,day).run();}
// Strict metadata allowlist: never store request bodies, content, authorization or tokens.
export async function logProjectEvent(project:string,actor:string,action:'api.read',details:{requested?:boolean;status?:number;keyId?:string}={}){
 const policy=await getProjectPolicy(project);if(policy.apiLogMode==='disabled'||policy.apiLogMode==='per_call'&&!details.requested)return;
 const safe:{status?:number;keyId?:string}={};if(Number.isInteger(details.status)&&details.status!>=100&&details.status!<=599)safe.status=details.status;
 if(typeof details.keyId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(details.keyId))safe.keyId=details.keyId;
 await db().prepare('INSERT INTO project_policy_events (id,project,actor,action,details,created) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),project,actor,action,JSON.stringify(safe),Date.now()).run();
}
