(()=>{
  'use strict';
  const R=window.AuctionRules;
  let active=null,opening=null,model='';
  try{model=JSON.parse(localStorage.getItem('nc-pact-model'))||'';}catch{}
  async function generate(payload,signal){
    const resp=await fetch('/pact/decide',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({task:'auction',...payload}),signal});
    const body=await resp.json();
    if(!resp.ok)throw Object.assign(Error(body.error||'无法读取模型回复'),{status:resp.status});
    return body;
  }
  function prepareOpening(){
    if(!model||opening)return;
    const controller=new AbortController(),entry={controller};
    opening=entry;
    entry.rules=generate({model,round:1,background:true},controller.signal).catch(()=>{
      if(opening===entry)opening=null;
      return null;
    });
  }
  function setModel(value){
    if(value!==model){
      opening?.controller.abort();opening=null;model=value;
    }
    prepareOpening();
  }
  function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
  function button(label,fn){const b=el('button',label);b.type='button';b.onclick=fn;return b;}
  function end(){if(active){active.dispose();active=null;}}
  function begin(ids,team,kits,difficulty){
    end();
    const dialog=el('dialog',undefined,'ra-panel'),signal=new AbortController(),toast=el('output','','ra-toast');
    dialog.setAttribute('aria-label','回合规则拍卖');dialog.oncancel=e=>e.preventDefault();document.body.append(dialog,toast);
    const scenery=el('div',undefined,'ra-scenery'),board=el('section',undefined,'ra-board');
    scenery.setAttribute('aria-hidden','true');
    ids.forEach((id,seat)=>{
      const fighter=typeof SELECT_CAST==='undefined'?undefined:SELECT_CAST.find(item=>item.id===id);
      const portrait=el('img',undefined,'ra-fighter ra-seat-'+seat);
      if((fighter?.facesRight??true)!==(seat===0))portrait.className+=' ra-mirror';
      portrait.alt='';portrait.draggable=false;
      portrait.onerror=()=>{portrait.hidden=true;};
      portrait.src=window.HeroLibrary?.urls.get(id)?.art||fighter?.art||'assets/select-hd/'+id+'-art.webp';
      scenery.append(portrait);
    });
    dialog.append(scenery,board);
    const wallet=R.wallet(Math.random()<.5?0:1),profile=window.PactPersonality.personality(ids[1]);
    let round=0,selected=null,worker=null,latest=[],history=[],timer=0,alive=true;
    let nextDraft=null;
    function cancelNext(){nextDraft?.controller.abort();nextDraft=null;}
    function prepareNext(names){
      cancelNext();
      const controller=new AbortController();
      const next=round+1;
      const entry={round:next,model,controller};nextDraft=entry;
      const payload={model,round:next,background:true,rival:ids[1],names:team.map(p=>p.name),
        recent:history.flatMap(r=>r.names).concat(names).slice(-6)};
      entry.rules=(async()=>{
        while(!controller.signal.aborted){
          try{return await generate(payload,controller.signal);}
          catch(e){
            if(nextDraft!==entry||controller.signal.aborted||![409,429].includes(e.status))return null;
            await new Promise(resolve=>setTimeout(resolve,1500));
            if(nextDraft!==entry)return null;
          }
        }
        return null;
      })();
    }
    function leave(){window.ArenaApp.lobby();}
    function page(title,subtitle){
      const header=el('header'),back=button('退出本场',leave),eyebrow=el('small','ROUND '+round+'  /  规则拍卖');
      header.append(eyebrow,back);board.replaceChildren(header,el('h2',title),el('p',subtitle,'ra-sub'));
      board.scrollTop=0;
      if(!dialog.open)dialog.showModal();
    }
    function predict(rules,energy,seed,clauses,includeBaseline){
      return new Promise((resolve,reject)=>{
        const w=worker=new Worker('auction-forecast.js');
        const finish=(err,res)=>{clearTimeout(id);signal.signal.removeEventListener('abort',stop);w.terminate();if(worker===w)worker=null;err?reject(err):resolve(res);};
        const stop=()=>finish(Error('已退出'));
        const id=setTimeout(()=>finish(Error('规则推演超时，请重试')),60000);
        w.onmessage=e=>finish(e.data.error?Error(e.data.error):null,e.data.results);
        w.onerror=e=>finish(Error(e.message||'无法启动推演线程'));
        signal.signal.addEventListener('abort',stop,{once:true});
        w.postMessage({team,kits,energy,difficulty,rules,seed,clauses,includeBaseline});
      });
    }
    function cards(rules,results,choose){
      const list=el('div',undefined,'ra-cards');
      list.setAttribute('role','radiogroup');list.setAttribute('aria-label','选择本回合要下注的擂台技能');
      rules.forEach((r,i)=>{
        const card=el('article'),delta=100*(results[i+1].rate-results[0].rate);
        card.append(el('small','规则 '+(i+1)),el('h3',r.name));
        for(const c of r.clauses)card.append(el('p',R.describe(c)));
        card.append(el('small','对手推演胜率 '+Math.round(results[i+1].rate*100)+'%（'+(delta>=0?'+':'')+Number(delta.toFixed(1))+' 个百分点）'));
        const pick=el('input',undefined,'ra-pick');
        pick.type='radio';pick.name='auction-skill';
        pick.setAttribute('aria-label','选择「'+r.name+'」');
        pick.id='ra-pick-'+i;
        pick.onchange=()=>{if(pick.checked)choose(i);};
        const label=el('label',undefined,'ra-pick-label');label.htmlFor=pick.id;
        label.append(el('span','选择此技能','ra-pick-idle'),el('span','✓ 已选择','ra-pick-active'));
        card.append(pick,label);
        list.append(card);
      });board.append(list);
    }
    async function openRound(wins,energy,clauses){
      const seed=(Math.random()*4294967296)>>>0,slots=Array(3).fill(null),scores=Array(3).fill(null);
      const selectedModel=model;
      let baseline=null,quote='',reason='';
      let draft=round===1?opening:nextDraft;
      if(round===1)opening=null;else nextDraft=null;
      if(draft?.model&&draft.model!==model){draft.controller.abort();draft=null;}
      async function fill(){
        try{
          if(!selectedModel)throw Error('请先在设置中保存本地模型。');
          for(let attempt=0;attempt<3;attempt++){
            const missing=[0,1,2].filter(i=>!slots[i]);
            const kept=slots.filter(Boolean);
            page(kept.length?'正在补齐 '+missing.length+' 张规则卡':'准备本回合规则',
              kept.length?'已通过的 '+kept.length+' 张卡保留。':draft?'正在读取提前生成的候选卡。':'本地模型正在生成候选卡。');
            let batch;
            if(draft){
              const controller=draft.controller,cancel=()=>controller.abort();
              signal.signal.addEventListener('abort',cancel,{once:true});
              try{batch=await draft.rules;}finally{signal.signal.removeEventListener('abort',cancel);draft=null;}
              if(!alive)return;
            }
            if(!batch){
              try{
                batch=await generate({model:selectedModel,round,rival:ids[1],names:team.map(p=>p.name),
                  recent:history.flatMap(r=>r.names).slice(-6),count:missing.length,kept,feedback:reason},signal.signal);
              }catch(e){
                if(!alive)return;
                if(attempt<2&&/规则|条款|候选|数值|触发/.test(e.message)){reason=e.message;continue;}
                throw e;
              }
            }
            if(!alive)return;
            quote=quote||batch.line||'';
            const candidates=[];
            for(const raw of batch.rules||[]){
              try{const card=R.check(raw);if(!kept.some(k=>k.name===card.name||R.signature(k)===R.signature(card)))candidates.push(card);}catch{/* Keep independently valid siblings. */}
            }
            if(candidates.length){
              page('正在检验规则','按本回合双方的技能、能量与协议，每项推演 32 回合。');
              const tested=await predict(candidates,energy,seed,clauses,!baseline);
              if(!alive)return;
              if(!baseline)baseline=tested.shift();
              const rejected=[];
              for(const [i,r] of candidates.entries()){
                const result=tested[i];
                if(!result.activations||Math.abs(result.rate-baseline.rate)>.22||result.short>Math.max(2,baseline.short+1)||result.stall>Math.max(4,baseline.stall+2)){
                  rejected.push(r.name);continue;
                }
                if(slots.some(other=>other&&(other.name===r.name||R.signature(other)===R.signature(r))))continue;
                const slot=missing.shift();if(slot===undefined)break;
                slots[slot]=r;scores[slot]=result;
              }
              reason='补齐缺少的机制，避免重复、无法触发或过强的规则。'+rejected.join('、');
            }else reason='请生成引擎支持的条款。';
            if(slots.every(Boolean)){showBids(slots,[baseline,...scores],wins,quote);return;}
          }
          throw Error(reason||'未补齐三张合格卡');
        }catch(e){if(!alive)return;page('本轮拍卖尚未开始',e.message);board.append(button('重试',fill));}
      }
      await fill();
    }
    function showBids(rules,results,wins,quote){
      const cash=wallet.cash,priority=wallet.priority,order=[0,1,2].sort((a,b)=>results[b+1].rate-results[a+1].rate);
      const best=order[0],value=results[best+1].rate-results[order[2]+1].rate;
      const deciding=wins.every(w=>w===1)||round>=5;
      const fraction=.08+value*1.4+profile.competitive/450+profile.risk/800+Math.random()*.12+(wins[0]>wins[1]?.12:0);
      const bid=deciding?Math.min(cash[1],cash[0]+1):Math.min(cash[1],cash[0]+1,Math.round(cash[1]*fraction));
      page('选择擂台技能并下注','你有 '+cash[0]+' 枚，对手有 '+cash[1]+' 枚。对手已锁定技能和报价。出价高的一方支付暗标，其选中的技能对双方生效。同价时'+(priority?'对手':'你')+'优先。');
      const speaker=team[1].name,spoken=el('p',speaker+'：「'+(quote||window.PactPersonality.line(ids[1],'bid'))+'」','ra-quote');
      board.append(spoken);
      let choice=null,settled=false;
      const voiceController=new AbortController();
      const stopVoice=()=>voiceController.abort();
      if(!quote){
        signal.signal.addEventListener('abort',stopVoice,{once:true});
        generate({model,round,background:true,lineOnly:true,rival:ids[1],names:team.map(p=>p.name)},voiceController.signal)
          .then(reply=>{if(reply.line&&alive&&!settled)spoken.textContent=speaker+'：「'+reply.line+'」';})
          .catch(()=>{}).finally(()=>signal.signal.removeEventListener('abort',stopVoice));
      }
      const submit=el('button','确认下注');submit.type='submit';submit.disabled=true;
      cards(rules,results,i=>{choice=i;submit.disabled=false;});
      board.append(el('small','无拍卖规则时对手推演胜率 '+Math.round(results[0].rate*100)+'% · 每项 32 回合，仅供估计。'));
      const field=el('label','你的暗标　'),input=el('input');
      input.type='number';input.min=0;input.max=cash[0];input.step=1;input.required=true;
      input.value=Math.min(25,cash[0]);field.append(input);
      const pass=button('放弃竞拍',()=>reveal(null));pass.className='ra-pass';
      const form=el('form');form.append(field,submit,pass);board.append(form);
      form.onsubmit=e=>{
        e.preventDefault();
        if(choice!==null&&input.checkValidity())reveal(input.valueAsNumber);
      };
      function reveal(playerBid){
        if(settled||!alive)return;
        const res=wallet.settle(round,[playerBid,bid]);
        settled=true;stopVoice();
        prepareNext(rules.map(r=>r.name));
        const won=rules[res.winner===1?best:choice];
        const playerLine=playerBid===null?'你放弃竞拍，保留全部筹码。':'你为「'+rules[choice].name+'」出 '+playerBid+' 枚。';
        page((res.winner?'对手':'你')+'拍下「'+won.name+'」',playerLine+'对手为「'+rules[best].name+'」出 '+bid+' 枚。'+(res.tied?'同价优先权生效。':''));
        board.append(spoken,el('p',won.clauses.map(R.describe).join('。')),
          el('p','本轮支付 '+res.bids[res.winner]+' 枚　·　剩余筹码　你 '+res.cash[0]+' / 对手 '+res.cash[1]),
          button('进入本回合',()=>{
            if(selected||!alive)return;
            selected=won;history.push({round,name:won.name,names:rules.map(x=>x.name),...res});
            dialog.close();feedback('本回合 · '+won.name);
          }));
      }
    }
    function feedback(msg){latest.push(msg);latest=latest.slice(-2);toast.textContent=latest.join('　·　');toast.hidden=false;clearTimeout(timer);timer=setTimeout(()=>{toast.hidden=true;latest=[];},1500);}
    toast.hidden=true;
    active={cancelNext,dispose(){alive=false;cancelNext();signal.abort();worker?.terminate();clearTimeout(timer);if(dialog.open)dialog.close();dialog.remove();toast.remove();},
      get modal(){return dialog.open;},get rule(){return selected;},history};
    return {current(n,wins,energy,readClauses){if(n!==round){const clauses=readClauses?.()||[];round=n;selected=null;latest=[];openRound(wins,energy,clauses);}return selected;},feedback};
  }
  window.RuleAuction={begin,end,matchEnded:()=>active?.cancelNext(),prepareOpening,setModel,currentRule:()=>active?.rule||null,modalOpen:()=>!!active?.modal,recap:()=>active?.history.map(r=>'第 '+r.round+' 回合 · '+(r.bids[0]===null?'你放弃竞拍，':'')+(r.winner?'对手':'你')+'以 '+r.bids[r.winner]+' 枚选定「'+r.name+'」').join('　/　')||''};
  prepareOpening();
})();
