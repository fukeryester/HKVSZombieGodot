window.Progress=(()=>{
  const key='hkvsz2.profile.v1';let profile={score:0,history:[]};try{profile={...profile,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{}
  profile.score=Math.max(0,Number(profile.score)||0);if(!Array.isArray(profile.history))profile.history=[];
  let stats=null,matches=null,round=null,pending=[];
  const tiers=['黑铁','黄铜','白银','黄金','铂金','翡翠','钻石','大师','宗师','王者'];
  const persist=()=>{try{localStorage.setItem(key,JSON.stringify(profile));}catch{}};
  function title(value){const s=Math.max(0,Math.round(Number(value)||0));return tiers[Math.min(9,Math.floor(s/400))]+' '+(s>=3900?'I':['IV','III','II','I'][Math.floor(s%400/100)]);}
  function score(){return stats?.enabled?Number(stats.get('rank_score'))||0:profile.score;}
  async function init(){if(!BattleNet.gameId())return;stats=GameHubStats.connect();await stats.ready();if(stats.enabled)matches=GameHubMatches.connect();}
  function start(){round=matches?matches.start():null;}
  function finish(state,seat,ranked){ranked=!!ranked&&!state.gmUsed;const p=state.players[seat],win=p.team===state.winner,pvp=state.players.some(q=>q.team!==p.team&&!q.isAI);const delta=ranked?(win?(pvp?30:15):-(pvp?25:15)):0;const after=Math.max(0,score()+delta);
    const result={id:HKVZId(),win,civId:p.civId,mode:state.mode,ranked,time:Math.round(state.time),kills:p.kills,units:p.unitsBuilt,workers:p.workers.length,age:p.age,gathered:Math.round(Object.values(p.gathered).reduce((a,b)=>a+b,0)),at:new Date().toISOString(),delta:after-score(),score:after};
    if(state.gmUsed)return {...result,gm:true};
    profile.history.unshift(result);profile.history=profile.history.slice(0,30);if(!stats?.enabled)profile.score=after;persist();
    if(stats?.enabled){stats.inc('matches_total',1);stats.inc(win?'wins_total':'losses_total',1);stats.inc('kills_total',p.kills);stats.inc('units_built_total',p.unitsBuilt);stats.inc('workers_trained',Math.max(0,p.workers.length-8));stats.inc('resources_gathered',result.gathered);stats.inc('civ_used_'+p.civId,1);
      if(ranked){stats.set('rank_score',after);stats.set('rank_peak',Math.max(stats.get('rank_peak')||0,after));stats.submit('board_rank',after,{title:title(after)});}
      stats.submit('board_kills',p.kills);if(win)stats.unlock('first_win');if(p.age===4)stats.unlock('age_four');if(p.sites.some(s=>s.kind==='castle'&&s.done))stats.unlock('first_castle');if(result.gathered>=5000)stats.unlock('resource_master');
    }
    pending.push({result,statsDone:!stats?.enabled,matchDone:!round,round,matchStarted:false,metadata:{schema_version:2,civ:p.civId,mode:state.mode,ranked,kills:p.kills,units:p.unitsBuilt,age:p.age,duration_sec:result.time,gathered:p.gathered}});
    return result;
  }
  async function save(){if(!pending.length)return {local:!stats?.enabled};const batch=[...pending];const jobs=[];
    if(batch.some(p=>!p.statsDone))jobs.push(stats.store().then(()=>{batch.forEach(p=>p.statsDone=true);}));
    for(const p of batch)if(!p.matchDone){const job=p.matchStarted?p.round.retry():p.round.finish({result:p.result.win?'win':'lose',score:p.result.kills,metadata:p.metadata});p.matchStarted=true;jobs.push(job.then(()=>{p.matchDone=true;}));}
    const results=await Promise.allSettled(jobs);const fail=results.find(r=>r.status==='rejected');pending=pending.filter(p=>!p.statsDone||!p.matchDone);if(fail)throw fail.reason;return {local:!stats?.enabled};
  }
  async function loadHistory(){if(!matches)return profile.history;try{const page=await matches.history({limit:20});return page.matches.map(m=>{const d=m.metadata||{};return {id:m.match_id,win:m.result==='win',civId:d.civ,mode:d.mode||'1v1',ranked:!!d.ranked,time:d.duration_sec||0,kills:d.kills||0,at:m.ended_at||m.recorded_at};});}catch{return profile.history;}}
  async function board(){return stats?.enabled?stats.board('board_rank',30):null;}
  return {init,start,finish,save,board,loadHistory,title,score,history:()=>profile.history,online:()=>!!stats?.enabled};
})();
