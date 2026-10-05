import type {Lesson} from './types';
export default function Status({lesson}:{lesson:Lesson}){return <span className={`status ${lesson.textStatus==='available'?(!lesson.audio?'quiet':'normal'):'warning'}`}>{lesson.textStatus==='missing_body'?'正文暂缺':lesson.textStatus==='partial_body'?'正文不完整':!lesson.audio?'当前无音频':lesson.audio.format==='m4a'?'M4A 音频':'音文课程'}</span>;}
