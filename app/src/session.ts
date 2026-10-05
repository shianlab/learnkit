import {useLayoutEffect,useRef,useState} from 'react';
import type {Dispatch,SetStateAction} from 'react';

// Navigation state belongs to this open window, never to a user's backup.
const values=new Map<string,unknown>(),scrolls=new Map<string,number>();
export function useSessionState<T>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>]{
  const [value,setValue]=useState<T>(()=>values.has(key)?values.get(key) as T:initial);
  values.set(key,value);return [value,setValue];
}
export function useScrollMemory<T extends HTMLElement>(key:string,ready=true){
  const ref=useRef<T>(null),restored=useRef(false);
  useLayoutEffect(()=>{const element=ref.current;if(!element||!ready)return;
    if(!restored.current){element.scrollTop=scrolls.get(key)||0;restored.current=true;}
    const save=()=>{scrolls.set(key,element.scrollTop);};element.addEventListener('scroll',save);
    return()=>{save();element.removeEventListener('scroll',save);};
  },[key,ready]);return ref;
}
export function useFilterReset(filters:unknown[],reset:()=>void){
  const previous=useRef(JSON.stringify(filters));
  useLayoutEffect(()=>{const signature=JSON.stringify(filters);if(signature!==previous.current){previous.current=signature;reset();}},filters);
}

type Caret={field:string;start:number;end:number;scroll:number};
export const noteCarets=new Map<string,Caret>();
