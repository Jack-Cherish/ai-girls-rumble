(function(root){
  'use strict';
  const triggers={pulse:'场地脉冲',hit:'命中并实际造成伤害',guard:'正面防住攻击'};
  const effects={drain:'失去生命',heal:'恢复生命',leech:'吸血',charge:'增加奥义点',recover:'缩短两个技能的剩余冷却'};
  const conditions={always:'',low:'生命不超过一半时',behind:'生命低于对手时'};
  const enums=o=>({type:'string',enum:Object.keys(o)});
  const int=(minimum,maximum)=>({type:'integer',minimum,maximum});
  const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
  const clause=object({trigger:enums(triggers),effect:enums(effects),condition:enums(conditions),amount:int(1,30),seconds:int(2,12),jitter:int(0,4)});
  clause.properties.spread=int(0,4);
  const rule=object({name:{type:'string',minLength:1,maxLength:24},clauses:{type:'array',minItems:1,maxItems:2,items:clause}});
  const schema=object({rules:{type:'array',minItems:3,maxItems:3,items:rule}});
  function check(r){
    if(!r||typeof r.name!=='string'||!r.name.trim()||r.name.length>24||!Array.isArray(r.clauses)||r.clauses.length<1||r.clauses.length>2)throw Error('规则的名称或条款数量无效');
    const clauses=r.clauses.map(c=>{
      if(!c||!Object.hasOwn(triggers,c.trigger)||!Object.hasOwn(effects,c.effect)||!Object.hasOwn(conditions,c.condition))throw Error('存在引擎无法执行的条款');
      for(const [key,min,max] of [['amount',1,{drain:5,heal:5,leech:30,charge:1,recover:3}[c.effect]],['seconds',2,12],['jitter',0,4]])
        if(!Number.isInteger(c[key])||c[key]<min||c[key]>max)throw Error('规则数值超出范围');
      if(c.effect==='leech'&&c.trigger!=='hit'||c.trigger!=='pulse'&&c.jitter!==0)throw Error('触发方式与效果不匹配');
      const spread=c.spread??0;
      if(!Number.isInteger(spread)||spread<0||spread>4||spread&&(c.trigger!=='pulse'||!['drain','heal'].includes(c.effect)||c.amount+spread>5))throw Error('随机效果范围不合法');
      return Object.freeze({spread,trigger:c.trigger,effect:c.effect,condition:c.condition,amount:c.amount,seconds:c.seconds,jitter:c.jitter});
    });
    if(new Set(clauses.map(c=>c.trigger+'/'+c.effect)).size!==clauses.length)throw Error('同一规则重复叠加效果');
    return Object.freeze({name:r.name.trim(),clauses:Object.freeze(clauses)});
  }
  const signature=r=>r.clauses.map(c=>[c.trigger,c.effect,c.condition].join('/')).sort().join('|');
  function slate(list){
    if(!Array.isArray(list)||list.length!==3)throw Error('需要三条规则');
    const out=list.map(check);
    if(new Set(out.map(signature)).size!==3||new Set(out.map(r=>r.name)).size!==3)throw Error('三条候选需要不同的机制和名称');
    return Object.freeze(out);
  }
  function describe(c){
    const timing=c.trigger==='pulse'?'每 '+c.seconds+(c.jitter?'～'+(c.seconds+c.jitter):'')+' 秒，双方分别判定':'每方'+triggers[c.trigger]+'时';
    const unit={drain:' 点（最低留 1 血）',heal:' 点',charge:' 点',recover:' 秒',leech:'%（按实际伤害向下取整）'}[c.effect];
    return timing+'，'+conditions[c.condition]+effects[c.effect]+' '+c.amount+(c.spread?'～'+(c.amount+c.spread):'')+unit+(c.trigger==='pulse'?'':'，每方每 '+c.seconds+' 秒最多触发一次');
  }
  function runtime(rule,seed,maxHp,notify){
    let state=seed>>>0,clock=0;
    function interval(c){state=(Math.imul(state,1664525)+1013904223)>>>0;return c.seconds+(c.jitter?Math.floor(state/4294967296*(c.jitter+1)):0);}
    const active=rule.clauses.map(c=>({c,next:c.trigger==='pulse'?interval(c):0,ready:[0,0]}));
    function eligible(c,f,other){return f.hp>0&&(c.condition==='always'||(c.condition==='low'?f.hp<=maxHp/2:f.hp<other.hp));}
    function apply(c,f,damage,amount=c.amount){
      let value=amount;
      if(c.effect==='drain'){value=Math.min(value,Math.max(0,f.hp-1));f.hp-=value;}
      else if(c.effect==='heal'||c.effect==='leech'){value=Math.min(maxHp-f.hp,c.effect==='heal'?amount:Math.floor(damage*value/100));f.hp+=value;}
      else if(c.effect==='charge'){value=Math.min(4-f.energy,value);f.energy+=value;}
      else{value=Math.min(value,Math.max(f.cd,f.cd2));f.cd=Math.max(0,f.cd-c.amount);f.cd2=Math.max(0,f.cd2-c.amount);}
      if(value>0)notify?.((f.index?'2P ':'1P ')+effects[c.effect]+' '+Number(value.toFixed(1)));
    }
    return {tick(dt,fs){clock+=dt;for(const a of active)if(a.c.trigger==='pulse'&&clock+1e-8>=a.next){
      a.next+=interval(a.c);
      let amount=a.c.amount;
      if(a.c.spread){state=(Math.imul(state,1664525)+1013904223)>>>0;amount+=Math.floor(state/4294967296*(a.c.spread+1));}
      const affected=fs.filter(f=>eligible(a.c,f,fs[1-f.index]));for(const f of affected)apply(a.c,f,0,amount);
    }},hit(fs,attacker,actual,blocked){for(const a of active){
      const c=a.c,i=c.trigger==='guard'?1-attacker:attacker;
      if(c.trigger==='pulse'||(c.trigger==='guard'?!blocked:!actual)||clock+1e-8<a.ready[i]||!eligible(c,fs[i],fs[1-i]))continue;
      a.ready[i]=clock+c.seconds;apply(c,fs[i],actual);
    }}};
  }
  function wallet(tieSeat){
    const cash=[100,100];let next=1;
    return {get cash(){return cash.slice();},settle(round,bids){
      if(round!==next||!Array.isArray(bids)||bids.length!==2||!bids.every((n,i)=>(i===0&&n===null)||(Number.isInteger(n)&&n>=0&&n<=cash[i])))throw Error('本次报价无效或已经结算');
      const passed=bids[0]===null,tied=!passed&&bids[0]===bids[1];
      const winner=passed?1:tied?tieSeat:Number(bids[1]>bids[0]);
      cash[winner]-=bids[winner];if(tied)tieSeat=1-tieSeat;next++;
      return {winner,tied,cash:cash.slice(),bids:bids.slice()};
    },get priority(){return tieSeat;}};
  }
  const api={schema,slate,check,describe,runtime,wallet,signature};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AuctionRules=api;
})(globalThis);
