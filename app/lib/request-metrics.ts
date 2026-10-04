import {db} from '../api/shared';
export const metricSources=['chat','summary','project_api','file_search','speech','transcription','vision','moderation'] as const;
export type MetricSource=typeof metricSources[number];
export type RequestMetric={owner:string;project?:string|null;keyId?:string|null;source:MetricSource;status:number;duration:number};
// Metadata only; failure to record telemetry must never interrupt the underlying request.
export async function recordMetric(metric:RequestMetric){try{
 if(!metric||typeof metric.owner!=='string'||!metric.owner.length||metric.owner.length>150||!metricSources.includes(metric.source)||!Number.isInteger(metric.status)||metric.status<200||metric.status>599||!Number.isFinite(metric.duration)||metric.duration<0)return;
 for(const value of [metric.project,metric.keyId])if(value!=null&&(typeof value!=='string'||!value.length||value.length>150))return;
 await db().prepare('INSERT INTO request_metrics (id,owner,project,key_id,source,status,duration,created) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),metric.owner,metric.project??null,metric.keyId??null,metric.source,metric.status,Math.min(86400000,Math.round(metric.duration)),Date.now()).run();
 }catch{/* Metrics are best effort; content and exception details are never logged. */}}
