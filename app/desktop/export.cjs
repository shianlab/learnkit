'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {BrowserWindow}=require('electron');
const {randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {within}=require('./backup.cjs');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function entries(store,library,noteIds){
  const selected=noteIds?new Set(noteIds):null;
  const notes=store.allNotes().filter(n=>!selected||selected.has(n.id)).map(n=>{
    const id=n.lesson_id||n.source_lesson,lesson=id?library.get(id):null;
    return {id:n.id,title:n.title||lesson?.title||'课程笔记',content:n.content,quote:n.source_quote,tags:n.tags,source:lesson?`${lesson.season_name} · ${lesson.title} · ${lesson.id}${n.source_block?' · '+n.source_block:''}`:'独立笔记',updated:n.updated_at,assets:store.assets(n.id)};
  });
  if(!selected)for(const a of store.raw.prepare('SELECT * FROM annotations WHERE deleted_at IS NULL ORDER BY created_at').all()){
    const lesson=library.get(a.lesson_id);notes.push({id:a.id,title:'摘录与批注 · '+lesson.title,content:a.comment,quote:a.quote,tags:[],source:`${lesson.season_name} · ${lesson.title} · ${lesson.id} · ${a.block_id}`,updated:a.updated_at,assets:[]});
  }
  if(!notes.length)throw new Error('暂无笔记或摘录可以导出');return notes;
}
async function exportDocument(store,library,directory,destination,format,noteIds){
  const items=entries(store,library,noteIds),title=items.length===1?items[0].title:'日课书桌 · 我的笔记与摘录';
  if(format==='markdown'){
    const assetDirectory=path.join(path.dirname(destination),path.basename(destination,path.extname(destination))+'-attachments');
    const sections=items.map(item=>{
      const images=item.assets.map(asset=>{fs.mkdirSync(assetDirectory,{recursive:true});fs.copyFileSync(within(directory,path.join(directory,'assets',asset.file_name)),path.join(assetDirectory,asset.file_name));return `![${asset.name.replace(/[\[\]]/g,'')}](${path.basename(assetDirectory)}/${asset.file_name})`;});
      return `## ${item.title}\n\n出处：${item.source}\n\n更新：${item.updated}\n\n${item.tags.length?'标签：'+item.tags.join('、')+'\n\n':''}${item.quote?'### 摘录\n\n'+item.quote.split('\n').map(line=>'> '+line).join('\n')+'\n\n':''}${item.content}\n\n${images.join('\n\n')}`;
    });
    fs.writeFileSync(destination,'# '+title+'\n\n'+sections.join('\n\n---\n\n')+'\n','utf8');
  }else if(format==='pdf'){
    const localFont=fs.readFileSync(path.resolve(__dirname,'../dist/fonts/JyrkStudySans-Regular.ttf')).toString('base64');
    const localBold=fs.readFileSync(path.resolve(__dirname,'../dist/fonts/JyrkStudySans-Bold.ttf')).toString('base64');
    const html=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; script-src 'none'"><title>${escape(title)}</title><style>@font-face{font-family:JyrkSans;src:url(data:font/ttf;base64,${localFont}) format('truetype');font-weight:100 500}@font-face{font-family:JyrkSans;src:url(data:font/ttf;base64,${localBold}) format('truetype');font-weight:600 900}@page{size:A4;margin:22mm 18mm 24mm}body{font-family:JyrkSans,'Microsoft YaHei',sans-serif;color:#272c25;font-size:11pt;line-height:1.8}h1{font-size:23pt;color:#b95528;margin:0 0 8mm}h2{font-size:16pt;line-height:1.5;break-after:avoid;margin:0 0 4mm}section{break-before:page}section:first-of-type{break-before:auto}.source{font-size:9pt;color:#686d64;overflow-wrap:anywhere;margin:0 0 6mm}.content{white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}blockquote{border-left:3px solid #c36437;padding:3mm 5mm;margin:5mm 0;white-space:pre-wrap;overflow-wrap:anywhere;background:#faf4ed}img{display:block;max-width:100%;max-height:190mm;margin:5mm auto;break-inside:avoid}.asset-name{font-size:9pt;color:#686d64}</style></head><body><h1>${escape(title)}</h1><p class="source">日课书桌 · 个人学习记录 · ${escape(new Date().toLocaleDateString('zh-CN'))}</p>${items.map(item=>`<section><h2>${escape(item.title)}</h2><p class="source">出处：${escape(item.source)}<br>更新：${escape(item.updated)}${item.tags.length?'<br>标签：'+escape(item.tags.join('、')):''}</p>${item.quote?`<blockquote>${escape(item.quote)}</blockquote>`:''}<div class="content">${escape(item.content)}</div>${item.assets.map(asset=>{const data=fs.readFileSync(within(directory,path.join(directory,'assets',asset.file_name)));const extension=path.extname(asset.file_name).slice(1);return `<img alt="${escape(asset.name)}" src="data:image/${extension==='jpg'?'jpeg':extension};base64,${data.toString('base64')}"><p class="asset-name">${escape(asset.name)}</p>`;}).join('')}</section>`).join('')}</body></html>`;
    const temporary=within(directory,path.join(directory,`print-${randomUUID()}.html`));fs.writeFileSync(temporary,html,'utf8');
    const window=new BrowserWindow({show:false,width:900,height:1200,webPreferences:{partition:'print-'+randomUUID(),sandbox:true,nodeIntegration:false,contextIsolation:true,javascript:false}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','file://*/*','ws://*/*','wss://*/*']},(request,callback)=>callback({cancel:request.url!==pathToFileURL(temporary).href}));
    try{await window.loadFile(temporary);const data=await window.webContents.printToPDF({pageSize:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:'<div style="font-size:9px;width:100%;text-align:center;color:#777"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',generateTaggedPDF:true});fs.writeFileSync(destination,data);}finally{window.destroy();if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }else throw new Error('导出格式无效');
  return {file:destination,bytes:fs.statSync(destination).size,entries:items.length};
}
module.exports={exportDocument,entries};
