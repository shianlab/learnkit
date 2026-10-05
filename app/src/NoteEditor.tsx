import {useEffect,useRef,useState} from 'react';
import {Check,ImagePlus} from 'lucide-react';
import {pendingNoteFlush} from './common';
import type {Asset} from './types';
export default function NoteEditor({id,onSaved,highlight=''}:{id:string;onSaved:()=>void;highlight?:string}){
  const [value,setValue]=useState(''),[state,setState]=useState('正在读取…'),[ready,setReady]=useState(false),[assets,setAssets]=useState<Asset[]>([]),[assetMessage,setAssetMessage]=useState('');
  const draft=useRef({id,value:'',revision:0,saved:0}),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true),saving=useRef<Promise<void>|null>(null);
  const field=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(!ready||!highlight)return;const index=value.toLocaleLowerCase().indexOf(highlight.toLocaleLowerCase());if(index>=0){field.current?.focus({preventScroll:true});field.current?.setSelectionRange(index,index+highlight.length);}},[ready,highlight]);
  async function persist():Promise<void>{
    if(saving.current){await saving.current;if(draft.current.revision>draft.current.saved)return persist();return;}
    if(draft.current.revision===draft.current.saved)return;
    const current={...draft.current};
    const operation=(async()=>{try{await window.learning.saveNote(current.id,current.value);draft.current.saved=current.revision;if(mounted.current&&draft.current.revision===current.revision)setState('已保存');onSaved();}catch(error){if(mounted.current)setState('保存失败，请重试');throw error;}})();
    saving.current=operation;try{await operation;}finally{saving.current=null;}
    if(draft.current.revision>draft.current.saved)await persist();
  }
  useEffect(()=>{mounted.current=true;let alive=true;const flush=()=>persist();pendingNoteFlush.add(flush);window.learning.note(id).then(n=>{if(!alive)return;setValue(n?.content||'');draft.current={id,value:n?.content||'',revision:0,saved:0};setState('已保存');setReady(true);if(n)void window.learning.assets(n.id).then(rows=>{if(alive)setAssets(rows);});}).catch(()=>{if(alive)setState('笔记读取失败');});return()=>{alive=false;mounted.current=false;if(timer.current)clearTimeout(timer.current);void persist().catch(()=>{}).finally(()=>pendingNoteFlush.delete(flush));};},[id]);
  function update(content:string){setValue(content);draft.current.value=content;draft.current.revision++;setState('正在保存…');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void persist().catch(()=>{}),500);}
  return <div className="note-editor"><div className="note-label"><span>我的理解</span><span className={state.includes('失败')?'save-error':'save-state'}>{state==='已保存'&&<Check size={12}/>} {state}</span></div><textarea ref={field} maxLength={200000} aria-label="课程笔记" disabled={!ready} value={value} onChange={e=>update(e.target.value)} onBlur={()=>void persist().catch(()=>{})} placeholder={'记录观点、问题或自己的理解…'}/><div className="note-attachment-tools"><button disabled={!ready} onClick={async()=>{try{await persist();const result=await window.learning.importAsset({lessonId:id});if(result){setAssets(await window.learning.assets(result.note_id));onSaved();setAssetMessage('图片已保存。');}}catch{setAssetMessage('图片未能添加，每张最多 25 MB。');}}}><ImagePlus size={13}/>添加笔记图片</button></div>{assets.length>0&&<div className="note-assets">{assets.map(asset=><div key={asset.id}><img src={asset.url} alt={asset.name}/><button aria-label={`移除课程图片 ${asset.id}`} onClick={async()=>{await window.learning.removeAsset(asset.id);setAssets(await window.learning.assets(asset.note_id));}}>移除</button></div>)}</div>}{assetMessage&&<p className="note-tip">{assetMessage}</p>}<div className="note-tip">自动保存</div>{state.includes('失败')&&<button className="text-button" onClick={()=>void persist().catch(()=>{})}>重试保存</button>}</div>;
}
