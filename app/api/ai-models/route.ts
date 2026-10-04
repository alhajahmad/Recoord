import {env} from 'cloudflare:workers';
import {identity,failure} from '../shared';
import {groqChatModels,isGroq} from '../../lib/groq-models';
export async function GET(r:Request){try{await identity(r);const e=env as unknown as Record<string,string>,configured=Boolean(e.AI_BASE_URL&&e.AI_API_KEY&&e.AI_MODEL),groq=configured&&isGroq(e.AI_BASE_URL);return Response.json({configured,groq,defaultModel:e.AI_MODEL||'',models:groq?groqChatModels:configured?[{id:e.AI_MODEL,name:e.AI_MODEL,preview:false}]:[]},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return failure(e)}}
