'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const {createHash}=require('node:crypto');

function containedFile(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(x => x === '..' || x === '')) throw new Error('无效资源路径');
  const resolvedRoot = fs.realpathSync(root);
  const resolved = fs.realpathSync(path.resolve(root, relative));
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.statSync(resolved).isFile()) throw new Error('资源不在允许的目录内');
  return resolved;
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) throw new Error('无效课程编号');
  return id;
}

function loadLibrary(root) {
  const catalog = JSON.parse(fs.readFileSync(containedFile(root, 'catalog.json'), 'utf8'));
  const map = new Map(catalog.lessons.map(row => [row.id, row]));
  if (map.size !== catalog.lessons.length || !catalog.lessons.length) throw new Error('课程目录不完整');
  for (const row of catalog.lessons) validateId(row.id);
  const get = id => { const row = map.get(validateId(id)); if (!row) throw new Error('课程不存在'); return row; };
  const summaries = catalog.lessons.map(row => ({ id:row.id,author:row.author||catalog.author||'',season:row.season_id,seasonName:row.season_name,order:row.order,title:row.title,
    date:row.published_date,dateVerified:!!row.date_verified,topic:row.topic,kind:row.kind,
    textStatus:row.text.status,audio:row.audio ? {duration:row.audio.duration_seconds,format:row.audio.format,url:`jyrk://audio/${row.id}`} : null,
    attachmentCount:row.text.attachments?.length || 0,duplicateOf:row.duplicate_content_of || null }));
  return { catalog, summaries, get,
    detail(id) {
      const row=get(id);
      const text=fs.readFileSync(containedFile(root,row.text.path));
      if(text.length!==row.text.bytes||createHash('sha256').update(text).digest('hex')!==row.text.sha256)throw new Error('正文资源校验失败，请重新生成课程库');
      return { ...summaries.find(x => x.id === id),markdown:text.toString('utf8'),
        blocks:row.text.paragraphs.map(p=>({id:p.block_id,order:p.order,text:p.text})),
        statusNote:row.text.status_note || '',attachments:(row.text.attachments||[]).map((a,i)=>({url:`jyrk://image/${id}/${i}`,width:a.width,height:a.height})) };
    },
    media(host, urlPath) {
      const [id,index,...extra]=urlPath.split('/').filter(Boolean);
      const row=get(id);
      if (host==='audio' && index===undefined && !extra.length && row.audio) return {file:containedFile(root,row.audio.path),type:({mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac'})[row.audio.format]||'application/octet-stream'};
      if (host==='image' && /^\d{1,3}$/.test(index||'') && !extra.length) {
        const item=row.text.attachments?.[Number(index)];
        if(item)return {file:containedFile(root,item.path),type:({'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'})[path.extname(item.path).toLowerCase()]||'application/octet-stream'};
      }
      throw new Error('资源不存在');
    }
  };
}

function parseRange(range, size) {
  if (!range) return { start:0,end:size-1,partial:false };
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  let start,end;
  if (!match[1]) { const suffix=Number(match[2]); if(suffix<=0)return null; start=Math.max(0,size-suffix);end=size-1; }
  else {start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start<0||end<start)return null;
  return {start,end,partial:true};
}

function fileResponse(file, type, request, extra={}) {
  const size=fs.statSync(file).size;
  const range=parseRange(request.headers.get('range'),size);
  const headers={ 'Content-Type':type,'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'jyrk://app','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',...extra };
  if (!range) return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  headers['Content-Length']=String(range.end-range.start+1);
  if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${size}`;
  if(request.method==='HEAD')return new Response(null,{status:range.partial?206:200,headers});
  const stream=fs.createReadStream(file,{start:range.start,end:range.end});
  request.signal.addEventListener('abort',()=>stream.destroy(),{once:true});
  return new Response(Readable.toWeb(stream),{status:range.partial?206:200,headers});
}
module.exports={containedFile,validateId,loadLibrary,parseRange,fileResponse};
