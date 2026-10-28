/* Faction abilities operate on deterministic simulation state, never rendering time. */
window.Factions=(()=>{
  const own=(s,p)=>s.units.filter(u=>u.seat===p.seat&&u.team===p.team&&u.hp>0);
  const foes=(s,p)=>s.units.filter(u=>u.team!==p.team&&u.hp>0).sort((a,b)=>Math.abs(a.x-p.baseX)-Math.abs(b.x-p.baseX)||a.id-b.id);
  const kinds=new Set(['open_science','field_hospital','emp_grid','tribal_hunt','shield_wall','fortress_watch','black_market','crossfire','triad_ambush','scrap_recycling','distributed_reboot','overclock','flesh_weave','rupture_chain','brood_incubation','gene_splice','asymmetric_grasp','colossal_molt']);
  function validate(s,p,skill){switch(skill.kind){
    case 'black_market':return p.food>=150&&p.wood>=150?'':'需要150食物和150木头';
    case 'scrap_recycling':return p.scrap>0?'':'尚无废料：先消灭敌军或回收己方机械';
    case 'flesh_weave':return p.biomass>=3&&own(s,p).some(u=>u.hp<u.hpMax)?'':'需要3生质和受伤的本方部队';
    case 'rupture_chain':return own(s,p).some(u=>u.unitId==='burst'||u.def.tier<=2)?'':'需要可引爆的本方囊肿或低阶兵';
    case 'brood_incubation':return p.biomass<8?'需要8生质':p.pop+2>p.popCap?'需要2个空闲人口':'';
    case 'colossal_molt':return own(s,p).some(u=>!u.molted)?'':'需要尚未蜕变的本方部队';
    case 'asymmetric_grasp':return foes(s,p).some(u=>u.def.tier<=2)?'':'没有可牵引的低阶敌兵';
    case 'crossfire':case 'emp_grid':return foes(s,p).length?'':'没有可作用的敌军';
    case 'fortress_watch':return p.sites.some(x=>Econ.BUILDINGS[x.kind].mounted&&x.done&&x.hp>0)?'':'需要完工的基地防御槽';
    case 'triad_ambush':return p.pop+8<=p.popCap?'':'伏击需要8个空闲人口';
    default:return '';
  }}
  function mark(s,u,kind='convert'){s.effects.push({id:s.nextEffectId++,kind,x:u.x,y:u.y,row:u.row,life:.8,initLife:.8});}
  function activate(s,p,skill,spawn){
    if(!kinds.has(skill.kind))return false;
    const units=own(s,p),enemies=foes(s,p),until=n=>s.time+n;
    switch(skill.kind){
      case 'open_science':if(p.research)p.research.ready=s.time+(p.research.ready-s.time)*.7;p.gatherUntil=until(20);break;
      case 'field_hospital':p.hospitalUntil=until(20);break;
      case 'emp_grid':for(const u of enemies){if(u.def.machine)u.stunnedUntil=Math.max(u.stunnedUntil||0,until(5));else{u.slowUntil=until(10);u.slowMul=.45;}mark(s,u,'spark');}break;
      case 'tribal_hunt':p.food+=350;p.wood+=180;p.earned+=530;break;
      case 'shield_wall':p.wallUntil=until(18);break;
      case 'fortress_watch':p.watchUntil=until(25);p.baseHp=Math.min(p.baseHpMax,p.baseHp+p.baseHpMax*.15);break;
      case 'black_market':p.food-=150;p.wood-=150;p.spent+=300;p.gold+=500;p.earned+=500;break;
      case 'crossfire':for(const u of enemies.slice(0,5)){Sim.damageUnit(s,u,700,null,true);u.slowUntil=until(5);u.slowMul=.5;mark(s,u,'fire_burst');}break;
      case 'triad_ambush':{const b=War.baseTargets(s,p.team==='hk'?'zom':'hk').sort((a,b)=>Math.abs(a.baseX-p.baseX)-Math.abs(b.baseX-p.baseX))[0];if(b)for(let i=0;i<8;i++)spawn(s,p,i<4?'blade':'pistol',{free:true,x:b.baseX+(p.team==='hk'?-1:1)*(260+i*9)});break;}
      case 'scrap_recycling':{const n=Math.min(6,p.scrap);p.scrap-=n;p.wood+=80*n;p.gold+=60*n;p.earned+=140*n;break;}
      case 'distributed_reboot':p.rebootUntil=until(16);for(const u of units)if(u.def.machine){u.hp=Math.min(u.hpMax,u.hp+u.hpMax*.3);mark(s,u,'heal');}break;
      case 'overclock':p.overclockUntil=until(14);break;
      case 'flesh_weave':p.biomass-=3;units.filter(u=>u.hp<u.hpMax).sort((a,b)=>a.hp/a.hpMax-b.hp/b.hpMax||a.id-b.id).slice(0,3).forEach(u=>{u.hp=Math.min(u.hpMax,u.hp+u.hpMax*.45);mark(s,u,'heal');});break;
      case 'rupture_chain':for(const u of units.filter(u=>u.unitId==='burst'||u.def.tier<=2).sort((a,b)=>(b.unitId==='burst')-(a.unitId==='burst')||a.id-b.id).slice(0,3)){u.hp=0;for(const t of enemies)if(Math.abs(t.x-u.x)<125)Sim.damageUnit(s,t,900,null,true);mark(s,u,'explode');}break;
      case 'brood_incubation':{p.biomass-=8;const front=units.sort((a,b)=>(p.team==='hk'?b.x-a.x:a.x-b.x))[0];for(let i=0;i<2;i++)spawn(s,p,'brute',{free:true,x:(front?.x??p.baseX)+(p.team==='hk'?1:-1)*i*15});break;}
      case 'gene_splice':p.geneUntil=until(18);break;
      case 'asymmetric_grasp':{const front=units.sort((a,b)=>(p.team==='hk'?b.x-a.x:a.x-b.x))[0];for(const u of enemies.filter(u=>u.def.tier<=2).slice(0,5)){const anchor=front?.x??p.baseX;const dest=anchor+(p.team==='hk'?50:-50);u.x+=Math.max(-220,Math.min(220,dest-u.x));u.stunnedUntil=Math.max(u.stunnedUntil||0,until(3));mark(s,u);}break;}
      case 'colossal_molt':{const u=units.filter(u=>!u.molted).sort((a,b)=>b.hpMax-a.hpMax||a.id-b.id)[0];const add=u.hpMax*.25;u.hpMax+=add;u.hp+=add;u.damageMul=1.25;u.sizeMul=1.25;u.molted=true;mark(s,u,'heal');break;}
    }
    return true;
  }
  function tick(s,dt){for(const u of s.units){if(u.hp<=0||u.beast)continue;const p=s.players[u.seat],tr=CIVS[u.civId].traits;
    if(p.baseHp<=0)continue;
    const heal=(tr.regen||0)+(tr.repair&&s.time-(u.lastDamagedAt??-999)>6?tr.repair:0)+((p.hospitalUntil||0)>s.time?u.hpMax*.02:0);
    u.hp=Math.min(u.hpMax,u.hp+heal*dt);
  }}
  function death(s,u){for(const p of s.players){if(p.baseHp<=0)continue;const tr=CIVS[p.civId].traits;
    if(tr.biomass&&((u.seat===p.seat)||u.team!==p.team))p.biomass++;
    if(p.civId==='zom_robot'&&((u.seat===p.seat&&u.def.machine)||u.team!==p.team))p.scrap++;
    if(tr.killGold&&u.team!==p.team){p.gold+=tr.killGold;p.earned+=tr.killGold;}
  }}
  return {validate,activate,tick,death};
})();
