export const groqChatModels=[
 {id:'openai/gpt-oss-120b',name:'GPT OSS 120B',preview:false},
 {id:'openai/gpt-oss-20b',name:'GPT OSS 20B',preview:false},
 {id:'qwen/qwen3.8-27b',name:'Qwen 3.8 27B',preview:true},
] as const;
export const speechModels=[{id:'canopylabs/orpheus-v1-english',name:'Orpheus English',voices:['autumn','diana','hannah','austin','daniel','troy']},{id:'canopylabs/orpheus-arabic-saudi',name:'Orpheus Arabic Saudi',voices:['abdullah','fahad','sultan','lulwa','noura','aisha']}] as const;
export const transcriptionModels=[{id:'whisper-large-v3',name:'Whisper Large v3'},{id:'whisper-large-v3-turbo',name:'Whisper Large v3 Turbo'}] as const;
export function isGroq(base:string|undefined){try{const u=new URL(base||'');return u.origin==='https://api.groq.com'&&u.pathname.replace(/\/$/,'')==='/openai/v1'&&!u.username&&!u.password&&!u.search&&!u.hash}catch{return false}}
