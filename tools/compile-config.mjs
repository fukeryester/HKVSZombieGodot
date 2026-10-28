import fs from 'node:fs';import crypto from 'node:crypto';import vm from 'node:vm';import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);process.chdir(root.pathname.replace(/^\/(\w:)/,'$1'));
const schema=JSON.parse(fs.readFileSync('config/schema.json'));
const r=spawnSync(process.env.PYTHON_BIN||'python',['tools/read-config.py'],{encoding:'utf8',maxBuffer:10e6});if(r.status!==0)throw Error(r.stderr||r.error);
const values=JSON.parse(r.stdout),known=new Set(schema.rows.map(x=>x.key));
for(const key of Object.keys(values))if(!known.has(key))throw Error('Unknown key '+key);
const patches={},assign=[],costs={},layout={},skills={};
for(const row of schema.rows){const v=values[row.key];if(typeof v!=='number'||!Number.isFinite(v))throw Error('Missing/invalid value '+row.key);
 if(row.kind==='layout'){layout[row.field]=v;continue;}
 if(v===row.value)continue;
 if(Math.abs(v)>1e12)throw Error('Value out of bounds '+row.key);
 if(row.kind==='literal'){(patches[row.file]??=[]).push({...row,value:v});continue;}
 if(v<0)throw Error('Negative attribute '+row.key);
 if(row.kind==='cost'){const k=row.cid+'.'+row.uid;costs[k]??={...row.price};costs[k][row.resource]=v;continue;}
 if(row.path[0]==='SKILLS'&&row.path.at(-1)==='cd'){skills[row.path[1]]=v;continue;}
 if(['hp','speed','atkCd','buildTime','displayScale'].includes(row.path.at(-1))&&v<=0)throw Error('Must be positive '+row.key);
 assign.push({path:row.path,value:v});
}
if(layout.world_length<=0||layout.road_depth<=0||layout.road_top<0||layout.road_top+layout.road_depth>1||layout.far_scale<=0||layout.far_scale>1||layout.unit_scale<=0||layout.edge_padding<0)throw Error('Invalid battlefield layout');
const output={};for(const [name,hash]of Object.entries(schema.sources)){let s=fs.readFileSync('runtime/core/'+name+'.js','utf8');if(crypto.createHash('sha256').update(s).digest('hex')!==hash)throw Error('Source drift: '+name);
 for(const p of (patches[name]||[]).sort((a,b)=>b.start-a.start)){if(s.slice(p.start,p.end)!==p.raw)throw Error('Patch mismatch '+p.key);s=s.slice(0,p.start)+'('+p.value+')'+s.slice(p.end);}
 if(name==='economy')s=s.replace('function unitCost(u){','function unitCost(u){if(u.resourceCost)return {...u.resourceCost};');
 new vm.Script(s);output[name]=s;
}
for(const [k,value]of Object.entries(costs)){const [cid,uid]=k.split('.');assign.push({path:['CIVS',cid,'units',uid,'resourceCost'],value});}
const changed=schema.rows.filter(r=>r.kind!=='layout'&&values[r.key]!==r.value).map(r=>[r.key,values[r.key]]);
const hash=crypto.createHash('sha256').update(JSON.stringify(changed)).digest('hex').slice(0,16);
const js=`window.GAME_CONFIG_HASH=${JSON.stringify(hash)};window.GameTuningSkills=${JSON.stringify(skills)};for(const entry of ${JSON.stringify(assign)}){let obj=window;for(const key of entry.path.slice(0,-1))obj=obj[key];obj[entry.path.at(-1)]=entry.value;}\n`;
new vm.Script(js);fs.mkdirSync('runtime/configured',{recursive:true});for(const [n,s]of Object.entries(output))fs.writeFileSync('runtime/configured/'+n+'.js',s);
fs.writeFileSync('runtime/tuning.js',js);fs.writeFileSync('assets/data/battle-layout.json',JSON.stringify(layout));fs.writeFileSync('config/compiled-values.json',JSON.stringify(values,null,2));console.log(`Validated ${schema.rows.length} fields; ${changed.length} gameplay overrides; config ${hash}`);
