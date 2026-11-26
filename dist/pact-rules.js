/* Shared by negotiation, the HUD and the fixed-step match. */
(function (root) {
  const cards = {
    plain: {locked:-1, first:-1, text:'按普通规则开战'},
    rival_seal: {locked:1, first:1, text:'首回合对手禁用奥义技能，开场由对手先攻 1 秒'},
    player_seal: {locked:0, first:0, text:'首回合我方禁用奥义技能，开场由我方先攻 1 秒'}
  };
  const personalities=typeof module==='object'&&module.exports?require('./pact-personality.js'):root.PactPersonality;
  const styles=Object.fromEntries(['quill','grok','tide','chatgpt','kimi','glm','doubao','qwen','minimax','gemini','laoda','nailong'].map(id=>[id,personalities.profile(id).label]));
  const skillNames={skill:'一技能',skill2:'二技能',ultimate:'奥义技能'};
  const fields=['round','locked','skill','first','seconds'];
  const legacySchema={type:'object',additionalProperties:false,required:fields,properties:{
    round:{type:'integer',enum:[1,2,3]},locked:{type:'integer',enum:[-1,0,1]},
    skill:{type:'string',enum:['none',...Object.keys(skillNames)]},
    first:{type:'integer',enum:[-1,0,1]},seconds:{type:'integer',enum:[0,1,2,3]}
  }};
  function oldValid(t){
    return !!t && Object.keys(t).length===fields.length &&
      fields.every(k=>legacySchema.properties[k].enum.includes(t[k])) &&
      (t.skill==='none')===(t.locked===-1) && (t.seconds===0)===(t.first===-1) &&
      (t.locked!==-1 || t.first!==-1);
  }
  const integer=(min,max)=>({type:'integer',minimum:min,maximum:max});
  const slot={type:'string',enum:Object.keys(skillNames)};
  const clauseTypes={
    damage:{percent:integer(1,99)},
    speed:{percent:integer(50,150)},recharge:{percent:integer(50,200)},
    hold:{seconds:integer(0,60),untilAttack:{type:'boolean'}},
    lend:{skill:slot,uses:integer(1,3)},lock:{skill:slot},first:{seconds:integer(1,3)}
  };
  const schema={type:'object',additionalProperties:false,required:['clauses'],properties:{clauses:{
    type:'array',minItems:1,maxItems:6,items:{anyOf:Object.entries(clauseTypes).map(([kind,extra])=>{
      const properties={kind:{type:'string',enum:[kind]},seat:integer(0,1),round:integer(0,5),...extra};
      return {type:'object',additionalProperties:false,properties,required:Object.keys(properties)};
    })}
  }}};
  function clauses(t){
    if(oldValid(t))return [
      ...(t.locked===-1?[]:[{kind:'lock',seat:t.locked,round:t.round,skill:t.skill}]),
      ...(t.first===-1?[]:[{kind:'first',seat:t.first,round:t.round,seconds:t.seconds}])
    ];
    if(!t || Object.keys(t).length!==1 || !Array.isArray(t.clauses) || !t.clauses.length || t.clauses.length>6)return null;
    const seen=[];
    for(const c of t.clauses){
      if(!c || !Object.hasOwn(clauseTypes,c.kind) || (['speed','recharge'].includes(c.kind) && c.percent===100))return null;
      const def=schema.properties.clauses.items.anyOf.find(d=>d.properties.kind.enum[0]===c.kind);
      if(Object.keys(c).length!==def.required.length || !def.required.every(k=>{
        const v=c[k],d=def.properties[k];
        return d.enum?d.enum.includes(v):d.type==='boolean'?typeof v==='boolean':Number.isInteger(v)&&v>=d.minimum&&v<=d.maximum;
      }))return null;
      for(const a of seen){
        if(a.round && c.round && a.round!==c.round)continue;
        if(a.kind===c.kind && (c.kind==='first' || a.seat===c.seat && a.skill===c.skill))return null;
        const pair=[a,c],loan=pair.find(x=>x.kind==='lend'),lock=pair.find(x=>x.kind==='lock');
        if(loan && lock && lock.seat!==loan.seat && lock.skill===loan.skill)return null;
        const first=pair.find(x=>x.kind==='first'),hold=pair.find(x=>x.kind==='hold');
        if(first && hold && first.seat===hold.seat)return null;
      }
      seen.push(c);
    }
    return seen;
  }
  const valid=t=>!!clauses(t);
  const scope=c=>c.round?'第 '+c.round+' 回合':'整场比赛';
  function details(t,names=['我方','对手'],loadouts=[],midRound=0){
    if(oldValid(t))return ['第 '+t.round+' 回合',t.locked===-1?'双方技能照常':names[t.locked]+'禁用'+skillNames[t.skill],
      t.first===-1?'双方同时开打':names[t.first]+'先攻 '+t.seconds+' 秒'];
    return (clauses(t)||[]).map(c=>{
      const who=names[c.seat],other=names[1-c.seat],prefix=(midRound && !c.round?'本场剩余时间':scope(c))+' · ';
      if(c.kind==='speed')return prefix+who+'的走位速度为平时的 '+c.percent+'%';
      if(c.kind==='recharge')return prefix+who+'的一、二技能冷却恢复速度为平时的 '+c.percent+'%';
      if(c.kind==='damage')return prefix+who+'对另一方造成的扣血伤害降至原来的 '+c.percent+'%（逐击取整，原本会扣血的每击至少 1 点）';
      if(c.kind==='lend')return prefix+other+'借用'+who+'的'+skillNames[c.skill]+(loadouts[c.seat]?.[c.skill]?'「'+loadouts[c.seat][c.skill]+'」':'')+' '+c.uses+' 次，占用同一按键，放出后扣次，用尽恢复。出借方保留原招。';
      if(c.kind==='hold')return prefix+who+'停止主动出招'+(c.seconds?'，最多 '+c.seconds+' 秒':'，直至期限结束')+(c.untilAttack?'；'+other+'先出招即提前结束':'')+'。可移动和防御。';
      if(c.kind==='first')return prefix+who+(midRound && (!c.round || c.round===midRound)?'从恢复战斗起先攻 ':'开场先攻 ')+c.seconds+' 秒';
      return prefix+who+'禁用'+skillNames[c.skill];
    });
  }
  function canAppend(existing,terms,round){
    const next=clauses(terms);
    return !!next && next.every(c=>(!c.round || c.round>=round) &&
      existing.every(old=>clauses({clauses:[old,c]})));
  }
  const offensive=key=>['attack','skill','skill2','ultimate'].includes(key);
  function restricts(c,seat,key){
    if(!offensive(key))return false;
    if(c.kind==='first')return c.seat!==seat;
    return c.seat===seat && (c.kind==='hold' || c.kind==='lock' && c.skill===key);
  }
  function create(config, emit = () => {}, forecastClauses=null) {
    const legacy=cards[config.deal] || cards.plain;
    const specs=clauses(config.terms)||clauses({round:1,locked:legacy.locked,skill:'ultimate',first:legacy.first,seconds:legacy.first===-1?0:1})||[];
    const rules=[],agreements=[];
    const obligated=c=>c.kind==='first' || (['speed','recharge'].includes(c.kind) && c.percent>100)?1-c.seat:c.seat;
    function add(specs,source){
      const id=agreements.length;
      agreements.push({id,source,settled:false,witnessed:false});
      for(const c of specs)rules.push({...c,spec:c,id,remaining:c.seconds||0,left:c.uses||0,done:false});
    }
    if(forecastClauses){if(forecastClauses.length)add(forecastClauses,'推演');}
    else if(specs.length)add(specs,'赛前');

    let round,used,asker,truce,message,serial=0;
    const alive=c=>!c.done && (!c.round || c.round===round);
    const loan=(seat,key)=>rules.find(c=>alive(c)&&c.kind==='lend'&&c.seat!==seat&&c.skill===key);
    function reset(n){
      const lock=rules.find(c=>c.kind==='lock' && c.round===round && !agreements[c.id].broken);
      round=n;used=false;asker=null;truce=0;
      message=lock?'协议到期 · '+skillNames[lock.skill]+'已恢复':'';
    }
    function observe(){
      for(const c of rules)if(alive(c) && obligated(c)===0)agreements[c.id].witnessed=true;
    }
    function settle(){
      for(const group of agreements){
        if(group.settled || !group.witnessed)continue;
        if(rules.some(c=>c.id===group.id && obligated(c)===0 && !c.done))continue;
        group.settled=true;
        emit({kind:'kept',source:group.source,seat:0,round});
      }
    }
    function canAdd(terms){
      return canAppend(rules.filter(r=>!r.done).map(r=>r.spec),terms,round);
    }
    function breakable(group){return !group.settled && rules.some(c=>c.id===group.id && alive(c) && obligated(c)===0);}
    reset(1);
    const note=s=>{message=s;serial++};
    function record(kind,seat,seconds){emit({kind,seat,round,seconds});}
    function endHold(c,reason){
      c.done=true;note(reason==='attack'?'对方已先出招，停手约定结束':'停手时间到');
      emit({kind:'holdEnded',seat:c.seat,round,reason});
    }
    return {
      reset,
      roundClauses(){
        return rules.filter(alive).map(c=>{
          const spec={...c.spec,round:1};
          if(c.seconds)spec.seconds=c.remaining;
          if(c.kind==='lend')spec.uses=c.left;
          return spec;
        });
      },
      endRound(final){
        observe();
        for(const c of rules)if(final || c.round===round)c.done=true;
        settle();
        if(truce>0){truce=0;emit({kind:'kept',source:'停战',seat:0,round,shortened:true});}
      },
      renounce(id){
        if(asker!==null)return false;
        if(id==='truce'){
          if(truce<=0)return false;
          truce=0;emit({kind:'breach',source:'停战',seat:0,round});return true;
        }
        const group=agreements[id];
        if(!group || !breakable(group))return false;
        group.settled=true;group.broken=true;
        for(const c of rules)if(c.id===id)c.done=true;
        emit({kind:'breach',source:group.source,seat:0,round});return true;
      },
      get waiting(){return asker!==null},
      get canAsk(){return !used},
      hitDamage(seat,amount){
        if(!amount)return 0;
        const term=rules.find(c=>alive(c)&&c.kind==='damage'&&c.seat===seat);
        return term?Math.max(1,Math.round(amount*term.percent/100)):amount;
      },
      factor(seat,kind){
        const term=rules.find(c=>alive(c)&&c.kind===kind&&c.seat===seat);
        return term?term.percent/100:1;
      },
      lender(seat,key){return loan(seat,key)?.seat;},
      consume(seat,key){
        const c=loan(seat,key);if(!c)return;
        c.done=--c.left===0;
        emit({kind:'loanUsed',seat,round,skill:key});
        settle();note(c.done?'借用次数已用尽，原技能已恢复':'已使用借招，还剩 '+c.left+' 次');
      },
      blocked(seat,key){
        if(truce>0 && offensive(key))return '双方已约定停战';
        const c=rules.find(c=>alive(c)&&restricts(c,seat,key));
        if(!c)return '';
        if(c.kind==='lock')return '协议禁用'+skillNames[key];
        return c.kind==='first'?'等待先手结束':'协议生效 · 暂停主动出招';
      },
      breakOnAttack(key){
        if(!offensive(key) || asker!==null)return;
        if(truce>0)this.renounce('truce');
        const ids=new Set(rules.filter(c=>alive(c)&&restricts(c,0,key)).map(c=>c.id));
        for(const id of ids)this.renounce(id);
      },
      note,tick(dt){
        observe();
        for(const c of rules){
          if(!alive(c)||!c.seconds)continue;
          c.remaining=Math.max(0,c.remaining-dt);
          if(c.remaining<1e-7){if(c.kind==='hold')endHold(c,'timer');else c.done=true;}
        }
        settle();
        if(truce>0){
          truce=Math.max(0,truce-dt);
          if(truce<1e-7){truce=0;note('停战结束 · 双方守约');emit({kind:'kept',seat:0,source:'停战',round,seconds:3})}
        }
      },
      cast(seat){
        for(const c of rules)if(alive(c)&&c.kind==='hold'&&c.untilAttack&&c.seat!==seat)endHold(c,'attack');
        settle();
      },
      request(seat) {
        if(used || (seat!==0 && seat!==1))return false;
        used=true;asker=seat;record('asked',seat);return true;
      },
      answer(accept,terms) {
        if(terms){
          if(!accept || asker===null || !canAdd(terms))return false;
          asker=null;add(clauses(terms),'战中');observe();
          emit({kind:'signed',source:'战中',round,terms});note('战中新约定生效');return true;
        }
        if(asker===null)return false;
        const seat=asker;asker=null;truce=accept?3:0;
        note(accept?'双方停战 3 秒':'停战提议被拒绝');record(accept?'agreed':'refused',seat);return true;
      },
      view(canAsk){
        const active=rules.filter(alive),first=active.find(c=>c.kind==='first'),locks=active.filter(c=>c.kind==='lock');
        const promises=agreements.filter(breakable).map(g=>({id:g.id,label:g.source+'约定'+(agreements.filter(a=>a.source===g.source).length>1?' '+(g.id+1):''),
          detail:rules.filter(c=>c.id===g.id&&alive(c)&&obligated(c)===0).map(c=>details({clauses:[c.spec]})[0]).join(' / ')}));
        if(truce>0)promises.push({id:'truce',label:'双方停战',detail:'双方暂时停止主动出招'});
        return {round,promises,modifiers:active.filter(c=>c.kind==='speed'||c.kind==='recharge').map(c=>({kind:c.kind,seat:c.seat,percent:c.percent})),damage:active.filter(c=>c.kind==='damage'),locks,lock:locks[0]?.seat??-1,skill:locks[0]?.skill||'none',first:first?.seat??-1,
          firstSeconds:Math.ceil(Math.max(0,(first?.remaining||0)-1e-7)*10)/10,
          holds:active.filter(c=>c.kind==='hold').map(c=>({seat:c.seat,seconds:c.seconds?Math.ceil(c.remaining):null})),
          loans:active.filter(c=>c.kind==='lend').map(c=>({seat:1-c.seat,skill:c.skill,left:c.left})),
          asker,...(asker!==null?{existing:rules.filter(r=>!r.done).map(r=>r.spec)}:{}),canAsk:!used&&canAsk,truce:Math.ceil(truce*10)/10,message,serial};
      }
    };
  }
  const api={cards,styles,create,valid,canAppend,details,skillNames,schema};
  if(typeof module==='object' && module.exports) module.exports=api;else root.PactRules=api;
})(globalThis);
