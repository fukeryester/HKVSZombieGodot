/* sim.js — 香港大战僵尸2的核心 RTS 仿真
   -----------------------------------------------------------------
   设计要点：
   - 30Hz 固定步进（DT_MS = 33.333）
   - 单条中路（1D 坐标 x：0=香港基地，LANE=僵尸基地）
   - Y 只作视觉分层（不影响战斗逻辑）
   - 所有随机数走 seed 化 PRNG（联机可用）
   - 状态是一个纯 JS 对象树，方便 JSON 广播 & 客户端重建
   -----------------------------------------------------------------
*/

const LANE_LEN = 1800;          // 战线长度（游戏单位；渲染时按画布缩放）
const HQ_HK_X = 330;             // 香港基地 x
const HQ_ZOM_X = LANE_LEN - 330; // 僵尸基地 x
const DT_MS = 1000 / 30;        // 30Hz
const DT = DT_MS / 1000;
const SPAWN_BEHIND_BASE = 78;    // 从基地背向战线的一侧入场，避免贴脸单位抢走攻城仇恨
const BASE_ATTACK_RANGE = 200;
const BASE_ATTACK_CD = 0.85;
const BASE_HP_BONUS_2V2 = 1200;

// 简单可复现的 PRNG（Mulberry32）
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===============================================================
// 初始化状态
// ===============================================================
/** players: [{seat, team:"hk"|"zom", isAI, civId, name}] （长度=座位数） */
function createInitialState(config) {
  const seed = config.seed ?? Math.floor(Math.random() * 0xffffffff);
  const mode = config.mode || (config.players && config.players.length >= 6 ? "3v3"
                              : config.players && config.players.length >= 4 ? "2v2" : "1v1");
  const isTeamGame = mode !== "1v1";
  const state = {
    tick: 0,
    time: 0,
    seed,
    mode,
    over: false,
    gmUsed: false,
    winner: null,             // "hk" | "zom"
    over_time: 0,             // 结束时的 time
    players: [],              // 见下（含 baseHp / baseHpMax / baseX）
    units: [],                // 战场单位
    effects: [],              // 视觉效果 & 大招驻留
    projectiles: [],          // 投石/子弹（简化）
    nextUnitId: 1,
    nextEffectId: 1,
    nextProjectileId: 1,
    corpses: [],              // 尸体（渲染用，仿真里只保留 2s）
  };

  // 初始化玩家（每人一座基地）
  config.players.forEach((p, i) => {
    const civ = CIVS[p.civId];
    if (!civ) { console.warn("unknown civ", p.civId); return; }
    const row = p.row || 0;
    const isHK = p.team === "hk";
    // 每玩家一座基地：row=0 靠中路（前排），row=1 更靠边（后排，视觉更小）
    const baseX = isHK
      ? (HQ_HK_X + row * 44)
      : (HQ_ZOM_X - row * 44);
    const hqDef = civ.buildings[B.HQ] || { hp: 1000 };
    const baseHpInit = hqDef.hp || 1000;
    const hpBonus = isTeamGame ? BASE_HP_BONUS_2V2 : 0;
    const baseHp = baseHpInit + hpBonus;
    state.players.push({
      seat: i,                  // 全局座位 (0..N-1)
      team: p.team,
      isAI: !!p.isAI,
      gmBeastReady: false,
      civId: p.civId,
      name: p.name || (p.isAI ? "AI" : "Player " + (i+1)),
      row,                      // 0=前, 1=后
      baseX,
      baseHp, baseHpMax: baseHp,
      baseHpInit,               // 升本加成按文明原 HQ 血量算，2v2 的 +8000 不参与倍率
      baseRegen: civ.baseRegen || 0,   // 基地被动回血速率（HP/秒，脱战 5 秒后）
      lastHitTime: -999,                // 上次基地被击时间；开局默认可以立即回
      baseAttackCd: 0,                  // 基地远程防御攻击冷却
      gold: 0,
      income: civ.baseIncome,
      pop: 0,
      popCap: civ.baseCap,
      energy: 0,
      built: { [B.HQ]: 1 },     // 已建建筑及数量
      queue: [],                // 出兵队列 [{unitId, ready: absTime}]
      trainedByTech: {},        // AI 节奏：记录各科技层已训练的单位数
      cd: {},                   // 建筑/兵种冷却结束时间
      last_ai_think: 0,         // AI 思考节拍
      kills: 0, killsGold: 0, unitsBuilt: 0, buildingsBuilt: 0,
      spent: 0, earned: 0,
      alive: true,resigned:false,baseRuined:false,baseDeaths:0,
    });
    Econ.init(state.players.at(-1));
  });

  War.init(state);
  return state;
}

