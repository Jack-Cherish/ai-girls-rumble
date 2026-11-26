/* Original procedural effects. */
(function(root){
'use strict';
const profiles=[
 {name:'Claude',base:330,texture:'paper',chord:[1,1.25,1.5],label:'纸页、墨迹与暖钟'},
 {name:'DeepSeek',base:155,texture:'water',chord:[1,1.5,2],label:'深水涌浪与鲸鸣'},
 {name:'ChatGPT',base:440,texture:'air',chord:[1,1.25,1.5],label:'羽翼气流与清亮和弦'},
 {name:'Gemini',base:520,texture:'star',chord:[1,1.05946,2],label:'双星交替与晶体铃音'},
 {name:'Grok',base:95,texture:'metal',chord:[1,1.414,2.17],label:'重斧破空与金属冲击'},
 {name:'Kimi',base:392,texture:'moon',chord:[1,1.5,2.25],label:'月琴拨弦与回旋月刃'},
 {name:'豆包',base:350,texture:'toy',chord:[1,1.5,1.875],label:'玩偶弹跳与柔软护盾'},
 {name:'MiniMax',base:261.63,texture:'pulse',chord:[1,1.25,1.5],label:'三段声波与贝壳共鸣'},
 {name:'GLM',base:293.66,texture:'ink',chord:[1,1.3333,2],label:'书签划纸与墨符定音'},
 {name:'千问',base:466.16,texture:'fan',chord:[1,1.5,2],label:'折扇开合与往返风切'}
];
[profiles[0],profiles[1]]=[profiles[1],profiles[0]];
const slugs=["tide","quill","chatgpt","gemini","grok","kimi","doubao","minimax","glm","qwen"];
profiles.forEach((p,i)=>p.id=slugs[i]);
function samples(event,rate=24000){
 const e=typeof event==='string'?{key:event}:event||{}, id=slugs.includes(e.characterId)?slugs.indexOf(e.characterId):Number(e.characterId),p=profiles[Number.isInteger(id)&&id>=0&&id<10?id:0];
 const key=e.key||e.kind||'skill',slot=Math.max(0,Math.min(2,({skill:0,skill2:1,ultimate:2,attack:0,substitute:1}[e.slot]??Number(e.slot))||0));
 const heavy=e.impact==='finish'||e.impact==='ultimate';
 const duration=key==='hit'?(heavy?.32:.16):key==='skill'?.42+slot*.15:key==='end'?.85:key==='start'?.55:key==='guard'?.2:.19;
 const out=new Float32Array(Math.ceil(rate*duration));let seed=14231+(id||0)*193+slot*37;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
 const sin=(f,t)=>Math.sin(2*Math.PI*f*t);let smooth=0;
 for(let i=0;i<out.length;i++){
  let t=i/rate,noise=random();smooth=.89*smooth+.11*noise;
  const env=Math.min(1,t/.007)*Math.exp(-t/(duration*.26))*Math.min(1,(duration-t)/.035);
  let v=0;
  if(key==='hit'){
   const crack=(noise-smooth)*Math.exp(-t*120)*(heavy?.74:.56);
   const thud=Math.sin(2*Math.PI*((heavy?53:88)*t+.86*(1-Math.exp(-t*38))))*Math.exp(-t*(heavy?14:32));
   const tail=heavy?smooth*.48*Math.exp(-Math.max(0,t-.025)*16):0;
   v=(crack+thud*.74+tail)*Math.min(1,t/.0015)*Math.min(1,(duration-t)/.016);
  }
  else if(key==='guard'){
   const ring=(sin(810,t)+.48*sin(1835,t)+.2*sin(2740,t))*.28*Math.exp(-t*24);
   v=(ring+(noise-smooth)*.48*Math.exp(-t*145))*Math.min(1,t/.0018)*Math.min(1,(duration-t)/.012);
  }
  else if(key==='start'||key==='end'){
   const note=Math.floor(t/.12),freq=p.base*(key==='start'?[1,1.25,1.5,2][Math.min(note,3)]:[2,1.5,1.25,1][Math.min(note,3)]);
   v=(sin(freq,t)*.4+sin(freq*2,t)*.1)*env;
  }else{
   const f=p.base*(1+slot*.18), sweep=sin(f*(1+.5*Math.exp(-t*12)),t);
   if(p.texture==='paper')v=noise*.2*Math.exp(-t*18)+(sin(f,t)+.3*sin(f*1.5,t))*.28;
   if(p.texture==='water')v=smooth*1.3+sin(f*.5,t)*.28+sin(f*(1-.38*t),t)*.22;
   if(p.texture==='air')v=smooth*.8+(sin(f,t)+sin(f*1.25,t)+sin(f*1.5,t))*.14;
   if(p.texture==='star')v=sin(f*(Math.floor(t/.07)%2?2:1),t)*.35+sin(f*2.75,t)*.1;
   if(p.texture==='metal')v=noise*.3+sweep*.35+sin(f*1.414,t)*.22;
   if(p.texture==='moon')v=sin(f,t)*.35+sin(f*1.5,t)*.2+sin(f*2.25,t)*.12;
   if(p.texture==='toy')v=sin(f*(1+.3*sin(5,t)),t)*.4+sin(f*2,t)*.12;
   if(p.texture==='pulse'){let beat=t%.105;v=(sin(f,t)+.5*sin(f*1.25,t)+.3*sin(f*1.5,t))*.33*Math.exp(-beat*21);}
   if(p.texture==='ink')v=noise*.17*Math.exp(-t*8)+sin(f,t)*.26+sin(f*2,t)*.13;
   if(p.texture==='fan')v=noise*(.16+.14*Math.sin(Math.PI*t/duration)**2)+sin(f*(1-.6*t),t)*.23;
   v*=env;

  }
  out[i]=Math.tanh(v*.72)*.72;
 }
 return out;
}
function create(){
 let ctx,master;
 let enabled=true,volume=.8;
 let played=0,blocked=0;
 const active=new Set(),seen=new Set(),effectsCache=new Map();
 function levels(){
  if(!ctx)return;
  master.gain.setTargetAtTime(enabled?volume:0,ctx.currentTime,.01);
 }
 function unlock(){
  if(!ctx){
   const AC=root.AudioContext||root.webkitAudioContext;
   if(!AC)return Promise.resolve(false);
   ctx=new AC();master=ctx.createGain();
   const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-9;limiter.ratio.value=8;
   master.connect(limiter);limiter.connect(ctx.destination);levels();
  }
  return ctx.resume().then(()=>ctx.state==='running').catch(()=>false);
 }
 function source(buffer){
  const s=ctx.createBufferSource();s.buffer=buffer;s.connect(master);
  s.onended=()=>{s.disconnect();active.delete(s);};
  active.add(s);s.start();return s;
 }
 function stop(){for(const s of active)s.stop();active.clear();}
 function play(event){
  const e=typeof event==='string'?{key:event}:event||{};
  if(e.id!=null){
   if(seen.has(e.id))return false;
   seen.add(e.id);if(seen.size>256)seen.delete(seen.values().next().value);
  }
  if(!enabled||!ctx||ctx.state!=='running'){blocked++;return false;}
  if(volume<=0||active.size>=16)return false;
  const key=[e.key,e.characterId,e.slot,e.impact].join(':');
  let buffer=effectsCache.get(key);
  if(!buffer){
   const data=samples(e,ctx.sampleRate);
   buffer=ctx.createBuffer(1,data.length,ctx.sampleRate);buffer.copyToChannel(data,0);
   if(effectsCache.size>=160)effectsCache.delete(effectsCache.keys().next().value);
   effectsCache.set(key,buffer);
  }
  source(buffer);played++;return true;
 }
 return {unlock,play,stop,reset(){stop();seen.clear();},
  setEnabled(v){enabled=!!v;if(!enabled)stop();levels();},
  setVolume(v){volume=v;levels();},
  stats(){return {played,blocked};}
 };
}
root.ArenaAudio={profiles,samples,create};
})(typeof window!=='undefined'?window:globalThis);
