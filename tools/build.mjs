import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {CORE} from '../runtime/desktop.mjs';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const local=fs.existsSync('tools/local.json')?JSON.parse(fs.readFileSync('tools/local.json')):{};
const godot=process.env.GODOT_BIN||local.godot||'godot';
const target=process.argv[2]||'all';
function run(args){const r=spawnSync(godot,args,{cwd:root,encoding:'utf8',maxBuffer:10e6});const log=(r.stdout||'')+(r.stderr||'');fs.mkdirSync('artifacts',{recursive:true});fs.appendFileSync('artifacts/build.log',log);if(r.error||r.status!==0||/SCRIPT ERROR:|Parse Error:|Failed to export/i.test(log))throw Error(r.error?.message||log.slice(-10000));console.log(log.split('\n').filter(l=>/ERROR|WARNING|DONE/.test(l)).join('\n'));}
for(const dir of ['dist','artifacts','node_modules']){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'.gdignore'),'');}
run(['--headless','--path',root,'--editor','--import','--quit']);
for(const platform of target==='all'?['windows','web']:[target]){
 const out=path.join(root,'dist',platform);fs.mkdirSync(out,{recursive:true});
 run(['--headless','--path',root,'--export-release',platform==='web'?'Web':'Windows Desktop',path.join(out,platform==='web'?'index.html':'HKVSZombie.exe')]);
 fs.cpSync('runtime',path.join(out,'runtime'),{recursive:true,filter:source=>!source.endsWith('.gdignore')&&!source.endsWith('node.exe')});
 fs.cpSync('assets/licenses',path.join(out,'licenses'),{recursive:true});
 if(platform==='windows'){
   fs.copyFileSync(process.execPath,path.join(out,'runtime/node.exe'));
   const license=path.join(path.dirname(process.execPath),'LICENSE');if(fs.existsSync(license))fs.copyFileSync(license,path.join(out,'licenses/Node-LICENSE.txt'));
 }else{
   const scripts=['platform.js',...['gamehub-room','gamehub-stats','gamehub-matches'].map(n=>'vendor/'+n+'.js'),...CORE.map(n=>'core/'+n+'.js'),'host.js','browser.js'];
   let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
   const loader='<script>window.GAMEHUB_GAME_ID="4405e915c069c808";</script>\n'+scripts.map(file=>`<script src="runtime/${file}"></script>`).join('\n');
   // GameHub serves each version below /g/<id>/v/<version>/, while its
   // wrapper can make relative Godot assets resolve at the site root. Rewrite
   // only bare engine assets against the actual page directory.
   const assetBase='<script>(function(){const base=new URL("./",window.location.href);const nativeFetch=window.fetch.bind(window);window.fetch=function(input,init){if(typeof input==="string" && /^(index\\.(pck|wasm|png|audio\\.|js)$)/.test(input))input=new URL(input,base).href;return nativeFetch(input,init);};})();</script>';
   html=html.replace('<script src="index.js"></script>',assetBase+'\n<script src="index.js"></script>');
   fs.writeFileSync(path.join(out,'index.html'),html.replace('</head>',loader+'\n</head>'));
   // Godot 4.7's loader checks Secure Context unconditionally, even for the
   // explicitly single-threaded Web template. GameHub's static endpoint is
   // HTTP, so limit that check to threaded exports; no SharedArrayBuffer or
   // cross-origin isolation is used by this build.
   const loaderPath=path.join(out,'index.js');
   let loaderSource=fs.readFileSync(loaderPath,'utf8');
   const secureCheck='if (!Features.isSecureContext()) {';
   if(!loaderSource.includes(secureCheck))throw Error('Godot loader secure-context check changed; inspect before patching.');
   loaderSource=loaderSource.replace(secureCheck,'if (supportsThreads && !Features.isSecureContext()) {');
   fs.writeFileSync(loaderPath,loaderSource);
 }
 console.log('Built '+platform+': '+out);
}
