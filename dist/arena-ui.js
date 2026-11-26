// Select a preset into either live seat while preserving the workshop and network roster.
(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const dialog = get('rosterDialog');
  const tabs = [...dialog.querySelectorAll('[data-seat]')];
  const cast = window.ArenaManifest.characters;
  const mechanics = {dash:'突进', burst:'近身震荡', projectile:'飞行道具', shield:'护盾', heal:'回复', rush:'突进终结', volley:'远程终结'};
  let roster = window.DormDesigner.defaults.slice(0,2);
  let mode = 'cpu';
  let seat = 0;
  let body = 0;
  const seatName = i => i === 0 ? '1P' : mode === 'cpu' ? 'CPU' : '2P';
  const bodyOf = i => cast[roster[i]?.body] ? roster[i].body : i;
  function asset(i,variant) {
    const id = cast[i].id;
    const custom=window.HeroLibrary?.urls.get(id);if(custom)return variant==='face'?(custom.face||custom.art):custom.art;
    const src = id === 'tide' || id === 'quill'
      ? 'duel2d/' + id + '-' + variant + '.webp'
      : 'characters/' + id + '/' + variant + '.webp';
    return window.DormArt.assetURL(src);
  }
  const imageOf = (i,variant) => roster[i]?.look?.face || asset(bodyOf(i),variant);
  const buttons = [];
  const previews = [];
  function putImage(img, src) {
    if (img.getAttribute('src') !== src) img.src = src;
  }
  function syncLobby() {
    roster.forEach((p,i) => {
      putImage(get('heroArt' + i), imageOf(i,'full'));
      get('heroArt' + i).classList.toggle('custom-face',Boolean(p.look?.face));
      putImage(tabs[i].querySelector('img'),imageOf(i,'face'));
      tabs[i].querySelector('span').textContent = seatName(i) + ' · ' + p.name;
    });
    buttons.forEach((button,index) => {
      const labels = [0,1].filter(i => bodyOf(i) === index).map(seatName);
      button.dataset.seats = labels.join(' / ');
      button.classList.toggle('in-match',labels.length > 0);
      button.setAttribute('aria-label',cast[index].name + (labels.length ? '，当前 ' + labels.join('、') : '') + '，查看档案');
    });
  }
  function showProfile() {
    const info=cast[body], owned=bodyOf(seat)===body;
    const p=owned ? roster[seat] : window.ArenaPreviewFighter(seat,info.id);
    tabs.forEach((tab,i) => tab.setAttribute('aria-pressed',String(i===seat)));
    previews.forEach((button,i) => button.setAttribute('aria-pressed',String(i===body)));
    get('profileName').textContent=p.name;
    get('profileSeat').textContent=seatName(seat)+' / '+ (owned ? '已装备' : '待选斗士');
    get('profileRole').textContent=info.role || '';
    get('profileBio').textContent=p.story || info.note || '';
    putImage(get('profileArt'), p.look?.face || asset(body,'full'));
    get('profileArt').alt=p.name+'角色立绘';
    window.dispatchEvent(new CustomEvent('arena-profile',{detail:{id:info.id,customFace:Boolean(p.look?.face)}}));
    get('profileArt').parentElement.style.setProperty('--profile-color', info.color || '#8397b2');
    const moves=get('profileMoves');
    moves.replaceChildren();
    const kit=window.DormKit.forPlayer(p,seat);
    for(const [key,label] of [['skill','一技能'],['skill2','二技能'],['ultimate','奥义']]){
      const skill=kit[key];
      const title=document.createElement('dt'), detail=document.createElement('dd'), stats=document.createElement('small');
      title.textContent=label;
      detail.textContent=skill.name;
      stats.textContent=(mechanics[skill.kind] || '')+' · '+(key==='ultimate'?'4 点':skill.cooldown+' 秒');
      detail.append(stats);
      moves.append(title,detail);
    }
    get('profileChoose').textContent=owned ? '确认阵容' : '设为 '+seatName(seat)+' 出战';
    get('profileEdit').hidden=!owned;
  }
  function open(index,which=0) {
    seat=which;
    body=index;
    showProfile();
    dialog.showModal();
  }
  function makeCastButton(info,index,compact) {
    const button=document.createElement('button'), img=document.createElement('img'), name=document.createElement('span');
    button.type='button';
    img.src=asset(index,'face'); img.alt=''; img.draggable=false;
    name.textContent=info.name.replace(/\s*娘$/,'');
    button.title=info.name;
    button.append(img,name);
    button.addEventListener('click', () => {
      if(compact){body=index;showProfile();}
      else open(index);
    });
    return button;
  }
  cast.forEach((info,index)=>{
    const card=makeCastButton(info,index,false), preview=makeCastButton(info,index,true);
    buttons.push(card); previews.push(preview);
    if(HeroLibrary.hidden.has(info.id))return;
    get('lobbyCast').append(card); get('fighterLibrary').append(preview);
  });
  get('fighterLibrary').hidden=false;
  function selectSeat(i) {
    // Preserve a pending preview when switching its destination.
    const wasCurrent=body===bodyOf(seat);
    seat=i;
    if(wasCurrent) body=bodyOf(seat);
    showProfile();
  }
  tabs.forEach((button,i) => button.addEventListener('click',()=>selectSeat(i)));
  window.addEventListener('arena-roster', event=>{
    if(!Array.isArray(event.detail?.players)||event.detail.players.length!==2)return;
    roster=event.detail.players;mode=event.detail.mode;
    syncLobby();
    if(dialog.open)showProfile();
  });
  get('showRoster').addEventListener('click',()=>window.ArcadeSelect?.open());
  get('posterSelect').addEventListener('click',()=>window.ArcadeSelect?.open());
  get('closeRoster').addEventListener('click',()=>dialog.close());
  get('profileChoose').addEventListener('click',()=>{
    if(body!==bodyOf(seat) && window.ArenaSelectFighter(seat,cast[body].id)===false)return;
    dialog.close();
  });
  get('profileEdit').addEventListener('click',()=>{
    dialog.close();
    get('slots').querySelectorAll('.slot')[seat]?.click();
  });
  get('swapSeats').addEventListener('click',()=>get('arenaSwap').click());
  get('lobbyWorkshop').addEventListener('click',()=>get('navLab').click());
  syncLobby();
})();
