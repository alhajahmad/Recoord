import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
export class HttpError extends Error { constructor(public status:number,message:string){super(message)} }
export async function identity(request:Request){const user=await getChatGPTUser();if(!user)throw new HttpError(401,"Please sign in to continue.");if(request.method!=="GET"&&request.headers.get("origin")!==new URL(request.url).origin)throw new HttpError(403,"This request is not allowed.");await db().prepare("INSERT INTO profiles (id,email,name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name").bind(user.userId,user.email.toLowerCase(),user.displayName).run();return user.userId;}
export function db(){if(!env.DB)throw new Error("storage");return env.DB;}
export function failure(e:unknown){if(e instanceof HttpError)return Response.json({error:e.message},{status:e.status});console.error("Recoord request failed",e instanceof Error?e.message:"unknown error");return Response.json({error:"We couldn’t complete that request. Your unsaved work is still here; please try again."},{status:503});}
export async function body(r:Request){if(Number(r.headers.get("content-length"))>250000)throw new HttpError(413,"This item is too large.");const raw=await r.text();if(raw.length>250000)throw new HttpError(413,"This item is too large.");try{const value=JSON.parse(raw);if(!value||typeof value!=="object"||Array.isArray(value))throw 0;return value}catch{throw new HttpError(400,"Invalid request.")}}
export function text(value:unknown,max:number,required=false){if(typeof value!=="string"||value.length>max||(required&&!value.trim()))throw new HttpError(400,"Please check the text and its length.");return value;}
export async function ownedProject(id:string,owner:string){const found=await db().prepare("SELECT * FROM projects WHERE id=? AND owner=?").bind(id,owner).first();if(!found)throw new HttpError(404,"Project not found.");return found;}

export async function accessProject(id:string,user:string,permission:'read'|'write'|'owner'='read'){
 const p=await db().prepare("SELECT p.*,CASE WHEN p.owner=? THEN 'owner' ELSE m.role END AS role FROM projects p LEFT JOIN members m ON m.project=p.id AND m.user=? WHERE p.id=? AND (p.owner=? OR m.user=?)").bind(user,user,id,user,user).first();
 if(!p)throw new HttpError(404,'Project not found.');
 if(permission==='owner'&&p.role!=='owner'||permission==='write'&&p.role==='viewer')throw new HttpError(403,'Your project role does not allow this change.');
 return p;
}
export function activity(project:string,user:string,content:string){return db().prepare('INSERT INTO activities (id,project,actor,content,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),project,user,content,Date.now())}
