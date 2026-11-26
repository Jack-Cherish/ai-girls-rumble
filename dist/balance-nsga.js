// Multi-objective survival and mating use non-domination rank and normalized crowding distance.
(function(root){
  'use strict';
  const core=root.BalanceCore,capacity=12;
  const fields=['power','cooldown','delay'],slots=['skill','skill2','ultimate'];
  const locus=e=>[e.id,e.slot,e.field].join('/');
  function editCost(kits,changes){
    let cost=0;
    for(const kit of kits){
      const current=core.kitFor(kit,changes);
      for(const slot of slots)for(const field of fields){
        const before=kit[slot][field],after=current[slot][field];
        if(!Number.isFinite(before)||before===after)continue;
        const unit=field==='power'?Math.max(1,Math.floor(.1*before)):field==='cooldown'?.5:2/60;
        cost+=Math.abs(after-before)/unit;
      }
    }
    return cost;
  }
  function dominates(a,b){return a.g.every((x,i)=>x<=b.g[i])&&a.g.some((x,i)=>x<b.g[i]);}
  function rank(nodes){
    let pool=nodes.slice(),level=0;
    const fronts=[];
    while(pool.length){
      const front=pool.filter(n=>!pool.some(other=>other!==n&&dominates(other,n)));
      for(const n of front){n.rank=level;n.crowding=0;}
      for(let i=0;i<front[0].g.length;i++){
        const order=front.slice().sort((a,b)=>a.g[i]-b.g[i]||a.id.localeCompare(b.id));
        const range=order.at(-1).g[i]-order[0].g[i];
        if(!range)continue;
        order[0].crowding=order.at(-1).crowding=Infinity;
        for(let j=1;j<order.length-1;j++)order[j].crowding+=(order[j+1].g[i]-order[j-1].g[i])/range;
      }
      fronts.push(front);pool=pool.filter(n=>!front.includes(n));level++;
    }
    return fronts;
  }
  function choose(nodes){
    const survivors=[];
    for(const front of rank(nodes)){
      front.sort((a,b)=>b.crowding-a.crowding||a.cost-b.cost||a.id.localeCompare(b.id));
      survivors.push(...front.slice(0,capacity-survivors.length));
      if(survivors.length===capacity)break;
    }
    // Representative for display and validation; does not alter the selected population.
    const maxima=survivors[0].g.map((_,i)=>Math.max(1e-9,...survivors.map(n=>n.g[i])));
    const loss=n=>n.g.reduce((s,v,i)=>s+v/maxima[i],0);
    return survivors.sort((a,b)=>a.rank-b.rank||loss(a)-loss(b)||a.cost-b.cost||a.id.localeCompare(b.id));
  }
  function randomFor(seed,generation){
    let x=(seed^Math.imul(generation,2654435761))>>>0;
    return ()=>{x=(x+0x6d2b79f5)>>>0;let z=Math.imul(x^(x>>>15),1|x);
      z^=z+Math.imul(z^(z>>>7),61|z);return ((z^(z>>>14))>>>0)/4294967296;};
  }
  function tournament(pool,random){
    const pick=()=>pool[Math.floor(random()*pool.length)],a=pick(),b=pick();
    if(a.rank!==b.rank)return a.rank<b.rank?a:b;
    if(a.crowding!==b.crowding)return a.crowding>b.crowding?a:b;
    return random()<.5?a:b;
  }
  function crossover(left,right,random){
    // Inherit the whole edit history for each locus so cumulative changes stay legal.
    const fromRight=new Set();
    for(const key of new Set([...left,...right].map(locus)))if(random()<.5)fromRight.add(key);
    return left.filter(e=>!fromRight.has(locus(e))).concat(right.filter(e=>fromRight.has(locus(e))));
  }
  function plan(kits,population,generation,seen){
    const seed=population[0].v.seed,random=randomFor(seed,generation),plans=[],used=new Set();
    rank(population);
    const options=new Map(population.map(n=>[n,core.alternatives(kits,n.v,n.f,{has:()=>false})]));
    for(let attempt=0;attempt<capacity*100&&plans.length<capacity;attempt++){
      const a=tournament(population,random);
      const b=population.length>1&&random()<.85?tournament(population.filter(n=>n!==a),random):a;
      const inherited=b===a?a.v.changes.slice():crossover(a.v.changes,b.v.changes,random);
      const changes=inherited.slice(),edits=[],candidates=options.get(a),count=random()<.45?2:1;
      if(!candidates.length)continue;
      for(let j=0;j<12&&edits.length<count;j++){
        const e={...candidates[Math.floor(random()*candidates.length)]};
        if(random()<.25)e.delta=-e.delta;
        if(edits.some(prior=>locus(prior)===locus(e))||!core.changeValid(e,kits,changes))continue;
        edits.push(e);changes.push(e);
      }
      if(!edits.length)continue;
      const key=seed+':'+core.configKey(kits,changes);
      if(used.has(key)||seen.has(key))continue;
      used.add(key);plans.push({parent:a.id,mate:b===a?null:b.id,edits,changes,key,source:b===a?'变异':'交叉＋变异'});
    }
    return plans;
  }
  root.BalanceNSGA={choose,plan,rank,crossover,editCost};
})(globalThis);
