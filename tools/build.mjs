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
   const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
   const loader='<script>window.GAMEHUB_GAME_ID="4405e915c069c808";</script>\n'+scripts.map(file=>`<script src="runtime/${file}"></script>`).join('\n');
   fs.writeFileSync(path.join(out,'index.html'),html.replace('</head>',loader+'\n</head>'));
 }
 console.log('Built '+platform+': '+out);
}
