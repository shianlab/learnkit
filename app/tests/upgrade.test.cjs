'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {openVersionedDatabase}=require('../desktop/upgrade.cjs');
const {openDatabase}=require('../desktop/database.cjs');
const {sha,prepareRestore}=require('../desktop/backup.cjs');
const root=path.resolve(__dirname,'../..'),hash=sha(fs.readFileSync(path.join(root,'build/test-fixture/library/catalog.json')));
const {temporaryDirectory,legacyDatabase}=require('./temporary.cjs');
const fixture=temporaryDirectory;
function rows(db){return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(t=>[t.name,db.prepare(`SELECT * FROM ${t.name} ORDER BY rowid`).all()]));}
test('new profile starts empty and same-version restarts do not create duplicate upgrade backups',async()=>{
  const dir=fixture('new');let result=await openVersionedDatabase(dir,'0.5.0',hash,openDatabase);assert.equal(result.store.allNotes().length,0);result.store.close();result=await openVersionedDatabase(dir,'0.5.0',hash,openDatabase);assert.equal(result.upgrade.rawSnapshot,null);result.store.close();
});
test('existing older data and image get a restorable full backup before any new-version writes',async()=>{
  const dir=fixture('upgrade');let db=openDatabase(dir);const note=db.editNote({kind:'free',title:'升级前中文',content:'必须完整保留',tags:['升级']});
  const image=fs.readFileSync(path.join(root,'app/public/brand.png')),name=sha(image)+'-1234abcd.png';fs.mkdirSync(path.join(dir,'assets'));fs.writeFileSync(path.join(dir,'assets',name),image);db.addAsset({noteId:note.id,name:'图片.png',fileName:name,sha256:sha(image),bytes:image.length});const before=rows(db.raw);db.close();
  const result=await openVersionedDatabase(dir,'0.5.0',hash,openDatabase);assert.deepEqual(rows(result.store.raw),before);result.store.close();const prepared=prepareRestore(result.upgrade.personalBackup,dir,hash);assert.equal(prepared.summary.assets.length,1);assert.equal(prepared.summary.notes,1);const copy=new DatabaseSync(result.upgrade.rawSnapshot,{readOnly:true});assert.deepEqual(rows(copy),before);copy.close();
});
test('failed migration rolls back database and leaves version marker unchanged with a retained pre-upgrade snapshot',async()=>{
  const dir=fixture('rollback');let db=openDatabase(dir);db.saveNote('demo-intro','迁移前哨兵');const before=rows(db.raw);db.close();
  await assert.rejects(openVersionedDatabase(dir,'0.5.0',hash,d=>{const broken=openDatabase(d);broken.saveNote('demo-intro','错误修改');broken.close();throw new Error('injected migration failure');}),/个人数据已回退/);
  const restored=new DatabaseSync(path.join(dir,'learning.sqlite'));assert.deepEqual(rows(restored),before);restored.close();assert.equal(fs.existsSync(path.join(dir,'app-version.json')),false);assert.ok(fs.readdirSync(path.join(dir,'backups')).some(n=>n.endsWith('.jyrk-backup')));
});
test('missing image fails before migration or version update and preserves original database bytes',async()=>{
  const dir=fixture('missing-asset');const db=openDatabase(dir);const n=db.editNote({kind:'free',title:'附件缺失',content:'不要改写',tags:[]});db.addAsset({noteId:n.id,name:'丢失.png',fileName:'a'.repeat(64)+'-1234abcd.png',sha256:'a'.repeat(64),bytes:9});db.close();const before=sha(fs.readFileSync(path.join(dir,'learning.sqlite')));let called=false;
  await assert.rejects(openVersionedDatabase(dir,'0.5.0',hash,()=>{called=true;}));assert.equal(called,false);assert.equal(sha(fs.readFileSync(path.join(dir,'learning.sqlite'))),before);assert.equal(fs.existsSync(path.join(dir,'app-version.json')),false);
});
test('newer software and future database schemas are refused before modifying personal data',async()=>{
  const dir=fixture('future');const db=openDatabase(dir);db.saveNote('demo-intro','未来版本哨兵');db.close();fs.writeFileSync(path.join(dir,'app-version.json'),JSON.stringify({version:'0.6.0'}));const before=sha(fs.readFileSync(path.join(dir,'learning.sqlite')));await assert.rejects(openVersionedDatabase(dir,'0.5.0',hash,openDatabase),/较新版本/);assert.equal(sha(fs.readFileSync(path.join(dir,'learning.sqlite'))),before);
  fs.unlinkSync(path.join(dir,'app-version.json'));const future=new DatabaseSync(path.join(dir,'learning.sqlite'));future.exec('PRAGMA user_version=99');future.close();await assert.rejects(openVersionedDatabase(dir,'0.5.0',hash,openDatabase),/结构较新/);
});
test('synthetic old schema migrates after a readable legacy snapshot, preserving note IDs and positions',async()=>{
  const previous=legacyDatabase();const dir=fixture('legacy');fs.copyFileSync(previous,path.join(dir,'learning.sqlite'));
  const old=new DatabaseSync(path.join(dir,'learning.sqlite'));const notes=old.prepare('SELECT id,lesson_id,content FROM notes').all(),progress=old.prepare('SELECT * FROM progress').all();old.close();const result=await openVersionedDatabase(dir,'0.5.0',hash,openDatabase);assert.deepEqual(result.store.raw.prepare('SELECT id,lesson_id,content FROM notes').all(),notes);assert.deepEqual(result.store.raw.prepare('SELECT * FROM progress').all(),progress);result.store.close();const snapshot=new DatabaseSync(result.upgrade.rawSnapshot,{readOnly:true});assert.equal(Object.values(snapshot.prepare('PRAGMA user_version').get())[0],2);snapshot.close();
});
