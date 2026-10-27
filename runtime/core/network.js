window.HKVZId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
/* Host schedules all actions at fixed ticks. Clients advance only on ordered 3-tick batches.
   Sender identity comes from the platform relay, never from a payload's claimed seat. */
window.BattleNet=class BattleNet{
  constructor(emit){this.emit=emit;this.room=null;this.client=null;this.lobby=null;this.hostId=null;this.playing=false;this.pending=[];this.frameActions=[];this.frameResults=[];this.inputSerial=0;this.frameStart=0;this.sequence=0;this.lastSeq=0;this.lastReceive=0;this.lastPing=0;this.session=null;this.rate=new Map();}
  static gameId(){return /^\/g\/([^/]+)\//.exec(location.pathname)?.[1]||window.GAMEHUB_GAME_ID||'';}
  get host(){return this.client?.you?.client_id===this.hostId;}
  get me(){return this.client?.you?.client_id;}
  get mySeat(){return this.lobby?.players.findIndex(p=>p?.clientId===this.me)??-1;}
  async connect(){if(this.client?.ws?.readyState===1)return;const client=new GameHubRoom();this.client=client;
    client.on('welcome',m=>{this.room=m.room;this.lastReceive=performance.now();const first=m.room.members.find(x=>x.user_id===m.room.host_id);this.hostId=first?.client_id;if(this.hostId===m.you.client_id){const size=this.requestedSize||1;this.lobby={size,ranked:!!this.requestedRanked,players:Array(size*2).fill(null)};this.lobby.players[0]=this.player(m.you,0);this.syncLobby();}else this.emit('waiting',{});this.emit('room',m.room);});
    client.on('member_joined',m=>{this.room=m.room;if(this.host&&!this.playing){const slot=this.lobby.players.findIndex(p=>!p||p.isAI);if(slot>=0){this.lobby.players[slot]=this.player(m.member,slot);this.syncLobby();}}else if(this.host&&this.playing)this.send(m.member.client_id,{type:'reject',error:'对局已经开始，无法中途加入'});});
    client.on('member_left',m=>{this.room=m.room;if(m.member.client_id===this.hostId){this.emit('fatal',{error:'房主已离线，对局中止，本局不计排位。'});return;}if(this.host){const slot=this.lobby.players.findIndex(p=>p?.clientId===m.member.client_id);if(slot>=0){if(this.playing)this.pending.push({op:'resign',seat:slot});else{this.lobby.players[slot]=null;this.syncLobby();}}}});
    client.on('message',m=>this.message(m));client.on('error',m=>this.emit('error',m));client.on('close',()=>this.emit('fatal',{error:'房间连接已断开，本局不计排位。'}));
    await Promise.race([client.connect(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('房间服务连接超时')),8000))]);
  }
  player(member,slot){const side=slot<this.lobby.size?'hk':'zom';return {clientId:member.client_id,userId:member.user_id,name:member.username,team:side,civId:side==='hk'?'hk_police':'zom_classic',ready:false,isAI:false};}
  async create(size,ranked){if(!BattleNet.gameId())throw new Error('请在 GameHub 登录后从第二代游戏页面创建房间。');this.requestedSize=size;this.requestedRanked=ranked;await this.connect();const r=await this.client.createRoom(BattleNet.gameId(),size*2);this.client.join(r.code);}
  async join(code){if(!/^[A-Z0-9]{6}$/.test(code))throw new Error('请输入6位房间号');await this.connect();this.client.join(code);}
  broadcast(data){this.queue(null,data);}
  send(id,data){this.queue(id,data);}
  queue(to,data){
    this.outbox ||= [];
    // Lobby edits may arrive in bursts. Coalesce them and pace all relay writes below 20/s.
    if(data.type==='lobby')this.outbox=this.outbox.filter(p=>p.data.type!=='lobby');
    this.outbox.push({to,data});
    if(!this.outTimer)this.flush();
  }
  flush(){
    const item=this.outbox?.shift();
    if(!item||!this.client||this.client.ws?.readyState!==1){this.outTimer=null;return;}
    const packet={protocol:11,...item.data};
    if(item.to)this.client.send(item.to,packet);else this.client.broadcast(packet);
    this.outTimer=setTimeout(()=>{this.outTimer=null;this.flush();},75);
  }
  syncLobby(){this.broadcast({type:'lobby',state:this.lobby});this.emit('lobby',this.lobby);}
  choose(civId,team){const a={type:'choice',civId,team};if(this.host)this.choice(this.me,a);else this.send(this.hostId,a);}
  choice(from,d){if(this.playing||!['hk','zom'].includes(d.team)||!Object.hasOwn(CIVS,d.civId)||CIVS[d.civId].side!==d.team)return;let seat=this.lobby.players.findIndex(p=>p?.clientId===from);if(seat<0)return;let p=this.lobby.players[seat];if(p.team!==d.team){const first=d.team==='hk'?0:this.lobby.size;let dest=this.lobby.players.findIndex((r,i)=>i>=first&&i<first+this.lobby.size&&(!r||r.isAI));if(dest<0){this.send(from,{type:'reject',error:'该阵营没有空位'});return;}this.lobby.players[dest]=p;this.lobby.players[seat]=null;p.team=d.team;}p.civId=d.civId;p.ready=false;this.syncLobby();}
  ready(){if(this.host){const p=this.lobby.players[this.mySeat];p.ready=!p.ready;this.syncLobby();}else this.send(this.hostId,{type:'ready'});}
  bot(slot,civId){if(!this.host||this.playing)return;const side=slot<this.lobby.size?'hk':'zom';if(this.lobby.players[slot]&&!this.lobby.players[slot].isAI)return;this.lobby.players[slot]=civId?{name:'AI · '+CIVS[civId].name,team:side,civId,isAI:true,ready:true}:null;this.syncLobby();}
  start(){if(!this.host)return;const l=this.lobby;if(l.players.some(p=>!p||!p.ready))throw new Error('请填满座位并等待所有玩家准备');const config={seed:crypto.getRandomValues(new Uint32Array(1))[0],mode:`${l.size}v${l.size}`,ranked:l.ranked,session:HKVZId(),players:l.players.map((p,i)=>({...p,seat:i,row:i%l.size}))};this.session=config.session;this.playing=true;this.frameStart=0;this.sequence=0;this.broadcast({type:'start',config});this.emit('start',{config,seat:this.mySeat});}
  action(a){const requestId=++this.inputSerial,input={...a,requestId};if(this.host)this.enqueue(this.me,input);else this.send(this.hostId,{type:'input',session:this.session,action:input});return requestId;}
  enqueue(from,a){if(!this.playing||!a||typeof a.op!=='string')return;const seat=this.lobby.players.findIndex(p=>p?.clientId===from);if(seat<0)return;const now=performance.now();let r=this.rate.get(from)||{time:now,n:0};if(now-r.time>1000)r={time:now,n:0};if(++r.n>18){this.result({seat,requestId:a.requestId},{ok:false,err:'操作过快，请稍后重试'});return;}this.rate.set(from,r);if(a.op==='gm_beast'&&from!==this.hostId){this.result({seat,requestId:a.requestId},{ok:false,err:'联机GM仅限房主使用'});return;}const clean={op:a.op,seat};if(Number.isSafeInteger(a.requestId)&&a.requestId>0)clean.requestId=a.requestId;for(const k of ['unit','kind','skill','job','laneId'])if(typeof a[k]==='string'&&a[k].length<70)clean[k]=a[k];for(const k of ['slot','workerId','siteId','orderId','targetSeat','count'])if(Number.isInteger(a[k]))clean[k]=a[k];this.pending.push(clean);}
  beforeTick(state){const list=this.pending.splice(0);for(const a of list)this.apply(state,a);state.players.filter(p=>p.isAI).forEach(p=>AI.think(state,p,a=>this.apply(state,a)));}
  result(a,r){if(!Number.isSafeInteger(a.requestId)||a.requestId<=0)return;const item={seat:a.seat,requestId:a.requestId,ok:r.ok};if(!r.ok)item.error=r.err;if(a.seat===this.mySeat)this.emit('actionResult',item);else this.frameResults.push(item);}
  apply(state,a){const result=Sim.applyAction(state,a);if(result.ok){const {requestId,...command}=a;this.frameActions.push({tick:state.tick,a:command});}this.result(a,result);return result;}
  afterTick(state){if(state.tick%3!==0&&!state.over)return;const packet={type:'frame',session:this.session,seq:++this.sequence,from:this.frameStart,to:state.tick,actions:this.frameActions};if(this.frameResults.length)packet.results=this.frameResults;this.broadcast(packet);this.frameActions=[];this.frameResults=[];this.frameStart=state.tick;}
  message(m){const d=m.data;if(!d)return;if(d.protocol!==11){this.emit('error',{error:'房间游戏版本不同，请所有玩家刷新最新版并重新建房。'});return;}
    if(d.type==='lobby'&&m.from===this.hostId&&!this.playing){if(!d.state||!Array.isArray(d.state.players)||d.state.players.length>8)return;this.lobby=d.state;this.emit('lobby',d.state);}
    else if(d.type==='choice'&&this.host)this.choice(m.from,d);
    else if(d.type==='ready'&&this.host&&!this.playing){const p=this.lobby.players.find(p=>p?.clientId===m.from);if(p){p.ready=!p.ready;this.syncLobby();}}
    else if(d.type==='start'&&m.from===this.hostId&&!this.playing){if(!this.lobby||!Array.isArray(d.config?.players)||d.config.players.length!==this.lobby.size*2)return;this.session=d.config.session;this.playing=true;this.lastSeq=0;this.lastReceive=performance.now();this.emit('start',{config:d.config,seat:this.mySeat});}
    else if(d.type==='input'&&this.host&&d.session===this.session)this.enqueue(m.from,d.action);
    else if(d.type==='frame'&&m.from===this.hostId&&!this.host&&d.session===this.session){if(d.seq!==this.lastSeq+1){this.emit('fatal',{error:'同步序列不连续，对局中止，本局不计排位。'});return;}this.lastSeq=d.seq;this.lastReceive=performance.now();this.emit('frame',d);for(const result of d.results||[])if(result.seat===this.mySeat)this.emit('actionResult',result);}
    else if(d.type==='reject'&&m.from===this.hostId)this.emit('error',{error:d.error});
  }
  maintain(){const now=performance.now();if(now-this.lastPing>20000&&this.client?.ws?.readyState===1){this.client.ping();this.lastPing=now;}if(this.playing&&!this.host&&now-this.lastReceive>12000){this.playing=false;this.emit('fatal',{error:'超过12秒未收到房主同步，对局中止，本局不计排位。'});}}
  close(){this.playing=false;clearTimeout(this.outTimer);this.outbox=[];this.outTimer=null;const c=this.client;this.client=null;if(c){c._handlers={};try{c.leave();c.close();}catch{}}}
};
