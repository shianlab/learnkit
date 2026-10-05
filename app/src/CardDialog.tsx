import {useState} from 'react';
import Modal from './Modal';
import {X} from 'lucide-react';
import type {CardDraft} from './types';
import {failureMessage} from './common';
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export default function CardDialog({draft,onClose,onSaved}:{draft:CardDraft;onClose:()=>void;onSaved:()=>void}){
  const [question,setQuestion]=useState(draft.question),[answer,setAnswer]=useState(draft.answer),[due,setDue]=useState(draft.dueDay||today()),[paused,setPaused]=useState(draft.paused||false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const dirty=question!==draft.question||answer!==draft.answer||due!==(draft.dueDay||today())||paused!==!!draft.paused;
  return <Modal label={draft.id?'编辑复习卡':'创建复习卡'} dirty={dirty} busy={busy} onClose={onClose}>{close=><form className="learning-dialog" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await window.learning.saveCard({...draft,question,answer,dueDay:due,paused});onSaved();onClose();}catch(error){setError(failureMessage(error));}finally{setBusy(false);}}}><header><h2>{draft.id?'编辑复习卡':'创建复习卡'}</h2><button type="button" aria-label="关闭复习卡编辑" onClick={close}><X size={20}/></button></header>{draft.sourceQuote&&<blockquote>{draft.sourceQuote}</blockquote>}<label>问题<textarea aria-label="复习问题" required maxLength={5000} value={question} onChange={e=>setQuestion(e.target.value)}/></label><label>答案与自己的理解<textarea aria-label="复习答案" maxLength={200000} value={answer} onChange={e=>setAnswer(e.target.value)}/></label><div className="form-line"><label>下次复习<input aria-label="复习日期" type="date" value={due} required onChange={e=>setDue(e.target.value)}/></label><label><input type="checkbox" aria-label="暂停复习" checked={paused} onChange={e=>setPaused(e.target.checked)}/>暂停这张卡片</label></div>{error&&<p role="alert" className="form-error">{error}</p>}<footer><span>依据自评安排复习，也可修改日期。</span><button className="primary-button" disabled={busy} type="submit">保存复习卡</button></footer></form>}</Modal>;
}
