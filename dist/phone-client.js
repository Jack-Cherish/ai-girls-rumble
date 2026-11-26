(() => {
  'use strict';
  const fighterKey = 'roomie-rumble-phone-fighter-v1';

  function createClient(onEvent, defaultPlayer) {
    let game = null;
    let ticket = null;
    let chosen = null;
    const link = window.ArcadePhoneLink({
      onTicket(next) {
        ticket = next;
        if (!chosen) {
          try {
            const saved = JSON.parse(sessionStorage.getItem(fighterKey) || 'null');
            if (saved?.room === next.room && saved.seat === next.seat) chosen = saved.player;
          } catch { /* The roster still has a saved default. */ }
        }
        chosen ||= defaultPlayer(next.seat);
        try { sessionStorage.setItem(fighterKey, JSON.stringify({room: next.room, seat: next.seat, player: chosen})); } catch { /* Optional resume data. */ }
        game?.dispose();
        game = window.DormPeer.createGame({seat: next.seat, player: chosen, onEvent, send: packet => link.send(packet)});
        game.waiting();
      },
      onSignal(message) { if (ticket) onEvent({type: 'signal', message}); },
      onOpen(next, transport) { onEvent({type: 'transport', transport}); game?.opened(); },
      onPacket(packet) { game?.message(packet); },
      onDisconnect(message) { game?.disconnected(message); },
      onClosed(message) { clearGame(); onEvent({type: 'closed', message}); }
    });
    function clearGame() {
      game?.dispose(); game = null; ticket = null; chosen = null;
      try { sessionStorage.removeItem(fighterKey); } catch { /* Optional resume data. */ }
    }
    async function probe() {
      if (location.protocol === 'file:') return {ready: false, reason: 'offline'};
      if (!window.ArcadePhoneLink.available()) return {ready: false, reason: 'browser'};
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5500);
      try {
        const response = await fetch('/pair/info', {cache: 'no-store', credentials: 'same-origin', signal: controller.signal});
        if (!response.ok) return {ready: false, reason: response.status === 404 ? 'unhosted' : 'network'};
        const data = await response.json();
        return data?.available === true ? {ready: true} : {ready: false, reason: 'unhosted'};
      } catch { return {ready: false, reason: 'network'}; }
      finally { clearTimeout(timer); }
    }
    return {
      probe,
      async create(player) { chosen = player; try { return await link.create(); } catch (e) { if (!ticket) chosen = null; throw e; } },
      async join(room, player) { chosen = player; try { return await link.join(room); } catch (e) { if (!ticket) chosen = null; throw e; } },
      restore(room) { return link.restore(room || undefined); },
      async leave() { clearGame(); await link.leave(); },
      start() { if (!game) throw new Error('请先进入房间。'); return game.start(); },
      input(action, down, source) { game?.input(action, down, source); },
      release() { game?.release(); },
      get session() { return ticket; }
    };
  }
  window.DormPhone = { createClient };
})();
