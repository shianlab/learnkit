'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke(`jyrk:${name}`,...args);
contextBridge.exposeInMainWorld('learning',Object.freeze({
  audioMetadata:(id,duration)=>invoke('audio-metadata',id,duration),bootstrap:()=>invoke('bootstrap'),lesson:id=>invoke('lesson',id),
  note:id=>invoke('note',id),notes:()=>invoke('notes'),saveNote:(id,content)=>invoke('save-note',id,content),
  setSetting:(key,value)=>invoke('setting',key,value),
  progress:id=>invoke('progress',id),saveProgress:(id,position,scroll,anchor=null,offset=0)=>invoke('save-progress',id,position,scroll,anchor,offset),
  search:options=>invoke('search',options),flags:()=>invoke('flags'),setFlag:(id,key,value)=>invoke('flag',id,key,value),
  sleepTimer:()=>invoke('sleep-timer'),setSleepTimer:options=>invoke('set-sleep-timer',options),lessonEnded:()=>invoke('lesson-ended'),
  allNotes:deleted=>invoke('all-notes',deleted),editNote:item=>invoke('edit-note',item),trashNote:(id,restore=false)=>invoke('trash-note',id,restore),
  annotations:(id,deleted=false)=>invoke('annotations',id,deleted),addAnnotations:items=>invoke('add-annotations',items),editAnnotation:(id,comment,color)=>invoke('edit-annotation',id,comment,color),trashAnnotation:(id,restore=false)=>invoke('trash-annotation',id,restore),reanchorAnnotation:(id,item)=>invoke('reanchor-annotation',id,item),
  bookmarks:id=>invoke('bookmarks',id),addBookmark:item=>invoke('add-bookmark',item),removeBookmark:id=>invoke('remove-bookmark',id),
  cards:()=>invoke('cards'),saveCard:item=>invoke('save-card',item),rateCard:(id,rating)=>invoke('rate-card',id,rating),
  savePlan:item=>invoke('save-plan',item),removePlan:id=>invoke('remove-plan',id),removedPlans:()=>invoke('removed-plans'),restorePlan:id=>invoke('restore-plan',id),studyData:()=>invoke('study-data'),recordLearning:item=>invoke('record-learning',item),
  assets:id=>invoke('assets',id),importAsset:target=>invoke('import-asset',target),removeAsset:id=>invoke('remove-asset',id),
  exportNotes:options=>invoke('export-notes',options),backupNow:()=>invoke('backup-now'),restoreBackup:()=>invoke('restore-backup'),backupStatus:()=>invoke('backup-status'),automaticBackup:()=>invoke('automatic-backup'),openBackupFolder:()=>invoke('open-backup-folder'),
  onRuntimeEvent:callback=>{const listener=(_event,payload)=>callback(payload);ipcRenderer.on('jyrk:runtime-event',listener);return()=>ipcRenderer.removeListener('jyrk:runtime-event',listener);},
  diagnostics:()=>invoke('diagnostics'),
  onPrepareRestore:callback=>{const listener=()=>{Promise.resolve().then(callback).then(()=>ipcRenderer.send('jyrk:restore-ready'),()=>ipcRenderer.send('jyrk:restore-ready',true));};ipcRenderer.on('jyrk:prepare-restore',listener);return()=>ipcRenderer.removeListener('jyrk:prepare-restore',listener);},
  onPrepareClose:callback=>{const listener=()=>{Promise.resolve().then(callback).catch(()=>{}).finally(()=>ipcRenderer.send('jyrk:close-ready'));};ipcRenderer.on('jyrk:prepare-close',listener);return()=>ipcRenderer.removeListener('jyrk:prepare-close',listener);}
}));
