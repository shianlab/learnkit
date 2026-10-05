// Generate an original book icon only when local branding is absent.
// No image dependency; PNG compression uses Node's built-in zlib.
import fs from 'node:fs';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
const app=path.resolve(import.meta.dirname,'..'),pngFile=path.join(app,'public/brand.png'),icoFile=path.join(app,'assets/brand.ico');
if(!fs.existsSync(pngFile)||!fs.existsSync(icoFile)){
  const size=256,raw=Buffer.alloc((size*4+1)*size),bg=[250,238,229,255];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){let color=bg;
    if(x>=42&&x<=213&&y>=51&&y<=211)color=[198,92,47,255];
    if(x>=53&&x<=124&&y>=62&&y<=196||x>=132&&x<=202&&y>=62&&y<=196)color=[255,252,247,255];
    if((x>=67&&x<=110||x>=145&&x<=188)&&[88,112,136,160].some(line=>y>=line&&y<line+5))color=[225,172,146,255];
    const offset=y*(size*4+1)+1+x*4;raw.set(color,offset);
  }
  function crc(data){let result=0xffffffff;for(const byte of data){result^=byte;for(let bit=0;bit<8;bit++)result=(result>>>1)^((result&1)?0xedb88320:0);}return (result^0xffffffff)>>>0;}
  function chunk(name,data){const body=Buffer.concat([Buffer.from(name),data]),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);body.copy(result,4);result.writeUInt32BE(crc(body),result.length-4);return result;}
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  if(!fs.existsSync(pngFile)){fs.mkdirSync(path.dirname(pngFile),{recursive:true});fs.writeFileSync(pngFile,png);}
  if(!fs.existsSync(icoFile)){const icon=Buffer.alloc(22);icon.writeUInt16LE(1,2);icon.writeUInt16LE(1,4);icon.writeUInt16LE(1,10);icon.writeUInt16LE(32,12);icon.writeUInt32LE(png.length,14);icon.writeUInt32LE(22,18);fs.mkdirSync(path.dirname(icoFile),{recursive:true});fs.writeFileSync(icoFile,Buffer.concat([icon,png]));}
}
