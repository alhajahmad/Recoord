export function repositoryPath(input:string){
 const value=input.trim().replace(/^https:\/\/github\.com\//i,'').replace(/\/$/,'');
 const match=/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})$/.exec(value);
 if(!match||match[2]==='.'||match[2]==='..')throw new Error('Enter a public GitHub repository as owner/repository or its github.com URL.');
 return match[1]+'/'+match[2];
}
export function calendarDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.slice(0,4)==='0000'||value.slice(0,4)==='9999')return null;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value?date:null;
}
export function calendarText(value:string){return value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');}
export function foldCalendarLine(value:string){
 const encoder=new TextEncoder();let result='',line='',bytes=0;
 for(const character of value){const size=encoder.encode(character).length;if(bytes+size>75){result+=line+'\r\n';line=' ';bytes=1;}line+=character;bytes+=size;}
 return result+line;
}
export type CalendarTask={id:string;title:string;due:string|null;status:string};
export function projectCalendar(project:string,tasks:CalendarTask[],now=new Date()){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Recoord//Project deadlines//EN','CALSCALE:GREGORIAN'];let count=0;
 const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 for(const task of tasks){const date=task.due?calendarDate(task.due):null;if(task.status==='done'||!date)continue;count++;
 const start=date.toISOString().slice(0,10).replace(/-/g,'');date.setUTCDate(date.getUTCDate()+1);
 lines.push('BEGIN:VEVENT','UID:'+encodeURIComponent(project)+'-'+encodeURIComponent(task.id)+'@recoord.ai','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+start,'DTEND;VALUE=DATE:'+date.toISOString().slice(0,10).replace(/-/g,''),'SUMMARY:'+calendarText(task.title),'TRANSP:TRANSPARENT','END:VEVENT');}
 lines.push('END:VCALENDAR');return {count,content:lines.map(foldCalendarLine).join('\r\n')+'\r\n'};
}
export async function boundedText(response:Response,limit:number){
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('This README is too large to import (80 KB maximum).');}
 if(!response.body)return '';
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,result='';
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit)throw new Error('This README is too large to import (80 KB maximum).');result+=decoder.decode(value,{stream:true});}return result+decoder.decode();}finally{await reader.cancel();reader.releaseLock();}
}
