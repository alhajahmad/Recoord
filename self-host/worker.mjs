import application from '../dist/server/index.js';
import {verifyAccess} from './auth.mjs';
export default {async fetch(request,env,ctx){
 let user;try{user=await verifyAccess(request.headers.get('Cf-Access-Jwt-Assertion'),env.ACCESS_ISSUER,env.ACCESS_AUDIENCE)}catch{return new Response('Sign in through your configured Cloudflare Access application.',{status:401})}
 const url=new URL(request.url);
 if(url.pathname==='/signout-with-chatgpt')return Response.redirect(new URL('/cdn-cgi/access/logout',url),302);
 if(url.pathname==='/signin-with-chatgpt')return Response.redirect(new URL('/',url),302);
 const headers=new Headers(request.headers);
 for(const name of [...headers.keys()])if(name.startsWith('oai-authenticated-user-'))headers.delete(name);
 headers.set('oai-authenticated-user-id',user.id);headers.set('oai-authenticated-user-email',user.email);
 return application.fetch(new Request(request,{headers}),env,ctx);
}};
