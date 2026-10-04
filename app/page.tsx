import {getChatGPTUser,chatGPTSignInPath,chatGPTSignOutPath} from "./chatgpt-auth";
import Chat from "./chat";
import {env} from "cloudflare:workers";
export const dynamic="force-dynamic";
export default async function Home(){const user=await getChatGPTUser(),e=env as unknown as Record<string,string>;let provider="Not connected";try{provider=e.AI_PROVIDER_LABEL||new URL(e.AI_BASE_URL).hostname}catch{}return <Chat preview={process.env.NODE_ENV==='development'} user={user?{id:user.userId,name:user.displayName,email:user.email}:null} ready={!!(e.AI_BASE_URL&&e.AI_MODEL&&e.AI_API_KEY)} provider={provider} model={e.AI_MODEL||""} signIn={chatGPTSignInPath('/')} signOut={chatGPTSignOutPath('/')} />}
