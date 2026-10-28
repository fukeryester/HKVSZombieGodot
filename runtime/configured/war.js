/* Deterministic team comeback units and recoverable headquarters. */
window.War=(()=>{
  const ARRIVAL_CLEAR_RADIUS=320,DAMAGE_FACTOR=.8;
  const DEFS={
    zeppelin:{name:'齐柏林飞艇',team:'hk',hp:120000,dmg:3000,range:650,speed:12,atkCd:1.4,flying:true,bodyRadius:145,desc:'120000生命 · 仅远程可命中 · 慢速巡航 · 只轰炸敌军'},
    train:{name:'装甲列车',team:'hk',hp:80000,dmg:90,range:430,speed:28,atkCd:.18,bodyRadius:180,desc:'5节独立车厢×16000生命 · 加特林只扫射敌军 · 慢速往返'},
    mech:{name:'末日机甲',team:'hk',hp:90000,dmg:850,range:330,speed:10,atkCd:.75,bodyRadius:80,desc:'90000生命 · 重型巡航 · 每6秒随机技能 · 本体和技能不伤基地'},
    portal:{name:'噩梦传送门',team:'zom',hp:100000,dmg:0,range:0,speed:0,atkCd:1,bodyRadius:95,isBase:true,desc:'100000生命的固定新基地 · 每秒随机产出3–5名全僵尸文明一至三阶援军，可攻城'},
    king:{name:'僵尸之王',team:'zom',hp:30000,dmg:3500,range:140,speed:6,atkCd:4.5,bodyRadius:90,melee:true,desc:'30000生命 · 正常承伤 · 极慢巡航 · 近战处决并重生普通敌军，不攻击基地'},
    cyst:{name:'尸变体血月囊肿',team:'zom',hp:60000,dmg:0,range:0,speed:0,atkCd:1,bodyRadius:155,desc:'地图中央阻挡地面敌军 · 三条生命×60000（合计180000） · 每次破裂重创敌军，不伤基地'}
  };
  for(const [id,d]of Object.entries(DEFS))Object.assign(d,{id,dmg:Math.round(d.dmg*DAMAGE_FACTOR),cost:0,pop:0,tier:5,arch:'war_'+id,machine:d.team==='hk',controlImmune:true,noBaseAttack:true});
  function init(s){s.war={rng:(s.seed^0x7131abcd)>>>0,teams:{hk:{used:false,available:false,kind:null,seat:null,unitId:null},zom:{used:false,available:false,kind:null,seat:null,unitId:null}},shots:[]};}
  function random(s){let n=s.war.rng||1;n^=n<<13;n^=n>>>17;n^=n<<5;s.war.rng=n>>>0;return s.war.rng/4294967296;}
  const alive=u=>u.hp>0;
  function teamTotal(s,team){const ps=s.players.filter(p=>p.team===team);let current=ps.reduce((n,p)=>n+Math.max(0,p.baseHp),0),maximum=ps.reduce((n,p)=>n+p.baseHpMax,0);for(const u of s.units)if(u.beast==='portal'&&u.team===team&&u.hp>0){current+=u.hp;maximum+=u.hpMax;}return {current,maximum,ratio:maximum?current/maximum:0};}
  function teamIsAI(s,team){const players=s.players.filter(p=>p.team===team);return players.length>0&&players.every(p=>p.isAI);}
  function canSummon(s,p){const total=teamTotal(s,p.team);return !s.over&&(!p.isAI||teamIsAI(s,p.team))&&!p.resigned&&(p.gmBeastReady||!s.war.teams[p.team].used&&total.current>0&&total.ratio<=.1+1e-10);}
  function update(s){for(const team of ['hk','zom']){const t=teamTotal(s,team);s.war.teams[team].available=!s.war.teams[team].used&&t.current>0&&t.ratio<=.1+1e-10;}}
  function event(s,type,data){Sim.emitEvent(s,type,data);}
  function effect(s,kind,data,life=1){s.effects.push({id:s.nextEffectId++,kind,life,initLife:life,...data});}
  function summon(s,p,kind){const d=Object.hasOwn(DEFS,kind)?DEFS[kind]:null;if(!d||d.team!==p.team)return {ok:false,err:'请选择本阵营的战争巨兽'};if(p.isAI&&!teamIsAI(s,p.team))return {ok:false,err:'有真人的队伍由真人选择战争巨兽'};if(!canSummon(s,p))return {ok:false,err:s.war.teams[p.team].used?'友方已召唤战争巨兽，本局机会已用尽':'全队基地总耐久需不高于10%'};
    const entry=s.war.teams[p.team];p.gmBeastReady=false;entry.used=true;entry.available=false;entry.kind=kind;entry.seat=p.seat;
    const bounds=patrolBounds(s),x=kind==='cyst'?Sim.LANE_LEN/2:d.speed>0?(p.team==='hk'?bounds.left:bounds.right):p.baseX-110;
    const u={id:s.nextUnitId++,seat:p.seat,team:p.team,civId:p.civId,unitId:'war_'+kind,beast:kind,def:d,x,y:p.row*60,row:p.row,dir:p.team==='hk'?1:-1,hp:d.hp,hpMax:d.hp,speed:d.speed,bodyRadius:d.bodyRadius,cdAtk:0,atkFxTime:-999,born:s.time,popCost:0,free:true,nextSkill:s.time+6,nextSpawn:s.time+1,lives:kind==='cyst'?3:1,patrolDir:p.team==='hk'?1:-1,patrolTurns:0,turnUntil:0};
    if(kind==='train')u.parts=Array.from({length:5},(_,i)=>({id:i,hp:d.hp/5,maxHp:d.hp/5,cd:0}));s.units.push(u);entry.unitId=u.id;p.unitsBuilt++;
    // Execute ordinary troops directly; all war beasts remain immune to arrival clearing.
    const victims=s.units.filter(t=>t.team!==p.team&&!t.beast&&t.hp>0&&Math.abs(t.x-p.baseX)<=ARRIVAL_CLEAR_RADIUS);
    for(const t of victims){t.hp=0;effect(s,'war_purge',{x:t.x,y:t.y,row:t.row,flying:!!t.def.flying},1.1);}
    effect(s,'war_counterattack',{x:p.baseX,y:p.row*60,row:p.row,team:p.team,r:ARRIVAL_CLEAR_RADIUS,cleared:victims.length},3.8);
    effect(s,'war_arrival',{x,y:u.y,row:u.row,team:p.team,beast:kind},3);event(s,'war_summon',{seat:p.seat,team:p.team,kind,unitId:u.id,cleared:victims.length});return {ok:true};
  }
  function baseTargets(s,team){const list=s.players.filter(p=>p.team===team&&!p.resigned&&!p.baseRuined&&p.baseHp>0);for(const u of s.units)if(u.beast==='portal'&&u.team===team&&u.hp>0)list.push({baseX:u.x,baseHp:u.hp,baseHpMax:u.hpMax,row:u.row,seat:u.seat,team:u.team,warUnitId:u.id});return list;}
  function portalAlive(s,team){return s.players.some(p=>p.team===team&&!p.resigned)&&s.units.some(u=>u.beast==='portal'&&u.team===team&&u.hp>0);}
  function targetable(attacker,target){const d=attacker.def,melee=d.melee||/^(melee|zom_normal|zom_hopper|zom_giant|zom_banshee)/.test(d.arch||'');return !target.def.flying||!melee&&((d.range||0)>60||!!d.lobber);}
  const aimY=u=>u.y-(u.def.flying?205:25);
  function trainParts(u){const live=u.parts.filter(p=>p.hp>0);return live.map((p,i)=>({...p,x:u.x+(i-(live.length-1)/2)*73}));}
  function hit(s,u,amount,attacker){
    if(attacker&&!targetable(attacker,u))return true;
    if(!u.beast)return false;
    if(u.beast==='portal'&&amount>=u.hp){u.hp=0;death(s,u);return true;}
    if(u.beast==='train'){const parts=trainParts(u),part=parts.sort((a,b)=>Math.abs(a.x-(attacker?.x??u.x))-Math.abs(b.x-(attacker?.x??u.x))||a.id-b.id)[0];if(!part)return true;const actual=u.parts.find(p=>p.id===part.id);actual.hp=Math.max(0,actual.hp-amount);if(actual.hp===0){effect(s,'war_wagon_burst',{x:part.x,y:u.y,row:u.row},1.3);event(s,'war_wagon_destroyed',{seat:u.seat,unitId:u.id,part:part.id});}u.hp=u.parts.reduce((n,p)=>n+p.hp,0);u.bodyRadius=Math.max(38,u.parts.filter(p=>p.hp>0).length*36.5);u.lastDamagedAt=s.time;return true;}
    if(u.beast==='cyst'&&amount>=u.hp){u.lives--;u.hp=u.lives>0?u.hpMax:0;effect(s,'war_bloodmoon',{x:u.x,y:u.y,row:u.row,lives:u.lives},3);event(s,'war_cyst_burst',{seat:u.seat,lives:u.lives});for(const t of s.units.filter(t=>t.team!==u.team&&!t.def.isBase&&t.hp>0))percentDamage(s,t,.75*DAMAGE_FACTOR);return true;}
    return false;
  }
  function percentDamage(s,u,ratio){if(u.hp<=0)return;if(u.beast==='train'){for(const part of trainParts(u)){const actual=u.parts.find(p=>p.id===part.id);actual.hp=Math.max(0,actual.hp-actual.maxHp*ratio);if(actual.hp===0)effect(s,'war_wagon_burst',{x:part.x,y:u.y,row:u.row},1.3);}u.hp=u.parts.reduce((n,p)=>n+p.hp,0);u.bodyRadius=Math.max(38,u.parts.filter(p=>p.hp>0).length*36.5);u.lastDamagedAt=s.time;}else Sim.damageUnit(s,u,u.hpMax*ratio,null,true);}
  function block(s,u,next){if(u.def.flying)return next;for(const c of s.units){if(c.beast!=='cyst'||c.hp<=0||c.team===u.team)continue;const left=c.x-c.def.bodyRadius-3,right=c.x+c.def.bodyRadius+3;if(u.x<=left&&next>left)next=left;else if(u.x>=right&&next<right)next=right;else if(u.x>left&&u.x<right)next=u.x<c.x?left:right;}return next;}
  function nearEnemy(s,u,range=Infinity,x=u.x){return s.units.filter(t=>t.team!==u.team&&!t.def.isBase&&t.hp>0&&targetable(u,t)&&Math.max(0,Math.abs(t.x-x)-(t.bodyRadius??t.def.bodyRadius??0))<=range).sort((a,b)=>Math.max(0,Math.abs(a.x-x)-(a.bodyRadius??a.def.bodyRadius??0))-Math.max(0,Math.abs(b.x-x)-(b.bodyRadius??b.def.bodyRadius??0))||a.id-b.id)[0];}
  function patrolBounds(s){return {left:Math.max(...s.players.filter(p=>p.team==='hk').map(p=>p.baseX))+110,right:Math.min(...s.players.filter(p=>p.team==='zom').map(p=>p.baseX))-110};}
  // Route direction is separate from weapon facing so enemies cannot reverse the patrol.
  function patrol(s,u,dt){const {left,right}=patrolBounds(s);u.x=Math.max(left,Math.min(right,u.x));u.moving=false;if(s.time<u.turnUntil)return;const direction=u.patrolDir||u.dir,end=direction>0?right:left,before=u.x;u.dir=direction;u.x=block(s,u,u.x+direction*Math.min(u.speed*dt,Math.abs(end-u.x)));u.moving=Math.abs(u.x-before)>1e-8;
    if(Math.abs(u.x-end)<1e-8){u.patrolDir=-direction;u.patrolTurns=(u.patrolTurns||0)+1;u.turnUntil=s.time+.8;}
  }
  function shot(s,u,target,kind='war_tracer',damage=u.def.dmg,radius=0,x=u.x){if(target.def.isBase)return;const tx=target.x;u.atkFxTime=s.time;
    if(kind==='war_bomb')s.war.shots.push({at:s.time+.8,x:tx,team:u.team,damage,attacker:u.id,radius:radius||150});
    else if(radius){for(const t of s.units)if(t.team!==u.team&&!t.def.isBase&&t.hp>0&&Math.abs(t.x-tx)<radius)Sim.damageUnit(s,t,damage,u);}else Sim.damageUnit(s,target,damage,u);
    effect(s,kind,{x,y:u.y,row:u.row,tx,ty:aimY(target),toRow:target.row,team:u.team,flying:!!u.def.flying},kind==='war_bomb'?.8:.2);
  }
  function reinforcement(s,p,x){const pool=[];for(const cid of ZOM_CIVS)for(const [uid,d]of Object.entries(CIVS[cid].units))if(d.tier<=3)pool.push([cid,uid]);const [cid,uid]=pool[Math.floor(random(s)*pool.length)];return Sim.spawnUnit(s,p,uid,{civId:cid,reinforcement:true,x,y:p.row*60});}
  function castMech(s,u,mode=Math.floor(random(s)*4)){const foes=s.units.filter(t=>t.team!==u.team&&!t.def.isBase&&t.hp>0),anchor=foes[Math.floor(random(s)*Math.max(1,foes.length))],x=anchor?.x??Math.max(0,Math.min(Sim.LANE_LEN,u.x+u.dir*300));
    u.active={mode,until:s.time+4,nextAt:s.time+.2,shots:0,x,done:false,targets:[]};
    if(mode===3){u.active.targets=foes.filter(t=>!t.beast).sort((a,b)=>b.hp-a.hp||a.id-b.id).slice(0,3).map(t=>t.id);u.active.killAt=s.time+1;for(const id of u.active.targets){const t=s.units.find(t=>t.id===id);effect(s,'war_execution',{x:t.x,y:t.y,row:t.row,unitId:id},1.15);}}
    if(mode===2)effect(s,'war_laser',{x:u.x,y:u.y,row:u.row,team:u.team,dir:u.dir,unitId:u.id},4);
    effect(s,'war_skill',{x:u.x,y:u.y,row:u.row,team:u.team,mode},1.8);event(s,'war_mech_skill',{seat:u.seat,unitId:u.id,mode});
  }
  function tickMechSkill(s,u){const a=u.active;if(!a||s.time>a.until+1e-8)return;
    if(a.mode===3){if(!a.done&&s.time>=a.killAt){a.done=true;for(const id of a.targets){const t=s.units.find(t=>t.id===id&&t.hp>0&&!t.beast);if(t){t.hp=0;effect(s,'war_execution_hit',{x:t.x,y:t.y,row:t.row},1);}}}return;}
    const period=a.mode===1?.1:.2;
    while(a.nextAt<=s.time+1e-8&&a.nextAt<=a.until+1e-8){a.nextAt+=period;
      if(a.mode===0){for(const t of s.units)if(t.team!==u.team&&!t.def.isBase&&t.hp>0){Sim.damageUnit(s,t,t.hpMax*.006*DAMAGE_FACTOR,u,true);effect(s,'war_tracer',{x:u.x,y:u.y,row:u.row,tx:t.x,ty:aimY(t),toRow:t.row,team:u.team},.16);}}
      if(a.mode===1&&a.shots<20){a.shots++;const x=a.x+(random(s)-.5)*230;s.war.shots.push({at:s.time+.65,x,team:u.team,damage:2800*DAMAGE_FACTOR,attacker:u.id});effect(s,'war_missile',{x:u.x,y:u.y,row:u.row,tx:x,ty:0,team:u.team},.65);}
      if(a.mode===2){for(const t of s.units)if(t.team!==u.team&&!t.def.isBase&&t.hp>0&&(t.x-u.x)*u.dir>=0){Sim.damageUnit(s,t,t.hpMax*.002*DAMAGE_FACTOR,u,true);t.warBleed={until:s.time+6,damage:t.hpMax*.01*DAMAGE_FACTOR};}}
    }
  }
  function tick(s,dt){
    for(const hit of s.war.shots.filter(h=>h.at<=s.time)){const attacker=s.units.find(u=>u.id===hit.attacker)||{def:DEFS.mech,dir:1,x:hit.x};for(const t of s.units)if(t.team!==hit.team&&!t.def.isBase&&t.hp>0&&Math.abs(t.x-hit.x)<(hit.radius||95))Sim.damageUnit(s,t,hit.damage,attacker);effect(s,'war_impact',{x:hit.x,y:0,r:95,team:hit.team},1);}
    s.war.shots=s.war.shots.filter(h=>h.at>s.time);
    for(const u of s.units.slice()){if(u.hp<=0)continue;if(u.warBleed?.until>s.time)Sim.damageUnit(s,u,u.warBleed.damage*dt,null,true);if(!u.beast||u.hp<=0)continue;
      const p=s.players[u.seat];u.cdAtk=Math.max(0,u.cdAtk-dt);
      if(u.beast==='portal'){while(u.nextSpawn<=s.time+1e-8){u.nextSpawn+=1;const count=3+Math.floor(random(s)*3);for(let i=0;i<count;i++)reinforcement(s,p,u.x-70-i*12);effect(s,'war_portal_spawn',{x:u.x,y:u.y,row:u.row},.7);}continue;}
      if(u.beast==='cyst'){for(const t of s.units)if(t.team!==u.team&&!t.def.flying&&t.hp>0)t.x=block(s,t,t.x);continue;}
      patrol(s,u,dt);
      if(u.beast==='train'){
        for(const part of trainParts(u)){const actual=u.parts.find(p=>p.id===part.id);actual.cd-=dt;if(actual.cd>0)continue;const target=nearEnemy(s,u,u.def.range,part.x);if(target){shot(s,u,target,'war_tracer',u.def.dmg,0,part.x);actual.cd=u.def.atkCd;actual.lastShot=s.time;}}continue;
      }
      const target=nearEnemy(s,u,u.def.range);if(target)u.dir=target.x>=u.x?1:-1;
      if(u.beast==='mech'){if(s.time>=u.nextSkill){u.nextSkill+=6;if(nearEnemy(s,u))castMech(s,u);}tickMechSkill(s,u);}
      if(!target||u.cdAtk>0)continue;
      if(u.beast==='king'){if(target.beast)Sim.damageUnit(s,target,u.def.dmg,u);const victims=s.units.filter(t=>t.team!==u.team&&t.hp>0&&!t.beast&&!t.def.flying&&Math.abs(t.x-u.x)<=u.def.range);for(const t of victims){t.hp=0;reinforcement(s,p,t.x);effect(s,'war_infection',{x:t.x,y:t.y,row:t.row},1);}effect(s,'war_king_slam',{x:u.x,y:u.y,row:u.row,r:170},1);event(s,'war_king_attack',{seat:u.seat});u.atkFxTime=s.time;}
      else shot(s,u,target,u.beast==='zeppelin'?'war_bomb':'war_tracer',u.def.dmg,u.beast==='zeppelin'?150:u.beast==='mech'?65:0);
      u.cdAtk=u.def.atkCd;
    }
    update(s);
  }
  function destroyed(s,p){if(p.baseRuined||p.resigned)return;p.baseHp=0;p.baseRuined=true;p.destroyedAt=s.time;p.baseDeaths=(p.baseDeaths||0)+1;
    for(const type of ['army','worker'])for(const q of Econ.orders(p,type).filter(q=>q.laneId===type+':base').slice())Econ.cancel(p,type,q.id,s.time);
    for(const u of s.units)if(u.team!==p.team&&u.hp>0&&Math.abs(u.x-p.baseX)<=230)percentDamage(s,u,.25);
    effect(s,'base_burst',{x:p.baseX,y:p.row*60,row:p.row,team:p.team,r:230},3);event(s,'base_destroyed',{seat:p.seat,x:p.baseX,row:p.row});
  }
  function updateBases(s){for(const p of s.players){if(p.baseHp<=0){p.baseHp=0;destroyed(s,p);}else if(p.baseRuined&&p.baseHp>=p.baseHpMax&&!p.resigned){p.baseRuined=false;event(s,'base_restored',{seat:p.seat});}}}
  function death(s,u){if(u.warDied)return;u.warDied=true;if(u.beast==='portal'){for(const t of s.units)if(t.team!==u.team&&!t.def.isBase&&t.hp>0&&Math.abs(t.x-u.x)<=230)percentDamage(s,t,.25*DAMAGE_FACTOR);}effect(s,'war_death',{x:u.x,y:u.y,row:u.row,beast:u.beast},3);event(s,'war_destroyed',{seat:u.seat,kind:u.beast});}
  return {DEFS,ARRIVAL_CLEAR_RADIUS,DAMAGE_FACTOR,init,random,teamTotal,teamIsAI,canSummon,update,summon,baseTargets,portalAlive,targetable,aimY,trainParts,hit,percentDamage,block,patrolBounds,tick,castMech,destroyed,updateBases,death};
})();
