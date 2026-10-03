import {createRemoteJWKSet,jwtVerify} from 'jose';
const keySets=new Map();
export async function verifyAccess(token,issuer,audience,keySet){
 if(!token||!issuer||!audience)throw new Error('Missing authentication');
 const url=new URL(issuer);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.cloudflareaccess.com')||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid Access issuer');
 const normalized=url.origin;
 if(!keySet){if(!keySets.has(normalized))keySets.set(normalized,createRemoteJWKSet(new URL('/cdn-cgi/access/certs',normalized)));keySet=keySets.get(normalized)}
 const {payload}=await jwtVerify(token,keySet,{issuer:normalized,audience,algorithms:['RS256'],requiredClaims:['sub','email','exp','iat']});
 if(typeof payload.sub!=='string'||typeof payload.email!=='string')throw new Error('A user identity is required');
 return {id:payload.sub,email:payload.email};
}
