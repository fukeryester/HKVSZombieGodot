import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from 'acorn';
import {createRuntime} from '../runtime/desktop.mjs';
const root=new URL('../',import.meta.url);process.chdir(root.pathname.replace(/^\/(\w:)/,'$1'));
const E=createRuntime({baseline:true});
const rows=[];
const labels={hp:'生命值',dmg:'伤害',speed:'移动速度',range:'攻击距离',atkCd:'攻击间隔（秒）',buildTime:'训练时间（秒）',pop:'人口占用',tier:'时代',cost:'旧金币基数（四资源价格另设）',dur:'持续时间（秒）',cd:'冷却时间（秒）',cash:'金币奖励',income:'收入加成',time:'建造时间（秒）',gather:'采集倍率',research:'研究时间倍率',workerTime:'农民训练时间（秒）',food:'食物',wood:'木头',gold:'黄金',stone:'石头'};
function add(group,key,label,value,source,extra={}){for(const [a,b] of Object.entries(labels))if(label.endsWith(' / '+a))label=label.slice(0,-a.length)+(group==='技能'&&a==='cost'?'能量消耗':b);rows.push({group,key,label,value,source,...extra});}
function flatten(group,prefix,obj,label){for(const [k,v] of Object.entries(obj||{})){if(typeof v==='number'&&Number.isFinite(v))add(group,prefix+'.'+k,label+' / '+k,v,prefix,{kind:'object',path:(prefix+'.'+k).split('.')});else if(v&&typeof v==='object')flatten(group,prefix+'.'+k,v,label+' / '+k);}}
for(const [cid,c] of Object.entries(E.CIVS)){
 for(const [uid,u] of Object.entries(c.units)){
  flatten('兵种','CIVS.'+cid+'.units.'+uid,u,c.name+' / '+u.name);
  add('兵种',`CIVS.${cid}.units.${uid}.displayScale`,c.name+' / '+u.name+' / 显示体型倍率',1,'Godot',{kind:'object',path:['CIVS',cid,'units',uid,'displayScale']});
  const price=E.Econ.unitCost(u);for(const resource of ['food','wood','gold','stone'])add('兵种',`CIVS.${cid}.units.${uid}.resourceCost.${resource}`,c.name+' / '+u.name+' / '+({food:'食物',wood:'木头',gold:'黄金',stone:'石头'}[resource]),price[resource]||0,'Econ.unitCost',{kind:'cost',cid,uid,resource,price});
 }
 flatten('文明','CIVS.'+cid+'.traits',c.traits,c.name+' / 文明特性');
 flatten('建筑经济','CIVS.'+cid+'.buildings',c.buildings,c.name+' / 建筑');
}
for(const [id,skill]of Object.entries(E.SKILLS))flatten('技能','SKILLS.'+id,skill,skill.name+' / '+id);
flatten('战争巨兽','War.DEFS',E.War.DEFS,'战争巨兽');
flatten('建筑经济','Econ.BUILDINGS',E.Econ.BUILDINGS,'通用建筑');
flatten('建筑经济','Econ.AGES',E.Econ.AGES,'升本资源');
const layout=JSON.parse(fs.readFileSync('assets/data/battle-layout.json'));
for(const [k,v]of Object.entries(layout))add('战场布局','layout.'+k,({world_length:'显示世界长度',edge_padding:'屏幕左右留白（像素）',road_top:'道路顶边占画面高度比例',road_depth:'道路纵深占画面高度比例',far_scale:'远端缩放倍率',unit_scale:'全局显示尺寸倍率'}[k]),v,'Godot',{kind:'layout',field:k});
const files=['civs','expansion','balance','factions','war','economy','sim','ai','progression'];
const sources={};
for(const name of files){const file='runtime/core/'+name+'.js',s=fs.readFileSync(file,'utf8');sources[name]=crypto.createHash('sha256').update(s).digest('hex');
 function walk(n,parent){if(!n||typeof n!=='object')return;if(n.type==='Literal'&&typeof n.value==='number'){
 const line=n.loc.start.line,context=s.split('\n')[line-1].trim();
 // Numeric object keys are structural and cannot be replaced as expressions.
 if(!(parent?.type==='Property'&&parent.key===n))add('高级规则',`${name}:${n.start}`,`${name} 第${line}行 / ${context.slice(Math.max(0,n.loc.start.column-45),n.loc.start.column+65)}`,n.value,file+':'+line,{kind:'literal',file:name,start:n.start,end:n.end,raw:s.slice(n.start,n.end)});
 }for(const [key,v]of Object.entries(n)){if(key==='loc')continue;if(Array.isArray(v))v.forEach(x=>walk(x,n));else if(v&&typeof v==='object')walk(v,n);}}
 walk(parse(s,{ecmaVersion:'latest',locations:true}));
}
const spatial={'sim:356':'逻辑战线长度（同步修改显示世界长度）','sim:410':'香港基地距左边界（世界单位）','sim:465':'僵尸基地距右边界（世界单位）','sim:571':'士兵出生点距基地后方（世界单位）'};
for(const r of rows){if(spatial[r.key]){r.group='战场布局';r.label=spatial[r.key];}if(r.kind==='literal'&&r.file==='sim'&&/row \* 44/.test(r.label)&&r.value===44){r.group='战场布局';r.label='同阵营基地横向间隔（两侧分别设置）';}}
fs.mkdirSync('config',{recursive:true});fs.writeFileSync('config/schema.json',JSON.stringify({sources,rows},null,2));console.log(`Configuration schema: ${rows.length} numeric fields`);
