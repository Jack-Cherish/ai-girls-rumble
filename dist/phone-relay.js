/* Bounded room relay. Controls are acknowledged in order; the guest samples only the newest ordinary frame. */
(function (root) {
  'use strict';
  function ArcadePhoneRelay({ticket, request, randomId, onOpen, onDisconnect, onPacket, onClosed, onSignal}) {
    let instance = randomId(), peer = '', generation = 0, started = false, asleep = false;
    let online = false, clock = 0, activeUntil = 0, lastResponse = 0;
    let work = null, queued = [], pending = null, accepted = 0, nextSequence = 0, incoming = 0;
    let newest = null, nextFrame = 0, readFrame = 0, endedRound = null;

    function emptyQueues() {
      queued = []; pending = null; accepted = 0; nextSequence = 0; incoming = 0;
      newest = null; nextFrame = 0; readFrame = 0; endedRound = null;
    }
    function schedule(delay) {
      clearTimeout(clock); clock = 0;
      if (started && !asleep && !work) clock = setTimeout(exchange, delay);
    }
    function disconnect(note) {
      if (!online) return;
      online = false; onDisconnect(note);
    }
    function stop() {
      ++generation; started = false; asleep = false; online = false; work = null;
      clearTimeout(clock); clock = 0; emptyQueues();
    }
    function urgent(packet) {
      return packet.t === 'keys' || packet.t === 'phase' || packet.t === 'ready' || packet.t === 'hello' ||
        packet.t === 'frame' && packet.frame?.result;
    }
    function push(packet) {
      if (!started || !online || asleep || !packet || typeof packet !== 'object' || Array.isArray(packet)) return false;
      if (packet.t === 'frame' && !packet.frame?.result) {
        activeUntil = Date.now() + 1600;
        newest = {seq:++nextFrame, packet};
        return true;
      }
      if (packet.t === 'keys' || packet.t === 'phase') activeUntil = Date.now() + 1600;
      if (packet.t === 'phase' || packet.t === 'frame') newest = null;
      // A newer heartbeat/hello carries the same current state; key transitions must stay distinct.
      if ((packet.t === 'presence' || packet.t === 'hello') && queued.at(-1)?.t === packet.t) queued.pop();
      if (queued.length >= 256) return false;
      queued.push(packet);
      if (!work && urgent(packet)) schedule(10);
      return true;
    }
    function prepareBatch() {
      if (pending || !queued.length) return;
      let size = 0;
      const packets = [];
      while (queued.length && packets.length < 48) {
        const n = new TextEncoder().encode(JSON.stringify(queued[0])).byteLength + 1;
        if (size+n > 700000 && packets.length) break;
        const packet = queued.shift();
        if (n > 700000) continue;
        packets.push(packet); size += n;
      }
      if (packets.length) pending = {seq:++nextSequence, packets};
    }
    function accept(result) {
      const nextPeer = typeof result.peer === 'string' ? result.peer : '';
      if (nextPeer !== peer) {
        disconnect('另一部手机正在重连。');
        emptyQueues(); peer = nextPeer;
        // The server applies acknowledgements only after the requesting phone identifies this peer.
        // The first response can still compute its counters against the earlier peer.
        if (peer && result.online) { online = true; onOpen(); }
        return;
      }
      if (!peer || !result.online) {
        disconnect('另一部手机暂时离线，对战已暂停。');
        return;
      }
      if (!online) { online = true; onOpen(); }
      accepted = Math.max(accepted, Number(result.accepted) || 0);
      if (pending && (Number(result.acked) || 0) >= pending.seq) pending = null;
      const b = result.batch;
      if (b && Number.isSafeInteger(b.seq) && b.seq > incoming && Array.isArray(b.packets)) {
        for (const packet of b.packets) {
          if (packet.t === 'phase' && endedRound !== packet.round) endedRound = null;
          if (packet.t === 'frame' && packet.frame?.result) endedRound = packet.round;
          onPacket(packet);
        }
        incoming = b.seq;
      }
      const f = result.frame;
      if (f && Number.isSafeInteger(f.seq) && f.seq > readFrame && Number.isSafeInteger(f.after) && f.after <= incoming) {
        // A previously unseen pre-KO picture may arrive alongside the reliable final frame.
        if (endedRound !== f.packet?.round) onPacket(f.packet);
        readFrame = f.seq; activeUntil = Date.now() + 1600;
      }
    }
    async function exchange() {
      if (!started || asleep || work) return;
      const mark = generation, lock = {}; work = lock;
      const body = {...ticket, instance, peer, ack:incoming, afterFrame:readFrame};
      if (peer) {
        prepareBatch();
        if (pending && accepted < pending.seq) body.batch = pending;
        if (newest && !queued.length) body.frame = {...newest, after:nextSequence};
      }
      let delay = 230;
      try {
        const result = await request('relay', body);
        if (mark !== generation) return;
        if (body.frame && newest?.seq === body.frame.seq) newest = null;
        lastResponse = Date.now();
        accept(result);
        delay = peer && online ? Date.now() < activeUntil ? 115 : 260 : 420;
        if (result.batch || (queued.length && !pending)) delay = 35; // flush an ACK or queued control promptly
      } catch (e) {
        if (mark !== generation) return;
        if ([401,403,404,410].includes(e?.status)) {
          stop(); onClosed('房间已关闭或已过期，请重新建房。'); return;
        }
        if (e?.status === 409) {
          stop(); onClosed('这个座位已在另一个页面重新连接，请回到原来的游戏页面。'); return;
        }
        if (Date.now()-lastResponse > 3500) {
          disconnect('网络暂时中断，对战暂停，正在重试。');
          onSignal('暂时联系不到联机服务，恢复网络后会自动重连。');
        }
        delay = 650;
      } finally {
        if (work === lock) work = null;
        if (mark === generation) schedule(delay);
      }
    }
    function suspend() {
      if (!started || asleep) return;
      asleep = true; ++generation; work = null; clearTimeout(clock); clock = 0;
      disconnect('页面已切到后台，对战已暂停。');
      request('relay', {...ticket, instance, peer, ack:incoming, afterFrame:readFrame, away:true}, true).catch(() => {});
    }
    function resume() {
      if (!started || !asleep) return;
      asleep = false; lastResponse = Date.now(); schedule(0);
    }
    return {
      start() { if (!started) { started = true; lastResponse = Date.now(); schedule(0); } },
      isOpen:() => started && online && !asleep, send:push, suspend, resume, stop
    };
  }
  root.ArcadePhoneRelay = ArcadePhoneRelay;
})(typeof window === 'undefined' ? globalThis : window);
