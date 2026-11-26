'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path'),readline=require('node:readline');
let host=null,pending=null,idle=null,device='',busy=false,owner=null;

function stop(reason){
  clearTimeout(idle);const active=host;host=null;device='';owner=null;
  if(active)active.kill();
  if(pending){const job=pending;pending=null;job.reject(Error(reason));}
}
function launch(){
  const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const proc=spawn(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'host.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  host=proc;
  proc.stderr.resume();
  proc.on('error',e=>{if(host===proc)stop(e.message);});
  proc.stdin.on('error',e=>{if(host===proc)stop(e.message);});
  proc.on('exit',()=>{if(host===proc)stop('GPU 进程已退出');});
  readline.createInterface({input:proc.stdout,crlfDelay:Infinity}).on('line',line=>{
    if(host!==proc||!pending)return;
    if(line.startsWith('READY ')){
      device=Buffer.from(line.slice(6),'base64').toString('utf8');proc.stdin.write(pending.input);return;
    }
    if(line.startsWith('ERR '))return stop(Buffer.from(line.slice(4),'base64').toString('utf8').slice(0,600));
    if(!line.startsWith('ROW '))return;
    const job=pending,data=line.slice(4);
    if(!data.length||data.length>2048*296*2||Buffer.from(data,'base64').length%296!==0)return stop('GPU 返回的数据不完整');
    pending=null;job.resolve({device,data});
  });
}
function invoke(input,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>stop('已停止 GPU 对局');
    const timer=setTimeout(()=>stop('GPU 初始化或执行超时'),90000);
    const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);clearTimeout(idle);idle=setTimeout(()=>stop('GPU 已空闲'),120000);idle.unref();};
    clearTimeout(idle);
    pending={input,resolve:v=>{finish();resolve(v);},reject:e=>{finish();reject(e);}};
    if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});
    try{if(!host)launch();else host.stdin.write(input);}catch(e){stop(e.message);}
  });
}
process.once('exit',()=>{if(host)host.kill();});
module.exports=async function(req,res,readBody,json){
  if(req.method!=='POST')return json(res,405,{error:'需要 POST'});
  const hostName=new URL('http://'+req.headers.host).hostname;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||
     !['127.0.0.1','localhost','[::1]'].includes(hostName)||req.headers.origin!=='http://'+req.headers.host||
     req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'请从本机游戏窗口打开实验室'});
  if(process.platform!=='win32')return json(res,503,{error:'完整 GPU 模式需要 Windows 本地启动器'});
  if(!(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'需要 JSON'});
  const {config,token,fills,capacity}=await readBody(req,96000);
  const isNew=Array.isArray(config);
  if((isNew && (config.length!==120 || !config.every(v=>Number.isFinite(v)&&v>=0&&v<=100))) ||
     (!isNew && (config!==null || !owner || token!==owner)) ||
     ![8,256,512,768,1024].includes(capacity)||!Array.isArray(fills)||fills.length>capacity*2||
     !fills.every(t=>Array.isArray(t)&&t.length===3&&t.every((v,j)=>Number.isInteger(v)&&v>=0&&v<=[9,9,4294967295][j])))
    return json(res,400,{error:'GPU 会话或槽位无效'});
  if(busy)return json(res,409,{error:'显卡正在处理另一份请求'});
  if(isNew)owner=require('node:crypto').randomUUID();
  busy=true;
  const ctl=new AbortController(),cancel=()=>ctl.abort();
  res.once('close',cancel);
  try{
    const cfg=isNew?Buffer.alloc(960):null;
    if(cfg)config.forEach((v,i)=>cfg.writeDoubleLE(v,i*8));
    const slots=Buffer.alloc(fills.length*12);
    fills.forEach((r,i)=>r.forEach((v,j)=>slots.writeUInt32LE(v,i*12+j*4)));
    const input=(cfg?cfg.toString('base64'):'-')+' '+(slots.length?slots.toString('base64'):'-')+' '+capacity+'\n';
    const result=await invoke(input,ctl.signal);
    if(!res.destroyed)json(res,200,{...result,token:owner});
  }catch(e){if(!res.destroyed)json(res,503,{error:e.message});}
  finally{busy=false;res.off('close',cancel);}
};
