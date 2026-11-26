/* 游戏外壳：标题 → 主菜单 → 选人 → 对战（全屏 HUD / 暂停 / 结算），外加设置、街机模式、
   手柄与背景音乐。战斗、选人、工坊、联机的原有逻辑全部保留，这里只负责界面流程。 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const app = () => window.ArenaApp;
  const cast = window.ArenaManifest.characters;
  const keys = window.DormKeys;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const artOf = id => HeroLibrary.urls.get(id)?.art || 'assets/select-hd/' + id + '-art.webp';
  const faceOf = id => HeroLibrary.urls.get(id)?.face || HeroLibrary.urls.get(id)?.art || 'assets/select-hd/' + id + '-face.webp';

  /* ---------------- 设置 ---------------- */
  const SETTINGS_KEY = 'ai-arena-settings-v1';
  const defaults = {difficulty:'normal', master:.8, sfx:.8, music:.5, shake:true, hints:true};
  let settings = {...defaults};
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch {}
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };
  window.ArenaSettings = {get: () => ({...settings})};

  /* ---------------- 背景音乐（原创程序合成，无外部音频） ---------------- */
  const music = (() => {
    let ctx = null, out = null, timer = 0, track = '', step = 0, nextAt = 0;
    const TRACKS = {
      menu:  {bpm:96,  root:57, prog:[0,-4,-7,-2], lead:[12,14,15,19,17,15,14,10], bass:'sine',     lead2:'triangle', drums:false},
      select:{bpm:118, root:60, prog:[0,5,-3,-5],  lead:[7,12,14,12,10,7,5,7],     bass:'triangle', lead2:'square',   drums:true},
      battle:{bpm:148, root:52, prog:[0,0,-2,-4],  lead:[12,15,17,19,15,12,10,7],  bass:'sawtooth', lead2:'square',   drums:true},
      win:   {bpm:132, root:60, prog:[0,5,7,12],   lead:[12,16,19,24,19,16,19,24], bass:'triangle', lead2:'triangle', drums:true}
    };
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    function tone(t, note, len, type, gain, dest = out) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(hz(note), t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .012); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + len + .02); o.onended = () => { o.disconnect(); g.disconnect(); };
    }
    function noise(t, len, gain, hp) {
      const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = gain;
      s.connect(f); f.connect(g); g.connect(out); s.start(t); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
    }
    function kick(t) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
      g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + .18);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + .2); o.onended = () => { o.disconnect(); g.disconnect(); };
    }
    function schedule() {
      const T = TRACKS[track]; if (!T || !ctx) return;
      const s16 = 60 / T.bpm / 4;
      while (nextAt < ctx.currentTime + .25) {
        const bar = Math.floor(step / 16) % T.prog.length, i = step % 16, chord = T.root + T.prog[bar];
        if (i % 4 === 0) tone(nextAt, chord - 12, s16 * 3.6, T.bass, .16);
        if (track === 'battle' && i % 2 === 1) tone(nextAt, chord - 12, s16 * .9, T.bass, .07);
        if (i % 2 === 0) tone(nextAt, chord + T.lead[(i / 2 + bar * 3) % T.lead.length], s16 * (track === 'menu' ? 3.4 : 1.7), T.lead2, track === 'menu' ? .045 : .035);
        if (i === 0) for (const n of [0, 4, 7]) tone(nextAt, chord + n, s16 * 15, 'sine', .028);
        if (T.drums) {
          if (i % 4 === 0) kick(nextAt);
          if (i % 8 === 4) noise(nextAt, .12, .16, 1800);
          if (i % 2 === 1) noise(nextAt, .04, .05, 7000);
        }
        nextAt += s16; step++;
        if (track === 'win' && step >= 32) { stop(); return; }
      }
    }
    function ensure() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC(); out = ctx.createGain(); out.connect(ctx.destination); apply(); return true;
    }
    function apply() { if (out) out.gain.setTargetAtTime(settings.master * settings.music * .55, ctx.currentTime, .05); }
    function play(name) {
      if (name === track) return;
      stop(); track = name; if (!name || !ensure()) return;
      ctx.resume().catch(() => {}); step = 0; nextAt = ctx.currentTime + .05; schedule();
      timer = setInterval(schedule, 90);
    }
    function stop() { clearInterval(timer); timer = 0; track = ''; }
    function duck(on) { if (out) out.gain.setTargetAtTime(on ? settings.master * settings.music * .18 : settings.master * settings.music * .55, ctx.currentTime, .1); }
    return {play, stop, apply, duck, unlock() { if (ensure()) ctx.resume().catch(() => {}); }};
  })();
  function applyAudio() {
    music.apply();
    app()?.setSound(settings.master * settings.sfx > 0);
    app()?.setVolume(settings.master * settings.sfx);
  }

  /* ---------------- 统一输入：键盘 + 手柄 → 菜单导航 ---------------- */
  const nav = new Set();
  const onNav = fn => { nav.add(fn); return () => nav.delete(fn); };
  let navEnabled = true;
  function emit(dir) { if (!navEnabled || window.RuleAuction?.modalOpen() || window.PactUI?.modalOpen() || window.ArcadeSelect?.navigate(dir)) return; for (const fn of [...nav].reverse()) if (fn(dir) !== false) break; }
  let captureKey=null;
  window.addEventListener('keydown', e => {
    if(captureKey){
      e.preventDefault();e.stopImmediatePropagation();
      if(!e.repeat&&!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey)captureKey(e.code);
      return;
    }
    if (e.repeat && !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    if (document.querySelector('dialog[open]')) return;
    const map = {ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',
      Enter:'ok',KeyJ:'ok',Space:'ok',Escape:'back',Backspace:'back',KeyK:'back'};
    const dir = map[e.code];
    if (!dir) return;
    if (state === 'battle' && !pauseOpen && !resultOpen) {
      if (dir === 'back' && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); togglePause(); }
      return;
    }
    if (openModalEl && e.code !== 'Escape' && e.target.closest('button,summary,a')) return;
    if (state === 'page' && e.code !== 'Escape') return;
    e.preventDefault(); e.stopImmediatePropagation(); emit(dir);
  }, true);

  // 手柄：菜单里映射成导航；对战中映射成 1P/2P 的按键（标准布局）。
  const pads = {prev: [{}, {}], last: 0};
  const PAD_FIGHT = [['attack',0],['jump',1],['skill',2],['skill2',3],['guard',4],['evade',5],['substitute',6],['ultimate',7]];
  function pollPads(ts) {
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    list.slice(0, 2).forEach((pad, seat) => {
      const prev = pads.prev[seat], now = {};
      const b = i => !!pad.buttons[i]?.pressed;
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      now.left = b(14) || ax < -.5; now.right = b(15) || ax > .5; now.up = b(12) || ay < -.5; now.down = b(13) || ay > .5;
      for (const [action, i] of PAD_FIGHT) now[action] = b(i);
      now.start = b(9); now.back = b(8);
      const fighting = state === 'battle' && !pauseOpen && !resultOpen && !window.PactUI?.modalOpen();
      if (now.start && !prev.start && state === 'battle' && !resultOpen) togglePause();
      if (fighting && session.active) {
        const cpu = app()?.mode === 'cpu' && !session.training;
        if (!(seat === 1 && cpu)) {
          for (const k of Object.keys(now)) if (k !== 'start' && k !== 'back' && now[k] !== !!prev[k]) session.input(seat, k, now[k], 'pad' + seat + k);
        }
      } else if (seat === 0 || state !== 'battle') {
        const edge = (k, d) => { if (now[k] && (!prev[k] || ts - (prev['t' + k] || 0) > 220)) { emit(d); now['t' + k] = ts; } else now['t' + k] = prev['t' + k]; };
        if (now.evade && !prev.evade && selectDialog.open) window.ArcadeSelect.navigate('mode');
        edge('up', 'up'); edge('down', 'down'); edge('left', 'left'); edge('right', 'right');
        if (now.attack && !prev.attack) emit('ok');
        if ((now.jump && !prev.jump) || (now.back && !prev.back)) emit('back');
        if (now.start && !prev.start && state !== 'battle') emit('ok');
      }
      pads.prev[seat] = now;
    });
    requestAnimationFrame(pollPads);
  }
  requestAnimationFrame(pollPads);
  const session = {active:false, training:false, input(seat, action, down, source) {
    // 战斗引擎按当前模式处理手柄输入。
    window.ArenaSessionInput?.(seat, action, down, source);
  }};

  /* ---------------- 界面骨架 ---------------- */
  const root = document.body;
  const pick2 = () => {const ids=HeroLibrary.active().map(c=>c.id);const [first]=ids.splice(Math.floor(Math.random()*ids.length),1);return [first,ids[Math.floor(Math.random()*ids.length)]||first];};

  // 标题
  const title = $('gxTitle');

  // 主菜单
  const MENU = [
    {id:'versus', label:'经典对战', en:'VERSUS', desc:'三局两胜。可选人机对战、双人同屏或好友联机。'},
    {id:'combined', label:'AI 博弈对战', en:'AI DUEL', desc:'选人后谈条件、竞拍规则，再进入对战。也可切换为仅谈判或仅拍卖。'},
    {id:'training', label:'训练场', en:'TRAINING', desc:'木桩不会倒下，奥义点无限。练习连招、防御、替身脱身。'},
    {id:'workshop', label:'角色工坊', en:'WORKSHOP', desc:'改名字、换头像、用自然语言设计自己的招式。'},
    {id:'lab', label:'万局平衡测试', en:'BALANCE LAB', desc:'使用 NSGA-II 运行万局测试，查看对阵热力图和可复现的战斗片段。'},
    {id:'settings', label:'设置', en:'SETTINGS', desc:'难度、音量、画面效果。设置会保存在本机。'},
  ];
  const menu = el('section', 'gx-screen', `
    <div class="gx-art"><div class="gx-halftone"></div><div class="gx-pair"><div class="gx-fighter"><img class="a" alt=""></div><strong class="gx-vs" aria-label="对阵">VS</strong><div class="gx-fighter"><img class="b" alt=""></div></div></div>
    <div class="gx-side">
      <div class="gx-brand">AI 娘<em>大乱斗</em></div><div class="gx-tag">NEURAL CLASH · 综合版</div>
      <ul></ul>
      <div class="gx-desc"><strong></strong><span></span></div>
    </div>
    <div class="gx-hint"><span><i class="gx-kbd">↑↓</i>选择</span><span><i class="gx-kbd">J</i>/<i class="gx-kbd">Enter</i>确认</span><span><i class="gx-kbd">K</i>返回标题</span></div>`);
  menu.id = 'gxMenu'; menu.hidden = true; root.append(menu);
  const menuList = menu.querySelector('ul');
  const menuButtons = MENU.map((m, i) => {
    const li = el('li'), b = el('button', '', `<i>${String(i + 1).padStart(2, '0')}</i><b>${m.label}</b><small>${m.en}</small>`);
    b.type = 'button'; b.onmouseenter = () => setMenu(i); b.onfocus = () => {
      setMenu(i);
      const row=b.getBoundingClientRect(),list=menuList.getBoundingClientRect();
      if(row.top<list.top)menuList.scrollTop+=row.top-list.top;
      else if(row.bottom>list.bottom)menuList.scrollTop+=row.bottom-list.bottom;
    }; b.onclick = () => { setMenu(i); menuGo(); };
    li.append(b); menuList.append(li); return b;
  });
  let menuIndex = 0;
  function setMenu(i) {
    menuIndex = (i + MENU.length) % MENU.length;
    menuButtons.forEach((b, j) => b.classList.toggle('on', j === menuIndex));
    const m = MENU[menuIndex];
    menu.querySelector('.gx-desc strong').textContent = m.en;
    menu.querySelector('.gx-desc span').textContent = m.desc;
  }

  // 面板
  function modal(id, titleText, en) {
    const m = el('div', 'gx-modal');
    m.id = id; m.hidden = true;
    m.innerHTML = `<div class="gx-panel" role="dialog" aria-label="${esc(titleText)}"><header><h2>${esc(titleText)}</h2><small>${esc(en)}</small><button class="gx-x" type="button" aria-label="关闭">✕</button></header><div class="gx-body"></div></div>`;
    root.append(m);
    m.querySelector('.gx-x').onclick = () => closeModal();
    m.addEventListener('click', e => { if (e.target === m) closeModal(); });
    return m;
  }
  const settingsModal = modal('gxSettings', '设置', 'SETTINGS');
  const labModal=modal('gxLab','万局平衡测试','BALANCE LAB');
  const arcadeModal = modal('gxArcade', '街机模式', 'ARCADE');
  let openModalEl = null, modalOff = null, modalReturn = null;
  function showModal(m, onClose) {
    closeModal(true); openModalEl = m; m.hidden = false; modalReturn = onClose || null;
    modalOff = onNav(dir => { if (dir === 'back') closeModal(); return true; });
    m.querySelector('.gx-x').focus();
  }
  function closeModal(silent) {
    captureKey=null;
    if (!openModalEl) return;
    openModalEl.hidden = true; openModalEl = null; modalOff?.(); modalOff = null;
    const r = modalReturn; modalReturn = null; if (!silent) r?.();
  }

  function seg(name, options, value, onChange) {
    const wrap = el('div', 'gx-seg');
    for (const [v, label] of options) {
      const b = el('button', '', esc(label)); b.type = 'button'; b.setAttribute('aria-pressed', String(v === value));
      b.onclick = () => { wrap.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); onChange(v); };
      wrap.append(b);
    }
    return wrap;
  }
  function range(value, onChange) {
    const wrap = el('div', 'gx-range'), input = el('input'), out = el('output');
    input.type = 'range'; input.min = 0; input.max = 100; input.value = Math.round(value * 100); out.textContent = input.value;
    input.oninput = () => { out.textContent = input.value; onChange(input.value / 100); };
    wrap.append(input, out); return wrap;
  }
  function row(label, control) { const r = el('div', 'gx-row'); r.append(el('span', '', esc(label)), control); return r; }
  function buildSettings() {
    const body = settingsModal.querySelector('.gx-body'); body.replaceChildren();
    const set = (k, v) => { settings[k] = v; saveSettings(); applyAudio(); document.body.classList.toggle('gx-noshake', !settings.shake); };
    body.append(
      row('电脑难度', seg('difficulty', [['easy','简单'],['normal','普通'],['hard','困难']], settings.difficulty, v => set('difficulty', v))),
      row('主音量', range(settings.master, v => set('master', v))),
      row('音效', range(settings.sfx, v => set('sfx', v))),
      row('音乐', range(settings.music, v => set('music', v))),
      row('画面震动', seg('shake', [[true,'开'],[false,'关']], settings.shake, v => set('shake', v))),
      row('对战提示', seg('hints', [[true,'显示键位'],[false,'隐藏']], settings.hints, v => set('hints', v))),
      row('全屏', (() => { const b = el('button', 'gx-btn ghost', '切换全屏'); b.type = 'button'; b.onclick = toggleFullscreen; return b; })())
    );
    body.append(window.BalanceLab.importPanel(),window.PactUI.settingsPanel());
    const table = el('table', 'gx-keys');
    table.innerHTML = '<thead><tr><th>动作</th><th>1P</th><th>2P</th><th>手柄</th></tr></thead>';
    const tb = el('tbody');
    const padName = {left:'左摇杆 / 十字键',right:'左摇杆 / 十字键',up:'左摇杆 / 十字键',down:'左摇杆 / 十字键',attack:'A',jump:'B',skill:'X',skill2:'Y',guard:'LB',evade:'RB',substitute:'LT',ultimate:'RT'};
    const note=el('p','gx-bind-note');note.setAttribute('role','status');
    const buttons=[];
    const format=code=>(code.startsWith('Numpad')?'小键盘 ':'')+keys.caption(code);
    const refresh=()=>buttons.forEach(({button,a,seat,slot})=>{
      button.textContent=format(a.codes[seat][slot]);
      button.setAttribute('aria-label',(seat+1)+'P '+a.label+' '+button.textContent);
    });
    for(const a of keys.actions){
      const tr=el('tr');tr.append(el('td','',esc(a.label)));
      for(const seat of [0,1]){
        const td=el('td');
        a.codes[seat].forEach((_,slot)=>{
          const button=el('button','gx-bind');button.type='button';
          buttons.push({button,a,seat,slot});
          button.onclick=()=>{
            refresh();button.textContent='请按键…';note.textContent='按新键，Esc 取消。已占用的键会与原键互换。';
            captureKey=code=>{
              if(code==='Escape'){captureKey=null;refresh();note.textContent='已取消';return;}
              try{
                const used=keys.bindingFor(code),old=a.codes[seat][slot],stored=keys.bind(a,seat,slot,code);
                captureKey=null;refresh();
                note.textContent=(seat+1)+'P '+a.label+' → '+format(code)+(used&&code!==old?'，原占用动作已换为 '+format(old):'')+(stored?'':'（仅本次生效）');
              }catch(error){note.textContent=error.message+'，Esc 取消。';}
            };
          };
          td.append(button);
        });
        tr.append(td);
      }
      tr.append(el('td','',esc(padName[a.id]||'')));tb.append(tr);
    }
    refresh();
    const reset=el('button','gx-btn ghost','恢复默认键位');reset.type='button';
    reset.onclick=()=>{captureKey=null;const stored=keys.reset();refresh();note.textContent='已恢复默认键位'+(stored?'':'（仅本次生效）');};
    table.append(tb);
    const h = el('h3', '', '键位'); h.style.margin = '22px 0 6px';
    note.textContent='点击任一键位，再按想使用的新键。';
    body.append(h, note, table, reset, el('p', '', '<small style="color:var(--gx-muted)">暂停：Esc 或手柄 Start。菜单内可用 WASD / 方向键 / 手柄导航。</small>'));
  }
  /* ---------------- 页面状态机 ---------------- */
  let state = 'title';
  let titleIntroTimer;
  const screens = {title, menu};
  function show(next) {
    clearTimeout(titleIntroTimer);
    state = next;
    title.hidden = next !== 'title'; menu.hidden = next !== 'menu';
    document.body.classList.toggle('gx-page', next === 'page');
    back.hidden = next !== 'page';
    if(next==='page')back.textContent=app()?.page==='network'?'← 返回选人':'← 返回主菜单';
    if (next === 'menu') { music.play('menu'); menuButtons[menuIndex].focus({preventScroll:true}); }
    if (next === 'title') {
      music.play('');
      title.classList.remove('in');
      void title.offsetWidth;
      titleIntroTimer = setTimeout(() => title.classList.add('in'), 60);
    }
  }
  window.ArenaShell = {show: s => show(s), get state() { return state; }, difficulty: () => arcade ? arcade.difficulty : settings.difficulty};

  // 子页面（工坊 / 联机）的返回按钮
  const back = el('button', 'gx-btn ghost', '← 返回主菜单'); back.id = 'gxBack'; back.type = 'button'; back.hidden = true;
  back.onclick = () => { if(app()?.page==='network')return app().backFromRoom(); app()?.lobby(); show('menu'); };
  root.append(back);

  // 标题
  // Y coordinates in each original portrait: crown of the head under accessories,
  // and the bottom of the lowest shoe. Weapons, ears, hats and skirts may extend past them.
  const menuLandmarks = {
    //            face X    crown Y   sole Y   image height
    laoda:   {face:.51, crown:14, sole:493, height:506},
    nailong: {face:.60, crown:12, sole:346, height:357},
    chatgpt: {face:.56, crown:68,  sole:1343, height:1350},
    doubao:  {face:.58, crown:68,  sole:1333, height:1350},
    gemini:  {face:.59, crown:75,  sole:1347, height:1350},
    glm:     {face:.61, crown:55,  sole:1266, height:1272},
    grok:    {face:.41, crown:145, sole:1113, height:1139},
    kimi:    {face:.58, crown:50,  sole:1346, height:1350},
    minimax: {face:.63, crown:60,  sole:1327, height:1350},
    quill:   {face:.51, crown:4,   sole:1347, height:1350},
    qwen:    {face:.57, crown:52,  sole:1337, height:1350},
    tide:    {face:.48, crown:54,  sole:1347, height:1350},
  };
  function heroPair() {
    const [a, b] = pick2();
    title.querySelector('.gx-hero.l').src = artOf(a); title.querySelector('.gx-hero.r').src = artOf(b);
    for(const [selector,id,facesRight] of [['img.a',a,true],['img.b',b,false]]){
      const img=menu.querySelector(selector);
      img.parentElement.classList.toggle('gx-axe',id==='grok');
      const {face:faceCenter,crown,sole,height}=menuLandmarks[id] || {face:.5,crown:0,sole:1,height:1};
      const standingHeight=sole-crown;
      const mirror=SELECT_CAST.find(c=>c.id===id).facesRight!==facesRight;
      img.style.setProperty('--anchor',(-100*(mirror?1-faceCenter:faceCenter))+'%');
      img.style.setProperty('--direction',mirror?-1:1);
      img.style.setProperty('--canvas-height',height/standingHeight);
      img.style.setProperty('--foot-space',(height-sole)/standingHeight);
      img.src=artOf(id);
    }
  }
  heroPair();
  const leaveTitle = () => { music.unlock(); applyAudio(); show('menu'); };
  const startButton = title.querySelector('.gx-press');
  startButton.onclick = leaveTitle;
  startButton.disabled = false;
  title.addEventListener('pointerdown', e => { if (e.target === title || e.target.closest('.gx-band,.gx-halftone,.gx-hero,.gx-logo')) leaveTitle(); });
  onNav(dir => {
    if (state === 'title') { if (dir === 'ok' || dir === 'back') leaveTitle(); return true; }
    if (state === 'menu' && !openModalEl) {
      if (dir === 'up') setMenu(menuIndex - 1);
      else if (dir === 'down') setMenu(menuIndex + 1);
      else if (dir === 'ok') menuGo();
      else if (dir === 'back') show('title');
      menuButtons[menuIndex].focus({preventScroll:true});
      return true;
    }
    if (state === 'page' && dir === 'back' && !openModalEl) { back.click(); return true; }
    return false;
  });

  function menuGo() {
    const id = MENU[menuIndex].id;
    music.unlock();
    if (id === 'combined') { arcade=null; app().setMode('cpu'); window.ArcadeSelect.open(id); music.play('select'); return; }
    if (id === 'versus') { arcade = null; return openSelect(); }
    if (id === 'training') { arcade = null; app().training(); return; }
    if (id === 'workshop') { arcade = null; show('page'); app().workshop(); return; }
    if(id==='lab'){window.BalanceLab.open(labModal.querySelector('.gx-body'));return showModal(labModal,()=>window.BalanceLab.hide());}
    if (id === 'settings') { buildSettings(); return showModal(settingsModal); }
  }

  /* ---------------- 选人（复用原选人界面） ---------------- */
  const selectDialog = $('arcadeSelect');
  function openSelect(forceMode) {
    if (forceMode) app().setMode(forceMode);
    window.ArcadeSelect.open();
    music.play('select');
  }
  selectDialog.addEventListener('close', () => {
    // 选人被关掉而没有开打 → 回主菜单
    setTimeout(() => { if (!window.PactUI?.modalOpen() && !selectDialog.open && app().page !== 'battle' && state !== 'page') { arcade = null; show('menu'); } }, 0);
  });
  $('closeArcadeSelect').textContent = '返回菜单';

  /* ---------------- 街机模式 ---------------- */
  let arcade = null;
  function openArcade() {
    const body = arcadeModal.querySelector('.gx-body'); body.replaceChildren();
    body.append(el('p', '', '<span style="color:#d5d2dc">选择你的斗士，连续击败 5 名对手。第 5 战对手难度提升一档。输掉就结束，可以从当前关卡重试。</span>'));
    const grid = el('div', 'gx-moves');
    HeroLibrary.active().forEach(c => {
      const b = el('button', 'gx-move', `<img src="${faceOf(c.id)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;margin-bottom:8px"><h4>${esc(c.name)}</h4><small>${esc(c.role)}</small>`);
      b.type = 'button'; b.style.cursor = 'pointer'; b.style.textAlign = 'left'; b.style.color = 'inherit'; b.style.borderColor = c.color;
      b.onclick = () => { closeModal(true); startArcade(c.id); };
      grid.append(b);
    });
    grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(120px,1fr))';
    body.append(grid);
    showModal(arcadeModal);
  }
  function startArcade(id) {
    const pool = HeroLibrary.active().map(c => c.id).filter(x => x !== id).sort(() => Math.random() - .5).slice(0, 5);
    if(!pool.length)pool.push(id);
    arcade = {player:id, ladder:pool, stage:0, wins:0};
    nextArcade();
  }
  function nextArcade() {
    const opp = arcade.ladder[arcade.stage];
    const boss = arcade.stage === arcade.ladder.length - 1;
    const base = settings.difficulty;
    arcade.difficulty = boss ? (base === 'easy' ? 'normal' : 'hard') : base;
    app().setMode('cpu');
    window.ArenaStartSelected([arcade.player, opp], 'cpu');
  }

  /* ---------------- 对战 HUD ---------------- */
  const fightbox = document.querySelector('.fightbox');
  // 画布和所有覆盖层放进同一个 2.4:1 的舞台框，HUD 按舞台尺寸缩放，宽屏和窄屏都贴合战场。
  const stageFrame = el('div', 'gx-stage');
  fightbox.insertBefore(stageFrame, $('game'));
  stageFrame.append($('game'), $('duelCallout'));
  const hud = el('div', '', `
    <div class="gxh-top">
      <div class="gxh-side l"><div class="gxh-face"><img alt=""></div><div class="gxh-name"><span></span><small>1P</small></div>
        <div class="gxh-bar"><i class="lag"></i><i class="hp"></i></div><div class="gxh-sub"><div class="gxh-guard"><i></i></div><kbd class="gxh-guard-key" title="防御"></kbd><div class="gxh-wins"></div></div></div>
      <div class="gxh-clock"><b>60</b><small>ROUND 1</small></div>
      <div class="gxh-side r"><div class="gxh-face"><img alt=""></div><div class="gxh-name"><span></span><small>2P</small></div>
        <div class="gxh-bar"><i class="lag"></i><i class="hp"></i></div><div class="gxh-sub"><div class="gxh-guard"><i></i></div><kbd class="gxh-guard-key" title="防御"></kbd><div class="gxh-wins"></div></div></div>
    </div>
    <div class="gxh-mode"></div>
    <div class="gxh-combo l"></div><div class="gxh-combo r"></div>
    <div class="gxh-bottom"><div class="gxh-kit l"></div><div class="gxh-kit r"></div></div>`);
  hud.id = 'gxHud'; hud.hidden = true; stageFrame.append(hud);
  const banner = el('div', '', '<div class="strip"></div><b></b><small></small>'); banner.id = 'gxBanner'; banner.hidden = true; stageFrame.append(banner);
  const loadEl = el('div', '', '<div><b>LOADING</b><div class="bar"><i></i></div><small role="status">载入角色动作…</small><button type="button" hidden>重新载入动作</button></div>'); loadEl.id = 'gxLoad'; loadEl.hidden = true; stageFrame.append(loadEl);
  const pause = el('div', '', '<div class="box"><h2>PAUSE</h2></div>'); pause.id = 'gxPause'; pause.hidden = true; fightbox.append(pause);
  const resultEl = el('div', '', `<div class="bg"><div class="gx-halftone"></div></div><img alt="">
    <div class="info"><small></small><h2></h2><div class="quote"></div><div class="stats"></div><div class="acts"></div></div>`);
  resultEl.id = 'gxResult'; resultEl.hidden = true; fightbox.append(resultEl);

  const sides = [0, 1].map(i => {
    const s = hud.querySelector(i ? '.gxh-side.r' : '.gxh-side.l');
    return {face:s.querySelector('img'), name:s.querySelector('.gxh-name span'), tag:s.querySelector('.gxh-name small'),
      hp:s.querySelector('.hp'), lag:s.querySelector('.lag'), guard:s.querySelector('.gxh-guard'), guardBar:s.querySelector('.gxh-guard i'), guardKey:s.querySelector('.gxh-guard-key'),
      wins:s.querySelector('.gxh-wins'), kit:hud.querySelector(i ? '.gxh-kit.r' : '.gxh-kit.l'), combo:hud.querySelector(i ? '.gxh-combo.r' : '.gxh-combo.l'),
      lagValue:1, lagHold:0, shown:-1};
  });
  const clockB = hud.querySelector('.gxh-clock b'), clockS = hud.querySelector('.gxh-clock small'), modeEl = hud.querySelector('.gxh-mode');
  let match = null;

  function skillTile(label, key, cls, full) {
    const t = el('div', 'gxh-skill ' + (cls || ''), `<div class="cd"></div><div class="ic"></div><div class="sec"></div><span class="key"></span>`);
    t.querySelector('.ic').textContent = label; t.querySelector('.key').textContent = key; if (full) t.title = full;
    if (cls === 'ult') t.append(el('div', 'gxh-pips', '<i></i><i></i><i></i><i></i>'));
    return t;
  }
  window.addEventListener('arena-keys-changed',()=>sides.forEach((s,i)=>{
    s.guardKey.textContent=keys.key('guard',i);
    s.kit.querySelectorAll('.key').forEach((label,j)=>{label.textContent=keys.key(['skill','skill2','ultimate','substitute'][j],i);});
  }));
  const short = s => s.length > 3 ? s.slice(0, 2) : s;
  window.addEventListener('arena-match-start', e => {
    const {players, mode, training, autoPlay} = e.detail;
    session.active = true; session.training = training;
    match = {players, mode, training, autoPlay, auctionIds:e.detail.auctionIds, pact:!!e.detail.pact, pactIds:e.detail.pact?.ids?.slice(), kits:players.map((p, i) => window.DormKit.forPlayer(p, i)), stats:[{dmg:0, maxCombo:0}, {dmg:0, maxCombo:0}], lastHp:[100, 100], round:0, start:performance.now()};
    players.forEach((p, i) => {
      const s = sides[i], id = cast[p.body]?.id || 'tide';
      s.face.src = p.look?.face || faceOf(id); s.name.textContent = p.name;
      s.tag.textContent = training ? (i ? 'DUMMY' : '1P') : !autoPlay && i === 1 && mode === 'cpu' ? 'CPU' : (i + 1) + 'P';
      s.lagValue = 1; s.lagHold = 0; s.shown = -1; s.lag.style.transform='scaleX(1)';
      s.kit.replaceChildren();
      const kit = match.kits[i];
      s.kit.append(skillTile(short(kit.skill.name), keys.key('skill', i), 's1', kit.skill.name), skillTile(short(kit.skill2.name), keys.key('skill2', i), 's2', kit.skill2.name),
        skillTile('奥义', keys.key('ultimate', i), 'ult', kit.ultimate.name), skillTile('替身', keys.key('substitute', i), 'sub'));
      s.kit.hidden = i === 1 && (training || mode === 'cpu' && !autoPlay);
      s.guardKey.textContent=keys.key('guard',i);
      s.guardKey.hidden=i===1&&training;
    });
    const diff = {easy:'简单', normal:'普通', hard:'困难'}[arcade ? arcade.difficulty : settings.difficulty];
    hud.classList.toggle('pact-mode',match.pact);
    modeEl.textContent = match.pact || match.auctionIds ? 'AI 博弈对战' : training ? '训练场 · 木桩不会倒下' : arcade ? `街机模式 · 第 ${arcade.stage + 1} / ${arcade.ladder.length} 战 · ${diff}` :
      mode === 'cpu' ? '经典对战 · ' + diff : '经典对战 · 双人同屏';
    hud.hidden = false; resultEl.hidden = true; pause.hidden = true; pauseOpen = false; resultOpen = false;
    state = 'battle'; title.hidden = menu.hidden = true; back.hidden = true; document.body.classList.remove('gx-page');
    music.play('battle'); music.duck(false);
    loadEl.hidden = false; retryArtButton.hidden=true;loadEl.querySelector('small').textContent='载入角色动作…';loadEl.querySelector('.bar i').style.transform = 'scaleX(0)';
    document.body.classList.toggle('gx-hints-off', !settings.hints);
  });

  const retryArtButton=loadEl.querySelector('button');
  retryArtButton.onclick=()=>app().retryArt();
  let lastBannerRound = 0, lastPhase = '';
  window.addEventListener('arena-load-progress', e => {
    const d = e.detail || {};
    loadEl.hidden = d.phase==='ready';
    retryArtButton.hidden = d.phase!=='failed';
    if(d.phase==='ready')return;
    if(d.phase==='failed'){loadEl.querySelector('small').textContent='动作素材载入失败';return;}
    if (d.total) {
      loadEl.querySelector('.bar i').style.transform = `scaleX(${d.loaded / d.total})`;
      loadEl.querySelector('small').textContent = `载入角色动作 ${d.loaded} / ${d.total}`;
    }
  });
  // 选人界面一选中角色就开始预载动作图集，进战斗时通常已经载完。
  const warm = new Set();
  window.ArenaPrewarm = ids => {
    const players = ids.map((id, seat) => ({body: cast.findIndex(c => c.id === id), look: {}}));
    const key = ids.join('+'); if (warm.has(key)) return; warm.add(key);
    window.DuelArt?.preload?.(players)?.catch?.(() => {});
  };
  window.addEventListener('arena-hud', e => {
    const {hud: h} = e.detail; if (!match) return;
    const now = performance.now();
    clockB.textContent = h.training ? '∞' : String(h.time).padStart(2, '0');
    clockB.classList.toggle('warn', !h.training && h.time <= 10);
    if(match.auctionIds)modeEl.textContent='规则拍卖 · '+(h.auctionName||'待竞拍');
    clockS.textContent = h.training ? 'TRAINING' : 'ROUND ' + (h.round || 1);
    for (const i of [0, 1]) {
      const s = sides[i], v = Math.max(0, Math.min(1, h.hp[i] / 100));
      if (v !== s.shown) {
        if (v < s.shown) { match.stats[1 - i].dmg += Math.round((s.shown - v) * 100); s.lagHold = now + 450; }
        s.hp.style.transform = `scaleX(${v})`; s.hp.classList.toggle('low', v <= .25); s.shown = v;
        if (v > s.lagValue) s.lagValue = v;
      }
      const g = (h.guard?.[i] ?? 100) / 100;
      s.guardBar.style.transform = `scaleX(${g})`; s.guard.classList.toggle('crushed', !!h.crushed?.[i]);
      const need = h.roundsToWin || 0;
      if (s.wins.childElementCount !== need) { s.wins.replaceChildren(); for (let k = 0; k < need; k++) s.wins.append(el('i')); }
      [...s.wins.children].forEach((d, k) => d.classList.toggle('on', k < (h.wins?.[i] || 0)));
      const combo = h.combo[i];
      if (combo >= 2) { s.combo.innerHTML = combo + '<small>HITS</small>'; s.combo.classList.add('on'); match.stats[i].maxCombo = Math.max(match.stats[i].maxCombo, combo); }
      else s.combo.classList.remove('on');
      const tiles = s.kit.children, kit = match.kits[i];
      const cdTile = (t, left, total) => {
        const ready = left <= 0; t.classList.toggle('ready', ready);
        t.querySelector('.cd').style.setProperty('--p', ready ? '0turn' : (left / total) + 'turn');
        t.querySelector('.sec').textContent = ready ? '' : Math.ceil(left);
      };
      if (tiles.length === 4) {
        cdTile(tiles[0], h.cd[i], kit.skill.cooldown); cdTile(tiles[1], h.cd2[i], kit.skill2.cooldown);
        const ult = tiles[2]; ult.classList.toggle('ready', h.energy[i] >= 4);
        [...ult.querySelectorAll('.gxh-pips i')].forEach((p, k) => p.classList.toggle('on', k < h.energy[i]));
        cdTile(tiles[3], h.subCd[i], 12);
        tiles[3].classList.toggle('ready', h.subCd[i] <= 0 && h.energy[i] >= 1);
      }
    }
    // 回合开场横幅
    if (h.phase === 'countdown' && h.round !== lastBannerRound && !h.training) {
      lastBannerRound = h.round;
      const final = h.wins && h.wins.every(w => w === (h.roundsToWin || 2) - 1);
      flash(final ? 'FINAL ROUND' : 'ROUND ' + h.round, h.round === 1 ? '三局两胜' : `${h.wins[0]} - ${h.wins[1]}`, 1100);
    }
    if (lastPhase === 'countdown' && h.phase === 'fight' && !h.training) flash('FIGHT!', '', 700);
    if (h.phase === 'ko' && lastPhase !== 'ko') flash(h.endReason === 'KO' ? 'K.O.' : 'TIME UP', '', 1600);
    lastPhase = h.phase;
  });
  // 掉血残影：独立动画，不依赖 HUD 刷新频率。
  (function lagLoop() {
    const now = performance.now();
    for (const s of sides) {
      if (s.shown < 0) continue;
      if (now > s.lagHold && s.lagValue > s.shown) s.lagValue = Math.max(s.shown, s.lagValue - .012);
      s.lag.style.transform = `scaleX(${s.lagValue})`;
    }
    requestAnimationFrame(lagLoop);
  })();
  let bannerTimer = 0;
  function flash(text, sub, ms) {
    banner.querySelector('b').textContent = text; banner.querySelector('small').textContent = sub;
    banner.hidden = true; void banner.offsetWidth; banner.hidden = false;
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { banner.hidden = true; }, reduced.matches ? Math.min(ms, 600) : ms);
  }

  /* ---------------- 暂停 ---------------- */
  let pauseOpen = false, pauseIndex = 0, pauseOff = null;
  const PAUSE_ITEMS = [
    ['继续', () => togglePause()],
    ['设置', () => { buildSettings(); showModal(settingsModal); }],
    ['重新开始', () => { closePauseUI(); if (match?.training) { app().restartTraining(); } else if (arcade) { leaveBattle(); nextArcade(); } else restartSame(); }],
    ['重新选人', () => { const train=match?.training; closePauseUI(); leaveBattle(); if(train)app().training();else if(match?.auctionIds)window.ArcadeSelect.open(match.pact?'combined':'auction');else if(match?.pact)window.ArcadeSelect.open('bargain');else openSelect(); }],
    ['回主菜单', () => { closePauseUI(); leaveBattle(); arcade = null; show('menu'); }]
  ];
  const pauseButtons = PAUSE_ITEMS.map(([label, fn], i) => {
    const b = el('button', '', esc(label)); b.type = 'button';
    b.onmouseenter = () => setPause(i); b.onclick = () => { setPause(i); fn(); };
    pause.querySelector('.box').append(b); return b;
  });
  function setPause(i) { pauseIndex = (i + PAUSE_ITEMS.length) % PAUSE_ITEMS.length; pauseButtons.forEach((b, j) => b.classList.toggle('on', j === pauseIndex)); }
  function togglePause() {
    if (state !== 'battle' || resultOpen || window.RuleAuction?.modalOpen() || window.PactUI?.modalOpen()) return;
    if (app().inNetwork) return;
    app().togglePause();
  }
  window.addEventListener('arena-pause', e => {
    pauseOpen = e.detail.paused; pause.hidden = !pauseOpen; music.duck(pauseOpen);
    if (pauseOpen) { setPause(0); pauseOff = onNav(dir => {
      if (openModalEl) return false;
      if (dir === 'up') setPause(pauseIndex - 1); else if (dir === 'down') setPause(pauseIndex + 1);
      else if (dir === 'ok') PAUSE_ITEMS[pauseIndex][1](); else if (dir === 'back') togglePause();
      return true; }); }
    else { pauseOff?.(); pauseOff = null; closeModal(true); }
  });
  function closePauseUI() { pause.hidden = true; pauseOpen = false; pauseOff?.(); pauseOff = null; closeModal(true); }
  function restartSame() {
    if (!match) return;
    const ids = match.pactIds || match.players.map(p => cast[p.body]?.id);
    leaveBattle(); if(match.pact&&match.auctionIds)return window.PactUI.negotiate(ids,0,null,true); if(match.auctionIds)return window.ArenaStartSelected(match.auctionIds,'cpu',null,true); if(match.pact)return window.PactUI.negotiate(ids); window.ArenaStartSelected(ids, match.mode === 'duo' ? 'duo' : 'cpu');
  }
  function leaveBattle() {
    session.active = false; hud.hidden = true; resultEl.hidden = true; resultOpen = false; banner.hidden = true;
    lastBannerRound = 0; lastPhase = '';
    app().lobby();
  }

  /* ---------------- 结算 ---------------- */
  let resultOpen = false, resultIndex = 0, resultOff = null, resultActs = [];
  const QUOTES = {
    tide:['事已至此，先吃饭吧！','测完告诉我，我去盛饭～','这碗饭是我的胜利奖励！'],
    quill:['这一章，由我来校订。','论证完毕。','请注意，我只是在遵守规则。'],
    chatgpt:['白龙的骄傲，可不是说说而已。','今天的翻译任务也完成了。','还要再来一局吗？'],
    gemini:['双星的轨道，从不出错哦！','喵～是我赢了！','星光为我作证。'],
    grok:['无聊。下一个。','红色的处刑场，很适合你。','规则？那是什么？'],
    kimi:['一曲终了，请回吧。','月光替我记下了这场演奏。','长文本也难不倒我。'],
    doubao:['你说得对！所以是我赢啦！','豆包今天也元气满满！','要不要来点情绪价值？'],
    minimax:['海螺的回响，你听见了吗？','三重奏，完美收尾。','声音会传到很远的地方。'],
    glm:['合卷。','黑白分明，胜负亦然。','这一页，记下了。'],
    qwen:['扇影过处，胜负已分。','风往哪边吹，我就往哪边去。','开源，也可以很强。']
  };
  window.addEventListener('arena-match-end', e => {
    const {result, players, training} = e.detail; if (training || !match) return;
    session.active = false; hud.hidden = true; banner.hidden = true; resultOpen = true;
    const w = result.winner, cpuMode = match.mode === 'cpu';
    const winnerP = w === null ? null : players[w];
    const id = winnerP ? cast[winnerP.body]?.id : null;
    resultEl.classList.toggle('p2', w === 1);
    const img = resultEl.querySelector('img');
    img.hidden = !winnerP; if (winnerP) { img.src = winnerP.look?.face || artOf(id); img.style.animation = 'none'; void img.offsetWidth; img.style.animation = ''; }
    const playerWon = w === 0, wins = result.wins || [0, 0];
    let kicker = w === null ? 'DRAW' : cpuMode ? (playerWon ? 'YOU WIN' : 'YOU LOSE') : (w + 1) + 'P WIN';
    if (arcade) kicker = playerWon ? (arcade.stage + 1 >= arcade.ladder.length ? 'ARCADE CLEAR' : `STAGE ${arcade.stage + 1} CLEAR`) : 'GAME OVER';
    resultEl.querySelector('.info small').textContent = kicker;
    resultEl.querySelector('.info h2').innerHTML = winnerP ? `${esc(winnerP.name)}<em>${wins[0]} - ${wins[1]} · ${result.reason === 'KO' ? 'K.O.' : '判定胜'}</em>` : `平局<em>${wins[0]} - ${wins[1]}</em>`;
    const quotes = QUOTES[id] || ['好险！'];
    resultEl.querySelector('.quote').textContent = winnerP ? '「' + quotes[Math.floor(Math.random() * quotes.length)] + '」' : '「下次一定分出胜负！」';
    const secs = Math.round((performance.now() - match.start) / 1000);
    const st = match.stats;
    resultEl.querySelector('.pact-recap')?.remove();
    if(match.pact||match.auctionIds){
      const recap=document.createElement('p');
      recap.className='pact-recap';recap.textContent=[match.auctionIds&&window.RuleAuction.recap(),match.pact&&window.PactUI.recap()].filter(Boolean).join('　／　');
      resultEl.querySelector('.quote').after(recap);
    }
    resultEl.querySelector('.stats').innerHTML = [
      [`${st[0].dmg} / ${st[1].dmg}`, '伤害 1P / 2P'], [`${st[0].maxCombo} / ${st[1].maxCombo}`, '最大连击'], [`${result.rounds || 1} 局`, `用时 ${secs} 秒`]
    ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
    const acts = resultEl.querySelector('.acts'); acts.replaceChildren();
    resultActs = [];
    const act = (label, fn, ghost) => { const b = el('button', 'gx-btn' + (ghost ? ' ghost' : ''), esc(label)); b.type = 'button'; b.onclick = fn; acts.append(b); resultActs.push(b); };
    if (arcade) {
      if (playerWon && arcade.stage + 1 < arcade.ladder.length) act('下一战 →', () => { arcade.stage++; arcade.wins++; leaveBattle(); nextArcade(); });
      else if (playerWon) act('通关！回主菜单', () => { leaveBattle(); arcade = null; show('menu'); });
      else act('重试本关', () => { leaveBattle(); nextArcade(); });
      act('回主菜单', () => { leaveBattle(); arcade = null; show('menu'); }, true);
    } else {
      act('再来一局', () => { resultEl.hidden = true; resultOpen = false; if(match.pact||match.auctionIds)restartSame();else app().replay(); });
      act('重新选人', () => { leaveBattle(); if(match.auctionIds)window.ArcadeSelect.open(match.pact?'combined':'auction');else if(match.pact)window.ArcadeSelect.open('bargain');else openSelect(); }, true);
      act('回主菜单', () => { leaveBattle(); show('menu'); }, true);
    }
    const setR = i => { resultIndex = (i + resultActs.length) % resultActs.length; resultActs.forEach((b, j) => b.classList.toggle('on', j === resultIndex)); };
    setR(0);
    resultOff?.(); resultOff = onNav(dir => {
      if (!resultOpen) return false;
      if (dir === 'left' || dir === 'up') setR(resultIndex - 1); else if (dir === 'right' || dir === 'down') setR(resultIndex + 1);
      else if (dir === 'ok') resultActs[resultIndex].click();
      return true;
    });
    setTimeout(() => { resultEl.hidden = false; music.play(w === null || (cpuMode && !playerWon) ? '' : 'win'); }, 300);
  });
  // 结算菜单关闭时清理监听
  new MutationObserver(() => { if (resultEl.hidden) { resultOpen = false; resultOff?.(); resultOff = null; } }).observe(resultEl, {attributes:true, attributeFilter:['hidden']});

  /* ---------------- 训练场 / 联机：离开对战时回到菜单 ---------------- */
  // 原「退出对战 / 离开房间」按钮在全屏模式下被隐藏，用暂停菜单代替；联机页面里仍可用。
  const observer = new MutationObserver(() => {
    const p = app()?.page;
    if (p === 'battle') return;
    if (state === 'battle') {
      hud.hidden = true; session.active = false; pause.hidden = true; pauseOpen = false; resultEl.hidden = true;
      if (p === 'editor' || p === 'network') show('page');
      else if (!selectDialog.open) show('menu');
    } else if (state === 'page' && p === 'lobby') {
      // 工坊保存、工坊“返回”、联机“返回”都会回到旧大厅；旧大厅已隐藏，改回主菜单。
      show('menu');
    } else if (state !== 'page' && (p === 'editor' || p === 'network')) {
      show('page');
    }
  });
  ['lobby', 'editor', 'battle', 'network'].forEach(id => observer.observe($(id), {attributes:true, attributeFilter:['hidden']}));

  /* ---------------- 全屏 ---------------- */
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  window.addEventListener('keydown', e => { if (e.code === 'F11') { e.preventDefault(); toggleFullscreen(); } });

  // 训练场“返回”也走暂停菜单；联机对局不能暂停，Esc 打开确认离开。
  window.addEventListener('keydown', e => {
    if (e.code !== 'Escape' || state !== 'battle' || !app()?.inNetwork) return;
    e.preventDefault(); if (confirm('离开联机房间？')) { app().lobby(); show('menu'); }
  });

  document.body.classList.toggle('gx-noshake', !settings.shake);
  const query = new URLSearchParams(location.search);
  const play = query.get('play');
  show(app()?.page === 'network' || play === 'training' || play === 'duel2d' ? 'page' : 'title');
  setMenu(0);
})();
