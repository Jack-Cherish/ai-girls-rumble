/* Binary result layout shared with gpu-sim/duel.cl. */
(function(root){
  'use strict';
  const kinds=['dash','projectile','shield','heal','burst','volley','rush'];
  const stock=['tide','quill','chatgpt','gemini','grok','kimi','doubao','minimax','glm','qwen'];
  function config(kits,changes){
    return kits.flatMap((original,i)=>{
      const kit=BalanceCore.kitFor(original,changes);
      if(kit.characterId!==stock[i])throw Error('当前阵容与 GPU 核心不匹配');
      return ['skill','skill2','ultimate'].flatMap(slot=>{
        const s=kit[slot],kind=kinds.indexOf(s.kind);
        if(!kit.presetSlots[slot]||kind<0)throw Error('此技能需要原版引擎');
        return [kind,s.power,s.cooldown||0,s.delay];
      });
    });
  }
  function decode(data,tasks){
    if(data.length!==72*tasks.length)throw Error('GPU 批次长度不符');
    const time=ticks=>+(ticks/60).toFixed(2);
    return tasks.map((task,i)=>{
      const r=data.subarray(i*72,(i+1)*72),rounds=[];
      if(r[2]<2||r[2]>5||r[0]>2)throw Error('GPU 对局未正常结算');
      for(let j=0;j<r[2];j++){const k=30+j*6;rounds.push({t:r[k]/60,hp:[r[k+1],r[k+2]],timeout:Boolean(r[k+5]),end:r[k+3],noDamageSeconds:time(r[k+4])});}
      const pair=(offset,n)=>[Array.from(r.slice(offset,offset+n)),Array.from(r.slice(offset+n,offset+2*n))];
      const combo=r[4]?{amount:r[4],start:r[5],seat:r[7],round:r[8],resource:false,end:r[6]}:{amount:0,start:0,end:0,seat:0};
      return {...task,winner:r[0]?r[0]-1:null,rounds,casts:pair(10,4),damage:pair(18,4),heal:[r[28],r[29]],blocked:[r[26],r[27]],combo,oneShot:Boolean(r[3]),hpMax:180,gap:time(r[9]),hash:r[1]};
    });
  }
  async function advance(config,token,fills,capacity,signal){
    const response=await fetch('/gpu/advance',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({config,token,fills,capacity}),signal});
    const result=await response.json();
    if(!response.ok||!result.data)throw Error(result.error||'GPU 未能返回结果');
    const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));
    if(bytes.length%296!==0 || bytes.length===0)throw Error('GPU 分段数据长度有误');
    return {words:new Uint32Array(bytes.buffer),token:result.token};
  }
  async function roll(kits,changes,capacity,take,accept,signal,available=()=>Infinity){
    const configWords=config(kits,changes),pending=new Map(),usedSlots=new Set();
    let token=null,refills=0,nextId=0;
    while(true){
      signal.throwIfAborted();
      const fills=[];
      // Keep a reserve on the device while leaving a share of unclaimed jobs for CPU workers.
      const quota=Math.min(capacity*2-pending.size,Math.ceil(available()/2));
      for(let i=0;i<quota;i++){
        const task=take();if(!task)break;
        pending.set(nextId++,task);fills.push([task.a,task.b,task.seed]);
      }
      if(!pending.size)return refills;
      const reply=await advance(token?null:configWords,token,fills,capacity,signal);
      signal.throwIfAborted();
      token=reply.token;
      const finished=new Map();
      for(let i=0;i<reply.words.length;i+=74){
        const id=reply.words[i],slot=reply.words[i+1],task=pending.get(id);
        if(!task||slot>=capacity||finished.has(id))throw Error('GPU 场次重复或无效');
        finished.set(id,{slot,row:decode(reply.words.subarray(i+2,i+74),[task])[0]});
      }
      for(const [id,{slot,row}] of finished){
        if(usedSlots.has(slot))refills++;
        usedSlots.add(slot);pending.delete(id);accept(row);
      }
    }
  }
  root.BalanceFull={config,decode,roll};
})(globalThis);
