'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openDatabase}=require('../desktop/database.cjs');
const {createBackup,restoreBackup,sha}=require('../desktop/backup.cjs');
const {temporaryDirectory,legacyDatabase}=require('./temporary.cjs');
const {openVersionedDatabase}=require('../desktop/upgrade.cjs');
const catalogFile=path.resolve(__dirname,'../../build/test-fixture/library/catalog.json'),hash=sha(fs.readFileSync(catalogFile)),lesson=JSON.parse(fs.readFileSync(catalogFile)).lessons.find(l=>l.id==='demo-intro');

test('deleted plans and annotations survive restart and backup, restore their IDs and source links',async()=>{
  const source=temporaryDirectory('iteration1-source'),target=temporaryDirectory('iteration1-target');let db=openDatabase(source),restored=openDatabase(target);
  try{
    const id=db.savePlan({name:'自选课程',lessonIds:['demo-intro','demo-text'],dailyLimit:2,startDay:'2026-10-05',paused:true}),original=db.plans()[0];
    const block=lesson.text.paragraphs.find(b=>b.text.length>10),a=db.addAnnotations([{lessonId:lesson.id,blockId:block.block_id,quote:block.text.slice(0,8),start:0,end:8,color:'blue',comment:'原批注',sourceSha:lesson.text.sha256}])[0];
    const card=db.saveCard({question:'原问题',answer:'自己的理解',lessonId:lesson.id,annotationId:a.id,sourceQuote:a.quote});db.flag(lesson.id,'finished',true);
    db.removePlan(id);db.trashAnnotation(a.id);assert.equal(db.plans().length,0);assert.equal(db.annotations(lesson.id).length,0);assert.throws(()=>db.removePlan(id));assert.equal(db.removedPlans().length,1);
    db.close();db=openDatabase(source);assert.equal(db.removedPlans()[0].id,id);assert.equal(db.annotations(lesson.id,true)[0].comment,'原批注');
    const file=path.join(source,'deleted.jyrk-backup');await createBackup(db,source,file,hash);restored=(await restoreBackup(file,target,hash,restored,openDatabase)).store;
    restored.restorePlan(id);restored.trashAnnotation(a.id,true);const recovered=restored.plans()[0];for(const key of ['id','name','lesson_ids','daily_limit','start_day','end_day','paused','created_at'])assert.deepEqual(recovered[key],original[key],key);
    assert.equal(restored.removedPlans().length,0);assert.equal(restored.annotations(lesson.id)[0].quote,a.quote);assert.equal(restored.cards().find(c=>c.id===card.id).annotation_id,a.id);assert.ok(restored.flags().find(f=>f.lesson_id===lesson.id).finished);
    assert.throws(()=>restored.restorePlan(id));assert.deepEqual(restored.plans()[0],recovered);
  }finally{db.close();restored.close();}
});

test('malformed deleted-plan contents cannot partially restore or overwrite existing plans',()=>{
  const db=openDatabase(temporaryDirectory('iteration1-invalid'));try{
    const id=db.savePlan({name:'原计划',lessonIds:['demo-intro'],dailyLimit:1,startDay:'2026-10-05'});db.removePlan(id);
    const rows=JSON.parse(db.raw.prepare("SELECT value FROM settings WHERE key='removedPlans'").get().value);rows[0].daily_limit=999;db.raw.prepare("UPDATE settings SET value=? WHERE key='removedPlans'").run(JSON.stringify(rows));
    assert.throws(()=>db.restorePlan(id));assert.equal(db.plans().length,0);assert.equal(db.removedPlans().length,1);assert.throws(()=>db.set('removedPlans',[]));
  }finally{db.close();}
});

test('restore preparation runs only after valid backup checks, and a failed flush preserves current data',async()=>{
  const source=temporaryDirectory('iteration1-flush-source'),target=temporaryDirectory('iteration1-flush-target');const src=openDatabase(source);let current=openDatabase(target);try{
    const file=path.join(source,'valid.jyrk-backup');await createBackup(src,source,file,hash);const note=current.editNote({kind:'free',title:'当前记录',content:'必须保留',tags:[]});let calls=0;
    const bad=path.join(source,'invalid.jyrk-backup');fs.writeFileSync(bad,'not a backup');await assert.rejects(()=>restoreBackup(bad,target,hash,current,openDatabase,async()=>{calls++;}));assert.equal(calls,0);
    await assert.rejects(()=>restoreBackup(file,target,hash,current,openDatabase,async()=>{calls++;throw new Error('flush failed');}),/flush failed/);assert.equal(calls,1);assert.equal(current.noteById(note.id).content,'必须保留');assert.ok(!fs.readdirSync(target).some(f=>f.startsWith('restore-staging-')));
    current=(await restoreBackup(file,target,hash,current,openDatabase,async()=>{calls++;current.editNote({id:note.id,kind:'free',title:note.title,content:'恢复前已提交',tags:[]});})).store;assert.equal(calls,2);assert.equal(current.allNotes().length,0);
  }finally{src.close();current.close();}
});

test('0.1.0 personal records upgrade to 0.1.1 with a complete pre-upgrade backup',async()=>{
  const directory=temporaryDirectory('iteration1-upgrade');let db=(await openVersionedDatabase(directory,'0.1.0',hash,openDatabase)).store;
  try{
    const note=db.editNote({kind:'free',title:'旧版个人笔记',content:'升级后仍保留',tags:['旧版']}),plan=db.savePlan({name:'原计划',lessonIds:['demo-intro'],dailyLimit:1,startDay:'2026-10-05'});db.saveProgress('demo-intro',33,90,null,0);db.set('lastAudioLesson','demo-intro');db.close();
    const upgraded=await openVersionedDatabase(directory,'0.1.1',hash,openDatabase);db=upgraded.store;assert.equal(upgraded.upgrade.from,'0.1.0');assert.ok(fs.existsSync(upgraded.upgrade.personalBackup));assert.equal(db.noteById(note.id).content,note.content);assert.equal(db.plans()[0].id,plan);assert.equal(db.progress('demo-intro').audio_position,33);assert.equal(db.settings().lastAudioLesson,'demo-intro');
    const marker=JSON.parse(fs.readFileSync(path.join(directory,'app-version.json')));assert.equal(marker.version,'0.1.1');db.removePlan(plan);db.restorePlan(plan);assert.equal(db.plans()[0].id,plan);
  }finally{db.close();}
});
