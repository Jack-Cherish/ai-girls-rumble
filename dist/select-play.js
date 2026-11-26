(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  const dialog=byId('arcadeSelect'), board=byId('selectBoard'), canvas=byId('selectCanvas'), ctx=canvas.getContext('2d');
  const controls=byId('selectButtons'), loading=byId('selectLoading'), buttons=new Map();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const now=()=>performance.now()/1000;
  let state=startingState(),ready=false,dirty=true,frame=0,assetsPromise,last=0;
  function prepare(){
    if(!assetsPromise){
      const load=src=>new Promise((ok,fail)=>{const image=new Image();image.onload=()=>ok(image);image.onerror=()=>fail(Error(src));image.src=src;});
      assetsPromise=Promise.all(SELECT_CAST.map(async c=>{[c.artImg,c.faceImg]=await Promise.all([load(c.art),load(c.face)]);})).then(()=>{ready=true;loading.hidden=true;dirty=true;}).catch(()=>{assetsPromise=null;loading.textContent='立绘加载失败，返回大厅后可重试。';});
    }
    return assetsPromise;
  }
  function paintButtons(hits){
    for(const [id,b] of buttons)b.hidden=!hits.some(h=>h.id===id);
    for(const h of hits){
      let b=buttons.get(h.id);
      if(!b){b=document.createElement('button');b.type='button';b.onclick=e=>{choose(h.id);if(e.detail&&dialog.open)dialog.focus();};buttons.set(h.id,b);controls.append(b);}
      b.setAttribute('aria-label',h.label);
      if(h.id.startsWith('pick'))b.setAttribute('aria-pressed',String(+h.id.slice(4)===state.picks[state.seat]));
      if(h.id.startsWith('mode:'))b.setAttribute('aria-pressed',String(h.id==='mode:'+state.mode));
      Object.assign(b.style,{left:h.x+'px',top:h.y+'px',width:h.w+'px',height:h.h+'px'});
    }
  }
  function draw(ms){
    if(!dialog.open)return;
    if(ready&&(dirty||(!reduced.matches&&ms-last>=30))){
      const w=board.clientWidth,h=board.clientHeight,ratio=Math.min(2,devicePixelRatio||1);
      if(w&&h){
        if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);dirty=true;}
        ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);
        const visual=reduced.matches?{...state,entered:[-20,-20],lockedAt:[-20,-20]}:state;
        const hits=compose(ctx,w,h,SELECT_CAST,visual,reduced.matches?2:ms/1000);
        if(dirty)paintButtons(hits);dirty=false;last=ms;
      }
    }
    frame=requestAnimationFrame(draw);
  }
  function choose(id){
    if(!ready||!dialog.open)return;
    const pageSize=rosterPageSize(board.clientWidth,board.clientHeight);
    if(id==='prevPage'||id==='nextPage'){const pages=Math.ceil(SELECT_CAST.length/pageSize);state.rosterPage=((state.rosterPage||0)+(id==='nextPage'?1:pages-1))%pages;dirty=true;return;}
    if(id.startsWith('pick'))state.rosterPage=Math.floor(Number(id.slice(4))/pageSize);
    if(id==='confirm'&&state.mode==='online'){
      dialog.close();
      window.ArenaApp.online();
      return;
    }
    if(id==='confirm'&&state.locks.every(Boolean)){
      const ids=state.picks.map(i=>SELECT_CAST[i].id);
      if(state.aiMode==='combined'){dialog.close();window.PactUI.negotiate(ids,0,null,true);return;}
      if(state.aiMode==='auction'){if(window.ArenaStartSelected(ids,'cpu',null,true))dialog.close();return;}
      if(state.aiMode==='bargain'){dialog.close();window.PactUI.negotiate(ids);return;}
      if(window.ArenaStartSelected(ids,state.mode))dialog.close();
      return;
    }
    if(id==='mode'&&state.mode==='training')return;
    if(id==='mode'&&state.aiMode){
      const modes=[...aiModes.keys()];
      setAiMode(modes[(modes.indexOf(state.aiMode)+1)%modes.length]);
      byId('selectAnnounce').textContent='当前玩法：'+aiModes.get(state.aiMode);
      dirty=true;return;
    }
    if(id==='mode'){
      const modes=[...classicModes.keys()];
      return choose('mode:'+modes[(modes.indexOf(state.mode)+1)%modes.length]);
    }
    if(id.startsWith('mode:')){
      const mode=id.slice(5);
      if(state.aiMode||state.mode==='training'||!classicModes.has(mode))return;
      state.mode=mode;
      dirty=true;
      byId('selectAnnounce').textContent='对战方式：'+classicModes.get(mode);
      return;
    }
    act(state,id,now());
    window.ArenaPrewarm?.(state.picks.map(i=>SELECT_CAST[i].id));
    dirty=true;
    byId('selectAnnounce').textContent=state.locks.every(Boolean)?(state.mode==='training'?'双方已锁定，可以开始训练':'双方已锁定，可以开始对战'):(state.mode==='training'?(state.seat?'训练假人':'练习角色'):(state.seat+1)+'P ')+SELECT_CAST[state.picks[state.seat]].name;
  }
  function setAiMode(mode){
    state.aiMode=aiModes.has(mode)?mode:null;
    if(mode==='combined'||mode==='auction')window.RuleAuction?.prepareOpening();
  }
  function open(mode){
    if(dialog.open)return;
    const previous=mode==='online'&&state.mode==='online'?state:null;
    state=startingState(now());
    setAiMode(mode);
    const help=mode==='training'?'← → 选人　↑ ↓ 切换玩家 / 假人　Enter 锁定':'← → 选人　↑ ↓ 切换 1P/2P　Enter 锁定';
    byId('selectHelp').textContent=help+(state.aiMode?'　M / RB 切换玩法':mode==='training'?'':'　M 切换对战方式');
    const live=window.ArenaRoster;
    if(previous){state.picks=previous.picks.slice();state.seat=previous.seat;}
    else if(mode!=='training')state.picks=live.players.map((p,seat)=>{const id=window.ArenaManifest.characters[p.body]?.id;const i=SELECT_CAST.findIndex(c=>c.id===id);return i>=0?i:seat%SELECT_CAST.length;});
    state.rosterPage=Math.floor(state.picks[state.seat]/rosterPageSize(board.clientWidth||innerWidth,board.clientHeight||innerHeight));
    state.mode=mode==='training'||mode==='online'?mode:live.mode==='duo'?'duo':'cpu';
    dialog.setAttribute('aria-label',mode==='training'?'训练选人':'斗士选择');
    byId('selectAnnounce').textContent=mode==='training'?'请选择练习角色，再选择训练假人':'';
    dirty=true;
    if(!ready){loading.hidden=false;loading.textContent='正在载入立绘…';}
    dialog.showModal();dialog.focus();prepare();cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);
  }
  dialog.tabIndex=-1;
  document.addEventListener('keydown',e=>{
    if(!dialog.open||e.isComposing||e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.target?.closest?.('input, textarea, select, [contenteditable="true"]'))return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
      e.preventDefault();
      navigate(e.key==='ArrowRight'?'right':'left');
    }else if(e.key==='ArrowUp'||e.key==='ArrowDown'){
      e.preventDefault();
      if(!e.repeat)choose('switch');
    }else if(e.code==='KeyM'&&state.mode!=='training'){
      e.preventDefault();
      if(!e.repeat)choose('mode');
    }else if(e.key==='Enter'&&e.target?.tagName!=='BUTTON'){
      e.preventDefault();
      if(!e.repeat)choose('confirm');
    }
  });
  dialog.addEventListener('close',()=>cancelAnimationFrame(frame));
  byId('closeArcadeSelect').onclick=()=>dialog.close();
  new ResizeObserver(()=>{
    if(dialog.open && board.clientWidth && board.clientHeight){
      const pages=Math.ceil(SELECT_CAST.length/rosterPageSize(board.clientWidth,board.clientHeight));
      state.rosterPage=Math.min(state.rosterPage||0,Math.max(0,pages-1));
    }
    dirty=true;
  }).observe(board);
  function navigate(dir){
    if(!dialog.open)return false;
    if(dir==='mode')choose('mode');
    else if(dir==='back')dialog.close();
    else if(dir==='ok')choose('confirm');
    else if(dir==='left'||dir==='right')choose('pick'+((state.picks[state.seat]+(dir==='right'?1:SELECT_CAST.length-1))%SELECT_CAST.length));
    else if(dir==='up'||dir==='down')choose('switch');
    return true;
  }
  window.ArcadeSelect={open,navigate};
  if(!window.ArenaShell&&!byId('lobby').hidden && !new URLSearchParams(location.search).size)open();
})();
