import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=path.resolve(import.meta.dirname,'../..');
export function createDemo(root=path.join(project,'examples/course-input')) {
fs.mkdirSync(path.join(root,'入门'),{recursive:true});
const rate=8000,seconds=30,body=Buffer.alloc(rate*seconds*2);
for(let i=0;i<rate*seconds;i++)body.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/rate)*300),i*2);
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(body.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(body.length,40);
for(const file of ['01-听读入门.wav','03-仅音频.wav'])fs.writeFileSync(path.join(root,'入门',file),Buffer.concat([header,body]));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const file=path.join(project,'content-build/library/catalog.json');if(fs.existsSync(file)){const catalog=JSON.parse(fs.readFileSync(file,'utf8'));if(catalog.library_id!=='rikedesk-demo-library'&&!catalog.lessons.every(l=>l.id.startsWith('demo-')))throw new Error('已有自定义课程库，请用另一个框架副本运行演示；不会覆盖当前课程。');}createDemo();console.log('Generated self-created demo tones, not spoken course audio.');}
