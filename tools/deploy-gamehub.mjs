import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.GAMEHUB_BASE||'http://101.43.19.238';
const token=process.env.GAMEHUB_TOKEN;
if(!token)throw new Error('GAMEHUB_TOKEN is required and is never written to the repository.');
const title='香港大战僵尸2：生死存亡 · Godot像素重制版';
const version=process.env.GAMEHUB_VERSION||'1.0.0';
const headers={Authorization:`Bearer ${token}`};
async function api(url,options={}){
  const response=await fetch(base+url,{...options,headers:{...headers,...options.headers}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}
const me=await api('/api/v1/me');
const remaining=Number(me.quota_bytes)-Number(me.used_bytes);
const projects=await api('/api/v1/projects');
const exact=projects.projects.filter(project=>project.title===title);
if(exact.length>1)throw new Error('More than one matching GameHub project exists; refusing to guess.');
if(process.argv.includes('--check')){console.log(JSON.stringify({user:me.username,remaining_bytes:remaining,matching:exact},null,2));process.exit(0);}
const zipPath=path.join(root,'dist/release/HKVSZombie-Godot-Web.zip');
if(!fs.existsSync(zipPath))throw new Error(`Missing ${zipPath}; run npm run build and package first.`);
const form=new FormData();
form.set('file',new Blob([fs.readFileSync(zipPath)]),'HKVSZombie-Godot-Web.zip');
form.set('label',`v${version}`);
form.set('changelog','Godot 像素重制版：原版规则、12文明、84兵种、6战争巨兽、1v1至4v4、AI、联机、排位、并行训练队列和本机五场回放。网页导出使用 Godot WebAssembly，Windows 包另行提供。');
if(!exact.length){
  form.set('title',title);
  form.set('description','香港夜景像素风横版拔河 RTS。采集食物、木头、黄金和石头，扩建兵营与城镇中心，调遣农民、守住基地并召唤战争巨兽。');
  form.set('engine','html');
  form.set('published','1');
  form.set('tags','strategy,multiplayer,action,horror');
  const cover=path.join(root,'docs/screenshots/menu.png');
  if(fs.existsSync(cover))form.set('cover',new Blob([fs.readFileSync(cover)]),'menu.png');
}
const result=await api(exact.length?`/api/v1/projects/${exact[0].id}/versions`:'/api/v1/games',{method:'POST',body:form});
const game=result.game;
const deployment={projectId:game.id,title,version,versionId:game.current_version_id,playUrl:game.play_url,entryUrl:game.entry_url,uploadedAt:new Date().toISOString()};
fs.writeFileSync(path.join(root,'deployment-godot.json'),JSON.stringify(deployment,null,2)+'\n');
const schema=JSON.parse(fs.readFileSync(path.join(root,'runtime/gamehub.progression.json'),'utf8'));
const progression=await api(`/api/v1/projects/${game.id}/progression`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(schema)});
console.log(JSON.stringify({user:me.username,remaining_bytes:remaining,game:deployment,progression:progression.imported},null,2));
