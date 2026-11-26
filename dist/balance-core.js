/* Shared experiment rules. Times in summaries are combat-clock seconds. */
(function(root){
  'use strict';
  const ids=['tide','quill','chatgpt','gemini','grok','kimi','doubao','minimax','glm','qwen','laoda','nailong'];
  const N=ids.length,cellsPerRound=N*N;
  const fields={power:[1,80],cooldown:[.5,20],delay:[0,1.5]};
  function kitFor(kit,changes){
    if(!kit||!changes?.length)return kit;
    const copy={...kit};
    for(const change of changes){
      if(change.id!==kit.characterId||!kit.presetSlots?.[change.slot])continue;
      if(!ids.includes(change.id)||!['skill','skill2','ultimate'].includes(change.slot)||!Object.hasOwn(fields,change.field))continue;
      const before=copy[change.slot][change.field];
      if(!Number.isFinite(before)||!Number.isFinite(change.delta))continue;
      const [min,max]=fields[change.field],v=before+change.delta;
      if(v<min-1e-8||v>max+1e-8)continue;
      copy[change.slot]={...copy[change.slot],[change.field]:change.field==='power'?Math.round(v):Number(v.toFixed(5))};
    }
    return copy;
  }
  function changeValid(change,kits,prior){
    const {id,slot,field,delta}=change||{};
    if(!ids.includes(id)||!['skill','skill2','ultimate'].includes(slot)||!Object.hasOwn(fields,field)||!Number.isFinite(delta)||!delta)return false;
    const kit=kitFor(kits.find(k=>k.characterId===id),prior);
    const v=kit?.[slot]?.[field];if(!kit?.presetSlots?.[slot]||!Number.isFinite(v)||Number((v+delta).toFixed(5))===v)return false;
    const limit=field==='power'?Math.max(1,Math.floor(v*.1)):field==='cooldown'?.5:2/60;
    return Math.abs(delta)<=limit+.000001 && (field!=='power'||Number.isInteger(delta)) && v+delta>=fields[field][0] && v+delta<=fields[field][1];
  }
  function configKey(kits,changes){
    return JSON.stringify(kits.map(kit=>{
      const actual=kitFor(kit,changes);
      return ['skill','skill2','ultimate'].map(slot=>[actual[slot].power,actual[slot].cooldown,actual[slot].delay]);
    }));
  }
  // A lab duel depends only on its seed, seat order and the two equipped kits.
  function reusePlan(kits,changes,seed,total,references){
    const target=JSON.parse(configKey(kits,changes)).map(row=>JSON.stringify(row));
    let best=null;
    for(const prior of new Set(references)){
      if(!prior?.summary||prior.seed!==seed||prior.total!==total||prior.n!==total)continue;
      const earlier=JSON.parse(configKey(kits,prior.changes));
      const changed=target.map((key,i)=>key!==JSON.stringify(earlier[i]));
      let reuse=0;
      for(let cell=0;cell<Math.min(cellsPerRound,total);cell++){
        if(!changed[Math.floor(cell/N)]&&!changed[cell%N])reuse+=1+Math.floor((total-1-cell)/cellsPerRound);
      }
      if(!best||reuse>best.reuse)best={prior,changed,reuse};
      if(reuse===total)break;
    }
    return best;
  }
  function alternatives(kits,best,fixtures,seen){
    const summary=best.summary,options=[];
    const offenders=new Set(fixtures.problems.map(p=>p.id));
    const fighters=kits.map((k,i)=>({id:k.characterId,index:i,rank:summary.ranks[i]}));
    fighters.sort((a,b)=>Number(offenders.has(b.id))-Number(offenders.has(a.id)) ||
      Math.abs(b.rank.rate-.5)-Math.abs(a.rank.rate-.5));
    for(const f of fighters){
      const weaken=offenders.has(f.id)||f.rank.rate>.55||(f.rank.rate>=.45&&summary.median<25);
      const direction=weaken?-1:1;
      const slots=['skill','skill2','ultimate'].sort((a,b)=>{
        const order=['attack','skill','skill2','ultimate'];
        return f.rank.damage[order.indexOf(b)]-f.rank.damage[order.indexOf(a)];
      });
      for(const slot of slots)for(const [field,delta] of [['power',direction],['cooldown',-.5*direction],['delay',-.03*direction]]){
        const change={id:f.id,field,slot,delta};
        if(changeValid(change,kits,best.changes)&&!seen.has(configKey(kits,[...best.changes,change])))options.push(change);
      }
    }
    return options;
  }
  function task(index,seed){
    const cell=index%cellsPerRound,a=Math.floor(cell/N),b=cell%N,rep=Math.floor(index/cellsPerRound);
    let x=(seed^Math.imul(1+Math.min(a,b)*N+Math.max(a,b),0x85ebca6b)^Math.imul(rep+1,0x9e3779b1))>>>0;
    x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);
    return {index,a,b,seed:(x^(x>>>16))>>>0};
  }
  function summary(rows){
    const cells=Array.from({length:cellsPerRound},()=>({wins:0,draws:0,n:0}));
    const rank=Array.from({length:N},()=>({w:0,d:0,n:0,damage:[0,0,0,0],casts:[0,0,0,0],heal:0,blocked:0}));
    const durations=[];let short=0,stall=0,frozen=0,timeouts=0,mirror=0,mirrorN=0,ones=0,maxCombo=0;
    for(const r of rows){
      const c=cells[r.a*N+r.b];c.n++;c.wins+=Number(r.winner===0);c.draws+=Number(r.winner===null);
      if(r.a===r.b){mirrorN++;mirror+=r.winner===null?.5:r.winner===0?1:0;}
      else [r.a,r.b].forEach((id,i)=>{const p=rank[id];p.n++;p.w+=Number(r.winner===i);p.d+=Number(r.winner===null);
        for(let k=0;k<4;k++){p.damage[k]+=r.damage[i][k];p.casts[k]+=r.casts[i][k];}
        p.heal+=r.heal[i];p.blocked+=r.blocked[i];});
      ones+=Number(r.oneShot);maxCombo=Math.max(maxCombo,r.combo.amount);
      for(const round of r.rounds){durations.push(round.t);short+=Number(round.t<8);timeouts+=Number(round.timeout);frozen+=Number(round.timeout&&round.noDamageSeconds>=15);stall+=Number(round.timeout&&Math.min(...round.hp)>r.hpMax/2);}
    }
    durations.sort((a,b)=>a-b);
    const n=durations.length,median=n?(durations[(n-1)>>1]+durations[n>>1])/2:0;
    const rate=(x,n)=>n?x/n:0;
    const ranks=rank.map(p=>({...p,rate:rate(p.w,p.n)})),mirrorRate=rate(mirror,mirrorN);
    const penalties=[ones,Math.max(0,25-median,median-40),Math.max(0,rate(short,n)-.009999),Math.max(0,rate(stall,n)-.019999),
      ranks.reduce((s,p)=>s+Math.max(0,.45-p.rate,p.rate-.55),0),Math.max(0,Math.abs(mirrorRate-.5)-.05),Math.max(0,rate(frozen,n)-.019999)];
    return {matches:rows.length,rounds:n,cells,ranks,median,p10:durations[Math.floor(n*.1)]||0,short:rate(short,n),stall:rate(stall,n),frozen:rate(frozen,n),timeout:rate(timeouts,n),mirrorRate,ones,maxCombo,penalties};
  }
  function localKit(kit,changes){
    const index=ids.indexOf(kit?.characterId);
    return index<0 || root.HeroLibrary?.record(index)?kit:kitFor(kit,changes);
  }
  root.BalanceCore={ids,kitFor,localKit,changeValid,configKey,reusePlan,alternatives,task,summary};
})(globalThis);
