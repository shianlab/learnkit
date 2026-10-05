'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),catalogFile=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'content-build/library/catalog.json');
const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
const target=process.argv[3]?path.resolve(process.argv[3]):path.join(root,'content-build/search-v1.sqlite');
const temporary=target+'.building-'+process.pid;
const db=new DatabaseSync(temporary);
let count=0;
try {
db.exec(`PRAGMA journal_mode=DELETE; CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT NOT NULL,season INTEGER NOT NULL,course_order INTEGER NOT NULL);
  CREATE TABLE paragraphs(rowid INTEGER PRIMARY KEY,lesson_id TEXT NOT NULL,block_id TEXT NOT NULL UNIQUE,ordinal INTEGER NOT NULL,text TEXT NOT NULL);
  CREATE VIRTUAL TABLE paragraph_fts USING fts5(text,content='paragraphs',content_rowid='rowid',tokenize='trigram');
  CREATE INDEX paragraph_course ON paragraphs(lesson_id,ordinal); BEGIN;`);
db.prepare('INSERT INTO metadata VALUES(?,?)').run('catalog_sha256',createHash('sha256').update(fs.readFileSync(catalogFile)).digest('hex'));
db.prepare('INSERT INTO metadata VALUES(?,?)').run('content_version',catalog.content_version);
db.prepare('INSERT INTO metadata VALUES(?,?)').run('schema_version','1');
const document=db.prepare('INSERT INTO documents VALUES(?,?,?,?)'),paragraph=db.prepare('INSERT INTO paragraphs(lesson_id,block_id,ordinal,text) VALUES(?,?,?,?)');
for(const lesson of catalog.lessons){document.run(lesson.id,lesson.title,lesson.season_id,lesson.order);for(const block of lesson.text.paragraphs){paragraph.run(lesson.id,block.block_id,block.order,block.text);count++;}}
db.exec(`COMMIT; INSERT INTO paragraph_fts(paragraph_fts) VALUES('rebuild'); INSERT INTO paragraph_fts(paragraph_fts) VALUES('optimize');`);
if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw new Error('Search index failed integrity check');
db.close();
fs.renameSync(temporary,target);
} catch(error) {try{db.close();}catch{}if(fs.existsSync(temporary))fs.unlinkSync(temporary);throw error;}
console.log(`Search index: ${catalog.lessons.length} courses, ${count} paragraphs, ${fs.statSync(target).size} bytes`);
