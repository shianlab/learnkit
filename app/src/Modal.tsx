import {useLayoutEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';

export default function Modal({label,dirty=false,busy=false,onClose,children}:{label:string;dirty?:boolean;busy?:boolean;onClose:()=>void;children:(close:()=>void)=>ReactNode}){
  const ref=useRef<HTMLDivElement>(null),[confirm,setConfirm]=useState(false),latest=useRef({dirty,busy,onClose});latest.current={dirty,busy,onClose};
  function close(){if(latest.current.busy)return;if(latest.current.dirty)setConfirm(true);else latest.current.onClose();}
  useLayoutEffect(()=>{
    const root=ref.current!,previous=document.activeElement as HTMLElement|null,background:Array<[HTMLElement,boolean]>=[];
    for(let node:HTMLElement|null=root;node?.parentElement;node=node.parentElement){for(const sibling of node.parentElement.children)if(sibling!==node&&sibling instanceof HTMLElement){background.push([sibling,sibling.inert]);sibling.inert=true;}}
    const focusable=()=>[...root.querySelectorAll<HTMLElement>('input,textarea,select,button,a[href],[tabindex]')].filter(e=>!e.closest('[inert]')&&!(e as HTMLButtonElement).disabled&&e.tabIndex>=0&&e.getClientRects().length);
    (root.querySelector<HTMLElement>('textarea,input:not([type=checkbox])')||focusable()[0]||root).focus();
    const keys=(event:KeyboardEvent)=>{
      if(event.key==='Tab'){const items=focusable(),first=items[0],last=items.at(-1);if(!items.length){event.preventDefault();root.focus();}else if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus();}}
      if(event.key==='Escape'){event.preventDefault();close();}
      if((event.ctrlKey||event.metaKey)&&['k','f'].includes(event.key.toLowerCase()))event.preventDefault();
      event.stopPropagation();
    };
    // Bubble inside the dialog: inputs keep their normal editing behavior, window shortcuts never see it.
    root.addEventListener('keydown',keys);
    const focus=(event:FocusEvent)=>{if(!root.contains(event.target as Node))(focusable()[0]||root).focus();};document.addEventListener('focusin',focus);
    return()=>{root.removeEventListener('keydown',keys);document.removeEventListener('focusin',focus);for(const [element,inert] of background)element.inert=inert;if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus();};
  },[]);
  useLayoutEffect(()=>{const root=ref.current!,form=root.querySelector<HTMLElement>('.learning-dialog');if(form)form.inert=confirm;if(confirm)root.querySelector<HTMLElement>('.draft-protection button')?.focus();else (form?.querySelector<HTMLElement>('textarea,input:not([type=checkbox])')||form?.querySelector<HTMLElement>('button')||root).focus({preventScroll:true});return()=>{if(form)form.inert=false;};},[confirm]);
  return <div ref={ref} className="modal-backdrop" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children(close)}{confirm&&<div className="draft-protection" role="alert"><strong>还有未保存的修改</strong><p>继续编辑可保留当前内容；放弃修改会关闭此窗口。</p><div><button className="primary-button" onClick={()=>setConfirm(false)}>继续编辑</button><button className="secondary-button" onClick={()=>latest.current.onClose()}>放弃修改</button></div></div>}</div>;
}
