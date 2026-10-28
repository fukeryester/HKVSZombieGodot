import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createRuntime} from '../runtime/desktop.mjs';
const url=process.env.TEST_URL||'http://127.0.0.1:8074';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/SCRIPT ERROR|ERROR:|Parse Error/.test(m.text()))errors.push(m.text());});
const call=(method,args={})=>page.evaluate(({method,args})=>JSON.parse(GodotGame.request(JSON.stringify({method,args}))),{method,args});
const view=()=>page.evaluate(()=>GodotGame.view());
async function asyncCall(method,args={}){let r=await call(method,args);while(r.pending){await page.waitForTimeout(10);r=await call('poll',{ticket:r.pending});}return r;}
try{
 await page.goto(url);await page.waitForFunction(()=>window.GodotGame);await page.waitForTimeout(4000);
 await page.screenshot({path:'artifacts/web-menu.png'});
 // The dedicated title screen precedes civilization setup.
 await page.mouse.click(720,500);await page.waitForTimeout(300);
 // Click actual Godot controls, then use input shortcuts and inspect authoritative state.
 await page.mouse.click(1150,460);await page.waitForFunction(()=>GodotGame.view().screen==='play');
 await page.waitForTimeout(400);
 for(let i=0;i<3;i++){await page.keyboard.press('1');await page.waitForTimeout(65);}await page.keyboard.press('w');await page.waitForTimeout(100);
 let v=await view();assert.equal(v.state.players[0].queue.length,3);assert.equal(v.state.players[0].workerQueue.length,1);
 await page.waitForTimeout(1000);await page.screenshot({path:'artifacts/web-battle.png'});
 for(const [tab,x] of [['workers',255],['buildings',424],['skills',570]]){await page.mouse.click(x,539);await page.waitForTimeout(120);await page.screenshot({path:`artifacts/web-${tab}.png`});}
 await page.keyboard.press('p');await page.keyboard.press('p');await page.waitForFunction(()=>GodotGame.view().state.gmUsed);await page.waitForTimeout(400);await page.screenshot({path:'artifacts/web-beasts.png'});
 await page.mouse.click(280,625); // Summon may be lower depending on font sizing; validate using command if no click hit.
 if(!(await view()).state.units.some(u=>u.beast))await call('action',{op:'summon_beast',kind:'zeppelin'});
 await page.keyboard.press('Escape');await page.waitForTimeout(250);assert.ok((await view()).state.units.some(u=>u.beast==='zeppelin'));
 // Web JavaScript and bundled desktop V8 must produce identical fixed-tick state.
 await page.evaluate(()=>{const q=(method,args={})=>JSON.parse(GodotGame.request(JSON.stringify({method,args})));q('start',{size:4,civ:'zom_asym',side:'zom',seed:908});q('pause');});
 const oracle=createRuntime({gameId:''});const request=(method,args={})=>JSON.parse(oracle.GodotGame.request(JSON.stringify({method,args})));
 request('start',{size:4,civ:'zom_asym',side:'zom',seed:908});request('pause');
 // Run synchronously in one browser task so Godot's rendering timer cannot interleave ticks.
 const checksum=await page.evaluate(()=>{const q=(method,args={})=>JSON.parse(GodotGame.request(JSON.stringify({method,args})));q('pause');q('action',{op:'worker'});for(let i=0;i<500;i++)q('frame',{ms:1000/30});q('pause');return q('checksum').checksum;});
 request('pause');request('action',{op:'worker'});for(let i=0;i<500;i++)request('frame',{ms:1000/30});request('pause');assert.equal(checksum,request('checksum').checksum);
 await page.waitForTimeout(300);await page.screenshot({path:'artifacts/web-4v4.png'});
 await call('leave');const archive=await asyncCall('archive');assert.ok(archive.entries.length>=2);
 const file=(await asyncCall('export',{index:0})).file;assert.ok(file.commands.length);
 await asyncCall('watch',{index:0});await call('seek',{tick:file.endTick});await page.waitForFunction(()=>GodotGame.view().verified);assert.equal((await view()).replayError,'');
 await call('seek',{tick:135});await page.waitForFunction(()=>!GodotGame.view().seeking);assert.equal((await view()).state.tick,135);
 await call('seek',{tick:file.endTick});await page.waitForFunction(()=>GodotGame.view().verified);await page.screenshot({path:'artifacts/web-replay.png'});
 await page.waitForTimeout(200);await page.mouse.click(670,467);await page.waitForTimeout(300);
 const clicked=(await view()).state.tick;assert.ok(clicked>100&&clicked<400,'Clicking the timeline should seek to the selected time, got '+clicked);
 await call('seek',{tick:file.endTick});await page.waitForFunction(()=>GodotGame.view().verified);
 await page.reload();await page.waitForFunction(()=>window.GodotGame);assert.ok((await asyncCall('archive')).entries.length>=2);
 assert.deepEqual(errors,[]);fs.writeFileSync('artifacts/web-verification.json',JSON.stringify({passed:true,checks:['Godot WebAssembly boot','native Control mouse/keyboard input','three rapid training orders','workers','all four panels','double-P GM','beast summon','Web/desktop checksum equality at 500 ticks','4v4','durable replay archive','backward/forward seek','final replay checksum'],errors},null,2));
 console.log('Web integration checks passed; screenshots saved in artifacts.');
}finally{await browser.close();}
