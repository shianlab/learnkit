import fs from 'node:fs';
import path from 'node:path';
import {packager} from '@electron/packager';
const project=path.resolve(import.meta.dirname,'../..'),app=path.join(project,'app');
const manifest=JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8'));
const config=JSON.parse(fs.readFileSync(path.join(app,'app.config.json'),'utf8'));
const library=path.join(project,'content-build/library'),search=path.join(project,'content-build/search-v1.sqlite');
if(!fs.existsSync(path.join(library,'catalog.json'))||!fs.existsSync(search))throw new Error('先导入课程资料并生成搜索索引，再打包');
const staging=path.join(project,'build/staging');
fs.mkdirSync(staging,{recursive:true});
const outRoot=path.join(project,'build/program');fs.mkdirSync(outRoot,{recursive:true});
for(const directory of [staging,outRoot]){const relative=path.relative(fs.realpathSync(project),fs.realpathSync(directory));if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Build target escapes project');}
for(const dir of ['desktop','dist']){
  const target=path.join(staging,dir);
  if(fs.existsSync(target)){
    const resolved=fs.realpathSync(target),relative=path.relative(fs.realpathSync(staging),resolved);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.lstatSync(target).isSymbolicLink())throw new Error('Staging cleanup escapes its verified directory');
    fs.rmSync(target,{recursive:true,force:true});
  }
  fs.cpSync(path.join(app,dir),target,{recursive:true});
}
fs.copyFileSync(path.join(app,'app.config.json'),path.join(staging,'app.config.json'));
fs.writeFileSync(path.join(staging,'package.json'),JSON.stringify({name:manifest.name,version:manifest.version,description:manifest.description,author:manifest.author,main:manifest.main},null,2));
const paths=await packager({dir:staging,name:'RikeDesk',appVersion:manifest.version,appCopyright:'shianlab',platform:'win32',arch:'x64',electronVersion:manifest.devDependencies.electron,
  ...(fs.existsSync(path.join(project,'tools/electron',`electron-v${manifest.devDependencies.electron}-win32-x64.zip`))?{electronZipDir:path.join(project,'tools/electron')}:{}),out:outRoot,asar:true,prune:false,overwrite:true,
  icon:path.join(app,'assets/brand.ico'),win32metadata:{ProductName:config.name,FileDescription:manifest.description,CompanyName:manifest.author,OriginalFilename:'RikeDesk.exe'}});
const output=paths[0];
fs.cpSync(library,path.join(output,'resources/library'),{recursive:true});
fs.copyFileSync(search,path.join(output,'resources/search-v1.sqlite'));
console.log('Ready to run:',path.join(output,'RikeDesk.exe'));
