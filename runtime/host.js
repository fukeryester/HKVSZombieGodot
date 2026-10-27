/* Godot owns presentation. This adapter schedules the unmodified upstream rules. */
window.GodotGame = (() => {
  let state=null, config=null, seat=0, local=true, paused=false, speed=1, acc=0;
  let net=null, replay=null, seekTarget=null, seekResume=false, ended=false, aborted=false;
  let lastReplay=null, saved=null, result=null, notice='', screen='menu', storeEntries=[], saveStatus='';
  let gmRequest=null, openBeasts=false, archiveSerial=0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const version=()=>/^\/g\/[^/]+\/v\/([^/]+)\//.exec(location.pathname)?.[1]||'godot-1';
  const say=text=>{notice=String(text||'');};
  function localConfig(a){
    const size=Math.max(1,Math.min(4,Number(a.size)||1)),side=a.side==='zom'?'zom':'hk';
    const players=['hk','zom'].flatMap(team=>Array.from({length:size},(_,row)=>{
      const me=team===side&&row===0,ids=team==='hk'?HK_CIVS:ZOM_CIVS;
      const civId=me?a.civ:team!==side&&row===0?a.enemy:ids[(row+size)%ids.length];
      return {team,row,civId:CIVS[civId]?.side===team?civId:ids[0],isAI:!me,name:me?'指挥官 · 你':'AI · '+CIVS[civId||ids[0]]?.name};
    }));
    return {seed:a.seed??crypto.getRandomValues(new Uint32Array(1))[0],mode:`${size}v${size}`,ranked:!!a.ranked,players};
  }
  function stopRecord(reason){
    if(!state||replay)return;
    try{const file=Replay.finish(state,reason);if(!file)return;lastReplay=file;
      saved=ReplayStore.save(file).then(r=>{saveStatus=r.local?'回放已保存到本机 · 最近5场':'回放暂存本次运行，可导出保存';return r;});
    }catch(e){say('回放保存失败：'+e.message);}
  }
  function start(c,s,isLocal,isReplay=false){
    if(state&&!ended)stopRecord('restart');
    config=c;seat=s;local=isLocal;state=Sim.createInitialState(c);replay=null;seekTarget=null;
    paused=false;speed=1;acc=0;ended=false;aborted=false;lastReplay=null;result=null;saved=null;saveStatus='';openBeasts=false;
    screen='play';say('后方资源区就绪。发展经济、扩建队列、守住所有基地。');
    if(!isReplay){Progress.start();Replay.begin(state,c,s,version());}
  }
  function finish(){if(replay||ended||aborted)return;ended=true;stopRecord('finished');
    result=Progress.finish(state,seat,config.ranked);
    Promise.resolve(saved).then(()=>state.gmUsed?null:Progress.save()).catch(e=>say('战绩已留本机，云端同步失败：'+e.message));
  }
  function leave(){stopRecord('left');net?.close();net=null;state=null;replay=null;seekTarget=null;screen='menu';paused=false;}
  function networkEvent(type,data){
    if(type==='room'||type==='lobby')screen='lobby';
    else if(type==='start')start(data.config,data.seat,false);
    else if(type==='frame'){
      if(!state||aborted)return;
      if(data.from!==state.tick||data.to<state.tick||data.to-state.tick>120){networkEvent('fatal',{error:'同步帧范围异常，本局不计排位'});return;}
      let i=0;while(state.tick<data.to){while(data.actions[i]?.tick===state.tick)Sim.applyAction(state,data.actions[i++].a);Sim.tickSim(state,Sim.DT);}if(state.over)finish();
    }else if(type==='actionResult'){
      if(data.requestId===gmRequest){gmRequest=null;if(data.ok)openBeasts=true;}
      if(!data.ok)say(data.error);
    }else if(type==='fatal'){
      if(state?.over||aborted)return;stopRecord('disconnect');aborted=true;paused=true;net?.close();say(data.error);
    }else if(type==='error'||type==='actionError')say(data.error);
  }
  function dispatch(a){
    if(replay)return {ok:false,err:'回放模式只读'};
    if(!state||state.over||aborted)return {ok:false,err:'当前不可操作'};
    const action={...a,seat};
    if(local){const r=Sim.applyAction(state,action);if(!r.ok)say(r.err);if(r.ok&&a.op==='gm_beast')openBeasts=true;return r;}
    if(a.op==='gm_beast'&&!net.host)return {ok:false,err:'联机GM仅限房主使用'};
    const requestId=net.action(action);if(a.op==='gm_beast')gmRequest=requestId;return {ok:true,pending:true};
  }
  function advance(milliseconds){
    net?.maintain();if(!state)return;
    if(replay&&seekTarget!==null){
      try{if(replay.advanceTo(seekTarget,120)){seekTarget=null;paused=!seekResume||replay.verified;}}catch(e){seekTarget=null;paused=true;say(e.message);}
      state=replay.state;return;
    }
    if(paused||aborted)return;
    acc+=Math.max(0,Math.min(Number(milliseconds)||0,local?250:2000))*speed;
    if(replay){try{let n=0;while(acc>=Sim.DT_MS&&n++<90&&!replay.verified){replay.step();acc-=Sim.DT_MS;}if(replay.verified)paused=true;}catch(e){paused=true;say(e.message);}state=replay.state;return;}
    if(state.over){finish();return;}
    if(!local&&!net?.host){acc=0;return;}
    let n=0;while(acc>=Sim.DT_MS&&n++<90){
      if(local){for(const p of state.players)if(p.isAI)AI.think(state,p,a=>Sim.applyAction(state,a));}
      if(!local)net.beforeTick(state);
      Sim.tickSim(state,Sim.DT);if(!local)net.afterTick(state);acc-=Sim.DT_MS;
      if(state.over){finish();break;}
    }
  }
  function catalog(){return {civs:CIVS,skills:SKILLS,buildings:Econ.BUILDINGS,ages:Econ.AGES,beasts:War.DEFS,human:HK_CIVS,zombie:ZOM_CIVS,engine:Replay.ENGINE};}
  function view(){
    const s=state?Sim.snapshot(state):null,p=state?.players[seat];
    const ui=p?{
      army:Object.entries(CIVS[p.civId].units).map(([id,u])=>({id,cost:Econ.unitCost(u),enabled:!replay&&!p.resigned&&!state.over&&isUnitUnlocked(p.civId,id,new Set(Object.keys(p.built).filter(k=>p.built[k]>0)))&&Econ.can(p,Econ.unitCost(u))&&p.pop+u.pop<=p.popCap})),
      workerPrice:Econ.workerPrice(p),workerTime:Econ.workerTime(p),armyLanes:Econ.lanes(p,'army'),workerLanes:Econ.lanes(p,'worker'),
      buildings:Object.entries(Econ.BUILDINGS).map(([id,d])=>({id,...d,cost:Econ.buildCost(p,id),slots:Econ.availableSlots(id)})),
      skills:CIVS[p.civId].skills.map(id=>({id,...SKILLS[id],cooldown:Sim.skillCdRemain(p,SKILLS[id],state.time)})),
      canSummon:!replay&&War.canSummon(state,p),repairTargets:state.players.filter(q=>q.team===p.team&&!q.resigned&&q.baseHp<q.baseHpMax).map(q=>q.seat)
    }:null;
    return {screen,state:s,seat,local,paused,speed,replay:!!replay,seeking:seekTarget!==null,replayEnd:replay?.record.endTick||0,verified:!!replay?.verified,replayError:replay?.error||'',ended,aborted,result,notice,saveStatus,ui,openBeasts,online:Progress.online(),score:Progress.score(),rankTitle:Progress.title(Progress.score()),lobby:net?.lobby||null,room:net?.room?.code||'',host:!!net?.host,mySeat:net?.mySeat??-1};
  }
  function playRecord(file){const player=new Replay.Player(file);net?.close();net=null;start(file.config,file.seat,true,true);replay=player;state=player.state;lastReplay=file;}
  async function asyncCommand(method,a){
    if(method==='connect'){window.HKVZPlatform?.configure(a);await Progress.init();return {ok:true,online:Progress.online()};}
    if(method==='create'||method==='join'){leave();net=new BattleNet(networkEvent);if(method==='create')await net.create(a.size,!!a.ranked);else await net.join(a.code.trim().toUpperCase());return {ok:true};}
    if(method==='archive'){await saved;const value=await ReplayStore.archive();storeEntries=value.entries;return {entries:storeEntries.map((e,i)=>({index:i,...e.summary,temporary:e.source==='temporary'})),durable:value.durable};}
    if(method==='watch'){const e=storeEntries[a.index];if(!e)throw Error('回放不存在');playRecord(await ReplayStore.load(e));return {ok:true};}
    if(method==='export'){const e=storeEntries[a.index];if(!e)throw Error('回放不存在');return {file:await ReplayStore.load(e)};}
    if(method==='import'){const file=Replay.validate(a.file);await ReplayStore.save(file);playRecord(file);return {ok:true};}
    if(method==='ranking')return {history:await Progress.loadHistory(),board:await Progress.board(),score:Progress.score(),title:Progress.title(Progress.score())};
    if(method==='retry_save'){await Progress.save();return {ok:true};}
    throw Error('未知异步操作');
  }
  const pending=new Map();let ticket=0;
  function request(text){try{const {method,args:a={}}=typeof text==='string'?JSON.parse(text):text;
    if(['connect','create','join','archive','watch','export','import','ranking','retry_save'].includes(method)){
      const id=++ticket;pending.set(id,null);asyncCommand(method,a).then(r=>pending.set(id,{ok:true,...r})).catch(e=>{say(e.message);pending.set(id,{ok:false,error:e.message});});return JSON.stringify({pending:id});
    }
    if(method==='poll'){const value=pending.get(a.ticket);if(value===null)return JSON.stringify({pending:a.ticket});pending.delete(a.ticket);return JSON.stringify(value||{ok:false,error:'请求已失效'});}
    let response={ok:true};
    switch(method){
      case 'catalog':return JSON.stringify(catalog());
      case 'view':break;
      case 'frame':advance(a.ms);break;
      case 'start':{leave();const c=a.config||localConfig(a);start(c,a.seat??(a.side==='zom'?Number(a.size)||1:0),true);break;}
      case 'action':response=dispatch(a);break;
      case 'pause':if(local&&!aborted)paused=!paused;break;
      case 'speed':if(local&&[.5,1,2,4,8,16].includes(a.value)){speed=replay?a.value:Math.min(4,Math.max(1,a.value));acc=0;}break;
      case 'seat':if(replay&&Number.isInteger(a.seat)&&state.players[a.seat])seat=a.seat;break;
      case 'seek':if(replay){seekResume=a.resume??!paused;paused=true;acc=0;seekTarget=replay.seekStart(a.tick);state=replay.state;}break;
      case 'watch_last':if(lastReplay)playRecord(lastReplay);break;
      case 'leave':leave();break;
      case 'ready':net?.ready();break;
      case 'choice':net?.choose(a.civ,a.side);break;
      case 'bot':net?.bot(a.slot,a.civ);break;
      case 'network_start':net?.start();break;
      case 'dismiss_beasts':openBeasts=false;break;
      case 'checksum':return JSON.stringify({checksum:state?Replay.checksum(state):null});
      default:throw Error('未知操作：'+method);
    }
    return JSON.stringify({...response,view:view()});
  }catch(e){say(e.message);return JSON.stringify({ok:false,error:e.message});}}
  ReplayStore.init().catch(()=>{});Progress.init().catch(()=>{});
  return {request,catalog,view,dispatch,networkEvent};
})();
