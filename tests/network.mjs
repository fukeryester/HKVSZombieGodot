import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],peers=new Map(),pages=[];let serial=0,room;
const roomView=()=>({...room,members:[...peers.values()].filter(x=>x.joined).map(x=>x.member),member_count:[...peers.values()].filter(x=>x.joined).length});
const deliver=(p,m)=>p.ws.send(JSON.stringify(m));
const call=(p,method,args={})=>p.evaluate(({method,args})=>JSON.parse(GodotGame.request(JSON.stringify({method,args}))),{method,args});
async function command(p,method,args={}){let r=await call(p,method,args);while(r.pending){await p.waitForTimeout(20);r=await call(p,'poll',{ticket:r.pending});}assert.notEqual(r.ok,false,JSON.stringify(r));return r;}
try{
 for(let i=0;i<2;i++){
  const p=await browser.newPage({viewport:{width:1440,height:900}});pages.push(p);
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/SCRIPT ERROR|Parse Error/.test(m.text()))errors.push(m.text());});
  await p.route('**/api/v1/**',async route=>{const r=route.request();if(r.url().endsWith('/rooms')&&r.method()==='POST'){room={code:'GD1234',game_id:'4405e915c069c808',max_players:8,host_id:100};await route.fulfill({json:{ok:true,room:roomView()}});}else if(r.url().includes('/stats/me'))await route.fulfill({json:{logged_in:false,stats:[],achievements:[],leaderboards:[]}});else await route.fulfill({json:{ok:true}});});
  await p.routeWebSocket('**/ws/rooms',ws=>{
   const id='peer-'+(++serial),peer={ws,joined:false,member:{client_id:id,user_id:i+100,username:'Godot '+i,seat:i}};peers.set(id,peer);
   ws.onMessage(raw=>{const m=JSON.parse(raw);if(m.op==='join'){peer.joined=true;deliver(peer,{op:'welcome',you:peer.member,room:roomView()});for(const q of peers.values())if(q!==peer&&q.joined)deliver(q,{op:'member_joined',member:peer.member,room:roomView()});}else if(m.op==='ping')deliver(peer,{op:'pong'});else if(m.op==='broadcast'||m.op==='send'){for(const q of peers.values())if(q!==peer&&q.joined&&(!m.to||q.member.client_id===m.to))deliver(q,{op:'message',from:id,to:m.to||null,data:m.data});}});
  });
  await p.goto('http://127.0.0.1:8074');await p.waitForFunction(()=>window.GodotGame);await p.waitForTimeout(1800);
  await command(p,i===0?'create':'join',i===0?{size:4,ranked:false}:{code:'GD1234'});
  await p.waitForFunction(()=>GodotGame.view().lobby?.players.some(p=>p&&!p.isAI));
 }
 await command(pages[1],'choice',{civ:'zom_necro',side:'zom'});
 await pages[0].waitForFunction(()=>GodotGame.view().lobby.players[4]?.civId==='zom_necro');
 for(let i=0;i<8;i++)if(i!==0&&i!==4)await command(pages[0],'bot',{slot:i,civ:i<4?'hk_university':'zom_robot'});
 for(const p of pages)await command(p,'ready');
 await pages[0].waitForFunction(()=>GodotGame.view().lobby.players.every(p=>p?.ready));await pages[0].screenshot({path:'artifacts/web-lobby.png'});
 await command(pages[0],'network_start');for(const p of pages)await p.waitForFunction(()=>GodotGame.view().state?.tick>3);
 for(const p of pages){await call(p,'action',{op:'worker'});await call(p,'action',{op:'assign',job:'stone'});}
 await pages[0].waitForTimeout(2300);
 // A tampered seat in a human command must remain bound to the actual sender.
 await call(pages[1],'action',{op:'gm_beast',seat:0});assert.equal((await call(pages[0],'view')).view.state.gmUsed,false);
 await call(pages[0],'action',{op:'gm_beast'});await call(pages[0],'action',{op:'summon_beast',kind:'train'});
 await pages[1].waitForFunction(()=>GodotGame.view().state.units.some(u=>u.beast==='train'));
 await call(pages[0],'action',{op:'resign'});await call(pages[1],'action',{op:'resign'});
 // Compare at an exact shared tick by temporarily stopping host's render advance.
 await pages[0].evaluate(()=>{const original=GodotGame.request;window.savedRulesRequest=original;GodotGame.request=function(text){const q=JSON.parse(text);if(q.method==='frame'&&window.frozenState)return JSON.stringify({view:GodotGame.view()});const result=original(text);if(q.method==='frame'&&GodotGame.view().state.tick%3===0)window.frozenState={tick:GodotGame.view().state.tick,checksum:JSON.parse(original(JSON.stringify({method:'checksum'}))).checksum};return result;};});
 await pages[0].waitForFunction(()=>window.frozenState);const snapshots=await pages[0].evaluate(()=>window.frozenState);
 await pages[1].waitForFunction(t=>GodotGame.view().state.tick===t,snapshots.tick,{timeout:10000});
 assert.equal((await call(pages[1],'checksum')).checksum,snapshots.checksum);
 for(const p of pages)await command(p,'leave');
 const files=[];for(const p of pages){await command(p,'archive');files.push((await command(p,'export',{index:0})).file);}
 assert.deepEqual(files[0].commands,files[1].commands);assert.equal(files[0].checksum,files[1].checksum);assert.deepEqual(errors,[]);
 fs.writeFileSync('artifacts/network-verification.json',JSON.stringify({passed:true,realSDK:true,transport:'isolated test relay',humanPeers:2,aiPeers:6,mode:'4v4',tick:snapshots.tick,checksum:snapshots.checksum,commands:files[0].commands.length},null,2));console.log('Godot 4v4 multiplayer SDK, identity binding, checksums and both replay logs passed.');
}finally{await browser.close();}
