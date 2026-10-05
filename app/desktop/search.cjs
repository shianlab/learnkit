'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
function queryText(value){if(typeof value!=='string'||value.length>100)throw new Error('关键词最多 100 个字符');return value.normalize('NFC').trim();}
function excerpt(text,query){const index=text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());const start=Math.max(0,index-45);return (start?'…':'')+text.slice(start,start+160)+(text.length>start+160?'…':'');}
function openSearch(file,catalogFile){
  const db=new DatabaseSync(file,{readOnly:true});
  const meta=Object.fromEntries(db.prepare('SELECT key,value FROM metadata').all().map(x=>[x.key,x.value]));
  if(meta.catalog_sha256!==createHash('sha256').update(fs.readFileSync(catalogFile)).digest('hex')){db.close();throw new Error('搜索索引与课程版本不一致，请运行 npm run build:search 重建索引');}
  return {metadata:meta,
    search(options,notes=[]){
      if(!options||typeof options!=='object')throw new Error('无效搜索参数');
      const q=queryText(options.query),scope=options.scope||'all',season=options.season||0,page=options.page||0,pageSize=20;
      if(!['all','title','body','notes'].includes(scope)||!Number.isInteger(season)||season<0||season>100000||!Number.isInteger(page)||page<0||page>10000)throw new Error('无效搜索筛选');
      if(!q)return {query:q,total:0,page,pageSize,results:[]};
      const matches=new Map(),docs=db.prepare('SELECT * FROM documents WHERE (?=0 OR season=?)').all(season,season),allowed=new Map(docs.map(x=>[x.id,x]));
      const add=(id,source,text,blockId=null,rank=2)=>{const doc=allowed.get(id);if(!doc)return;const previous=matches.get(id);if(!previous||rank<previous.rank)matches.set(id,{id,title:doc.title,season:doc.season,source,blockId,snippet:excerpt(text,q),rank,order:doc.course_order});};
      if(['all','title'].includes(scope))for(const doc of docs)if(doc.title.toLocaleLowerCase().includes(q.toLocaleLowerCase()))add(doc.id,'title',doc.title,null,0);
      if(['all','body'].includes(scope)){
        const long=[...q].length>=3;
        const sql=long?`SELECT p.lesson_id,p.block_id,p.text,p.ordinal FROM paragraph_fts f JOIN paragraphs p ON p.rowid=f.rowid WHERE paragraph_fts MATCH ? ORDER BY p.ordinal`:`SELECT lesson_id,block_id,text,ordinal FROM paragraphs WHERE instr(lower(text),lower(?))>0 ORDER BY ordinal`;
        const term=long?'"'+q.replace(/"/g,'""')+'"':q;
        for(const p of db.prepare(sql).all(term))add(p.lesson_id,'body',p.text,p.block_id,1);
      }
      if(['all','notes'].includes(scope))for(const n of notes){const value=[n.title||'',n.content,n.source_quote||'',...(n.tags||[])].join('\n');if(!value.toLocaleLowerCase().includes(q.toLocaleLowerCase()))continue;if(n.lesson_id)add(n.lesson_id,'notes',value,null,2);else if(n.id){const doc=n.source_lesson?allowed.get(n.source_lesson):null;if(season&&!doc)continue;matches.set('note-'+n.id,{id:'note-'+n.id,noteId:n.id,title:n.title||'独立笔记',season:doc?.season||0,source:'notes',blockId:n.source_block||null,snippet:excerpt(value,q),rank:2,order:doc?.course_order||0});}}
      const results=[...matches.values()].sort((a,b)=>a.rank-b.rank||a.season-b.season||a.order-b.order);
      return {query:q,total:results.length,page,pageSize,results:results.slice(page*pageSize,(page+1)*pageSize)};
    },close(){db.close();}
  };
}
module.exports={openSearch,queryText};
