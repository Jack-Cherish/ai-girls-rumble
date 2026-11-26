// Each direction has a separate source so a diagonal can coexist with an attack.
(() => {
  'use strict';
  const mounted = new WeakMap();
  const directions = [
    ['up','▲','向上'], ['left','◀','向左'], ['right','▶','向右'], ['down','▼','向下']
  ];
  const moves = [
    ['jump','跳跃','跳跃'], ['guard','防御','按住防御'], ['evade','闪避','闪避'], ['substitute','替身','替身'],
    ['skill','一技','一技能'], ['skill2','二技','二技能'], ['ultimate','奥义','奥义'], ['attack','普攻','普通攻击']
  ];
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function setText(el, text) { if (el.textContent !== text) el.textContent = text; }

  function mount(container, {mode, seat=0, onInput}) {
    mounted.get(container)?.destroy();
    container.replaceChildren();
    container.classList.add('dorm-pad');
    container.dataset.mode = mode;
    const controls = new Map(), sticks = new Map(), contacts = new Map();
    const listeners = [], timers = new Set(), decks = [];
    let destroyed = false;

    function listen(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      listeners.push(() => target.removeEventListener(type, fn, options));
    }
    for (const player of mode === 'duo' ? [0,1] : [mode === 'lan' ? seat : 0]) {
      const deck = make('div','pad-deck');
      deck.dataset.player = player;
      const prefix = (player + 1) + 'P ';
      deck.setAttribute('role','group');
      deck.setAttribute('aria-label',prefix + '触屏操作');
      const stick = make('div','pad-stick');
      stick.setAttribute('role','group');
      stick.setAttribute('aria-label',prefix + '移动摇杆');
      const stickState = {player, el:stick, owner:null};
      sticks.set(stick,stickState);
      for (const [action, glyph, label] of directions) {
        const button = make('button','pad-dir pad-'+action,glyph);
        button.type = 'button';
        button.setAttribute('aria-label',prefix + label);
        controls.set(button,{player,action,button,stick:stickState});
        stick.append(button);
      }
      const knob = make('span','pad-knob',mode === 'duo' ? prefix.trim() : '');
      knob.setAttribute('aria-hidden','true');
      stick.append(knob);
      const cluster = make('div','pad-action');
      cluster.setAttribute('role','group');
      cluster.setAttribute('aria-label',prefix+'出招');
      const buttons = {};
      for (const [action,caption,label] of moves) {
        const button = make('button','pad-key pad-'+action);
        button.type = 'button';
        button.setAttribute('aria-label',prefix+label);
        const face = make('span','key-face');
        const name = make('b','key-title',caption), hint = make('small','key-hint');
        face.append(name,hint); button.append(face); cluster.append(button);
        controls.set(button,{button,player,action});
        buttons[action] = {button,hint,label};
      }
      deck.append(stick,cluster); container.append(deck);
      decks.push({player,buttons});
    }
    container.append(make('p','pad-rotate',mode === 'duo' ? '双人小屏可从按钮外空白处上下滑动；推荐平板横屏' : '横过手机，可放大擂台'));

    function lookup(target) { return controls.get(target?.closest?.('button')); }
    function emitStick(contact, next) {
      const player = contact.stick.player;
      for (const action of contact.dirs) {
        if (!next.includes(action)) onInput(player,action,false,contact.source+':'+action);
      }
      for (const action of next) {
        if (!contact.dirs.includes(action)) onInput(player,action,true,contact.source+':'+action);
      }
      contact.dirs = next;
    }
    function moveStick(contact,event) {
      const el = contact.stick.el, rect = el.getBoundingClientRect();
      const radius = Math.min(rect.width,rect.height) * .5;
      if (!radius) return;
      const x = (event.clientX - rect.left - rect.width*.5) / radius;
      const y = (event.clientY - rect.top - rect.height*.5) / radius;
      const distance = Math.hypot(x,y), limit = Math.max(1,distance);
      el.style.setProperty('--stick-x', Math.round(x/limit*radius*.51)+'px');
      el.style.setProperty('--stick-y', Math.round(y/limit*radius*.51)+'px');
      const next = [];
      if (distance > .19) {
        if (Math.abs(x)/distance > .3827) next.push(x<0 ? 'left':'right');
        if (Math.abs(y)/distance > .3827) next.push(y<0 ? 'up':'down');
      }
      emitStick(contact,next);
    }
    function press(source,key) {
      if (destroyed || !key || contacts.has(source)) return;
      contacts.set(source,{source,key});
      key.count = (key.count || 0) + 1;
      key.button.classList.add('pressed');
      onInput(key.player,key.action,true,source);
    }
    function finish(source) {
      const contact = contacts.get(source);
      if (!contact) return;
      contacts.delete(source);
      if (contact.stick) {
        emitStick(contact,[]);
        const stick = contact.stick;
        stick.owner = null;
        stick.el.classList.remove('engaged');
        stick.el.style.removeProperty('--stick-x'); stick.el.style.removeProperty('--stick-y');
      } else {
        const {key} = contact;
        if (--key.count === 0) key.button.classList.remove('pressed');
        onInput(key.player,key.action,false,source);
      }
    }
    function release() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const source of [...contacts.keys()]) finish(source);
    }
    listen(container,'pointerdown',event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const source = 'touch:'+event.pointerId, key = lookup(event.target);
      if (contacts.has(source)) return;
      const stick = key?.stick || sticks.get(event.target?.closest?.('.pad-stick'));
      if (!stick && !key) return;
      event.preventDefault();
      if (stick) {
        if (stick.owner !== null) return;
        const contact = {source,stick,dirs:[]};
        stick.owner = source; stick.el.classList.add('engaged'); contacts.set(source,contact);
        moveStick(contact,event);
      } else press(source,key);
      try { container.setPointerCapture(event.pointerId); } catch { /* Window also observes the release. */ }
    },{passive:false});
    listen(container,'pointermove',event => {
      const contact = contacts.get('touch:'+event.pointerId);
      if (contact?.stick) moveStick(contact,event);
    });
    const endPointer = event => finish('touch:'+event.pointerId);
    listen(window,'pointerup',endPointer);
    listen(window,'pointercancel',endPointer);
    listen(container,'lostpointercapture',endPointer);
    listen(container,'contextmenu',event => event.preventDefault());
    listen(container,'keydown',event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      const key = lookup(event.target);
      if (key) { event.preventDefault(); if (!event.repeat) press('touch-key:'+event.code,key); }
    });
    listen(window,'keyup',event => finish('touch-key:'+event.code));
    listen(container,'click',event => {
      if (event.detail !== 0) return;
      const key = lookup(event.target);
      if (!key) return;
      const source = 'touch-assist:'+key.player+':'+key.action;
      if (contacts.has(source)) return;
      press(source,key);
      const timer = setTimeout(() => { timers.delete(timer); finish(source); },100);
      timers.add(timer);
    });
    listen(window,'blur',release); listen(window,'pagehide',release);
    listen(document,'visibilitychange',() => { if (document.hidden) release(); });

    function show(key, hint, state, fraction, description) {
      const stops = Math.round(Math.max(0,Math.min(1,fraction))*36);
      if (key.stops !== stops) { key.stops = stops; key.button.style.setProperty('--shade-angle',stops*10+'deg'); }
      if (key.button.dataset.state !== state) key.button.dataset.state = state;
      if (key.button.title !== description) key.button.title = description;
      setText(key.hint,hint);
    }
    function skillState(key, skill, time) {
      const name = skill?.name || key.label;
      const left = Math.max(0,time||0);
      const hint = left > 0 ? (left > 3 ? Math.ceil(left) : left.toFixed(1))+'s' : name;
      show(key,hint,left>0?'cooling':'',left/Math.max(1,skill?.cooldown||6),key.label+' · '+name);
    }
    function updateHud(hud,roster) {
      if (!hud || destroyed) return;
      for (const deck of decks) {
        const {player,buttons} = deck, row=roster?.[player];
        if (deck.row !== row || !deck.kit) {
          deck.row = row;
          deck.kit = row && window.DormKit?.forPlayer ? window.DormKit.forPlayer(row,player) : row || {};
        }
        const kit = deck.kit, energy = Math.max(0,Math.min(4,hud.energy?.[player]??0));
        skillState(buttons.skill,kit.skill,hud.cd?.[player]);
        skillState(buttons.skill2,kit.skill2,hud.cd2?.[player]);
        const ultName = kit.ultimate?.name || '奥义';
        show(buttons.ultimate,energy>=4?'可释放':energy+' / 4',energy>=4?'ready':'locked',(4-energy)/4,ultName+' · 消耗四点');
        const escape = hud.canSub?.[player], cd=hud.subCd?.[player]||0;
        const hint = cd>0 ? Math.ceil(cd)+'s' : energy<1 ? '缺能量' : escape ? '立即脱身' : '按住待受击';
        show(buttons.substitute,hint,escape?'ready':cd>0?'cooling':'locked',cd/12,'替身 · 受击后使用，或提前按住；消耗 1 点，冷却 12 秒');
        show(buttons.jump,'轻点','',0,'跳跃 · 轻点起跳，移动可同时按住');
        show(buttons.guard,'按住','',0,'防御 · 持续按住，松开结束；只防正面攻击');
        show(buttons.evade,'短闪','',0,'闪避 · 轻点，短冷却期间不能重复释放');
        const combo = hud.combo?.[player]||0;
        show(buttons.attack,combo>1?combo+' 连击':'连按','',0,'普通攻击 · 连按衔接');
      }
    }
    const handle = {release,updateHud,destroy(){
      if (destroyed) return;
      destroyed = true; release();
      for (const remove of listeners) remove();
      container.replaceChildren(); delete container.dataset.mode;
      container.classList.remove('dorm-pad'); mounted.delete(container);
    }};
    mounted.set(container,handle);
    return handle;
  }
  window.DormTouch = {mount};
})();
