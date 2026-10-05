import {useEffect,useRef} from 'react';
import {pendingNoteFlush} from './common';
import {compareCourseFrames} from './tracking';
import type {CourseFrame} from './tracking';
import type {StudySample} from './types';
export default function LearningTracker({audioLessonId,readingLessonId,reading,onError}:{audioLessonId:string|null;readingLessonId:string;reading:boolean;onError:(text:string)=>void}){
  const latest=useRef({audioLessonId,readingLessonId,reading,onError});latest.current={audioLessonId,readingLessonId,reading,onError};
  useEffect(()=>{
    const sessionId='parallel-v1:'+crypto.randomUUID();let sequence=0,last:CourseFrame|null=null,lastInteraction=Date.now(),seekSerial=0,suspended=false;
    const pending:StudySample[]=[];let chain=Promise.resolve();
    const activity=()=>{lastInteraction=Date.now();};const seek=()=>{seekSerial++;};
    function tick(){const a=document.querySelector<HTMLAudioElement>('audio'),time=Date.now(),context=latest.current;
      const typing=!!document.activeElement?.closest('input,textarea,select,[contenteditable="true"]');
      const frame:CourseFrame={time,audioLessonId:a?.dataset.lessonId||context.audioLessonId,readingLessonId:context.readingLessonId,position:a?.currentTime||0,rate:a?.playbackRate||1,playing:!suspended&&!!a&&!a.paused&&!a.ended&&a.readyState>=2,seeking:a?.seeking||false,seekSerial,reading:!suspended&&context.reading&&!typing,focused:document.hasFocus(),visible:document.visibilityState==='visible',lastInteraction};
      const previous=last;const results=compareCourseFrames(previous,frame);last=frame;if(!results.length)return;
      const d=new Date(time),day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      // Adjacent sequence pairs identify one window, without changing existing backup schemas.
      const windowSequence=sequence++*2;
      results.forEach((result,index)=>pending.push({sessionId,sequence:windowSequence+index,day,startedAt:new Date(previous!.time).toISOString(),...result}));
    }
    async function flush(){tick();const samples=pending.splice(0);const operation=async()=>{for(let index=0;index<samples.length;index++){try{await window.learning.recordLearning(samples[index]);}catch(error){pending.unshift(...samples.slice(index));throw error;}}};chain=chain.then(operation,operation);await chain;}
    const tickInterval=setInterval(tick,1000),saveInterval=setInterval(()=>void flush().catch(()=>latest.current.onError('学习记录尚未保存，请检查数据目录')),5000);
    const stop=window.learning.onRuntimeEvent(event=>{if(event.type==='suspend'){suspended=true;last=null;void flush().catch(()=>{});}if(event.type==='resume'){suspended=false;last=null;}if(event.type==='data-restored'){pending.splice(0);last=null;}});
    for(const name of ['pointerdown','keydown','scroll'])document.addEventListener(name,activity,true);document.addEventListener('seeking',seek,true);
    pendingNoteFlush.add(flush);
    return()=>{clearInterval(tickInterval);clearInterval(saveInterval);stop();for(const name of ['pointerdown','keydown','scroll'])document.removeEventListener(name,activity,true);document.removeEventListener('seeking',seek,true);void flush().catch(()=>{}).finally(()=>pendingNoteFlush.delete(flush));};
  },[]);
  return null;
}
