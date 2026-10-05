'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {dialog,shell}=require('electron');
const {containsQuote,resolveAnnotation}=require('./anchors.cjs');
const {createBackup,restoreBackup,sha,within}=require('./backup.cjs');
const {exportDocument}=require('./export.cjs');
const {containedFile}=require('./library.cjs');
function registerLearning({handle,getDb,setDb,library,getWindow,directory,contentHash,emit,openDatabase,prepareToRestore}){
  let replacing=false,automaticBusy=false,manualBusy=false,lastAutomatic=0,stopping=false;
  const jobs=new Set(),discardedAssets=new Set();
  function collectAssets(){if(jobs.size||replacing)return;const retained=new Set(getDb().assets().map(a=>a.file_name));for(const name of discardedAssets){if(!retained.has(name)){const file=within(directory,path.join(directory,'assets',name));if(fs.existsSync(file))fs.unlinkSync(file);}discardedAssets.delete(name);}}
  function job(action){const pending=Promise.resolve().then(action);jobs.add(pending);pending.finally(()=>{jobs.delete(pending);collectAssets();}).catch(()=>{});return pending;}
  const assets=noteId=>getDb().assets(noteId).map(a=>({...a,url:`jyrk://personal/${a.id}`}));
  const source=item=>{if(item.lessonId){const lesson=library.get(item.lessonId);if(item.blockId&&!lesson.text.paragraphs.some(b=>b.block_id===item.blockId))throw new Error('出处段落不存在');if(item.audioPosition!==undefined&&item.audioPosition!==null&&(!lesson.audio||!Number.isFinite(item.audioPosition)||item.audioPosition<0||(lesson.audio?.duration_seconds>0&&item.audioPosition>lesson.audio.duration_seconds)))throw new Error('音频出处位置无效');}};
  const validateSelection=item=>{const lesson=library.get(item.lessonId),block=lesson.text.paragraphs.find(b=>b.block_id===item.blockId);if(!block||typeof item.quote!=='string'||!containsQuote(block,item.quote))throw new Error('选中文字与课程原文不匹配');return {...item,sourceSha:lesson.text.sha256};};
  handle('all-notes',deleted=>getDb().allNotes(deleted===true));
  handle('edit-note',item=>{if(item.sourceLesson){const lesson=library.get(item.sourceLesson);if(item.sourceBlock&&!lesson.text.paragraphs.some(b=>b.block_id===item.sourceBlock))throw new Error('摘录出处段落不存在');}return getDb().editNote(item);});
  handle('trash-note',(id,restore)=>getDb().trashNote(id,restore===true));
  handle('annotations',(id,deleted)=>{const lesson=library.get(id);return getDb().annotations(id,deleted===true).map(a=>resolveAnnotation(a,lesson));});
  handle('add-annotations',items=>{if(!Array.isArray(items))throw new Error('选区无效');return getDb().addAnnotations(items.map(validateSelection));});
  handle('edit-annotation',(id,comment,color)=>getDb().editAnnotation(id,comment,color));
  handle('trash-annotation',(id,restore)=>getDb().trashAnnotation(id,restore===true));
  handle('reanchor-annotation',(id,item)=>{const existing=getDb().raw.prepare('SELECT * FROM annotations WHERE id=? AND deleted_at IS NULL').get(id);if(!existing||existing.lesson_id!==item.lessonId)throw new Error('请选择同一课程的文字');const valid=validateSelection({...item,color:existing.color,comment:existing.comment});getDb().raw.prepare('UPDATE annotations SET block_id=?,quote=?,start_offset=?,end_offset=?,prefix=?,suffix=?,source_sha=?,updated_at=? WHERE id=?').run(valid.blockId,valid.quote,valid.start,valid.end,valid.prefix||'',valid.suffix||'',valid.sourceSha,new Date().toISOString(),id);});
  handle('bookmarks',id=>{if(id)library.get(id);return getDb().bookmarks(id);});
  handle('add-bookmark',item=>{source({lessonId:item.lessonId,blockId:item.blockId,audioPosition:item.position});if(item.kind==='paragraph'&&!item.blockId)throw new Error('段落书签缺少段落');if(item.kind==='audio'&&(!library.get(item.lessonId).audio||!Number.isFinite(item.position)))throw new Error('音频书签位置无效');return getDb().addBookmark(item);});
  handle('remove-bookmark',id=>getDb().removeBookmark(id));
  handle('cards',()=>getDb().cards());
  handle('save-card',item=>{source(item);return getDb().saveCard(item);});
  handle('rate-card',(id,rating)=>getDb().rateCard(id,rating));
  handle('save-plan',item=>{if(Array.isArray(item.lessonIds))item.lessonIds.forEach(id=>library.get(id));return getDb().savePlan({...item,lessonIds:Array.isArray(item.lessonIds)?[...item.lessonIds].sort():item.lessonIds});});
  handle('remove-plan',id=>getDb().removePlan(id));
  handle('removed-plans',()=>getDb().removedPlans());
  handle('restore-plan',id=>{const plan=getDb().removedPlans().find(p=>p.id===id);if(!plan)throw new Error('已删除计划不存在');plan.lesson_ids.forEach(id=>library.get(id));return getDb().restorePlan(id);});
  handle('study-data',()=>({...getDb().studyData(),flags:getDb().flags(),goalMinutes:getDb().settings().dailyGoalMinutes||20}));
  handle('record-learning',item=>{const lesson=library.get(item.lessonId);if(!Array.isArray(item.intervals)||(!lesson.audio&&item.intervals.length)||item.intervals.some(pair=>!Array.isArray(pair)||(lesson.audio?.duration_seconds>0&&pair[1]>lesson.audio.duration_seconds+.5)))throw new Error('已听区间超出音频');if(!lesson.audio&&item.audioSeconds>0)throw new Error('无音频课程不能计听课时长');return getDb().recordSample(item);});
  handle('assets',noteId=>assets(noteId));
  handle('import-asset',async target=>{
    const chosen=await dialog.showOpenDialog(getWindow(),{title:'添加笔记图片',properties:['openFile'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp']}]});if(chosen.canceled)return null;
    const note=target.lessonId?getDb().ensureCourseNote(library.get(target.lessonId).id):getDb().noteById(target.noteId);if(!note||note.deleted_at)throw new Error('笔记不存在');
    const file=chosen.filePaths[0],bytes=fs.statSync(file).size;if(bytes>25*1024*1024||getDb().assets().reduce((sum,a)=>sum+a.bytes,0)+bytes>256*1024*1024)throw new Error('图片每张最多 25 MB，个人附件合计最多 256 MB');
    const data=fs.readFileSync(file);const extension=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':data[0]===255&&data[1]===216?'jpg':data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'?'webp':null;if(!extension)throw new Error('图片格式无法识别');
    fs.mkdirSync(path.join(directory,'assets'),{recursive:true});const name=sha(data)+'-'+randomUUID().slice(0,8)+'.'+extension,destination=within(directory,path.join(directory,'assets',name));fs.writeFileSync(destination,data);
    try{return getDb().addAsset({noteId:note.id,name:path.basename(file).slice(0,200),fileName:name,sha256:sha(data),bytes});}catch(error){fs.unlinkSync(destination);throw error;}
  });
  handle('remove-asset',id=>{const asset=getDb().assets().find(a=>a.id===id);getDb().removeAsset(id);if(asset)discardedAssets.add(asset.file_name);collectAssets();});
  handle('export-notes',async options=>{if(!options||!['markdown','pdf'].includes(options.format)||options.noteIds&&(!Array.isArray(options.noteIds)||options.noteIds.length>10000))throw new Error('导出选项无效');const extension=options.format==='pdf'?'pdf':'md';const chosen=await dialog.showSaveDialog(getWindow(),{title:'导出笔记与摘录',defaultPath:`精英日课学习笔记.${extension}`,filters:[{name:extension.toUpperCase(),extensions:[extension]}]});if(chosen.canceled)return null;return exportDocument(getDb(),library,directory,chosen.filePath,options.format,options.noteIds);});
  handle('backup-now',()=>job(async()=>{if(manualBusy||automaticBusy||replacing)throw new Error('已有备份任务，请稍后重试');manualBusy=true;try{const chosen=await dialog.showSaveDialog(getWindow(),{title:'备份个人学习数据',defaultPath:`精英日课个人备份-${new Date().toISOString().slice(0,10)}.jyrk-backup`,filters:[{name:'精英日课个人备份',extensions:['jyrk-backup']}]});if(chosen.canceled)return null;return await createBackup(getDb(),directory,chosen.filePath,contentHash);}finally{manualBusy=false;}}));
  handle('restore-backup',()=>job(async()=>{if(manualBusy||replacing||automaticBusy)throw new Error('已有备份任务，请稍后重试');manualBusy=true;try{const chosen=await dialog.showOpenDialog(getWindow(),{title:'恢复个人学习备份',properties:['openFile'],filters:[{name:'精英日课个人备份',extensions:['jyrk-backup']}]});if(chosen.canceled)return null;const restored=await restoreBackup(chosen.filePaths[0],directory,contentHash,getDb(),openDatabase,async()=>{await prepareToRestore();replacing=true;});setDb(restored.store);emit({type:'data-restored'});return {beforeRestore:restored.beforeRestore,...restored.summary};}catch(error){if(error.recoveredStore)setDb(error.recoveredStore);throw error;}finally{replacing=false;manualBusy=false;}}));
  handle('backup-status',()=>({enabled:getDb().settings().autoBackup!==false,folder:path.join(directory,'backups'),files:fs.existsSync(path.join(directory,'backups'))?fs.readdirSync(path.join(directory,'backups')).filter(n=>n.endsWith('.jyrk-backup')).map(n=>({name:n,bytes:fs.statSync(path.join(directory,'backups',n)).size})).sort((a,b)=>b.name.localeCompare(a.name)):[]}));
  handle('open-backup-folder',async()=>{fs.mkdirSync(path.join(directory,'backups'),{recursive:true});const error=await shell.openPath(path.join(directory,'backups'));if(error)throw new Error(error);});
  function automatic(force=false){return job(async()=>{if(stopping||manualBusy||automaticBusy||replacing||getDb().settings().autoBackup===false||!force&&Date.now()-lastAutomatic<30*60000)return null;automaticBusy=true;try{const folder=path.join(directory,'backups');fs.mkdirSync(folder,{recursive:true});const result=await createBackup(getDb(),directory,path.join(folder,`auto-${Date.now()}.jyrk-backup`),contentHash);lastAutomatic=Date.now();const files=fs.readdirSync(folder).filter(f=>/^auto-\d+\.jyrk-backup$/.test(f)).sort().reverse();for(const extra of files.slice(7))fs.unlinkSync(within(directory,path.join(folder,extra)));return result;}finally{automaticBusy=false;}});}
  handle('automatic-backup',()=>automatic(true));
  const first=setTimeout(()=>void automatic().catch(error=>emit({type:'backup-error',message:error.message})),5000),interval=setInterval(()=>void automatic().catch(error=>emit({type:'backup-error',message:error.message})),30*60000);
  return {get replacing(){return replacing;},automatic,assets,personal(id){const asset=getDb().assets().find(a=>a.id===id);if(!asset)throw new Error('附件不存在');return {file:containedFile(directory,'assets/'+asset.file_name),type:'image/'+(path.extname(asset.file_name)==='.jpg'?'jpeg':path.extname(asset.file_name).slice(1))};},close(){stopping=true;clearTimeout(first);clearInterval(interval);},async drain(){await Promise.allSettled([...jobs]);collectAssets();}};
}
module.exports={registerLearning};
