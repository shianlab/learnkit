'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync,backup}=require('node:sqlite');
const {createHash,randomUUID}=require('node:crypto');
const MAX_BYTES=800*1024*1024;
const sha=value=>createHash('sha256').update(value).digest('hex');
function within(root,file){const relative=path.relative(fs.realpathSync(root),path.resolve(file));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('个人数据路径越界');return file;}
function readVerified(file){if(fs.statSync(file).size>MAX_BYTES)throw new Error('备份文件过大');return fs.readFileSync(file);}
function validateDatabase(file){
  const db=new DatabaseSync(file,{readOnly:true});try{
    db.exec('PRAGMA trusted_schema=OFF');
    const version=Object.values(db.prepare('PRAGMA user_version').get())[0];
    if(version!==3)throw new Error('备份数据版本不兼容，请使用对应版本软件');
    if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw new Error('备份数据库校验失败');
    const columns={settings:'key,value',notes:'id,lesson_id,content,created_at,updated_at,title,kind,tags,source_lesson,source_block,source_quote,deleted_at',progress:'lesson_id,audio_position,read_scroll,updated_at,read_anchor,anchor_offset',course_flags:'lesson_id,favorite,finished,started',annotations:'id,lesson_id,block_id,quote,start_offset,end_offset,prefix,suffix,comment,color,source_sha,created_at,updated_at,deleted_at',bookmarks:'id,lesson_id,kind,block_id,audio_position,label,created_at',review_cards:'id,question,answer,lesson_id,block_id,audio_position,note_id,annotation_id,source_quote,due_day,interval_days,repetitions,lapses,paused,last_rating,created_at,updated_at',review_events:'id,card_id,rating,reviewed_at,day,interval_before,interval_after,due_before,due_after',plans:'id,name,lesson_ids,daily_limit,start_day,end_day,paused,created_at,updated_at',learning_samples:'session_id,sequence,lesson_id,day,started_at,audio_seconds,read_seconds,total_seconds',heard_coverage:'lesson_id,intervals',personal_assets:'id,note_id,name,file_name,sha256,bytes,created_at'};
    for(const entry of db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all())if(entry.type!=='index'&&(entry.type!=='table'||!columns[entry.name]||!/^[\s]*CREATE TABLE /i.test(entry.sql)))throw new Error('备份数据库结构不受支持');
    for(const [table,expected] of Object.entries(columns))if(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name).join(',')!==expected)throw new Error('备份数据库字段不匹配');
    for(const [table,column] of [['settings','value'],['notes','tags'],['plans','lesson_ids'],['heard_coverage','intervals']])if(db.prepare(`SELECT 1 FROM ${table} WHERE NOT json_valid(${column}) LIMIT 1`).get())throw new Error('备份中的个人数据格式无效');
    if(db.prepare('SELECT 1 FROM personal_assets a LEFT JOIN notes n ON n.id=a.note_id WHERE n.id IS NULL LIMIT 1').get())throw new Error('备份附件缺少对应笔记');
    const assets=db.prepare('SELECT * FROM personal_assets').all();
    return {version,assets,notes:db.prepare('SELECT count(*) AS count FROM notes WHERE deleted_at IS NULL').get().count,cards:db.prepare('SELECT count(*) AS count FROM review_cards').get().count};
  }finally{db.close();}
}
async function createBackup(store,directory,destination,contentHash){
  fs.mkdirSync(path.join(directory,'backups'),{recursive:true});
  const temp=within(directory,path.join(directory,'backups',`snapshot-${randomUUID()}.sqlite`));
  try{
    await backup(store.raw,temp);
    const summary=validateDatabase(temp),database=readVerified(temp),assets=[];let bytes=database.length;
    for(const asset of summary.assets){
      if(!/^[a-f0-9]{64}(?:-[a-f0-9]{8})?\.(png|jpg|webp)$/.test(asset.file_name))throw new Error('附件路径无效');
      const file=within(directory,path.join(directory,'assets',asset.file_name));
      if(!fs.realpathSync(file).startsWith(fs.realpathSync(path.join(directory,'assets'))+path.sep))throw new Error('附件路径越界');
      const data=readVerified(file);if(data.length!==asset.bytes||sha(data)!==asset.sha256)throw new Error('个人附件缺失或校验失败');
      bytes+=data.length;if(bytes>512*1024*1024)throw new Error('个人备份超过 512 MB，请减少附件后重试');
      assets.push({name:asset.file_name,bytes:data.length,sha256:sha(data),data:data.toString('base64')});
    }
    const record={format:'jyrk-personal-backup',formatVersion:1,databaseVersion:3,createdAt:new Date().toISOString(),contentHash,database:{bytes:database.length,sha256:sha(database),data:database.toString('base64')},assets};
    const output=JSON.stringify(record);if(Buffer.byteLength(output)>MAX_BYTES)throw new Error('个人备份过大');
    const pending=destination+'.partial-'+randomUUID();try{fs.writeFileSync(pending,output,'utf8');fs.renameSync(pending,destination);}finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
    return {file:destination,bytes:fs.statSync(destination).size,notes:summary.notes,cards:summary.cards,assets:assets.length,sha256:sha(Buffer.from(output))};
  }finally{for(const file of [temp,temp+'-wal',temp+'-shm'])if(fs.existsSync(file))fs.unlinkSync(within(directory,file));}
}
function prepareRestore(file,directory,contentHash){
  const record=JSON.parse(readVerified(file).toString('utf8'));
  if(record.format!=='jyrk-personal-backup'||record.formatVersion!==1||record.databaseVersion!==3||record.contentHash!==contentHash)throw new Error('备份格式、版本或课程库不匹配；当前数据未更改');
  if(!record.database||!Array.isArray(record.assets)||record.assets.length>2000)throw new Error('备份结构无效');
  const data=Buffer.from(record.database.data,'base64');if(data.length!==record.database.bytes||sha(data)!==record.database.sha256)throw new Error('备份数据库 SHA256 错误；当前数据未更改');
  const staging=within(directory,path.join(directory,`restore-staging-${randomUUID()}`));fs.mkdirSync(path.join(staging,'assets'),{recursive:true});
  try{
    fs.writeFileSync(path.join(staging,'learning.sqlite'),data);
    const summary=validateDatabase(path.join(staging,'learning.sqlite')),expected=new Map(summary.assets.map(a=>[a.file_name,a])),seen=new Set();
    for(const asset of record.assets){
      if(!/^[a-f0-9]{64}(?:-[a-f0-9]{8})?\.(png|jpg|webp)$/.test(asset.name)||seen.has(asset.name)||!expected.has(asset.name))throw new Error('备份附件清单无效');
      const bytes=Buffer.from(asset.data,'base64'),original=expected.get(asset.name);if(bytes.length!==asset.bytes||bytes.length!==original.bytes||sha(bytes)!==asset.sha256||sha(bytes)!==original.sha256)throw new Error('备份附件 SHA256 错误');
      fs.writeFileSync(path.join(staging,'assets',asset.name),bytes);seen.add(asset.name);
    }
    if(seen.size!==expected.size)throw new Error('备份缺少个人附件');
    return {staging,summary,record};
  }catch(error){fs.rmSync(within(directory,staging),{recursive:true,force:true});throw error;}
}
async function restoreBackup(file,directory,contentHash,current,getDatabase,beforeReplace=async()=>{}){
  const prepared=prepareRestore(file,directory,contentHash);
  const pre=path.join(directory,'backups',`before-restore-${Date.now()}.jyrk-backup`);
  let closed=false,oldMoved=false,newMoved=false,assetsMoved=false,replacement;
  const oldFile=within(directory,path.join(directory,`restore-rollback-${randomUUID()}.sqlite`)),oldAssets=within(directory,path.join(directory,`restore-assets-${randomUUID()}`));
  try{
    await beforeReplace();await createBackup(current,directory,pre,contentHash);current.close();closed=true;
    fs.renameSync(within(directory,path.join(directory,'learning.sqlite')),oldFile);oldMoved=true;
    if(fs.existsSync(path.join(directory,'assets'))){fs.renameSync(within(directory,path.join(directory,'assets')),oldAssets);assetsMoved=true;}
    fs.renameSync(path.join(prepared.staging,'learning.sqlite'),path.join(directory,'learning.sqlite'));newMoved=true;
    fs.renameSync(path.join(prepared.staging,'assets'),path.join(directory,'assets'));
    replacement=getDatabase(directory);replacement.raw.prepare('PRAGMA integrity_check').get();
    fs.unlinkSync(oldFile);if(assetsMoved)fs.rmSync(within(directory,oldAssets),{recursive:true,force:true});
    return {store:replacement,beforeRestore:pre,summary:prepared.summary};
  }catch(error){
    if(closed){if(replacement)replacement.close();if(newMoved&&fs.existsSync(path.join(directory,'learning.sqlite')))fs.unlinkSync(within(directory,path.join(directory,'learning.sqlite')));if(oldMoved)fs.renameSync(oldFile,path.join(directory,'learning.sqlite'));if(newMoved&&fs.existsSync(path.join(directory,'assets')))fs.rmSync(within(directory,path.join(directory,'assets')),{recursive:true,force:true});if(assetsMoved)fs.renameSync(oldAssets,path.join(directory,'assets'));error.recoveredStore=getDatabase(directory);}
    throw error;
  }finally{if(fs.existsSync(prepared.staging))fs.rmSync(within(directory,prepared.staging),{recursive:true,force:true});}
}
module.exports={createBackup,prepareRestore,restoreBackup,validateDatabase,sha,within};
