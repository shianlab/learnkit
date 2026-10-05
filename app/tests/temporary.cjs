'use strict';
const fs=require('node:fs'),path=require('node:path'),{after}=require('node:test');
const workspace=fs.realpathSync(path.resolve(__dirname,'../..'));
const base=path.join(workspace,'build/test-data');fs.mkdirSync(base,{recursive:true});
const parent=fs.realpathSync(base),owned=[];
if(!parent.startsWith(workspace+path.sep)||fs.lstatSync(base).isSymbolicLink())throw new Error('Test base escapes workspace');
function temporaryDirectory(label){
  if(!/^[a-z0-9-]+$/i.test(label))throw new Error('Invalid fixture label');
  const directory=fs.mkdtempSync(path.join(parent,'jyrk-test-'+label+'-'));owned.push(directory);return directory;
}
after(()=>{for(const directory of owned){const resolved=fs.realpathSync(directory);if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('jyrk-test-')||fs.lstatSync(directory).isSymbolicLink())throw new Error('Fixture cleanup escapes temporary directory');fs.rmSync(resolved,{recursive:true,force:true});}});
const {DatabaseSync}=require('node:sqlite');
function legacyDatabase(){const directory=temporaryDirectory('legacy-fixture'),file=path.join(directory,'legacy.sqlite');const db=new DatabaseSync(file);db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE notes(id TEXT PRIMARY KEY,lesson_id TEXT UNIQUE,content TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE TABLE progress(lesson_id TEXT PRIMARY KEY,audio_position REAL NOT NULL DEFAULT 0,read_scroll REAL NOT NULL DEFAULT 0,updated_at TEXT NOT NULL, read_anchor TEXT, anchor_offset REAL NOT NULL DEFAULT 0);CREATE TABLE course_flags(lesson_id TEXT PRIMARY KEY,favorite INTEGER NOT NULL DEFAULT 0,finished INTEGER NOT NULL DEFAULT 0,started INTEGER NOT NULL DEFAULT 0); PRAGMA user_version=2;');db.prepare('INSERT INTO notes VALUES(?,?,?,?,?)').run('synthetic-note','demo-intro','自制迁移样本，保留笔记和位置。','old','old');db.prepare('INSERT INTO progress VALUES(?,?,?,?,?,?)').run('demo-intro',5,20,'old',null,0);db.prepare('INSERT INTO settings VALUES(?,?)').run('theme',JSON.stringify('dark'));db.close();return file;}
module.exports={temporaryDirectory,legacyDatabase};
