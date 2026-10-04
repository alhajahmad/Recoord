import {db,HttpError} from '../api/shared';
import {reserveMonthlyRequest} from './usage-controls';
import {groqChatModels,isGroq} from './groq-models';
export function chooseChatModel(requested:unknown,e:Record<string,string>){
 if(requested===undefined||requested==='')return e.AI_MODEL;
 if(typeof requested!=='string'||(!isGroq(e.AI_BASE_URL)?requested!==e.AI_MODEL:!groqChatModels.some(m=>m.id===requested)))throw new HttpError(400,'Choose a supported chat model.');
 return requested;
}
export async function reserveAIRequest(owner:string,e:Record<string,string>){
 await reserveMonthlyRequest(owner);const day=new Date().toISOString().slice(0,10);
 for(const [key,limit] of [[owner+':'+day,Math.max(1,Math.min(Number(e.AI_DAILY_REQUEST_LIMIT)||50,1000))],['site:'+day,Math.max(1,Math.min(Number(e.AI_DAILY_SITE_REQUEST_LIMIT)||200,10000))]] as const){
 if(!await db().prepare('INSERT INTO quotas (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(key,limit).first())throw new HttpError(429,'Daily AI limit reached. Please try tomorrow.');}
}
// Bound actual bytes even when Content-Length is absent or dishonest.
export async function boundedBytes(response:Request|Response,max:number){const reader=response.body?.getReader();if(!reader)throw new HttpError(400,'The request is empty.');const chunks:Uint8Array[]=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new HttpError(413,'The file or response is too large.');}chunks.push(value)}}finally{reader.releaseLock()}const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}return result;}
