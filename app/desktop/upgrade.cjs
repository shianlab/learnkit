'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync,backup}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const {createBackup}=require('./backup.cjs');

function compareVersions(a,b){
  const left=a.split('.').map(Number),right=b.split('.').map(Number);
  for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]>right[i]?1:-1;
  return 0;
}

// Run before opening/migrating personal data. The Electron profile lock is held.
async function openVersionedDatabase(directory,version,contentHash,openDatabase){
  if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('软件版本格式无效');
  fs.mkdirSync(directory,{recursive:true});
  const file=path.join(directory,'learning.sqlite'),marker=path.join(directory,'app-version.json');
  let previous=null;
  if(fs.existsSync(marker)){
    previous=JSON.parse(fs.readFileSync(marker,'utf8'));
    if(!/^\d+\.\d+\.\d+$/.test(previous.version))throw new Error('个人数据版本记录损坏，请保留数据并查看恢复说明');
    if(compareVersions(previous.version,version)>0)throw new Error('这份个人数据已由较新版本使用，请安装相同或更新版本');
  }
  let rawSnapshot=null,personalBackup=null,schema=null;
  if(fs.existsSync(file)&&previous?.version!==version){
    const source=new DatabaseSync(file,{readOnly:true});
    try{
      schema=Object.values(source.prepare('PRAGMA user_version').get())[0];
      if(schema>3)throw new Error('个人数据结构较新，请使用较新版本软件');
      if(Object.values(source.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw new Error('个人数据库校验失败，请保留原文件并从备份恢复');
      const folder=path.join(directory,'backups');fs.mkdirSync(folder,{recursive:true});
      const prefix=`before-version-${version}-${Date.now()}-${randomUUID().slice(0,8)}`;
      rawSnapshot=path.join(folder,prefix+'.sqlite');
      await backup(source,rawSnapshot);
      if(schema===3){
        personalBackup=path.join(folder,prefix+'.jyrk-backup');
        await createBackup({raw:source},directory,personalBackup,contentHash);
      }
    }finally{source.close();}
  }
  let store;
  try{
    store=openDatabase(directory);
    const pending=marker+'.partial-'+randomUUID();
    try{fs.writeFileSync(pending,JSON.stringify({version,updatedAt:new Date().toISOString(),previousVersion:previous?.version||null,rawSnapshot,personalBackup},null,2));fs.renameSync(pending,marker);}
    finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
    return {store,upgrade:{from:previous?.version||null,to:version,schema,rawSnapshot,personalBackup}};
  }catch(error){
    store?.close();
    if(rawSnapshot){
      try{
        // Migrations have closed their connection on failure. Restore the consistent
        // snapshot, then discard WAL belonging to the unsuccessful new database.
        fs.copyFileSync(rawSnapshot,file);
        for(const suffix of ['-wal','-shm'])if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix);
      }catch(rollbackError){throw new Error(`升级未完成，自动回退失败。请关闭软件并保留 ${rawSnapshot}。${rollbackError.message}`);}
      throw new Error(`升级未完成，个人数据已回退。升级前备份：${rawSnapshot}。${error.message}`);
    }
    throw error;
  }
}
module.exports={openVersionedDatabase,compareVersions};
