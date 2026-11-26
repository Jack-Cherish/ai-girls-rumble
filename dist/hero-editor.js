(() => {
  const $=id=>document.getElementById(id), lib=HeroLibrary;
  const dialog=document.createElement('dialog');dialog.id='heroDialog';
  dialog.innerHTML=`<form method="dialog"><header><h2>添加英雄</h2><button aria-label="关闭">×</button></header></form>
  <label>配置方式<select id="heroMode"><option value="local">本地大模型</option><option value="api">API Key 生成</option><option value="manual">手动上传</option></select></label>
  <label>角色设定<textarea id="heroBrief" rows="2" placeholder="名字、外形、战斗风格"></textarea></label>
  <section id="heroProvider"><label>OpenAI 兼容接口<input id="heroEndpoint"></label>
  <label>文本模型<input id="heroModel" placeholder="填写服务中已安装或可用的模型名"></label>
  <label id="heroSecret">API Key<input id="heroKey" type="password" autocomplete="off"></label>
  <label>图像模型（未上传图集时使用）<input id="heroImageModel" placeholder="需要支持 images/generations"></label></section>
  <label>动作图集 · 一张透明 PNG / WebP，1024 × 2048，4 列 × 8 行<input id="heroSheet" type="file" accept="image/png,image/webp"></label>
  <small id="sheetHelp">第一行第一格用于选人立绘和头像。手动上传一张完整图集即可。</small>
  <details><summary>图片规格和技能提示词</summary><textarea id="heroPrompt" rows="8" readonly></textarea></details>
  <button id="heroCopy">复制完整提示词</button>
  <section id="heroManual"><label>上传角色 JSON<input id="heroFile" type="file" accept=".json,application/json"></label>
  <label>或直接编辑技能 JSON<textarea id="heroJson" rows="10"></textarea></label></section>
  <p id="heroMsg" role="status"></p><button id="heroSubmit">生成并添加</button>`;
  document.body.append(dialog);
  const sample={version:1,name:'潮音',story:'以海潮作战的旅人',imagePrompt:'透明背景，完整全身，朝右站立，双脚在画面底部。',
    skill:{name:'逐浪',kind:'dash',power:16,cooldown:5,delay:.2,prompt:'踏浪突进'},
    skill2:{name:'潮声',kind:'projectile',power:14,cooldown:4,delay:.15,prompt:'向前发射水弹'},
    ultimate:{name:'怒潮',kind:'volley',power:32,delay:.3,prompt:'召唤潮汐连续攻击'}};
  let editing=null, slot=null, initial=sample;
  const template=()=>JSON.stringify(slot?initial[slot]:initial,null,2);
  const sheetPrompt='输出一张透明背景的 PNG 或 WebP 精灵图集。画布严格为1024×2048像素，4列×8行，每格256×256，共32帧。无外边距、无格间距、无文字、无格线。每格恰好一个完整角色，朝右，服装和比例一致，各动作不跨格；站姿脚底水平居中靠下。自上而下8行：待机、行走、普攻、技能、受击、防御、跳跃、倒地。每行从左到右是同一动作连续4帧。第一行第一格是清晰的全身待机姿势，用于立绘和头像。整套动作放在这一张图片里。';
  function prompt(){return (editing===null?'为《AI 娘大乱斗》制作英雄。设定：':'编辑现有英雄「'+initial.name+'」。只修改玩家要求的字段。要求：')+($('heroBrief').value||'自由设计')+
    '\n文本输出单个 UTF-8 JSON，严格使用下列结构。name 最多12字。两个普通技能 kind 可选 dash/projectile/shield/burst/heal，power 整数8–24，cooldown 3–9秒，delay 0–1.2秒。奥义 kind 可选 rush/volley，power 整数24–40，delay 0–1.2秒。imagePrompt 描述角色外观。'+
    (slot?'\n只返回下列这一招的数据。':'\n图片交付：'+sheetPrompt)+'\n'+template();}
  const status=t=>{$('heroMsg').textContent=t;};
  function mode(){
    const m=$('heroMode').value,manual=m==='manual';
    $('heroProvider').hidden=manual;$('heroManual').hidden=!manual;$('heroSecret').hidden=m!=='api';
    $('heroEndpoint').value=m==='local'?'http://127.0.0.1:11434/v1':'https://api.openai.com/v1';
    $('heroKey').value='';$('heroModel').value='';$('heroImageModel').value='';
    $('heroSubmit').textContent=editing===null?(manual?'校验并添加':'生成并添加'):(manual?'保存修改':'生成并保存');status('');
  }
  function openForm(method,body,key=null){
    editing=body;slot=key;initial=sample;
    if(body!==null){
      const p=ArenaApp.editorProfile,k=DormKit.forPlayer(p,body);
      initial={version:1,name:p.name,story:p.story,imagePrompt:lib.record(body)?.imagePrompt||p.story,skill:{...k.skill},skill2:{...k.skill2},ultimate:{...k.ultimate}};
    }
    dialog.querySelector('h2').textContent=body===null?'添加英雄':'编辑 · '+initial.name+(slot?' · '+initial[slot].name:'');
    $('heroMode').value=method;$('heroBrief').value='';
    $('heroBrief').placeholder=body===null?'名字、外形、战斗风格':'例如：把二技能换成冷却 5 秒的突进';
    $('heroSheet').value='';$('heroFile').value='';$('heroJson').value=template();
    $('heroSheet').parentElement.hidden=Boolean(slot);$('heroImageModel').parentElement.hidden=Boolean(slot);
    $('sheetHelp').textContent=slot?'只修改这一招，保留其他招式和动作。':body===null?'第一格用于立绘和头像。':'默认沿用当前动作。要换图，可上传图集，或在 AI 模式指定图像模型。';
    mode();$('heroPrompt').value=prompt();dialog.showModal();
  }
  $('heroAdd').onclick=()=>openForm('local',null);
  window.editHero=(method,key)=>openForm(method,ArenaApp.editorBody,key);
  document.querySelectorAll('[data-edit]').forEach(b=>{b.onclick=()=>window.editHero(b.dataset.edit);});
  $('heroMode').onchange=mode;$('heroJson').value=template();
  $('heroBrief').oninput=()=>$('heroPrompt').value=prompt();
  $('heroCopy').onclick=async()=>{try{await navigator.clipboard.writeText(prompt());status('提示词已复制。');}catch{dialog.querySelector('details').open=true;$('heroPrompt').focus();$('heroPrompt').select();status('已选中提示词，请复制。');}};
  $('heroFile').onchange=async()=>{try{const f=$('heroFile').files[0];if(f){if(f.size>100000)throw Error('JSON 文件过大');$('heroJson').value=await f.text();}}catch(e){status(e.message);}};
  function validate(r){
    const string=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
    const num=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
    if(r?.version!==1||!string(r.name,12)||!string(r.story,500))throw Error('检查 version、角色名（1–12字）与角色设定（1–500字）。');
    for(const [key,title] of [['skill','一技能'],['skill2','二技能'],['ultimate','奥义']]){
      const s=r[key],ult=key==='ultimate',kinds=ult?['rush','volley']:['dash','projectile','shield','burst','heal'];
      if(!s||!string(s.name,24)||!string(s.prompt,900)||!kinds.includes(s.kind)||!Number.isInteger(s.power)||!num(s.power,ult?24:8,ult?40:24)||!num(s.delay,0,1.2)||(!ult&&!num(s.cooldown,3,9)))throw Error(title+'的数据超出提示词规定的范围。');
      r[key]={name:s.name,kind:s.kind,prompt:s.prompt,power:s.power,delay:s.delay,...(ult?{}:{cooldown:s.cooldown})};
    }
    return {name:r.name,story:r.story,imagePrompt:String(r.imagePrompt||r.story).slice(0,2000),skill:r.skill,skill2:r.skill2,ultimate:r.ultimate};
  }
  async function importSheet(sheet){
    if(sheet.size>12*1024*1024)throw Error('动作图集上限为12 MB。');
    const sig=new Uint8Array(await sheet.slice(0,12).arrayBuffer());
    const png=[137,80,78,71,13,10,26,10].every((n,i)=>sig[i]===n);
    const webp=String.fromCharCode(...sig.slice(0,4))==='RIFF'&&String.fromCharCode(...sig.slice(8,12))==='WEBP';
    if(!png&&!webp)throw Error('请使用透明 PNG 或 WebP 图集。');
    const image=await createImageBitmap(sheet);
    try{
      if(image.width!==1024||image.height!==2048)throw Error('需要1024×2048像素的图集，当前为'+image.width+'×'+image.height+'。');
      const cell=document.createElement('canvas');cell.width=cell.height=256;
      const ctx=cell.getContext('2d',{willReadFrequently:true});
      let standing;
      for(let i=0;i<32;i++){
        ctx.clearRect(0,0,256,256);
        ctx.drawImage(image,i%4*256,Math.floor(i/4)*256,256,256,0,0,256,256);
        const pixels=ctx.getImageData(0,0,256,256).data;
        let left=256,right=-1,top=256,bottom=-1,transparent=false;
        for(let j=0;j<65536;j++){
          const alpha=pixels[j*4+3];if(alpha<16)transparent=true;
          if(alpha<32)continue;
          const x=j%256,y=j>>8;
          left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
        const where='第'+(Math.floor(i/4)+1)+'行第'+(i%4+1)+'列';
        if(right<left)throw Error(where+'没有可见角色。');
        if(!transparent)throw Error(where+'缺少透明背景。');
        if(i===0)standing={left,top,width:right-left+1,height:bottom-top+1};
      }
      const crop=(x,y,w,h)=>{
        const c=document.createElement('canvas');c.width=w;c.height=h;
        c.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);
        return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('待机帧提取失败。')),'image/png'));
      };
      const {left,top,width,height}=standing;
      const side=Math.min(256,Math.max(1,Math.round(height*.45)));
      const x=Math.max(0,Math.min(256-side,Math.round(left+(width-side)/2)));
      const [art,face]=await Promise.all([crop(left,top,width,height),crop(x,Math.min(top,256-side),side,side)]);
      return {sheet,art,face};
    }finally{image.close();}
  }
  async function generate(path,data,signal){
    const endpoint=new URL($('heroEndpoint').value.trim());
    const local=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
    if($('heroMode').value==='local'&&!local)throw Error('本地模式请填写本机接口地址。');
    if(endpoint.protocol!=='https:'&&!(local&&endpoint.protocol==='http:'))throw Error('远程接口需要 HTTPS。');
    const headers={'Content-Type':'application/json'};
    if($('heroMode').value==='api'){if(!$('heroKey').value.trim())throw Error('请填入 API Key。');headers.Authorization='Bearer '+$('heroKey').value.trim();}
    const res=await fetch(endpoint.href.replace(/\/$/,'')+'/'+path,{method:'POST',headers,body:JSON.stringify(data),signal,redirect:'error'});
    if(!res.ok)throw Error('模型请求失败（HTTP '+res.status+'），请检查地址、模型和服务权限。');
    return res.json();
  }
  let controller;
  dialog.onclose=()=>{controller?.abort();$('heroKey').value='';};
  $('heroSubmit').onclick=async()=>{
    const signal=(controller=new AbortController()).signal, m=$('heroMode').value;
    const inputs=Array.from(dialog.querySelectorAll('input,textarea,select,#heroSubmit'));inputs.forEach(n=>n.disabled=true);
    try{
      const upload=$('heroSheet').files[0];
      let blobs=upload?await importSheet(upload):null;
      if(editing===null&&!blobs&&m==='manual')throw Error('请上传一张完整的动作图集。');
      let raw=$('heroJson').value;
      if(m!=='manual'){
        if(!$('heroModel').value.trim())throw Error('请填写文本模型名称。');
        if(editing===null&&!blobs&&!$('heroImageModel').value.trim())throw Error('请上传动作图集，或填写可用的图像模型。纯文本模型可以自动生成技能并配置你上传的图片。');
        status('正在生成角色与招式…');
        const response=await generate('chat/completions',{model:$('heroModel').value.trim(),messages:[{role:'user',content:prompt()+'\n本次只返回 JSON。'}]},signal);
        raw=response.choices?.[0]?.message?.content||'';
      }
      const input=JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi,''));
      const r=validate(slot?{...initial,[slot]:input}:input);
      if(!slot&&!blobs&&m!=='manual'&&(editing===null||$('heroImageModel').value.trim())){
        status('正在生成32帧动作图集…');
        const response=await generate('images/generations',{model:$('heroImageModel').value.trim(),prompt:r.imagePrompt+' 技能动作参考：'+r.skill.prompt+'；'+r.skill2.prompt+'。'+sheetPrompt,size:'1024x2048',n:1},signal);
        const item=response.data?.[0];
        if(item?.b64_json){const bytes=Uint8Array.from(atob(item.b64_json),c=>c.charCodeAt(0));blobs=await importSheet(new Blob([bytes]));}
        else if(item?.url&&new URL(item.url).protocol==='https:'){const res=await fetch(item.url,{signal});if(!res.ok)throw Error('生成图片下载失败');blobs=await importSheet(await res.blob());}
        if(!blobs)throw Error('图像接口未返回可读取的动作图集。');
      }
      signal.throwIfAborted();
      const body=editing,key=slot;
      await lib.update(data=>{
        if(body===null){data.records.push({...r,blobs});return;}
        if(body>=lib.builtinCount&&!data.records[body-lib.builtinCount])throw Error('该英雄已被删除。');
        data.edits||={};
        const id=lib.cast[body].id,old=data.edits[id]||{};
        data.edits[id]={...old,...(key?{...r,...old,[key]:r[key]}:r),...(blobs?{blobs}:{})};
      },body??undefined);
    }catch(e){status(e.name==='AbortError'?'已取消。':e.message);}finally{inputs.forEach(n=>n.disabled=false);}
  };
  $('heroDelete').onclick=async()=>{
    const i=ArenaApp.editorBody,c=lib.cast[i];
    if(lib.active().length<=1){alert('请先添加或还原一名英雄，保留一名可玩的斗士。');return;}
    if(!confirm('删除「'+c.name+'」？'+(i<lib.builtinCount?'可以用还原按钮找回。':'此自创英雄需要重新导入才能找回。')))return;
    try{await lib.update(d=>{if(i<lib.builtinCount)d.hidden=[...new Set([...d.hidden,c.id])];else d.records[i-lib.builtinCount]=null;});}catch(e){alert(e.message);}
  };
  $('heroRestore').onclick=async()=>{if(!lib.cast.slice(0,lib.builtinCount).some(c=>lib.hidden.has(c.id))){alert('原版英雄都在阵容中。');return;}try{await lib.update(d=>{d.hidden=[];});}catch(e){alert(e.message);}};
  mode();
})();
