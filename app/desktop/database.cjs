'use strict';
const { DatabaseSync }=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const { randomUUID }=require('node:crypto');
const { validateId }=require('./library.cjs');
const {migrateLearning,learningStore}=require('./learning-store.cjs');
function openDatabase(directory) {
  fs.mkdirSync(directory,{recursive:true});
  const location=path.join(directory,'learning.sqlite');
  const db=new DatabaseSync(location);
  const version=Object.values(db.prepare('PRAGMA user_version').get())[0];
  if(version>3){db.close();throw new Error('个人数据版本高于当前软件，请使用较新版本');}
  if(version>0&&version<3){const folder=path.join(directory,'backups');fs.mkdirSync(folder,{recursive:true});const snapshot=path.join(folder,`migration-to-3-${Date.now()}.sqlite`);db.exec(`VACUUM INTO '${snapshot.replace(/'/g,"''")}'`);}
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,lesson_id TEXT UNIQUE,content TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS progress(lesson_id TEXT PRIMARY KEY,audio_position REAL NOT NULL DEFAULT 0,read_scroll REAL NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);`);
  if(version<2){db.exec('BEGIN IMMEDIATE;');try{
    const columns=db.prepare('PRAGMA table_info(progress)').all().map(x=>x.name);
    if(!columns.includes('read_anchor'))db.exec('ALTER TABLE progress ADD COLUMN read_anchor TEXT; ALTER TABLE progress ADD COLUMN anchor_offset REAL NOT NULL DEFAULT 0;');
    db.exec('CREATE TABLE IF NOT EXISTS course_flags(lesson_id TEXT PRIMARY KEY,favorite INTEGER NOT NULL DEFAULT 0,finished INTEGER NOT NULL DEFAULT 0,started INTEGER NOT NULL DEFAULT 0); PRAGMA user_version=2; COMMIT;');
  }catch(error){db.exec('ROLLBACK;');db.close();throw error;}}
  if(version<3){try{migrateLearning(db);}catch(error){try{db.exec('ROLLBACK');}catch{}db.close();throw error;}}
  return {location,...learningStore(db),
    settings(){return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(x=>[x.key,JSON.parse(x.value)]));},
    set(key,value){if(!['theme','sidebarCollapsed','lastLesson','lastAudioLesson','playbackRate','fontSize','lineHeight','readingWidth','volume','continuousPlay','playQueue','dailyGoalMinutes','autoBackup'].includes(key))throw new Error('无效设置');
      if(key==='dailyGoalMinutes'&&(!Number.isInteger(value)||value<1||value>600))throw new Error('每日目标应为 1 到 600 分钟');
      if(key==='autoBackup'&&typeof value!=='boolean')throw new Error('自动备份设置无效');
      if(key==='theme'&&!['light','dark'].includes(value))throw new Error('无效主题');
      if(key==='sidebarCollapsed'&&typeof value!=='boolean')throw new Error('无效侧栏设置');
      if(key==='lastLesson'||key==='lastAudioLesson')validateId(value);
      if(key==='playbackRate'&&![.75,1,1.25,1.5,1.75,2].includes(value))throw new Error('无效播放速度');
      if(key==='fontSize'&&![16,18,20,22,24].includes(value))throw new Error('无效字号');
      if(key==='lineHeight'&&![1.6,1.8,2,2.2].includes(value))throw new Error('无效行距');
      if(key==='readingWidth'&&!['narrow','comfortable','wide'].includes(value))throw new Error('无效阅读宽度');
      if(key==='volume'&&(!Number.isFinite(value)||value<0||value>1))throw new Error('无效音量');
      if(key==='continuousPlay'&&typeof value!=='boolean')throw new Error('无效连续播放设置');
      if(key==='playQueue'){if(!Array.isArray(value)||value.length>100000||new Set(value).size!==value.length)throw new Error('无效播放队列');value.forEach(validateId);}
      db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));},
    note(id){validateId(id);const n=db.prepare('SELECT * FROM notes WHERE lesson_id=? AND deleted_at IS NULL').get(id);return n?{...n,tags:JSON.parse(n.tags)}:null;},
    notes(){return db.prepare('SELECT * FROM notes WHERE lesson_id IS NOT NULL AND deleted_at IS NULL ORDER BY updated_at DESC').all().map(n=>({...n,tags:JSON.parse(n.tags)}));},
    saveNote(id,content){validateId(id);if(typeof content!=='string'||content.length>200000)throw new Error('笔记长度无效');
      const previous=db.prepare('SELECT * FROM notes WHERE lesson_id=?').get(id),stamp=new Date().toISOString();
      if(!content.trim()&&!db.prepare('SELECT 1 FROM personal_assets WHERE note_id=?').get(previous?.id||'')){if(previous)db.prepare('UPDATE notes SET content=?,deleted_at=?,updated_at=? WHERE id=?').run(content,stamp,stamp,previous.id);return null;}
      db.prepare('INSERT INTO notes(id,lesson_id,content,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at,deleted_at=NULL').run(previous?.id||randomUUID(),id,content,previous?.created_at||stamp,stamp);
      return this.note(id);},
    progress(id){validateId(id);return db.prepare('SELECT * FROM progress WHERE lesson_id=?').get(id)||null;},
    saveProgress(id,position,scroll,anchor=null,offset=0){validateId(id);if(!Number.isFinite(position)||position<0||!Number.isFinite(scroll)||scroll<0||!Number.isFinite(offset)||offset<0||offset>1||(anchor!==null&&(typeof anchor!=='string'||!anchor.startsWith(id+'-b')||anchor.length>120)))throw new Error('无效学习位置');
      db.prepare('INSERT INTO progress(lesson_id,audio_position,read_scroll,updated_at,read_anchor,anchor_offset) VALUES(?,?,?,?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET audio_position=excluded.audio_position,read_scroll=excluded.read_scroll,updated_at=excluded.updated_at,read_anchor=excluded.read_anchor,anchor_offset=excluded.anchor_offset').run(id,position,scroll,new Date().toISOString(),anchor,offset);},
    flags(){return db.prepare(`SELECT ids.lesson_id,COALESCE(f.favorite,0) AS favorite,COALESCE(f.finished,0) AS finished,
      CASE WHEN COALESCE(f.started,0)=1 OR COALESCE(p.audio_position,0)>0 OR COALESCE(p.read_scroll,0)>0 OR n.id IS NOT NULL THEN 1 ELSE 0 END AS started
      FROM (SELECT lesson_id FROM course_flags UNION SELECT lesson_id FROM progress UNION SELECT lesson_id FROM notes WHERE lesson_id IS NOT NULL AND deleted_at IS NULL) ids
      LEFT JOIN course_flags f USING(lesson_id) LEFT JOIN progress p USING(lesson_id) LEFT JOIN notes n ON n.lesson_id=ids.lesson_id AND n.deleted_at IS NULL`).all();},
    flag(id,key,value){validateId(id);if(!['favorite','finished','started'].includes(key)||typeof value!=='boolean')throw new Error('无效课程状态');
      db.prepare('INSERT INTO course_flags(lesson_id) VALUES(?) ON CONFLICT DO NOTHING').run(id);
      db.prepare(`UPDATE course_flags SET ${key}=? WHERE lesson_id=?`).run(value?1:0,id);return this.flags().find(x=>x.lesson_id===id);},
    recent(){return db.prepare('SELECT * FROM progress ORDER BY updated_at DESC LIMIT 6').all();},
    close(){db.close();}
  };
}
module.exports={openDatabase};
