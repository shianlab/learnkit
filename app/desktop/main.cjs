'use strict';
const {app,BrowserWindow,protocol,session,ipcMain,dialog,Menu,powerMonitor}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {loadLibrary,containedFile,fileResponse}=require('./library.cjs');
const {openDatabase}=require('./database.cjs');
const {openSearch}=require('./search.cjs');
const {createSleepTimer}=require('./sleep-timer.cjs');
const {registerLearning}=require('./learning-services.cjs');
const {createHash}=require('node:crypto');
const {openVersionedDatabase}=require('./upgrade.cjs');

const config=require('../app.config.json');
if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,100}$/.test(config.appId))throw new Error('应用标识无效');
app.setName(config.name);
app.setPath('userData',path.join(app.getPath('appData'),config.appId));
app.setAppUserModelId(config.appId);
const verifyDir=process.argv.find(x=>x.startsWith('--verification-data='));
if(verifyDir)app.setPath('userData',path.resolve(verifyDir.split('=').slice(1).join('=')));
if(!app.requestSingleInstanceLock()){app.quit();return;}
app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}});
protocol.registerSchemesAsPrivileged([{scheme:'jyrk',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
const CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' jyrk: data:; media-src jyrk:; connect-src 'self' jyrk:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
let win,db,library,search,timer,services,allowClose=false,closeFallback,quitDraining=false,quitReady=false;
function emit(payload){if(win&&!win.isDestroyed())win.webContents.send('jyrk:runtime-event',payload);}
function senderAllowed(event) {
  try {const u=new URL(event.senderFrame.url);return u.protocol==='jyrk:'&&u.hostname==='app'&&event.sender===win?.webContents&&event.senderFrame===event.sender.mainFrame;}catch{return false;}
}
function prepareToRestore(){return new Promise((resolve,reject)=>{const listener=(event,error)=>{if(!senderAllowed(event))return;clearTimeout(timeout);ipcMain.removeListener('jyrk:restore-ready',listener);if(error)reject(new Error('当前编辑尚未保存，恢复已停止'));else resolve();};const timeout=setTimeout(()=>{ipcMain.removeListener('jyrk:restore-ready',listener);reject(new Error('无法保存当前编辑，恢复已停止'));},10000);ipcMain.on('jyrk:restore-ready',listener);win.webContents.send('jyrk:prepare-restore');});}
function handle(name,fn){ipcMain.handle(`jyrk:${name}`,(event,...args)=>{if(!senderAllowed(event))throw new Error('不允许的页面');if(services?.replacing&&name!=='diagnostics')throw new Error('正在恢复数据，请稍候');return fn(...args);});}

app.whenReady().then(async()=>{
  const libraryRoot=app.isPackaged?path.join(process.resourcesPath,'library'):path.resolve(__dirname,'../../content-build/library');
  library=loadLibrary(libraryRoot);
  if(!verifyDir)app.setPath('userData',path.join(app.getPath('appData'),config.appId,createHash('sha256').update(library.catalog.library_id).digest('hex').slice(0,16)));
  const searchFile=app.isPackaged?path.join(process.resourcesPath,'search-v1.sqlite'):path.resolve(__dirname,'../../content-build/search-v1.sqlite');
  search=openSearch(searchFile,path.join(libraryRoot,'catalog.json'));
  const contentHash=createHash('sha256').update(config.appId+':'+library.catalog.library_id).digest('hex');
  const opened=await openVersionedDatabase(app.getPath('userData'),app.getVersion(),contentHash,openDatabase);db=opened.store;
  timer=createSleepTimer(emit);
  powerMonitor.on('suspend',()=>emit({type:'suspend'}));
  powerMonitor.on('resume',()=>{timer.check();emit({type:'resume',timer:timer.snapshot()});});
  const uiRoot=path.resolve(__dirname,'../dist');
  protocol.handle('jyrk',request=>{
    try {
      const u=new URL(request.url);
      if(!['GET','HEAD'].includes(request.method)||(u.search&&!(u.hostname==='audio'&&/^\?retry=\d{1,13}$/.test(u.search)))||u.username||u.password)throw new Error('不允许的资源请求');
      if(u.hostname==='app'){
        const relative=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';
        const file=containedFile(uiRoot,relative);
        return fileResponse(file,mime[path.extname(file)]||'application/octet-stream',request,{'Content-Security-Policy':CSP});
      }
      const media=u.hostname==='personal'?services.personal(decodeURIComponent(u.pathname).slice(1)):library.media(u.hostname,decodeURIComponent(u.pathname));
      return fileResponse(media.file,media.type,request);
    }catch{return new Response('Resource unavailable',{status:404,headers:{'Content-Type':'text/plain'}});}
  });
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','file://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
  handle('bootstrap',()=>({lessons:library.summaries,settings:db.settings(),recent:db.recent(),flags:db.flags(),version:app.getVersion(),contentVersion:library.catalog.content_version}));
  handle('lesson',id=>library.detail(id));
  handle('note',id=>{library.get(id);return db.note(id);});
  handle('notes',()=>db.notes());
  handle('save-note',(id,content)=>{library.get(id);return db.saveNote(id,content);});
  handle('setting',(key,value)=>{if(key==='lastLesson')library.get(value);if(key==='lastAudioLesson'&&!library.get(value).audio)throw new Error('该课程没有音频');if(key==='playQueue'){if(!Array.isArray(value))throw new Error('无效播放队列');for(const id of value)if(!library.get(id).audio)throw new Error('播放队列仅能加入现有音频课程');}return db.set(key,value);});
  handle('search',options=>search.search(options,db.allNotes()));
  handle('flags',()=>db.flags());
  handle('flag',(id,key,value)=>{library.get(id);return db.flag(id,key,value);});
  handle('sleep-timer',()=>timer.snapshot());
  handle('set-sleep-timer',options=>timer.set(options));
  handle('lesson-ended',()=>timer.lessonEnded());
  handle('progress',id=>{library.get(id);return db.progress(id);});
  handle('audio-metadata',(id,duration)=>{const row=library.get(id);if(!row.audio||!Number.isFinite(duration)||duration<=0||duration>604800)throw new Error('音频时长无效');row.audio.duration_seconds=duration;return duration;});
  handle('save-progress',(id,position,scroll,anchor=null,offset=0)=>{const l=library.get(id);if((!l.audio&&position>0)||(l.audio?.duration_seconds>0&&position>l.audio.duration_seconds+1))throw new Error('超出音频长度');if(anchor!==null&&!l.text.paragraphs.some(p=>p.block_id===anchor))throw new Error('无效阅读锚点');return db.saveProgress(id,position,scroll,anchor,offset);});
  handle('diagnostics',()=>({packaged:app.isPackaged,libraryRoot,searchFile,searchMetadata:search.metadata,dataDirectory:app.getPath('userData'),database:db.location,versions:process.versions,resourcesPath:process.resourcesPath,lessonCount:library.summaries.length,security:{contextIsolation:true,nodeIntegration:false,sandbox:true,remoteRequestsBlocked:true}}));
  services=registerLearning({handle,getDb:()=>db,setDb:value=>{db=value;},library,getWindow:()=>win,directory:app.getPath('userData'),contentHash,emit,openDatabase,prepareToRestore});
  win=new BrowserWindow({width:1440,height:930,minWidth:860,minHeight:650,title:config.name,backgroundColor:'#f8f7f3',
    icon:path.join(uiRoot,'brand.png'),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(e,url)=>{if(url!=='jyrk://app/index.html')e.preventDefault();});
  win.webContents.on('will-attach-webview',e=>e.preventDefault());
  ipcMain.on('jyrk:close-ready',event=>{if(senderAllowed(event)){clearTimeout(closeFallback);allowClose=true;win.close();}});
  win.on('close',event=>{if(allowClose)return;event.preventDefault();win.webContents.send('jyrk:prepare-close');clearTimeout(closeFallback);closeFallback=setTimeout(()=>{allowClose=true;win.close();},2500);});
  win.once('ready-to-show',()=>win.show());
  await win.loadURL('jyrk://app/index.html');
}).catch(error=>{dialog.showErrorBox(config.name+'暂时无法打开','请运行资料导入和索引生成命令，并保留个人数据。\n'+error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(!services||quitReady)return;event.preventDefault();if(quitDraining)return;quitDraining=true;services.close();services.drain().finally(()=>{quitReady=true;app.quit();});});
app.on('will-quit',()=>{clearTimeout(closeFallback);services?.close();timer?.close();search?.close();db?.close();db=null;});
