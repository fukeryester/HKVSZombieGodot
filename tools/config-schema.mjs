// One-time migration only. Import existing designer edits with compile-config.mjs.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRuntime} from '../runtime/desktop.mjs';
import {bindings} from './config-bindings.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const E=createRuntime({baseline:true}),rows=[];
const labels={name:'名称',desc:'描述',icon:'图标',color:'主色',accent:'强调色',baseIncome:'采集效率基数',baseCap:'初始人口上限',baseRegen:'基地脱战回复（生命/秒）',hp:'生命值',dmg:'攻击伤害',speed:'移动速度',range:'攻击距离',atkCd:'攻击间隔（秒）',buildTime:'训练时间（秒）',pop:'人口占用',tier:'解锁时代',dur:'持续时间（秒）',cd:'冷却时间（秒）',cost:'文明能量消耗',cash:'获得黄金',income:'收入加成',time:'建造时间（秒）',gather:'农民采集倍率',research:'升本时间倍率',workerTime:'农民训练时间（秒）',food:'食物',wood:'木头',gold:'黄金',stone:'石头',machine:'机械单位',controlImmune:'免疫转化',splash:'溅射半径',healAmt:'单次治疗量',support:'辅助方式',jump:'跳跃单位',lobber:'抛射攻击',onDeath:'死亡触发效果',explodeDmg:'自爆伤害',explodeR:'自爆半径',aura:'光环类型',auraR:'光环范围',auraAmt:'光环效果数值',vsMachine:'对机械伤害倍率',evasion:'受到近战伤害倍率',armor:'受到伤害倍率',siege:'对基地伤害倍率',vsLarge:'对大型单位伤害倍率',rally:'友军鼓舞伤害倍率',burn:'持续灼烧伤害',knockback:'击退距离',bleed:'流血强度',suicide:'攻击后自爆',slow:'被击中者移速倍率',age:'解锁时代',heal:'回复最大生命比例',reduction:'减伤比例',count:'作用数量',radius:'效果半径',ratio:'作用比例',distance:'位移距离',speedMul:'召唤物速度倍率',moveMul:'移动速度倍率',atkMul:'攻击伤害倍率',unit:'召唤兵种ID',from:'进化前兵种ID',to:'进化后兵种ID',rush:'AI采用早战策略',killGold:'每次击杀黄金',repair:'士兵脱战自修（生命/秒）',regen:'士兵再生（生命/秒）',biomass:'收集尸体生质',price:'农民造价倍率',bodyRadius:'碰撞半径',mounted:'基地防御槽',displayScale:'显示体型倍率'};
function add(group,entity,key,label,value,extra={}){
 if(value===undefined||value===null)return;
 const type=typeof value;
 rows.push({group,entity,key,label,value,type,note:type==='boolean'?'TRUE 开启 / FALSE 关闭':type==='number'?'填写最终生效值':'文本，可直接修改',...extra});
 if(!rows.at(-1).label)throw Error('Missing designer label '+key);
}
function obj(g,e,p,k,v,x={}){add(g,e,p+'.'+k,labels[k],v,{kind:'object',path:(p+'.'+k).split('.'),visual:['name','desc','color','accent'].includes(k),...x});}
function icon(g,e,p,v){obj(g,e,p,'icon',v,{visual:true,note:'assets 图片路径；图集追加 #行,帧,总行数,总帧数（从0开始）'});}
for(const [cid,c]of Object.entries(E.CIVS)){
 const cp='CIVS.'+cid;
 for(const k of ['name','desc','color','accent','baseIncome','baseCap','baseRegen'])obj('文明',c.name,cp,k,c[k]);
 icon('文明',c.name,cp,`assets/sprites/${cid}.png#6,0,7,12`);
 for(let i=0;i<c.skills.length;i++)add('文明',c.name,cp+'.skills.'+i,`技能槽 ${i+1}`,c.skills[i],{kind:'object',path:['CIVS',cid,'skills',String(i)],note:'填写技能表中的技能ID；必须与文明同阵营'});
 obj('文明',c.name,cp+'.buildings.hq','name',c.buildings.hq.name,{label:'基地名称'});
 obj('文明',c.name,cp+'.buildings.hq','hp',c.buildings.hq.hp,{label:'初始基地生命'});
 for(const [k,v]of Object.entries(c.traits))if(!['quality','training','foodDiscount','controlImmune','pop','workerTime'].includes(k))obj('文明',c.name,cp+'.traits',k,v);
 obj('文明',c.name,cp+'.traits','pop',c.traits.pop||1,{label:'农民人口占用'});
 obj('文明',c.name,cp+'.traits','workerTime',c.traits.workerTime??16);
 let index=0;
 for(const [uid,u]of Object.entries(c.units)){
  const p=cp+'.units.'+uid,e=c.name+' / '+u.name;
  for(const k of ['name','desc','tier','hp','dmg','speed','range','atkCd','buildTime','pop','machine','controlImmune','splash','healAmt','support','jump','lobber','onDeath','explodeDmg','explodeR','aura','auraR','auraAmt','vsMachine','evasion','armor','siege','vsLarge','rally','burn','knockback','bleed','suicide','slow','dur'])obj('兵种',e,p,k,u[k]);
  obj('兵种',e,p,'cost',u.cost,{label:'战斗价值',note:'技能目标优先级、击杀能量与战绩计算的基数；不参与资源扣费'});
  icon('兵种',e,p,`assets/sprites/${cid}.png#${index++},0,7,12`);
  obj('兵种',e,p,'displayScale',u.displayScale??1,{visual:true});
  const price=E.Econ.unitCost(u);
  for(const r of ['food','wood','gold','stone'])add('兵种',e,p+'.resourceCost.'+r,'造价 · '+labels[r],price[r]||0,{kind:'cost',cid,uid,resource:r,price});
 }
}
for(const [id,s]of Object.entries(E.SKILLS)){
 const c=Object.values(E.CIVS).find(c=>c.skills.includes(id)),e=c.name+' / '+s.name,p='SKILLS.'+id;
 for(const [k,v]of Object.entries(s))if(!['id','side','kind','units','byCiv'].includes(k))obj('技能',e,p,k,v);
 if(s.units)for(let i=0;i<s.units.length;i++)for(const j of [0,1])add('技能',e,`${p}.units.${i}.${j}`,`召唤组${i+1} · ${j?'数量':'兵种ID'}`,s.units[i][j],{kind:'object',path:['SKILLS',id,'units',String(i),String(j)]});
 icon('技能',e,p,`assets/sprites/${c.id}.png#${c.skills.indexOf(id)+3},0,7,12`);
}
for(const [id,d]of Object.entries(E.Econ.BUILDINGS)){
 const p='Econ.BUILDINGS.'+id;
 for(const k of ['name','time','hp','pop','mounted','age'])obj('建筑经济',d.name,p,k,d[k],k==='pop'?{label:'提供人口'}:{});
 obj('建筑经济',d.name,p,'desc','');
 const icons={house:'2,0',barracks:'2,1',town_center:'2,2',mill:'2,3',castle:'3,0',bombard:'3,1'};
 icon('建筑经济',d.name,p,`assets/sprites/settlements.png#${icons[id]},4,4`);
 for(const r of ['food','wood','gold','stone'])add('建筑经济',d.name,p+'.cost.'+r,'造价 · '+labels[r],d.cost[r]||0,{kind:'object',optionalZero:d.cost[r]===undefined,path:['Econ','BUILDINGS',id,'cost',r]});
}
for(let a=2;a<=4;a++){
 for(const r of ['food','wood','gold','stone'])add('建筑经济',`升至${a}本`,`Econ.AGES.${a-1}.${r}`,'升本 · '+labels[r],E.Econ.AGES[a-1][r]||0,{kind:'object',optionalZero:E.Econ.AGES[a-1][r]===undefined,path:['Econ','AGES',String(a-1),r]});
 add('建筑经济',`升至${a}本`,`Econ.ageHp.${a}`,'基地增加生命',E.Econ.ageHp[a],{kind:'object',path:['Econ','ageHp',String(a)]});
}
for(const [id,d]of Object.entries(E.War.DEFS)){
 for(const k of ['name','desc','hp','dmg','range','speed','atkCd','bodyRadius'])obj('战争巨兽',d.name,'War.DEFS.'+id,k,d[k]);
 icon('战争巨兽',d.name,'War.DEFS.'+id,`assets/sprites/war_beasts.png#${Object.keys(E.War.DEFS).indexOf(id)},0,6,12`);
}
for(const [k,v]of Object.entries(JSON.parse(fs.readFileSync('assets/data/battle-layout.json'))))if(k!=='world_length')add('战场布局','画面投影','layout.'+k,({edge_padding:'屏幕左右留白（像素）',road_top:'道路顶边高度比例',road_depth:'道路纵深高度比例',far_scale:'远处尺寸倍率',unit_scale:'全局显示尺寸倍率'}[k]),v,{kind:'layout',field:k,visual:true});
for(const b of bindings){
 const id=b.key.startsWith('SKILLS.')?b.key.split('.')[1]:null;
 const c=id?Object.values(E.CIVS).find(c=>c.skills.includes(id)):null;
 add(b.group,c?c.name+' / '+E.SKILLS[id].name:b.entity,b.key,b.label,b.value,{kind:'binding',targets:b.targets});
}
const order=new Map();for(const row of rows)if(!order.has(row.entity))order.set(row.entity,order.size);
rows.sort((a,b)=>order.get(a.entity)-order.get(b.entity));
if(new Set(rows.map(r=>r.key)).size!==rows.length)throw Error('Duplicate key');
const sources={};for(const n of ['civs','expansion','balance','factions','war','economy','sim','ai','progression'])sources[n]=crypto.createHash('sha256').update(fs.readFileSync('runtime/core/'+n+'.js')).digest('hex');
fs.writeFileSync('config/schema.json',JSON.stringify({version:2,sources,rows},null,2));
console.log(`${rows.length} unique designer fields; no raw literals or initialization intermediates`);
