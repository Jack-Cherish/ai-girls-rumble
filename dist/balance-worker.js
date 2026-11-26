'use strict';
self.window=self;
importScripts('arena-manifest.js','mechanics-group-a.js','chatgpt-tail-direction-v1.js','chatgpt-shield-wording-v1.js','mechanics-group-b.js','mechanics-group-c.js','mechanics.js','mechanics-laoda.js','mechanics-nailong.js','kit.js','combat.js','balance-core.js');
// Workers use the full twelve-character combat engine.
const roster=ArenaManifest.characters.map((_,i)=>DormKit.rosterPlayer(i));
const factory=roster.map((p,i)=>DormKit.forPlayer(p,i));
const slots=['attack','skill','skill2','ultimate'];
function simulate(task,changes,extra={}){
  const {a,b,seed}=task,rounds=[],casts=[[0,0,0,0],[0,0,0,0]],damage=[[0,0,0,0],[0,0,0,0]],heal=[0,0],blocked=[0,0];
  const castDamage=new Map(),strings=[{},{}],events=extra.events,frames=[];
  let hpMax=180,oneShot=false,combo={amount:0,start:0,end:0,seat:0},lastHit=0,roundGap=0,gap=0,hash=2166136261,frame=0;
  function mix(n){hash=Math.imul(hash^n,16777619)>>>0;}
  const lab={
    setup:extra.setup,inputs:extra.inputs,command:extra.command,
    cast(f,i,slot){const k=slots.indexOf(slot);casts[i][k]++;},
    heal(i,h){heal[i]+=h;},
    hit(f,i,h,slot,cast,guard,hp,chain,round,clock){
      const k=slots.indexOf(slot);damage[i][k<0?1:k]+=h;blocked[1-i]+=Number(guard);
      mix(f);mix(i);mix(h);mix(hp);mix(cast);mix(Number(guard));
      if(h){roundGap=Math.max(roundGap,clock-lastHit);lastHit=clock;}
      if(cast){const amount=(castDamage.get(cast)||0)+h;castDamage.set(cast,amount);if(amount>=hpMax)oneShot=true;}
      if(!guard&&h){
        let s=strings[i];
        if(!chain||s.round!==round||!s.amount)s=strings[i]={amount:0,start:f,seat:i,round,resource:false};
        s.amount+=h;s.end=f;s.resource ||=slot==='ultimate';
        if(!s.resource&&s.amount>combo.amount)combo={...s};
      }
      events?.push({f,i,h,slot,cast,guard,hp});
    },
    round(f,t,outcome,hp,max){hpMax=max;roundGap=Math.max(roundGap,t/60-lastHit);gap=Math.max(gap,roundGap);
      rounds.push({t:t/60,hp,timeout:outcome.reason==='时间到',end:f,noDamageSeconds:+roundGap.toFixed(2)});mix(t);mix(hp[0]);mix(hp[1]);lastHit=0;roundGap=0;}
  };
  const team=[roster[a],roster[b]],kits=[a,b].map(i=>BalanceCore.kitFor(factory[i],changes));
  const g=DormCombat.createMatch(team,{mode:'cpu',seed,difficulty:'normal',forecastKits:kits,lab});
  for(frame=1;frame<=65000;frame++){
    g.step();
    if(extra.clip && frame>=extra.clip[0]&&frame<=extra.clip[1])frames.push(g.snapshot());
    if(g.result || frame===extra.stop)break;
  }
  if(!extra.stop&&!g.result)throw Error('对局未正常结算：'+task.index);
  return {row:{...task,winner:g.result?.winner??null,rounds,casts,damage,heal,blocked,combo,oneShot,hpMax,gap:+gap.toFixed(2),hash},frames};
}
function replay(msg){
  const {row,changes,original}=msg,tape=new Map(),hits=[];
  const record=(f,...cmd)=>{if(!tape.has(f))tape.set(f,[]);tape.get(f).push(cmd);};
  const actual=simulate(row,changes,{command:record,events:hits}).row;
  if(actual.hash!==row.hash||actual.winner!==row.winner)throw Error('原场命中和结算未能复现');
  const anchor=row.combo.amount?row.combo.start:(hits.find(h=>h.h)?.f||180);
  const lo=Math.max(1,anchor-100),hi=Math.min(actual.rounds.at(-1).end,Math.max(anchor+150,Math.min(row.combo.end+55,anchor+360)));
  const inputs=f=>tape.get(f)||[];
  const base=simulate(row,changes,{inputs,clip:[lo,hi],stop:hi}).frames;
  const check=simulate(row,changes,{inputs}).row;
  if(check.hash!==row.hash)throw Error('逐帧操作未能复现，已停止播放');
  let other=[],probe=null;
  if(msg.guard){
    const seat=1-row.combo.seat,after=anchor+1;
    const trialHits=[];
    const altered=f=>f<after?inputs(f):[...inputs(f).filter(cmd=>cmd[0]!==seat),[seat,'clear',true],[seat,'guard',true]];
    other=simulate(row,changes,{inputs:altered,events:trialHits,clip:[lo,hi],stop:hi}).frames;
    const target=trialHits.find(h=>h.i!==seat&&h.f>=after&&h.guard&&base[h.f-lo]&&hits.some(orig=>orig.cast===h.cast&&orig.i===h.i&&!orig.guard));
    probe=target?{f:target.f-lo,damage:target.h} : {f:null};
  }else if(original){
    other=simulate(row,original,{inputs,clip:[lo,hi],stop:hi}).frames;
  }
  return {base,other,lo,anchor:anchor-lo,probe,team:[roster[row.a],roster[row.b]]};
}
// Fixed-input fixtures stress the real engine at melee, wall and projectile distance.
function fixtures(changes){
  const problems=[];let checked=0;
  for(let a=0;a<roster.length;a++)for(const gap of [55,110,220])for(const mode of ['attack','skill','skill2','ultimate','pressure','guard','chase','sustain']){
    const task={a,b:a===1?0:(a+1)%roster.length,seed:4,index:-1};
    const setup=fs=>{fs[1].x=900;fs[0].x=900-gap;fs[0].energy=mode==='ultimate'?4:0;fs[1].energy=0;};
    const inputs=(f)=>{
      if(f<161)return [];
      const cmds=[[0,'clear',true],[1,'clear',true]];
      if(['pressure','guard','chase','sustain'].includes(mode)){
        cmds.push([0,'right',true],[0,'attack',true],[0,'skill',true],[0,'skill2',true]);
        if(mode==='sustain')cmds.push([1,'skill',true],[1,'skill2',true]);
        if(mode==='guard')cmds.push([1,'guard',true]);
        if(mode==='chase')cmds.push([1,'right',true],[1,'up',true],[0,'up',true]);
      }else if(f===162)cmds.push([0,mode,true]);
      return cmds;
    };
    const stop=['guard','chase','sustain'].includes(mode)?4300:mode==='pressure'?650:380;
    const r=simulate(task,changes,{setup,inputs,stop}).row;checked++;
    if(r.oneShot || (mode==='pressure'&&r.combo.amount>r.hpMax*.35) || (['guard','chase','sustain'].includes(mode)&&r.rounds[0]?.timeout&&Math.min(...r.rounds[0].hp)>90))
      problems.push({id:factory[a].characterId,gap,mode,damage:r.combo.amount,reason:r.oneShot?'单招打空满血':mode==='pressure'?'墙角连续受击超过35%，需验证反制':'专项场景高血量超时'});
  }
  return {checked,problems};
}
self.onmessage=({data:m})=>{
  try{
    if(m.op==='kits')return postMessage({ok:factory});
    if(m.op==='fixtures')return postMessage({ok:fixtures(m.changes)});
    if(m.op==='replay')return postMessage({ok:replay(m)});
    const indices=m.indices||Array.from({length:m.end-m.start},(_,j)=>m.start+j);
    const rows=indices.map(i=>simulate(BalanceCore.task(i,m.seed),m.changes).row);
    postMessage({ok:rows});
  }catch(e){postMessage({error:e.message});}
};
