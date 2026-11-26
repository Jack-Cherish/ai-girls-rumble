// Render adapter. The simulation passes positions and phase; drawing never writes them.
(() => {
  'use strict';
  const A=window.ArenaManifest, old=window.DormArt;
  const still=window.matchMedia('(prefers-reduced-motion: reduce)');
  const bitmap=(path)=>{ const image=new Image(); const loaded=new Promise(resolve=>{
    image.onload=()=>{resolve(true);window.dispatchEvent(new Event('dorm-art-ready'));};
    image.onerror=()=>resolve(false);
  }); image.src=old.assetURL(path); return {image,loaded}; };
  const cast=A.characters.map(ch=>{
    const images={};
    for(const kind of ['full','face','battle']){
      let item;
      Object.defineProperty(images,kind,{get(){return item ||= bitmap('characters/'+ch.id+'/'+kind+'.webp');}});
    }
    return images;
  });
  const layers=A.stage.map(f=>bitmap('stages/meridian/'+f));
  const ok=item=>item?.image.complete&&item.image.naturalWidth>0;
  const body=(p,index)=>Number.isInteger(p?.body)&&cast[p.body]?p.body:(cast[index]?index:0);
  const seatColor=['#8edaff','#ff9b80'];
  function drawStage(c,w,h,t){
    if(!ok(layers[0])){old.drawStage(c,w,h,t);return;}
    c.save();c.scale(w/960,h/400);
    c.fillStyle='#414756';c.fillRect(0,0,960,400);
    const bg=layers[0].image;
    const scale=Math.max(960/bg.naturalWidth,279/bg.naturalHeight);
    c.drawImage(bg,(960-bg.naturalWidth*scale)/2,(279-bg.naturalHeight*scale)*.46,bg.naturalWidth*scale,bg.naturalHeight*scale);
    c.fillStyle='rgba(44,48,72,.17)';c.fillRect(0,0,960,279);
    if(ok(layers[1]))c.drawImage(layers[1].image,0,0,960,400);
    c.fillStyle='#334455';c.fillRect(0,274,960,126);
    if(ok(layers[2]))c.drawImage(layers[2].image,0,0,960,400);
    c.restore();
  }
  function foreground(c,w,h){if(ok(layers[3]))c.drawImage(layers[3].image,0,0,w,h);}
  function drawFighter(c,s,p,t){
    const ix=body(p,s.index), item=cast[ix].battle;
    if(p?.look?.face||!ok(item)){old.drawFighter(c,s,p,t);return;}
    const m=A.animation, a=m.rows.includes(s.action)?s.action:'idle';
    const phased=m.phaseDriven.includes(a);
    const frame=phased?Math.min(3,Math.floor(Math.max(0,s.phase||0)*4)):
      still.matches&&a==='idle'?0:Math.floor((t||0)*m.fps[a])%4;
    c.save();c.translate(s.x,326+(s.depth||0));c.fillStyle='#18212a6b';
    c.beginPath();c.ellipse(0,0,29,5,0,0,Math.PI*2);c.fill();
    c.strokeStyle=seatColor[s.index];c.lineWidth=1.7;c.beginPath();c.ellipse(0,1,25,4,0,.15,Math.PI-.15);c.stroke();c.restore();
    c.save();c.translate(s.x,s.y);c.scale((s.dir<0?-1:1)*m.height/m.cell,m.height/m.cell);
    c.drawImage(item.image,frame*m.cell,m.rows.indexOf(a)*m.cell,m.cell,m.cell,-m.anchor[0],-m.anchor[1],m.cell,m.cell);
    c.restore();
  }
  function drawKey(c,x,y,height,p,index){
    const ix=body(p,index), item=cast[ix].full;
    if(p.look?.face||!ok(item)){
      c.save();c.translate(x,y);c.scale(height/165,height/165);
      old.drawFighter(c,{index,x:0,y:0,depth:-326,dir:index?-1:1,phase:0,action:'idle'},p,0);c.restore();return;
    }
    const source=item.image,w=height*source.width/source.height;
    c.save();c.translate(x,y);c.scale((index===0?1:-1)*A.characters[ix].facing,1);
    c.drawImage(source,-w/2,-height*1460/1536,w,height);c.restore();
  }
  function drawPortrait(c,w,h,p,index){
    const ix=body(p,index),item=cast[ix].face;
    if(p.look?.face||!ok(item)){old.drawPortrait(c,w,h,p,index);return;}
    c.save();c.clearRect(0,0,w,h);c.fillStyle=ix>1?A.characters[ix].color:ix?'#65443d':'#35485f';c.fillRect(0,0,w,h);
    const size=Math.max(w,h);c.drawImage(item.image,(w-size)/2,(h-size)*.27,size,size);c.restore();
  }
  function drawEcho(c,p,index,dir,phase){
    const m=A.animation,item=cast[body(p,index)].battle;
    if(!ok(item)||p.look?.face)return;
    c.save();c.globalAlpha*=.4*(1-phase);c.scale((dir<0?-1:1)*m.height/m.cell,m.height/m.cell);
    c.drawImage(item.image,0,0,m.cell,m.cell,-m.anchor[0],-m.anchor[1]-phase*8,m.cell,m.cell);
    c.restore();
  }
  window.DormArt={...old,drawStage,drawFighter,drawKey,drawPortrait,drawEcho,foreground,ready:Promise.all([old.ready,...layers.map(l=>l.loaded)])};
})();
