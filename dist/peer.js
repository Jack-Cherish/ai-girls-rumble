// The host phone owns the match. The data channel carries inputs and authoritative snapshots.
(() => {
  'use strict';
  const stepsPerSecond = 60;
  const frameMs = 1000 / stepsPerSecond;
  const pulseMs = 1000;
  const silenceLimitMs = 4500;
  const moves = new Set(['left','right','up','down','attack','skill','skill2','ultimate','substitute','jump','guard','evade']);
  const pairOfBooleans = pair => Array.isArray(pair) && pair.length === 2 && pair.every(v => typeof v === 'boolean');
  const pairOfNumbers = pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite);
  function validFrame(f) {
    if (!f || !Number.isFinite(f.elapsed) || !Number.isFinite(f.shake) ||
      !f.hud || !['hp', 'cd', 'cd2', 'energy', 'subCd', 'combo'].every(key => pairOfNumbers(f.hud[key])) ||
      !pairOfBooleans(f.hud.canSub) ||
      !Number.isFinite(f.hud.time) || !Number.isFinite(f.hud.countdown) ||
      !Array.isArray(f.fighters) || f.fighters.length !== 2 ||
      !f.fighters.every((p, i) => p?.index === i && Number.isFinite(p.x) && Number.isFinite(p.y) &&
        Number.isFinite(p.phase) && Number.isFinite(p.depth) && (p.dir === 1 || p.dir === -1) && typeof p.action === 'string')) return false;
    if (!Array.isArray(f.shots) || f.shots.length > 100 || !f.shots.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)) ||
      !Array.isArray(f.effects) || f.effects.length > 160 ||
      !f.effects.every(e => e && Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.life) &&
        e.max > 0 && e.life >= 0 && e.life <= e.max && (e.kind !== 'cast' || e.owner === 0 || e.owner === 1) &&
        (e.kind !== 'ring' || Number.isFinite(e.size) && e.size >= 0)) ||
      !Array.isArray(f.sounds) || f.sounds.length > 12 ||
      !f.sounds.every(s => s && Number.isInteger(s.id) && ['hit','guard','skill','start','end'].includes(s.key) && (s.characterId==null||['tide','quill','chatgpt','gemini','grok','kimi','doubao','minimax','glm','qwen'].includes(s.characterId)) && (s.owner==null||s.owner===0||s.owner===1) && (s.slot==null||['skill','skill2','ultimate','attack','substitute','evade'].includes(s.slot)))) return false;
    return !f.result || ([0,1,null].includes(f.result.winner) && ['KO','时间到'].includes(f.result.reason));
  }

  function createGame({seat, player, send, onEvent}) {
    if (seat !== 0 && seat !== 1) throw new Error('无法识别本机的选手位置。');
    const own = window.DormKit.forWire(player, seat);
    if (!own) throw new Error('选手资料不完整，请重新选择。');
    const host = seat === 0, other = 1 - seat, players = [null, null];
    players[seat] = own;
    let live = false, disposed = false, identified = false, acknowledged = false;
    let peerVisible = false, hostPaused = false, lastSeen = 0;
    let match = null, round = 0, done = false, paused = false;
    let ticks = 0, debt = 0, previous = 0, loop = 0, pulse = 0;
    let inputSerial = 0, remoteSerial = -1;
    const sources = new Map(), held = new Set(), remoteHeld = new Set();
    const visible = () => document.visibilityState !== 'hidden';
    const emit = event => { if (!disposed) onEvent(event); };
    const wire = packet => live && !disposed && send(packet) !== false;
    function lobby() {
      const connected = [false, false];
      connected[seat] = true;
      connected[other] = live && identified && acknowledged && peerVisible;
      emit({type:'lobby', players:players.slice(), connected});
    }
    function hello() { wire({t:'hello', v:2, player:own, visible:visible()}); }
    function available() {
      return live && identified && acknowledged && visible() && peerVisible &&
        performance.now() - lastSeen < silenceLimitMs;
    }
    function releaseAll() {
      sources.clear(); held.clear(); remoteHeld.clear();
      if (match) { match.release(0); match.release(1); }
    }
    function status(force=false) {
      if (!round || done) return;
      const next = !available() || (!host && hostPaused);
      if (next === paused && !force) return;
      paused = next;
      if (paused) releaseAll();
      previous = performance.now(); debt = 0;
      const message = paused ? '等两部手机都回到游戏后，从这里继续。' : '双方已连接，对战继续。';
      emit({type:'status', paused, message});
      if (host) wire({t:'status', round, paused});
    }
    function snapshot() {
      const frame = match.snapshot();
      done = !!frame.result;
      emit({type:'frame', round, frame});
      wire({t:'frame', round, frame});
      if (done) { stopLoop(); releaseAll(); }
    }
    function stopLoop() { clearInterval(loop); loop = 0; }
    function step() {
      const now = performance.now(), dt = Math.min(160, Math.max(0, now - previous));
      previous = now;
      status();
      if (!match || done || paused) return;
      debt += dt;
      while (debt >= frameMs && !done) {
        debt -= frameMs;
        match.step();
        if (++ticks % 3 === 0) snapshot();
      }
    }
    function announceRound() {
      wire({t:'phase', round});
      if (match) { snapshot(); if (!done) status(true); }
    }
    function start() {
      if (!host) throw new Error('请等房主开始对战。');
      if (!available()) throw new Error('请等两部手机都已就位，再开始对战。');
      if (round && !done) return;
      stopLoop(); releaseAll();
      match = window.DormCombat.createMatch(players);
      round++; done = false; paused = false; ticks = 0; debt = 0; previous = performance.now();
      emit({type:'start', players:players.slice(), round});
      announceRound();
      loop = setInterval(step, frameMs);
    }
    function setGuestPhase(r) {
      if (!Number.isSafeInteger(r) || r < 0 || r > 1000000 || !identified) return;
      if (r !== round) {
        round = r; done = false; paused = false; hostPaused = false; releaseAll();
        if (r) emit({type:'start', players:players.slice(), round});
      }
      if (!round) lobby();
    }
    function presence() {
      wire({t:'presence', visible:visible(), round, ended:done, serial:++inputSerial, held:[...held]});
    }
    function remoteInput(packet) {
      if (!match || !round || done || paused || packet.round !== round ||
        !Number.isSafeInteger(packet.serial) || packet.serial <= remoteSerial ||
        !Array.isArray(packet.held) || packet.held.length > moves.size ||
        !packet.held.every(a => moves.has(a))) return;
      remoteSerial = packet.serial;
      const next = new Set(packet.held);
      for (const a of remoteHeld) if (!next.has(a)) { match.input(1, a, false); remoteHeld.delete(a); }
      for (const a of next) if (!remoteHeld.has(a)) { match.input(1, a, true); remoteHeld.add(a); }
    }
    function input(action, down, source) {
      if (!round || !available() || paused || done || !moves.has(action)) return;
      const id = source ?? action;
      let name;
      if (down) {
        if (sources.has(id)) return;
        sources.set(id, action); name = action;
        if (held.has(name)) return;
        held.add(name);
      } else {
        name = sources.get(id);
        if (name === undefined) return;
        sources.delete(id);
        if ([...sources.values()].includes(name)) return;
        held.delete(name);
      }
      if (host) match.input(0, name, Boolean(down));
      else wire({t:'keys', round, serial:++inputSerial, held:[...held]});
    }
    function release() {
      if (!held.size && !sources.size) return;
      held.clear(); sources.clear();
      if (host) match?.release(0);
      else wire({t:'keys', round, serial:++inputSerial, held:[]});
    }
    function visibility() {
      if (!visible()) release();
      presence();
      if (round) status(); else if (live) lobby();
    }
    function repeat() {
      if (!live || disposed) return;
      if (!acknowledged || !identified) hello();
      presence(); status();
    }
    function opened() {
      if (disposed || live) return;
      live = true; identified = false; acknowledged = false; peerVisible = false;
      lastSeen = performance.now(); remoteSerial = -1;
      clearInterval(pulse); pulse = setInterval(repeat, pulseMs);
      hello();
    }
    function disconnected(message) {
      if (disposed) return;
      live = false; identified = false; acknowledged = false; peerVisible = false;
      clearInterval(pulse); pulse = 0; releaseAll();
      if (!round) lobby(); else status();
      emit({type:'connection', connected:false, message:message || '两部手机的连接已中断。'});
    }
    function message(p) {
      if (!live || disposed || !p || typeof p.t !== 'string') return;
      lastSeen = performance.now();
      if (p.t === 'hello') {
        if (p.v !== 2) {
          emit({type:'signal', message:'两端游戏版本不同，请双方刷新游戏页面，再重新建房。'});
          return;
        }
        if (typeof p.visible !== 'boolean') return;
        const peer = window.DormKit.forWire(p.player, other);
        if (!peer) return;
        if (!identified && (!round || !players[other])) players[other] = peer;
        identified = true; peerVisible = p.visible;
        wire({t:'ready'});
        if (acknowledged) ready();
        return;
      }
      if (p.t === 'ready') {
        const first = !acknowledged;
        acknowledged = true;
        if (first && identified) ready();
        return;
      }
      if (!identified) return;
      if (p.t === 'presence') {
        const changed = peerVisible !== (p.visible === true);
        peerVisible = p.visible === true;
        if (round) status(); else if (changed) lobby();
        if (host && acknowledged) {
          if (p.round !== round) announceRound();
          else if (done && !p.ended) wire({t:'frame', round, frame:match.snapshot()});
          else remoteInput(p);
        }
      } else if (p.t === 'keys' && host) remoteInput(p);
      else if (p.t === 'phase' && !host) setGuestPhase(p.round);
      else if (p.t === 'frame' && !host && p.round === round && round && validFrame(p.frame)) {
        done = !!p.frame.result;
        if (done) releaseAll();
        emit({type:'frame', round, frame:p.frame});
      } else if (p.t === 'status' && !host && round && p.round === round && typeof p.paused === 'boolean') {
        hostPaused = p.paused; status();
      }
    }
    function ready() {
      emit({type:'connection', connected:true, message:'两部手机已连接。'});
      if (!round) lobby();
      if (host) announceRound(); else status(true);
    }
    function dispose() {
      if (disposed) return;
      disposed = true; live = false; clearInterval(pulse); stopLoop(); releaseAll(); match = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', release);
    }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', release);
    return {waiting:lobby, opened, message, disconnected, start, input, release, dispose};
  }
  window.DormPeer = {createGame};
})();