// ---- 多基地辅助 ----
function teamAlive(state, team) {
  return state.players.some(p => p.team === team && !p.resigned && !p.baseRuined && p.baseHp > 0)||War.portalAlive(state,team);
}
function nearestBase(state, team, x) {
  let best = null, bd = Infinity;
  for (const p of War.baseTargets(state,team)) {
    const d = Math.abs(p.baseX - x);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
// 队伍总血/总血上限（HUD/兼容用）
function teamHpSum(state, team) {
  let hp = 0, hpMax = 0;
  for (const p of state.players) {
    if (p.team !== team) continue;
    hp += Math.max(0, p.baseHp);
    hpMax += p.baseHpMax;
  }
  return { hp, hpMax: hpMax || 1 };
}
// 攻击基地能量倍率：每 1 点造成的基地伤害给攻击方所有玩家 BASE_HIT_ENERGY 点能量。
// 需要略高于击杀等值伤害的收益（击杀公式里 hp 系数只有 0.08），
// 但也不能让一次全推直接顶满 9999。3 倍是甜点。
const BASE_HIT_ENERGY = 3;
function damageBase(state, base, amount, attackerTeam, tier=4) {
  amount*=[0,.18,.35,.85,1][tier]||1;
  if (!base || base.baseHp <= 0 || base.baseRuined) return;
  if(base.warUnitId){const u=state.units.find(u=>u.id===base.warUnitId);if(u)damageUnit(state,u,amount,null);return;}
  const shielded = (base.baseShieldUntil || 0) > state.time;
  const reduction = shielded ? (base.baseShieldReduction || 0) : 0;
  const dealt = amount * (1 - reduction);
  base.baseHp = Math.max(0,base.baseHp-dealt);
  base.lastHitTime = state.time;
  if(state.time-(base.jellyStartedAt??-999)>=.45)base.jellyStartedAt=state.time;
  if(state.time-(base.lastWarning??-999)>.9){base.lastWarning=state.time;emitEvent(state,'base_hit',{seat:base.seat});}
  if(base.baseHp<=0)War.destroyed(state,base);
  const team = attackerTeam || (base.team === "hk" ? "zom" : "hk");
  const attackers = state.players.filter(pp => pp.team === team);
  if (attackers.length > 0) {
    const per = (dealt * BASE_HIT_ENERGY) / attackers.length;
    attackers.forEach(pp => { pp.energy = Math.min(9999, pp.energy + per); });
  }
}

// Every conversion path shares this age and machine immunity rule.
function canConvert(u){return u.hp>0&&u.def.tier<=2&&!u.def.controlImmune&&!u.charmedBy;}
function damageUnit(state,target,amount,attacker,pure=false){
  if(target.hp<=0||target.def.isBase&&attacker?.def.noBaseAttack)return;
  const owner=state.players[target.seat],tr=CIVS[target.civId].traits;
  if(attacker&&!War.targetable(attacker,target))return;
  if(!pure){
  if(attacker){
    if(!target.beast&&target.def.tier>=3&&attacker.def.tier<=2)amount*=.15;
    if(attacker.def.vsMachine&&target.def.machine)amount*=attacker.def.vsMachine;
    if(attacker.def.vsLarge&&(/giant|tank/.test(target.def.arch)||target.civId==='zom_asym'))amount*=attacker.def.vsLarge;
    if(target.def.evasion&&(attacker.def.range||24)<60)amount*=target.def.evasion;
    if(attacker.def.burn||attacker.def.bleed)target.poison={dmg:(attacker.def.burn||attacker.def.bleed),until:state.time+4};
    if(attacker.def.slow){target.slowUntil=state.time+2;target.slowMul=attacker.def.slow;}
    if(attacker.def.knockback)target.x=Math.max(60,Math.min(LANE_LEN-60,target.x+attacker.dir*attacker.def.knockback));
  }
  amount*=target.def.armor||1;
  if(tr.armor&&(target.def.range||24)<70)amount*=tr.armor;
  if((owner.wallUntil||0)>state.time&&(target.def.range||24)<70)amount*=.4;
  if((owner.geneUntil||0)>state.time)amount*=.6;
  if((owner.rebootUntil||0)>state.time&&target.def.machine)amount*=.75;
  if((owner.overclockUntil||0)>state.time&&target.def.machine)amount*=1.25;
  }
  if(War.hit(state,target,amount,attacker))return;
  target.hp-=amount;target.lastDamagedAt=state.time;
}

// ===============================================================
// 玩家动作接口（供 UI / AI / 网络转发）
// ===============================================================
// action 结构约定（全部纯数据）：
//   { op:"build",   seat, kind:"income|pop|tech_a|tech_b|tech_c" }
//   { op:"spawn",   seat, unit:"intern" }
//   { op:"skill",   seat, skill:"angry_mob" }
//   { op:"resign",  seat }   // 离场认输：该座位基地血量清零
function applyAction(state, act) {
  if (state.over) return { ok:false, err:"over" };
  if(!act||!Number.isInteger(act.seat)||act.seat<0||act.seat>=state.players.length)return {ok:false,err:"无效座位"};
  const p = state.players[act.seat];
  if (!p) return { ok:false, err:"no seat" };
  const civ = CIVS[p.civId];
  if(p.resigned)return {ok:false,err:'该玩家已退出战斗'};
  if(act.op==='gm_beast'){if(p.isAI)return {ok:false,err:'AI不能开启GM'};state.gmUsed=true;p.gmBeastReady=true;return {ok:true};}
  if(act.op==='summon_beast')return War.summon(state,p,act.kind);
  if((p.baseHp<=0||p.baseRuined)&&!['repair_base','assign','construct','resume','demolish','cancel_training','worker','spawn','resign'].includes(act.op))return {ok:false,err:'请先派农民维修基地'};
  if (["worker","assign","construct","resume","age","cancel_training","demolish","repair_base"].includes(act.op)) return Econ.action(state,p,act);

  switch (act.op) {
    case "build": return {ok:false,err:"请派农民建造"};
    case "spawn": return doSpawn(state, p, civ, act.unit,act.laneId);
    case "skill": return doSkill(state, p, civ, act.skill);
    case "resign":
      p.baseHp = 0;p.resigned=true;p.baseRuined=true;
      return { ok:true };
    default: return { ok:false, err:"unknown op" };
  }
}

function doSpawn(state, p, civ, unitId,laneId) {
  const u = Object.hasOwn(civ.units,unitId)?civ.units[unitId]:null;
  if (!u) return { ok:false, err:"no such unit" };
  if (u.prereq && !p.built[u.prereq]) return { ok:false, err:"prereq" };
  return Econ.enqueue(p,'army',state.time,{unitId,duration:u.buildTime,cost:Econ.unitCost(u),pop:u.pop},laneId);
}

function skillCdRemain(p, skill, now) {
  if (!p || !skill) return 0;
  const readyAt = (p.cd && p.cd["skill_" + skill.id]) || 0;
  return Math.max(0, readyAt - (now || 0));
}

function doSkill(state, p, civ, skillId) {
  if (!civ.skills.includes(skillId)) return { ok:false, err:"not owned" };
  const s = SKILLS[skillId];
  if (!s) return { ok:false, err:"no skill" };
  if(p.age<(s.age||1))return {ok:false,err:'该技能需要时代 '+s.age};
  const invalid=Factions.validate(state,p,s);if(invalid)return {ok:false,err:invalid};
  if(s.kind==='hostile_takeover'&&!state.units.some(u=>u.team!==p.team&&canConvert(u)))return {ok:false,err:'没有可转化的低阶敌兵'};
  if (p.energy < s.cost) return { ok:false, err:"energy" };
  if (skillCdRemain(p, s, state.time) > 0) return { ok:false, err:"cd" };

  p.energy -= s.cost;
  if (s.cd > 0) {
    p.cd = p.cd || {};
    p.cd["skill_" + s.id] = state.time + s.cd;
  }
  applySkill(state, p, s);
  emitEvent(state, "skill", { seat: p.seat, skill: skillId });
  return { ok:true };
}

function applySkill(state, p, s) {
  const isHK = p.team === "hk";
  const spawnX = p.baseX + (isHK ? -SPAWN_BEHIND_BASE : SPAWN_BEHIND_BASE);
  const dir = isHK ? +1 : -1;

  if(Factions.activate(state,p,s,spawnUnit))return;
  switch (s.kind) {
    case "summon": {
      const civ = CIVS[p.civId];
      const summonList = (s.byCiv && s.byCiv[p.civId]) || s.units || [];
      summonList.forEach(([token, n]) => {
        // token 既可以是明确 unitId，也可以是通用 arch 名。
        let template = null;
        if (civ.units[token]) {
          template = { id: token, def: civ.units[token] };
        } else {
          for (const [uid, u] of Object.entries(civ.units)) {
            if (u.arch === token) { template = { id: uid, def: u }; break; }
          }
        }
        if (!template) {
          const uid = Object.keys(civ.units)[0];
          template = { id: uid, def: civ.units[uid] };
        }
        for (let i = 0; i < n; i++) {
          spawnUnit(state, p, template.id, {
            x: spawnX + (dir * i * 10),
            y: p.row * 60,
            speedMul: s.speedMul || 1,
            free: true,          // 免资源，仍占人口
          });
        }
      });
      break;
    }
    case "harvester": {
      // 建立一个持续实体，从起点直冲对方基地，路径上单位受伤
      state.effects.push({
        id: state.nextEffectId++,
        kind: "harvester",
        team: p.team,
        x: spawnX, dir, dmg: s.dmg, hp: s.hp, speed: s.speed,
        w: 60, seat: p.seat,
      });
      break;
    }
    case "airstrike": {
      // 直接对全部敌军 -HP，加视觉
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      state.units.forEach(u => {
        if (u.team === enemyTeam) damageUnit(state,u,Math.min(1800,u.hpMax*.4),null,true);
      });
      state.effects.push({
        id: state.nextEffectId++,
        kind: "airstrike", team: p.team, life: 1.5, seat: p.seat,
      });
      break;
    }
    case "barrage": {
      // 从对方阵地上空落下 count 个 unit
      const civ = CIVS[p.civId];
      const template = civ.units[s.unit] || civ.units[Object.keys(civ.units)[0]];
      const uid = Object.keys(civ.units).find(k => civ.units[k] === template) || Object.keys(civ.units)[0];
      const rng = makeRng(state.seed + state.tick + p.seat * 7);
      for (let i = 0; i < s.count; i++) {
        const x = HQ_HK_X + 200 + rng() * (LANE_LEN - 400);
        state.projectiles.push({
          id: state.nextProjectileId++,
          kind: "barrage_zombie",
          team: p.team,
          x_from: x, y_from: p.row * 60 -180,
          fromRow:p.row, toRow:p.row,
          x_to: x, y_to: p.row * 60,
          t: 0, dur: 1.4,
          unitId: uid, seat: p.seat,
        });
      }
      break;
    }
    case "buff_econ": {
      p.gold += s.cash;
      p.earned += s.cash;
      p.popCap += s.popBonus;
      // 60s 后回退
      state.effects.push({
        id: state.nextEffectId++, kind:"buff_econ_expire", seat: p.seat,
        life: s.dur, popBonus: s.popBonus,
      });
      break;
    }
    case "buff_army": {
      state.effects.push({
        id: state.nextEffectId++, kind:"buff_army", team: p.team,
        moveMul: s.moveMul, atkMul: s.atkMul, life: s.dur, seat: p.seat,
      });
      break;
    }
    case "poison": {
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      state.units.forEach(u => {
        if (u.team === enemyTeam) {
          u.poison = { dmg: (u.hpMax * s.dmg) / s.dur, until: state.time + s.dur };
        }
      });
      state.effects.push({
        id: state.nextEffectId++, kind:"poison_cloud", team: p.team, life: s.dur, seat: p.seat,
      });
      break;
    }
    case "income_surge": {
      p.gold += s.cash;
      p.earned += s.cash;
      p.income += s.income;
      state.effects.push({
        id: state.nextEffectId++, kind:"income_surge_expire", seat:p.seat,
        life:s.dur, income:s.income,
      });
      break;
    }
    case "hostile_takeover": {
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      state.units
        .filter(u => u.team === enemyTeam && canConvert(u))
        .sort((a, b) => b.def.cost - a.def.cost)
        .slice(0, s.count)
        .forEach(u => {
          u.charmedBy = { team:u.team, until:state.time + s.dur };
          u.team = p.team;
          u.dir = isHK ? +1 : -1;
        });
      break;
    }
    case "base_fortify": {
      p.baseHp = Math.min(p.baseHpMax, p.baseHp + p.baseHpMax * s.heal);
      p.baseShieldReduction = s.reduction;
      p.baseShieldUntil = state.time + s.dur;
      state.effects.push({
        id:state.nextEffectId++, kind:"base_shield", seat:p.seat,
        x:p.baseX, life:s.dur,
      });
      break;
    }
    case "fire_rain": {
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      const enemies = state.units.filter(u => u.team === enemyTeam && u.hp > 0);
      const rng = makeRng(state.seed + state.tick * 31 + p.seat);
      for (let i = 0; i < s.count && enemies.length; i++) {
        const anchor = enemies[(rng() * enemies.length) | 0];
        const x = anchor.x + (rng() - 0.5) * 90;
        state.units.forEach(u => {
          if (u.team === enemyTeam && Math.abs(u.x - x) < s.radius) damageUnit(state,u,s.dmg,null,true);
        });
        state.effects.push({
          id:state.nextEffectId++, kind:"fire_burst", x, y:anchor.y,
          r:s.radius, life:0.8, initLife:0.8,
        });
      }
      break;
    }
    case "stun": {
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      state.units.forEach(u => {
        if (u.team === enemyTeam) u.stunnedUntil = Math.max(u.stunnedUntil || 0, state.time + s.dur);
      });
      break;
    }
    case "precision_strike": {
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      state.units
        .filter(u => u.team === enemyTeam && u.hp > 0)
        .sort((a, b) => (b.def.cost + b.def.dmg * 8) - (a.def.cost + a.def.dmg * 8))
        .slice(0, s.count)
        .forEach(u => {
          damageUnit(state,u,s.dmg,null,true);
          state.effects.push({
            id:state.nextEffectId++, kind:"spark", x:u.x, y:u.y,
            life:0.45, initLife:0.45,
          });
        });
      break;
    }
    case "elite_drop": {
      for (const [unitId, count] of s.units) {
        for (let i = 0; i < count; i++) {
          spawnUnit(state, p, unitId, {
            x:spawnX + dir * i * 14, y:p.row * 60, free:true,
          });
        }
      }
      break;
    }
    case "lane_spawn": {
      const rng = makeRng(state.seed + state.tick * 43 + p.seat);
      for (let i = 0; i < s.count; i++) {
        spawnUnit(state, p, s.unit, {
          x:HQ_HK_X + 180 + rng() * (LANE_LEN - 360),
          y:p.row * 60 + (rng() - 0.5) * 30, free:true,
        });
      }
      break;
    }
    case "army_heal": {
      state.units.forEach(u => {
        if (u.team === p.team) u.hp = Math.min(u.hpMax, u.hp + u.hpMax * s.heal);
      });
      break;
    }
    case "flank_spawn": {
      const enemyBase = nearestBase(state, isHK ? "zom" : "hk", p.baseX);
      if (!enemyBase) break;
      for (let i = 0; i < s.count; i++) {
        const flankDir = isHK ? -1 : +1;
        const u = spawnUnit(state, p, s.unit, {
          x:enemyBase.baseX + flankDir * (70 + i * 8),
          y:enemyBase.row * 60 + (i - s.count / 2) * 5, free:true,
        });
        if (u) {
          u.dir = -flankDir;
        }
      }
      break;
    }
    case "soul_drain": {
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      let drained = 0;
      state.units.forEach(u => {
        if (u.team !== enemyTeam || u.hp <= 0) return;
        const amount = Math.min(u.hp - 1, u.hp * s.ratio);
        if (amount > 0) {const before=u.hp;damageUnit(state,u,amount,null,true);drained+=Math.max(0,before-u.hp);}
      });
      p.baseHp = Math.min(p.baseHpMax, p.baseHp + drained);
      break;
    }
    case "mirror_shift": {
      const enemyTeam = p.team === "hk" ? "zom" : "hk";
      state.units
        .filter(u => u.team === enemyTeam && u.hp > 0)
        .sort((a, b) => Math.abs(a.x - p.baseX) - Math.abs(b.x - p.baseX))
        .slice(0, s.count)
        .forEach(u => {
          u.x = Math.max(HQ_HK_X + 80, Math.min(HQ_ZOM_X - 80,
            u.x + (enemyTeam === "hk" ? -s.distance : s.distance)));
        });
      break;
    }
    case "evolve": {
      const civ = CIVS[p.civId];
      const nextDef = civ.units[s.to];
      state.units
        .filter(u => u.seat === p.seat && u.unitId === s.from && u.hp > 0)
        .slice(0, s.count)
        .forEach(u => {
          const hpRatio = u.hp / u.hpMax;
          u.unitId = s.to;
          u.def = nextDef;
          u.hpMax = nextDef.hp;
          u.hp = Math.max(1, nextDef.hp * hpRatio);
          u.speed = nextDef.speed;
          if(u.charmedBy&&nextDef.tier>=3){u.team=u.charmedBy.team;u.dir=u.team==='hk'?1:-1;u.charmedBy=null;}
        });
      break;
    }
    case "radiation_field": {
      state.effects.push({
        id:state.nextEffectId++, kind:"radiation_field", team:p.team,
        dmg:s.dmg, life:s.dur, seat:p.seat,
      });
      break;
    }
  }
}

// 内部：创建一个单位
function spawnUnit(state, p, unitId, opt) {
  const civ = CIVS[opt?.civId||p.civId];
  const def = civ.units[unitId];
  if (!def) return null;
  opt = opt != null ? opt : {};
  if(opt.free&&!opt.reinforcement){if(p.pop+def.pop>p.popCap)return null;p.pop+=def.pop;}
  const isHK = p.team === "hk";
  // 出生位置抖动（确定性 RNG，联机同步安全）：避免所有兵在完全同一点叠罗汉
  const spawnRng = makeRng((state.nextUnitId | 0) * 2654435761 + p.seat * 977 + (state.seed | 0));
  const jitterX = (spawnRng() - 0.5) * 26;   // ±13 px
  const jitterY = (spawnRng() - 0.5) * 22;   // ±11 px
  const u = {
    id: state.nextUnitId++,
    seat: p.seat,
    team: p.team,
    civId: opt.civId||p.civId,
    unitId,
    def,
    x: opt.x != null ? opt.x : (p.baseX + (isHK ? -SPAWN_BEHIND_BASE : SPAWN_BEHIND_BASE) + jitterX),
    y: opt.y != null ? opt.y : (p.row * 60 + jitterY),
    row: p.row,
    dir: isHK ? +1 : -1,
    hp: def.hp,
    hpMax: def.hp,
    speed: def.speed * (opt.speedMul || 1),
    cdAtk: 0,
    charmedBy: null,   // 被牧师/审计师转化：{ team, until }
    poison: null,      // { dmg, until }
    jumpUntil: 0,      // 跳跃锁定
    jumpFromX: 0, jumpToX: 0, jumpStart: 0, jumpDur: 0,
    free: !!opt.free,  // 技能免资源，仍按文明占人口
    popCost: opt.reinforcement?0:def.pop,
    born: state.time,
    lastAtkTarget: 0,
    atkFxTime: -999,      // 上次攻击时的 state.time（渲染层做挥砍/枪口闪光）
  };
  state.units.push(u);
  p.unitsBuilt++;
  if (!opt.free && def.prereq) {
    p.trainedByTech[def.prereq] = (p.trainedByTech[def.prereq] || 0) + 1;
  }
  return u;
}

// ===============================================================
// 一帧仿真
// ===============================================================
function tickSim(state, dt) {
  if (state.over) return;
  state.tick++;
  state.time += dt;

  War.updateBases(state);
  if(!teamAlive(state,'hk')||!teamAlive(state,'zom')){state.over=true;state.winner=teamAlive(state,'hk')?'hk':'zom';state.over_time=state.time;return;}
  // ---- 每玩家：金钱增长 + 能量被动回复 ----
  state.players.forEach(p => {
    if(p.resigned){for(const type of ['army','worker'])for(const q of Econ.orders(p,type).slice())Econ.cancel(p,type,q.id,state.time);return;}
    Econ.tick(state,p,dt);
    // Slow passive energy; powerful abilities also require their specified age.
    p.energy = Math.min(9999, (p.energy || 0) + 6 * dt);

    // Base regeneration resumes twelve seconds after taking damage.
    if (!p.baseRuined && p.baseRegen > 0 && p.baseHp > 0 && p.baseHp < p.baseHpMax
        && state.time - (p.lastHitTime ?? -999) > 12.0) {
      p.baseHp = Math.min(p.baseHpMax, p.baseHp + p.baseRegen * dt);
    }

    // 出兵队列
    for (const q of Econ.complete(p,'army',state.time)) {
      const lane=Econ.lanes(p,'army').find(l=>l.id===q.laneId);
      spawnUnit(state,p,q.unitId,{x:lane?.x??p.baseX});
    }
  });

  // ---- 基地远程防御：只攻击进入警戒区的最近敌军 ----
  // 固定伤害随基地时代成长（42/56/70/84）；低阶兵血量保证同阶段通常四发倒地。
  state.players.forEach(p => {
    if (p.baseHp <= 0||p.baseRuined||p.resigned) return;
    p.baseAttackCd = Math.max(0, (p.baseAttackCd || 0) - dt);
    if (p.baseAttackCd > 0) return;
    let target = null;
    let bestDist = BASE_ATTACK_RANGE + 1;
    for (const u of state.units) {
      if (u.hp <= 0 || u.team === p.team) continue;
      const dist = Math.abs(u.x - p.baseX);
      if (dist <= BASE_ATTACK_RANGE && dist < bestDist) {
        target = u;
        bestDist = dist;
      }
    }
    if (!target) return;
    const damage = 28+p.age*14;
    damageUnit(state,target,damage,null);
    p.baseAttackCd = BASE_ATTACK_CD;
    state.projectiles.push({
      id: state.nextProjectileId++, kind: "base_bullet", team: p.team,
      x_from: p.baseX, y_from: p.row * 60 - 92,
      x_to: target.x, y_to: War.aimY(target),
      t: 0, dur: 0.14, seat: p.seat, fromRow:p.row, toRow:target.row,
    });
  });

  // ---- 处理效果驻留 ----
  const buffsForTeam = { hk: [], zom: [] };
  const remainEffects = [];
  for (const e of state.effects) {
    switch (e.kind) {
      case "harvester": {
        // 移动
        e.x += e.dir * e.speed * dt;
        // 撞击范围内敌军
        const enemy = e.team === "hk" ? "zom" : "hk";
        for (const u of state.units) {
          if (u.team !== enemy) continue;
          if (Math.abs(u.x - e.x) < e.w / 2) {
            damageUnit(state,u,e.dmg*dt,null,true);
          }
        }
        // 撞到对方基地：伤最近那座
        const finishAtHK = e.dir < 0 && e.x <= HQ_HK_X + 30;
        const finishAtZom = e.dir > 0 && e.x >= HQ_ZOM_X - 30;
        if (finishAtHK || finishAtZom) {
          const target = nearestBase(state, enemy, e.x);
          if (target) damageBase(state, target, 250, e.team);
          state.effects.push({
            id: state.nextEffectId++, kind: "fire_burst",
            x: e.x, y: 0, r: 60, life: 0.7, initLife: 0.7,
          });
          break;
        }
        remainEffects.push(e);
        break;
      }
      case "airstrike": {
        e.life -= dt;
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      case "buff_econ_expire": {
        e.life -= dt;
        if (e.life <= 0) {
          const p = state.players[e.seat];
          if (p) p.popCap = Math.max(0, p.popCap - e.popBonus);
        } else remainEffects.push(e);
        break;
      }
      case "buff_army": {
        e.life -= dt;
        buffsForTeam[e.team].push({ moveMul: e.moveMul, atkMul: e.atkMul });
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      case "income_surge_expire": {
        e.life -= dt;
        if (e.life <= 0) {
          const owner = state.players[e.seat];
          if (owner) owner.income = Math.max(0, owner.income - e.income);
        } else remainEffects.push(e);
        break;
      }
      case "base_shield": {
        e.life -= dt;
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      case "radiation_field": {
        e.life -= dt;
        state.units.forEach(u => {
          if (u.team !== e.team && u.hp > 0) damageUnit(state,u,e.dmg*dt,null,true);
        });
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      case "poison_cloud": {
        e.life -= dt;
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      case "poison_puddle": {
        e.life -= dt;
        // 敌军踩上去持续中毒
        for (const u of state.units) {
          if (u.team === e.team) continue;
          if (Math.abs(u.x - e.x) < e.r) {
            damageUnit(state,u,e.dmg*dt,null,true);
          }
        }
        if (e.life > 0) remainEffects.push(e);
        break;
      }
      default:
        e.life = (e.life ?? 1) - dt;
        if (e.life > 0) remainEffects.push(e);
    }
  }
  state.effects = remainEffects;

  // ---- 投射物 ----
  const remainProj = [];
  for (const pr of state.projectiles) {
    pr.t += dt;
    if (pr.t >= pr.dur) {
      // 落地
      if (pr.kind === "barrage_zombie") {
        // 落点秒杀该点的敌方单位，然后本体作为普通僵尸继续
        const enemy = pr.team === "hk" ? "zom" : "hk";
        for (const u of state.units) {
          if (u.team === enemy && Math.abs(u.x - pr.x_to) < 20) {
            damageUnit(state,u,400,null);
          }
        }
        const p = state.players[pr.seat];
        if (p) spawnUnit(state, p, pr.unitId, { x: pr.x_to, y: pr.y_to,free:true });
        state.effects.push({
          id: state.nextEffectId++, kind: "fire_burst",
          x: pr.x_to, y: pr.y_to, r: 40, life: 0.5, initLife: 0.5,
        });
      } else if (pr.kind === "lob") {
        // 投石机弹丸：溅射一小圈 + 爆炸视效
        const enemy = pr.team === "hk" ? "zom" : "hk";
        for (const u of state.units) {
          if (u.team === enemy && Math.abs(u.x - pr.x_to) < 24) {
            const attacker=state.units.find(a=>a.id===pr.attackerId)||{def:CIVS[pr.attackerCiv]?.units[pr.attackerUnit]||{tier:4},dir:pr.team==='hk'?1:-1};damageUnit(state,u,pr.dmg,attacker);
          }
        }
        state.effects.push({
          id: state.nextEffectId++, kind: "fire_burst",
          x: pr.x_to, y: pr.y_to, r: 30, life: 0.55, initLife: 0.55,
        });
      } else if (pr.kind === "molotov") {
        // 燃烧瓶：纯视觉（伤害在发射瞬间已结算），落地烧一片
        state.effects.push({
          id: state.nextEffectId++, kind: "fire_burst",
          x: pr.x_to, y: pr.y_to, r: pr.splash || 30,
          life: 0.6, initLife: 0.6,
        });
      } else if (pr.kind === "bullet" || pr.kind === "base_bullet") {
        // 子弹：小火花
        state.effects.push({
          id: state.nextEffectId++, kind: "spark",
          x: pr.x_to, y: pr.y_to, life: 0.14, initLife: 0.14,
        });
      }
    } else {
      remainProj.push(pr);
    }
  }
  state.projectiles = remainProj;

  War.updateBases(state);
  War.tick(state,dt);
  Factions.tick(state,dt);
  // ---- 每单位：AI（移动/攻击） ----
  for (const u of state.units) {
    if (u.hp <= 0||u.beast) continue;

    // 中毒
    if (u.poison && u.poison.until > state.time) {
      damageUnit(state,u,u.poison.dmg*dt,null,true);
    }
    // 转化解除
    if (u.charmedBy && u.charmedBy.until <= state.time) {
      u.team = u.charmedBy.team;                        // 恢复原队
      u.dir = u.team === "hk" ? +1 : -1;
      u.charmedBy = null;
    }

    if ((u.stunnedUntil || 0) > state.time) {
      if (u.cdAtk > 0) u.cdAtk -= dt;
      continue;
    }
    // 找目标（初版逻辑）：每帧全量选择最近的敌方单位；同时对比最近敌方基地。
    // 距离更近的一方胜出，不做粘性锁定。
    const enemyTeam = u.team === "hk" ? "zom" : "hk";
    let target = null;
    let bestDist = Infinity;
    for (const t of state.units) {
      if (t.hp <= 0 || t.team === u.team||!War.targetable(u,t)) continue;
      const dx = Math.max(0,Math.abs(t.x - u.x)-(t.bodyRadius??t.def.bodyRadius??0));
      if (dx < bestDist) { bestDist = dx; target = t; }
    }
    let nearBase = nearestBase(state, enemyTeam, u.x);
    let distToBase = nearBase ? Math.abs(nearBase.baseX - u.x) : Infinity;
    let targetBase = false;
    if (!target || distToBase < bestDist - 20) {
      targetBase = true;
      bestDist = distToBase;
    }

    // 支援型：治疗 / 转化
    if (u.def.support === "heal") {
      // 寻找同队最缺血单位（半径内）
      let hurt = null; let hurtLack = 0;
      for (const t of state.units) {
        if (t.team !== u.team || t.hp <= 0 || t === u) continue;
        const lack = t.hpMax - t.hp;
        if (lack > hurtLack && Math.abs(t.x - u.x) < u.def.range) {
          hurt = t; hurtLack = lack;
        }
      }
      if (hurt && u.cdAtk <= 0) {
        hurt.hp = Math.min(hurt.hpMax, hurt.hp + u.def.healAmt);
        u.atkFxTime=state.time;
        state.effects.push({id:state.nextEffectId++,kind:"heal",x:hurt.x,y:hurt.y,life:.6,initLife:.6});
        u.cdAtk = u.def.atkCd;
      }
    }
    if (u.def.support === "convert") {
      const convertTarget=state.units.filter(t=>t.team!==u.team&&canConvert(t)&&Math.abs(t.x-u.x)<u.def.range).sort((a,b)=>Math.abs(a.x-u.x)-Math.abs(b.x-u.x)||a.id-b.id)[0]||null;
      // Only low-age targets can be charmed, even behind an immune frontline.
      if (convertTarget && u.cdAtk <= 0) {
        u.atkFxTime=state.time;
        state.effects.push({id:state.nextEffectId++,kind:"convert",x:convertTarget.x,y:convertTarget.y,life:.6,initLife:.6});
        convertTarget.charmedBy = { team: convertTarget.team, until: state.time + u.def.dur };
        convertTarget.team = u.team;
        convertTarget.dir = u.team === "hk" ? +1 : -1;
        u.cdAtk = u.def.atkCd;
      }
    }

    // 光环
    if (u.def.aura === "heal") {
      for (const t of state.units) {
        if (t.team !== u.team || t.hp <= 0 || t === u) continue;
        if (Math.abs(t.x - u.x) < u.def.auraR) {
          t.hp = Math.min(t.hpMax, t.hp + u.def.auraAmt * dt);
        }
      }
    }

    // 攻击/移动决策
    const range = u.def.range || 24;
    const atkTarget = target && !targetBase ? target : null;
    const canAttack = atkTarget ? Math.abs(atkTarget.x - u.x) <= range+(atkTarget.bodyRadius??atkTarget.def.bodyRadius??0) : (bestDist <= range);
    const targetX = targetBase && nearBase ? nearBase.baseX : (atkTarget ? atkTarget.x : null);
    // 锁定目标可能已从身边穿过，移动和朝向必须跟随目标，而不能永远按阵营方向走。
    const chaseDir = targetX == null ? u.dir : (targetX >= u.x ? +1 : -1);
    u.dir = chaseDir;

    // 跳跃逻辑（跳蚤/寄生虫等 arch=zom_hopper / .jump）
    if (u.def.jump && !u.charmedBy) {
      // 探测正前方 jump 距离内是否有敌方单位或基地
      if (u.jumpUntil > state.time) {
        // 正在跳跃
        const t = (state.time - u.jumpStart) / u.jumpDur;
        u.x = War.block(state,u,u.jumpFromX + (u.jumpToX - u.jumpFromX) * Math.min(1, t));
      } else {
        // 探测触发
        const scanFront = u.x + u.dir * u.def.jump * 0.4;
        let willJump = false;
        for (const t of state.units) {
          if (t.team === u.team || t.hp <= 0) continue;
          const dx = (t.x - u.x) * u.dir;
          if (dx > 5 && dx < u.def.jump) { willJump = true; break; }
        }
        if (willJump && (u.cdAtk || 0) <= 0) {
          const jumpDistance = Math.min(u.def.jump, Math.max(0, bestDist - range * 0.75));
          u.jumpFromX = u.x;
          u.jumpToX = u.x + u.dir * jumpDistance;
          u.jumpStart = state.time;
          u.jumpDur = 0.6;
          u.jumpUntil = state.time + 0.6;
        }
      }
    }

    // 战斗
    u.moving = !canAttack;
    if (canAttack) {
      if (u.def.support) {u.cdAtk=Math.max(0,u.cdAtk-dt);continue;}
      if (u.cdAtk <= 0) {
        // 计算 buff
        const buffs = buffsForTeam[u.team];
        let atkMul = u.damageMul||1;
        const owner=state.players[u.seat];if((owner.geneUntil||0)>state.time)atkMul*=1.2;
        const rally=state.units.filter(t=>t.team===u.team&&t.hp>0&&t.def.rally&&Math.abs(t.x-u.x)<180).reduce((n,t)=>Math.max(n,t.def.rally),1);atkMul*=rally;
        for (const b of buffs) atkMul *= b.atkMul;

        // 目标位置（用于视觉投射物）
        const tx = targetBase ? nearBase.baseX : atkTarget.x;
        const ty = targetBase ? nearBase.row*60-40 : War.aimY(atkTarget);
        // 打击标记（渲染层用来做挥砍/枪口闪光/后坐）
        u.atkFxTime = state.time;

        const isLobber = u.def.lobber || u.def.tag === "lobber" || u.def.arch === "zom_cata";
        const isAoe = u.def.arch === "ranged_aoe" || (u.def.splash && !isLobber);
        const isRanged = (u.def.range || 24) > 40;

        if (targetBase) {
          damageBase(state, nearBase, u.def.dmg * atkMul*(u.def.siege||1), u.team,u.def.tier);
          // 基地也来个弹道视觉
          if (isLobber) {
            state.projectiles.push({
              id: state.nextProjectileId++, kind: "lob", team: u.team,
              x_from: u.x, y_from: u.y - 30, x_to: tx, y_to: ty,
              dmg: 0, t: 0, dur: 0.7, seat: u.seat, fromRow:u.row,toRow:targetBase?nearBase.row:atkTarget.row,
            });
          } else if (isAoe) {
            state.projectiles.push({
              id: state.nextProjectileId++, kind: "molotov", team: u.team,
              x_from: u.x + u.dir * 8, y_from: u.y - 30, x_to: tx, y_to: ty,
              splash: u.def.splash || 30, t: 0, dur: 0.5, seat: u.seat, fromRow:u.row,toRow:targetBase?nearBase.row:atkTarget.row,
            });
          } else if (isRanged) {
            state.projectiles.push({
              id: state.nextProjectileId++, kind: "bullet", team: u.team,
              x_from: u.x + u.dir * 10, y_from: u.y - 35, x_to: tx, y_to: ty,
              t: 0, dur: 0.08, seat: u.seat, fromRow:u.row,toRow:targetBase?nearBase.row:atkTarget.row,
            });
          }
          // 近战打基地不加投射物，靠 atkFxTime 做挥砍
        } else if (isLobber) {
          state.projectiles.push({
            id: state.nextProjectileId++,
            kind: "lob", team: u.team,
            x_from: u.x, y_from: u.y - 20, x_to: atkTarget.x, y_to: War.aimY(atkTarget),
            dmg: u.def.dmg * atkMul,attackerId:u.id,attackerCiv:u.civId,attackerUnit:u.unitId,
            t: 0, dur: 0.7, seat: u.seat, fromRow:u.row,toRow:targetBase?nearBase.row:atkTarget.row,
          });
        } else if (isAoe) {
          // 燃烧瓶：伤害立即结算 + 视觉弹丸 + 落地火团
          const r = u.def.splash || 30;
          for (const t of state.units) {
            if (t.team !== u.team && Math.abs(t.x - atkTarget.x) < r) {
              damageUnit(state,t,u.def.dmg*atkMul,u);
            }
          }
          state.projectiles.push({
            id: state.nextProjectileId++, kind: "molotov", team: u.team,
            x_from: u.x + u.dir * 8, y_from: u.y - 30, x_to: atkTarget.x, y_to: War.aimY(atkTarget),
            splash: r, t: 0, dur: 0.5, seat: u.seat, fromRow:u.row,toRow:targetBase?nearBase.row:atkTarget.row,
          });
        } else if (isRanged) {
          damageUnit(state,atkTarget,u.def.dmg*atkMul,u);
          state.projectiles.push({
            id: state.nextProjectileId++, kind: "bullet", team: u.team,
            x_from: u.x + u.dir * 10, y_from: u.y - 35,
            x_to: atkTarget.x, y_to: War.aimY(atkTarget),
            t: 0, dur: 0.08, seat: u.seat, fromRow:u.row,toRow:targetBase?nearBase.row:atkTarget.row,
          });
        } else {
          // 纯近战
          damageUnit(state,atkTarget,u.def.dmg*atkMul,u);
        }
        if(u.def.suicide)u.hp=0;
        u.cdAtk = u.def.atkCd*((state.players[u.seat].overclockUntil||0)>state.time&&u.def.machine?.55:1);
      } else {
        u.cdAtk -= dt;
      }
    } else {
      // 移动
      const buffs = buffsForTeam[u.team];
      let moveMul = (u.slowUntil||0)>state.time?(u.slowMul||.5):1;
      const owner=state.players[u.seat];if((owner.wallUntil||0)>state.time&&(u.def.range||24)<70)moveMul*=.75;if((owner.overclockUntil||0)>state.time&&u.def.machine)moveMul*=1.2;
      for (const b of buffs) moveMul *= b.moveMul;
      if (u.jumpUntil <= state.time) {
        // 单帧最多移动到攻击距离边缘，避免高速单位一步跨过近战目标。
        const maxAdvance = Math.max(0, bestDist - range);
        const advance = Math.min(u.speed * moveMul * dt, maxAdvance);
        u.x = War.block(state,u,u.x+chaseDir*advance);
      }
      if (u.cdAtk > 0) u.cdAtk -= dt;
    }
  }

  // ---- 清理死亡单位 & 结算能量 ----
  const alive = [];
  for (const u of state.units) {
    if (u.hp > 0) { alive.push(u); continue; }
    // 死亡奖励能量给击杀方玩家（简化：给该单位所在阵营的所有敌方玩家均分）
    const enemyTeam = u.team === "hk" ? "zom" : "hk";
    const enemies = state.players.filter(pp => pp.team === enemyTeam);
    // 击杀能量：显著提升，让大招能在一局释放 2-3 次
    const eng = ((u.def.hp * 0.08 + u.def.dmg * 0.9 + u.def.cost * 0.4) * 1.8) | 0;
    if (enemies.length > 0) {
      const per = eng / enemies.length;
      enemies.forEach(pp => { pp.energy = Math.min(9999, pp.energy + per); pp.kills++; pp.killsGold += (u.def.cost * 0.1) | 0; });
    }
    if(u.beast){War.death(state,u);continue;}
    Factions.death(state,u);
    // 释放人口
    const owner = state.players[u.seat];
    if (owner) owner.pop = Math.max(0, owner.pop - (u.popCost ?? u.def.pop));

    // 死亡触发：毒气池 / 爆炸
    if (u.def.onDeath === "poison_puddle") {
      state.effects.push({
        id: state.nextEffectId++, kind: "poison_puddle",
        team: u.team, x: u.x, r: 60, dmg: 12, life: 5,
      });
    } else if (u.def.onDeath === "explode") {
      for (const t of state.units) {
        if (t.team !== u.team && Math.abs(t.x - u.x) < u.def.explodeR) {
          damageUnit(state,t,u.def.explodeDmg,u);
        }
      }
      state.effects.push({
        id: state.nextEffectId++, kind: "explode", x: u.x, y: u.y, r: u.def.explodeR, life: 0.5,
      });
    }
    state.corpses.push({ x: u.x, y: u.y, row:u.row, unitId: u.unitId, civId: u.civId, team: u.team, until: state.time + 2 });
  }
  state.units = alive;
  state.corpses = state.corpses.filter(c => c.until > state.time);

  // ---- 胜负判定：某方所有基地都爆才判负 ----
  // 顺便把负数血夹紧
  state.players.forEach(pp => { if (pp.baseHp < 0) pp.baseHp = 0; });
  War.updateBases(state);War.update(state);
  if (!teamAlive(state, "hk")) {
    state.over = true; state.winner = "zom"; state.over_time = state.time;
  } else if (!teamAlive(state, "zom")) {
    state.over = true; state.winner = "hk"; state.over_time = state.time;
  }
}

// 事件（用于飘字 / SFX / 网络转发）
function emitEvent(state, type, data) {
  state._events = state._events || [];
  state._events.push({ type, data, time: state.time });
  if(state._events.length>40)state._events.shift();
}

// ---- 快照 & 恢复（客户端渲染 / 网络传输用） ----
// 全量快照 = state 本身 JSON 化。为节约带宽可以自定义，MVP 阶段直接 JSON。
function snapshot(state) {
  return JSON.parse(JSON.stringify(state, (key,value)=>key==='def'?undefined:value));
}
function applySnapshot(target,snap) {
  Object.keys(target).forEach(key=>delete target[key]);
  Object.assign(target,structuredClone(snap));
  target.units.forEach(u=>{u.def=u.beast?War.DEFS[u.beast]:CIVS[u.civId].units[u.unitId];});
}

// 导出
window.Sim = {
  LANE_LEN, HQ_HK_X, HQ_ZOM_X, DT_MS, DT,
  makeRng, createInitialState, applyAction, tickSim, snapshot, applySnapshot,
  skillCdRemain,spawnUnit,canConvert,damageUnit,damageBase,emitEvent,teamAlive,nearestBase,
};
