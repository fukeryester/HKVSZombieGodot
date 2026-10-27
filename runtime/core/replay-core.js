/* Input-only, fixed-tick replays. AI decisions are recorded, never re-run in playback. */
window.Replay=(()=>{
  const FORMAT=1,ENGINE='hkvz2-0.6.0',MAX_TICKS=648000,MAX_ACTIONS=250000,MAX_BYTES=16*1024*1024;
  const allowed=new Set(['spawn','worker','assign','construct','resume','demolish','cancel_training','age','repair_base','skill','resign','gm_beast','summon_beast']);
  const fields=new Set(['op','seat','unit','kind','skill','job','laneId','slot','workerId','siteId','orderId','targetSeat','count']);
  const recordings=new WeakMap(),clone=v=>JSON.parse(JSON.stringify(v));
  function checksum(state){const str=JSON.stringify(Sim.snapshot(state),(key,value)=>key==='last_ai_think'?undefined:value);let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
  function cleanAction(a){return Object.fromEntries(Object.entries(a).filter(([k])=>fields.has(k)));}
  const apply=Sim.applyAction;
  Sim.applyAction=function(state,action){const result=apply(state,action),r=recordings.get(state);if(result.ok&&r&&!r.closed){if(r.commands.length>=MAX_ACTIONS)r.error='本局指令数量超出回放上限';else r.commands.push({tick:state.tick,a:clone(cleanAction(action))});}return result;};
  function begin(state,config,seat,versionId=null){
    const players=state.players.map(p=>({team:p.team,row:p.row,civId:p.civId,isAI:p.isAI,name:p.name}));
    const r={format:FORMAT,engine:ENGINE,id:(config.session||HKVZId())+'-'+seat,versionId,startedAt:new Date().toISOString(),config:{seed:state.seed,mode:state.mode,ranked:!!config.ranked,players},seat,commands:[],closed:false,error:null};recordings.set(state,r);return r;
  }
  function finish(state,reason='finished'){const r=recordings.get(state);if(!r||r.closed)return null;r.closed=true;if(r.error)throw new Error(r.error);const result={format:r.format,engine:r.engine,id:r.id,versionId:r.versionId,startedAt:r.startedAt,endedAt:new Date().toISOString(),config:r.config,seat:r.seat,commands:r.commands,endTick:state.tick,checksum:checksum(state),completed:!!state.over,winner:state.winner,gmUsed:!!state.gmUsed,reason};validate(result);return result;}
  function validate(input){
    if(!input||input.format!==FORMAT||input.engine!==ENGINE)throw new Error('回放规则版本不匹配，请从录制时的游戏版本打开');
    if(new TextEncoder().encode(JSON.stringify(input)).length>MAX_BYTES)throw new Error('回放超过16 MiB上限');
    if(typeof input.id!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(input.id)||input.versionId!==null&&(typeof input.versionId!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(input.versionId))||!Number.isFinite(Date.parse(input.startedAt))||!Number.isFinite(Date.parse(input.endedAt))||Date.parse(input.endedAt)<Date.parse(input.startedAt))throw new Error('回放标识或录制时间无效');
    const c=input.config,ps=c?.players;
    if(!c||!Number.isInteger(c.seed)||c.seed<0||c.seed>4294967295||!Array.isArray(ps)||![2,4,6,8].includes(ps.length)||c.mode!==`${ps.length/2}v${ps.length/2}`)throw new Error('回放开局配置无效');
    for(const p of ps)if(!p||!Object.hasOwn(CIVS,p.civId)||CIVS[p.civId].side!==p.team||!Number.isInteger(p.row)||p.row<0||p.row>=ps.length/2||typeof p.isAI!=='boolean'||typeof p.name!=='string'||p.name.length>160)throw new Error('回放玩家配置无效');
    for(const team of ['hk','zom'])if(ps.filter(p=>p.team===team).length!==ps.length/2)throw new Error('回放阵营人数无效');
    if(!Number.isInteger(input.seat)||input.seat<0||input.seat>=ps.length||!Number.isInteger(input.endTick)||input.endTick<0||input.endTick>MAX_TICKS||!Array.isArray(input.commands)||input.commands.length>MAX_ACTIONS||(typeof input.checksum!=='string'||! /^[a-f0-9]{8}$/.test(input.checksum)))throw new Error('回放时长或指令数据无效');
    let previous=0;for(const cmd of input.commands){const a=cmd?.a;if(!Number.isInteger(cmd?.tick)||cmd.tick<previous||cmd.tick>input.endTick||!a||!allowed.has(a.op)||!Number.isInteger(a.seat)||a.seat<0||a.seat>=ps.length)throw new Error('回放指令顺序或座位无效');previous=cmd.tick;for(const [key,value]of Object.entries(a))if(!fields.has(key)||!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isSafeInteger(value)||typeof value==='string'&&value.length>80)throw new Error('回放指令字段无效');}
    return input;
  }
  class Player{
    constructor(record){this.record=clone(validate(record));this.cache=[];this.reset();}
    reset(){this.state=Sim.createInitialState(this.record.config);this.index=0;this.verified=false;this.error=null;}
    drain(){while(this.index<this.record.commands.length&&this.record.commands[this.index].tick===this.state.tick){const command=this.record.commands[this.index++];const result=Sim.applyAction(this.state,command.a);if(!result.ok)throw new Error('指令重放失败：'+result.err);}}
    step(count=1){try{for(let n=0;n<count&&this.state.tick<this.record.endTick;n++){this.drain();if(this.state.over)throw new Error('回放提前结束，与录制规则不一致');Sim.tickSim(this.state,Sim.DT);if(this.state.tick%900===0&&!this.cache.some(c=>c.tick===this.state.tick)){this.cache.push({tick:this.state.tick,index:this.index,snapshot:Sim.snapshot(this.state)});if(this.cache.length>12)this.cache.shift();}}
      if(this.state.tick===this.record.endTick&&!this.verified){this.drain();if(this.index!==this.record.commands.length||checksum(this.state)!==this.record.checksum)throw new Error('回放校验不一致，请使用录制版本的游戏');this.verified=true;}
      return this.state;
    }catch(error){this.error=error.message;throw error;}}
    seekStart(tick){tick=Math.max(0,Math.min(this.record.endTick,Math.floor(tick)));if(tick<this.state.tick){const nearest=this.cache.filter(c=>c.tick<=tick).sort((a,b)=>b.tick-a.tick)[0];if(nearest){Sim.applySnapshot(this.state,nearest.snapshot);this.index=nearest.index;this.verified=false;this.error=null;}else this.reset();}return tick;}
    advanceTo(tick,budget=120){const target=this.seekStart(tick);this.step(Math.min(budget,target-this.state.tick));return this.state.tick===target;}
  }
  return {FORMAT,ENGINE,MAX_BYTES,MAX_TICKS,begin,finish,validate,checksum,Player,get:state=>recordings.get(state)};
})();
