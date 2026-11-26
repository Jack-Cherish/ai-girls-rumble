(() => {
  'use strict';
  const C=BalanceCore, version='NSGA-II-1.0', saved='nc-lab-complete-applied-v1';
  const roster=ArenaManifest.characters,N=roster.length,CELLS=N*N,names=roster.map(c=>c.name.replace(/\s*娘$/,''));
  const fieldName={power:'威力',delay:'前摇',cooldown:'冷却'},slotName={skill:'一技能',skill2:'二技能',ultimate:'奥义'};
  const q=s=>body.querySelector(s),percent=n=>(n*100).toFixed(1)+'%';
  let body,session,last,view,selected=0,active=false,visible=false,clip=null,playTimer=null,clipToken=0,clipWorker=null;
    function applied(){try{const changes=JSON.parse(localStorage.getItem(saved))?.changes;return Array.isArray(changes)?changes.filter(c=>c&&typeof c==='object'):[];}catch{return [];}}
  function importOptions(data){
    if(!data||typeof data!=='object')throw Error('请选择实验室导出的 JSON 文件。');
    const options=[];
    if(Array.isArray(data.approved))options.push({label:'报告中通过验证的参数',changes:data.approved});
    if(Array.isArray(data.batches)){
      const shown=data.batches.findLast(b=>b?.label===data.displayed);
      if(Array.isArray(shown?.changes))options.push({label:'报告显示批次 · '+shown.label,changes:shown.changes});
    }
    if(!options.length&&Array.isArray(data.changes))options.push({label:'参数配置文件',changes:data.changes});
    if(!options.length)throw Error('文件中没有可读取的角色参数。请使用实验数据 JSON 或参数 JSON。');
    return options;
  }
  function validateImport(changes,kits){
    const clean=[],current=kits.slice();
    for(const source of changes){
      if(!C.changeValid(source,current,[]))throw Error('第 '+(clean.length+1)+' 项角色、技能或参数增量无效。');
      const {id,slot,field,delta}=source,item={id,slot,field,delta};
      const idx=current.findIndex(k=>k.characterId===id);current[idx]=C.kitFor(current[idx],[item]);clean.push(item);
    }
    return clean;
  }
  function importPanel(){
    const panel=document.createElement('section');panel.className='pact-settings';
    panel.innerHTML='<h3>万局平衡参数</h3><label>导入实验数据或参数 JSON <input type="file" accept=".json,application/json"></label><select aria-label="选择导入配置" hidden></select><p role="status"></p><details hidden><summary>查看参数变化</summary><pre></pre></details><button type="button" disabled>应用到新对局</button> <button type="button">恢复原版参数</button>';
    const file=panel.querySelector('input'),pick=panel.querySelector('select'),status=panel.querySelector('p');
    const details=panel.querySelector('details'),preview=panel.querySelector('pre'),[apply,reset]=panel.querySelectorAll('button');
    let choices=[],kits=[],clean=null,revision=0;
    status.textContent='当前已应用 '+applied().length+' 项调整。';
    function select(){
      clean=null;apply.disabled=true;details.hidden=true;
      try{
        clean=validateImport(choices[+pick.value].changes,kits);
        const diff=[];
        for(const original of kits){
          const changed=C.kitFor(original,clean);
          for(const slot of Object.keys(slotName))for(const field of Object.keys(fieldName)){
            const old=original[slot][field],v=changed[slot][field];
            if(old!==v)diff.push(names[C.ids.indexOf(original.characterId)]+' '+slotName[slot]+fieldName[field]+'　'+old+' → '+v);
          }
        }
        preview.textContent=diff.join('\n');details.hidden=!diff.length;
        status.textContent=diff.length?'将修改 '+diff.length+' 个技能参数。应用后在新开的本机对局生效。':'此配置对应原版参数。应用后将恢复原版。';
        apply.disabled=false;
      }catch(e){status.textContent=e.message;}
    }
    file.onchange=async()=>{
      const turn=++revision;choices=[];clean=null;apply.disabled=true;pick.hidden=true;details.hidden=true;
      const chosen=file.files[0];if(!chosen)return;
      status.textContent='正在读取实验文件…';
      try{
        const options=importOptions(JSON.parse((await chosen.text()).replace(/^\uFEFF/,'')));
        if(turn!==revision)return;
        const w=worker();try{kits=await rpc(w,{op:'kits'},new AbortController().signal);}finally{retire(w);}
        if(turn!==revision)return;
        choices=options;pick.replaceChildren(...options.map((o,i)=>new Option(o.label,String(i))));
        pick.value='0';pick.hidden=options.length<2;select();
      }catch(e){if(turn===revision)status.textContent=e instanceof SyntaxError?'无法解析 JSON；PNG 成绩卡没有完整参数。':e.message;}
    };
    pick.onchange=select;
    apply.onclick=()=>{if(!clean)return;try{localStorage.setItem(saved,JSON.stringify({version,changes:clean}));status.textContent='已应用，新开的本机对战使用导入参数。';}catch{status.textContent='浏览器无法保存配置。';}};
    reset.onclick=()=>{try{localStorage.removeItem(saved);status.textContent='新开的本机对战已恢复原版。';}catch{status.textContent='浏览器无法保存配置。';}};
    return panel;
  }
  function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
  function message(s){q('.bl-status').textContent=s;}
  function worker(){return new Worker('balance-worker.js');}
  function retire(w){w.terminate();}
  function rpc(w,data,signal){
    return new Promise((resolve,reject)=>{
      function done(err,value){w.onmessage=null;w.onerror=null;signal?.removeEventListener('abort',cancel);err?reject(err):resolve(value);}
      const cancel=()=>done(Error('已取消'));
      if(signal?.aborted)return cancel();
      signal?.addEventListener('abort',cancel,{once:true});
      w.onmessage=e=>e.data.error?done(Error(e.data.error)):done(null,e.data.ok);
      w.onerror=e=>done(Error(e.message||'模拟线程启动失败'));
      w.postMessage(data);
    });
  }
  function log(line){session.log.push(line);q('.bl-log').replaceChildren(...session.log.slice(-12).reverse().map(s=>text('li',s)));}
  function changeText(c){return names[roster.findIndex(p=>p.id===c.id)]+' '+slotName[c.slot]+' '+fieldName[c.field]+' '+(c.delta>0?'+':'')+Number(c.delta.toFixed(4));}
  function build(){
    body.innerHTML=`<div class="bl-toolbar"><label>实验种子 <input class="bl-seed" type="number" min="0" max="4294967295" value="20261116"></label><label>CPU 工作线程 <select class="bl-workers"></select></label><label>GPU 对局槽位 <select class="bl-gpu-slots"></select></label><label>搜索代数 <select class="bl-budget"><option value="0">持续至达标</option><option value="1">1 代</option><option value="10">10 代</option><option value="30">30 代</option></select></label><button class="bl-start">开始实验 · NSGA-II</button><button class="bl-small">试跑 144 场</button><button class="bl-resume" hidden>继续调参</button><button class="bl-stop" disabled>停止</button></div>
    <p class="bl-status" role="status">本机战斗引擎评估遗传算法生成的配置。试跑 144 场可检查流程。</p>
    <p class="bl-backend" role="status">CPU 和 GPU 共用待算队列，完成后滚动补位。12 位斗士 · 144 组对阵 · 每组 100 场。</p><div class="bl-meter"><progress max="14400" value="0"></progress><b>0 / 14,400</b><span>0 局/秒</span><span class="bl-peak" title="本次实验任意连续 1 秒内回传的最多实算场数，不含复用。">最高 0 场/秒</span><span>0 秒</span></div>
    <div class="bl-layout">
      <section class="bl-heatmap"><h3>对阵热力图</h3><p>格内是 1P 胜率。行是 1P，列是 2P。点击格子查看战绩和回放。</p>
      <ul class="bl-legend" aria-label="热力图图例"><li><span class="ahead"></span>1P 占优</li><li><span class="close"></span>接近五五开</li><li><span class="behind"></span>1P 吃亏</li><li><span class="pending"></span>待测</li></ul>
      <div class="bl-scroll"><table class="bl-grid" aria-label="对阵胜率"></table></div></section>
      <section><h3>对局回放</h3><div class="bl-faces"></div><p class="bl-pair"></p><select class="bl-games" aria-label="选择回放场次"></select><div class="bl-stage"><p class="bl-msg">选择已完成的对阵，查看实际比赛。</p><div class="bl-panes"></div></div>
    <div class="bl-controls"><button class="bl-watch">看这一局</button><button class="bl-guard">试着防御</button><button class="bl-compare">原版对比</button><button class="bl-play">播放</button><button class="bl-step">下一帧</button><label>速度 <select class="bl-speed"><option value="1">1×</option><option value=".25">¼×</option></select></label></div><input class="bl-scrub" aria-label="回放帧" type="range" min="0" max="0" value="0"><p class="bl-frame"></p></section>
    </div>
    <section class="bl-results"><h3>本批结果</h3><select class="bl-batches" aria-label="选择已完成的批次"></select><p class="bl-stats">等待实测</p><p class="bl-work"></p><div class="bl-checks"></div><div class="bl-ranks"></div></section>
    <section class="bl-population"><h3>NSGA-II 种群</h3><p class="bl-leaders">每代最多测试 12 个子代，从亲代和子代中保留最多 12 套配置。</p><ol class="bl-routes"></ol></section>
    <details open><summary>遗传搜索记录</summary><ol class="bl-log"></ol></details>
    <div class="bl-footer"><button class="bl-card">导出成绩卡</button><button class="bl-export-comparison">导出前后对比图</button><button class="bl-json">导出实验数据</button><button class="bl-config">导出参数 JSON</button><button class="bl-apply">应用通过验证的配置</button><button class="bl-reset">恢复原版参数</button></div>`;
    const logical=navigator.hardwareConcurrency||2,limit=Math.max(1,logical);
    const select=q('.bl-workers');for(let i=1;i<=limit;i++)select.add(new Option(i,i));select.value=limit;
    const gpuSlots=q('.bl-gpu-slots');
    for(const size of [256,512,768,1024])gpuSlots.add(new Option(size,size));
    gpuSlots.value=256;
    function axis(i){const th=text('th',''),img=document.createElement('img');img.src='assets/select-hd/'+roster[i].id+'-face.webp';img.alt=names[i];th.title=names[i];th.append(img);return th;}
    const table=q('.bl-grid'),header=document.createElement('tr');header.append(text('th','1P / 2P'));for(let i=0;i<N;i++)header.append(axis(i));table.append(header);
    for(let a=0;a<N;a++){const tr=document.createElement('tr');tr.append(axis(a));for(let b=0;b<N;b++){const td=document.createElement('td'),btn=text('button','·');btn.title=names[a]+' 对 '+names[b];btn.onclick=()=>{selected=a*N+b;chosen=null;clearClip();paint();};td.append(btn);tr.append(td);}table.append(tr);}
    q('.bl-start').onclick=()=>start(false);q('.bl-resume').onclick=()=>start(false,true);q('.bl-small').onclick=()=>start(true);q('.bl-stop').onclick=()=>session?.controller.abort();
    q('.bl-watch').onclick=()=>replay('single');q('.bl-compare').onclick=()=>replay('compare');q('.bl-guard').onclick=()=>replay('guard');
    q('.bl-play').onclick=()=>{if(playTimer){pause();return;}if(!clip)return;if(+q('.bl-scrub').value>=clip.base.length-1)q('.bl-scrub').value=0;
      q('.bl-play').textContent='暂停';playTimer=setInterval(()=>step(1),1000/(60*Number(q('.bl-speed').value)));};
    q('.bl-step').onclick=()=>{pause();step(1);};q('.bl-scrub').oninput=()=>{pause();draw();};
    q('.bl-card').onclick=()=>downloadCard();q('.bl-json').onclick=()=>save(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}),'json');
    q('.bl-export-comparison').onclick=downloadComparison;
    q('.bl-config').onclick=()=>{
      const v=view?.summary?view:last;
      if(v)save(new Blob([JSON.stringify({version,changes:session.approved??v.changes},null,2)],{type:'application/json'}),'json','参数');
    };
    q('.bl-apply').onclick=()=>{if(!session?.approved)return;try{localStorage.setItem(saved,JSON.stringify({version,changes:session.approved}));message('已应用，新开的本机对战使用这份参数。');}catch{message('浏览器未能保存，请检查可用存储空间。');}};
    q('.bl-reset').onclick=()=>{try{localStorage.removeItem(saved);message('新开的本机对战已恢复原版参数。');}catch{message('未能写入本机存档');}};
    q('.bl-games').onchange=e=>{chosen=e.target.value===''?null:Number(e.target.value);clearClip();};
    q('.bl-batches').onchange=e=>{if(active)return;const next=session?.views[Number(e.target.value)];if(!next)return;view=next;chosen=null;clearClip();showStats(next);paint();};
    paint();
  }
  function paint(){
    if(!body)return;
    const v=view,buttons=q('.bl-grid').querySelectorAll('button');
    buttons.forEach((button,i)=>{const c=v?.cells[i],rate=c?.n?c.wins/c.n:null;
      button.textContent=rate==null?'·':Math.round(100*rate)+'%';button.classList.toggle('chosen',i===selected);
      button.classList.toggle('axis-on',Math.floor(i/N)===Math.floor(selected/N)||i%N===selected%N);
      button.style.background=rate==null?'#292e39':heat(rate);
      button.style.color=rate==null?'#929baa':'#10202a';
      button.setAttribute('aria-label',button.title+'，'+(c?.n||0)+'场，1P胜率'+button.textContent);});
    const c=v?.cells[selected],entry=c?.example;
    const pair=q('.bl-faces');if(pair.dataset.cell!==String(selected)){pair.dataset.cell=selected;pair.replaceChildren();for(const [slot,i] of [[1,Math.floor(selected/N)],[2,selected%N]]){const img=document.createElement('img');img.src='assets/select-hd/'+roster[i].id+'-face.webp';img.alt=names[i];pair.append(img,text('strong',slot+'P · '+names[i]));}}
    const list=q('.bl-games'),key=(v?.label||'')+'/'+selected+'/'+(c?.n||0);
    if(list.dataset.key!==key){list.dataset.key=key;list.replaceChildren(new Option('优先查看异常场次',''));for(const row of (c?.entries||[]).slice().sort((a,b)=>a.index-b.index))list.add(new Option('#'+row.index+' · 最大连续伤害 '+row.combo.amount,row.index));}
    list.disabled=!entry;list.value=chosen??'';
    q('.bl-batches').disabled=active||!session?.views.length;
    q('.bl-pair').textContent=names[Math.floor(selected/N)]+' 对 '+names[selected%N]+' · '+(c?.n||0)+' 场'+(c?.n?' · 1P '+c.wins+' 胜 / '+c.draws+' 平 / '+(c.n-c.wins-c.draws)+' 负':'');
    for(const cls of ['watch','guard','compare'])q('.bl-'+cls).disabled=!entry||(cls==='compare'&&!v.changes.length);
    q('.bl-start').disabled=q('.bl-small').disabled=q('.bl-seed').disabled=q('.bl-workers').disabled=q('.bl-gpu-slots').disabled=active;q('.bl-stop').disabled=!active;q('.bl-budget').disabled=active;q('.bl-resume').hidden=active||!session?.best||Boolean(session?.approved);
    q('.bl-card').disabled=q('.bl-json').disabled=q('.bl-config').disabled=!last;q('.bl-apply').disabled=active||!session?.approved?.length;
    const exportButton=q('.bl-export-comparison');
    exportButton.disabled=active||!comparisonPair();
    exportButton.title=active?'实验结束或停止后可导出':exportButton.disabled?
      '待完成同种子的原版及调整后批次':'导出 2048 × 1280 PNG';
    for(const cls of ['play','step','scrub'])q('.bl-'+cls).disabled=!clip;
    q('.bl-peak').textContent='最高 '+(session?.completionRate.peak??0).toLocaleString('zh-CN')+' 场/秒';
    if(v){const sec=((v.ended||performance.now())-v.start)/1000,pr=q('progress');pr.max=v.total;pr.value=v.n;
      const labels=q('.bl-meter').children;labels[1].textContent='已统计 '+v.n.toLocaleString()+' / '+v.total.toLocaleString();
      labels[2].textContent=(v.ended?(v.n-(v.reused||0))/Math.max(.001,sec):v.speed).toFixed(1)+' 场实算/秒';labels[4].textContent='本批耗时 '+sec.toFixed(1)+' 秒';}
  }
  function createCompletionRate(){
    const samples=[];
    let first=0,total=0,expired=0,peak=0;
    return {
      get peak(){return peak;},
      record(count,time=performance.now()){
        if(!count)return;
        total+=count;
        samples.push({time,total});
        while(samples[first].time<=time-1000){
          expired=samples[first].total;
          first++;
        }
        peak=Math.max(peak,total-expired);
        if(first>=2048 && first*2>=samples.length){
          samples.splice(0,first);
          first=0;
        }
      }
    };
  }
  function heat(rate){return `hsl(${rate<.5?27:169} ${20+Math.abs(rate-.5)*104}% ${88-Math.abs(rate-.5)*62}%)`;}
  function rankProblem(r){return Number(r.oneShot)*1000+(r.combo.amount/r.hpMax)*100+(r.rounds.some(x=>x.t<8)?80:0)+(r.rounds.some(x=>x.timeout&&Math.min(...x.hp)>90)?100:0);}
  function stats(s){return '回合中位 '+s.median.toFixed(1)+' 秒 · 最快 10% 分位 '+s.p10.toFixed(1)+' 秒 · 低于 8 秒 '+percent(s.short)+' · 高血量超时 '+percent(s.stall)+' · 镜像 1P 得分率 '+percent(s.mirrorRate);}
  async function checkGPU(seed){
    const signal=session.controller.signal;
    const tasks=Array.from({length:20},(_,i)=>C.task(Math.floor(((i*37)%100)/10)*N+((i*37)%10),seed));
    const result=new Map(),w=worker();
    let cursor=0;
    try{
      const [cpu]=await Promise.all([rpc(w,{indices:tasks.map(t=>t.index),changes:[],seed},signal),
        BalanceFull.roll(session.kits.slice(0,10),[],8,()=>tasks[cursor++],r=>result.set(r.index,r),signal)]);
      if(cpu.some(r=>JSON.stringify(r)!==JSON.stringify(result.get(r.index))))throw Error('同种子核验未通过');
      session.gpuReady=true;
    }catch(e){
      if(signal.aborted)throw e;
      session.gpuReady=false;session.gpuError=e.message;log('使用 CPU · '+e.message);
    }finally{retire(w);}
  }
  async function batch(label,changes,seed,total,references=null,cpuOnly=false){
    chosen=null;clearClip();const v={label,changes:[...changes],seed,total,start:performance.now(),speed:0,n:0,cells:Array.from({length:CELLS},()=>({n:0,wins:0,draws:0,entries:[],example:null})),rows:new Array(total)};
    view=v;message(label);log(label+' · '+total.toLocaleString()+' 场');q('.bl-stats').textContent='计算中';q('.bl-ranks').replaceChildren();q('.bl-checks').replaceChildren();
    let next=0;const signal=session.controller.signal,trail=[[v.start,0]];
    const timer=setInterval(()=>{const now=performance.now();const simulated=v.n-(v.reused||0);trail.push([now,simulated]);while(trail.length>2&&now-trail[1][0]>2200)trail.shift();
      v.speed=(simulated-trail[0][1])*1000/Math.max(1,now-trail[0][0]);if(visible)paint();},350);
    let pending=null,reused=0;
    function accept(r){
      if(r.index<0||r.index>=total||v.rows[r.index])throw Error('对局编号重复或不符');
      v.rows[r.index]=r;
      const c=v.cells[r.a*N+r.b];c.entries.push(r);c.n++;c.wins+=Number(r.winner===0);c.draws+=Number(r.winner===null);
      if(!c.example||rankProblem(r)>rankProblem(c.example)||(rankProblem(r)===rankProblem(c.example)&&r.index<c.example.index))c.example=r;v.n++;
    }
    const plan=references&&C.reusePlan(session.kits,changes,seed,total,references);
    const changed=plan?C.ids.filter((_,i)=>plan.changed[i]):null;
    const scope=plan?'相对「'+plan.prior.label+'」变化 '+changed.length+' 人'+(changed.length?'（'+changed.map(id=>names[C.ids.indexOf(id)]).join('、')+'）':''):
      references?'独立批次':'完整批次';
    let gpuDone=0,cpuDone=0,refills=0,lastDisplay=-Infinity;
    const outstanding=new Set(),retry=[],cpuReserve=[];
    const useGPU=session.gpuReady&&!cpuOnly;
    function take(){
      if(retry.length)return retry.pop();
      if(next>=(pending?.length??total))return null;
      return pending?pending[next++]:next++;
    }
    function display(force=false){
      const now=performance.now();
      if(!force&&now-lastDisplay<150)return;
      lastDisplay=now;
      const status=session.gpuError?' · GPU 回退 CPU：'+session.gpuError:'';
      q('.bl-backend').textContent='CPU 完成 '+cpuDone+' 场 · GPU 完成 '+gpuDone+' 场 · GPU 在途 '+outstanding.size+' 场'+status;
    }
    async function gpuLane(){
      try{
        refills=await BalanceFull.roll(session.kits.slice(0,10),changes,session.gpuSlots,()=>{
          let index;for(;;){index=take();if(index===null)return null;const t=C.task(index,seed);if(t.a<10&&t.b<10)break;cpuReserve.push(index);}
          outstanding.add(index);return C.task(index,seed);
        },r=>{
          if(!outstanding.delete(r.index))throw Error('GPU 场次编号不符');
          accept(r);gpuDone++;
          session.completionRate.record(1);
          display();
        },signal,()=>Math.max(0,(pending?.length??total)-next));
      }catch(e){
        if(signal.aborted)throw e;
        session.gpuReady=false;session.gpuError=e.message;log('GPU 任务退回 CPU · '+e.message);
        retry.push(...outstanding);outstanding.clear();
      }
    }
    async function lane(){
      const w=worker();
      try{while(!signal.aborted){
        const indices=[];
        // In joint mode each worker returns its match as soon as it finishes.
        for(let i=0;i<(useGPU?1:5);i++){const index=cpuReserve.length?cpuReserve.pop():take();if(index===null)break;indices.push(index);}
        if(!indices.length)break;
        const rows=await rpc(w,{indices,changes,seed},signal);
        if(rows.length!==indices.length)throw Error('工作线程漏报对局');
        rows.forEach((r,j)=>{if(r.index!==indices[j])throw Error('对阵不符');accept(r);cpuDone++;});
        session.completionRate.record(rows.length);
        display();
      }}finally{retire(w);}
    }
    try{
      if(plan){
        pending=[];
        for(let i=0;i<total;i++){
          const task=C.task(i,seed),row=plan.prior.rows[i];
          if(!plan.changed[task.a]&&!plan.changed[task.b]&&row?.index===i&&row.seed===task.seed&&row.a===task.a&&row.b===task.b){
            accept(row);reused++;
          }else pending.push(i);
        }
      }
      v.reused=reused;
      q('.bl-work').textContent=scope;
      display(true);
      const workers=()=>Array.from({length:Math.min(session.threads,total-reused)},lane);
      const gpuJob=useGPU&&total>reused?gpuLane():Promise.resolve();
      await Promise.all([gpuJob,...workers()]);
      if(retry.length||cpuReserve.length)await Promise.all(workers());
      display(true);
      if(signal.aborted||v.n!==total)throw Error('批次未完成');
    }finally{clearInterval(timer);v.ended=performance.now();}
    v.compute={scope,reference:plan?.prior.label??null,changed,simulated:total-reused,gpuSlots:session.gpuSlots,backend:useGPU?'device-queue':'cpu',reused,cpuSimulated:cpuDone,gpuSimulated:gpuDone,gpuRefills:refills,gpuError:session.gpuError||null};
    const s=C.summary(v.rows);v.summary=s;last=v;
    q('.bl-stats').textContent=stats(s);
    q('.bl-ranks').textContent=s.ranks.map((r,i)=>[names[i],r.rate]).sort((a,b)=>b[1]-a[1]).map(([n,r])=>n+' '+percent(r)).join('　');
    session.batches.push({label,seed,total,changes:[...changes],seconds:(v.ended-v.start)/1000,compute:v.compute,summary:s});
    session.views.push(v);keepReplayViews(v);
    showStats(v);paint();return v;
  }
  function runFixture(changes){const w=worker();return rpc(w,{op:'fixtures',changes},session.controller.signal).finally(()=>retire(w));}
  function grade(v,f){return [v.summary.ones+f.problems.length,Math.max(0,v.summary.maxCombo/v.rows[0].hpMax-.35),...v.summary.penalties.slice(1)];}
  function passed(g){return g.every(x=>x<=1e-9);}
  function extreme(s,i,j){const c=s.cells[i*N+j],d=s.cells[j*N+i];return (c.wins+d.n-d.wins-d.draws)/(c.n+d.n);}
  const gateNames=['单招满血伤害或专项异常','无奥义连续伤害','回合时长','8 秒内结束','高血量超时','角色胜率','镜像先后手','15 秒无伤超时'];
  function deviations(v,f,pairs=[]){
    const s=v.summary,g=grade(v,f);
    const rates=s.ranks.map((r,i)=>[names[i],r.rate]).filter(([,r])=>r<.45||r>.55).map(([n,r])=>n+' '+percent(r)).join('、');
    const measured=[s.ones+' 场 / '+f.problems.length+' 项',percent(s.maxCombo/v.rows[0].hpMax)+'（目标 ≤35%）',s.median.toFixed(1)+' 秒（目标 25–40 秒）',percent(s.short),percent(s.stall),rates,percent(s.mirrorRate),percent(s.frozen)];
    const failed=gateNames.flatMap((n,i)=>g[i]>1e-9?[n+' '+measured[i]]:[]);
    for(const [a,b] of pairs){const rate=extreme(s,a,b);if(rate>.7||rate<.3)failed.push(names[a]+' 对 '+names[b]+' 换边胜率 '+percent(rate));}
    return failed;
  }
  function score(v,f){
    return [...grade(v,f),session.pairs.reduce((n,[a,b])=>n+Math.max(0,Math.abs(extreme(v.summary,a,b)-.5)-.2),0)];
  }
  function rememberBest(v,f){
    session.best=v;session.fixtures=f;
    session.seen.add(v.seed+':'+C.configKey(session.kits,v.changes));
    session.failed=deviations(v,f,session.pairs);
  }
  function stage(label){message(label);log(label);}
  function keepReplayViews(latest){
    const previous=[...new Set([...session.views,...session.population.map(n=>n.v),latest])];
    session.views=previous.filter((v,i)=>i===0||v===session.best||session.population.some(n=>n.v===v)||v===latest||i>=previous.length-3);
    const select=q('.bl-batches');select.replaceChildren();
    session.views.forEach((v,i)=>select.add(new Option(v.label,i)));
    select.value=session.views.indexOf(latest);
  }
  async function validate(total){
    const {best,fixtures}=session;
    if(!session.validation){
      stage('训练种子达标，开始独立种子验证');
      const serial=++session.validations;
      const seeds=[1,2].map(i=>(session.seed+Math.imul((serial-1)*2+i,0x9e3779b9))>>>0);
      if(best.seed!==session.seed)seeds.unshift(session.seed);
      session.validation={serial,seeds,index:0,base:null,previous:null};
    }
    const work=session.validation;
    while(work.index<work.seeds.length){
      const {seeds,serial,previous}=work,seed=seeds[work.index];
      const label='验证 '+serial+' · 种子 '+seed;
      if(!work.base)work.base=await batch(label+' · 原版',[],seed,total,null,true);
      const cand=best.changes.length?await batch(label+' · 候选',best.changes,seed,total,null,true):work.base;
      if(previous&&seed===seeds.at(-1)){
        for(let a=0;a<N;a++)for(let b=a+1;b<N;b++){
          const x=extreme(previous.summary,a,b),y=extreme(cand.summary,a,b);
          if(((x<.3&&y<.3)||(x>.7&&y>.7))&&!session.pairs.some(p=>p[0]===a&&p[1]===b))session.pairs.push([a,b]);
        }
      }
      if(!passed(score(cand,fixtures))){
        rememberBest(cand,fixtures);session.validation=null;
        log('独立验证未通过，将用失败种子继续调参 · '+session.failed.join('；'));
        return false;
      }
      work.previous=cand;work.index++;work.base=null;
    }
    session.validation=null;session.approved=best.changes;
    if(best.changes.length)session.verifiedBatch=session.batches.at(-1);
    session.status=best.changes.length?'候选配置通过独立验证，可应用':'原版配置通过独立验证';
    return true;
  }
  function route(id,v,f){
    let worst=0;
    for(let a=0;a<N;a++)for(let b=a+1;b<N;b++)worst=Math.max(worst,Math.abs(extreme(v.summary,a,b)-.5));
    return {id,v,f,g:score(v,f),cost:BalanceNSGA.editCost(session.kits,v.changes),worst};
  }
  function drawRoutes(items){
    const panel=q('.bl-routes');panel.replaceChildren();
    for(const item of items){
      const row=document.createElement('li');
      row.append(text('b',item.id+' ← '+[item.parent,item.mate].filter(Boolean).join(' × ')),text('span',item.source+' · '+item.edits.map(changeText).join('，')),text('small',item.outcome));
      if(item.metrics){const m=item.metrics;row.append(text('em','回合中位 '+m.median.toFixed(1)+' 秒 · 最大无奥义连续伤害 '+percent(m.combo)+' · 最偏对阵 '+percent(m.worstRate)+(m.front?' · 前沿 '+m.front+' · 拥挤距离 '+m.crowding:''))); }
      panel.append(row);
    }
  }
  async function planGeneration(){
    const generation=session.attempts+1;
    stage('第 '+generation+' 代 · 正在通过锦标赛选择亲代并生成子代');
    const plans=BalanceNSGA.plan(session.kits,session.population,generation,session.seen);
    if(!plans.length)return null;
    const items=plans.map((p,i)=>({...p,id:generation+'-'+String(i+1).padStart(2,'0'),outcome:'待测'}));
    drawRoutes(items);
    return {generation,seed:session.best.seed,items,completed:0,nodes:[]};
  }
  async function runGeneration(gen,total){
    for(;gen.completed<gen.items.length;gen.completed++){
      session.controller.signal.throwIfAborted();
      const p=gen.items[gen.completed],label='候选 '+p.id;
      p.outcome='专项检查';drawRoutes(gen.items);
      stage(label+' ← '+p.parent+' · '+p.source+' · '+p.edits.map(changeText).join('，')+(p.reason?' · '+p.reason:''));
      const parent=session.population.find(n=>n.id===p.parent);
      const f=p.fixtures||await runFixture(p.changes);
      if(!p.fixtures){p.fixtures=f;session.history.push({label:label+' 专项',...f});}
      if(f.problems.length>parent.f.problems.length)p.outcome='专项异常增加，淘汰';
      else{
        p.outcome='模拟中';drawRoutes(gen.items);
        const refs=[parent.v,session.population.find(n=>n.id===p.mate)?.v,...session.population.map(n=>n.v),
          ...gen.nodes.map(n=>n.v),session.best,...session.views];
        const v=await batch(label,p.changes,gen.seed,total,refs);
        const node=route(p.id,v,f);gen.nodes.push(node);
        p.metrics={median:v.summary.median,combo:v.summary.maxCombo/v.rows[0].hpMax,worstRate:.5+node.worst,penalties:node.g,cost:node.cost};
        p.outcome='已实测';p.metrics.simulated=v.compute.simulated;p.metrics.reused=v.compute.reused;
      }
      session.seen.add(p.key);drawRoutes(gen.items);
    }
    const winners=BalanceNSGA.choose([...session.population,...gen.nodes]);
    session.population=winners;
    for(const p of gen.items){
      if(p.outcome==='已实测'){
        const node=gen.nodes.find(n=>n.id===p.id);
        p.metrics.front=node.rank+1;
        p.metrics.crowding=Number.isFinite(node.crowding)?Number(node.crowding.toFixed(2)):'边界';
        p.outcome=winners.some(w=>w.id===p.id)?'留到下一代':'本代淘汰';
      }
      session.trials.push({generation:gen.generation,id:p.id,parent:p.parent,mate:p.mate,source:p.source,edits:p.edits,reason:p.reason,outcome:p.outcome,metrics:p.metrics,seed:gen.seed});
    }
    const ids=winners.map(w=>w.id);
    session.generations.push({generation:gen.generation,seed:gen.seed,survivors:ids});
    q('.bl-leaders').textContent='第 '+gen.generation+' 代保留 · '+ids.join('、')+'　当前首选 '+ids[0];
    log(q('.bl-leaders').textContent);
    drawRoutes(gen.items);
    rememberBest(winners[0].v,winners[0].f);keepReplayViews(winners[0].v);
    session.attempts=gen.generation;session.pending=null;
  }
  async function rebase(total){
    const work=session.rebase;
    while(work.index<work.prior.length){
      const parent=work.prior[work.index];
      const v=parent===work.prior[0]?session.best:await batch('换种子对照 '+parent.id+' · '+work.seed,parent.v.changes,work.seed,total,[session.best,...work.next.map(n=>n.v),...session.views]);
      work.next.push(route(parent.id,v,parent.f));session.seen.add(work.seed+':'+C.configKey(session.kits,v.changes));work.index++;
    }
    session.population=BalanceNSGA.choose(work.next);const first=session.population[0];rememberBest(first.v,first.f);
    keepReplayViews(first.v);session.rebase=null;
  }
  async function tune(total,limit){
    if(!session.population.length)session.population=[route('原版',session.best,session.fixtures)];
    const end=limit?session.attempts+limit:Infinity;
    for(;;){
      session.controller.signal.throwIfAborted();
      if(session.rebase)await rebase(total);
      if(passed(score(session.best,session.fixtures))){
        if(await validate(total))return;
        session.rebase={prior:session.population,seed:session.best.seed,next:[],index:0};
        continue;
      }
      if(session.attempts>=end){session.status='本次代数已用完，可从保留的路线继续';return;}
      if(!session.pending)session.pending=await planGeneration();
      if(!session.pending){session.status='本代未生成新的合法配置，可更换实验种子重新搜索';return;}
      await runGeneration(session.pending,total);
    }
  }
  async function start(small,resume=false){
    if(active)return;
    const seed=Number(q('.bl-seed').value);
    if(!resume&&(!q('.bl-seed').value||!Number.isInteger(seed)||seed<0||seed>4294967295))return message('请填写有效实验种子');
    if(resume&&(!session?.best||session.approved))return;
    active=true;
    if(!resume){
      last=null;view=null;clearClip();
      session={seed,threads:+q('.bl-workers').value,kits:[],views:[],log:[],batches:[],small,history:[],attempts:0,validations:0,pairs:[],seen:new Set(),failed:[],trials:[],population:[],pending:null,rebase:null,generations:[],completionRate:createCompletionRate()};
      drawRoutes([]);q('.bl-leaders').textContent=small?'144 场试跑仅检查流程':'每代最多测试 12 个子代，从亲代和子代中保留最多 12 套配置。';q('.bl-stats').textContent='等待本批实测';q('.bl-ranks').replaceChildren();q('.bl-checks').replaceChildren();q('.bl-log').replaceChildren();q('.bl-batches').replaceChildren();
    }
    session.gpuSlots=Number(q('.bl-gpu-slots').value);
    session.threads=Number(q('.bl-workers').value);
    session.controller=new AbortController();session.status='运行中';paint();
    const total=small?CELLS:CELLS*100;
    try{
      if(!resume){
        const w=worker();try{session.kits=await rpc(w,{op:'kits'},session.controller.signal);}finally{retire(w);}
        q('.bl-backend').textContent='正在核验 GPU 和 CPU 的同种子结果…';
        await checkGPU((seed^0x75867a)>>>0);
        const base=await batch(small?'流程试跑':'原版基准',[],seed,total);
        if(small){
          session.status='试跑 144 场完成 · 正式自动调参请点「开始实验」';return;}
        session.best=base;
      }
      if(!session.fixtures){
        stage('基准已完成，正在检查专项');const f=await runFixture([]);
        session.history.push({label:'原版专项',...f});rememberBest(session.best,f);
      }
      await tune(total,Number(q('.bl-budget').value));
    }catch(e){
      session.status=session.controller.signal.aborted?'已手动停止':'实验暂停 · '+e.message;
      if(session.best)session.status+=' · 可以继续调参';
    }finally{
      session.controller.abort();active=false;
      if(session.best){view=last=session.best;showStats(view);q('.bl-batches').value=session.views.indexOf(view);}
      message(session.status+(session.failed.length?' · 未达标：'+session.failed.join('；'):''));
      paint();
    }
  }
  let chosen=null, clipAbort=null;
  function pause(){
    clearInterval(playTimer);playTimer=null;
    if(body)q('.bl-play').textContent='播放';
  }
  function clearClip(){
    clipToken++;pause();clipAbort?.abort();clipAbort=null;
    if(clipWorker){retire(clipWorker);clipWorker=null;}
    clip=null;if(!body)return;
    q('.bl-msg').textContent='选择一场对局，查看实际交手片段。';
    q('.bl-panes').replaceChildren();q('.bl-frame').textContent='';q('.bl-scrub').value=0;
    for(const cls of ['play','step','scrub'])q('.bl-'+cls).disabled=true;
  }
  function showStats(v){
    if(!v?.summary)return;
    const work=v.compute;
    q('.bl-work').textContent=v.label+' · '+work.scope+' · CPU '+work.cpuSimulated+' 场 · GPU '+work.gpuSimulated+' 场 · GPU 补位 '+work.gpuRefills+' 次 · 实际模拟 '+work.simulated.toLocaleString()+' 场 · 共统计 '+v.n.toLocaleString()+' 场';
    const s=v.summary,base=session.batches.find(t=>t.seed===v.seed&&!t.changes.length)?.summary||s;
    const metrics=[
      ['回合用时中位数',t=>t.median.toFixed(1)+' 秒','25–40 秒'],
      ['8 秒内结束的回合',t=>percent(t.short),'低于 1%'],
      ['双方半血以上超时',t=>percent(t.stall),'低于 2%'],
      ['超时且曾连续 15 秒无掉血',t=>percent(t.frozen),'低于 2%'],
      ['单招累计打出满血伤害',t=>t.ones+' 场','0 场'],
      ['最大无奥义连续伤害',t=>percent(t.maxCombo/v.rows[0].hpMax),'不超过 35%'],
      ['非镜像角色胜率范围',t=>percent(Math.min(...t.ranks.map(r=>r.rate)))+' – '+percent(Math.max(...t.ranks.map(r=>r.rate))),'45%–55%']
    ];
    const comp=document.createElement('table');
    for(const values of [['观察项','同种子原版','当前批次','目标'],...metrics.map(([name,fn,goal])=>[name,fn(base),fn(s),goal])]){
      const tr=document.createElement('tr');for(const value of values)tr.append(text(comp.children.length?'td':'th',value));comp.append(tr);
    }
    q('.bl-checks').replaceChildren(comp);
    q('.bl-stats').textContent=stats(v.summary);
    q('.bl-ranks').replaceChildren(...v.summary.ranks.map((p,i)=>[i,p.rate]).sort((a,b)=>b[1]-a[1]).map(([i,r])=>{
      const item=document.createElement('div'),meter=document.createElement('meter');meter.min=0;meter.max=1;meter.value=r;
      const face=document.createElement('img');face.src='assets/select-hd/'+roster[i].id+'-face.webp';face.alt=names[i];item.title=names[i]+' · '+percent(r);meter.setAttribute('aria-label',names[i]+' 胜率');
      item.append(face,meter,text('b',percent(r)));return item;
    }));
  }
  async function replay(mode){
    const v=view,row=chosen==null?v?.cells[selected].example:v?.rows[chosen];
    if(!row)return;
    clearClip();const token=clipToken,w=worker(),controller=new AbortController();clipWorker=w;clipAbort=controller;
    q('.bl-msg').textContent='正在用原种子核对命中记录并载入立绘…';
    try{
      const result=await rpc(w,{op:'replay',row,changes:v.changes,guard:mode==='guard',original:mode==='compare'?[]:null},controller.signal);
      if(token!==clipToken)return;
      const ready=await DuelArt.preload(result.team);if(token!==clipToken)return;
      if(!ready)throw Error('回放动作素材未能全部载入');
      const tracks=mode==='compare'?[[result.other,'原版'],[result.base,'候选配置']]:[[result.base,'实测片段']];
      if(mode==='guard')tracks.push([result.other,'首击后持续按防御']);
      clip={...result,tracks:tracks.map(([frames,label])=>{
        const fig=document.createElement('figure'),canvas=document.createElement('canvas'),caption=text('figcaption',label);
        fig.append(canvas,caption);q('.bl-panes').append(fig);return {frames,label,canvas,caption};
      })};
      q('.bl-msg').textContent='#'+row.index+' · 种子 '+row.seed+' · 命中记录已复现'+(mode==='guard'?(result.probe?.f!=null?' · 这段操作存在成功格挡':' · 在该次持续防御试验中未发现新增格挡'):'');
      const slider=q('.bl-scrub');slider.max=result.base.length-1;slider.value=result.probe?.f??result.anchor;draw();paint();
    }catch(e){if(token===clipToken){clip=null;q('.bl-msg').textContent=e.message;paint();}}
    finally{if(clipWorker===w){retire(w);clipWorker=null;clipAbort=null;}}
  }
  function draw(){
    if(!clip)return;const i=Number(q('.bl-scrub').value);
    for(const t of clip.tracks){
      const snap=t.frames[Math.min(i,t.frames.length-1)];if(!snap)continue;
      DormCombat.drawRemote(t.canvas,clip.team,snap);
      t.caption.textContent=t.label+' · 第 '+snap.hud.round+' 回合 · 体力 '+snap.hud.hp.join('% / ')+'%';
    }
    q('.bl-frame').textContent='第 '+(clip.lo+i)+' 帧 · 片段 '+(i+1)+' / '+clip.base.length+' 帧';
  }
  function step(by){if(!clip)return;const s=q('.bl-scrub');s.value=Math.min(+s.max,+s.value+by);draw();if(+s.value>=+s.max)pause();}
  function report(){
    const v=view?.summary?view:last;
    return {version,roster:C.ids,rosterSize:N,matchups:CELLS,generated:new Date().toISOString(),status:session.status,small:session.small,algorithm:'NSGA-II',seed:session.seed,
      logicalThreads:navigator.hardwareConcurrency||null,workers:session.threads,gpuSlots:session.gpuSlots,batches:session.batches,fixtures:session.history,
      decisions:session.log,trials:session.trials,generations:session.generations,
      pending:session.pending?.items.map(({id,parent,mate,edits,source,outcome,metrics})=>({id,parent,mate,edits,source,outcome,metrics}))||[],failed:session.failed,approved:session.approved??null,displayed:v.label,rows:v.rows};
  }
  function save(blob,ext,kind='',seed=session.seed){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AI娘大乱斗-NSGA-II-'+seed+kind+'.'+ext;
    a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function comparisonPair(){
    if(!session||session.small)return null;
    const selectedBatch=view?.summary && view.changes.length ? view : null;
    const bestBatch=session.best?.changes.length ? session.best : null;
    const after=selectedBatch && selectedBatch!==bestBatch ? selectedBatch :
      session.verifiedBatch || bestBatch;
    if(!after)return null;
    const before=session.batches.findLast(batch=>!batch.changes.length && batch.seed===after.seed && batch.total===after.total);
    const verified=after.seed===session.verifiedBatch?.seed && after.label===session.verifiedBatch?.label;
    return before ? {before,after,verified} : null;
  }
  function downloadComparison(){
    if(active)return;
    const pair=comparisonPair();
    if(!pair)return;
    try{
      const {before,after,verified}=pair;
      const canvas=document.createElement('canvas'),header=q('.bl-grid').rows[0];
      const fighters=names.map((name,i)=>({name,image:header.cells[i+1].querySelector('img')}));
      BalanceComparison.draw(canvas,fighters,before,after,verified);
      canvas.toBlob(blob=>{
        if(blob)save(blob,'png','-前后对比',after.seed);
        else message('未能生成对比图，请重试。');
      },'image/png');
    }catch(e){message('未能生成对比图 · '+e.message);}
  }
  function downloadCard(){
    if(!last)return;const v=view?.summary?view:last,s=v.summary;
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=900;
    const c=canvas.getContext('2d');c.fillStyle='#17171e';c.fillRect(0,0,1280,900);
    function label(str,x,y,size,color='#faf8ee'){c.fillStyle=color;c.font='bold '+size+'px system-ui,sans-serif';c.fillText(str,x,y);}
    label('AI 娘大乱斗  /  万局平衡测试',46,67,38,'#edfa54');label(v.label+' · '+session.status,48,110,21);
    const sec=(v.ended-v.start)/1000;
    label(v.n.toLocaleString()+' 场  ·  '+(v.n/sec).toFixed(1)+' 场评估/秒  ·  '+sec.toFixed(1)+' 秒',48,163,28);
    label('种子 '+v.seed+'  /  '+session.threads+' CPU 线程  /  '+v.compute.gpuSlots+' GPU 槽位  /  NSGA-II',48,201,18);
    label('1P 胜率 · 行为 1P，列为 2P',48,259,23,'#edfa54');
    const x=100,y=312,w=69,h=37;
    names.forEach((n,i)=>{const img=q('.bl-grid').rows[0].cells[i+1].querySelector('img');if(img?.naturalWidth){c.drawImage(img,x+i*w+15,y-40,34,34);c.drawImage(img,55,y+i*h,34,34);}else{label(n,x+i*w,y-10,12);label(n,30,y+i*h+24,12);}});
    s.cells.forEach((p,i)=>{const r=p.wins/p.n,xx=x+i%N*w,yy=y+Math.floor(i/N)*h;
      c.fillStyle=heat(r);c.fillRect(xx,yy,w-3,h-3);label(Math.round(100*r)+'%',xx+9,yy+25,17,'#10202a');});
    label('角色胜率',961,282,21,'#edfa54');
    s.ranks.map((p,i)=>[names[i],p.rate]).sort((a,b)=>b[1]-a[1]).forEach(([n,r],i)=>label(n+'   '+percent(r),961,317+i*36,19));
    label('回合中位 '+s.median.toFixed(1)+' 秒   /   8 秒内结束 '+percent(s.short)+'   /   高血量超时 '+percent(s.stall),48,777,22);
    label('单次出招累计满血伤害 '+s.ones+' 场   /   观察到的最大无奥义连续伤害 '+s.maxCombo,48,819,20);
    label(version+'  ·  '+new Date().toLocaleString()+'  ·  本机游戏引擎实测',48,865,16,'#b6b4bf');
    canvas.toBlob(blob=>{if(blob)save(blob,'png');},'image/png');
  }
  window.BalanceLab={applied,importPanel,metrics:()=>active&&view?{n:view.n,total:view.total,speed:view.speed,reused:view.reused||0}:null,open(container){visible=true;if(!body){body=container;build();}else paint();},hide(){visible=false;clearClip();}};
})();
