import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';import {createRuntime} from '../../runtime/desktop.mjs';
const root=path.resolve(import.meta.dirname,'../..');process.chdir(root);
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hkvz-config-'));
for(const name of (await fs.readdir('config')).filter(n=>n.endsWith('.xlsx')))await fs.copyFile('config/'+name,path.join(dir,name));
const compile=(env={})=>{const r=spawnSync(process.execPath,['tools/compile-config.mjs'],{encoding:'utf8',env:{...process.env,...env}});assert.equal(r.status,0,r.stderr);};
try{
 const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir,'兵种.xlsx'))),sheet=wb.worksheets.getItem('参数'),values=sheet.getUsedRange().values;
 const hpKey='CIVS.hk_finance.units.intern.hp',costKey='CIVS.hk_finance.units.intern.resourceCost.food';
 for(const [key,value]of [[hpKey,987],[costKey,123]]){const index=values.findIndex(row=>row[0]===key);assert.ok(index>0);sheet.getCell(index,2).values=[[value]];}
 wb.recalculate();await(await SpreadsheetFile.exportXlsx(wb)).save(path.join(dir,'兵种.xlsx'));
 const spatial=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir,'战场布局.xlsx'))),sp=spatial.worksheets.getItem('参数');
 const spatialIndex=sp.getUsedRange().values.findIndex(r=>r[0]==='sim:410');assert.ok(spatialIndex>0);sp.getCell(spatialIndex,2).values=[[280]];
 spatial.recalculate();await(await SpreadsheetFile.exportXlsx(spatial)).save(path.join(dir,'战场布局.xlsx'));
 compile({CONFIG_DIR:dir});let e=createRuntime({gameId:''});assert.equal(e.CIVS.hk_finance.units.intern.hp,987);assert.equal(e.Econ.unitCost(e.CIVS.hk_finance.units.intern).food,123);
 const p=e.Sim.createInitialState({seed:2,players:[{team:'hk',row:0,civId:'hk_finance'},{team:'zom',row:0,civId:'zom_classic'}]}).players[0];assert.equal(p.baseX,280);
 console.log('Excel edited, exported, imported and applied: HP=987, food=123, baseX=280');
}finally{compile();}
const a=createRuntime({gameId:''}),b=createRuntime({baseline:true,gameId:''});
for(const size of [1,2,3,4]){
 const ask=(e,m,args={})=>JSON.parse(e.GodotGame.request(JSON.stringify({method:m,args})));
 for(const e of [a,b]){ask(e,'start',{seed:921,size,civ:'hk_police',side:'hk'});for(let i=0;i<300;i++)ask(e,'frame',{ms:1000/30});}
 assert.equal(ask(a,'checksum').checksum,ask(b,'checksum').checksum);
}
console.log('Default configuration matches original simulation for 1v1 through 4v4.');
