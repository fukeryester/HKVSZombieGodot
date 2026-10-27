/* Deliberate economy-first pacing and faction identities. All numbers are simulation data. */
(()=>{
  const rush=new Set(['hk_slum','zom_classic','hk_gang']);
  const traits={
    hk_university:{research:.8,gather:1.12,workerTime:14},hk_wild:{foodDiscount:.85,armor:.8},
    hk_gang:{rush:true,killGold:10,training:.85},zom_robot:{controlImmune:true,repair:4},
    zom_necro:{regen:3,biomass:true},zom_asym:{quality:2,price:1.5,pop:2,gather:2,workerTime:20}
  };
  const descriptions={hk_university:'科研协作：升本快20%、采集快12%。急救、反机械电磁与远程自动化构成防线。',hk_wild:'山城封建：有机兵食物便宜15%、近战兵减伤20%。长枪克制大型单位，投石专攻建筑。',hk_gang:'九龙堂口：前期突袭文明，训练快15%，每次击杀获得10黄金。燃瓶、火力封锁与侧翼伏兵。',zom_robot:'自治尸械：全军木金造价、免疫转化，脱战自修4生命/秒。阵亡回收废料，过载换取火力。',zom_necro:'重组尸巢：每秒再生3生命；收割尸体积累生质。骨刃流血、囊肿自爆与寄生孵化。',zom_asym:'异种融合：士兵和农民占2人口、造价1.5倍；士兵攻血与农民采集为标准型2倍；体型随时代成长。巨臂牵引、凝视与个体蜕变。'};
  Object.values(CIVS).forEach(c=>{
    c.traits={...(traits[c.id]||{}),rush:rush.has(c.id)};
    c.desc=descriptions[c.id]||c.desc+' '+(rush.has(c.id)?'前期早战文明，适合持续施压。':'发育文明，优先扩张经济并解锁三、四本。');
    c.buildings[B.HQ].hp=rush.has(c.id)?10000:c.id==='hk_wild'?14500:12000;
    c.buildings[B.POP].effect.pop=50;
    Object.values(c.units).forEach(u=>{
      const t=u.tier, tank=/giant|tank/.test(u.arch),support=!!u.support;
      // Undo old era compression and use explicit age profiles, preserving role ratios.
      // Early infantry survives three same-age HQ shots; heavy units keep a durability premium.
      const h=t===1?Math.max(150,Math.round(u.hp*.60)):t===2?Math.max(tank?270:210,Math.round(u.hp*.78)):Math.round((t===3?2600:5600)*(tank?1.4:support?.62:1));
      const d=t===1?Math.max(3,Math.round(u.dmg*.52)):t===2?Math.max(5,Math.round(u.dmg*.70)):Math.round((t===3?125:270)*(tank?1.15:u.lobber?1.4:1));
      u.standardHp=h;u.standardDmg=d;u.hp=h*(c.traits.quality||1);u.dmg=d*(c.traits.quality||1);
      u.pop=c.traits.pop||1;u.costFactor=c.traits.price||1;u.foodDiscount=c.traits.foodDiscount||1;
      u.speed=Math.round(u.speed*(t===1?.65:t===2?.78:.88));
      if(c.traits.rush&&t<=2){u.dmg=Math.round(u.dmg*1.15);u.speed=Math.round(u.speed*1.12);}
      u.buildTime=([0,6,10,16,23][t])*(c.traits.training||1);
      u.controlImmune=t>=3||!!c.traits.controlImmune;if(u.support==='convert'){u.atkCd=Math.max(7,u.atkCd);u.dur=Math.min(6,u.dur||6);u.desc+=' 仅可转化二本及以下有机兵；高阶和自治机械免疫。';}
      u.art.scale=c.id==='zom_asym'?[0,1.05,1.2,1.65,2][t]:1;
      u.healAmt=u.support==='heal'?(t>=3?180:35):u.healAmt;
      if(t>=3&&u.onDeath==='explode')u.explodeDmg=Math.round(u.dmg*4);
      if(t>=3&&u.aura==='heal')u.auraAmt=35;
      u.desc+=(t>=3?' 精锐护甲：来自一、二本兵的伤害降低85%。免疫转化。':'');
    });
  });
  const tune=(c,id,props,role)=>{Object.assign(CIVS[c].units[id],props);CIVS[c].units[id].desc=role+' '+CIVS[c].units[id].desc;};
  tune('hk_university','engineer',{vsMachine:2},'反机械：对机械造成双倍伤害。');
  tune('hk_university','drone',{evasion:.7},'旋翼平台：承受近战伤害减少30%。');
  tune('hk_university','exo',{armor:.75},'外骨骼装甲：承伤降低25%。');
  tune('hk_university','mortar',{siege:2.5},'电磁攻城：对基地伤害2.5倍。');
  tune('hk_wild','archer',{range:300},'长弓：远距狙击。');
  tune('hk_wild','pike',{vsLarge:3,range:65},'长枪：对巨型、重甲与融合怪物伤害3倍。');
  tune('hk_wild','knight',{armor:.65},'重甲盾卫：承伤降低35%。');
  tune('hk_wild','trebuchet',{siege:3,range:440},'配重投石：超远射程，对建筑伤害3倍。');
  tune('hk_wild','warlord',{rally:1.2},'战王：附近本方士兵伤害增加20%。');
  tune('hk_gang','blade',{speed:45},'快刀突袭：高速近战，正面攻坚弱。');
  tune('hk_gang','fire',{burn:12},'燃瓶：命中后持续灼烧。');
  tune('hk_gang','enforcer',{knockback:14},'红棍：命中推退敌兵。');
  tune('hk_gang','tommy',{atkCd:.38},'冲锋枪：高频火力。');
  tune('hk_gang','van',{armor:.7},'装甲运兵车：承伤降低30%。');
  tune('hk_gang','boss',{rally:1.3},'龙头：附近本方士兵伤害增加30%。');
  tune('zom_robot','laser',{vsMachine:1.7},'切割激光：克制机械。');
  tune('zom_robot','bulwark',{armor:.6},'履带壁垒：承伤降低40%。');
  tune('zom_robot','rail',{range:400,siege:2},'穿甲轨道炮：远距攻城。');
  tune('zom_necro','slasher',{bleed:3},'骨刃：命中造成短暂流血。');
  tune('zom_necro','spine',{burn:10},'骨刺酸液：持续腐蚀。');
  tune('zom_necro','brute',{armor:.75},'重组骨墙：承伤降低25%。');
  tune('zom_necro','burst',{suicide:true,range:30},'囊肿：贴近目标引爆自身，爆破伤害随时代提升。');
  tune('zom_necro','sower',{range:250,dur:6,atkCd:7},'孢子寄生：仅可暂时转化二本及以下有机单位。');
  tune('zom_asym','longarm',{range:115,slow:.55},'异侧巨臂：远距近战，命中减速。');
  tune('zom_asym','watcher',{slow:.45,range:280},'复眼凝视：远距压制并减速。');
  tune('zom_asym','crusher',{knockback:24,armor:.75},'偏肢重槌：厚甲并击退。');
  tune('zom_asym','howler',{splash:85},'三喉裂口：宽幅声波溅射。');
  tune('zom_asym','mirror',{support:'heal',healAmt:360,range:240},'双向共生：以反向躯体修复友军，替代雷同转化。');
  const kits={
    hk_university:[['开放科研','open_science',2,900,55,'当前升本剩余时间缩短30%；20秒采集效率 +35%。'],['战地医学院','field_hospital',3,1400,65,'20秒内，本方部队每秒恢复最大生命的2%。'],['电磁隔离网','emp_grid',4,2100,75,'敌机械瘫痪5秒；有机单位减速55%，持续10秒。']],
    hk_wild:[['部族狩猎','tribal_hunt',2,850,60,'获得350食物、180木头。'],['铁壁盾阵','shield_wall',3,1350,60,'本方近战兵承伤降低60%，移速降低25%，持续18秒。'],['山城烽火','fortress_watch',4,2000,80,'基地回复15%耐久，25秒内防御槽射速与伤害均翻倍。']],
    hk_gang:[['黑市交易','black_market',2,800,50,'将150食物和150木头换成500黄金。资源不足无法发动。'],['交叉火网','crossfire',3,1400,65,'对最靠前的5名敌军各造成700伤害，并减速5秒。'],['堂口伏击','triad_ambush',2,1500,75,'在敌方阵前集结4名刀手和4名堂口枪手，制造侧翼压力。']],
    zom_robot:[['废料再利用','scrap_recycling',2,800,40,'消耗最多6份废料，每份换80木头、60黄金；无废料无法发动。'],['分布式重启','distributed_reboot',3,1400,65,'本方机械修复30%生命并获得25%减伤，持续16秒。'],['危险超频','overclock',4,2100,75,'14秒内本方机械攻速提升82%、移速提升20%，但承伤增加25%。']],
    zom_necro:[['血肉缝合','flesh_weave',2,800,45,'消耗3生质，修复最多3名本方伤兵各45%生命。'],['囊肿连爆','rupture_chain',3,1400,70,'引爆最多3名本方囊肿或低阶尸体兵；对周围敌军造成900伤害。'],['尸巢孵化','brood_incubation',4,2200,85,'消耗8生质，在前线孵出2名重组暴君，各占1人口。']],
    zom_asym:[['异种适应','gene_splice',2,900,60,'本方怪物获得40%减伤、20%伤害，持续18秒。'],['偏肢牵引','asymmetric_grasp',3,1450,65,'将最靠前的5名低阶敌兵拉向本方前线并眩晕3秒；高阶兵免疫牵引。'],['超巨蜕变','colossal_molt',4,2300,90,'最强的一名本方怪物永久增加25%最大生命、伤害与体型；每名仅可蜕变一次。']]
  };
  Object.entries(kits).forEach(([cid,list])=>list.forEach(([name,kind,age,cost,cd,desc],i)=>{const id=cid+'_skill_'+i;SKILLS[id]={id,side:CIVS[cid].side,name,kind,age,cost,cd,desc};}));
  Object.values(SKILLS).forEach(s=>{s.desc=s.desc.replaceAll('不占人口','正常占用人口');if(s.kind==='airstrike')s.desc='空袭所有敌军：各损失40%最大生命，单体伤害上限1800。';if(s.kind==='barrage')s.desc='空投尸群冲击阵线，落点造成400范围伤害，落地部队正常占用人口。';s.age||=s.kind==='elite_drop'||s.kind==='airstrike'||s.kind==='evolve'?4:s.kind==='summon'?2:3;if(s.kind==='hostile_takeover')s.desc='暂时转化最多2名二本及以下敌兵；三、四本兵与自治机械免疫。';});
})();
