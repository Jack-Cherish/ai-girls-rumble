/* Original digitized fighters and campus arena. No controls or game state live here. */
(function () {
  'use strict';

  const scriptURL = document.currentScript && document.currentScript.src;
  const assetURL = name => {
    const path = 'assets/' + (window.DuelAssetVariants?.[name] || name);
    return scriptURL ? new URL(path, scriptURL).href : path;
  };
  const faceCache = new Map();
  const frameCache = new Map();
  const recolorCache = new Map();
  const portraitRequests = new Map();
  const clamps = (n, a, b) => Math.max(a, Math.min(b, n));
  const hasPixels = img => img && img.complete && img.naturalWidth > 0;
  const defaults = [
    { color: '#ff833e', accent: '#ffc56c', hair: 'messy', glasses: false },
    { color: '#49cbd5', accent: '#97ebef', hair: 'long', glasses: false }
  ];
  const poseColumn = { idle: 0, walk: 0, jump: 2, hit: 4, attack: 1, skill: 3, guard: 2, down: 4 };
  // The art is photo-sampled. Head landmarks are measured in source-frame
  // pixels so a full jab or kick cannot make the overlay follow a raised fist.
  const photoLandmarks = [
    [[110,55],[93,50],[96,51],[48,50],[58,52]],
    [[111,51],[96,53],[111,50],[52,52],[65,56]]
  ];

  function surface(w, h) {
    const el = document.createElement('canvas');
    el.width = w;
    el.height = h;
    return el;
  }

  function notifyReady() {
    for (const [canvas, request] of portraitRequests) {
      if (!canvas.isConnected) { portraitRequests.delete(canvas); continue; }
      drawPortrait.apply(null, request);
    }
    window.dispatchEvent(new Event('dorm-art-ready'));
  }

  function loadAsset(name) {
    const image = new Image();
    const ready = new Promise(resolve => {
      image.onload = () => { resolve(true); notifyReady(); };
      image.onerror = () => { resolve(false); notifyReady(); };
    });
    image.src = assetURL(name);
    return { image, ready };
  }

  const sheet = loadAsset('fighters.webp');
  const stage = loadAsset('dorm.webp');
  let fallbackBackdrop;

  function hexRGB(value) {
    if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) return null;
    const n = parseInt(value.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function rgba(rgb, a) { return 'rgba(' + rgb.join(',') + ',' + a + ')'; }
  function imageCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }

  function fallbackStage() {
    if (fallbackBackdrop) return fallbackBackdrop;
    const el = surface(960,400);
    const c = el.getContext('2d');
    const rect = (color,x,y,w,h) => { c.fillStyle = color; c.fillRect(x,y,w,h); };
    const grad = c.createLinearGradient(0,0,960,350);
    grad.addColorStop(0,'#171517'); grad.addColorStop(.51,'#453a38'); grad.addColorStop(1,'#102529');
    c.fillStyle=grad; c.fillRect(0,0,960,400);
    // Transom window, rain-dark campus, plaster walls and built-in study bunks.
    rect('#120f13',336,32,288,177); rect('#797063',340,36,280,169);
    const sky = c.createLinearGradient(0,36,0,198);
    sky.addColorStop(0,'#1b2334'); sky.addColorStop(.75,'#63525c'); sky.addColorStop(1,'#ba896f');
    c.fillStyle=sky; c.fillRect(345,40,270,159);
    for(let i=0;i<12;i++){
      const h=22+(i*43%53), w=18+(i*31%21), x=344+i*23;
      rect(i%2?'#222c39':'#303440',x,199-h,w,h);
      for(let f=0;f<h-12;f+=12) for(let j=0;j<w-8;j+=8) if ((f+j+i)%3) rect('#bc986c',x+4+j,193-f,3,3);
    }
    rect('#453f3e',476,36,7,170); rect('#403c3c',339,102,282,5); rect('#9b8a6e',332,206,296,6);
    for(const x of [0,660]){
      rect('#1c2124',x+5,58,292,187); rect('#776b5d',x+10,65,280,4);
      rect('#756758',x+15,89,269,11); rect('#4a4543',x+16,99,267,27);
      rect('#293137',x+14,127,274,9); rect('#726858',x+13,137,272,6);
      for(const p of [11,280]){rect('#151b1d',x+p,35,9,251);rect('#81745d',x+p,36,2,249);}
      rect('#373737',x+42,173,200,65); rect('#171d21',x+48,179,82,57);
      rect('#2f3c40',x+51,183,76,48); rect('#686252',x+8,239,282,8);
      for(const p of [16,267]) rect('#282725',x+p,249,6,39);
    }
    rect('#6c6051',0,279,960,4);
    const floor = c.createLinearGradient(0,283,0,400);
    floor.addColorStop(0,'#443e38');floor.addColorStop(1,'#26262a');
    c.fillStyle=floor;c.fillRect(0,283,960,117);
    c.strokeStyle='rgba(14,16,17,.55)'; c.lineWidth=2;
    for(let x=-580;x<1600;x+=120){c.beginPath();c.moveTo(480+(x-480)*.46,283);c.lineTo(x,400);c.stroke();}
    for(const y of [302,326,363,398])rect('rgba(14,16,17,.4)',0,y,960,2);
    fallbackBackdrop=el;
    return el;
  }

  function drawStage(c,w,h,t) {
    if (!c || !(w>0 && h>0)) return;
    c.save(); c.imageSmoothingEnabled=true;
    if(hasPixels(stage.image)) imageCover(c,stage.image,0,0,w,h);
    else c.drawImage(fallbackStage(),0,0,w,h);
    const shade=c.createLinearGradient(0,0,0,h);
    shade.addColorStop(0,'rgba(6,7,12,.20)'); shade.addColorStop(.3,'rgba(6,7,12,.02)');
    shade.addColorStop(.85,'rgba(6,7,12,.035)'); shade.addColorStop(1,'rgba(6,7,12,.47)');
    c.fillStyle=shade;c.fillRect(0,0,w,h);
    c.restore();
  }

  function skinLike(r,g,b) {
    return r>52 && g>29 && b>18 && r>g*1.09 && g>b*1.025 && r-b>15 && r-g<100;
  }

  function inspectPixels(bytes,w,h,ix,col) {
    let left=w,right=-1,top=h,bottom=-1;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      if (bytes.data[(y*w+x)*4+3]<55) continue;
      left=Math.min(left,x); right=Math.max(right,x);
      top=Math.min(top,y); bottom=Math.max(bottom,y);
    }
    if (right<=left || bottom<=top) { left=0; right=w-1; top=0; bottom=h-1; }
    const point=photoLandmarks[ix][col];
    const head={ x:point[0]*w/200, y:point[1]*h/260, w:23*w/200, h:31*h/260 };
    return {left,right,top,bottom,head};
  }

  function getFrame(row,col) {
    const key=row+'-'+col;
    if(frameCache.has(key))return frameCache.get(key);
    if(!hasPixels(sheet.image))return null;
    const w=Math.floor(sheet.image.naturalWidth/5),h=Math.floor(sheet.image.naturalHeight/2);
    if(w<1 || h<1)return null;
    const base=surface(w,h),c=base.getContext('2d',{willReadFrequently:true});
    c.drawImage(sheet.image,col*w,row*h,w,h,0,0,w,h);
    // File previews in some browsers permit drawing local images but prevent
    // pixel reads. Their players retain their actor, accessories and face.
    let pixels,info;
    try {
      pixels=c.getImageData(0,0,w,h);
      info=inspectPixels(pixels,w,h,row,col);
    } catch {
      const head=photoLandmarks[row][col];
      info={left:0,right:w-1,top:h*.08,bottom:h*.975,head:{x:head[0]*w/200,y:head[1]*h/260,w:23*w/200,h:31*h/260}};
    }
    const frame={w,h,base,pixels,info};
    frameCache.set(key,frame);return frame;
  }

  function getFace(url) {
    if(typeof url!=='string' || !/^data:image\//i.test(url))return null;
    if(faceCache.has(url))return faceCache.get(url);
    const img=new Image();
    faceCache.set(url,img);
    if(faceCache.size>10)faceCache.delete(faceCache.keys().next().value);
    img.onload=notifyReady;
    img.src=url;
    return img;
  }

  function softenedFace(ctx,img,head) {
    const fw=head.w*1.06,fh=head.h*1.07;
    const stamp=surface(48,60), p=stamp.getContext('2d');
    p.imageSmoothingEnabled=true;
    imageCover(p,img,0,0,48,60);
    p.fillStyle='rgba(91,57,44,.10)';p.fillRect(0,0,48,60);
    p.globalCompositeOperation='destination-in';p.save();
    p.translate(24,29);p.scale(23.5,29.2);
    const fade=p.createRadialGradient(0,-.05,.62,0,0,1);
    fade.addColorStop(0,'#fff');fade.addColorStop(.80,'rgba(255,255,255,.96)');fade.addColorStop(1,'transparent');
    p.fillStyle=fade;p.fillRect(-1,-1,2,2);p.restore();
    ctx.drawImage(stamp,head.x-fw/2,head.y-fh/2,fw,fh);
  }

  function addHairDetail(c,head,hair,body) {
    if (!hair || hair==='cap' || (hair==='long' && body===1) || (hair==='messy' && body===0)) return;
    c.save();
    c.translate(head.x,head.y);
    c.scale(head.w/23,head.h/31);
    if (hair==='long') {
      // A photographed silhouette remains in front of the added ponytail.
      c.globalCompositeOperation='destination-over';
      const shade=c.createLinearGradient(-22,0,-10,0);
      shade.addColorStop(0,'#28242a');shade.addColorStop(.35,'#453c3a');shade.addColorStop(1,'#221f22');
      c.fillStyle=shade;c.beginPath();c.moveTo(-8,-13);c.bezierCurveTo(-25,-16,-20,0,-23,10);
      c.quadraticCurveTo(-25,19,-20,28);c.bezierCurveTo(-21,20,-11,10,-11,1);
      c.quadraticCurveTo(-9,-4,-8,-13);c.fill();
    } else if (hair==='messy') {
      c.fillStyle='rgba(40,34,34,.93)';
      for (let i=0;i<7;i++) {
        const x=-11+i*3; const y=-17-Math.sin(i*.48)*3;
        c.beginPath();c.moveTo(x-2,y+6);c.quadraticCurveTo(x-4,y+2,x+1,y-3);
        c.quadraticCurveTo(x,y+1,x+4,y+4);c.fill();
      }
    } else if (hair==='short') {
      const shade=c.createLinearGradient(-10,-10,3,3);
      shade.addColorStop(0,'#242124');shade.addColorStop(.55,'#352e2d');shade.addColorStop(1,'rgba(55,43,39,.68)');
      c.fillStyle=shade;c.beginPath();c.moveTo(-11,-12);c.quadraticCurveTo(-8,-21,3,-20);
      c.quadraticCurveTo(9,-19,11,-14);c.quadraticCurveTo(2,-14,-4,-9);
      c.lineTo(-8,-2);c.quadraticCurveTo(-10,-3,-11,-12);c.fill();
    }
    c.restore();
  }
  
  function composedFrame(ix,col,look) {
    const frame=getFrame(ix,col);
    if(!frame)return null;
    const face = getFace(look.face);
    const showFace=hasPixels(face);
    const identity=[ix,col,look.color||'',look.accent||'',look.skin||'',look.glasses?'1':'0',look.hair||'',showFace?look.face:''].join('|');
    if(recolorCache.has(identity))return recolorCache.get(identity);
    const out=surface(frame.w,frame.h),c=out.getContext('2d');
    const rgb=hexRGB(look.color),accent=hexRGB(look.accent),skin=hexRGB(look.skin);
    const base=frame.pixels && frame.pixels.data;
    const target=base && c.createImageData(frame.w,frame.h);
    if(target) target.data.set(base);
    const outp=target && target.data;
    for(let j=0;outp && j<outp.length;j+=4){
      if(base[j+3]<8)continue;
      const r=base[j],g=base[j+1],b=base[j+2];
      const facePixel=skinLike(r,g,b);
      // Preserve the photographic luminance, highlights, zips, gloves and trousers.
      const blueFabric=b>=r*1.04 && b>g*.96 && Math.max(r,g,b)-Math.min(r,g,b)>7;
      const plumFabric=r>g*1.10 && b>g*1.03 && r>b*.91;
      const px=(j/4)%frame.w,py=Math.floor(j/(4*frame.w));
      const head=frame.info.head;
      const warmFabric=ix===0 && py>head.y+head.h*.67 && py<head.y+head.h*3.2 &&
        Math.abs(px-head.x)<head.w*1.15 && r>g*1.42 && g>b*1.26 && r-b>32;
      const cloth=ix===0?blueFabric:(plumFabric||blueFabric);
      const color=warmFabric?accent:cloth?rgb:(facePixel?skin:null);
      if(!color)continue;
      const lum=.299*r+.587*g+.114*b;
      const tl=Math.max(28,color[0]*.299+color[1]*.587+color[2]*.114);
      const mix=((cloth||warmFabric)?.60:.28)*Math.min(1,lum/42);
      [0,1,2].forEach(k=>outp[j+k]=clamps(base[j+k]*(1-mix)+color[k]*(lum/tl)*mix,0,255));
    }
    if (target) c.putImageData(target,0,0);
    else c.drawImage(frame.base,0,0);
    addHairDetail(c,frame.info.head,look.hair,ix);
    if(showFace)softenedFace(c,face,frame.info.head);
    const head=frame.info.head;
    if(look.glasses){
      const x=head.x-head.w*.41,y=head.y-head.h*.16,lw=Math.max(.72,head.w*.038);
      c.strokeStyle='rgba(22,24,25,.86)';c.lineWidth=lw;
      c.beginPath();
      c.ellipse(x+head.w*.20,y+head.h*.065,head.w*.18,head.h*.093,-.05,0,2*Math.PI);
      c.moveTo(x+head.w*.76,y+head.h*.06);
      c.ellipse(x+head.w*.62,y+head.h*.06,head.w*.14,head.h*.085,-.05,0,2*Math.PI);
      c.moveTo(x+head.w*.38,y+lw);c.lineTo(x+head.w*.48,y+.5*lw);
      c.moveTo(x+head.w*.02,y+lw);c.lineTo(x-head.w*.18,y-head.h*.06);c.stroke();
    }
    if(look.hair==='cap'){
      const x=head.x,y=head.y-head.h*.47;
      c.fillStyle='#282b2d';c.beginPath();c.ellipse(x-1,y,head.w*.57,head.h*.26,0,Math.PI,Math.PI*2);c.fill();
      c.fillStyle='#48423a';c.fillRect(x-head.w*.52,y-1,head.w*1.20,Math.max(2,head.h*.09));
    }
    const composed={image:out,info:frame.info};
    if(recolorCache.size>76)recolorCache.delete(recolorCache.keys().next().value);
    recolorCache.set(identity,composed);return composed;
  }

  function groundedShadow(c,x,y,w,h,alpha) {
    c.save();c.translate(x,y);c.scale(w,h);
    const v=c.createRadialGradient(0,0,.05,0,0,1);
    v.addColorStop(0,'rgba(7,5,9,'+alpha+')');v.addColorStop(.45,'rgba(7,5,9,'+(alpha*.68)+')');
    v.addColorStop(1,'rgba(7,5,9,0)');
    c.fillStyle=v;c.fillRect(-1,-1,2,2);c.restore();
  }

  function fallbackPerson(c,look,action) {
    const punch=action==='attack'||action==='skill',guard=action==='guard';
    const rect=(k,x,y,w,h)=>{c.fillStyle=k;c.fillRect(x,y,w,h);};
    const line=(k,width,pts)=>{c.strokeStyle=k;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();};
    line('#282d32',15,[[-5,-52],[-20,-27],[-25,-6]]);line('#38373d',15,[[4,-50],[15,-33],[25,-7]]);
    line('#17191c',8,[[-27,-5],[-19,-4]]);line('#191a1c',8,[[23,-5],[33,-4]]);
    const coat=look.color||'#955535',skin=look.skin||'#c99776';
    line(coat,28,[[-4,-87],[-2,-60]]);line('#d5c7af',2,[[-2,-86],[1,-68]]);
    line(coat,11,[[-9,-88],[-18,-75],[-12,-85]]);line(skin,7,[[-13,-84],[-6,-91]]);
    const front=guard?[[8,-86],[15,-86],[12,-101]]:punch?[[9,-86],[27,-87],[42,-91]]:[[10,-86],[22,-75],[29,-87]];
    line(coat,11,front);line(skin,6,[front[1],front[2]]);
    c.fillStyle=skin;c.beginPath();c.ellipse(2,-105,10,13,0,0,Math.PI*2);c.fill();
    c.fillStyle='#252325';c.beginPath();c.ellipse(0,-112,11,8,0,Math.PI*.8,Math.PI*2);c.fill();
    if(hasPixels(getFace(look.face)))softenedFace(c,getFace(look.face),{x:2,y:-105,w:19,h:24});
    if(look.glasses){rect('#282426',-4,-107,6,2);rect('#282426',4,-107,6,2);}
  }

  function drawFighter(c,state,player,t) {
    if(!c||!state)return;
    const ix=state.index===1?1:0;
    const body=player && (player.body===0 || player.body===1)?player.body:ix;
    const look=(player&&player.look)||defaults[body];
    const a=state.action||'idle',phase=clamps(+state.phase||0,0,1), dir=state.dir<0?-1:1;
    const walk=a==='walk',jump=a==='jump',down=a==='down',hit=a==='hit';
    const gait=walk?Math.sin(phase*Math.PI*2):0;
    const bob=walk?Math.abs(gait)*2.1:(a==='idle'?Math.sin(phase*Math.PI*2)*.85:0);
    let col=poseColumn[a]||0;
    if((a==='attack'||a==='skill')&&phase>.86)col=0;
    const f=composedFrame(body,col,look);
    const y=state.y||0,x=state.x||0;
    const ground=326+(Number.isFinite(state.depth)?state.depth:0);
    groundedShadow(c,x,Math.max(ground,y)+1,clamps(36-(ground-y)*.14,11,36),5.4,clamps(.56-(ground-y)*.004,.12,.56));
    c.save();c.translate(x,y-bob);c.scale(dir,1);
    if(a==='attack' && state.attackStage){
      const strike=Math.sin(Math.PI*phase);
      const followUp=state.attackStage===2;
      c.translate(strike*(followUp?7:3),followUp?4*strike:0);
      c.rotate(strike*(followUp?.064:.025));
    }
    if(down){c.rotate(-Math.PI*.43*clamps(phase,0,1));}
    if(hit)c.rotate(-.045*(1-phase));
    if(jump)c.rotate(-.045);
    if(walk)c.rotate(.012*gait);
    if(f){
      const img=f.image,b=f.info;
      const idle=getFrame(body,0);
      const h0=idle?(idle.info.bottom-idle.info.top+1):img.height;
      const factor=148/Math.max(h0,100);
      const bodyWidth=img.width*factor,bodyHeight=img.height*factor;
      c.imageSmoothingEnabled=true;
      c.drawImage(img,-bodyWidth/2,-(b.bottom+1)*factor,bodyWidth,bodyHeight);
    }else fallbackPerson(c,look,a);
    c.restore();
  }

  function drawPortrait(c,w,h,player,index) {
    if(!c || !(w>0 && h>0))return;
    index=index===1?1:0;
    const body=player && (player.body===0 || player.body===1)?player.body:index;
    const look=(player&&player.look)||defaults[body];
    const face=getFace(look.face);
    if(!hasPixels(sheet.image) || (face&&!hasPixels(face)))portraitRequests.set(c.canvas,[c,w,h,player,index]);
    else portraitRequests.delete(c.canvas);
    const tone=hexRGB(look.color)||hexRGB(defaults[index].color);
    c.save(); c.clearRect(0,0,w,h);
    const backdrop=c.createLinearGradient(0,h,w,0);
    backdrop.addColorStop(0,'#141314');backdrop.addColorStop(.58,rgba(tone,.22));backdrop.addColorStop(1,'#242125');
    c.fillStyle='#19171a';c.fillRect(0,0,w,h);c.fillStyle=backdrop;c.fillRect(0,0,w,h);
    c.save(); c.strokeStyle=rgba(tone,.13);c.lineWidth=1;
    for(let x=-h;x<w;x+=Math.max(11,w/14)){c.beginPath();c.moveTo(x,h);c.lineTo(x+h,0);c.stroke();}
    c.restore();
    const f=composedFrame(body,0,look);
    if(f){
      const head=f.info.head;
      const charH=f.info.bottom-f.info.top+1;
      // Keep a face and the leading shoulder in frame even on wide roster tiles.
      const zoom=Math.max(h/(charH*.51),Math.min(w/(charH*.72),h/(charH*.39)));
      c.save();c.translate(w*(index?.53:.47),h*.30);
      if(index===1)c.scale(-1,1);
      c.imageSmoothingEnabled=true;c.drawImage(f.image,-head.x*zoom,-head.y*zoom,f.image.width*zoom,f.image.height*zoom);c.restore();
    }else{
      const z=h/76;c.save();c.translate(w*.49,h*.30+105*z);c.scale(index===1?-z:z,z);fallbackPerson(c,look,'guard');c.restore();
    }
    const vignette=c.createLinearGradient(0,0,0,h);
    vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(.73,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(9,8,8,.34)');
    c.fillStyle=vignette;c.fillRect(0,0,w,h);c.restore();
  }

  window.DormArt={assetURL,drawStage,drawFighter,drawPortrait,ready:Promise.all([stage.ready,sheet.ready])};
})();
