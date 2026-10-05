import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createDemo} from './create-demo.mjs';
import {importLibrary} from './import-library.mjs';
const project=path.resolve(import.meta.dirname,'../..'),fixture=path.join(project,'build/test-fixture'),input=path.join(fixture,'input');
fs.mkdirSync(input,{recursive:true});
const source=path.join(project,'examples/course-input');
for(const file of ['courses.json','入门/01-听读入门.md','入门/02-仅文稿.md','进阶/01-持续学习.txt']){const target=path.join(input,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,file),target);}
createDemo(input);
await importLibrary({input,output:path.join(fixture,'library'),mapping:path.join(input,'courses.json'),libraryId:'rikedesk-test-library',reportFile:path.join(fixture,'report.json')});
for(const args of [[path.join(project,'app/scripts/prepare-assets.mjs')],[path.join(project,'app/scripts/build-search.cjs'),path.join(fixture,'library/catalog.json'),path.join(fixture,'search-v1.sqlite')]]){const result=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});if(result.status!==0)throw new Error('Test fixture generation failed');}
