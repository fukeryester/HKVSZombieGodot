import fs from 'node:fs';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const version='4.7.2';
const url=`https://github.com/godotengine/godot-builds/releases/download/${version}-stable/Godot_v${version}-stable_export_templates.tpz`;
const dest=path.join(process.env.APPDATA,'Godot','export_templates',version+'.stable');
const headers=execFileSync('curl.exe',['-sSI',url],{encoding:'utf8'});
const target=/^location:\s*(.+)$/im.exec(headers)?.[1].trim()||url;
const assetHeaders=execFileSync('curl.exe',['-sSI',target],{encoding:'utf8'});
const length=Number(/^content-length:\s*(\d+)/im.exec(assetHeaders)?.[1]);
async function range(start,end){if(start<0){start=length+start;end=length-1;}return execFileSync('curl.exe',['-fsSL','--retry','3','--max-time','240','--range',`${start}-${end??''}`,target],{maxBuffer:200*1024*1024});}
const tail=await range(-65557);let eocd=tail.length-22;while(eocd>=0&&tail.readUInt32LE(eocd)!==0x06054b50)eocd--;if(eocd<0)throw Error('Missing ZIP directory');
const size=tail.readUInt32LE(eocd+12),offset=tail.readUInt32LE(eocd+16),directory=await range(offset,offset+size-1);const entries=[];
for(let p=0;p<directory.length;){if(directory.readUInt32LE(p)!==0x02014b50)break;const n=directory.readUInt16LE(p+28),x=directory.readUInt16LE(p+30),c=directory.readUInt16LE(p+32),name=directory.subarray(p+46,p+46+n).toString();if(/\/(web_(nothreads_)?(debug|release)\.zip|windows_(debug|release)_x86_64\.exe|version\.txt)$/.test(name))entries.push({name:path.basename(name),method:directory.readUInt16LE(p+10),size:directory.readUInt32LE(p+20),offset:directory.readUInt32LE(p+42)});p+=46+n+x+c;}
fs.mkdirSync(dest,{recursive:true});
for(const e of entries){if(fs.existsSync(path.join(dest,e.name))){console.log('Available '+e.name);continue;}const head=await range(e.offset,e.offset+29),start=e.offset+30+head.readUInt16LE(26)+head.readUInt16LE(28),compressed=await range(start,start+e.size-1);const data=e.method===8?inflateRawSync(compressed):compressed;fs.writeFileSync(path.join(dest,e.name),data);console.log(`Installed ${e.name} (${data.length} bytes)`);}
if(entries.length<4)throw Error('Expected Windows and Web templates');
