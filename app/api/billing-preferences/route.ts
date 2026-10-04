import {identity,db,body,failure,HttpError} from '../shared';
function noStore(response:Response){response.headers.set('Cache-Control','no-store');return response}
async function preferences(owner:string){const row=await db().prepare('SELECT company,email,purchase_order AS purchaseOrder FROM billing_preferences WHERE owner=?').bind(owner).first();return row??{company:'',email:'',purchaseOrder:''}}
export async function GET(r:Request){try{return noStore(Response.json(await preferences(await identity(r))))}catch(e){return noStore(failure(e))}}
export async function PATCH(r:Request){try{
 const owner=await identity(r),d=await body(r);
 if(Object.keys(d).some(key=>!['company','email','purchaseOrder'].includes(key)))throw new HttpError(400,'Only company, billing email, and purchase order preferences can be saved here.');
 for(const [key,max] of [['company',120],['email',254],['purchaseOrder',80]] as const)if(typeof d[key]!=='string'||d[key].length>max||/[\u0000-\u001f\u007f]/.test(d[key]))throw new HttpError(400,'Check the billing preferences and their lengths.');
 const company=d.company.trim(),email=d.email.trim().toLowerCase(),purchaseOrder=d.purchaseOrder.trim();
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Enter a valid billing email or leave it blank.');
 await db().prepare('INSERT INTO billing_preferences (owner,company,email,purchase_order,updated) VALUES (?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET company=excluded.company,email=excluded.email,purchase_order=excluded.purchase_order,updated=excluded.updated').bind(owner,company,email,purchaseOrder,Date.now()).run();
 return noStore(Response.json(await preferences(owner)));
}catch(e){return noStore(failure(e))}}
