(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = window.DormDesigner, art = window.DormArt;
  const copy = obj => JSON.parse(JSON.stringify(obj));
  const labels = {dash:'突进',projectile:'飞行道具',shield:'护盾',burst:'近身震荡',heal:'回复'};
  const storageKey = 'ai-arena-roster-v1';
  const libraryKey = 'ai-arena-fighter-library-v2';
  let reserves = [{}, {}];
  const characters = window.ArenaManifest.characters;
  const profiles = {};
  const slots = [
    {skill:'skill', mechanism:'mechanism', title:'一技能'},
    {skill:'skill2', mechanism:'mechanism2', title:'二技能'}
  ];
  const flavor = skill => String(skill.prompt || '').split('【执行参数】')[0].trim();
  function rosterEntry(raw, i) {
    const row = raw && typeof raw === 'object' ? raw : D.defaults[i];
    const body = window.DormKit.resolveBody(row.body,i);
    const base = D.defaults[body] || window.DormKit.rosterPlayer(body);
    const p = {...copy(base), body, name:typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0,12) : base.name,
      story:String(row.story ?? base.story).slice(0,500), appearance:String(row.appearance || '').slice(0,180)};
    if(characters[body].id==='nailong' && p.name==='奶龙（隔离候选）')p.name=characters[body].name;
    if(characters[body].id==='nailong' && p.story==='新增试玩角色，参数与美术未完成验收。')p.story=characters[body].note;
    if(characters[body].id==='laoda' && p.story==='隔离测试角色：冰红茶投掷、转体肘击、旋翼奥义。')p.story=characters[body].note;
    const kit = window.DormKit.forPlayer({...row, body}, i);
    for (const slot of slots) {
      const skill = D.compile(kit[slot.skill], p.story, i);
      p[slot.skill] = skill;
      p[slot.mechanism] = String(row[slot.mechanism] ?? flavor(skill)).slice(0,900);
    }
    const look = row.look || base.look;
    p.look = D.parseImport({...p.skill, look}, i).look;
    p.look.face = /^data:image\/(jpeg|png|webp);base64,/.test(look.face) ? look.face : '';
    return p;
  }
  let players = D.defaults.map(rosterEntry);
  try {
    const savedLibrary=JSON.parse(localStorage.getItem(libraryKey)||'null');
    const hasLibrary = Array.isArray(savedLibrary?.players) && savedLibrary.players.length===2;
    const saved=hasLibrary ? savedLibrary.players : JSON.parse(localStorage.getItem(storageKey)||'null');
    if(hasLibrary && Array.isArray(savedLibrary.reserves)) reserves=reserves.map((_,i)=>{
      const bank={};
      for(const [body,character] of window.ArenaManifest.characters.entries()){
        const p=savedLibrary.reserves[i]?.[character.id];
        if(p && p.body===body) bank[character.id]=rosterEntry(p,i);
      }
      return bank;
    });
    for (const [body, ch] of characters.entries()) {
      const profile = savedLibrary?.profiles?.[ch.id];
      if (profile?.body === body) profiles[ch.id] = rosterEntry(profile, body);
    }
    if (Array.isArray(saved) && saved.length===2) players=saved.map(rosterEntry);
    else {
      // The previous game shared this browser origin. Keep edited characters but
      // replace untouched starter slots with the new roster.
      const old=JSON.parse(localStorage.getItem('roomie-rumble-roster-v1')||'null');
      if(Array.isArray(old) && old.length===2) old.forEach((p,i)=>{
        if(!p || typeof p!=='object') return;
        // Only recognize a complete, unmodified old starter. Older schemas or an
        // edited prompt/stat/look are retained rather than mistaken for a default.
        const story=i?'寝室羽毛球队长，连丢纸团都要先瞄准三秒。':'他每次说「我到楼下了」，其实才刚穿好拖鞋。';
        const first=i?'《隔桌空投》用远程飞行道具抢先出手。前摇 0.2 秒，冷却 4 秒，威力 14。':'《我到楼下了》前摇半秒，然后向前突进。冷却 5 秒，威力 16。';
        const second=i?'《网前扑杀》跨步扑到对手面前，挥拍追击。':'《闹钟轰炸》抄起枕边的闹钟，震开身边的对手。';
        const oldSecond=i?{name:'网前扑杀',kind:'dash',power:15,cooldown:5,delay:.13}:{name:'闹钟轰炸',kind:'burst',power:18,cooldown:6,delay:.16};
        const expectedSkills=[D.compile(first,story,i), D.compile({...oldSecond,prompt:second},story,i)];
        const equalFields=(actual,expected)=>Object.entries(expected).every(([key,value])=>actual?.[key]===value);
        const starter=p.name===(i?'小羽':'阿迟')&&p.story===story&&p.body===i&&!p.appearance&&
          p.mechanism===first&&p.mechanism2===second&&equalFields(p.look,D.defaults[i].look)&&
          equalFields(p.skill,expectedSkills[0])&&equalFields(p.skill2,expectedSkills[1]);
        if(!starter) players[i]=rosterEntry(p,i);
      });
    }
  } catch { /* Keep the two playable defaults when the browser cannot read the roster. */ }
  function workshopProfile(body) {
    const id = characters[body].id;
    const stored = profiles[id] || players.find(p => p.body === body) || reserves[0][id] || reserves[1][id];
    return stored || rosterEntry(D.defaults[body] || window.DormKit.rosterPlayer(body), body);
  }
  characters.forEach((c,body)=>{
    const edited=HeroLibrary.edits[c.id];if(!edited)return;
    const stored=workshopProfile(body), look={...stored.look};
    if(edited.blobs?.sheet)look.face='';
    const profile={...stored,name:edited.name,story:edited.story,look};
    for(const slot of slots){profile[slot.skill]=edited[slot.skill];profile[slot.mechanism]=edited[slot.skill].prompt;}
    profiles[c.id]=profile;
    players=players.map(p=>p.body===body?copy(profile):p);
  });
  const drafts = characters.map((_, body) => copy(workshopProfile(body)));
  let selected=players[0].body, mode='cpu', page='lobby', session=null, paused=false, result=null, posterFrame=0;
  let touch=null, rooms=null, networkRound=0, lanPaused=false;
  const getCanvas=id=>$(id).getContext('2d');
  function persistRoster() {
    try {
      localStorage.setItem(libraryKey,JSON.stringify({players,reserves,profiles}));
      return true;
    } catch {return false;}
  }
  window.ArenaPreviewFighter=(seat,id)=>{
    const body=window.ArenaManifest.characters.findIndex(ch=>ch.id===id);
    if(body<0 || (seat!==0 && seat!==1))return null;
    if(profiles[id])return copy(profiles[id]);
    if(players[seat].body===body)return copy(players[seat]);
    const preset=D.defaults[body] || window.DormKit.rosterPlayer(body);
    return rosterEntry(reserves[seat][id] || {...preset,body},seat);
  };
  window.ArenaSelectFighter=(seat,id)=>{
    if(page!=='lobby'||(seat!==0 && seat!==1)) return false;
    const body=window.ArenaManifest.characters.findIndex(ch=>ch.id===id);
    if(body<0 || HeroLibrary.hidden.has(id)) return false;
    if(players[seat].body===body) return true;
    const current=players[seat];
    reserves[seat][window.ArenaManifest.characters[current.body].id]=copy(current);
    const next=window.ArenaPreviewFighter(seat,id);
    delete reserves[seat][id];
    players[seat]=next;
    const saved=persistRoster();refreshLobby();
    if(!saved)$('modeNote').textContent='角色已换入。本机存储不可用，当前选择仅在此页面生效。';
    return true;
  };
  const firstVisible=characters.findIndex(c=>!HeroLibrary.hidden.has(c.id));
  players=players.map(p=>HeroLibrary.hidden.has(characters[p.body].id)?copy(workshopProfile(firstVisible)):p);
  selected=players[0].body;
  const fighterButtons = characters.map((character, body) => {
    const button = document.createElement('button');
    button.type='button'; button.setAttribute('aria-label','编辑'+character.name);
    const face=document.createElement('img');
    face.alt=''; face.src=HeroLibrary.urls.get(character.id)?.face || HeroLibrary.urls.get(character.id)?.art || 'assets/select-hd/'+character.id+'-face.webp';
    const name=document.createElement('span'); name.textContent=character.name.replace(/\s*娘$/, '');
    button.append(face,name);
    button.onclick=()=>openEditor(body);
    if(!HeroLibrary.hidden.has(character.id))$('studioRoster').append(button);
    return button;
  });

  function showPage(next) {
    page=next;
    document.body.classList.toggle('fighting',next==='battle');
    for (const id of ['lobby','editor','battle','network']) $(id).hidden=next!==id;
    $('navLobby').classList.toggle('active',next==='lobby');
    $('navLab').classList.toggle('active',next==='editor');
    cancelAnimationFrame(posterFrame);
    if(next==='lobby') {refreshLobby(); posterLoop();}
    window.scrollTo(0,0);
  }
  function drawPoster(t=0) {
    if(page!=='lobby'||$('poster').hidden)return;
    const c=getCanvas('poster'),w=960,h=400;
    art.drawStage(c,w,h,t/1000);
    // Enlarge the foreground fighters for the lobby face-off while keeping the in-game standing line.
    for(const i of [0,1]){
      const x=i?670:291;
      c.save(); c.translate(x,340); c.scale(1.64,1.64); c.translate(-x,-326);
      art.drawFighter(c,{x,y:326,dir:i?-1:1,action:'idle',phase:(t/1850+i*.35)%1,index:i},players[i],t/1000); c.restore();
    }
  }
  let lastPoster=0;
  let training=false, activePlayers=players, audio=null, soundOn=true;
  function posterLoop(t=0){if(page!=='lobby'||$('poster').hidden)return;if(t-lastPoster>80||!t){drawPoster(t);lastPoster=t;}posterFrame=requestAnimationFrame(posterLoop);}
  function refreshLobby() {
    $('slots').replaceChildren();
    players.forEach((p,i)=>{
      const btn=document.createElement('button');btn.className='slot';btn.setAttribute('aria-label','编辑'+(i+1)+'P '+p.name);
      const canvas=document.createElement('canvas');canvas.width=100;canvas.height=94;
      const info=document.createElement('span'),tag=document.createElement('small'),name=document.createElement('strong'),edit=document.createElement('span');
      tag.textContent=(i+1)+'P / '+(!i?'PLAYER 1':mode==='cpu'?'CPU':'PLAYER 2');
      name.textContent=p.name;edit.textContent='编辑 ↗';info.append(tag,name);btn.append(canvas,info,edit);btn.onclick=()=>openEditor(p.body);$('slots').append(btn);
      art.drawPortrait(canvas.getContext('2d'),100,94,p,i);$('posterP'+(i+1)).textContent=(i+1)+'P · '+p.name;
    });
    for(const [id,on] of [['modeCpu',mode==='cpu'],['modeDuo',mode==='duo']]){$(id).classList.toggle('selected',on);$(id).setAttribute('aria-pressed',String(on));}
    $('modeNote').textContent=mode==='cpu'?'你操控 1P，电脑操控 2P。':'两人共用键盘。2P 用方向键走位，也可用顶部数字键出招。';
    window.ArenaRoster={players,mode};
    window.dispatchEvent(new CustomEvent('arena-roster',{detail:window.ArenaRoster}));
    prewarmArt(players);
  }
  const keys=window.DormKeys;
  function renderControls() {
    const rows=$('keyRows');rows.replaceChildren();
    for(const a of keys.actions){
      const tr=document.createElement('tr');
      for(const text of [a.label,keys.list(a,0),keys.list(a,1)]){
        const td=document.createElement('td');td.textContent=text;tr.append(td);
      }
      rows.append(tr);
    }
    [0,1].forEach(seat=>{
      const root=$('lobbyKeys'+(seat+1));root.replaceChildren();
      const label=document.createElement('b');label.textContent=(seat+1)+'P';root.append(label);

      for(const [id,name] of [['attack','普攻'],['skill','一技'],['skill2','二技'],['ultimate','奥义'],['substitute','替身']]){
        const k=document.createElement('kbd');k.textContent=keys.key(id,seat);root.append(k,' '+name+' ');
      }
    });
  }
  function fightHints(fightMode=mode,autoPlay=false) {
    const hint=$('battleHint');hint.replaceChildren();
    if(autoPlay)return;
    const n=training||fightMode==='cpu'?1:2;
    for(let seat=0;seat<n;seat++){
      const row=document.createElement('div'),k=id=>keys.key(id,seat);
      row.textContent=(seat+1)+'P　'+['left','right','up','down'].map(k).join('/')+' 走位　' +
        k('attack')+' 普攻 · '+k('skill')+' 一技能 · '+k('skill2')+' 二技能 · '+k('ultimate')+' 奥义 · '+k('substitute')+' 替身 · '+
        k('jump')+' 跳跃 · '+k('guard')+' 防御 · '+k('evade')+' 闪避';
      hint.append(row);
    }
    if(training)hint.append('替身不是召唤：先按住替身，再点「假人反击」练习脱身。训练开场有四点能量，可以直接试奥义。');
  }
  function openEditor(i=selected) {
    if(page==='network'||networkRound)void rooms.leave();
    stopFight(); selected=i; showPage('editor');
    const p=drafts[i], id=characters[i].id, assets=HeroLibrary.urls.get(id);
    fighterButtons.forEach((button,body)=>button.setAttribute('aria-pressed',String(body===i)));
    $('editor').style.setProperty('--seat',characters[i].color);
    $('studioArt').src=assets?.art || p.look?.face || 'assets/select-hd/'+id+'-art.webp';
    $('previewName').textContent=p.name;
    $('heroCurrentStory').textContent=p.story;
    const kit=window.DormKit.forPlayer(p,i);
    $('heroEquipped').replaceChildren();
    for(const [key,label] of [['skill','一技能'],['skill2','二技能'],['ultimate','奥义']]){
      const move=kit[key],row=document.createElement('button');
      row.className='equippedMove';row.type='button';
      const name=document.createElement('strong'), detail=document.createElement('small');
      name.textContent=label+' · '+move.name+' ↗';
      detail.textContent=(labels[move.kind]||'奥义')+'　威力 '+move.power+'　'+(move.cooldown?'冷却 '+move.cooldown+' 秒':'消耗 4 点能量');
      row.append(name,detail);row.onclick=()=>window.editHero('manual',key);$('heroEquipped').append(row);
    }
  }
  function stopFight(){
    window.RuleAuction?.end();
    window.PactUI?.end();
    identityAudio?.stop();
    touch?.destroy();touch=null;
    if(networkRound){rooms?.release();networkRound=0;}
    if(session){session.destroy();session=null;}
    paused=false;lanPaused=false;result=null;
    $('pause').hidden=false;$('resumeOrReplay').hidden=false;$('resumeOrReplay').disabled=false;
    $('toLobby').textContent='返回大厅';$('battleOverlay').hidden=true;
  }
  function overlay(kicker,title,desc,action){$('overlayKicker').textContent=kicker;$('overlayTitle').textContent=title;$('overlayDesc').textContent=desc;$('resumeOrReplay').textContent=action;$('battleOverlay').hidden=false;}
  const hudSides=[0,1].map(seat=>({
    health:$('hp'+seat), pips:$('energy'+seat), cds:$('cd'+seat), combo:$('combo'+seat)
  }));
  let battleKits=[];
  function loadBattleKits(changes){
    battleKits=activePlayers.map((player,i)=>{const kit=window.DormKit.forPlayer(player,i);return changes?.length?window.BalanceCore.localKit(kit,changes):kit;});
    for(const [seat,kit] of battleKits.entries()){
      hudSides[seat].pips.title=kit.ultimate.name+' · 四点发动';
    }
  }
  function updateHud(hud){
    window.dispatchEvent(new CustomEvent('arena-hud',{detail:{hud,players:activePlayers,kits:battleKits,training}}));
    $('clock').textContent=training?'∞':String(hud.time).padStart(2,'0');
    hudSides.forEach((side,i)=>{
      const hp=String(hud.hp[i]);
      if(side.health.parentElement.getAttribute('aria-valuenow')!==hp){
        side.health.style.width=hp+'%';side.health.parentElement.setAttribute('aria-valuenow',hp);
      }
      const charge=hud.energy[i], chain=hud.combo[i];
      if(side.pips.dataset.charge!==String(charge)){
        side.pips.dataset.charge=String(charge);
        side.pips.setAttribute('aria-label','奥义点 '+charge+' / 4');
        Array.from(side.pips.children).forEach((pip,n)=>pip.classList.toggle('full',n<charge));
      }
      const kit=battleKits[i];
      const skillState=(skill,time)=>skill.name+' '+(time>0?Math.ceil(time)+'s':'就绪');
      const sub= hud.subCd[i]>0 ? Math.ceil(hud.subCd[i])+'s' : charge<1 ? '需 1 点' : hud.canSub[i] ? '可脱身！' : '待受击';
      const cool=skillState(kit.skill,hud.cd[i])+' · '+skillState(kit.skill2,hud.cd2[i])+' · 替身 '+sub;
      if(side.cds.textContent!==cool)side.cds.textContent=cool;
      side.combo.hidden=chain<2;
      if(chain>=2)side.combo.textContent=chain+' 连击';
    });
    const cue=$('duelCallout'), callout=hud.callout||'';
    if(cue.textContent!==callout){
      cue.textContent=callout;cue.hidden=!callout;
      cue.classList.toggle('finisher',callout.startsWith('奥义'));
      cue.classList.toggle('ko',callout==='K.O.');
    }
    touch?.updateHud(hud,activePlayers);
  }
  let identityAudio=null;
  function ensureAudio(){
    if(window.ArenaAudio){identityAudio ||= window.ArenaAudio.create();identityAudio.setEnabled(soundOn);if(soundOn)identityAudio.unlock();return;}
    if(!soundOn)return;
    try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;if(!audio)audio=new Audio();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}
  }
  function sound(event){
    if(!soundOn)return;if(identityAudio){identityAudio.play(event);return;}
    const key=typeof event==='string'?event:event?.key;
    if(!soundOn||!audio||audio.state!=='running')return;
    const presets={hit:[145,45,.10,'triangle'],guard:[310,135,.10,'square'],skill:[158,660,.19,'sawtooth'],start:[330,660,.24,'square'],end:[295,82,.38,'triangle']};
    const spec=presets[key];if(!spec)return;
    const [from,to,duration,wave]=spec,t=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
    osc.type=wave;osc.frequency.setValueAtTime(from,t);osc.frequency.exponentialRampToValueAtTime(to,t+duration);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(key==='hit'?.16:.052,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  $('sound').onclick=()=>{soundOn=!soundOn;identityAudio?.setEnabled(soundOn);$('sound').textContent='音效 '+(soundOn?'开':'关');$('sound').setAttribute('aria-pressed',String(soundOn));if(soundOn){ensureAudio();sound('guard');}};
  $('testSkill').onclick=()=>{workshopTraining=true;startFight(true);};
  let workshopTraining=false;
  function chooseTrainingPair(){
    lobby();
    window.ArenaShell?.show('menu');
    window.ArcadeSelect.open('training');
  }
  function exitTraining(){if(workshopTraining)openEditor(selected);else chooseTrainingPair();}
  for(const [id,action] of [['trainingCast','skill'],['trainingCast2','skill2'],['trainingUltimate','ultimate']]){
    $(id).onclick=()=>session?.tryMove(action);
  }
  $('dummyStrike').onclick=()=>{if(training&&!paused)session?.input(0,'drill',true);};
  let demoRivalry=null;
  $('game').addEventListener('click',()=>{if(networkRound&&page==='battle'&&window.DuelArt?.loadStatus?.(activePlayers)?.failed)prewarmArt(activePlayers);});
  function prewarmArt(roster){
    window.DuelArt?.preload(roster)?.catch(()=>{});
  }
  function startFight(isTraining=false,demoPlayers=null,pact=null,auctionIds=null){
    stopFight();if(pact)window.PactUI.begin(pact);training=isTraining===true;demoRivalry=demoPlayers;
    const fightMode=training?'training':demoPlayers?'cpu':mode;
    const aiDuel=Boolean(pact||auctionIds);
    const autoPlay=false;
    activePlayers=demoPlayers || (training ? [copy(drafts[selected]),copy(workshopProfile(selected===0?1:0))] : players);
    const balanceChanges=window.BalanceLab?.applied();
    loadBattleKits(balanceChanges);if(!training)$('toLobby').textContent='返回选人';$('dummyStrike').hidden=!training;
    ensureAudio();identityAudio?.reset();showPage('battle');$('pause').disabled=false;$('battleMode').textContent=training?'训练场':fightMode==='cpu'?(aiDuel?'AI 博弈对战':'经典对战'):'双人同屏';
    $('trainingActions').hidden=!training;
    $('exitBattle').textContent=training?'返回工坊':'退出对战';
    $('pause').textContent='暂停';
    activePlayers.forEach((p,i)=>$('hudName'+i).textContent=(i===1&&training?'DUMMY':(i+1)+'P')+' / '+p.name);
    fightHints(fightMode,autoPlay);
    if(!autoPlay)touch=window.DormTouch.mount($('touchControls'),{mode:fightMode,onInput:(...args)=>session?.input(...args)});
    const cfg=window.ArenaSettings?.get?.()||{};
    const difficulty=window.ArenaShell?.difficulty?.()||cfg.difficulty||'normal';
    window.ArenaSessionInput=(seat,action,down,source)=>{if(!training&&fightMode==='cpu'&&seat===1)return;if(training&&seat===1)return;session?.input(seat,action,down,source);};
    window.dispatchEvent(new CustomEvent('arena-match-start',{detail:{players:activePlayers,mode:fightMode,autoPlay,training,pact,auctionIds}}));
    session=window.DormCombat.start($('game'),{players:activePlayers,mode:fightMode,autoPlay,difficulty,pact,balanceChanges,auction:auctionIds?window.RuleAuction.begin(auctionIds,activePlayers,battleKits,difficulty):null,onPactEvent:ev=>window.PactUI.record(ev),onLoad:detail=>window.dispatchEvent(new CustomEvent('arena-load-progress',{detail})),onSound:sound,onHud:updateHud,onEnd:r=>{window.RuleAuction?.matchEnded();touch?.release();result=r;$('pause').disabled=true;
      window.dispatchEvent(new CustomEvent('arena-match-end',{detail:{result:r,players:activePlayers,mode:fightMode,training}}));
      overlay(r.reason==='KO'?'K.O.':'TIME UP',r.winner===null?'平局':activePlayers[r.winner].name+' 获胜',r.reason==='KO'?'对手的体力已经耗尽。':'60 秒结束，按剩余血量结算。','再打一场');}});
  }
  function togglePause(){if(!session||result)return;touch?.release();paused=!paused;session.pause(paused);$('pause').textContent=paused?'继续':'暂停';
    window.dispatchEvent(new CustomEvent('arena-pause',{detail:{paused}}));
    if(paused&&!window.ArenaShell)overlay('PAUSE','对战暂停','继续时，角色将从原位置开打。','继续对战');else $('battleOverlay').hidden=true;}
  const lobby=()=>{if(page==='network'||networkRound||rooms?.inRoom)void rooms.leave();stopFight();showPage('lobby');};
  function backFromRoom(){
    lobby();window.ArenaShell?.show('menu');window.ArcadeSelect.open('online');
  }
  $('resumeOrReplay').onclick=()=>{if(networkRound){if(result&&rooms.seat===0)void rooms.start();return;}if(result)startFight(false,demoRivalry);else togglePause();};$('pause').onclick=togglePause;$('toLobby').onclick=()=>{const reselect=!networkRound&&!training;lobby();if(reselect)pickForFight();};$('exitBattle').onclick=()=>{if(training&&!networkRound)exitTraining();else lobby();};
  window.ArenaStartSelected = (ids, fightMode, pact=null, auction=false) => {
    if (page !== 'lobby' || !['cpu','duo','training'].includes(fightMode) || !Array.isArray(ids) || ids.length !== 2 ||
        ids.some(id=>HeroLibrary.hidden.has(id)||!window.ArenaManifest.characters.some(c=>c.id===id))) return false;
    if(fightMode==='training'){
      workshopTraining=false;
      startFight(true,ids.map((id,seat)=>window.ArenaPreviewFighter(seat,id)));
      return true;
    }
    mode=fightMode;
    ids.forEach((id,seat)=>window.ArenaSelectFighter(seat,id));
    refreshLobby();
    startFight(false,null,fightMode==='cpu'?pact:null,auction&&fightMode==='cpu'?ids:null);
    return true;
  };
  // 供新界面层调用的入口。
  window.ArenaApp={
    get page(){return page;},
    get mode(){return mode;},
    setMode(next){if(['cpu','duo'].includes(next)){mode=next;refreshLobby();}},
    get players(){return players;},
    training:chooseTrainingPair,
    restartTraining(){if(training)startFight(true,activePlayers.map(copy));},
    workshop(body=selected){openEditor(characters[body]&&!HeroLibrary.hidden.has(characters[body].id)?body:selected);}, get editorProfile(){return copy(drafts[selected]);}, get editorBody(){return selected;},
    requestPlea(){return !paused && session?.requestPlea();},
    renounce(id){return !paused && session?.renounce(id);},
    answerPlea(accept,terms){return session?.answerPlea(accept,terms);},
    retryArt(){session?.retryArt();},
    online(){rooms.open('choose');},
    backFromRoom,
    lobby,
    replay(){if(result&&!networkRound)startFight(false,demoRivalry);},
    togglePause,
    get paused(){return paused;},
    get inNetwork(){return Boolean(networkRound);},
    setSound(on){soundOn=Boolean(on);identityAudio?.setEnabled(soundOn);$('sound').textContent='音效 '+(soundOn?'开':'关');if(soundOn)ensureAudio();},
    setVolume(v){identityAudio?.setVolume(v);},
    help
  };
  function pickForFight(){window.ArcadeSelect?.open();}
  $('start').onclick=pickForFight;$('modeCpu').onclick=()=>{mode='cpu';refreshLobby();};$('modeDuo').onclick=()=>{mode='duo';refreshLobby();};
  if($('arenaTrain')) $('arenaTrain').onclick=()=>window.ArenaApp.training();
  if($('arenaSwap')) $('arenaSwap').onclick=()=>{
    players.reverse(); reserves.reverse();
    refreshLobby();
    persistRoster();
  };
  $('modeOnline').onclick=()=>rooms.open('choose');
  $('backLobby').onclick=$('navLobby').onclick=lobby;
  $('navLab').onclick=()=>openEditor(selected);$('brand').onclick=e=>{e.preventDefault();lobby();};
  function help(){if(networkRound){touch?.release();rooms.release();}if(session&&!paused&&!result)togglePause();$('helpDialog').showModal();}
  $('help').onclick=$('moreKeys').onclick=help;$('closeHelp').onclick=()=>$('helpDialog').close();
  document.addEventListener('keydown',e=>{
    if(e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]'))return;
    if(page==='battle'&&!networkRound&&e.key==='Escape'){e.preventDefault();togglePause();return;}
    if(window.ArenaShell)return;
    if(page!=='lobby'||e.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName))return;
    if(['KeyA','KeyD','ArrowLeft','ArrowRight'].includes(e.code)){
      e.preventDefault();
      const next=['KeyA','ArrowLeft'].includes(e.code)?'cpu':'duo';
      if(next!==mode){mode=next;refreshLobby();}
    }else if(e.code==='KeyJ'||(e.code==='Enter'&&!e.target?.closest?.('button,a'))){
      e.preventDefault();pickForFight();
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&session&&!paused&&!result)togglePause();});
  window.addEventListener('dorm-art-ready',()=>{if(page==='lobby'){refreshLobby();drawPoster();}});
  rooms=window.DormRooms.mount({
    players:()=>players,back:backFromRoom,unlockAudio:ensureAudio,resetAudio:()=>identityAudio?.reset(),sound,
    showRoom(){stopFight();showPage('network');window.ArenaShell?.show('page');},
    match(roster,seat,round,label){
      if(!(networkRound===round&&page==='battle')){
        stopFight();networkRound=round;training=false;activePlayers=roster;loadBattleKits();$('dummyStrike').hidden=true;
        window.DuelArt?.trimCache?.(roster);prewarmArt(roster);ensureAudio();
        showPage('battle');$('battleMode').textContent=label+' · 你是 '+(seat+1)+'P';
        $('trainingActions').hidden=true;$('pause').hidden=true;$('exitBattle').textContent='离开房间';
        $('toLobby').textContent='离开房间';
        roster.forEach((p,i)=>$('hudName'+i).textContent=(i+1)+'P / '+p.name+(i===seat?'（你）':''));
        fightHints('cpu');
        touch=window.DormTouch.mount($('touchControls'),{mode:'lan',seat,onInput:(i,action,down,source)=>{
          if(!lanPaused&&!result)rooms.input(action,down,source);
        }});
      }
    },
    frame(frame){
      if(page!=='battle'||!networkRound)return;
      window.DormCombat.drawRemote($('game'),activePlayers,frame);updateHud(frame.hud);
      const assets=window.DuelArt?.loadStatus?.(activePlayers);
      if(assets&&assets.loaded<assets.total){
        const canvas=$('game'),c=canvas.getContext('2d');c.save();c.setTransform(canvas.width/960,0,0,canvas.height/400,0,0);
        c.fillStyle='rgba(15,21,33,.94)';c.fillRect(170,155,620,85);c.fillStyle='#fff1d2';c.font='16px sans-serif';c.textAlign='center';
        c.fillText(assets.failed?'动作素材载入失败，点击战场重试':`动作载入 ${assets.loaded}/${assets.total}，请稍候`,480,186);
        c.font='13px sans-serif';c.fillText('联网对局仍在同步；双方载入完成前建议不要开始正式对战。',480,216);c.restore();
      }
    },
    end(finish,seat){
      touch?.release();rooms.release();result=finish;lanPaused=false;
      $('resumeOrReplay').hidden=false;$('resumeOrReplay').disabled=seat!==0;
      overlay(finish.reason==='KO'?'K.O.':'TIME UP',finish.winner===null?'平局':activePlayers[finish.winner].name+' 获胜',
        finish.reason==='KO'?'对手的体力已经耗尽。':'60 秒结束，按剩余血量结算。',seat===0?'再打一场':'等待房主再开');
    },
    networkPause(text){
      if(!networkRound||result)return;lanPaused=true;touch?.release();rooms.release();
      overlay('CONNECTION','等待重新连接',text||'恢复连接后，两人会从暂停位置继续。','');$('resumeOrReplay').hidden=true;
    },
    networkRoute(label,seat){if(page==='battle'&&networkRound&&label)$('battleMode').textContent=label+' · 你是 '+(seat+1)+'P';},
    networkResume(){if(networkRound&&!result){lanPaused=false;$('battleOverlay').hidden=true;$('resumeOrReplay').hidden=false;}},
    error(text){if(networkRound)$('overlayDesc').textContent=text;}
  });
  function lanKey(e){
    if(!networkRound||page!=='battle'||lanPaused||result||$('helpDialog').open)return;
    const bind=keys.bindingFor(e.code);if(!bind || bind[1]==='plea')return;
    if(e.type==='keydown'&&(e.repeat||e.isComposing||e.ctrlKey||e.altKey||e.metaKey))return;
    e.preventDefault();rooms.input(bind[1],e.type==='keydown','key:'+e.code);
  }
  window.addEventListener('keydown',lanKey);window.addEventListener('keyup',lanKey);
  window.addEventListener('arena-keys-changed',()=>{renderControls();if(page==='battle')fightHints(training||networkRound?'cpu':mode);});
  renderControls();showPage('lobby');
  const query=new URLSearchParams(location.search);
  if(query.get('play')==='training')window.addEventListener('hero-app-ready',()=>window.ArenaApp.training(),{once:true});
  else rooms.boot();
})();
