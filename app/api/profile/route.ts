import {identity,db,failure,body,text,HttpError} from '../shared';
export async function GET(r:Request){try{const id=await identity(r);const profile=await db().prepare("SELECT p.name,p.email,d.bio,d.title,d.company,d.location,d.website,d.photo,d.username,COALESCE(d.visibility,'private') AS visibility,COALESCE(d.skills,'') AS skills,COALESCE(d.looking_for,'') AS lookingFor FROM profiles p LEFT JOIN profile_details d ON d.id=p.id WHERE p.id=?").bind(id).first();return Response.json(profile,{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function PATCH(r:Request){try{
 const id=await identity(r),d=await body(r),old=await db().prepare('SELECT * FROM profile_details WHERE id=?').bind(id).first();
 const name=text(d.name,80,true).trim(),bio=text(d.bio,500),title=text(d.title,100),company=text(d.company,100),location=text(d.location,100),website=text(d.website,300).trim(),photo=text(d.photo,120000);
 const rawUsername=d.username===undefined?old?.username??'':d.username;
 const username=text(rawUsername,24).trim().toLowerCase()||null;
 if(username&&!/^[a-z0-9_]{3,24}$/.test(username))throw new HttpError(400,'Use 3–24 letters, numbers, or underscores for your username.');
 const visibility=d.visibility===undefined?old?.visibility??'private':d.visibility;
 if(visibility!=='private'&&visibility!=='members')throw new HttpError(400,'Choose a supported profile visibility.');
 if(visibility==='members'&&!username)throw new HttpError(400,'Choose a username before sharing your profile.');
 const skills=text(d.skills===undefined?old?.skills??'':d.skills,500),lookingFor=text(d.lookingFor===undefined?old?.looking_for??'':d.lookingFor,500);
 if(username&&await db().prepare('SELECT id FROM profile_details WHERE username=? AND id<>?').bind(username,id).first())throw new HttpError(409,'That username is already taken.');
 if(website){let valid=false;try{const url=new URL(website);valid=url.protocol==='https:'&&!url.username&&!url.password}catch{}if(!valid)throw new HttpError(400,'Use a full https:// website address.');}
 if(photo&&!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(photo))throw new HttpError(400,'Choose a supported photo.');
 try{await db().batch([db().prepare('UPDATE profiles SET name=? WHERE id=?').bind(name,id),db().prepare('INSERT INTO profile_details (id,bio,title,company,location,website,photo,username,visibility,skills,looking_for) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET bio=excluded.bio,title=excluded.title,company=excluded.company,location=excluded.location,website=excluded.website,photo=excluded.photo,username=excluded.username,visibility=excluded.visibility,skills=excluded.skills,looking_for=excluded.looking_for').bind(id,bio,title,company,location,website,photo,username,visibility,skills,lookingFor)])}catch(e){if(String(e).includes('UNIQUE'))throw new HttpError(409,'That username is already taken.');throw e}
 return Response.json({name,bio,title,company,location,website,photo,username,visibility,skills,lookingFor});
 }catch(e){return failure(e)}}
