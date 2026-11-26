'use strict';

// Both browsers display the same match, simulated on this machine.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createMatch } = require('./dist/combat.js');
const { forWire } = require('./dist/kit.js');

const rooms = new Map();
const actionNames = new Set(['left','right','up','down','attack','skill','skill2','ultimate','substitute','jump','guard','evade']);
const tapNames = new Set(['attack','skill','skill2','ultimate','substitute','jump','evade']);
const releaseTime = 120_000;
const roomLimit = 32;
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.zip':'application/zip','.mp3':'audio/mpeg','.ogg':'audio/ogg','.json':'application/json; charset=utf-8'};
const root = path.join(__dirname,'dist');
// Distinguish this installation from another game copy using the same local port.
const installationId = crypto.createHash('sha256').update(fs.realpathSync(__dirname)).digest('hex');

function fail(status,message) { throw Object.assign(new Error(message),{status}); }
function json(res,status,body) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}
function addresses() {
  try {
    return Object.values(os.networkInterfaces()).flat().filter(n=>n && (n.family==='IPv4'||n.family===4) && !n.internal).map(n=>n.address);
  } catch {
    // Sandboxed local runtimes sometimes allow loopback but cannot enumerate network adapters.
    return [];
  }
}
function cleanPlayer(player, seat) {
  const fighter = forWire(player, seat);
  if (!fighter) fail(400, '选手资料、招式或头像格式有误，请在角色工坊重新保存。');
  return fighter;
}
function newSeat(player) {
  return {player, token:crypto.randomBytes(24).toString('hex'), stream:null,awayAt:Date.now(),ack:0,seq:-1,held:new Set()};
}
function ticket(r,i){return {room:r.code,token:r.seats[i].token,seat:i};}
function authenticate(payload) {
  const r=rooms.get(payload.room);
  if(!r)fail(404,'房间已关闭或房间号有误。');
  const i=r.seats.findIndex(s=>s&&typeof payload.token==='string'&&s.token===payload.token);
  if(i<0)fail(403,'座位已失效，请重新加入房间。');
  return {r,i,s:r.seats[i]};
}
function connected(r){return r.seats.map(s=>Boolean(s?.stream));}
function packet(data){return 'data: '+JSON.stringify(data)+'\n\n';}
function write(stream,data) {
  if(!stream||stream.destroyed||stream.writableEnded)return;
  // A slow client restarts from a fresh full snapshot on its next connection.
  if(stream.writableLength>768*1024){stream.destroy();return;}
  stream.write(data);
}
function broadcast(r,data){const block=packet(data);for(const s of r.seats)if(s)write(s.stream,block);}
function players(r){return r.seats.map(s=>s?s.player:null);}
function lobby(r){return {type:'lobby',room:r.code,players:players(r),connected:connected(r)};}
function startEvent(r){return {type:'start',round:r.round,players:players(r)};}
function frameEvent(r){return {type:'frame',round:r.round,frame:r.match.snapshot()};}
function status(r) {
  const paused=!connected(r).every(Boolean);
  return {type:'status',paused,message:paused?'对方暂时断线，对战暂停。重连后继续。':'双方已连接，对战继续。'};
}
function releaseInputs(r) {
  r.seats.forEach((s,i)=>{if(s){s.held.clear();r.match?.release(i);}});
  r.debt=0;
}
function closeRoom(r,message) {
  rooms.delete(r.code);
  broadcast(r,{type:'closed',message});
  for(const s of r.seats)if(s?.stream){const out=s.stream;s.stream=null;out.end();}
}
function removeGuest(r,message) {
  const s=r.seats[1];
  if(s?.stream){const out=s.stream;s.stream=null;write(out,packet({type:'closed',message}));out.end();}
  releaseInputs(r);r.seats[1]=null;r.match=null;r.finished=false;
  broadcast(r,lobby(r));
}
function openEvents(req,res,args) {
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  res.flushHeaders();res.write('retry: 1000\n\n');req.socket.setKeepAlive(true,3000);
  let who;
  try{who=authenticate(args);}catch(error){res.end(packet({type:'closed',message:error.message}));return;}
  const {r,i,s}=who;
  const previous=s.stream;
  s.stream=res;s.awayAt=0;s.ack=0;
  if(previous && previous!==res)previous.end(packet({type:'replaced',message:'这个座位已在另一页面连接。'}));
  if(r.match){
    write(res,packet(startEvent(r)));write(res,packet(frameEvent(r)));
    broadcast(r,status(r));
  }else broadcast(r,lobby(r));
  res.once('close',()=>{
    if(r.seats[i]!==s||s.stream!==res||rooms.get(r.code)!==r)return;
    s.stream=null;s.awayAt=Date.now();releaseInputs(r);
    broadcast(r,r.match?status(r):lobby(r));
  });
}
function readBody(req,limit){
  return new Promise((resolve,reject)=>{
    let size=0,failed=false;const chunks=[];
    req.on('data',chunk=>{
      size+=chunk.length;
      if(size>limit){
        if(!failed){failed=true;chunks.length=0;reject(Object.assign(new Error('发送的内容过大，请重新裁切头像。'),{status:413}));}
      }else if(!failed)chunks.push(chunk);
    });
    req.on('end',()=>{
      if(failed)return;
      try{const data=JSON.parse(Buffer.concat(chunks).toString());if(!data||typeof data!=='object'||Array.isArray(data))throw Error();resolve(data);}
      catch{reject(Object.assign(new Error('请求内容无法读取。'),{status:400}));}
    });
    req.on('error',reject);
  });
}
function applyInput(r,i,s,data) {
  if(!Number.isSafeInteger(data.seq)||data.seq<0||!Array.isArray(data.held)||data.held.length>actionNames.size||
    !Array.isArray(data.tap)||data.tap.length>16||!data.held.every(a=>actionNames.has(a))||!data.tap.every(a=>tapNames.has(a)))fail(400,'按键数据无法读取。');
  if(!r.match||r.finished||!connected(r).every(Boolean)||
      (data.round!==undefined&&data.round!==r.round)||data.seq<=s.seq)return;
  s.seq=data.seq;
  const next=new Set(data.held),taps=new Set(data.tap);
  // Explicit taps also handle an entire press/release between two input packets.
  for(const action of s.held)if(!next.has(action)||taps.has(action))r.match.input(i,action,false);
  for(const action of taps){r.match.input(i,action,true);if(!next.has(action))r.match.input(i,action,false);}
  for(const action of next)if(!taps.has(action)&&!s.held.has(action))r.match.input(i,action,true);
  s.held=next;
}
function command(route,data) {
  if(route==='create'){
    if(rooms.size>=roomLimit)fail(503,'当前房间已满，请关闭闲置房间后重试。');
    const host=newSeat(cleanPlayer(data.player,0));
    let code;
    do{code=String(crypto.randomInt(100000,1000000));}while(rooms.has(code));
    const r={code,seats:[host,null],match:null,round:0,debt:0,frameTick:0,finished:false,activity:Date.now()};
    rooms.set(code,r);return ticket(r,0);
  }
  if(route==='join'){
    const r=rooms.get(data.room);
    if(!r)fail(404,'房间号不存在，请核对后重试。');
    if(r.seats[1])fail(409,'房间已有两名选手，请换一个房间。');
    r.seats[1]=newSeat(cleanPlayer(data.player,1));r.activity=Date.now();
    broadcast(r,lobby(r));return ticket(r,1);
  }
  const {r,i,s}=authenticate(data);
  switch(route) {
    case 'check':return {room:r.code,seat:i,round:r.round};
    case 'ping':s.ack=Date.now();return {ok:true};
    case 'start':
      if(i!==0)fail(403,'由房主开始对战。');
      if(!connected(r).every(Boolean))fail(409,'请等两位选手都连接后再开打。');
      if(r.match&&!r.finished)return {round:r.round};
      r.match=createMatch(players(r));r.round++;r.finished=false;r.debt=0;r.frameTick=0;r.activity=Date.now();
      r.seats.forEach(seat=>{seat.seq=-1;seat.held.clear();});
      broadcast(r,startEvent(r));broadcast(r,frameEvent(r));
      return {round:r.round};
    case 'input':applyInput(r,i,s,data);return {ok:true};
    case 'leave':
      if(!i)closeRoom(r,'房主已关闭房间。');else removeGuest(r,'你已离开房间。');
      return {ok:true};
    default:fail(404,'找不到这个联机操作。');
  }
}
const endpointNames=new Set(['create','join','start','input','leave','check','ping']);
const hostNames=new Set(['localhost','127.0.0.1',os.hostname().toLowerCase(),os.hostname().toLowerCase()+'.local',...addresses()]);
// An explicitly named LAN or preview alias can sit in front of the local server.
const aliasFlag=process.argv.indexOf('--host-alias');
const hostAlias=aliasFlag>=0?String(process.argv[aliasFlag+1]||'').toLowerCase():'';
if(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(hostAlias))hostNames.add(hostAlias);
async function serve(req,res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/gpu/advance')return require('./gpu-sim/service.cjs')(req,res,readBody,json);
  if(url.pathname.startsWith('/pact/'))return require('./pact-ollama.cjs')(req,res,url,readBody,json);
  if(url.pathname.startsWith('/lan/')){
    const route=url.pathname.slice(5);
    const host=new URL('http://'+req.headers.host).hostname.toLowerCase();
    if(!hostNames.has(host) && host!==req.socket.localAddress)fail(403,'请使用启动窗口列出的局域网地址。');
    const origin=req.headers.origin;
    if((origin && origin!=='http://'+req.headers.host)||req.headers['sec-fetch-site']==='cross-site')fail(403,'请从本机游戏页面连接房间。');
    if(route==='info'&&req.method==='GET')return json(res,200,{version:1,urls:addresses().map(ip=>'http://'+ip+':'+server.address().port)});
    if(route==='events'&&req.method==='GET')return openEvents(req,res,Object.fromEntries(url.searchParams));
    if(!endpointNames.has(route))fail(404,'找不到这个联机操作。');
    if(req.method!=='POST')fail(405,'此操作需要 POST 请求。');
    if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))fail(415,'需要 JSON 数据。');
    const body=await readBody(req,route==='create'||route==='join'?350*1024:8192);
    return json(res,200,command(route,body));
  }
  if(!['GET','HEAD'].includes(req.method))fail(405,'仅支持读取游戏文件。');
  let rel;
  try{rel=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';}catch{fail(400,'地址无效。');}
  // 允许 a.png.webp 这类双后缀，但每一段都不能以点开头，杜绝 .. 越级访问。
  if(!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*\.(?:html|css|js|webp|png|svg|zip|mp3|ogg|json)$/.test(rel)||rel.includes('..'))fail(404,'找不到这个游戏文件。');
  const file=path.join(root,rel);
  let stat;
  try{stat=await fs.promises.stat(file);}catch{fail(404,'找不到这个游戏文件。');}
  if(!stat.isFile())fail(404,'找不到这个游戏文件。');
  if(rel==='index.html')res.setHeader('X-Neural-Clash-Install',installationId);
  res.writeHead(200,{'Content-Type':mime[path.extname(rel)],'Content-Length':stat.size,'Cache-Control':'no-cache'});
  if(req.method==='HEAD')return res.end();
  const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
const server=http.createServer((req,res)=>{serve(req,res).catch(e=>{if(res.headersSent)res.destroy();else json(res,e.status||500,{error:e.status?e.message:'启动服务时出现错误，请查看房主电脑。'});if(!e.status)console.error(e);});});
server.requestTimeout=15000;server.headersTimeout=12000;
let last=performance.now();
const tick=setInterval(()=>{
  const now=performance.now(),delta=Math.min(200,now-last);last=now;
  for(const r of rooms.values()){
    if(!r.match||r.finished||!connected(r).every(Boolean))continue;
    r.debt+=delta;
    while(r.debt>=1000/60 && !r.finished){
      r.debt-=1000/60;r.match.step();
      if(++r.frameTick%3===0){
        const ev=frameEvent(r);r.finished=Boolean(ev.frame.result);broadcast(r,ev);
      }
    }
  }
},1000/60);
tick.unref();
const sweep=setInterval(()=>{
  const now=Date.now();
  for(const r of rooms.values()){
    if(r.seats[0].awayAt&&now-r.seats[0].awayAt>releaseTime){closeRoom(r,'房主长时间断线，房间已关闭。');continue;}
    if(now-r.activity>2*60*60*1000){closeRoom(r,'房间已到期，请重新建房。');continue;}
    if(r.seats[1]?.awayAt&&now-r.seats[1].awayAt>releaseTime)removeGuest(r,'座位因长时间断线已释放。');
    for(const s of r.seats)if(s?.stream){
      if(s.ack && now-s.ack>18000)s.stream.destroy();
      else write(s.stream,packet({type:'ping'}));
    }
  }
},4000);
sweep.unref();

const args=process.argv.slice(2),pi=args.indexOf('--port');
const port=Number(pi>=0?args[pi+1]:process.env.PORT||4430);
if(!Number.isInteger(port)||port<0||port>65535){console.error('端口无效，例如 node server.cjs --port 4414');process.exit(1);}
function openGame(url) {
  const [command, params] = process.platform === 'win32'
    ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const browser = spawn(command, params, {detached:true, stdio:'ignore'});
  browser.once('error', () => console.log('请在浏览器中打开 '+url));
  browser.unref();
}

server.once('error', async error => {
  if (error.code === 'EADDRINUSE' && args.includes('--open-game') && !args.includes('--no-open')) {
    const url = 'http://127.0.0.1:'+port;
    try {
      const page = await fetch(url+'/index.html', {method:'HEAD', redirect:'error', signal:AbortSignal.timeout(2000)});
      if (page.ok && page.headers.get('x-neural-clash-install') === installationId) {
        console.log('游戏已经启动，正在打开 '+url);
        openGame(url);
        return;
      }
    } catch {}
  }
  console.error(error.code==='EADDRINUSE'?'该端口已被占用，可运行 node server.cjs --port 4400。':error.message);
  process.exitCode=1;
});
server.listen(port,'0.0.0.0',()=>{
  const port=server.address().port, url='http://127.0.0.1:'+port, ips=addresses();
  console.log('AI 娘大乱斗 · AI 博弈版\n房主电脑打开  '+url);
  for(const ip of ips)console.log('同一 Wi-Fi 的手机或电脑打开  http://'+ip+':'+port);
  if(!ips.length)console.log('暂未找到局域网 IPv4 地址，请先接入同一 Wi-Fi。');
  console.log('保持本窗口开启。按 Ctrl+C 关闭房间服务。');
  if(!args.includes('--no-open'))openGame(url);
});
