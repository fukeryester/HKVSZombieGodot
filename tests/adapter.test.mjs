import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {createRuntime} from '../runtime/desktop.mjs';
const create=()=>createRuntime({gameId:'',fetchImpl:async()=>{throw Error('offline')}});
const ask=(e,method,args={})=>JSON.parse(e.GodotGame.request(JSON.stringify({method,args})));
async function command(e,method,args={}){let r=ask(e,method,args);while(r.pending){await new Promise(r=>setTimeout(r,1));r=ask(e,'poll',{ticket:r.pending});}return r;}
test('all immutable rule and platform SDK files retain upstream checksums',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../docs/upstream-hashes.json',import.meta.url)));
 for(const [name,hash] of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../runtime/core/'+name,import.meta.url))).digest('hex'),hash,name);
 for(const [name,hash] of Object.entries(manifest.vendorFiles))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../runtime/vendor/'+name,import.meta.url))).digest('hex'),hash,name);
});
test('adapter and direct simulation produce identical outcomes for every civilization and team size',()=>{
 for(const size of [1,2,3,4])for(const civ of Object.keys(create().CIVS)){
  const e=create(),side=e.CIVS[civ].side,r=ask(e,'start',{seed:222,size,side,civ}),initial=r.view.state;
  assert.ok(initial,JSON.stringify(r));
  const config={seed:initial.seed,mode:initial.mode,players:initial.players.map(p=>({team:p.team,row:p.row,civId:p.civId,isAI:p.isAI,name:p.name}))};
  const oracle=e.Sim.createInitialState(config),seat=r.view.seat;
  const orders=[{op:'worker'},{op:'assign',job:'gold'},{op:'spawn',unit:Object.keys(e.CIVS[civ].units)[0]}];
  for(const a of orders){const got=ask(e,'action',a);const expected=e.Sim.applyAction(oracle,{...a,seat});assert.equal(got.ok,expected.ok);}
  for(let tick=0;tick<240;tick++){
   for(const p of oracle.players)if(p.isAI)e.AI.think(oracle,p,a=>e.Sim.applyAction(oracle,a));
   e.Sim.tickSim(oracle,e.Sim.DT);ask(e,'frame',{ms:e.Sim.DT_MS});
  }
  assert.equal(ask(e,'checksum').checksum,e.Replay.checksum(oracle),`${civ} ${size}v${size}`);
 }
});
test('native archive retains last five and supports export, import, backwards seek and verified forward replay',async()=>{
 const userDir=fs.mkdtempSync(path.join(os.tmpdir(),'hkvsz-godot-test-'));
 const e=createRuntime({gameId:'',userDir,fetchImpl:async()=>{throw Error('offline')}});
 for(let match=0;match<6;match++){
  ask(e,'start',{civ:'hk_police',side:'hk',size:2,seed:match});ask(e,'action',{op:'worker'});
  for(let i=0;i<40;i++)ask(e,'frame',{ms:250});
  ask(e,'leave');await new Promise(r=>setTimeout(r,2));
 }
 const archive=await command(e,'archive');assert.equal(archive.entries.length,5);assert.equal(archive.durable,true);
 const exported=await command(e,'export',{index:0});assert.ok(exported.file.commands.length);
 await command(e,'watch',{index:0});assert.equal(ask(e,'action',{op:'worker'}).ok,false);
 ask(e,'seek',{tick:exported.file.endTick});for(let i=0;i<20&&!e.GodotGame.view().verified;i++)ask(e,'frame',{ms:33});assert.equal(e.GodotGame.view().verified,true);
 ask(e,'seek',{tick:135});while(e.GodotGame.view().seeking)ask(e,'frame',{ms:33});assert.equal(e.GodotGame.view().state.tick,135);
 ask(e,'seek',{tick:exported.file.endTick});while(e.GodotGame.view().seeking)ask(e,'frame',{ms:33});assert.equal(e.GodotGame.view().verified,true);
 const fresh=createRuntime({gameId:'',userDir});assert.equal((await command(fresh,'archive')).entries.length,5);
 assert.equal((await command(fresh,'import',{file:{...exported.file,engine:'wrong'}})).ok,false);
});
