export type Frame={time:number;lessonId:string|null;position:number;rate:number;playing:boolean;seeking:boolean;seekSerial:number;reading:boolean;focused:boolean;visible:boolean;lastInteraction:number};
export function compareFrames(previous:Frame|null,current:Frame){
  const empty={audioSeconds:0,readSeconds:0,totalSeconds:0,intervals:[] as number[][]};
  if(!previous||!current.lessonId||previous.lessonId!==current.lessonId)return empty;
  const seconds=(current.time-previous.time)/1000;if(seconds<=0||seconds>2)return empty;
  const delta=current.position-previous.position;
  const audio=current.playing&&previous.playing&&!current.seeking&&!previous.seeking&&current.seekSerial===previous.seekSerial&&delta>0&&delta<=seconds*Math.max(current.rate,previous.rate)*1.6+.3;
  const read=current.reading&&previous.reading&&current.focused&&previous.focused&&current.visible&&current.time-current.lastInteraction<60000;
  return {audioSeconds:audio?seconds:0,readSeconds:read?seconds:0,totalSeconds:audio||read?seconds:0,intervals:audio?[[previous.position,current.position]]:[]};
}

export type CourseFrame=Omit<Frame,'lessonId'> & {audioLessonId:string|null;readingLessonId:string|null};
// Listening and reading may belong to different lessons during the same time window.
export function compareCourseFrames(previous:CourseFrame|null,current:CourseFrame){
  const results=new Map<string,ReturnType<typeof compareFrames>>();
  if(!previous)return [];
  const audio=compareFrames({...previous,lessonId:previous.audioLessonId,reading:false},{...current,lessonId:current.audioLessonId,reading:false});
  const read=compareFrames({...previous,lessonId:previous.readingLessonId,playing:false},{...current,lessonId:current.readingLessonId,playing:false});
  if(audio.totalSeconds&&current.audioLessonId)results.set(current.audioLessonId,audio);
  if(read.totalSeconds&&current.readingLessonId){const listening=results.get(current.readingLessonId);results.set(current.readingLessonId,{audioSeconds:listening?.audioSeconds||0,readSeconds:read.readSeconds,totalSeconds:Math.max(listening?.totalSeconds||0,read.totalSeconds),intervals:listening?.intervals||[]});}
  return [...results].map(([lessonId,value])=>({lessonId,...value}));
}
