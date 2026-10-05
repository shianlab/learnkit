'use strict';
const {randomUUID}=require('node:crypto');
const {validateId}=require('./library.cjs');
const stamp=()=>new Date().toISOString();
const day=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function validDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||day(new Date(value+'T12:00:00'))!==value)throw new Error('日期无效');return value;}
function shiftDay(value,count){validDay(value);const d=new Date(value+'T12:00:00');d.setDate(d.getDate()+count);return day(d);}
function text(value,max=200000){if(typeof value!=='string'||value.length>max)throw new Error('文字长度无效');return value;}
function tags(value=[]){if(!Array.isArray(value)||value.length>20)throw new Error('最多 20 个标签');return [...new Set(value.map(v=>text(v,30).trim()).filter(Boolean))];}
function migrateLearning(db){
  db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT '';
    ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'course';
    ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE notes ADD COLUMN source_lesson TEXT;
    ALTER TABLE notes ADD COLUMN source_block TEXT;
    ALTER TABLE notes ADD COLUMN source_quote TEXT NOT NULL DEFAULT '';
    ALTER TABLE notes ADD COLUMN deleted_at TEXT;
    CREATE TABLE annotations(id TEXT PRIMARY KEY,lesson_id TEXT NOT NULL,block_id TEXT NOT NULL,quote TEXT NOT NULL,start_offset INTEGER NOT NULL,end_offset INTEGER NOT NULL,prefix TEXT NOT NULL,suffix TEXT NOT NULL,comment TEXT NOT NULL,color TEXT NOT NULL,source_sha TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE bookmarks(id TEXT PRIMARY KEY,lesson_id TEXT NOT NULL,kind TEXT NOT NULL,block_id TEXT,audio_position REAL,label TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE review_cards(id TEXT PRIMARY KEY,question TEXT NOT NULL,answer TEXT NOT NULL,lesson_id TEXT,block_id TEXT,audio_position REAL,note_id TEXT,annotation_id TEXT,source_quote TEXT NOT NULL,due_day TEXT NOT NULL,interval_days INTEGER NOT NULL DEFAULT 0,repetitions INTEGER NOT NULL DEFAULT 0,lapses INTEGER NOT NULL DEFAULT 0,paused INTEGER NOT NULL DEFAULT 0,last_rating TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE review_events(id TEXT PRIMARY KEY,card_id TEXT NOT NULL,rating TEXT NOT NULL,reviewed_at TEXT NOT NULL,day TEXT NOT NULL,interval_before INTEGER NOT NULL,interval_after INTEGER NOT NULL,due_before TEXT NOT NULL,due_after TEXT NOT NULL);
    CREATE TABLE plans(id TEXT PRIMARY KEY,name TEXT NOT NULL,lesson_ids TEXT NOT NULL,daily_limit INTEGER NOT NULL,start_day TEXT NOT NULL,end_day TEXT,paused INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE learning_samples(session_id TEXT NOT NULL,sequence INTEGER NOT NULL,lesson_id TEXT NOT NULL,day TEXT NOT NULL,started_at TEXT NOT NULL,audio_seconds REAL NOT NULL,read_seconds REAL NOT NULL,total_seconds REAL NOT NULL,PRIMARY KEY(session_id,sequence));
    CREATE TABLE heard_coverage(lesson_id TEXT PRIMARY KEY,intervals TEXT NOT NULL);
    CREATE TABLE personal_assets(id TEXT PRIMARY KEY,note_id TEXT NOT NULL,name TEXT NOT NULL,file_name TEXT NOT NULL UNIQUE,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL,created_at TEXT NOT NULL);
    PRAGMA user_version=3; COMMIT;`);
}
function mergeIntervals(previous,added){
  const result=[];
  for(const [a,b] of [...previous,...added].sort((x,y)=>x[0]-y[0])){
    const tail=result.at(-1);if(tail&&a<=tail[1]+.05)tail[1]=Math.max(tail[1],b);else result.push([a,b]);
  }return result;
}
function learningStore(db){
  const hydrate=row=>row?{...row,tags:JSON.parse(row.tags)}:null;
  const noteById=id=>hydrate(db.prepare('SELECT * FROM notes WHERE id=?').get(text(id,100)));
  const getCard=id=>{const row=db.prepare('SELECT * FROM review_cards WHERE id=?').get(text(id,100));if(!row)throw new Error('复习卡不存在');return row;};
  function transaction(action){db.exec('BEGIN IMMEDIATE');try{const value=action();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
  return {
    noteById,
    allNotes(deleted=false){return db.prepare(`SELECT * FROM notes WHERE deleted_at IS ${deleted?'NOT ':''}NULL ORDER BY updated_at DESC`).all().map(hydrate);},
    editNote(options){
      if(!options||!['free','excerpt','course'].includes(options.kind))throw new Error('笔记类型无效');
      const existing=options.id?noteById(options.id):null;if(options.id&&!existing)throw new Error('笔记不存在');
      const title=text(options.title||'',200).trim(),content=text(options.content||''),labels=tags(options.tags);
      if(options.kind!=='course'&&!title)throw new Error('请填写笔记标题');
      if(existing&&existing.kind!==options.kind)throw new Error('不能更改笔记类型');
      const id=existing?.id||randomUUID(),when=stamp(),source=options.sourceLesson||existing?.source_lesson||null;
      if(source)validateId(source);
      if(!existing&&options.kind==='course')throw new Error('请从课程页创建课程笔记');
      db.prepare(`INSERT INTO notes(id,lesson_id,content,created_at,updated_at,title,kind,tags,source_lesson,source_block,source_quote,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)
        ON CONFLICT(id) DO UPDATE SET content=excluded.content,title=excluded.title,tags=excluded.tags,updated_at=excluded.updated_at`).run(id,existing?.lesson_id||null,content,existing?.created_at||when,when,title,options.kind,JSON.stringify(labels),source,options.sourceBlock||existing?.source_block||null,text(options.sourceQuote??existing?.source_quote??'',10000));
      return noteById(id);
    },
    trashNote(id,restore=false){const n=noteById(id);if(!n)throw new Error('笔记不存在');db.prepare('UPDATE notes SET deleted_at=?,updated_at=? WHERE id=?').run(restore?null:stamp(),stamp(),id);return noteById(id);},
    ensureCourseNote(lessonId){validateId(lessonId);let n=hydrate(db.prepare('SELECT * FROM notes WHERE lesson_id=?').get(lessonId));if(!n){const when=stamp();db.prepare('INSERT INTO notes(id,lesson_id,content,created_at,updated_at) VALUES(?,?,?,?,?)').run(randomUUID(),lessonId,'',when,when);n=hydrate(db.prepare('SELECT * FROM notes WHERE lesson_id=?').get(lessonId));}else if(n.deleted_at){db.prepare('UPDATE notes SET deleted_at=NULL WHERE id=?').run(n.id);n=noteById(n.id);}return n;},
    annotations(lessonId,deleted=false){validateId(lessonId);return db.prepare(`SELECT * FROM annotations WHERE lesson_id=? AND deleted_at IS ${deleted?'NOT ':''}NULL ORDER BY created_at`).all(lessonId);},
    addAnnotations(items){if(!Array.isArray(items)||!items.length||items.length>100)throw new Error('划线数量无效');return transaction(()=>items.map(item=>{const id=randomUUID(),when=stamp();validateId(item.lessonId);if(!['yellow','green','blue'].includes(item.color))throw new Error('划线颜色无效');if(!Number.isInteger(item.start)||!Number.isInteger(item.end)||item.start<0||item.end<=item.start)throw new Error('划线位置无效');db.prepare('INSERT INTO annotations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)').run(id,item.lessonId,text(item.blockId,120),text(item.quote,10000),item.start,item.end,text(item.prefix||'',100),text(item.suffix||'',100),text(item.comment||'',10000),item.color,text(item.sourceSha,64),when,when);return db.prepare('SELECT * FROM annotations WHERE id=?').get(id);}));},
    editAnnotation(id,comment,color){text(comment,10000);if(!['yellow','green','blue'].includes(color))throw new Error('划线颜色无效');db.prepare('UPDATE annotations SET comment=?,color=?,updated_at=? WHERE id=? AND deleted_at IS NULL').run(comment,color,stamp(),text(id,100));},
    trashAnnotation(id,restore=false){const result=db.prepare('UPDATE annotations SET deleted_at=?,updated_at=? WHERE id=?').run(restore?null:stamp(),stamp(),text(id,100));if(!result.changes)throw new Error('划线不存在');},
    bookmarks(lessonId=null){if(lessonId)validateId(lessonId);return db.prepare('SELECT * FROM bookmarks WHERE (? IS NULL OR lesson_id=?) ORDER BY created_at DESC').all(lessonId,lessonId);},
    addBookmark(item){validateId(item.lessonId);if(!['paragraph','audio'].includes(item.kind))throw new Error('书签类型无效');const id=randomUUID();db.prepare('INSERT INTO bookmarks VALUES(?,?,?,?,?,?,?)').run(id,item.lessonId,item.kind,item.blockId||null,item.position??null,text(item.label||'学习书签',200),stamp());return db.prepare('SELECT * FROM bookmarks WHERE id=?').get(id);},
    removeBookmark(id){db.prepare('DELETE FROM bookmarks WHERE id=?').run(text(id,100));},
    cards(){return db.prepare('SELECT * FROM review_cards ORDER BY paused,due_day,created_at').all();},
    saveCard(item){const old=item.id?getCard(item.id):null;const question=text(item.question,5000).trim(),answer=text(item.answer);if(!question)throw new Error('请填写复习问题');const due=validDay(item.dueDay||old?.due_day||day()),id=old?.id||randomUUID(),when=stamp();const source=item.lessonId||old?.lesson_id||null;if(source)validateId(source);
      db.prepare(`INSERT INTO review_cards(id,question,answer,lesson_id,block_id,audio_position,note_id,annotation_id,source_quote,due_day,paused,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET question=excluded.question,answer=excluded.answer,due_day=excluded.due_day,paused=excluded.paused,updated_at=excluded.updated_at`).run(id,question,answer,source,item.blockId||old?.block_id||null,item.audioPosition??old?.audio_position??null,item.noteId||old?.note_id||null,item.annotationId||old?.annotation_id||null,text(item.sourceQuote??old?.source_quote??'',10000),due,item.paused?1:0,old?.created_at||when,when);return getCard(id);},
    rateCard(id,rating,today=day()){validDay(today);if(!['again','hard','good','easy'].includes(rating))throw new Error('复习反馈无效');return transaction(()=>{const card=getCard(id);if(card.paused)throw new Error('请先恢复这张卡片');if(card.due_day>today)throw new Error('卡片尚未到期，可先修改安排');const before=card.interval_days;
      const interval=rating==='again'?1:rating==='hard'?Math.max(1,Math.round(before*1.2)):rating==='good'?(before===0?1:before===1?3:Math.max(7,Math.round(before*2))):(before===0?4:Math.max(4,Math.round(before*2.5)));
      const due=shiftDay(today,Math.min(interval,365)),when=stamp();db.prepare('UPDATE review_cards SET interval_days=?,repetitions=repetitions+1,lapses=lapses+?,due_day=?,last_rating=?,updated_at=? WHERE id=?').run(interval,rating==='again'?1:0,due,rating,when,id);db.prepare('INSERT INTO review_events VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,rating,when,today,before,interval,card.due_day,due);return getCard(id);});},
    savePlan(item){if(!Array.isArray(item.lessonIds)||!item.lessonIds.length||item.lessonIds.length>100000||new Set(item.lessonIds).size!==item.lessonIds.length)throw new Error('请至少选择一篇课程');item.lessonIds.forEach(validateId);const name=text(item.name,100).trim();if(!name||!Number.isInteger(item.dailyLimit)||item.dailyLimit<1||item.dailyLimit>50)throw new Error('计划名称或每天篇数无效');const start=validDay(item.startDay),end=item.endDay?validDay(item.endDay):null;if(end&&end<start)throw new Error('结束日期不能早于开始日期');const old=item.id?db.prepare('SELECT * FROM plans WHERE id=?').get(text(item.id,100)):null;if(item.id&&!old)throw new Error('计划不存在');const id=old?.id||randomUUID(),when=stamp();db.prepare(`INSERT INTO plans VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,lesson_ids=excluded.lesson_ids,daily_limit=excluded.daily_limit,start_day=excluded.start_day,end_day=excluded.end_day,paused=excluded.paused,updated_at=excluded.updated_at`).run(id,name,JSON.stringify(item.lessonIds),item.dailyLimit,start,end,item.paused?1:0,old?.created_at||when,when);return id;},
    plans(){return db.prepare('SELECT * FROM plans ORDER BY created_at DESC').all().map(p=>({...p,lesson_ids:JSON.parse(p.lesson_ids)}));},
    removedPlans(){const rows=JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('removedPlans')?.value||'[]');return rows.map(row=>({...row,lesson_ids:JSON.parse(row.lesson_ids)}));},
    removePlan(id){return transaction(()=>{const row=db.prepare('SELECT * FROM plans WHERE id=?').get(text(id,100));if(!row)throw new Error('计划不存在');const removed=JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('removedPlans')?.value||'[]');removed.push({...row,deleted_at:stamp()});db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('removedPlans',JSON.stringify(removed));db.prepare('DELETE FROM plans WHERE id=?').run(id);});},
    restorePlan(id){return transaction(()=>{text(id,100);if(db.prepare('SELECT id FROM plans WHERE id=?').get(id))throw new Error('计划已存在，不能覆盖');const removed=JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('removedPlans')?.value||'[]'),row=removed.find(p=>p.id===id);if(!row)throw new Error('已删除计划不存在');const newId=this.savePlan({name:row.name,lessonIds:JSON.parse(row.lesson_ids),dailyLimit:row.daily_limit,startDay:row.start_day,endDay:row.end_day,paused:!!row.paused});db.prepare('UPDATE plans SET id=?,created_at=? WHERE id=?').run(id,text(row.created_at,40),newId);db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(removed.filter(p=>p.id!==id)),'removedPlans');return id;});},
    recordSample(item){validateId(item.lessonId);validDay(item.day);text(item.sessionId,100);if(!Number.isInteger(item.sequence)||item.sequence<0||!Number.isFinite(Date.parse(item.startedAt)))throw new Error('计时标记无效');for(const n of [item.audioSeconds,item.readSeconds,item.totalSeconds])if(!Number.isFinite(n)||n<0||n>15)throw new Error('计时超出有效范围');if(item.totalSeconds+.01<Math.max(item.audioSeconds,item.readSeconds)||item.totalSeconds>item.audioSeconds+item.readSeconds+.01)throw new Error('听读计时应排除重叠');if(!Array.isArray(item.intervals)||item.intervals.length>30)throw new Error('已听区间无效');for(const pair of item.intervals)if(!Array.isArray(pair)||pair.length!==2||!pair.every(Number.isFinite)||pair[0]<0||pair[1]<=pair[0])throw new Error('已听区间无效');return transaction(()=>{const inserted=db.prepare('INSERT OR IGNORE INTO learning_samples VALUES(?,?,?,?,?,?,?,?)').run(item.sessionId,item.sequence,item.lessonId,item.day,item.startedAt,item.audioSeconds,item.readSeconds,item.totalSeconds).changes;if(!inserted)return false;if(item.intervals.length){const old=db.prepare('SELECT intervals FROM heard_coverage WHERE lesson_id=?').get(item.lessonId);const merged=mergeIntervals(old?JSON.parse(old.intervals):[],item.intervals);db.prepare('INSERT INTO heard_coverage VALUES(?,?) ON CONFLICT(lesson_id) DO UPDATE SET intervals=excluded.intervals').run(item.lessonId,JSON.stringify(merged));}return true;});},
    studyData(today=day()){validDay(today);const from=shiftDay(today,-6);return {today,days:db.prepare("SELECT day,SUM(audio_seconds) audio_seconds,SUM(read_seconds) read_seconds,SUM(total_seconds) total_seconds FROM (SELECT day,session_id,SUM(audio_seconds) audio_seconds,SUM(read_seconds) read_seconds,MAX(total_seconds) total_seconds FROM learning_samples WHERE day BETWEEN ? AND ? GROUP BY day,session_id,CASE WHEN session_id LIKE 'parallel-v1:%' THEN sequence/2 ELSE sequence END) GROUP BY day ORDER BY day").all(from,today),courses:db.prepare('SELECT day,lesson_id,SUM(audio_seconds) audio_seconds,SUM(read_seconds) read_seconds,SUM(total_seconds) total_seconds FROM learning_samples WHERE day BETWEEN ? AND ? GROUP BY day,lesson_id ORDER BY day DESC,total_seconds DESC').all(from,today),coverage:db.prepare('SELECT * FROM heard_coverage').all().map(r=>({lesson_id:r.lesson_id,intervals:JSON.parse(r.intervals)})),reviews:db.prepare('SELECT * FROM review_events WHERE day BETWEEN ? AND ? ORDER BY reviewed_at DESC').all(from,today),plans:this.plans(),cards:this.cards()};},
    assets(noteId=null){return db.prepare('SELECT * FROM personal_assets WHERE (? IS NULL OR note_id=?) ORDER BY created_at').all(noteId,noteId);},
    addAsset(item){const note=noteById(item.noteId);if(!note||note.deleted_at)throw new Error('笔记不存在');const id=randomUUID();db.prepare('INSERT INTO personal_assets VALUES(?,?,?,?,?,?,?)').run(id,item.noteId,text(item.name,200),text(item.fileName,100),text(item.sha256,64),item.bytes,stamp());return db.prepare('SELECT * FROM personal_assets WHERE id=?').get(id);},
    removeAsset(id){db.prepare('DELETE FROM personal_assets WHERE id=?').run(text(id,100));},
    raw:db
  };
}
module.exports={migrateLearning,learningStore,day,validDay,shiftDay,mergeIntervals};
