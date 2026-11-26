/* Dorm Brawl: the same fixed-step duel runs on a phone, on the LAN host, or in local play. */
(() => {
  "use strict";
  const W = 960, H = 400, FLOOR = 326, EDGE = 32, STEP = 1 / 60;
  const COLORS = ["#53f4ec", "#ff819c"];
  const KEYS = new Set(["left","right","up","down","attack","skill","skill2","ultimate","substitute","jump","guard","evade"]);
  const TAPS = new Set(["attack","skill","skill2","ultimate","substitute","jump","evade"]);
  const BUFFER = .20, DEPTH_BACK = -36, DEPTH_FRONT = 40;
  // 体力上限；HUD 仍按百分比显示。
  const MAX_HP = 180;
  // 同一套连击中第 n 次命中的伤害倍率，避免一套带走。
  const COMBO_SCALE = [1, 1, .85, .72, .6, .5, .42, .36];
  const comboScale = n => COMBO_SCALE[Math.min(n, COMBO_SCALE.length - 1)];
  // 连续吃到这么多下就强制击倒；击飞后最多再被追打到这个数。
  const FORCED_DOWN_HITS = 6, JUGGLE_LIMIT = 8;
  const DOWN_TIME = .55, GETUP_TIME = .34, WAKE_INVULN = .18;
  const GUARD_MAX = 100, GUARD_REGEN = 30, GUARD_REGEN_HOLDING = 12, GUARD_CRUSH = .8, GUARD_AFTER_CRUSH = 60;
  const GUARD_WEAR = {light:4, finish:7, skill:9, ultimate:22};
  const HITSTOP = {light:.05, skill:.075, finish:.1, ultimate:.16, guard:.04};
  const ROUNDS_TO_WIN = 2, MAX_ROUNDS = 5;
  const CPU_LEVELS = {
    easy:   {think:[.28,.42], guard:.05, evade:.03, jump:.05, aggro:.5,  skill:.35, ult:.35, chain:.45, swing:.55},
    normal: {think:[.12,.22], guard:.22, evade:.08, jump:.15, aggro:.85, skill:.65, ult:.6,  chain:.85, swing:.85},
    hard:   {think:[.06,.11], guard:.45, evade:.15, jump:.3,  aggro:.95, skill:.8,  ult:.85, chain:1,   swing:.95}
  };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const meter = n => Math.ceil(Math.max(0,n) * 10) / 10;
  const aligned = (a,b,width) => Math.abs(a.depth - b.depth) <= width;
  const actionKit = typeof module !== "undefined" && module.exports ? require("./kit.js") : window.DormKit;
  const characterModules=typeof module!=='undefined'&&module.exports?require('./mechanics.js'):(window.ArenaCharacterModules||{});
  const active = new WeakMap();

  function newFighter(player, index, equipped) {
    const kit = equipped || actionKit.forPlayer(player, index);
    return {
      index, player, kit, x:index ? 646 : 314, y:FLOOR, depth:0, vy:0, recoil:0, dir:index ? -1 : 1,
      hp:MAX_HP, energy:2, stun:0, cd:0, cd2:0, subCd:0, subWindow:0, invulnerable:0, shield:0, shieldEarned:false,
      move:null, guard:false, moving:false, stunDuration:0, guardTime:0, blockFlash:0, evadeCooldown:0, keys:new Set(), queue:new Map(),
      subArmed:false, chainStep:0, chainWindow:0, combo:0, comboWindow:0,
      comboHits:0, knock:false, downT:0, getupT:0, guardHp:GUARD_MAX, guardCrush:0, flash:0
    };
  }
  function resetForRound(f,equipped) {
    const start = newFighter(f.player, f.index, equipped);
    // 奥义点跨回合保留，其余状态回到开局。
    Object.assign(f, start, {energy: Math.max(2, f.energy), keys: f.keys, queue: new Map()});
    f.keys.clear();
  }

  function createMatch(players, options = {}) {
    const localKits=options.forecastKits || (options.balanceChanges?.length?players.map((p,i)=>globalThis.BalanceCore.localKit(actionKit.forPlayer(p,i),options.balanceChanges)):null);
    const fighters = players.map((p,i)=>newFighter(p,i,localKits?.[i]));
    const forecast=Array.isArray(options.forecastKits);
    const lab=options.lab;
    let labFrame=0, labCast=0;
    if(lab?.setup)lab.setup(fighters);
    let playerThink=0;
    const training = options.mode === "training", cpuMode = options.mode === "cpu";
    const autoPlay = cpuMode && options.autoPlay === true;
    const playerCPU = forecast || autoPlay;
    const pact = options.pact && cpuMode ? (typeof module==='object' ? require('./pact-rules.js') : window.PactRules).create(options.pact,options.onPactEvent,forecast?options.forecastClauses:null) : null;
    const autoPlea = Boolean(pact && !forecast);
    const preciseCPU = autoPlay || (!forecast && cpuMode && Boolean(pact || options.auction));
    const cpu = CPU_LEVELS[options.difficulty] || CPU_LEVELS.normal;
    let roundNo = 1, hitstop = 0;
    const wins = [0, 0];
    const dummyX = 520;
    if (training) {
      Object.assign(fighters[0], {x:dummyX-83, energy:4});
      fighters[1].x = dummyX;
    }
    let ruleRuntime=null,ruleRound=0,ruleName='';
    const auction=options.auction, ruleSeed=auction?(options.ruleSeed??options.seed??Math.floor(Math.random()*4294967296))>>>0:0;
    if(options.forecastEnergy)fighters.forEach((f,i)=>{f.energy=options.forecastEnergy[i];});
    function readyRule(){
      if(!auction||ruleRound===roundNo)return true;
      const chosen=auction.current(roundNo,wins.slice(),fighters.map(f=>f.energy),()=>pact?.roundClauses()||[]);
      if(!chosen)return false;
      ruleName=chosen.name;
      ruleRuntime=(typeof module==='object'?require('./auction-rules.js'):window.AuctionRules).runtime(chosen,ruleSeed^roundNo,MAX_HP,msg=>{auction.feedback?.(msg);});
      ruleRound=roundNo;return true;
    }
    const effects=[], shots=[], sounds=[], heldSources=new Map(),chargedCasts=new Set();let castSequence=0;
    let countdown=training ? 0 : 2.65, remaining=training ? 0 : 60, elapsed=0, shake=0;
    let dummyReset=0, drillDelay=0, trainingStart=training, result=null, ending=null, cpuWait=0, notice="", noticeFor=0, soundId=0;
    let randomState = Number.isFinite(options.seed) ? options.seed >>> 0 : (Math.random()*0xffffffff) >>> 0;
    const random = () => (randomState=(Math.imul(randomState,1664525)+1013904223)>>>0) / 4294967296;
    const screenY = f => f.y + f.depth;
    // Vertical recoil is independent of depth: two grounded fighters in separate lanes can pass.
    const canSub = f => !ending && f.hp > 0 && f.subWindow > 0 && !f.invulnerable && !f.subCd && f.energy >= 1;
    function release(index) {
      const f=fighters[index];
      if(!f) return;
      for(const [source,binding] of heldSources) if(binding.index===index) heldSources.delete(source);
      f.keys.clear(); f.queue.clear(); f.subArmed=false;
    }
    function sound(key,meta={}) {
      const event={id:++soundId,key,...meta};sounds.push(event); if(sounds.length>8)sounds.shift();
      options.onSound?.(event);
    }
    function changeKey(f,key,down) {
      if(lab?.command)lab.command(labFrame,f.index,key,down);
      if(!down){f.keys.delete(key);if(key==="substitute")f.subArmed=false;return;}
      if(pact){
        if(pact.waiting)return;
        const reason=pact.blocked(f.index,key);
        if(reason && (f.index!==0 || playerCPU))return;
      }
      if(f.keys.has(key))return;
      f.keys.add(key);
      if(key==="substitute") {
        f.subArmed=true;
        if(!canSub(f)) announce(f.player.name+" · "+(f.subCd>0?"替身冷却 "+Math.ceil(f.subCd)+" 秒":f.energy<1?"替身需要 1 点奥义":"按住替身，受击时脱身"),1.4);
      }
      if(TAPS.has(key) && countdown<=BUFFER) f.queue.set(key,BUFFER);
    }
    function releaseSource(source) {
      const binding=heldSources.get(source);
      if(!binding)return;
      heldSources.delete(source);
      for(const other of heldSources.values()) if(other.index===binding.index && other.key===binding.key)return;
      changeKey(fighters[binding.index],binding.key,false);
    }
    const demonstrations=[];
    function tryMove(action){
      if(training && ["skill","skill2","ultimate"].includes(action))demonstrations.push(action);
    }
    function input(index,action,down,source) {
      if(action==='plea'){
        if(down && index===0 && pact && !pact.waiting)requestPlea(0);
        return;
      }
      if(autoPlay)return;
      if(training && index===0 && action==="drill"){
        if(down && !drillDelay){
          drillDelay=.6; announce("假人即将反击",.6);
          addFX("threat",fighters[0].x,screenY(fighters[0]),"#ffcf62",.6,{reach:50,dir:1});
        }
        return;
      }
      const key=({special:"skill",block:"guard",punch:"attack"})[action]||action;
      source=index+":"+(source??("button:"+key));
      if(!down){releaseSource(source);return;}
      if((auction&&ruleRound!==roundNo)||pact?.waiting||result||ending||((cpuMode||training)&&index===1)||!fighters[index]||!KEYS.has(key)||heldSources.has(source))return;
      heldSources.set(source,{index,key}); changeKey(fighters[index],key,true);
    }
    let playerPleaQueued=false;
    function low(seat){return !result && !ending && countdown<=0 && fighters.every(f=>f.hp>0) && fighters[seat].hp<=MAX_HP*.25;}
    function eligible(seat){
      return low(seat) && hitstop<=0 && fighters.every(f=>!f.move && !f.knock && !f.downT && !f.getupT && !f.stun);
    }
    function requestPlea(seat=0){
      if(seat===1 && playerPleaQueued)return false;
      if(!pact?.canAsk || !low(seat))return false;
      if(!eligible(seat)){if(seat===0)playerPleaQueued=true;return false;}
      if(!pact.request(seat))return false;
      playerPleaQueued=false;
      release(0);release(1);return true;
    }
    function getHud(){
      const agreement=pact?.view(low(0));
      if(agreement)for(const loan of agreement.loans)loan.name=fighters[1-loan.seat].kit[loan.skill].name;
      return {...(auction?{auctionName:ruleRound===roundNo?ruleName:'待竞拍'}:{}),...(pact?{pact:{...agreement,queued:playerPleaQueued,callout:pact.waiting?{x:fighters[1].x/W,y:(screenY(fighters[1])-185)/H}:null}}:{}),hp:fighters.map(f=>Math.ceil(f.hp/MAX_HP*100)),cd:fighters.map(f=>meter(f.cd)),cd2:fighters.map(f=>meter(f.cd2)),
        subCd:fighters.map(f=>meter(f.subCd)),energy:fighters.map(f=>f.energy),canSub:fighters.map(canSub),
        combo:fighters.map(f=>f.combo),time:Math.ceil(remaining),phase:ending?"ko":countdown>0?"countdown":"fight",
        countdown:Math.max(0,Math.ceil(countdown)),callout:noticeFor>0?notice:"",
        guard:fighters.map(f=>Math.round(f.guardHp)),crushed:fighters.map(f=>f.guardCrush>0),
        round:roundNo,wins:wins.slice(),roundsToWin:training?0:ROUNDS_TO_WIN,training,
        endReason:ending?ending.outcome.reason:""};
    }
    function announce(message,duration=.85){notice=message;noticeFor=duration;}
    function addFX(kind,x,y,color,life,extra={}){effects.push({kind,x,y,color,life,max:life,...(Number.isInteger(extra.owner)?{characterId:fighters[extra.owner]?.kit.characterId}:{}),...extra});}
    function charge(f){f.energy=Math.min(4,f.energy+1);}

    function knockDown(b,vy){
      b.knock=true;b.vy=Math.min(b.vy,vy);b.stun=9;b.stunDuration=9;b.move=null;b.guard=false;
    }
    function landHit(a,b,amount,dir,style,sourceSlot) {
      if(b.hp<=0 || b.invulnerable>0 || b.downT>0 || b.getupT>0)return false;
      const dummy=training && b.index===1;
      // 被击飞后的追打次数有上限，超过就不再受伤，直到落地起身。
      if(b.knock && b.comboHits>=JUGGLE_LIMIT)return false;
      const protectedBySkill=b.shield>0, blocking=!protectedBySkill && b.guard && b.dir===-dir;
      let guarded=protectedBySkill||blocking, crushed=false;
      if(blocking){
        const wear=GUARD_WEAR[style]||GUARD_WEAR.skill;
        b.guardHp=Math.max(0,b.guardHp-wear);
        if(b.guardHp<=0){crushed=true;guarded=false;}
      }
      let damage;
      if(protectedBySkill)damage=0;
      else if(guarded)damage=Math.max(1,Math.round(amount*.15));
      else if(crushed)damage=Math.max(1,Math.round(amount*.5));
      else damage=Math.max(1,Math.round(amount*comboScale(b.comboHits)));
      if(protectedBySkill&&!b.shieldEarned){b.shieldEarned=true;charge(b);}
      if(pact)damage=pact.hitDamage(a.index,damage);
      if(autoPlea && b.index===0 && pact.canAsk)damage=Math.min(damage,Math.max(0,b.hp-1));
      if(lab)lab.hit(labFrame,a.index,Math.min(b.hp,damage),sourceSlot||a.move?.type||'attack',labCast||a.move?.labId||0,guarded,b.hp,b.comboHits,roundNo,60-remaining);
      const actual=Math.min(b.hp,damage);
      if(dummy && damage>=b.hp && !dummyReset)dummyReset=.75;
      b.hp=Math.max(dummy?1:0,b.hp-damage);
      ruleRuntime?.hit(fighters,a.index,actual,blocking&&!crushed);
      sound(guarded?"guard":"hit",{impact:style,characterId:a.kit.characterId,owner:a.index,slot:sourceSlot||a.move?.type||(style==="light"?"attack":"skill")});
      if(guarded)b.blockFlash=.25;
      hitstop=Math.max(hitstop,guarded?HITSTOP.guard:HITSTOP[style]||HITSTOP.skill);
      if(crushed){
        b.guard=false;b.guardCrush=GUARD_CRUSH;b.stun=.75;b.stunDuration=.75;b.subWindow=.53;b.flash=.12;
        if(b.move&&!b.move.fired)b.move=null;
        b.recoil=dir*120;b.chainWindow=0;b.chainStep=0;
        announce("破防！",.9);hitstop=Math.max(hitstop,.14);
      }else if(!guarded){
        b.comboHits++;b.flash=.11;
        b.subWindow = .53;
        if(b.move && !b.move.fired)b.move=null;
        const knock=style==="light"?55:style==="ultimate"?410:style==="finish"?245:175;
        b.recoil=dummy?0:dir*knock;
        b.chainWindow=0; b.chainStep=0;
        a.combo=a.comboWindow>0?a.combo+1:1; a.comboWindow=1.0;
        if(!dummy && b.knock){
          // 空中追打：保持击飞状态，只略微托高。
          b.vy=Math.min(b.vy,-160);
        }else if(!dummy && (style==="finish"||style==="ultimate"||b.comboHits>=FORCED_DOWN_HITS)){
          knockDown(b,style==="ultimate"?-375:style==="finish"?-325:-260);
        }else{
          if(style==="light") b.stun=.31;
          else b.stun=.38;
          b.stunDuration=b.stun;
          if(!dummy && style==="skill")b.vy=Math.min(b.vy,-100);
        }
      }
      const tone=guarded?"#99edff":style==="light"?"#ffe987":COLORS[a.index];
      addFX("hit",b.x-dir*(protectedBySkill&&b.kit.characterId==="doubao"?42.536:protectedBySkill&&b.kit.characterId==="minimax"?46.56:10),screenY(b)-62,tone,.24,{dir,target:b.index});
      addFX("text",b.x,screenY(b)-104,tone,.58,{target:b.index,text:protectedBySkill?"护盾":crushed?"破防":guarded?"防守":"−"+damage});
      shake=Math.max(shake,guarded?1.3:crushed?6:style==="light"?2.7:style==="ultimate"?8:5);
      return damage>0;
    }

    function equippedKit(f,slot){
      const giver=pact?.lender(f.index,slot);
      return giver===undefined?f.kit:fighters[giver].kit;
    }
    function fireMove(f,enemy,m){
      if(!m.borrowedKit)return releaseMove(f,enemy,m);
      // Native character moves read the caster’s kit synchronously and apply effects to the caster.
      const own=f.kit;
      try{f.kit=m.borrowedKit;releaseMove(f,enemy,m);}
      finally{f.kit=own;}
      pact.consume(f.index,m.type);
    }
    function releaseMove(f,enemy,m) {
      const dir=m.dir,distance=(enemy.x-f.x)*dir,c=COLORS[f.index],y=screenY(f);
      if(m.type==="attack"){
        const third=m.stage===3;
        addFX("swing",f.x+dir*22,y-58,c,third?.24:.16,{owner:f.index,dir,stage:m.stage});
        if(distance>=-10 && distance<=(third?119:102) && aligned(f,enemy,19) && Math.abs(f.y-enemy.y)<82){
          m.hit=landHit(f,enemy,[5,6,9][m.stage-1],dir,third?"finish":"light");
        }
        f.chainWindow=third?0:.67;
        return;
      }
      const characterId=f.kit.characterId, role=characterModules[characterId];
      if(role?.release&&f.kit.presetSlots?.[m.type]){
        const castId=++castSequence;const chargeCast=(target)=>{if(m.type!=='ultimate'&&!chargedCasts.has(castId)){chargedCasts.add(castId);charge(target);}};
        const addRoleFX=(kind,x,yy,color,life,extra={})=>addFX(kind,x,yy,color,life,{owner:f.index,characterId,slot:m.type,...extra});
        const spawnShot=(spec={})=>{const life=spec.life??1.48;const p={owner:f.index,characterId,castId,slot:m.type,x:f.x+dir*30,y:y-59,depth:f.depth,dir,color:c,damage:f.kit[m.type].power,life,maxLife:life,age:0,delay:0,speed:565,radius:37,depthTolerance:21,...spec};shots.push(p);return p;};
        if(role.release({id:characterId,characterId,f,enemy,m,dir,y,distance,slot:m.type,players,step:STEP,shots,addFX:addRoleFX,spawnShot,landHit,charge:chargeCast,clamp,aligned})){if(m.hit)chargeCast(f);sound("skill",{characterId:f.kit.characterId,owner:f.index,slot:m.type});return;}
      }
      sound("skill",{characterId:f.kit.characterId,owner:f.index,slot:m.type});
      if(m.type==="ultimate"){
        const ult=f.kit.ultimate, ranged=ult.kind==="volley", reach=ranged?540:300;
        addFX("finale",f.x,y,c,.48,{dir,reach,variant:ranged?1:0,...(characterId==="quill"?{owner:f.index,characterId,slot:"ultimate",quillFinale:true}:{})});
        if(ranged){
          shots.push({owner:f.index,x:f.x+dir*22,y:y-57,depth:f.depth,dir,color:c,life:.65,
            damage:ult.power,ultimate:true});
        }else{
          f.x=clamp(f.x+dir*181,EDGE,W-EDGE);
          if(distance>=-30 && distance<=reach && aligned(f,enemy,34) && Math.abs(enemy.y-f.y)<115)
            landHit(f,enemy,ult.power,dir,"ultimate");
        }
        return;
      }
      const s=f.kit[m.type];
      switch(s.kind){
        case "dash":{
          const old=f.x;
          f.x=clamp(f.x+dir*177,EDGE,W-EDGE);
          addFX("dash",old,y-50,c,.33,{owner:f.index,end:f.x,dir});
          if(distance>=-9 && distance<=213 && aligned(f,enemy,22) && Math.abs(f.y-enemy.y)<83)
            m.hit=landHit(f,enemy,s.power,dir,"skill");
          break;
        }
        case "projectile":
          shots.push({owner:f.index,x:f.x+dir*30,y:y-59,depth:f.depth,dir,color:c,life:1.48,damage:s.power});
          break;
        case "shield":
          f.shield=.72+s.power*.045;f.shieldEarned=false;
          addFX("ring",f.x,y-50,c,.36,{size:54});
          break;
        case "heal":{
          const restored=Math.min(MAX_HP-f.hp,Math.round(s.power*.72));
          f.hp+=restored;
          addFX("text",f.x,y-104,"#a9fb9a",.8,{text:"+"+restored});
          addFX("ring",f.x,y-40,"#a9fb9a",.48,{size:52});
          m.hit=restored>0;
          break;
        }
        default:
          addFX("ring",f.x,y-43,c,.45,{size:132,owner:f.index,burst:true});
          if(Math.abs(enemy.x-f.x)<151 && aligned(f,enemy,30) && Math.abs(f.y-enemy.y)<95)
            m.hit=landHit(f,enemy,s.power,enemy.x>=f.x?1:-1,"skill");
      }
      if(m.hit)charge(f);
    }
    function initiate(f,type,demonstration=false){
      if(pact){
        if(f.index===0 && !playerCPU)pact.breakOnAttack(type);
        if(pact.blocked(f.index,type)){f.queue.delete(type);return;}
        pact.cast(f.index);
      }
      const stage=type==="attack"&&f.chainWindow>0?Math.min(3,f.chainStep+1):1;
      const kit=equippedKit(f,type);
      const regular=type==="skill"||type==="skill2";
      const s=regular?kit[type]:null;
      let windup = stage === 3 ? .095 : .065;
      let recovery = stage === 3 ? .27 : .17;
      if (regular) {
        windup = .095 + s.delay;
        recovery = .23;
      } else if (type === "ultimate") {
        windup = .18 + kit.ultimate.delay;
        recovery = .47;
      }
      if(lab)lab.cast(labFrame,f.index,type);
      f.move={type,stage,dir:f.dir,t:0,windup,duration:windup+recovery,fired:false,hit:false};
      if(lab)f.move.labId=labFrame*2+f.index+1;
      if(kit!==f.kit)f.move.borrowedKit=kit;
      f.queue.delete(type);f.guard=false;
      // 护盾期间出普攻会收盾，护盾只用来接招，不能边无敌边压制。
      if(type==="attack"&&f.shield>0)f.shield=0;
      f.subWindow=0;
      if(type==="attack"){
        f.chainStep=stage;
        return;
      }
      f.chainWindow=0;f.chainStep=0;
      if(regular){
        if(!demonstration)f[type==="skill"?"cd":"cd2"]=s.cooldown;
        announce(f.player.name+" · "+s.name,Math.max(.85,windup));
        addFX("cast",f.x,screenY(f)-70,COLORS[f.index],Math.max(.25,windup),{owner:f.index});
      }else{
        if(!demonstration)f.energy-=4;
        announce("奥义 · "+kit.ultimate.name,1.28);
        addFX("threat",f.x,screenY(f),COLORS[f.index],windup,{reach:kit.ultimate.kind==="volley"?540:300,dir:f.dir,owner:f.index,characterId:kit.characterId,slot:"ultimate"});
      }
    }
    function substitute(f,enemy){
      if(!(f.queue.has("substitute")||f.subArmed&&f.keys.has("substitute"))||!canSub(f))return false;
      f.subArmed=false;
      const old=f.x,y=screenY(f),side=enemy.dir,oldDir=f.dir;
      const behind=clamp(enemy.x-side*67,EDGE,W-EDGE);
      // At the wall, make room on the inside for the same behind-the-opponent escape.
      if (Math.abs(behind-enemy.x)<52) enemy.x=behind+side*52;
      f.x=behind;f.depth=enemy.depth;f.y=FLOOR;f.vy=0;f.recoil=0;
      f.dir=enemy.x>f.x?1:-1;f.stun=0;f.subWindow=0;f.move=null;f.guard=false;f.chainWindow=0;f.chainStep=0;
      f.queue.clear();f.energy--;f.subCd=12;f.invulnerable=.72;
      enemy.combo=0;enemy.comboWindow=0;
      addFX("decoy",old,y,COLORS[f.index],.5,{dir:oldDir});
      addFX("ring",f.x,screenY(f)-40,COLORS[f.index],.25,{size:42});
      announce(f.player.name+" · 替身脱身",.72);sound("guard",{characterId:f.kit.characterId,owner:f.index,slot:"substitute"});
      return true;
    }
    function startEvade(f,direction){
      f.queue.delete("evade");f.guard=false;f.evadeCooldown=.62;
      f.move={type:"evade",t:0,duration:.26,dir:direction,fired:false};
      addFX("dust",f.x-direction*15,screenY(f)-2,"#dad0ae",.22);
    }
    function canAutoCast(f,enemy,slot){
      const kit=equippedKit(f,slot);
      const skill=kit[slot];
      const dx=enemy.x-f.x, dz=enemy.depth-f.depth;
      const gap=Math.abs(dx), lane=Math.abs(dz);
      const inFront=dx*f.dir>=-8;
      if(slot==='attack')return inFront&&gap<=96&&lane<=17&&Math.abs(enemy.y-f.y)<62&&
        !enemy.knock&&!enemy.downT&&!enemy.getupT&&enemy.invulnerable<=.065;
      const windup=(slot==='ultimate'?.18:.095)+skill.delay;
      if(skill.kind==='heal')return f.hp<MAX_HP*.86&&(gap>192||enemy.stun>=windup);
      if(skill.kind==='shield'){
        return !f.shield&&(gap<150&&lane<21&&enemy.move&&!enemy.move.fired&&enemy.move.type!=='evade'||
          shots.some(p=>p.owner!==f.index&&(f.x-p.x)*p.dir>0&&Math.abs(f.x-p.x)<180&&aligned(p,f,19)));
      }
      if(!inFront||enemy.knock||enemy.downT||enemy.getupT||enemy.invulnerable>windup||enemy.move?.type==='evade'||
        Math.abs(enemy.y-f.y)>62)return false;
      if(slot==='ultimate'&&(enemy.shield>windup||enemy.guard&&enemy.dir===-f.dir&&enemy.guardHp>GUARD_WEAR.ultimate))return false;
      const {kind}=skill;
      let reach={burst:119,dash:180,rush:240,projectile:350,volley:370}[kind];
      let depth={burst:21,dash:17,rush:24,projectile:15,volley:20}[kind];
      if(kit.presetSlots?.[slot]){
        const id=kit.characterId;
        if(id==='qwen'&&kind==='projectile')reach=180;
        if(id==='qwen'&&kind==='volley')reach=250;
        if(id==='kimi'&&slot==='skill2')reach=205;
        if(id==='grok'&&slot==='ultimate')reach=315;
        if(id==='laoda'&&slot==='ultimate')reach=207;
        if(id==='nailong'&&slot==='ultimate'){reach=151;depth=27;}
        if(id==='gemini'&&kind==='dash'){
          const endDepth=clamp(f.depth+(f.depth>0?-24:24),DEPTH_BACK,DEPTH_FRONT);
          if(Math.abs(enemy.depth-endDepth)>21)return false;
        }
      }
      if(gap>reach||lane>depth)return false;
      if(enemy.stun>0||enemy.guard||enemy.move)return true;
      const retreat=(Number(enemy.keys.has("right"))-Number(enemy.keys.has("left")))*f.dir;
      const stepLane=Number(enemy.keys.has("down"))-Number(enemy.keys.has("up"));
      const lookAhead=Math.min(.23,windup);
      return gap+Math.max(0,retreat)*278*lookAhead<=reach&&Math.abs(dz+stepLane*116*lookAhead)<=depth+5;
    }
    function driveCPU(seat=1){
      const f=fighters[seat],e=fighters[1-seat],dx=Math.abs(e.x-f.x),dz=e.depth-f.depth;
      const toward=e.x>f.x?"right":"left", away=toward==="right"?"left":"right";
      const wait=()=>{const next=cpu.think[0]+random()*(cpu.think[1]-cpu.think[0]);if(seat===1)cpuWait=next;else playerThink=next;};
      if(lab?.command)lab.command(labFrame,seat,'clear',true);
      f.keys.clear();
      if(canSub(f)&&random()<cpu.guard+.2)changeKey(f,"substitute",true);
      if(f.stun||f.knock||f.downT||f.getupT){wait();return;}
      // 看到威胁先决定守还是躲。
      const sameLane=Math.abs(dz)<26;
      const meleeThreat=e.move&&!e.move.fired&&e.move.type!=="evade"&&dx<(e.move.type==="ultimate"?320:200)&&sameLane;
      const incoming=shots.some(p=>p.owner!==seat&&(f.x-p.x)*p.dir>0&&Math.abs(f.x-p.x)<260&&aligned(p,f,24));
      if((meleeThreat||incoming)&&!f.guardCrush){
        const r=random();
        if(r<cpu.guard){changeKey(f,"guard",true);wait();return;}
        if(r<cpu.guard+cpu.evade){changeKey(f,Math.abs(f.depth-DEPTH_BACK)>20?"up":"down",true);changeKey(f,"evade",true);wait();return;}
        if(incoming&&r<cpu.guard+cpu.evade+cpu.jump){changeKey(f,"jump",true);wait();return;}
      }
      if(Math.abs(dz)>8)changeKey(f,dz<0?"up":"down",true);
      if(dx>130&&random()>cpu.aggro){
        // 远距离时偶尔停步观察或后撤，近身就一定还手。
        if(random()<.4)changeKey(f,away,true);
        wait();return;
      }
      if(dx>75)changeKey(f,toward,true);
      const ultimateReady=preciseCPU?canAutoCast(f,e,"ultimate"):dx<(equippedKit(f,"ultimate").ultimate.kind==="volley"?495:265)&&sameLane;
      if(f.energy===4 && ultimateReady && random()<cpu.ult)changeKey(f,"ultimate",true);
      else{
        const slots=random()<.5?["skill","skill2"]:["skill2","skill"];
        for(const slot of slots){
          const s=equippedKit(f,slot)[slot],available=slot==="skill"?!f.cd:!f.cd2;
          const usable={heal:f.hp<MAX_HP*.86,shield:dx<148,projectile:dx<600&&Math.abs(dz)<20,
            burst:dx<145&&Math.abs(dz)<28,dash:dx<210&&Math.abs(dz)<22}[s.kind];
          if(available&&(preciseCPU?canAutoCast(f,e,slot):usable)&&random()<cpu.skill){changeKey(f,slot,true);break;}
        }
        const continuing=f.chainWindow>0;
        if((preciseCPU?canAutoCast(f,e,"attack"):dx<106&&Math.abs(dz)<23)&&random()<(continuing?cpu.chain:cpu.swing))changeKey(f,"attack",true);
      }
      wait();
    }

    function stepFighter(f,enemy,dt,ready){
      const wasCrushed=f.guardCrush>0;
      const recharge=pact?pact.factor(f.index,"recharge"):1;
      f.cd=Math.max(0,f.cd-dt*recharge);f.cd2=Math.max(0,f.cd2-dt*recharge);
      for(const k of ["subCd","subWindow","shield","invulnerable","evadeCooldown","chainWindow","comboWindow","blockFlash","guardCrush","flash"])
        f[k]=Math.max(0,f[k]-dt);
      if(wasCrushed&&!f.guardCrush)f.guardHp=Math.max(f.guardHp,GUARD_AFTER_CRUSH);
      if(!f.knock)f.stun=Math.max(0,f.stun-dt);
      if(!f.comboWindow)f.combo=0;
      // 倒地 → 起身（起身期间和起身后短暂无敌，防止压起身无限连）。
      if(f.downT>0){
        f.downT=Math.max(0,f.downT-dt);f.stun=Math.max(f.stun,f.downT+GETUP_TIME);
        if(!f.downT){f.getupT=GETUP_TIME;f.invulnerable=GETUP_TIME+WAKE_INVULN;}
      }else if(f.getupT>0){
        f.getupT=Math.max(0,f.getupT-dt);f.stun=Math.max(f.stun,f.getupT);
        if(!f.getupT)f.stun=0;
      }
      if(!f.stun&&!f.knock&&!f.downT&&!f.getupT)f.comboHits=0;
      if(!f.guardCrush)f.guardHp=Math.min(GUARD_MAX,f.guardHp+(f.guard&&!f.blockFlash?GUARD_REGEN_HOLDING:f.guard?0:GUARD_REGEN)*dt);
      if(!f.move && !f.knock && !f.downT && Math.abs(enemy.x-f.x)>1)f.dir=enemy.x>=f.x?1:-1;
      if(!f.knock&&!f.downT&&!f.getupT)substitute(f,enemy);
      const grounded=f.y>=FLOOR-1 && f.vy>=0;
      f.guard=!f.move&&!f.stun&&!f.guardCrush&&grounded&&f.keys.has("guard");
      f.guardTime=f.guard?f.guardTime+dt:0;
      let dx=Number(f.keys.has("right"))-Number(f.keys.has("left"));
      let dz=Number(f.keys.has("down"))-Number(f.keys.has("up"));
      if(f.guard||f.stun){dx=0;dz=0;}
      f.moving=Boolean(dx||dz);
      const cancel=f.move?.type==="attack"&&f.move.hit&&f.move.t>f.move.windup+.034;
      if(!f.stun && (!f.move||cancel)){
        if(preciseCPU && (f.index===1 || playerCPU))for(const slot of ["ultimate","skill","skill2","attack"]){
          if(f.queue.has(slot)&&!canAutoCast(f,enemy,slot))f.queue.delete(slot);
        }
        if(!f.move && grounded && f.queue.has("jump")){
          f.vy=-520;f.queue.delete("jump");f.guard=false;
          addFX("dust",f.x,screenY(f)-2,"#dddbeb",.26);
        }
        if(f.index===0 && demonstrations.length)initiate(f,demonstrations.shift(),true);
        else if(f.queue.has("ultimate") && f.energy===4)initiate(f,"ultimate");
        else if(f.queue.has("skill") && !f.cd)initiate(f,"skill");
        else if(f.queue.has("skill2") && !f.cd2)initiate(f,"skill2");
        else if(f.queue.has("attack") && (!f.move || f.move.stage!==3))initiate(f,"attack");
        else if(!f.move && f.queue.has("evade") && grounded && !f.evadeCooldown)startEvade(f,dx||f.dir);
      }
      const rate=f.move?(f.move.type==="ultimate"?0:.16):1;
      const diagonal=dx&&dz?Math.SQRT1_2:1;
      const walkSpeed=pact?pact.factor(f.index,"speed"):1;
      let travel=dx*278*rate*diagonal*dt*walkSpeed;
      f.depth=clamp(f.depth+dz*116*rate*diagonal*dt*walkSpeed,DEPTH_BACK,DEPTH_FRONT);
      if(f.move?.type==="evade"){
        const stride=Math.min(dt,Math.max(0,.13-f.move.t))*670,gap=(enemy.x-f.x)*f.move.dir;
        travel=f.move.dir*(gap>=0&&aligned(f,enemy,16)?Math.min(stride,Math.max(0,gap-51)):stride);
      }
      f.x=clamp(f.x+travel+f.recoil*dt,EDGE,W-EDGE);f.recoil*=Math.exp(-dt*12);
      const airborne=f.y<FLOOR-1;
      f.vy+=1340*dt;f.y+=f.vy*dt;
      if(f.y>=FLOOR){
        f.y=FLOOR;f.vy=0;
        if(airborne)addFX("dust",f.x,screenY(f)-2,"#dddbeb",.23);
        if(f.knock&&airborne){
          f.knock=false;f.downT=DOWN_TIME;f.stun=DOWN_TIME+GETUP_TIME;f.stunDuration=f.stun;f.recoil*=.4;
          shake=Math.max(shake,3);sound("guard",{characterId:f.kit.characterId,owner:f.index,slot:"down"});
        }
      }
      // 原地被打满强制击倒次数时（没有离地），下一帧也要转入倒地。
      if(f.knock&&!airborne&&f.vy>=0&&f.y>=FLOOR){f.knock=false;f.downT=DOWN_TIME;f.stun=DOWN_TIME+GETUP_TIME;}
      if(f.move){
        const m=f.move;m.t+=dt;
        if(m.type!=="evade"&&!m.fired && m.t>=m.windup){m.fired=true;ready.push([f,m]);}
        if(m.t>=m.duration)f.move=null;
      }
      for(const [key,ttl] of f.queue){if(ttl<=dt)f.queue.delete(key);else f.queue.set(key,ttl-dt);}
    }
    function separate(){
      const [a,b]=fighters;
      if(training){b.x=dummyX;b.recoil=0;}
      if(!aligned(a,b,14)||Math.abs(a.y-b.y)>=73)return;
      const delta=b.x-a.x,overlap=51-Math.abs(delta);
      if(overlap<=0)return;
      const sign=delta===0?a.dir:Math.sign(delta);
      if(training){a.x=dummyX-sign*51;return;}
      a.x=clamp(a.x-sign*overlap/2,EDGE,W-EDGE);b.x=clamp(a.x+sign*51,EDGE,W-EDGE);
      a.x=clamp(b.x-sign*51,EDGE,W-EDGE);
    }
    function finish(){
      release(0);release(1);
      const [a,b]=fighters;
      const outcome={winner:a.hp===b.hp?null:a.hp>b.hp?0:1,reason:a.hp<=0||b.hp<=0?"KO":"时间到"};
      sound("end",outcome.winner===null?{}:{characterId:fighters[outcome.winner].kit.characterId,owner:outcome.winner});
      if(lab)lab.round(labFrame,Math.round((60-remaining)*60),outcome,fighters.map(f=>f.hp),MAX_HP);
      options.onRoundData?.(outcome,60-remaining,fighters.map(f=>f.hp),MAX_HP);
      pact?.endRound(roundNo>=MAX_ROUNDS || (outcome.winner!==null && wins[outcome.winner]+1>=ROUNDS_TO_WIN));
      // 回合结束由模拟本身控制，联机两端看到的是同一套演出。
      ending={outcome,age:0};shots.length=0;chargedCasts.clear();hitstop=0;
      for(const f of fighters){f.move=null;f.moving=false;f.guard=false;}
      announce(outcome.reason==="KO"?"K.O.":"时间到",1.5);
    }
    function closeRound(outcome){
      if(outcome.winner!==null)wins[outcome.winner]++;
      const decided=wins.some(w=>w>=ROUNDS_TO_WIN)||roundNo>=MAX_ROUNDS;
      if(decided){
        result={winner:wins[0]===wins[1]?null:wins[0]>wins[1]?0:1,reason:outcome.reason,wins:wins.slice(),rounds:roundNo};
        return;
      }
      roundNo++;playerPleaQueued=false;pact?.reset(roundNo);ending=null;countdown=2.65;remaining=60;hitstop=0;cpuWait=0;playerThink=0;noticeFor=0;
      shots.length=0;effects.length=0;chargedCasts.clear();
      for(const f of fighters)resetForRound(f,localKits?.[f.index]);
    }
    function tick(dt){
      if(pact?.waiting||!readyRule())return;
      elapsed+=dt;shake*=Math.exp(-dt*13);noticeFor-=dt;
      if(ending){
        ending.age+=dt;
        for(const f of fighters){
          f.x=clamp(f.x+f.recoil*dt,EDGE,W-EDGE);f.recoil*=Math.exp(-dt*8);
          f.vy+=1340*dt;f.y=Math.min(FLOOR,f.y+f.vy*dt);
          if(f.y>=FLOOR)f.vy=0;
        }
        for(let i=effects.length-1;i>=0;i--){effects[i].life-=dt;if(effects[i].life<=0)effects.splice(i,1);}
        if(ending.age>=2.2)closeRound(ending.outcome);
        return;
      }
      if(hitstop>0&&countdown<=0){
        // 顿帧：冻结角色和飞行道具，只让特效继续消散。
        hitstop=Math.max(0,hitstop-dt);elapsed-=dt;
        for(let i=effects.length-1;i>=0;i--){effects[i].life-=dt*.5;if(effects[i].life<=0)effects.splice(i,1);}
        return;
      }
      if(trainingStart){trainingStart=false;sound("start");}
      if(countdown>0){
        countdown-=dt;if(countdown<=0){announce("开打！",.65);sound("start");}return;
      }
      if(pact){
        if(autoPlea){
          if(playerPleaQueued && !low(0))playerPleaQueued=false;
          if(requestPlea(0) || requestPlea(1))return;
        }
        pact.tick(dt);
      }
      ruleRuntime?.tick(dt,fighters);
      if(autoPlea && pact.canAsk && low(0)){
        // Finish current hit and recovery animations without queuing another exchange.
        release(0);release(1);
      }else if(lab?.inputs){
        for(const [seat,key,down] of lab.inputs(labFrame,fighters)){
          if(key==='clear')fighters[seat].keys.clear();else changeKey(fighters[seat],key,down);
        }
      }else{
        if(playerCPU && (playerThink-=dt)<=0)driveCPU(0);
        if(cpuMode){cpuWait-=dt;if(cpuWait<=0)driveCPU();}
      }
      const ready=[];
      stepFighter(fighters[0],fighters[1],dt,ready);stepFighter(fighters[1],fighters[0],dt,ready);
      for(const [f,m] of ready){
        if(lab){labCast=m.labId;const begin=shots.length,before=f.hp;fireMove(f,fighters[1-f.index],m);
          for(let i=begin;i<shots.length;i++)shots[i].labId=labCast;
          if(f.hp>before)lab.heal(f.index,f.hp-before);labCast=0;
        }else fireMove(f,fighters[1-f.index],m);
      }
      separate();
      for(let i=shots.length-1;i>=0;i--){
        const p=shots[i],target=fighters[1-p.owner];
        if((p.delay||0)>0){p.delay=Math.max(0,p.delay-dt);continue;}
        if(p.characterId){
          p.age=(p.age||0)+dt;
          if(p.boomerang&&!p.returned&&p.age>=(p.returnAfter??.35)){p.returned=true;p.dir*=-1;p.hitThisLeg=false;}
          p.x+=dt*(p.speed??(p.ultimate?830:565))*p.dir;
          if(p.boomerang&&!p.returned&&(p.x<0||p.x>W)){p.x=clamp(p.x,0,W);p.returned=true;p.dir*=-1;p.hitThisLeg=false;}
          p.y+=dt*((p.vy||0)+(p.depthVelocity||0));p.depth+=dt*(p.depthVelocity||0);
        }else p.x+=dt*(p.ultimate?830:565)*p.dir;
        p.life-=dt;const targetY=screenY(target);
        if(!p.hitThisLeg&&Math.abs(target.x-p.x)<(p.radius??37)&&aligned(p,target,p.depthTolerance??(p.ultimate?33:21))&&p.y>targetY-108&&p.y<targetY-9){
          const protectedHit=target.shield>0||(target.guard&&target.dir===-p.dir);
          if(lab)labCast=p.labId;
          const hit=landHit(fighters[p.owner],target,p.damage,p.dir,(["light","skill","ultimate","finish"].includes(p.hitStyle)?p.hitStyle:(p.ultimate?"ultimate":"skill")),p.slot);
          if(lab)labCast=0;
          if(hit&&!p.ultimate&&(!p.castId||!chargedCasts.has(p.castId))){if(p.castId)chargedCasts.add(p.castId);charge(fighters[p.owner]);}
          if(hit&&!protectedHit){if(p.hitStun){target.stun=Math.max(target.stun,p.hitStun);target.stunDuration=target.stun;}if(Number.isFinite(p.pushback))target.recoil=p.dir*p.pushback;}
          if(p.pierce||p.boomerang)p.hitThisLeg=true;else{shots.splice(i,1);continue;}
        }
        if(p.life<=0||p.x< -(p.characterId?80:30)||p.x>W+(p.characterId?80:30))shots.splice(i,1);
      }
      const liveCasts=new Set(shots.map(p=>p.castId));for(const id of chargedCasts)if(!liveCasts.has(id))chargedCasts.delete(id);
      for(let i=effects.length-1;i>=0;i--){effects[i].life-=dt;if(effects[i].life<=0)effects.splice(i,1);}
      if(training){
        if(drillDelay>0){
          drillDelay-=dt;
          if(drillDelay<=0){
            drillDelay=0;
            const [f,d]=fighters; f.hp=Math.max(MAX_HP*.15,f.hp);if(!f.energy)f.energy=1;f.subCd=0;
            if(landHit(d,f,3,f.dir*-1,"finish")){f.stun=.78;f.stunDuration=.78;f.subWindow=.78;announce("受击！现在可以替身",.78);}
          }
        }
        if(dummyReset>0){dummyReset-=dt;if(dummyReset<=0)fighters[1].hp=MAX_HP;}
      }else{
        remaining=Math.max(0,remaining-dt);
        if(remaining<=.0001){remaining=0;if(!(autoPlea && pact.canAsk && low(0)))finish();}
        else if(fighters.some(f=>f.hp<=0))finish();
      }
    }
    function pose(f){
      let action="idle",phase=(elapsed*1.8)%1;
      const floored=f.knock||f.downT>0||f.getupT>0;
      if(f.hp<=0){action="down";phase=ending?clamp(ending.age/.55,0,1):1;}
      else if(floored){
        // 起身直接倒放倒地动画，不需要额外的起身素材。
        action="down";
        phase=f.knock?.12+.5*clamp((f.vy+380)/760,0,1):f.downT>0?clamp(.62+(DOWN_TIME-f.downT)/.12*.38,0,1):.3+.7*(f.getupT/GETUP_TIME);
      }
      else if(f.stun&&!f.guard)action="hit";
      else if(f.move){
        action=f.move.type==="evade"?"walk":f.move.type==="attack"&&f.move.stage!==3?"attack":"skill";
        phase=clamp(f.move.t/f.move.duration,0,1);
      }else if(f.guard)action="guard";
      else if(f.y<FLOOR-1){action="jump";phase=clamp((f.vy+520)/1040,0,1);}
      else if(f.moving){action="walk";phase=(elapsed*3.6)%1;}
      const stride = (Number(f.keys.has("right")) - Number(f.keys.has("left"))) * f.dir < 0 ? -1 : 1;
      const along=Number(f.keys.has("right"))-Number(f.keys.has("left"));
      const lane=Number(f.keys.has("down"))-Number(f.keys.has("up"));
      return {index:f.index,x:round(f.x),y:round(screenY(f)),depth:round(f.depth),dir:action==="down"&&f.hp<=0?(f.x>W/2?1:-1):f.dir,action,phase:round(phase),
        flash:f.flash>0?round(f.flash/.12):0,
        downStage:f.knock?'air':f.downT>0?'ground':f.getupT>0?'getup':'',getupPhase:f.getupT>0?round(1-f.getupT/GETUP_TIME):0,
        characterId:f.kit.characterId,shieldEarned:f.shieldEarned,facing:f.dir,laneStep:along===0?lane:0,guardTime:round(Math.min(.8,f.guardTime)),
        blockPhase:f.blockFlash>0?round(1-f.blockFlash/.25):-1,
        skillKind:f.move&&(f.move.borrowedKit||f.kit)[f.move.type]?.kind||"",
        evadeSign:f.move?.type==="evade"?f.move.dir*f.dir:0,
        moveType:f.move?.type||"", impactPhase:f.move?.windup?round(f.move.windup/f.move.duration):0,
        strideSign:stride,walkDir:stride,hitRemaining:round(f.stun),
        hitPhase:f.stun?round(clamp(1-f.stun/(f.stunDuration||.4),0,1)):1,
        subPhase:f.subCd>11.28?round(clamp((12-f.subCd)/.72,0,1)):-1,
        attackStage:f.move?.type==="attack"?f.move.stage:0, guard:f.guard,shield:f.shield>0,invulnerable:f.invulnerable>0};
    }
    function snapshot(){
      return {elapsed:round(elapsed),shake:round(shake),fighters:fighters.map(pose),effects:effects.map(e=>({...e})),
        shots:shots.map(p=>({...p})),hud:getHud(),result:result&&{...result},sounds:sounds.map(s=>({...s}))};
    }
    return {requestPlea, get result(){return result;},renounce(id){
      if(!pact || ending || result || countdown>0 || !pact.renounce(id))return false;
      for(const f of fighters)if(f.move?.borrowedKit && !f.move.fired && pact.lender(f.index,f.move.type)===undefined)f.move=null;
      return true;
    },answerPlea(accept,terms){return pact?.answer(accept===true,terms);},step(){if(!result){if(lab)labFrame++;tick(STEP);}},input,tryMove,release,snapshot};
  }
  const round = value => Math.round(value * 1000) / 1000;

  // Local and remote matches use the same snapshot renderer. Each player keeps
  // their seat colour; the shape of a trail or projectile follows their fighter.
  function turnedPage(ctx, x, y, size, tilt, edge) {
    ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.scale(size,size);
    ctx.fillStyle="#fff1c8";ctx.strokeStyle=edge;ctx.lineWidth=1.4;
    ctx.beginPath();ctx.moveTo(-9,-6);ctx.quadraticCurveTo(0,-3,9,-7);
    ctx.lineTo(7,6);ctx.quadraticCurveTo(-1,10,-11,6);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(-6,-1);ctx.lineTo(4,-2);ctx.moveTo(-6,2);ctx.lineTo(2,1);
    ctx.strokeStyle="#a35835";ctx.lineWidth=.85;ctx.stroke();ctx.restore();
  }
  function drawEffects(ctx, {effects, shots, fighters, elapsed}, players) {
    for (const e of effects) {
      const u = 1 - e.life / e.max;
      const cueId=e.characterId||fighters[e.owner]?.characterId;
      if(window.ArenaTelegraph?.draw(ctx,e,cueId,u))continue;
      const role=characterModules[e.characterId];if(role?.drawEffect&&role.drawEffect(ctx,e,{players,fighters,elapsed,u}))continue;
      if (["swing","cast"].includes(e.kind) && Number.isInteger(e.owner) && window.DuelArt?.hasBakedFx(players[e.owner],e.owner,fighters[e.owner])) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      if(Number.isInteger(e.target)&&window.DuelArt?.character(players[e.target],e.target)){
        if(e.kind==="hit")ctx.translate(0,-46);
        if(e.kind==="text")ctx.translate(0,-55);
      }
      if(e.kind==="swing"&&Number.isInteger(e.owner)&&window.DuelArt?.character(players[e.owner],e.owner))
        ctx.translate(e.dir*14,-55);
      ctx.globalAlpha = Math.min(1, (1 - u) * 2.2);
      ctx.strokeStyle = ctx.fillStyle = e.color; ctx.lineWidth = 3;
      if (e.kind === "text") {
        ctx.textAlign = "center"; ctx.font = "bold 18px monospace";
        ctx.lineWidth = 4; ctx.strokeStyle = "#17182a";
        ctx.strokeText(e.text, 0, -20*u); ctx.fillText(e.text, 0, -20*u);
      } else if (e.kind === "hit") {
        // Draw a pointed contact flash, then leave shards along the impact direction.
        ctx.scale(e.dir || 1, 1);
        const reach = 14 + 29*u;
        for(let j=0;j<7;j++){
          const angle=(j-3)*.36;
          ctx.save();ctx.rotate(angle);ctx.translate(reach,0);
          const length=(1-u)*(j%2?14:24);
          ctx.fillStyle=e.color;
          ctx.beginPath();ctx.moveTo(0,-2.5);ctx.lineTo(length,0);ctx.lineTo(0,2.5);ctx.fill();
          ctx.restore();
        }
        const size=1-u;
        ctx.scale(size,size);
        ctx.fillStyle="#fff9de";ctx.strokeStyle=e.color;ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(-26,-9);ctx.lineTo(-4,-4);ctx.lineTo(1,-20);
        ctx.lineTo(6,-4);ctx.lineTo(24,1);ctx.lineTo(7,5);ctx.lineTo(4,17);
        ctx.lineTo(-3,5);ctx.lineTo(-18,12);ctx.lineTo(-8,0);ctx.closePath();ctx.fill();ctx.stroke();
      } else if (e.kind === "dust") {
        const n = 6;
        for (let j = 0; j < n; j++) {
          const a = Math.PI + (j / (n-1)) * Math.PI;
          const r = (9 + 26 * u) * (j % 2 ? .7 : 1);
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.lineTo(Math.cos(a) * (r+9), Math.sin(a) * (r+9)); ctx.stroke();
        }
      } else if (e.kind === "dash") {
        const seat=e.owner??COLORS.indexOf(e.color), water=window.DuelArt?.character(players[seat],seat)==="tide";
        if(water){
          ctx.save();ctx.scale(e.dir,1);
          const distance=Math.abs(e.end-e.x),end=distance*(.50+.50*u);
          ctx.strokeStyle="#b9f5ff";ctx.lineWidth=2+2*(1-u);
          for(let j=0;j<3;j++){
            ctx.beginPath();ctx.moveTo(5+j*15,46-j*6);
            ctx.quadraticCurveTo(end*.65,54-j*8,end+7*j,10-j*25-16*u);
            ctx.stroke();
          }
          for(let j=0;j<6;j++){
            const t=j/6;
            ctx.fillStyle=j%2?"#89dfea":"#e4feff";ctx.beginPath();
            ctx.ellipse(end*(.30+t)+u*23,24-70*t-23*Math.sin(t*4+u*2),2.4,4.5,-.6,0,Math.PI*2);ctx.fill();
          }
          ctx.restore();
        }else for(let j=0;j<5;j++){
          const dy=(j-2)*9;ctx.fillRect((e.end-e.x)*u*.5,dy,(e.end-e.x)*(1-u*.65),j%2?1:3);
        }
        if(players[seat]?.body===1){
          for(let j=0;j<4;j++) turnedPage(ctx,(e.end-e.x)*(j+1)/5,-24+8*j,1-u*.65,(j-1.5)*.4+u,"#efac67");
        }else if(!water){
          ctx.lineWidth=2;ctx.strokeStyle="#b5f4ff";
          for(let j=1;j<=3;j++){ctx.beginPath();ctx.ellipse((e.end-e.x)*j/4,0,4+7*u,8+j*4,0,0,Math.PI*2);ctx.stroke();}
        }
      } else if (e.kind === "swing") {
        ctx.scale(e.dir, 1); ctx.beginPath();
        if(e.stage===3){ctx.lineWidth=5;ctx.ellipse(7,-10,49+7*u,38,-.57,-1.1,1.38);}
        else ctx.ellipse(3,-3,43+8*u,25,e.stage===2?.22:-.25,-.85,.88);
        ctx.stroke();
      } else if(e.kind==="threat"){
        ctx.scale(e.dir,1); ctx.globalAlpha=.12+.2*u;
        ctx.beginPath();ctx.ellipse(e.reach*.44,-2,e.reach*.56,23,0,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=.65;ctx.setLineDash([8,7]);ctx.lineWidth=2;ctx.stroke();
      } else if(e.kind==="decoy"){
        const seat=COLORS.indexOf(e.color), fighter=fighters[seat];
        if(fighter && typeof window.DormArt.drawEcho==='function'){
          window.DormArt.drawEcho(ctx,players[seat],seat,e.dir,u);
        }
        ctx.lineWidth=1.5;ctx.strokeStyle=e.color;
        for(let j=0;j<7;j++){
          const dx=(j%3-1)*19*(1+u),dy=-12-j*17-u*18;
          ctx.beginPath();ctx.moveTo(dx-12,dy);ctx.lineTo(dx+13-5*u,dy);ctx.stroke();
        }
      } else if(e.kind==="finale"){
        ctx.scale(e.dir,1);
        if(e.variant===0){
          // Speed lines and widening rims travel through the rush landing path.
          for(let j=0;j<8;j++){ctx.globalAlpha=(1-u)*.72;const offset=(j*37%57)-28;
            ctx.fillRect(12+e.reach*.65*u,-63+offset,e.reach*(1-u)*(.55+.04*(j%4)),j%3+2);}
          ctx.globalAlpha=1-u;ctx.lineWidth=5;ctx.beginPath();
          ctx.ellipse(20+e.reach*u,-49,10+19*u,33+28*u,.08,0,Math.PI*2);ctx.stroke();
          ctx.save();ctx.translate(28+e.reach*u,-61-13*Math.sin(Math.PI*u));
          // Split flukes and a tapering wake read against both sides of the stage.
          ctx.fillStyle="#a3e8ff";ctx.strokeStyle="#427baa";ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(-42,17);ctx.quadraticCurveTo(-18,18,-3,1);
          ctx.quadraticCurveTo(-5,-13,-21,-21);ctx.quadraticCurveTo(0,-25,8,-9);
          ctx.quadraticCurveTo(17,-19,29,-18);ctx.quadraticCurveTo(18,-12,13,0);
          ctx.quadraticCurveTo(-2,20,-42,17);ctx.closePath();ctx.fill();ctx.stroke();
          ctx.restore();
        } else {
          ctx.lineWidth=3;ctx.globalAlpha=1-u;for(let i=0;i<4;i++){
            ctx.beginPath();ctx.arc(17+24*u,-57,14+14*i+18*u,-1.21,1.21);ctx.stroke();}
        }
      } else if (e.kind === "ring") {
        if(e.burst && window.DuelArt?.character(players[e.owner],e.owner)==="tide"){
          ctx.translate(0,36);
          const tones=["#caffff","#7adedf","#9bc9ff"];
          tones.forEach((tone,j)=>{
            const t=clamp((u-.11*j)/(1-.11*j),0,1);
            if(t<=0)return;
            ctx.globalAlpha=.95*(1-t);ctx.strokeStyle=tone;ctx.lineWidth=2.5*(1-t)+1;
            ctx.beginPath();ctx.ellipse(0,0,15+141*t,3+30*t,0,0,Math.PI*2);ctx.stroke();
          });
        }else{
          ctx.lineWidth = 5 * (1-u) + 1;
          ctx.beginPath(); ctx.ellipse(0, 0, 6 + e.size * u, 5 + e.size * u * .64, 0, 0, Math.PI*2); ctx.stroke();
        }
      } else if (e.kind === "cast") {
        const owner = fighters[e.owner];
        ctx.translate(owner.x-e.x, owner.y-65-e.y);
        for(let j=0; j<5; j++) {
          const a = elapsed*6 + j*1.2566, radius = 14 + (1-u)*23;
          const x=Math.cos(a)*radius,y=Math.sin(a)*radius;
          if(players[e.owner]?.body===1)turnedPage(ctx,x,y,.45,a,"#e7ab74");
          else{ctx.beginPath();ctx.arc(x,y,2.5+u*1.8,0,Math.PI*2);ctx.lineWidth=1.5;ctx.stroke();}
        }
      }
      ctx.restore();
    }
    for (const p of shots) {
      if((p.delay||0)>0)continue;
      let x=p.x, y=p.y;
      const muzzle=window.DuelArt?.shotOffset(players[p.owner],p.owner,p.ultimate?"ultimate":"projectile");
      if(muzzle){
        // The projectile's travel and damage remain authoritative. The hand-to-chest
        // visual offset converges as it approaches its victim, on either facing.
        const age=p.age??((p.ultimate ? .65 : 1.48)-p.life), reach=(fighters[1-p.owner].x-x)*p.dir;
        const fade=clamp(1-age/.45,0,1);
        const advance=Math.min(Math.max(0,reach-10),Math.max(0,(muzzle.x-(p.ultimate?22:30))*fade+20*(1-fade)));
        x+=p.dir*advance;
        y+=(muzzle.y+(p.ultimate?57:59))*fade-53*(1-fade);
      }
      const role=characterModules[p.characterId];if(role?.drawShot&&role.drawShot(ctx,{...p,x,y,physicsX:p.x,physicsY:p.y},{players,fighters,elapsed,u:(p.age||0)/Math.max(.001,p.maxLife||1.48)}))continue;
      ctx.save(); ctx.translate(x, y); ctx.scale(p.dir, 1);
      if(players[p.owner]?.body===1){
        const pages=p.ultimate?4:1;
        for(let j=pages-1;j>=0;j--){
          const dx=-j*13,dy=Math.sin(elapsed*15+j*1.8)*(p.ultimate?10:2);
          ctx.globalAlpha=.32;ctx.fillStyle=p.color;ctx.fillRect(dx-38,dy-2,36,4);
          ctx.globalAlpha=1;turnedPage(ctx,dx,dy,p.ultimate?1.18:.95,-.2+.16*Math.sin(elapsed*16+j),"#e8a467");
        }
        ctx.restore();continue;
      }
      if(p.ultimate){
        for(let j=2;j>=0;j--){
          const dx=-j*21,dy=(j%2?10:-5);
          ctx.fillStyle=p.color;ctx.globalAlpha=.2;ctx.fillRect(dx-50,dy-3,47,6);
          ctx.globalAlpha=.94;ctx.fillStyle="#f7f1cf";ctx.beginPath();ctx.moveTo(dx+5,dy);
          ctx.lineTo(dx-16,dy-8);ctx.lineTo(dx-18,dy+8);ctx.closePath();ctx.fill();
          ctx.strokeStyle=p.color;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(dx-14,dy-2);
          ctx.lineTo(dx+3,dy);ctx.lineTo(dx-14,dy+4);ctx.stroke();
          ctx.fillStyle="#ef9b43";ctx.beginPath();ctx.arc(dx+6,dy,4.2,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();continue;
      }
      ctx.fillStyle = p.color; ctx.globalAlpha = .5;
      ctx.fillRect(-34, -4, 35, 8); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(13,0); ctx.lineTo(0,-9); ctx.lineTo(-16,0);
      ctx.lineTo(0,9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff9df"; ctx.fillRect(-5,-2,12,4); ctx.restore();
    }
  }

  function drawRemote(canvas, players, snapshot) {
    const {elapsed, shake, fighters, hud} = snapshot;
    const pixelScale = Math.min(2, Math.max(1, (canvas.clientWidth || W) / W * (window.devicePixelRatio || 1)));
    const backingWidth=Math.round(W*pixelScale), backingHeight=Math.round(H*pixelScale);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    const art = window.DormArt;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(backingWidth/W, 0, 0, backingHeight/H, 0, 0);
    ctx.save();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.body?.classList.contains("gx-noshake");
    if (shake > .15 && !reducedMotion) ctx.translate(Math.sin(elapsed * 110) * shake, Math.cos(elapsed * 122) * shake * .45);
    art.drawStage(ctx, W, H, elapsed);
    for (const f of [...fighters].sort((a,b)=>(a.depth||0)-(b.depth||0))) {
      ctx.save();
      const floor = FLOOR + (f.depth||0);
      const scale = 1 + (f.depth||0) * .0011;
      ctx.translate(f.x, floor); ctx.scale(scale,scale); ctx.translate(-f.x,-floor);
      if(f.invulnerable)ctx.globalAlpha=.75+.17*Math.sin(elapsed*28);
      if(f.flash>0&&!reducedMotion)ctx.filter="brightness("+(1+1.6*f.flash).toFixed(2)+") saturate("+(1-.5*f.flash).toFixed(2)+")";
      art.drawFighter(ctx, f, players[f.index], elapsed);
      ctx.filter="none";
      ctx.restore();
      const role=characterModules[f.characterId];const drawnAura=f.shield>0&&role?.drawAura?.(ctx,f,{players,fighters,elapsed});
      if ((f.shield > 0 || f.guard)&&!drawnAura) {
        const tall=window.DuelArt?.character(players[f.index],f.index);
        ctx.save(); ctx.translate(f.x, f.y-(tall?101:56));
        const col = f.shield > 0 ? "#9efffa" : COLORS[f.index];
        ctx.strokeStyle = col; ctx.lineWidth = f.shield > 0 ? 3 : 2;
        ctx.globalAlpha = .72 + Math.sin(elapsed*13)*.2;
        ctx.beginPath();
        if (f.shield > 0) ctx.ellipse(0, 0, tall?65:48, tall?103:61, 0, 0, Math.PI*2);
        else { ctx.scale(f.dir,1); ctx.ellipse(1, 0, 43, 48, 0, -.97, .97); }
        ctx.stroke(); ctx.restore();
      }
    }
    drawEffects(ctx, snapshot, players);
    art.foreground?.(ctx,W,H);
    ctx.restore();
    if(hud.phase==="ko"){
      // This also works on a joining spectator: use only replicated pose data.
      const fallen=fighters.find(f=>f.action==="down");
      if(fallen){
        const t=reducedMotion?1:fallen.phase;
        const shade=ctx.createRadialGradient(fallen.x,fallen.y-40,80,fallen.x,fallen.y-40,540);
        shade.addColorStop(0,"rgba(9,12,27,0)");
        shade.addColorStop(1,"rgba(9,12,27,"+(.42*t)+")");
        ctx.save();ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
        ctx.fillStyle="#131624";ctx.fillRect(0,0,W,13*t);ctx.fillRect(0,H-13*t,W,13*t);ctx.restore();
      }
    }
    if (hud.countdown > 0) {
      ctx.save(); ctx.textAlign = "center";
      if (hud.roundsToWin && !window.ArenaShell) {
        const final = hud.wins && hud.wins.every(w => w === hud.roundsToWin - 1);
        ctx.font = "italic 900 30px 'Arial Black', Impact, sans-serif";
        ctx.strokeStyle = "#151523"; ctx.lineWidth = 6; ctx.fillStyle = final ? "#ff6f8e" : "#ffffff";
        const title = final ? "FINAL ROUND" : "ROUND " + hud.round;
        ctx.strokeText(title, W/2, 96); ctx.fillText(title, W/2, 96);
      }
      ctx.font = "900 52px Impact, sans-serif";
      ctx.strokeStyle = "#151523"; ctx.lineWidth = 7; ctx.fillStyle = "#fff297";
      const label = String(hud.countdown); ctx.strokeText(label, W/2, 151); ctx.fillText(label,W/2,151); ctx.restore();
    }
  }

  function start(canvas, options) {
    active.get(canvas)?.destroy();
    window.DuelArt?.trimCache?.(options.players);
    window.DuelArt?.resetMovementClock?.(canvas.getContext("2d"));
    const match = createMatch(options.players, {...options, mode:options.mode || "cpu"});
    const secondSeatLocal = options.mode === "duo";
    const pressedCodes = new Set();
    let ended = false, paused = false, disposed = false, loading = false, failed = false;
    let lastStamp = null, debt = 0, hudKey = "", frame = 0;

    function input(index, action, down, source) {
      if (!paused && !ended && !disposed && !loading && !failed) match.input(index, action, down, source);
    }
    function keyboard(event) {
      const binding = window.DormKeys.bindingFor(event.code);
      if (!binding || (binding[1]==='plea' && (!options.pact || event.isComposing))) return;
      if(options.autoPlay && binding[1]!=='plea')return;
      const source = "keyboard:" + event.code;
      if (event.type === "keyup") {
        if (pressedCodes.delete(event.code)) {
          match.input(binding[0], binding[1], false, source);
          event.preventDefault();
        }
        return;
      }
      if(window.PactUI?.modalOpen()||window.RuleAuction?.modalOpen())return;
      const target = event.target;
      if (paused || (!secondSeatLocal && binding[0] === 1) || event.metaKey || event.ctrlKey || event.altKey ||
          (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) return;
      event.preventDefault();
      if (event.repeat) return;
      pressedCodes.add(event.code);
      input(binding[0], binding[1], true, source);
    }
    function releaseInputs() {
      pressedCodes.clear();
      match.release(0);
      match.release(1);
      lastStamp = null;
      debt = 0;
    }
    function listen(on) {
      const method = on ? "addEventListener" : "removeEventListener";
      window[method]("keydown", keyboard); window[method]("keyup", keyboard);
      window[method]("blur", releaseInputs); document[method]("visibilitychange", releaseInputs);
    }
    function present() {
      const state = match.snapshot();
      drawRemote(canvas, options.players, state);
      const key = JSON.stringify(state.hud);
      if (key !== hudKey) { hudKey = key; options.onHud?.(state.hud); }
      if (state.result && !ended) {
        ended = true;
        listen(false);
        options.onEnd?.(state.result);
      }
    }
    function animate(stamp) {
      if (disposed || ended || paused || loading || failed) return;
      if (lastStamp !== null) debt += Math.min(.065, Math.max(0, (stamp-lastStamp)/1000));
      lastStamp = stamp;
      while (debt >= STEP) { debt -= STEP; match.step(); }
      present();
      window.GamePerformance?.frame(stamp);
      if (!ended && !disposed) frame = requestAnimationFrame(animate);
    }
    const controller = {
      input, retryArt, requestPlea:()=>!paused&&!loading&&!ended&&match.requestPlea(0), renounce:id=>!paused&&!loading&&!ended&&match.renounce(id), answerPlea:(value,terms)=>match.answerPlea(value,terms),
      tryMove(action){if(!disposed&&!ended&&!paused)match.tryMove(action);},
      pause(value = true) {
        if (ended || disposed || paused === Boolean(value)) return;
        paused = Boolean(value); releaseInputs();
        cancelAnimationFrame(frame);
        if (!paused) frame = requestAnimationFrame(animate);
      },
      destroy() {
        if (disposed) return;
        disposed = true; releaseInputs(); listen(false); cancelAnimationFrame(frame);
        canvas.removeEventListener("click",retryArt);
        if (active.get(canvas) === controller) active.delete(canvas);
      }
    };
    function loadingMessage(text){
      const ctx=canvas.getContext("2d");
      ctx.save();ctx.fillStyle="rgba(15,21,33,.90)";ctx.fillRect(W/2-177,H/2-24,354,48);
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#fff1d2";ctx.font="bold 16px sans-serif";
      ctx.fillText(text,W/2,H/2);ctx.restore();
    }
    async function prepareArt(){
      loading=true;failed=false;
      loadingMessage("载入 2D 战斗动作…");
      let ready=false;
      try {
        ready=await window.DuelArt.preload(options.players,status=>{
          if(disposed || !loading)return;
          options.onLoad?.({phase:'loading',...status});
        });
      } catch { ready=false; }
      if(disposed)return;
      loading=false;failed=!ready;
      if(failed){
        loadingMessage("动作素材载入失败，点击战场重试");
        options.onLoad?.({phase:'failed'});
        canvas.addEventListener("click",retryArt);
        return;
      }
      options.onLoad?.({phase:'ready'});
      lastStamp=null;
      if(!paused)frame=requestAnimationFrame(animate);
    }
    function retryArt(){
      if(!failed||disposed||loading)return;
      canvas.removeEventListener("click",retryArt);void prepareArt();
    }
    active.set(canvas, controller);
    listen(true); present();
    if(window.DuelArt && !window.DuelArt.isReadyFor(options.players))void prepareArt();
    else { options.onLoad?.({phase:'ready'});frame=requestAnimationFrame(animate); }
    return controller;
  }

  const api = {start, createMatch, drawRemote};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.DormCombat = api;
})();
