(() => {
  'use strict';
  function mount(ui) {
    const $=id=>document.getElementById(id);
    const query=new URLSearchParams(location.search);
    function readCode(key){const value=query.get(key)||'';return /^\d{6}$/.test(value)?value:'';}
    const invitations={phone:readCode('pair'),lan:readCode('room')};
    let kind='phone', client, intent=0, route='',artLobbyKey='';
    let info=null, probing=false, busy=false, online=false, state=null, round=0, soundId=0, lastResult=false, probeId=0;
    const clients={
      lan:window.DormLAN.createClient(e=>{if(kind==='lan')receive(e);}),
      phone:window.DormPhone.createClient(e=>{if(kind==='phone')receive(e);},index=>getPlayer(index))
    };
    client=clients.phone;
    const phone=()=>kind==='phone';
    function rosterArtKey(players){return JSON.stringify((players||[]).map((p,i)=>[p?.body??i,p?.look?.face||null]));}
    function note(text){$('roomNotice').textContent=text||'';}
    function showRoom(){ui.showRoom();}
    function setBusy(value){busy=value;$('makeRoom').disabled=value;$('joinRoom').disabled=value;updateReady();}
    function updateReady(){
      const ticket=client.session;
      const both=Boolean(state?.connected?.every(Boolean)&&state.connected.length===2);
      $('roomStart').disabled=!ticket||ticket.seat!==0||!both||!online||busy;
      $('roomStart').textContent=!both?'等待另一位选手':ticket?.seat===0?'开始对战 ⟶':'等待房主开战';
      const turn=ticket?.seat===0?'你是 1P。对方就位后，由你开战。':'你是 2P。请保持这个页面打开。';
      $('roomLiveNote').textContent=phone()&&route?turn+' 当前连接方式为'+route+'。':turn;
    }
    function updateInvite(){
      const ticket=client.session;if(!ticket)return;
      if(phone()){
        const url=new URL(location.pathname,location.origin);url.searchParams.set('pair',ticket.room);
        $('addressChoice').hidden=true;drawInvite(url.href);return;
      }
      const select=$('roomHost'),old=select.value;
      const addresses=(info?.urls||[]).filter(v=>typeof v==='string'&&/^https?:\/\//.test(v));
      const isLocal=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
      if(!isLocal&&location.protocol.startsWith('http')&& !addresses.includes(location.origin))addresses.unshift(location.origin);
      select.replaceChildren();
      for(const address of [...new Set(addresses)])select.add(new Option(address,address));
      if(addresses.includes(old))select.value=old;
      else if(addresses.includes(location.origin)) select.value=location.origin;
      $('addressChoice').hidden=addresses.length<2;
      const hasAddress=Boolean(select.value);

      if(hasAddress){
        const url=new URL('/',select.value);url.searchParams.set('room',ticket.room);
        drawInvite(url.href);
      }else drawInvite('');
    }
    function drawInvite(url){
      $('inviteURL').value=url||'请连接 Wi-Fi 后重新打开房间页';
      $('copyInvite').disabled=!url;$('roomQR').hidden=!url;
      if(url)try{window.DormQR.draw($('roomQR'),url);}catch{$('roomQR').hidden=true;}
    }
    function drawSeats(){
      const ticket=client.session;if(!ticket)return;
      $('roomSeats').replaceChildren();
      for(const i of [0,1]){
        const p=state?.players?.[i],row=document.createElement('div'),text=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('small');
        row.className='roomseat';
        if(p){const c=document.createElement('canvas');c.width=92;c.height=96;row.append(c);window.DormArt.drawPortrait(c.getContext('2d'),92,96,p,i);}
        title.textContent=(i+1)+'P · '+(p?.name||'等待加入')+(ticket.seat===i?'（你）':'');
        sub.textContent=p?((state?.connected?.[i]?'已就位':'正在连接')+' · '+(p.skill?.name||'专属技')):'把邀请分享给另一位玩家';
        text.append(title,sub);row.append(text);$('roomSeats').append(row);
      }
    }
    function pane(){
      const ticket=client.session;
      $('network').dataset.kind=kind;$('roomKind').textContent=phone()?'在线':'局域网';
      $('roomSetupTitle').textContent='选择上场选手';
      $('roomSetup').hidden=!!ticket;$('roomLive').hidden=!ticket;$('roomInvite').hidden=!ticket||ticket.seat!==0||(phone()&&state?.connected?.[1]===true);
      $('navLab').disabled=!!ticket;
      $('roomMethodBar').hidden=!!ticket;
      $('roomMethodLabel').textContent=phone()?'在线开房 · 无需电脑主机':'电脑主机开房 · 同一局域网';
      const ready=phone()?info?.ready:!!info;
      $('roomBootstrap').hidden=phone()||ready||probing;
      $('phoneUnavailable').hidden=!phone()||ready||probing;
      $('roomPick').hidden=!ready||probing;
      $('roomBack').textContent=ticket?'离房并返回选人':'← 返回选人';
      if(ticket){$('roomNumber').textContent=ticket.room;drawSeats();if(!$('roomInvite').hidden)updateInvite();updateReady();}
      else{
        if(phone()){
          const reason=info?.reason;
          const messages={offline:'在线开房需要网页服务。也可以点「切换开房方式」选择电脑主机开房，同一 Wi-Fi 下即可对战。',browser:'请用系统浏览器或新版 Chrome 打开在线游戏，或切换到电脑主机开房。',unhosted:'当前页面仅提供本机游戏。可切换到电脑主机开房，或前往在线游戏。',network:'暂时联系不上在线房间。可重新检测，或点「切换开房方式」通过同一 Wi-Fi 的电脑主机对战。'};
          $('roomProbe').textContent=probing?'正在连接房间服务…':ready?'两台设备打开在线游戏，一人建房，另一人扫码或输入房号。':messages[reason]||messages.network;
          const site=$('phoneOnline');site.hidden=true;
          $('phoneRetry').hidden=reason==='offline';
          $('roomSetupHint').textContent='优先直连。直连失败时，游戏服务器会临时转发角色和对战数据。';
        }else{
          $('roomProbe').textContent=probing?'正在检查本机房间服务…':info?'这台电脑的房间服务已就绪。':'先在一台电脑启动主机，手机随后扫码加入。';
          $('roomSetupHint').textContent='两台设备须打开同一台主机提供的网址。手机和电脑都能当选手。';
        }
        const local=location.protocol==='file:';
        $('bundleLocal').hidden=!local;$('hostDownload').hidden=true;
        const select=$('roomPlayer'),was=select.value;
        select.replaceChildren();
        ui.players().forEach((p,i)=>select.add(new Option(p.name+' · '+p.skill.name,String(i))));
        select.value=was||String(invitations[kind]?1:0);
      }
    }
    async function probe(){
      const id=++probeId;probing=true;pane();
      try{const response=await client.probe();if(id===probeId)info=response;}finally{if(id===probeId){probing=false;pane();}}
    }
    function getPlayer(index=Number($('roomPlayer').value)||0){
      const fighter=window.DormKit.forWire(ui.players()[index],index);
      if(!fighter)throw new Error('请在角色工坊重新保存选手的招式与头像。');
      return fighter;
    }
    async function enter(join){
      if(busy||client.session)return;
      const code=$('roomCode').value.trim();
      if(join&&!/^\d{6}$/.test(code)){note('请输入六位房间号。');$('roomCode').focus();return;}
      const attempt=intent;setBusy(true);note(join?'正在加入房间…':'正在创建房间…');
      try{if(join)await client.join(code,getPlayer());else await client.create(getPlayer());if(attempt===intent){pane();if(!phone())note('');}}
      catch(e){if(attempt===intent)note(e.message);}
      finally{if(attempt===intent)setBusy(false);}
    }
    function forgetRound(){route='';artLobbyKey='';state=null;round=0;soundId=0;lastResult=false;online=false;}
    async function leave(){
      ++intent;++probeId;probing=false;setBusy(false);forgetRound();
      const url=new URL(location.href),param=phone()?'pair':'room';
      if(url.searchParams.has(param)){
        url.searchParams.delete(param);invitations[kind]='';
        try{history.replaceState(null,'',url);}catch{/* A local HTML file has restricted history. */}
      }
      try{await client.leave();}catch{/* The local seat is released even if the host is offline. */}
      $('navLab').disabled=false;
    }
    async function start(){
      if(busy||client.session?.seat!==0)return;
      const startIntent=intent,startClient=client,startTicket=client.session,startArtKey=rosterArtKey(state?.players);
      ui.unlockAudio();setBusy(true);note('');
      try{
        if(window.DuelArt&&state?.players?.length===2){
          note('正在确认本机动作素材；这不代表对方已加载完成。');
          const ready=await window.DuelArt.preload(state.players);
          if(!ready)throw new Error('本机动作素材载入失败，请再点开始重试。');
        }
        if(startIntent!==intent||client!==startClient||client.session!==startTicket)return;
        if(rosterArtKey(state?.players)!==startArtKey)throw new Error('选手已变化，请确认素材后再点开始。');
        await client.start();
      }
      catch(e){if(startIntent===intent){note(e.message);ui.error(e.message);}}
      finally{if(startIntent===intent)setBusy(false);}
    }
    function receive(e){
      const ticket=client.session;
      if(e.type==='closed'){
        forgetRound();showRoom();pane();note(e.message);return;
      }
      if(!ticket)return;
      if(e.type==='signal'){if(!round)note(e.message);return;}
      if(e.type==='transport'){
        route=e.transport==='relay'?'云端转发':e.transport==='direct'?'设备直连':'';
        updateReady();if(round)ui.networkRoute(route,ticket.seat);return;
      }
      if(e.type==='connection'){
        online=e.connected;updateReady();
        if(!online){note(e.message);if(round&&!lastResult)ui.networkPause(e.message);}
        else {note('');if(!round)pane();}
      }else if(e.type==='lobby'){
        state=e;online=true;round=0;lastResult=false;
        if(e.players?.length===2&&e.players.every(Boolean)){const key=rosterArtKey(e.players);if(key!==artLobbyKey){artLobbyKey=key;window.DuelArt?.preload(e.players)?.catch(()=>{});}}
        showRoom();pane();note('');
      }else if(e.type==='start'){
        const newRound=round!==e.round;round=e.round;lastResult=false;
        if(newRound){soundId=0;ui.resetAudio?.();}
        ui.match(e.players,ticket.seat,e.round,phone()?(route||'手机联机'):'局域网');online=true;
      }else if(e.type==='frame'&&round===e.round){
        ui.frame(e.frame);
        for(const sound of e.frame.sounds||[]){if(sound.id>soundId){ui.sound(sound);soundId=sound.id;}}
        if(e.frame.result&&!lastResult){lastResult=true;ui.end(e.frame.result,ticket.seat);}
      }else if(e.type==='status'&&round&&!lastResult){
        if(e.paused)ui.networkPause(e.message);else ui.networkResume();
      }
    }
    function selectKind(next){kind=next;client=clients[kind];}
    function open(next=kind){
      if(next==='choose'){
        // The chooser never changes an active room or discards its seat.
        if(client.session){open(kind);return;}
        ++intent;++probeId;probing=false;setBusy(false);showRoom();note('');
        $('roomMethods').hidden=false;$('roomGrid').hidden=true;$('roomMethodBar').hidden=true;
        $('roomKind').textContent='好友';$('roomBack').textContent='← 返回选人';
        $('navLab').disabled=false;return;
      }
      $('roomMethods').hidden=true;$('roomGrid').hidden=false;
      ++intent;selectKind(next);info=null;probing=true;setBusy(false);
      $('roomCode').value=invitations[kind];$('roomPlayer').replaceChildren();
      showRoom();pane();note('');void probe();
    }
    $('choosePhone').onclick=()=>open('phone');$('chooseLAN').onclick=()=>open('lan');
    $('changeRoomMethod').onclick=()=>open('choose');
    $('phoneRetry').onclick=$('roomRetry').onclick=()=>void probe();$('roomHost').onchange=updateInvite;
    $('makeRoom').onclick=()=>{ui.unlockAudio();void enter(false);};
    $('joinRoomForm').onsubmit=e=>{e.preventDefault();ui.unlockAudio();void enter(true);};
    $('roomStart').onclick=start;
    $('leaveRoom').onclick=async()=>{await leave();pane();note('已离开房间。');};
    $('roomBack').onclick=ui.back;
    $('copyInvite').onclick=async()=>{
      const field=$('inviteURL');
      try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(field.value);note('邀请链接已复制。');}
      catch{field.focus();field.select();let copied=false;try{copied=document.execCommand('copy');}catch{}note(copied?'邀请链接已复制。':'已选中链接，请复制给好友。');}
    };
    return {open,leave,start,release:()=>client.release(),input:(a,d,s)=>client.input(a,d,s),
      get seat(){return client.session?.seat;},get inRoom(){return !!client.session;},
      boot(){
        const invited=invitations.phone?'phone':invitations.lan?'lan':null;
        if(invited){selectKind(invited);client.restore(invitations[invited]);open(invited);return;}
        for(const next of ['phone','lan']){selectKind(next);if(client.restore()){open(next);return;}}
        selectKind('phone');
        if(query.get('play')==='phone')open('phone');
      }};
  }
  window.DormRooms={mount};
})();
