/* Try same-Wi-Fi WebRTC, then use the bounded room relay when the two browsers cannot connect. */
(function (root) {
  'use strict';

  const maxPacket = 900000;
  const chunkLength = 3000;
  const maxChunks = Math.ceil(maxPacket / chunkLength);
  const blockedHint = '两台手机还没连通。请连同一 Wi-Fi；校园网或访客网络可能隔离设备，可以一起连接手机热点。保持此页打开，会自动重试。';

  function randomId(bytes = 12) {
    const id = new Uint8Array(bytes);
    root.crypto.getRandomValues(id);
    return Array.from(id, value => value.toString(16).padStart(2, '0')).join('');
  }

  function validTicket(value) {
    return value && /^[0-9]{6}$/.test(value.room) && /^[a-zA-Z0-9_-]{12,160}$/.test(value.token) &&
      (value.seat === 0 || value.seat === 1);
  }

  function available() {
    return (typeof root.RTCPeerConnection === 'function' || typeof root.ArcadePhoneRelay === 'function') &&
      typeof root.fetch === 'function' && Boolean(root.crypto?.getRandomValues);
  }

  function ArcadePhoneLink(options = {}) {
    const key = options.storageKey || 'roomie.mobile-link.v1';
    const base = options.base || '/pair/';
    const clock = () => Date.now();
    const emit = (name, ...args) => options[name]?.(...args);
    let ticket = null, session = '', cursor = 0, cycle = 0, attempt = null;
    let remoteBoot = '', lastReady = 0, pairingSince = 0, idForPart = 0;
    let pollTimer = 0, pollWork = null, monitor = 0, sleeping = false, busy = false, relay = null;
    let lastNote = '', pendingSignal = new Map(), orphanIce = new Map();

    function notify(message) {
      if (message !== lastNote) { lastNote = message; emit('onSignal', message); }
    }
    function readSaved() {
      try {
        const entry = JSON.parse(root.sessionStorage.getItem(key) || 'null');
        return validTicket(entry?.ticket) ? entry : null;
      } catch { return null; }
    }
    function save() {
      try {
        if (ticket) root.sessionStorage.setItem(key, JSON.stringify({ticket, cursor}));
        else root.sessionStorage.removeItem(key);
      } catch { /* Some mobile private tabs disable storage; the active room still works. */ }
    }
    async function request(route, data, keepalive = false) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      try {
        const response = await root.fetch(base + route, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive,
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: ctrl.signal
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(result.error || result.message || '房间服务暂时没有响应。'), {status:response.status});
        return result;
      } finally { clearTimeout(timer); }
    }
    function claimed(entry) { return ticket === entry && entry !== null; }
    function isTerminal(e) { return [401,403,404,410].includes(e?.status); }

    function signal(message) {
      if (ticket && !sleeping) pendingSignal.set(randomId(), {message, tries:0, sent:false});
    }
    function flush() {
      const current = ticket, generation = cycle;
      for (const [id, job] of pendingSignal) {
        if (job.sent) continue;
        job.sent = true;
        request('send', {...current, id, message:job.message}).then(() => {
          if (generation === cycle) pendingSignal.delete(id);
        }).catch(error => {
          if (generation !== cycle || !claimed(current)) return;
          if (isTerminal(error) || error.status === 409) return endRemote('房间已关闭或已过期，请重新建房。');
          job.sent = false;
          if (++job.tries >= 3) pendingSignal.delete(id); // fresh ready/offer retries supersede it
        });
      }
    }
    function stopAttempt(message) {
      const old = attempt;
      attempt = null;
      if (!old) return;
      old.pc.onconnectionstatechange = old.pc.oniceconnectionstatechange = old.pc.onicecandidate = old.pc.ondatachannel = null;
      if (old.dc) {
        old.dc.onopen = old.dc.onclose = old.dc.onmessage = old.dc.onerror = null;
        try { old.dc.close(); } catch {}
      }
      try { old.pc.close(); } catch {}
      if (old.open && message) emit('onDisconnect', message);
    }
    function stopTimers() {
      clearTimeout(pollTimer); pollTimer = 0;
      clearInterval(monitor); monitor = 0;
    }
    function reset(message) {
      relay?.stop(); relay = null;
      ++cycle; stopTimers(); stopAttempt(); pendingSignal = new Map(); orphanIce = new Map(); pollWork = null;
      ticket = null; cursor = 0; sleeping = false; remoteBoot = ''; lastNote = ''; save();
      if (message) emit('onClosed', message);
    }
    function endRemote(message) { if (ticket) reset(message); }
    function isOpen() { if (relay) return relay.isOpen(); return Boolean(attempt?.open && attempt.dc?.readyState === 'open' && !sleeping); }
    function wireControl(dc, type) { try { dc.send(JSON.stringify(['link', type])); } catch {} }
    function retry(a, text) {
      if (attempt !== a) return;
      stopAttempt(text);
      pendingSignal.clear();
      if (ticket && !sleeping) {
        notify(text);
        lastReady = 0;
        schedulePoll(100);
      }
    }
    function receive(a, raw) {
      if (attempt !== a || typeof raw !== 'string' || raw.length > maxPacket) return;
      let data;
      try { data = JSON.parse(raw); } catch { return; }
      a.lastHeard = clock();
      if (Array.isArray(data)) {
        if (data[0] === 'link') {
          if (data[1] === 'ping') wireControl(a.dc, 'pong');
          if (data[1] === 'leave') endRemote('对方已离开房间。');
          if (data[1] === 'away') retry(a, '对方暂时离开，对战暂停；回到页面后会自动重连。');
          return;
        }
        if (data[0] !== 'part') return;
        const [, id, index, total, fragment] = data;
        if (!Number.isSafeInteger(id) || !Number.isInteger(index) || !Number.isInteger(total) ||
            index < 0 || index >= total || total > maxChunks || typeof fragment !== 'string' || fragment.length > chunkLength) return;
        if (index === 0) a.part = {id, total, pieces:[]};
        const part = a.part;
        if (!part || part.id !== id || part.total !== total || part.pieces.length !== index) return;
        part.pieces.push(fragment);
        if (index + 1 < total) return;
        a.part = null;
        try { data = JSON.parse(part.pieces.join('')); } catch { return; }
      }
      if (data && typeof data === 'object' && !Array.isArray(data)) emit('onPacket', data);
    }
    function bindChannel(a, dc) {
      if (attempt !== a || dc.label !== 'roomie-play' || a.dc) { dc.close(); return; }
      a.dc = dc;
      dc.onopen = () => {
        if (attempt !== a || !ticket || sleeping) return;
        a.open = true; a.lastHeard = clock(); a.lastPing = clock(); lastNote = '';
        emit('onOpen', ticket, 'direct'); schedulePoll(6500);
      };
      dc.onmessage = e => receive(a, e.data);
      dc.onclose = dc.onerror = () => retry(a, '直连暂时中断，对战暂停；正在重新连接。');
    }
    function makeAttempt(epoch) {
      if (attempt) stopAttempt('对方正在重新连接。');
      const pc = new root.RTCPeerConnection({iceServers:[]});
      const a = {pc, epoch, born:clock(), dc:null, open:false, lastHeard:clock(), lastPing:0, part:null, sentSdp:false, earlyIce:[]};
      attempt = a;
      pc.ondatachannel = event => bindChannel(a, event.channel);
      pc.onicecandidate = event => {
        if (attempt === a && a.sentSdp && event.candidate) {
          signal({type:'ice', epoch, candidate:event.candidate.toJSON?.() || event.candidate});
          flush();
        }
      };
      pc.onconnectionstatechange = pc.oniceconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') retry(a, blockedHint);
      };
      return a;
    }
    async function publishDescription(a, description, to) {
      await a.pc.setLocalDescription(description);
      if (attempt !== a) return;
      // Include gathered host candidates in the SDP. Mobile browsers sometimes deliver
      // the first mDNS candidate shortly after this small waiting window; trickle it then.
      if (a.pc.iceGatheringState !== 'complete') await new Promise(resolve => {
        let timer;
        const done = () => { clearTimeout(timer); a.pc.removeEventListener('icegatheringstatechange', changed); resolve(); };
        const changed = () => { if (a.pc.iceGatheringState === 'complete') done(); };
        timer = setTimeout(done, 1200);
        a.pc.addEventListener('icegatheringstatechange', changed); changed();
      });
      if (attempt !== a || sleeping) return;
      const local = a.pc.localDescription;
      a.sentSdp = true;
      signal({type:local.type, epoch:a.epoch, to, sdp:local.sdp});
      flush();
    }
    async function startOffer(boot) {
      const a = makeAttempt(randomId()); remoteBoot = boot;
      try {
        bindChannel(a, a.pc.createDataChannel('roomie-play', {ordered:true}));
        await publishDescription(a, await a.pc.createOffer(), boot);
      } catch { retry(a, '未能发起直连，正在重试。'); }
    }
    async function deliver(msg) {
      if (!ticket || sleeping || !msg || typeof msg !== 'object') return;
      if (msg.type === 'ready' && ticket.seat === 0 && typeof msg.epoch === 'string') {
        if (!attempt || remoteBoot !== msg.epoch) await startOffer(msg.epoch);
        return;
      }
      if (msg.type === 'offer' && ticket.seat === 1 && msg.to === session && typeof msg.sdp === 'string') {
        if (attempt?.epoch === msg.epoch) return;
        const a = makeAttempt(msg.epoch);
        try {
          await a.pc.setRemoteDescription({type:'offer',sdp:msg.sdp});
          for (const candidate of orphanIce.get(msg.epoch) || []) await a.pc.addIceCandidate(candidate).catch(() => {});
          orphanIce.clear();
          await publishDescription(a, await a.pc.createAnswer(), '');
        } catch { retry(a, blockedHint); }
        return;
      }
      const a = attempt;
      if (!a || msg.epoch !== a.epoch) {
        // A late candidate's HTTP upload can beat the SDP upload on slow radios.
        if (ticket.seat === 1 && msg.type === 'ice' && msg.candidate && typeof msg.epoch === 'string') {
          if (!orphanIce.has(msg.epoch)) {
            if (orphanIce.size >= 3) orphanIce.delete(orphanIce.keys().next().value);
            orphanIce.set(msg.epoch, []);
          }
          const queued = orphanIce.get(msg.epoch);
          if (queued.length < 24) queued.push(msg.candidate);
        }
        return;
      }
      if (msg.type === 'answer' && ticket.seat === 0 && !a.pc.remoteDescription && typeof msg.sdp === 'string') {
        try {
          await a.pc.setRemoteDescription({type:'answer',sdp:msg.sdp});
          for (const candidate of a.earlyIce.splice(0)) await a.pc.addIceCandidate(candidate).catch(() => {});
        } catch { retry(a, blockedHint); }
      } else if (msg.type === 'ice' && msg.candidate && typeof msg.candidate === 'object') {
        if (a.pc.remoteDescription) await a.pc.addIceCandidate(msg.candidate).catch(() => {});
        else if (a.earlyIce.length < 24) a.earlyIce.push(msg.candidate);
      }
    }
    function schedulePoll(delay) {
      clearTimeout(pollTimer); pollTimer = 0;
      if (ticket && !sleeping && !relay) pollTimer = setTimeout(poll, delay);
    }
    async function poll() {
      const current = ticket, generation = cycle;
      if (!current || sleeping || relay) return;
      if (pollWork) { schedulePoll(350); return; }
      const lock = {}; pollWork = lock;
      let delay = 700;
      try {
        if (current.seat === 1 && !isOpen() && clock() - lastReady > 4800) {
          signal({type:'ready', epoch:session}); lastReady = clock();
        }
        flush();
        const result = await request('poll', {...current, after:cursor});
        if (generation !== cycle || !claimed(current) || sleeping || relay) return;
        if (result.closed) return endRemote('房间已关闭，请重新建房。');
        if (root.ArcadePhoneRelay && (result.relay || (!isOpen() && result.connected?.every(Boolean) &&
            (options.forceRelay || !root.RTCPeerConnection || pairingSince && clock() - pairingSince >= 7000)))) {
          startRelay(); return;
        }
        if (result.connected?.every(Boolean)) {
          if (!pairingSince) pairingSince = clock();
          if (!isOpen()) notify(clock() - pairingSince > 15000 ? blockedHint : '两位选手已到，正在建立设备直连…');
        } else if (!isOpen()) {
          notify('房间已创建，等另一部手机扫码或输入房号。'); delay = 1100;
        }
        for (const entry of result.messages || []) {
          if (generation !== cycle || !claimed(current) || sleeping) return;
          if (Number.isSafeInteger(entry.id) && entry.id > cursor) {
            await deliver(entry.message);
            if (generation !== cycle || !claimed(current) || sleeping) return;
            cursor = entry.id; save();
          }
        }
        if (isOpen()) delay = 6500;
      } catch (e) {
        if (generation !== cycle || !claimed(current)) return;
        if (isTerminal(e)) return endRemote('房间已关闭或已过期，请重新建房。');
        if (!isOpen()) notify('暂时联系不到房间服务，恢复网络后会自动重试。');
        delay = isOpen() ? 12000 : 2000;
      } finally {
        if (pollWork === lock) pollWork = null;
        if (generation === cycle && ticket && !sleeping) schedulePoll(delay);
      }
    }
    function startRelay() {
      if (relay || !ticket) return;
      ++cycle; pollWork = null;
      stopAttempt('正在切换联机线路。'); stopTimers(); pendingSignal.clear(); orphanIce.clear();
      notify('正在切换到房间中转，两部手机都不需要电脑。');
      relay = root.ArcadePhoneRelay({
        ticket, request, randomId,
        onOpen:() => { lastNote = ''; emit('onOpen', ticket, 'relay'); },
        onPacket:packet => emit('onPacket', packet), onDisconnect:reason => emit('onDisconnect', reason),
        onClosed:endRemote, onSignal:notify
      });
      relay.start();
    }
    function watch() {
      // Mobile policy can stall createOffer/setLocalDescription without rejecting its promise.
      // Make fallback independent of the signaling loop that is waiting on that browser API.
      if (ticket && root.ArcadePhoneRelay && !sleeping && !relay && !isOpen() && pairingSince &&
          clock() - pairingSince >= 7000) { startRelay(); return; }
      const a = attempt;
      if (!a || sleeping) return;
      if (!a.open) {
        if (clock() - a.born > 14000) retry(a, blockedHint);
        return;
      }
      if (clock() - a.lastHeard > 14500) { retry(a, '对方暂时断线，对战暂停；正在重新连接。'); return; }
      if (clock() - a.lastPing >= 3000) { wireControl(a.dc, 'ping'); a.lastPing = clock(); }
    }
    function run() {
      if (!ticket || sleeping) return;
      if (relay) { relay.resume(); return; }
      if (root.ArcadePhoneRelay && (!root.RTCPeerConnection || options.forceRelay)) { startRelay(); return; }
      monitor = setInterval(watch, 900); schedulePoll(0);
    }
    function register(value, after = 0) {
      if (!validTicket(value)) throw new Error('房间服务返回了无效的座位，请重试。');
      ticket = {room:String(value.room), token:value.token, seat:value.seat};
      cursor = after; session = randomId(); remoteBoot = ''; lastReady = 0; pairingSince = 0; ++cycle; lastNote = '';
      save(); emit('onTicket', ticket); run(); return ticket;
    }
    async function claim(route, data) {
      if (!available()) throw new Error('请用 Safari、Chrome 或 Edge 浏览器打开游戏，再进行双机直连。');
      if (busy || ticket) throw new Error('请先离开当前房间。');
      busy = true;
      const gen = cycle, creds = {...data, requestKey:randomId(24)};
      try {
        let result;
        try { result = await request(route, creds); }
        catch (e) { if (e?.status && e.status < 500) throw e; result = await request(route, creds); }
        if (gen !== cycle) {
          if (validTicket(result)) request('leave', result, true).catch(() => {});
          throw new Error('已取消入房。');
        }
        return register(result);
      } finally { busy = false; }
    }
    function suspend() {
      if (!ticket || sleeping) return;
      sleeping = true; ++cycle; stopTimers(); pollWork = null;
      if (relay) { relay.suspend(); return; }
      if (isChannelLive()) wireControl(attempt.dc, 'away');
      stopAttempt('页面已进入后台，对战暂停。');
      pendingSignal.clear(); lastNote = '';
    }
    function resume() {
      if (!ticket || !sleeping) return;
      sleeping = false; session = randomId(); lastReady = 0; pairingSince = 0; remoteBoot = ''; run();
    }
    function isChannelLive() { return attempt?.dc?.readyState === 'open'; }
    function visibility() { if (root.document?.visibilityState === 'hidden') suspend(); else resume(); }
    if (options.autoLifecycle !== false) {
      root.document?.addEventListener('visibilitychange', visibility);
      root.addEventListener?.('pagehide', suspend); root.addEventListener?.('pageshow', resume);
    }
    return {
      create:() => claim('create', {}),
      join:room => claim('join', {room:String(room).trim()}),
      getTicket:() => ticket, savedTicket:() => readSaved()?.ticket || null,
      restore(expectedRoom) {
        if (ticket) return !expectedRoom || ticket.room === String(expectedRoom);
        const saved = readSaved();
        if (!available() || !saved || (expectedRoom && String(expectedRoom) !== saved.ticket.room)) return false;
        register(saved.ticket, Number.isSafeInteger(saved.cursor) ? saved.cursor : 0);
        return true;
      },
      isOpen, transport:() => isOpen() ? relay ? 'relay' : 'direct' : null,
      send(packet) {
        if (relay) return relay.send(packet);
        if (!isOpen() || !packet || typeof packet !== 'object' || Array.isArray(packet)) return false;
        const a = attempt, dc = a.dc;
        if (packet.t === 'frame' && !packet.frame?.result && dc.bufferedAmount > 240000) return false;
        if (dc.bufferedAmount > 2400000) {
          // Rejoin and receive an authoritative snapshot instead of losing the KO or a release.
          retry(a, '连接拥堵，对战暂停；正在重新连接。');
          return false;
        }
        try {
          const data = JSON.stringify(packet);
          if (data.length > maxPacket) return false;
          if (data.length <= chunkLength) dc.send(data);
          else {
            const total = Math.ceil(data.length / chunkLength), id = ++idForPart;
            for (let i = 0; i < total; i++)
              dc.send(JSON.stringify(['part', id, i, total, data.slice(i * chunkLength, (i + 1) * chunkLength)]));
          }
          return true;
        } catch { retry(a, '发送中断，正在重新连接。'); return false; }
      },
      suspend, resume,
      async leave() {
        const former = ticket;
        if (isChannelLive()) wireControl(attempt.dc, 'leave');
        reset();
        if (former) await request('leave', former, true).catch(() => {});
      },
      destroy() {
        if (options.autoLifecycle !== false) {
          root.document?.removeEventListener('visibilitychange', visibility);
          root.removeEventListener?.('pagehide', suspend); root.removeEventListener?.('pageshow', resume);
        }
        relay?.stop(); relay = null;
        ++cycle; stopTimers(); stopAttempt(); pendingSignal.clear(); pollWork = null;
        ticket = null; sleeping = false;
      }
    };
  }
  ArcadePhoneLink.available = available;
  root.ArcadePhoneLink = ArcadePhoneLink;
})(typeof window === 'undefined' ? globalThis : window);
