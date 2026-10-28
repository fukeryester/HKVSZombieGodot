import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import vm from 'node:vm';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const schema=JSON.parse(fs.readFileSync('config/schema.json'));
if(schema.version!==2)throw Error('Configuration schema migration required');
const r=spawnSync(process.env.PYTHON_BIN||'python',['tools/read-config.py'],{encoding:'utf8',maxBuffer:10e6});if(r.status!==0)throw Error(r.stderr||r.error);
const values=JSON.parse(r.stdout),known=new Set(schema.rows.map(x=>x.key)),patches={},assign=[],costs={},layout={},skills={};
for(const key of Object.keys(values))if(!known.has(key))throw Error('Unknown key '+key);
const sources={};for(const [n,h]of Object.entries(schema.sources)){const s=fs.readFileSync('runtime/core/'+n+'.js','utf8');if(crypto.createHash('sha256').update(s).digest('hex')!==h)throw Error('Source drift: '+n);sources[n]=s;}
function validate(row,v){
 if(typeof v!==row.type)throw Error(`配置类型错误：${row.entity} / ${row.label} (${row.type})`);
 if(row.type==='number'&&(!Number.isFinite(v)||v<0||v>1e9))throw Error('数值超出范围 '+row.key);
 if(['tier','age'].includes(row.path?.at(-1))&&(!Number.isInteger(v)||v<1||v>4))throw Error('时代必须为1到4 '+row.key);
 if(['hp','atkCd','buildTime','time','displayScale','workerTime'].includes(row.path?.at(-1))&&v<=0)throw Error('必须大于0 '+row.key);
 if(row.path?.at(-1)==='name'&&!v.trim())throw Error('名称不能为空 '+row.key);
 if(['color','accent'].includes(row.path?.at(-1))&&!/^#[0-9a-f]{6}$/i.test(v))throw Error('颜色应为 #RRGGBB '+row.key);
 if(row.path?.at(-1)==='icon'){
  if(!v)return;
  const [file,fragment,...extra]=v.split('#');
  if(extra.length||!/^assets\/[a-z0-9_./ -]+\.(png|webp|jpg|svg)$/i.test(file)||file.includes('..')||!fs.existsSync(path.resolve(file)))throw Error('图标文件不存在或路径非法 '+row.key+': '+v);
  if(fragment){const n=fragment.split(',').map(Number);if(n.length!==4||n.some(x=>!Number.isInteger(x)||x<0)||n[2]<=0||n[3]<=0||n[0]>=n[2]||n[1]>=n[3])throw Error('图集范围错误 '+row.key);}
 }
 if(row.path?.at(-1)==='support'&&!['heal','convert',''].includes(v))throw Error('辅助方式应为 heal / convert '+row.key);
 if(row.path?.includes('skills')){const skill=schema.rows.find(r=>r.key===`SKILLS.${v}.name`);if(!skill)throw Error('技能槽引用不存在 '+row.key);const owner=schema.rows.find(r=>r.path?.includes('skills')&&r.value===v)?.path[1];if(owner?.split('_')[0]!==row.path[1].split('_')[0])throw Error('技能槽阵营不一致 '+row.key);}
 if(row.path?.[0]==='SKILLS'&&(['unit','from','to'].includes(row.path.at(-1))||row.path[2]==='units'&&row.path.at(-1)==='0')){
  const owner=schema.rows.find(r=>r.path?.includes('skills')&&r.value===row.path[1])?.path[1];
  if(!known.has(`CIVS.${owner}.units.${v}.name`))throw Error('技能引用的兵种不存在 '+row.key);
 }
 if(row.kind==='binding'&&/\.(count|blades|pistols)$/.test(row.key)&&(!Number.isInteger(v)||v>100))throw Error('数量必须为0到100的整数 '+row.key);
}
for(const row of schema.rows){
 const v=values[row.key];validate(row,v);
 if(row.kind==='layout'){layout[row.field]=v;continue;}
 if(row.kind==='binding'){
  // Validate each binding even at its default value. Source offsets never appear in Excel.
  for(const t of row.targets){const [before,raw,after]=t.anchor.split('§');const needle=before+raw+after;let at=-1,hits=0;
   while((at=sources[t.file].indexOf(needle,at+1))>=0){hits++;(patches[t.file]??=[]).push({start:at+before.length,end:at+before.length+raw.length,raw,value:v,key:row.key});}
   if(!hits)throw Error('Missing binding '+row.key+' '+t.anchor);
  }
  if(row.key.startsWith('SKILLS.'))assign.push({path:row.key.split('.'),value:v});
  continue;
 }
 if(row.kind==='cost'){
  const k=row.cid+'.'+row.uid;costs[k]??={...row.price};
  if(v!==row.value||v!==0)costs[k][row.resource]=v;
  continue;
 }
 if(row.path[0]==='SKILLS'&&row.path.at(-1)==='cd'){skills[row.path[1]]=v;continue;}
 // Single initialization layer: every exposed field is read once into the final catalog.
 if(!(row.optionalZero&&v===0))assign.push({path:row.path,value:v});
 if(row.path.at(-1)==='tier'&&v!==row.value){
  const p=row.path.slice(0,-1);
  assign.push({path:[...p,'prereq'],value:[null,null,'tech_a','tech_b','tech_c'][v]},{path:[...p,'art','tier'],value:v});
 }
}
layout.world_length=values['world.length'];
if(layout.world_length<=0||layout.road_depth<=0||layout.road_top<0||layout.road_top+layout.road_depth>1||layout.far_scale<=0||layout.far_scale>1||layout.unit_scale<=0||layout.edge_padding<0)throw Error('Invalid battlefield layout');
if(values['world.humanMargin']+values['world.zombieMargin']+6*values['world.baseSpacing']>=layout.world_length)throw Error('基地位置交叉，请增加战线长度或减少留白/间距');
for(const [k,value]of Object.entries(costs)){
 const [cid,uid]=k.split('.');
 assign.push({path:['CIVS',cid,'units',uid,'resourceCost'],value});
}
const output={};
for(const [n,original]of Object.entries(sources)){
 let s=original;const list=(patches[n]||[]).sort((a,b)=>b.start-a.start);let previous=Infinity;
 for(const p of list){if(p.end>previous)throw Error('Duplicate binding '+p.key);previous=p.start;if(p.value===Number(p.raw))continue;s=s.slice(0,p.start)+JSON.stringify(p.value)+s.slice(p.end);}
 if(n==='economy')s=s.replace('function unitCost(u){','function unitCost(u){if(u.resourceCost)return {...u.resourceCost};');
 if(n==='factions'){
  const val=(id,k)=>values[`SKILLS.${id}.effects.${k}`];
  s=s.replace('p.earned+=530','p.earned+='+ (val('hk_wild_skill_0','food')+val('hk_wild_skill_0','wood')))
   .replace('p.spent+=300','p.spent+='+ (val('hk_gang_skill_0','food')+val('hk_gang_skill_0','wood')))
   .replace('p.earned+=140*n','p.earned+='+ (val('zom_robot_skill_0','wood')+val('zom_robot_skill_0','gold'))+'*n');
  s=s.replace('需要150食物和150木头',`需要${val('hk_gang_skill_0','food')}食物和${val('hk_gang_skill_0','wood')}木头`)
   .replace('需要3生质和受伤的本方部队',`需要${val('zom_necro_skill_0','cost')}生质和受伤的本方部队`)
   .replace('需要8生质',`需要${val('zom_necro_skill_2','cost')}生质`).replace('需要2个空闲人口',`需要${val('zom_necro_skill_2','count')}个空闲人口`);
  const ambush=val('hk_gang_skill_2','blades')+val('hk_gang_skill_2','pistols');
  s=s.replace('p.pop+8<=p.popCap','p.pop+'+ambush+'<=p.popCap').replace('伏击需要8个空闲人口',`伏击需要${ambush}个空闲人口`).replace('i<8;i++)spawn(s,p','i<'+ambush+';i++)spawn(s,p');
 }
 if(n==='war')s=s.replace("kind==='cyst'?900:","kind==='cyst'?Sim.LANE_LEN/2:").replace('Math.min(1800,u.x','Math.min(Sim.LANE_LEN,u.x').replace('actual.cd=.18','actual.cd=u.def.atkCd');
 new vm.Script(s);output[n]=s;
}
const changed=schema.rows.filter(r=>!r.visual&&values[r.key]!==r.value).map(r=>[r.key,values[r.key]]).sort(([a],[b])=>a.localeCompare(b));
const hash=crypto.createHash('sha256').update(JSON.stringify(changed)).digest('hex').slice(0,16);
const js=`window.GAME_CONFIG_HASH=${JSON.stringify(hash)};window.GameTuningSkills=${JSON.stringify(skills)};for(const entry of ${JSON.stringify(assign)}){let obj=window;for(const key of entry.path.slice(0,-1))obj=obj[key]??=(Object.create(null));obj[entry.path.at(-1)]=entry.value;}\n`;
new vm.Script(js);fs.mkdirSync('runtime/configured',{recursive:true});for(const [n,s]of Object.entries(output))fs.writeFileSync('runtime/configured/'+n+'.js',s);
fs.writeFileSync('runtime/tuning.js',js);fs.writeFileSync('assets/data/battle-layout.json',JSON.stringify(layout));fs.writeFileSync('config/compiled-values.json',JSON.stringify(values,null,2));
console.log(`Validated ${schema.rows.length} unique fields; ${changed.length} gameplay overrides; config ${hash}`);
