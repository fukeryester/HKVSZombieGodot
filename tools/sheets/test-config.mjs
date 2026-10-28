import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';import {createRuntime} from '../../runtime/desktop.mjs';
const root=path.resolve(import.meta.dirname,'../..');process.chdir(root);
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hkvz-config-'));
for(const name of (await fs.readdir('config')).filter(n=>n.endsWith('.xlsx')))await fs.copyFile('config/'+name,path.join(dir,name));
const compile=(env={})=>{const r=spawnSync(process.execPath,['tools/compile-config.mjs'],{encoding:'utf8',env:{...process.env,...env}});assert.equal(r.status,0,r.stderr);};
try{
 const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir,'兵种.xlsx'))),sheet=wb.worksheets.getItem('参数'),values=sheet.getUsedRange().values;
 const hpKey='CIVS.hk_finance.units.intern.hp',costKey='CIVS.hk_finance.units.intern.resourceCost.food';
 for(const [key,value]of [[hpKey,987],[costKey,123],['CIVS.hk_finance.units.intern.name','测试训练兵'],['CIVS.hk_finance.units.intern.desc','Excel 描述生效'],['CIVS.hk_finance.units.intern.icon','assets/sprites/hk_wild.png#0,1,7,12'],['CIVS.hk_finance.units.intern.tier',2]]){const index=values.findIndex(row=>row[5]===key);assert.ok(index>0);sheet.getCell(index,2).values=[[value]];}
 wb.recalculate();await(await SpreadsheetFile.exportXlsx(wb)).save(path.join(dir,'兵种.xlsx'));
 const spatial=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir,'战场布局.xlsx'))),sp=spatial.worksheets.getItem('参数');
 const spatialIndex=sp.getUsedRange().values.findIndex(r=>r[5]==='world.humanMargin');assert.ok(spatialIndex>0);sp.getCell(spatialIndex,2).values=[[280]];
 spatial.recalculate();await(await SpreadsheetFile.exportXlsx(spatial)).save(path.join(dir,'战场布局.xlsx'));
 async function edit(file,entries){const book=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir,file+'.xlsx'))),s=book.worksheets.getItem('参数'),rs=s.getUsedRange().values;for(const [key,value]of entries){const i=rs.findIndex(r=>r[5]===key);assert.ok(i>0,key);s.getCell(i,2).values=[[value]];}book.recalculate();await(await SpreadsheetFile.exportXlsx(book)).save(path.join(dir,file+'.xlsx'));}
 await edit('文明',[['CIVS.hk_finance.name','测试文明'],['CIVS.hk_finance.desc','文明描述测试'],['CIVS.hk_finance.icon','assets/sprites/hk_gang.png#2,0,7,12']]);
 await edit('技能',[['SKILLS.capital_injection.name','测试技能'],['SKILLS.capital_injection.desc','技能描述测试'],['SKILLS.capital_injection.icon','assets/sprites/hk_wild.png#1,0,7,12'],['SKILLS.capital_injection.cd',12],['SKILLS.hk_wild_skill_0.effects.food',777]]);
 await edit('建筑经济',[['Econ.AGES.1.food',333],['economy.ageTime.2',4],['Econ.ageHp.2',222]]);
 compile({CONFIG_DIR:dir});let e=createRuntime({gameId:''});assert.equal(e.CIVS.hk_finance.units.intern.hp,987);assert.equal(e.Econ.unitCost(e.CIVS.hk_finance.units.intern).food,123);
 const u=e.CIVS.hk_finance.units.intern;assert.equal(u.name,'测试训练兵');assert.equal(u.desc,'Excel 描述生效');assert.equal(u.icon,'assets/sprites/hk_wild.png#0,1,7,12');assert.equal(u.prereq,'tech_a');assert.equal(u.art.tier,2);assert.equal(e.isUnitUnlocked('hk_finance','intern',new Set()),false);
 assert.equal(e.CIVS.hk_finance.name,'测试文明');assert.equal(e.CIVS.hk_finance.desc,'文明描述测试');assert.equal(e.CIVS.hk_finance.icon,'assets/sprites/hk_gang.png#2,0,7,12');assert.equal(e.SKILLS.capital_injection.name,'测试技能');assert.equal(e.SKILLS.capital_injection.desc,'技能描述测试');assert.equal(e.SKILLS.capital_injection.cd,12);assert.equal(e.GodotGame.catalog().skills.capital_injection.icon,'assets/sprites/hk_wild.png#1,0,7,12');
 const p=e.Sim.createInitialState({seed:2,players:[{team:'hk',row:0,civId:'hk_finance'},{team:'zom',row:0,civId:'zom_classic'}]}).players[0];assert.equal(p.baseX,280);
 assert.equal(e.Econ.ageTime(p),4);assert.equal(e.Econ.AGES[1].food,333);assert.equal(e.Econ.ageHp[2],222);
 const st=e.Sim.createInitialState({seed:3,players:[{team:'hk',row:0,civId:'hk_wild'},{team:'zom',row:0,civId:'zom_classic'}]}),wp=st.players[0];wp.age=4;wp.energy=9000;const food=wp.food,earned=wp.earned;assert.equal(e.Sim.applyAction(st,{op:'skill',seat:0,skill:'hk_wild_skill_0'}).ok,true);assert.equal(wp.food-food,777);assert.equal(wp.earned-earned,957);
 await edit('文明',[['CIVS.hk_finance.icon','assets/missing.png']]);const invalid=spawnSync(process.execPath,['tools/compile-config.mjs'],{encoding:'utf8',env:{...process.env,CONFIG_DIR:dir}});assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/图标文件不存在/);
 console.log('Excel round trip: names, descriptions, icons, HP, cost, tier/unlock, cooldown, skill effect, base position and era timing/HP passed; invalid icon rejected.');
}finally{compile();}
const a=createRuntime({gameId:''}),b=createRuntime({baseline:true,gameId:''});
for(const size of [1,2,3,4]){
 const ask=(e,m,args={})=>JSON.parse(e.GodotGame.request(JSON.stringify({method:m,args})));
 for(const e of [a,b]){ask(e,'start',{seed:921,size,civ:'hk_police',side:'hk'});for(let i=0;i<300;i++)ask(e,'frame',{ms:1000/30});}
 assert.equal(ask(a,'checksum').checksum,ask(b,'checksum').checksum);
}
console.log('Default configuration matches original simulation for 1v1 through 4v4.');
const schema=JSON.parse(await fs.readFile('config/schema.json'));assert.equal(new Set(schema.rows.map(r=>r.key)).size,schema.rows.length);assert.ok(schema.rows.every(r=>r.kind!=='literal'&&r.group!=='高级规则'));
for(const c of Object.values(a.CIVS))for(const [uid,u]of Object.entries(c.units)){assert.equal(schema.rows.filter(r=>r.key===`CIVS.${c.id}.units.${uid}.tier`).length,1);assert.ok(!schema.rows.some(r=>r.key===`CIVS.${c.id}.units.${uid}.art.tier`));for(const key of ['name','desc','icon'])assert.equal(typeof u[key],'string');}
