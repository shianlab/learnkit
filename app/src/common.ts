import type {Lesson} from './types';
export {default as appConfig} from '../app.config.json';
export const courseGroups=(lessons:Lesson[])=>[...new Map(lessons.map(l=>[l.season,{id:l.season,name:l.seasonName}])).values()].sort((a,b)=>a.id-b.id);
export const kinds:Record<string,string>={lesson:'正课',qa:'问答',bonus:'加餐 / 书单',summary:'总结',notice:'通知',index:'目录',preface:'发刊词'};
export const formatTime=(n:number)=>`${Math.floor((n||0)/60).toString().padStart(2,'0')}:${Math.floor((n||0)%60).toString().padStart(2,'0')}`;
export const pendingNoteFlush=new Set<()=>Promise<void>>();
export async function flushNotes(){await Promise.all([...pendingNoteFlush].map(fn=>fn()));}
export function failureMessage(error:unknown){return (error instanceof Error?error.message:String(error)).replace(/^Error:\s*/,'').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'');}
