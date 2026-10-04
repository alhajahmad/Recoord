'use client';
import {useEffect,useState} from 'react';
export type Preferences={density:'comfortable'|'compact';text:'standard'|'large';motion:'system'|'reduced';send:'enter'|'modifier';layout:'grid'|'list'};
export const defaults:Preferences={density:'comfortable',text:'standard',motion:'system',send:'enter',layout:'grid'};
export function usePreferences(userId:string){
 const [preferences,setPreferences]=useState<Preferences>(defaults),[status,setStatus]=useState('');
 const key='recoord.preferences.v1.'+userId;
 useEffect(()=>{try{const raw=JSON.parse(localStorage.getItem(key)||'{}');const next={...defaults};for(const field of Object.keys(defaults) as (keyof Preferences)[]){const allowed={density:['comfortable','compact'],text:['standard','large'],motion:['system','reduced'],send:['enter','modifier'],layout:['grid','list']};if(allowed[field].includes(raw?.[field]))(next as Record<string,string>)[field]=raw[field]}setPreferences(next);setStatus('Saved on this device')}catch{setPreferences(defaults);setStatus('Device storage unavailable')}},[key]);
 useEffect(()=>{document.documentElement.dataset.density=preferences.density;document.documentElement.dataset.text=preferences.text;document.documentElement.dataset.motion=preferences.motion;return()=>{delete document.documentElement.dataset.density;delete document.documentElement.dataset.text;delete document.documentElement.dataset.motion}},[preferences]);
 function update(next:Preferences){setPreferences(next);try{localStorage.setItem(key,JSON.stringify(next));setStatus('Saved on this device')}catch{setStatus('Applied for this session. Device storage unavailable.')}}
 return {preferences,update,status};
}
export function shouldSend(e:{key:string;shiftKey:boolean;metaKey:boolean;ctrlKey:boolean;nativeEvent:{isComposing:boolean}},mode:Preferences['send']){return e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&(mode==='enter'||e.metaKey||e.ctrlKey)}
