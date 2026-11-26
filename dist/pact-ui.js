(() => {
  'use strict';
  const {cards}=window.PactRules;
  const {personality,profile,line:characterLine,advance,allowance}=window.PactPersonality;
  const dialog=document.createElement('dialog');
  dialog.id='pactDialog';dialog.setAttribute('aria-labelledby','pactHeading');document.body.append(dialog);
  const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;return n;};
  const button=(text,fn,cls='')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b;};
  const remember=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};
  function read(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}}
  const key=id=>'nc-pact-history-1/'+id;
  const recent=id=>{const list=read(key(id),[]);return Array.isArray(list)?list.filter(x=>x&&typeof x.kind==='string').slice(-24):[];};
  const relationKey=id=>'nc-pact-relation-1/'+id;
  const relations=new Map();
  function relationship(id){
    if(!relations.has(id)){
      const saved=read(relationKey(id),null);
      const ok=saved && [saved.affinity,saved.trust].every(v=>Number.isFinite(v)&&v>=0&&v<=100);
      relations.set(id,ok?saved:recent(id).reduce(advance,{affinity:50,trust:50}));
    }
    return relations.get(id);
  }
  function describe(ev){
    const side=ev.seat===1?'对手':'玩家';
    if(ev.source && (ev.kind==='kept'||ev.kind==='breach')){
      const change=ev.change?' · '+ev.change:'';
      return '第 '+ev.round+' 回合 · '+(ev.source==='停战'?'战中停战':ev.source+'约定')+' · 我方'+(ev.kind==='kept'?'守约':'背约')+change;
    }
    switch(ev.kind){
      case 'signed':return '第 '+ev.round+' 回合签订战中约定 · '+window.PactRules.details(ev.terms,undefined,undefined,ev.round).join(' / ');
      case 'breach':return '第 '+ev.round+' 回合，'+side+'在停战 '+ev.seconds+' 秒时提前出手';
      case 'loanUsed':return '第 '+ev.round+' 回合，'+side+'使用了借来的'+window.PactRules.skillNames[ev.skill];
      case 'holdEnded':return '第 '+ev.round+' 回合，'+(ev.reason==='attack'?(ev.seat===1?'玩家':'对手')+'先出招，按约结束等待':'等候期满，恢复进攻');
      case 'kept':return '第 '+ev.round+' 回合，双方守满三秒';
      case 'agreed':return '双方同意第 '+ev.round+' 回合停战';
      case 'asked':return side+'在第 '+ev.round+' 回合发起谈判';
      case 'refused':return '第 '+ev.round+' 回合未签订战中协议';
      case 'deal':if(ev.terms)return window.PactRules.details(ev.terms).join(' · ');return cards[ev.deal]?.text||'自由对战';
      case 'result':return ev.seat===null?'上场打平':'上场'+side+'获胜';
      default:return '上次交手';
    }
  }
  let active=null, abort=null, screen=0, mode='', pleaRound=0, lockedNote=null, overlay=null;
  let matchEvents=[], noteUntil=0, forecastWorker=null, feedback=[], feedbackUntil=0;
  let model=String(read('nc-pact-model',''));
  function record(event){if(active){
    const id=active.rival,prior=relationship(id),next=advance(prior,event);
    if(event.kind==='kept'||event.kind==='breach'){
      const sign=n=>(n>=0?'+':'')+n;
      event={...event,change:'好感 '+sign(next.affinity-prior.affinity)+' · 信任 '+sign(next.trust-prior.trust)};
      if(performance.now()>feedbackUntil)feedback=[];
      feedback.push(describe(event));feedbackUntil=performance.now()+3500;
    }
    relations.set(id,next);remember(relationKey(id),next);
    matchEvents.push(event);remember(key(active.rival),[...recent(active.rival),event].slice(-24));}}
  function dismiss(){
    screen++;abort?.abort();abort=null;forecastWorker?.terminate();forecastWorker=null;mode='';
    if(dialog.open)dialog.close();
  }
  function end(){
    if(mode==='plea'||mode==='mid')dismiss();
    active=null;pleaRound=0;overlay?.remove();overlay=null;lockedNote=null;
    document.querySelectorAll('.gxh-skill.pact-locked').forEach(tile=>tile.classList.remove('pact-locked'));
  }
  function begin(config){active=config;matchEvents=[];feedback=[];feedbackUntil=0;noteUntil=0;record({kind:'deal',deal:config.deal,terms:config.terms});}
  function character(id,seat=1){
    const c=window.ArenaManifest.characters.find(c=>c.id===id);
    const p=window.ArenaPreviewFighter?.(seat,id);
    const art=window.HeroLibrary?.urls.get(id)?.art||'assets/select-hd/'+id+'-art.webp';
    const facesRight=SELECT_CAST.find(item=>item.id===id)?.facesRight??true;
    const base=p && window.DormKit?.forPlayer(p,seat);
    const kit=window.BalanceCore?window.BalanceCore.localKit(base,window.BalanceLab?.applied()):base;
    const skills=kit?Object.fromEntries(['skill','skill2','ultimate'].map(k=>[k,kit[k].name])):null;
    return {id,art,facesRight,skills,kit,name:p?.name||c?.name||id};
  }
  async function api(path,body,signal){
    let res;
    try{res=await fetch('/pact/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal});}
    catch(e){if(signal?.aborted)throw e;throw Error('无法连接本地游戏服务，请确认启动窗口仍在运行。');}
    let data;
    try{data=await res.json();}catch{throw Error('游戏服务返回 HTTP '+res.status+'，没有收到 JSON。请用新版启动器打开游戏。');}
    if(!res.ok)throw Error(data?.error||'游戏服务返回 HTTP '+res.status);
    if(body && (!data || typeof data.line!=='string' || !(body.task==='opening'?['propose']:body.task==='judge'?['choose','reject','clarify']:['accept','counter','reject','clarify']).includes(data.decision) ||
        ((body.task==='opening' || body.task==='deal' && ['accept','counter'].includes(data.decision)) && !window.PactRules.valid(data.terms))))
      throw Error('游戏服务返回的协议格式不匹配。请关闭旧启动窗口，再启动新版。');
    return data;
  }
  function settingsPanel(){
    const panel=node('section','pact-settings'),label=node('label','','博弈对手'),select=node('select');
    panel.append(node('h3','','本地 AI'));
    select.add(new Option('规则陪练（离线）',''));
    if(model)select.add(new Option(model,model));
    select.value=model;label.append(select);
    const status=node('p','',model?'已保存当前模型。':'使用规则陪练。自由对话需要本机 Ollama 中的聊天模型。');
    status.setAttribute('role','status');
    const refresh=button('读取本机模型',async()=>{
      refresh.disabled=true;
      try{
        const {models}=await api('models');
        if(!panel.isConnected)return;
        select.replaceChildren(new Option('规则陪练（离线）',''));
        for(const id of models)select.add(new Option(id,id));
        if(model && !models.includes(model))select.add(new Option(model+'（未安装）',model));
        select.value=model;status.textContent=models.length?'选中模型即保存，下次进入博弈时自动使用。':'本机没有已安装的模型。';
      }catch(e){status.textContent=e.message;}finally{refresh.disabled=false;}
    });
    const test=button('测试连接',async()=>{
      test.disabled=refresh.disabled=select.disabled=true;status.textContent='正在用赛前谈判提议测试，首次加载可能需要一些时间…';
      try{
        const r=await api('decide',{task:'deal',model:select.value,rival:'quill',name:'Claude',player:'玩家',text:'首回合你禁用二技能，换你先攻两秒。'});
        status.textContent=r.terms?'条件解析通过 · '+window.PactRules.details(r.terms).join(' · '):
          '连接成功。对手这次'+(r.decision==='reject'?'拒绝了':'追问了')+'测试提议：'+r.line;
      }
      catch(e){status.textContent=e.message;}finally{refresh.disabled=select.disabled=false;test.disabled=!select.value;}
    });
    test.disabled=!model;
    select.onchange=()=>{
      model=select.value;test.disabled=!model;
      window.RuleAuction?.setModel(model);
      status.textContent=remember('nc-pact-model',model)?'已保存。':'仅本次生效，浏览器未能保存设置。';
    };
    const controls=node('div');controls.append(label,refresh,test);panel.append(controls,status);
    return panel;
  }
  function scene(title,people,kind){
    dismiss();mode=kind;dialog.replaceChildren();dialog.className='vn '+kind;
    const stage=node('div','vn-stage');
    const images=people.map((p,i)=>{
      const image=node('img','vn-portrait seat'+i);
      image.src=p.art;image.alt=p.name;image.draggable=false;
      if(p.facesRight!==(i===0))image.classList.add('mirrored');
      return image;
    });
    stage.append(...images);
    const heading=node('h2','vn-title',title);heading.id='pactHeading';
    const box=node('section','vn-box');
    const speaker=node('strong','vn-name'),line=node('p','vn-line');
    line.setAttribute('aria-live','polite');
    const prior=node('p','vn-prior');prior.hidden=true;
    const badge=node('div','vn-speaker-row'),waiting=node('small','vn-waiting');
    waiting.setAttribute('role','status');waiting.hidden=true;
    badge.append(speaker,waiting);box.append(badge,prior,line);
    dialog.append(stage,heading,box);dialog.showModal();
    return {box,stage,turn:screen,waitForReply(words){
      this.say(0,words);
      images[1].classList.add('speaking');
      waiting.textContent=people[1].name+' 思考中';waiting.hidden=false;
    },say(seat,words,previous=''){
      waiting.hidden=true;
      images.forEach((im,i)=>im.classList.toggle('speaking',i===seat));
      speaker.textContent=people[seat]?.name||'残血谈判';
      line.hidden=!words;
      prior.textContent=previous;prior.hidden=!previous;
      line.textContent=words;
    }};
  }
  function forecast(people,options,signal){
    forecastWorker ||= new Worker('pact-forecast.js');
    const worker=forecastWorker;
    return new Promise((resolve,reject)=>{
      const stop=()=>{cleanup();reject(Error('已退出谈判'));};
      function cleanup(){worker.onmessage=null;worker.onerror=null;signal.removeEventListener('abort',stop);}
      worker.onmessage=({data})=>{cleanup();data.error?reject(Error(data.error)):resolve(data);};
      worker.onerror=()=>{cleanup();worker.terminate();forecastWorker=null;reject(Error('胜率推演未能完成，请重试。'));};
      signal.addEventListener('abort',stop,{once:true});
      worker.postMessage({team:people.map(p=>({name:p.name})),kits:people.map(p=>p.kit),
        difficulty:window.ArenaShell?.difficulty?.()||'normal',options});
    });
  }
  function rateText(x){return (Math.round(x.rate*10)/10)+'%（'+x.wins+'胜 / '+x.draws+'平 / '+(x.games-x.wins-x.draws)+'负）';}
  let returnSelect='bargain';
  function negotiate(ids,midRound=0,battle=null,combined=false){
    if(!midRound)returnSelect=combined?'combined':'bargain';
    const compatible=t=>!battle || window.PactRules.canAppend(battle.existing,t,midRound);
    const people=ids.map((id,i)=>character(id,i)),person=people[1],names=people.map(p=>p.name);
    const view=scene(midRound?'残血谈判 · 第 '+midRound+' 回合':combined?'AI 博弈对战 · 赛前谈判':'赛前谈判',people,midRound?'mid':'deal'), {turn,box}=view;
    if(battle?.arenaRule)box.append(node('p','vn-rule','本回合擂台规则 · '+battle.arenaRule.name+'　'+battle.arenaRule.effects.join('。')));
    if(midRound)view.say(null,'',battle?.asker===1?person.name+'叫停了战斗':names[0]+'发起了谈判');
    else view.say(1,characterLine(person.id,'opening'));
    const paper=node('div','vn-terms');paper.hidden=true;
    const traits=personality(person.id),relation=relationship(person.id),budget=allowance(traits,relation);
    const notes=node('details','pact-estimate vn-dossier'),heading=node('summary','','对手档案与胜率推演'),report=node('div');
    notes.append(heading,node('p','',profile(person.id).label+' · '+profile(person.id).motivation),node('p','', '好感 '+relation.affinity+' · 信任 '+relation.trust+' · 好胜 '+traits.competitive+' · 慷慨 '+traits.generous+' · 冒险 '+traits.risk+'（满分 100）'),node('p','','按当前关系，愿意让出的胜率参考值为 '+budget+' 个百分点。'),report);
    const encounters=recent(person.id).slice().reverse();
    notes.append(node('h3','','交手记录'));
    if(encounters.length){
      const list=node('ul','vn-encounters');
      for(const event of encounters)list.append(node('li','',describe(event)));
      notes.append(list);
    }else notes.append(node('p','','暂无交手记录'));
    const status=node('p','pact-status');status.hidden=true;status.setAttribute('role','status');
    const actions=node('div','vn-actions'),history=[];
    const input=node('textarea','vn-input');input.rows=1;input.maxLength=300;
    input.placeholder=midRound?'提出条件，或用自己的话修改对方的报价…':'用自己的话提出条件…';input.setAttribute('aria-label','输入谈判条件');
    let pending=null,busy=false;
    const clear=()=>{status.hidden=true;status.textContent='';pending=null;report.replaceChildren();confirm.hidden=true;paper.replaceChildren();paper.hidden=true;};
    const offer=(terms,proposal,counter)=>{
      if(!window.PactRules.valid(terms) || !compatible(terms)){status.hidden=false;status.textContent='该条件与当前约定冲突，或指定了已过回合。可以换条件继续谈。';return;}
      pending=terms;paper.hidden=false;confirm.hidden=false;
      const before=window.PactRules.details(proposal,names,people.map(p=>p.skills),midRound);
      if(midRound)paper.append(node('strong','','从恢复战斗时起生效'));
      const heading=node('strong','',counter?'对手还价 · 本场协议':'待签协议 · 仅限本场');paper.append(heading);
      const after=window.PactRules.details(terms,names,people.map(p=>p.skills),midRound);
      for(const old of before)if(counter && !after.includes(old))paper.append(node('del','changed',old));
      for(const t of after)paper.append(node('span',counter && !before.includes(t)?'changed':'',t));

    };
    function fight(terms){
      if(terms && !window.PactRules.valid(terms))return;
      if(midRound){
        const applied=window.ArenaApp.answerPlea(!!terms,terms);
        if(!applied){status.hidden=false;status.textContent='这份条款与已签约定冲突，或指定的回合已经过去。请换个条件。';return;}
        dismiss();return;
      }
      dismiss();window.ArenaStartSelected(ids,'cpu',{terms,deal:'plain',rival:person.id,name:person.name,
        ids:ids.slice(),model},combined);
    }
    const confirm=button(midRound?'签约，继续战斗':combined?'成交，进入拍卖':'成交，开战',()=>{if(pending)fight(pending)},'primary');confirm.hidden=true;
    const leave=button(midRound?'不签约，继续战斗':combined?'跳过谈判，进入拍卖':'直接开战',()=>fight(null)),back=button('返回选人',()=>{dismiss();window.ArcadeSelect.open(returnSelect);});
    const send=button('提出条件',()=>submit(input.value.trim()),'primary');
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit(input.value.trim());}};
    input.oninput=()=>{send.textContent='提出条件';if(pending)clear();};
    const preset={round:1,locked:1,skill:'skill2',first:1,seconds:2};
    const samples=node('div','vn-presets'),drafts=[
      ['首回合你打我只造成一半伤害。',{clauses:[{kind:'damage',seat:1,round:1,percent:50}]}],
      ['开场等我五秒，我先出手你就还手。二技能借我一次，这场都能用。',{clauses:[
        {kind:'hold',seat:1,round:1,seconds:5,untilAttack:true},{kind:'lend',seat:1,round:0,skill:'skill2',uses:1}]}],
      ['这场让我练进攻，你只移动和防守，我先出手你也不还手。',{clauses:[{kind:'hold',seat:1,round:0,seconds:0,untilAttack:false}]}],
      ['首回合你禁用二技能，换你先攻两秒。',preset],
      ['第二回合我禁用奥义技能，换我先攻一秒。',{round:2,locked:0,skill:'ultimate',first:0,seconds:1}]
    ];
    samples.append(button('能不能轻点打？',()=>{
      clear();view.say(1,characterLine(person.id,'gentle'),names[0]+'：「能不能轻点打？」');
    }));
    const choices=midRound?[
      ['从现在到本回合结束，我的伤害减半。',{clauses:[{kind:'damage',seat:0,round:midRound,percent:50}]}],
      ['我先停手三秒，你先出招我就还手。',{clauses:[{kind:'hold',seat:0,round:0,seconds:3,untilAttack:true}]}],
      ['从现在起，我把二技能借你用一次。',{clauses:[{kind:'lend',seat:0,round:0,skill:'skill2',uses:1}]}]
    ]:drafts;
    if(midRound)samples.replaceChildren();
    for(const [words,terms] of choices)if(window.PactRules.valid(terms))samples.append(button(words,()=>submit(words,terms)));
    async function submit(text,presetTerms){
      if(busy || !text)return;
      clear();
      const previous=history.filter(t=>t.terms).at(-1)?.terms;
      const echo=names[0]+'：「'+text+'」';
      if(!model&&!presetTerms){
        status.hidden=false;status.textContent='自由谈判需要在设置中选择本地模型。也可使用下方的预设条件。';
        return;
      }
      if(!midRound && !presetTerms){
        // Match the whole utterance: a greeting followed by actual terms still goes to negotiation.
        const greeting=text.replace(/[\s，。？！、,.!?～~：:]/g,'').split(person.name).join('');
        if(/^(?:你?(?:在笑什么|笑什么|笑啥|为什么笑)|你好|您好|嗨|哈喽|哈哈+|初次见面|很高兴认识你)[啊呀吗嘛呢吧]*$/.test(greeting)){
          const reply=person.id==='nailong'&&greeting.includes('笑')?'嘿嘿，见到对手开心嘛！准备好了就开打？':'你好呀！准备好就开打，想谈条件也可以。';
          history.push({speaker:'玩家',text},{speaker:'对手',text:reply,decision:'clarify'});input.value='';view.say(1,reply,echo);return;
        }
      }
      busy=true;input.disabled=send.disabled=true;for(const b of samples.children)b.disabled=true;
      abort=new AbortController();const signal=abort.signal;
      const context={midRound,battle,model,rival:person.id,name:person.name,player:names[0],skills:people.map(p=>p.skills),
        history:history.slice(-6),traits,text};
      try{
        const options=[];
        let proposal=null;
        if(model){
          input.value='';
          view.waitForReply(text);
          status.hidden=true;
          const draft=await api('decide',{...context,task:'deal'},signal);
          if(turn!==screen)return;
          status.hidden=true;
          if(!draft.terms){
            history.push({speaker:'玩家',text},{speaker:'对手',text:draft.line,decision:draft.decision});
            view.say(1,draft.line,echo);input.value='';return;
          }
          proposal=draft.proposal;
          if(proposal)options.push({kind:'原提议',terms:proposal});
          if(draft.decision==='counter')options.push({kind:'还价',terms:draft.terms});
          else if(!options.length)options.push({kind:'原提议',terms:draft.terms});
        }else{
          proposal=presetTerms;
          if(!proposal)return;
          options.push({kind:'原提议',terms:proposal});
          const hold=proposal.clauses?.find(c=>c.kind==='hold');
          if(hold && !midRound)options.push({kind:'还价',terms:{clauses:proposal.clauses.map(c=>c===hold?{...c,round:1,seconds:hold.seconds?2:5,untilAttack:true}:c)}});
          else if(proposal.first===1 && proposal.seconds<3)options.push({kind:'还价',terms:{...proposal,seconds:3}});
        }
        if(battle){
          for(let i=options.length-1;i>=0;i--)if(!compatible(options[i].terms))options.splice(i,1);
          if(!options.length){
            view.say(1,characterLine(person.id,'retry'),echo);status.hidden=false;status.textContent='这些条款与已有协议冲突，或回合已过。请换个条件。';return;
          }
        }
        if(!midRound){
          view.waitForReply(text);
          status.hidden=false;status.textContent='正在推演这份协议…';
        }
        let estimates=null;
        try{if(!midRound)estimates=await forecast(people,options,signal);}
        catch(e){
          if(signal.aborted || turn!==screen)return;
          status.textContent='本次未取得胜率数据。'+(model?'对手将按条款、性格和关系判断。':'请重试推演，或按普通规则开战。');
          status.hidden=false;
          if(!model){view.say(1,characterLine(person.id,'retry'),echo);return;}
        }
        if(turn!==screen)return;
        if(estimates)status.hidden=true;
        const baseline=estimates?.baseline??null;
        if(midRound)report.append(node('p','','战斗已暂停，对手根据当前回合的条件作决定。'));
        if(baseline)report.append(node('p','','同一对阵、同一批种子，每组 '+baseline.games+' 场三局两胜，双方由电脑操作，推演中跳过残血谈话。'),
          node('p','','对手普通规则胜率 '+rateText(baseline)));
        const offers=options.map((o,i)=>{
          if(!estimates)return o;
          const result=estimates.outcomes[i],delta=result.rate-baseline.rate;
          report.append(node('p','',o.kind+' · '+rateText(result)+' · '+(delta>=0?'+':'')+Number(delta.toFixed(1))+' 个百分点'));
          return {...o,result,delta};
        });
        let index,line;
        if(model){
          view.waitForReply(text);
          if(midRound||estimates)status.hidden=true;
          const reply=await api('decide',{...context,task:'judge',offers,baseline,traits},signal);
          if(turn!==screen)return;
          if(midRound||estimates)status.hidden=true;
          index=reply.decision==='choose'?reply.choice:-1;line=reply.line;
          if(index===-1){history.push({speaker:'玩家',text},{speaker:'对手',text:line,decision:reply.decision,terms:proposal});view.say(1,line,echo);input.value='';return;}
        }else{
          if(midRound){
            // Offline bargaining uses a rough cost of concessions, not a win-rate prediction.
            const values={lock:c=>c.skill==='ultimate'?12:18,lend:c=>8*c.uses,
              hold:c=>c.seconds?Math.min(48,4*c.seconds):80,damage:c=>(100-c.percent)*.65,
              first:c=>-6*c.seconds,speed:c=>(100-c.percent)*.4,recharge:c=>(100-c.percent)*.35};
            const cost=t=>t.clauses.reduce((sum,c)=>sum+(c.seat===1?1:-1)*values[c.kind](c)*(c.round?1:1.3),0);
            const tolerance=budget+(Math.random()-.5)*traits.risk*.22;
            index=offers.findIndex(o=>compatible(o.terms)&&cost(o.terms)<=tolerance);
            if(index<0 && compatible(proposal)){
              const give={kind:'damage',seat:0,round:midRound,percent:Math.max(25,Math.round(90-(cost(proposal)-tolerance)/.65))};
              const terms={clauses:[...proposal.clauses,give]};
              if(window.PactRules.valid(terms)&&compatible(terms)&&cost(terms)<=tolerance){offers.push({kind:'还价',terms});index=offers.length-1;}
            }
          }else index=offers.findIndex(o=>-o.delta<=budget);
          if(index===-1){view.say(1,characterLine(person.id,'reject'),echo);return;}
          line=characterLine(person.id,index>0?'counter':offers[index].delta<0?'concede':'accept');
        }
        const chosen=offers[index];
        if(!chosen)throw Error('没有收到有效的候选编号，请重试。');
        const counter=chosen.kind==='还价';
        history.push({speaker:'玩家',text},{speaker:'对手',text:line,decision:counter?'counter':'accept',terms:chosen.terms});
        view.say(1,line,echo);send.textContent='提出条件';input.value='';
        offer(chosen.terms,proposal||previous,counter);
      }catch(e){
        if(turn===screen){
          view.say(1,characterLine(person.id,'retry'),echo);status.hidden=false;status.textContent='谈判服务提示 · '+e.message;
          input.value=text;send.textContent='重试这条提议';
        }
      }
      finally{if(turn===screen){busy=false;input.disabled=send.disabled=false;for(const b of samples.children)b.disabled=false;}}
    }
    const compose=node('div','vn-compose');compose.append(input,send);
    actions.append(confirm,leave);if(!midRound)actions.append(back);box.append(paper,status);
    box.append(compose);if(!model)box.append(samples);
    box.append(actions,notes);
    if(battle && !model){
      const editor=node('details','pact-estimate'),form=node('div','vn-presets'),list=node('p');
      editor.append(node('summary','','自拟交换条件'),form,list);
      const choose=(label,pairs)=>{
        const wrap=node('label','',label),select=node('select');
        for(const [v,t] of pairs){const opt=node('option','',t);opt.value=v;select.append(opt);}
        wrap.append(select);form.append(wrap);return select;
      };
      const seat=choose('由谁 ',[['0','我方'],['1','对手']]);
      const kind=choose('条件 ',[['hold','停手'],['lend','出借技能'],['lock','禁用技能'],['first','获得先攻'],['damage','扣血伤害'],['speed','走位速度'],['recharge','技能恢复速度']]);
      const scope=choose('期限 ',[[midRound,'本回合'],[0,'本场剩余时间'],...(midRound<5?[[midRound+1,'下一回合']]:[])]);
      const slot=choose('技能 ',Object.entries(window.PactRules.skillNames));
      const until=choose('对方先出招 ',[['1','可提前还手'],['0','仍然停手']]);
      const amountLabel=node('label'),caption=node('span'),amount=node('input');amount.type='number';amountLabel.append(caption,amount);form.append(amountLabel);
      const settings={hold:['秒（0 表示到期）',0,60,4],lend:['借用次数',1,3,1],first:['秒',1,3,1],damage:['伤害百分比',1,99,65],speed:['速度百分比',50,150,80],recharge:['恢复速度百分比',50,200,125]};
      function fields(){
        const k=kind.value,d=settings[k];amountLabel.hidden=!d;slot.parentElement.hidden=!['lock','lend'].includes(k);until.parentElement.hidden=k!=='hold';
        if(d){caption.textContent=d[0];amount.min=d[1];amount.max=d[2];amount.value=d[3];}
      }
      kind.onchange=fields;fields();
      let items=[];
      const render=()=>{list.textContent=items.length?window.PactRules.details({clauses:items},names,[],midRound).join(' / '):'';};
      const add=button('加入条款',()=>{
        const k=kind.value,c={kind:k,seat:Number(seat.value),round:Number(scope.value)},v=Number(amount.value);
        if(k==='hold'||k==='first')c.seconds=v;if(k==='hold')c.untilAttack=until.value==='1';
        if(k==='lock'||k==='lend')c.skill=slot.value;if(k==='lend')c.uses=v;
        if(['damage','speed','recharge'].includes(k))c.percent=v;
        const next={clauses:[...items,c]};
        if(!window.PactRules.valid(next)||!compatible(next)){status.hidden=false;status.textContent='请检查数值、重复条件和已有约定，每份最多六条。';return;}
        status.hidden=true;items=next.clauses;render();
      });
      const undo=button('撤回末条',()=>{items.pop();render();});
      const propose=button('提出这份协议',()=>{if(items.length)submit(list.textContent,{clauses:items.slice()});});
      form.append(add,undo,propose);box.insertBefore(editor,actions);
    }
    function fallbackOpening(){
      // Generate both sides of an exchange from the current round, loadouts and relationship.
      const r=midRound,randomInt=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
      const slots=Object.keys(window.PactRules.skillNames);
      const make=(seat,benefit)=>{
        const kinds=benefit?['first','speed','recharge']:['lock','lend','hold','damage','speed','recharge'];
        const kind=kinds[randomInt(0,kinds.length-1)],c={kind,seat,round:r};
        if(kind==='lock'||kind==='lend')c.skill=slots[randomInt(0,slots.length-1)];
        if(kind==='lend')c.uses=randomInt(1,3);
        if(kind==='first')c.seconds=randomInt(1,3);
        if(kind==='hold'){c.seconds=randomInt(2,7);c.untilAttack=Math.random()<.5;}
        if(kind==='damage')c.percent=randomInt(45,85);
        if(kind==='speed'||kind==='recharge')c.percent=benefit?randomInt(110,145):randomInt(55,90);
        return c;
      };
      for(let n=0;n<64;n++){
        const generous=Math.random()<(traits.generous+relation.affinity)/230;
        const t={clauses:[make(generous?1:0,false),make(1,true)]};
        if(window.PactRules.valid(t)&&compatible(t))return t;
      }
      return null;
    }
    async function rivalOpening(){
      const show=(terms,line)=>{
        if(!terms)return;
        offer(terms,terms,false);if(!pending)return;
        history.push({speaker:'对手',text:line,terms});
        view.say(1,line,'对手开价 · 可以签约、还价或离开');
      };
      if(!model){show(fallbackOpening(),characterLine(person.id,'counter'));return;}
      busy=true;input.disabled=send.disabled=true;status.hidden=false;status.textContent='对手正在考虑开价…';
      abort=new AbortController();
      try{
        const r=await api('decide',{task:'opening',model,midRound,battle,rival:person.id,name:person.name,player:names[0],skills:people.map(p=>p.skills)},abort.signal);
        if(turn!==screen)return;status.hidden=true;show(r.terms,r.line);
      }catch(e){
        if(turn!==screen)return;
        status.hidden=false;status.textContent='本地模型未能开价 · '+e.message+' 可自行提议或继续战斗。';
        view.say(1,characterLine(person.id,'retry'));
      }finally{if(turn===screen){busy=false;input.disabled=send.disabled=false;}}
    }
    if(battle?.asker===1)rivalOpening();
    else if(midRound && model)input.focus();
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(mode==='plea'||mode==='mid'){dismiss();window.ArenaApp.answerPlea(false);}else {dismiss();window.ArcadeSelect.open(returnSelect);}});
  window.addEventListener('arena-match-end',e=>{
    if(!active)return;
    record({kind:'result',seat:e.detail.result.winner});
    overlay?.remove();overlay=null;
  });
  window.addEventListener('arena-hud',e=>{
    const p=e.detail.hud.pact;if(!active||!p)return;
    if(!overlay){
      const row=node('div','pact-ask');
      row.append(button('发起谈判',()=>window.ArenaApp.requestPlea()),node('small','pact-key-hint'));
      overlay=node('div','pact-hud');const events=node('div','pact-feedback');events.setAttribute('role','status');
      overlay.append(node('span','seal'),node('span','truce'),row,node('div','pact-break'),events);
      document.querySelector('.gx-stage').append(overlay);
    }
    const [seal,truce,row,buttons,notice]=overlay.children;
    const promises=e.detail.hud.phase==='fight' && p.asker===null?(p.promises||[]):[];
    const signature=JSON.stringify(promises);
    if(buttons.dataset.signature!==signature){
      buttons.dataset.signature=signature;buttons.replaceChildren();
      for(const item of promises){
        const b=button('背约 · '+item.label,()=>window.ArenaApp.renounce(item.id));b.title=item.detail+'。点击立即背约。';buttons.append(b);
      }
    }
    notice.hidden=performance.now()>=feedbackUntil;notice.textContent=notice.hidden?'':feedback.join('\n');
    const [ask,hint]=row.children;
    overlay.hidden=e.detail.hud.phase==='ko' && notice.hidden;
    const names=['我方',active.name];
    const restrictions=p.locks.map(c=>names[c.seat]+'禁用'+window.PactRules.skillNames[c.skill]);
    for(const c of p.modifiers||[])restrictions.push(names[c.seat]+(c.kind==='speed'?'移速 ':'冷却恢复 ')+c.percent+'%');
    for(const c of p.damage||[])restrictions.push(names[c.seat]+'出招伤害 '+c.percent+'%');
    for(const h of p.holds)restrictions.push(names[h.seat]+'停手'+(h.seconds===null?'':' · '+h.seconds+' 秒'));
    seal.hidden=!restrictions.length;seal.className='seal seat1';seal.textContent=restrictions.join(' / ')+(p.promises?.length?' · 违约出招将影响信任':'');
    for(const [seat,side] of ['l','r'].entries()){
      for(const [key,cls] of [['skill','s1'],['skill2','s2'],['ultimate','ult']]){
        const tile=document.querySelector('.gxh-kit.'+side+' .'+cls);
        if(!tile)continue;
        tile.classList.toggle('pact-locked',p.locks.some(c=>c.seat===seat && c.skill===key));
        const loan=p.loans.find(c=>c.seat===seat && c.skill===key),icon=tile.querySelector('.ic');
        if(loan){
          if(!tile.hasAttribute('data-original-title')){tile.dataset.originalTitle=tile.title;tile.dataset.originalIcon=icon.textContent;}
          const name=loan.name;
          tile.title='借用 · '+name+'（剩 '+loan.left+' 次）';icon.textContent=name.slice(0,2);tile.dataset.loan='借 ×'+loan.left;
        }else if(tile.hasAttribute('data-original-title')){
          tile.title=tile.dataset.originalTitle;icon.textContent=tile.dataset.originalIcon;
          delete tile.dataset.loan;delete tile.dataset.originalIcon;delete tile.dataset.originalTitle;
        }
      }
    }
    if(lockedNote!==p.round+':'+p.serial){lockedNote=p.round+':'+p.serial;noteUntil=performance.now()+2300;}
    if(p.first!==-1 && e.detail.hud.phase==='fight')truce.textContent=(p.first?'对手':'我方')+'先攻 · '+p.firstSeconds.toFixed(1)+' 秒';
    else if(p.truce>0)truce.textContent='双方停战　'+p.truce.toFixed(1)+' 秒';
    else truce.textContent=performance.now()<noteUntil?p.message:'';
    truce.hidden=!truce.textContent;
    row.hidden=!p.canAsk;ask.disabled=!!p.queued;
    hint.textContent=p.queued?'当前动作结束后发出':'按 '+window.DormKeys.key('plea',0)+' 触发谈判';
    if(p.asker!==null && pleaRound!==p.round){
      pleaRound=p.round;
      const h=e.detail.hud;
      const rule=window.RuleAuction?.currentRule();
      const battle={...(rule?{arenaRule:{name:rule.name,effects:rule.clauses.map(window.AuctionRules.describe)}}:{}),asker:p.asker,hpPercent:h.hp,energy:h.energy,remainingSeconds:h.time,wins:h.wins,existing:p.existing||[]};
      negotiate(active.ids,p.round,battle);
    }
  });
  window.PactUI={settingsPanel,negotiate,begin,end,record,recap:()=>matchEvents.filter(e=>['breach','kept','refused','loanUsed','holdEnded'].includes(e.kind)).map(describe).join('。') || '本场没有已结算的守约或背约记录',modalOpen:()=>dialog.open};
})();
