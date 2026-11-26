// Same-origin LAN transport. Only the host computer advances the game simulation.
(() => {
  'use strict';
  const storageKey = 'roomie-rumble-lan-seat-v1';
  const actions = new Set(['left','right','up','down','attack','skill','skill2','ultimate','substitute','jump','guard','evade']);
  const impulses = new Set(['attack','skill','skill2','ultimate','substitute','jump','evade']);
  const isServerPage = () => ['http:','https:'].includes(location.protocol);

  function validSeat(value) {
    return value && /^\d{6}$/.test(value.room) && typeof value.token === 'string' &&
      value.token.length >= 12 && value.token.length <= 256 && (value.seat === 0 || value.seat === 1);
  }
  function remember(seat) {
    try {
      if (seat) sessionStorage.setItem(storageKey, JSON.stringify(seat));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Live play also works when browser storage is unavailable. */ }
  }

  async function request(path, payload, {timeout=6500, keepalive=false}={}) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try {
      const response=await fetch('/lan/'+path,{
        method:payload===undefined?'GET':'POST',
        headers:payload===undefined?{}:{'Content-Type':'application/json'},
        body:payload===undefined?undefined:JSON.stringify(payload),
        cache:'no-store',credentials:'same-origin',signal:controller.signal,keepalive
      });
      let data;
      try {data=await response.json();} catch {data=null;}
      if (!response.ok || !data || typeof data!=='object') {
        const error=new Error(typeof data?.error==='string'?data.error:typeof data?.message==='string'?data.message:'当前页面没有可用的局域网房间服务。');
        error.status=response.status; throw error;
      }
      return data;
    } catch(error) {
      if(error.status)throw error;
      throw new Error(error.name==='AbortError'?'房主电脑响应超时，请确认两台设备连接同一 Wi-Fi。':'连不上房主电脑，请检查 Wi-Fi 和局域网服务。');
    } finally {clearTimeout(timer);}
  }

  function createClient(onEvent) {
    let seat=null, stream=null, open=false, round=0, paused=false, finished=false;
    let operation=0, entering=false, starting=null, resuming=false;
    let reconnectTimer=0, watchdog=0, checking=false, pingPending=false, lastSeen=0;
    let activePacket=null, seq=Date.now()*128;
    const sources=new Map(), held=new Set(), pending=[];
    const emit=event=>onEvent?.(event);
    const auth=s=>({room:s.room,token:s.token});
    function warnConnection(connected,message){
      emit({type:'connection',connected,message});
    }
    function resetInput() {
      sources.clear(); held.clear(); pending.length=0; activePacket=null;
    }
    function stopStream() {
      clearTimeout(reconnectTimer);reconnectTimer=0;
      if(stream){stream.close();stream=null;}
      open=false;resetInput();
    }
    function pageHidden(){return document.visibilityState==='hidden';}
    function retire() {
      const old=seat;
      stopStream();seat=null;round=0;paused=false;finished=false;starting=null;
      clearInterval(watchdog);watchdog=0;remember(null);
      window.removeEventListener('blur',release);
      window.removeEventListener('pagehide',suspend);
      window.removeEventListener('pageshow',wake);
      window.removeEventListener('online',wake);
      document.removeEventListener('visibilitychange',visibility);
      return old;
    }
    function closed(message) {
      retire();emit({type:'closed',message:message||'房间已关闭，可以重新建房或加入。'});
    }
    function scheduleReconnect() {
      if(!seat||reconnectTimer||pageHidden())return;
      reconnectTimer=setTimeout(()=>{reconnectTimer=0;if(seat&&!pageHidden())connect();},1000);
    }
    function restartConnection(message) {
      stopStream();
      if(!seat)return;
      warnConnection(false,message||'正在重新连接房主电脑…');
      scheduleReconnect();
    }
    function checkSeat(owner) {
      if(checking)return;checking=true;
      request('check',auth(owner),{timeout:4000}).catch(error=>{
        if(seat===owner && [401,403,404,410].includes(error.status))closed(error.message);
      }).finally(()=>{checking=false;});
    }
    function heartbeat(owner) {
      if(pingPending)return;pingPending=true;
      request('ping',auth(owner),{timeout:4500}).catch(error=>{
        if(seat===owner && [401,403,404,410].includes(error.status))closed(error.message);
      }).finally(()=>{pingPending=false;});
    }
    function connect() {
      if(!seat||pageHidden())return;
      stopStream();lastSeen=Date.now();
      const owner=seat;
      const events=new EventSource('/lan/events?'+new URLSearchParams(auth(owner)));
      stream=events;
      events.onopen=()=>{
        if(stream!==events)return;
        open=true;lastSeen=Date.now();warnConnection(true,'已连接房主电脑。');
      };
      events.onmessage=e=>{
        if(stream!==events||seat!==owner)return;
        let message;try{message=JSON.parse(e.data);}catch{return;}
        if(!message||typeof message.type!=='string')return;
        lastSeen=Date.now();open=true;
        switch(message.type){
          case 'ping':heartbeat(owner);return;
          case 'replaced':
          case 'closed':closed(message.message);return;
          case 'lobby':
            resetInput();round=0;paused=false;finished=false;
            break;
          case 'start':
            resetInput();round=message.round;paused=false;finished=false;
            break;
          case 'frame':
            if(!round||message.round!==round)return;
            if(message.frame?.result&&!finished){finished=true;resetInput();}
            break;
          case 'status':
            paused=Boolean(message.paused);
            if(paused)resetInput();
            break;
          default:return;
        }
        emit(message);
      };
      events.onerror=()=>{
        if(stream!==events||seat!==owner)return;
        if(open)warnConnection(false,'连接中断，正在恢复原来的座位…');
        open=false;resetInput();checkSeat(owner);
        if(events.readyState===2){stopStream();scheduleReconnect();}
        // An EventSource in CONNECTING state retries on its own.
      };
    }
    function attach(value) {
      if(!validSeat(value))throw new Error('房间服务返回的座位信息不完整，请重新加入。');
      seat={room:String(value.room),seat:value.seat,token:value.token};remember(seat);
      window.addEventListener('blur',release);
      window.addEventListener('pagehide',suspend);
      window.addEventListener('pageshow',wake);
      window.addEventListener('online',wake);
      document.addEventListener('visibilitychange',visibility);
      watchdog=setInterval(()=>{
        if(seat&&!pageHidden()&&Date.now()-lastSeen>17000)restartConnection('房主电脑暂时无响应，正在重连…');
      },5000);
      connect();return seat;
    }
    function suspend() {
      if(!seat)return;
      // The SSE closing also pauses the match and releases this seat on the server.
      release();stopStream();warnConnection(false,'回到游戏后会自动重连。');
    }
    function wake() {
      if(seat&&!pageHidden()&&!open&&!resuming){
        resuming=true;
        queueMicrotask(()=>{resuming=false;if(seat&&!pageHidden()&&!open)connect();});
      }
    }
    function visibility(){if(pageHidden())suspend();else wake();}

    async function enter(kind,room,player) {
      if(seat)throw new Error('请先离开当前房间。');
      if(entering)throw new Error('正在申请座位，请稍候。');
      if(!isServerPage()||typeof EventSource==='undefined')throw new Error('请用浏览器打开房主电脑显示的局域网地址。');
      if(kind==='join'&&!/^\d{6}$/.test(room))throw new Error('请输入六位房间号。');
      const attempt=++operation;entering=true;
      try{
        const value=await request(kind,kind==='join'?{room,player}:{player});
        if(operation!==attempt){
          if(validSeat(value))request('leave',auth(value),{keepalive:true}).catch(()=>{});
          throw new Error('已取消进入房间。');
        }
        return attach(value);
      }finally{if(operation===attempt)entering=false;}
    }
    async function probe(){
      if(!isServerPage()||typeof EventSource==='undefined')return null;
      try{
        const info=await request('info',undefined,{timeout:3500});
        return info.version===1&&Array.isArray(info.urls)?info:null;
      }catch{return null;}
    }
    function restore() {
      if(seat)return true;
      if(!isServerPage()||typeof EventSource==='undefined'||entering)return false;
      let cached;try{cached=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{return false;}
      if(!validSeat(cached))return false;
      attach(cached);return true;
    }
    function start() {
      if(!seat || seat.seat!==0)return Promise.reject(new Error('由房主开始对战。'));
      if(!open)return Promise.reject(new Error('正在连接局域网，请稍后开始。'));
      if(starting)return starting;
      const owner=seat;
      const sent=request('start',auth(owner));
      starting=sent;
      sent.then(()=>{if(starting===sent)starting=null;},()=>{if(starting===sent)starting=null;});
      return sent;
    }
    function playing(){return seat&&open&&round&&!paused&&!finished;}
    function pump(){
      if(!playing()||activePacket||!pending.length)return;
      const owner=seat, next=pending.shift();activePacket=next;
      // Retry the very same sequence number if its acknowledgement was lost.
      async function send(){
        for(let n=0;n<2;n++){
          try{
            await request('input',{...auth(owner),round:next.round,seq:next.seq,held:next.held,tap:next.tap},{timeout:1800});
            return;
          }catch(error){
            if(activePacket!==next||seat!==owner)return;
            if([401,403,404,410].includes(error.status)){closed(error.message);return;}
            if(error.status===409){resetInput();return;}
            if(n===1){restartConnection('操作未送达房主电脑，正在重新连接…');return;}
          }
        }
      }
      send().finally(()=>{if(activePacket===next){activePacket=null;pump();}});
    }
    function enqueue(tap) {
      pending.push({round,seq:++seq,held:[...held],tap});
      if(pending.length>48){restartConnection('连接延迟过高，正在恢复同步…');return;}
      pump();
    }
    function input(action,down,source) {
      if(!playing()||!actions.has(action))return;
      const id=source??action;
      if(down){
        if(sources.has(id))return;
        sources.set(id,action);
        if(held.has(action))return;
        held.add(action);
        enqueue(impulses.has(action)?[action]:[]);
      }else{
        const previous=sources.get(id);
        if(previous===undefined)return;
        sources.delete(id);
        for(const remaining of sources.values())if(remaining===previous)return;
        held.delete(previous);enqueue([]);
      }
    }
    function release() {
      if(!playing()||(!sources.size&&!pending.length&&!activePacket))return;
      resetInput();
      // A later neutral packet supersedes any in-flight keydown on blur or focus loss.
      const payload={...auth(seat),round,seq:++seq,held:[],tap:[]};
      request('input',payload,{keepalive:true,timeout:2000}).catch(()=>{
        if(seat&&seat.token===payload.token&&round===payload.round&&open)restartConnection();
      });
    }
    async function leave() {
      ++operation;entering=false;
      const old=retire();
      if(old)await request('leave',auth(old),{keepalive:true,timeout:3500});
    }
    return {probe,create:player=>enter('create',null,player),join:(room,player)=>enter('join',String(room).trim(),player),restore,start,input,release,leave,get session(){return seat;}};
  }

  window.DormLAN={createClient};
})();
