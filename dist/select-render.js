'use strict';
const SELECT_CAST=[{"name": "DeepSeek", "title": "深海回响", "role": "近身突进", "color": "#7ac7ff", "art": "assets/select-hd/tide-art.webp", "face": "assets/select-hd/tide-face.webp", "facesRight": true, "id": "tide"}, {"name": "Claude", "title": "终章校订", "role": "远程牵制", "color": "#ffab79", "art": "assets/select-hd/quill-art.webp", "face": "assets/select-hd/quill-face.webp", "facesRight": false, "id": "quill"}, {"name": "ChatGPT", "title": "白翼译者", "role": "近身防反", "color": "#9ce8d4", "art": "assets/select-hd/chatgpt-art.webp", "face": "assets/select-hd/chatgpt-face.webp", "facesRight": true, "id": "chatgpt"}, {"name": "Gemini", "title": "双星观测员", "role": "星轨追击", "color": "#c4b1ff", "art": "assets/select-hd/gemini-art.webp", "face": "assets/select-hd/gemini-face.webp", "facesRight": true, "id": "gemini"}, {"name": "Grok", "title": "绯夜叛客", "role": "贴身强攻", "color": "#ff869c", "art": "assets/select-hd/grok-art.webp", "face": "assets/select-hd/grok-face.webp", "facesRight": true, "id": "grok"}, {"name": "Kimi", "title": "月海琴师", "role": "远程牵制", "color": "#d4ceff", "art": "assets/select-hd/kimi-art.webp", "face": "assets/select-hd/kimi-face.webp", "facesRight": true, "id": "kimi"}, {"name": "豆包", "title": "双影玩偶师", "role": "远程守护", "color": "#dcc0ff", "art": "assets/select-hd/doubao-art.webp", "face": "assets/select-hd/doubao-face.webp", "facesRight": true, "id": "doubao"}, {"name": "MiniMax", "title": "海螺信使", "role": "贴身防守", "color": "#ffca8e", "art": "assets/select-hd/minimax-art.webp", "face": "assets/select-hd/minimax-face.webp", "facesRight": true, "id": "minimax"}, {"name": "GLM", "title": "黑白司书", "role": "中距控制", "color": "#c3c5df", "art": "assets/select-hd/glm-art.webp", "face": "assets/select-hd/glm-face.webp", "facesRight": true, "id": "glm"}, {"name": "千问", "title": "紫扇行者", "role": "扇影游击", "color": "#c0b0ff", "art": "assets/select-hd/qwen-art.webp", "face": "assets/select-hd/qwen-face.webp", "facesRight": true, "id": "qwen"}];
for (const id of ['laoda','nailong']) {
  const fighter=ArenaManifest.characters.find(c=>c.id===id);
  SELECT_CAST.push({...fighter, facesRight:id==='nailong',
    art:'assets/select-hd/'+id+'-art.webp', face:'assets/select-hd/'+id+'-face.webp'});
}

function rosterPageSize(width,height){return height>width?10:12;}

const aiModes = new Map([['combined','谈判＋拍卖'], ['bargain','仅谈判'], ['auction','仅拍卖']]);
const classicModes = new Map([['cpu','人机对战'], ['duo','双人同屏'], ['online','好友联机']]);
function compose(ctx,W,H,assets,state,time){
 const tall=H>W;
 const unit=W/(tall?720:1280);ctx.save();ctx.scale(unit,unit);const w=W/unit,h=H/unit;
 const hits=[],top=tall?108:78,foot=h-(tall?61:46),rowH=tall?168:92,rosterY=foot-rowH-15,stageH=rosterY-top-27,base=top+stageH;
 const colors=['#e6fa39','#ff687f'];
 const paper='#f5efdf';
 const {picks,locks,seat,entered,lockedAt}=state;
 function text(v,x,y,size,color,options={}){ctx.save();ctx.fillStyle=color;ctx.font=(options.italic?'italic ':'')+(options.weight||700)+' '+size+'px '+(options.serif?'"Noto Serif CJK SC","Songti SC",serif':'"Arial","Noto Sans CJK SC",sans-serif');ctx.textAlign=options.align||'left';ctx.textBaseline='middle';ctx.fillText(v,x,y,options.max||w);ctx.restore()}
 function rect(x,y,width,height,c){ctx.fillStyle=c;ctx.fillRect(x,y,width,height)}
 function line(x,y,x2,y2,c,l=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=c;ctx.lineWidth=l;ctx.stroke()}
 function poly(points,c,edge,l=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(c){ctx.fillStyle=c;ctx.fill()}if(edge){ctx.lineWidth=l;ctx.strokeStyle=edge;ctx.stroke()}}
 function circ(x,y,r,c,edge,l=1){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(c){ctx.fillStyle=c;ctx.fill()}if(edge){ctx.lineWidth=l;ctx.strokeStyle=edge;ctx.stroke()}}
 function hit(id,x,y,width,height,label){hits.push({id,x:x*unit,y:y*unit,w:width*unit,h:height*unit,label})}
 const training=state.mode==='training';
 const seatName=j=>training?(j?'假人':'玩家'):(j+1)+'P';
 function stateTag(j){return locks[j]?'已锁定':seat===j?'选人中':'待选择'}
 function imgFit(img,x,bottom,width,height,flip){const q=Math.min(width/img.width,height/img.height);ctx.save();ctx.translate(x,bottom);ctx.scale(flip?-1:1,1);ctx.drawImage(img,-img.width*q/2,-img.height*q,img.width*q,img.height*q);ctx.restore()}
 function grad(x,y,x2,y2,stops){const g=ctx.createLinearGradient(x,y,x2,y2);stops.forEach(([p,c])=>g.addColorStop(p,c));return g}
 function badge(x,y,txt,c){ctx.save();ctx.translate(x,y);ctx.transform(1,0,-.17,1,0,0);rect(0,0,105,27,'#19191d');text(txt,9,14,14,c);ctx.restore()}
 rect(0,0,w,h,paper);
  rect(0,top,w,stageH+4,'#ebe6d6');
  poly([[0,top],[w*.58,top],[w*.41,base],[0,base]],'#d6e830');
  poly([[w*.64,top],[w,top],[w,base],[w*.45,base]],'#ff8b96');
  for(let j=0;j<2;j++){ctx.save();ctx.beginPath();ctx.rect(j*w/2,top,w/2,stageH);ctx.clip();const x=j?w*.84:w*.13,y=top+stageH*.5;for(let i=0;i<25;i++){let a=i*.254+.1;const radi=1900;poly([[x+Math.cos(a)*100,y+Math.sin(a)*105],[x+Math.cos(a+.004)*radi,y+Math.sin(a+.004)*radi],[x+Math.cos(a+.018)*radi,y+Math.sin(a+.018)*radi]],'#17172015')}ctx.restore()}
  for(let v=0;v<13;v++)for(let u=0;u<30;u++){let r=(1-v/14)*(1-u/31)*3.5;if(r>.4){circ(6+u*9+(v%2)*4,top+5+v*9,r,'#292716a0');circ(w-6-u*9-(v%2)*4,base-5-v*9,r,'#36252d88')}}
  poly([[w*.565,top],[w*.592,top],[w*.492,top+stageH*.44],[w*.531,top+stageH*.42],[w*.425,base],[w*.403,base],[w*.488,top+stageH*.52],[w*.448,top+stageH*.55]],'#14141b');
 for(let j=0;j<2;j++){
  const a=assets[picks[j]],sgn=j===0?1:-1,change=Math.max(0,time-entered[j]),f=Math.min(1,change/.34),e=1-Math.pow(1-f,3),lockT=time-lockedAt[j];
  const mid=w*(j===0?.25:.75),x=mid+sgn*(tall?7:22);let bottom=base-7,height=stageH*.95;
  const frameW=tall?w*.46:Math.min(w*.36,stageH*.96);
  const img=a.artImg,limitW=Math.min(w*(tall?.53:.4),600);
  const actualH=Math.min(height,limitW*img.height/img.width);
  if(tall)bottom=Math.min(base-48,top+stageH*.51+actualH*.5);
  ctx.save();ctx.beginPath();ctx.rect(j*w/2,top,w/2,stageH);ctx.clip();
  const flip=a.facesRight!==(j===0);
  if(f<1){ctx.save();ctx.globalAlpha=(1-f)*.7;for(let b=0;b<7;b++){const yy=top+stageH*(.2+b*.095);poly([[x-sgn*200,yy],[x+sgn*75,yy-8],[x+sgn*95,yy],[x-sgn*195,yy+14]],b%2?'#fff7db':'#191821')}ctx.restore()}
  ctx.save();
  ctx.translate(-sgn*(1-e)*w*.18,0);ctx.scale(1+(1-e)*.04,1)
  imgFit(img,x,bottom,limitW,height,flip);ctx.restore();
  if(lockT>=0&&lockT<.40){const t=lockT/.40;ctx.globalAlpha=(1-t)*.62;for(let i=0;i<7;i++){const px=x+Math.cos(i*.9)*frameW*.48,py=top+stageH*.52+Math.sin(i*.9)*stageH*.4;line(x+(px-x)*(.6+t*.23),py+12,px+sgn*30*t,py,'#fffce6',5)}ctx.globalAlpha=1}
  if(change>=0&&change<.29){const t=change/.29;ctx.save();ctx.translate(x-sgn*(1-t)*75,top+stageH*.37);ctx.rotate(-sgn*.07);ctx.globalAlpha=Math.min(1,(1-t)*3);const bw=frameW*.72,bh=58;poly([[-bw/2+13,-bh/2],[bw/2,-bh/2],[bw/2-13,bh/2],[-bw/2,bh/2]],'#fff7da');ctx.clip();const face=a.faceImg;const fw=face.width*.88,fh=fw*bh/bw;ctx.drawImage(face,(face.width-fw)/2,face.height*.43-fh/2,fw,fh,-bw/2,-bh/2,bw,bh);rect(-bw/2,-bh/2,bw,4,'#181621');rect(-bw/2,bh/2-4,bw,4,'#181621');ctx.restore()}
  if(lockT>=0&&lockT<.6){const t=lockT/.6;ctx.save();ctx.translate(x,top+stageH*.72);ctx.rotate(-.10);ctx.scale(1+.33*Math.max(0,1-t*5),1+.33*Math.max(0,1-t*5));ctx.globalAlpha=Math.min(1,(1-t)*5);poly([[-79,-23],[84,-23],[74,22],[-88,22]],colors[j],'#15151a',4);text('已锁定',0,0,28,'#15151a',{align:'center',italic:true});ctx.restore()}
  ctx.restore();
  const edge=j?w-(tall?18:35):(tall?18:35),align=j?'right':'left';
  badge(j?w-132:30,top+13,seatName(j)+'  '+stateTag(j),colors[j]);
   const stripY=base-(tall?70:68);ctx.save();ctx.translate(edge,stripY);const width=Math.min(w*.4,285);poly([[0,-12],[sgn*width,-19],[sgn*(width-26),31],[0,38]],'#17151d');text(a.name.toUpperCase(),sgn*11,7,tall?26:30,'#fff6e6',{align,italic:true,max:width-36});ctx.restore();text(a.title+'  /  '+a.role,edge+sgn*7,base-14,tall?15:16,'#17151d',{align})
  hit('seat'+j,j*w/2,top,w/2,stageH,'切换到 '+seatName(j))
 }
 rect(0,0,w,top,'#17161b');poly([[0,0],[tall?275:359,0],[tall?245:325,top],[0,top]],'#e6fa39');text(training?'训练选人':'斗士选择',tall?20:35,top*.49,tall?39:41,'#19171b',{italic:true,weight:900});if(!tall)text(training?'TRAINING':'FIGHTER SELECT',219,top*.58,12,'#242125',{italic:true});
 const markY=top+stageH*.53;
 ctx.save();ctx.translate(w/2,markY);ctx.rotate(-.11);poly([[-40,-19],[-5,-28],[23,-48],[20,-25],[43,-29],[32,-4],[55,-6],[23,12],[24,32],[-5,21],[-39,38],[-28,12],[-51,17]],'#f3f4ce','#191720',3);text('VS',0,2,32,'#1d1a24',{align:'center',italic:true,weight:900});ctx.restore()
 const pageSize=rosterPageSize(W,H),pageStart=(state.rosterPage||0)*pageSize,cols=tall?5:Math.min(assets.length,pageSize),margin=tall?16:31,gap=8,cw=(w-margin*2-gap*(cols-1))/cols,ch=tall?(rowH-9)/2:rowH;
 rect(0,rosterY-24,w,foot-rosterY+24,'#17161b');
 if(assets.length>pageSize){const pages=Math.ceil(assets.length/pageSize);text('◀   '+(1+pageStart/pageSize)+' / '+pages+'   ▶',w/2,rosterY-12,16,'#fff',{align:'center'});hit('prevPage',w/2-80,rosterY-25,80,25,'上一页');hit('nextPage',w/2,rosterY-25,80,25,'下一页');}
 text('斗士阵容',margin,rosterY-11,14,'#f7f0e0');line(margin+78,rosterY-11,w-margin-106,rosterY-11,'#666258');
 text(locks.every(Boolean)?'双方已锁定':seatName(seat)+'  '+stateTag(seat),w-margin,rosterY-11,14,colors[seat],{align:'right'});
 assets.slice(pageStart,pageStart+pageSize).forEach((a,cell)=>{const i=pageStart+cell,xx=margin+(cell%cols)*(cw+gap),yy=rosterY+Math.floor(cell/cols)*(ch+8),sel=picks.map(n=>n===i),on=sel.some(Boolean);ctx.save();
  poly([[xx+8,yy],[xx+cw,yy],[xx+cw-8,yy+ch],[xx,yy+ch]],a.color);ctx.clip();
  const img=a.faceImg,zoom=Math.max(cw/img.width,ch/img.height);ctx.drawImage(img,xx+(cw-img.width*zoom)/2,yy+(ch-img.height*zoom)/2,img.width*zoom,img.height*zoom);
  rect(xx,yy+ch*.58,cw,ch*.42,grad(0,yy+ch*.58,0,yy+ch,[[0,'#0c102000'],[1,'#0c1020f0']]));
  text(a.name,xx+cw/2,yy+ch-10,tall?14:15,'#fff6e7',{align:'center',max:cw-10});ctx.restore();
  if(on){const col=sel[0]?colors[0]:colors[1];poly([[xx+8,yy],[xx+cw,yy],[xx+cw-8,yy+ch],[xx,yy+ch]],null,col,3);
   const tag=sel.every(Boolean)?(training?'双方':'1P·2P'):seatName(sel[0]?0:1);let width=sel.every(Boolean)?39:24;rect(xx+cw/2-width/2,yy,width,14,col);text(tag,xx+cw/2,yy+7.5,11,'#181926',{align:'center'})}
  hit('pick'+i,xx,yy,cw,ch,'选择 '+a.name)
 });
 rect(0,foot,w,h-foot,'#25232a');const bw=tall?188:160,fh=h-foot;
 text('⇄  切换选手席',margin,foot+fh/2,tall?21:16,'#eee8d5');hit('switch',0,foot,bw+margin,fh,'切换选手席');
 if(state.aiMode||training){
  const modeLabel=training?'训练模式':aiModes.get(state.aiMode);
  const mw=state.aiMode?235:tall?160:175,mx=(w-mw)/2;
  rect(mx,foot+5,mw,fh-10,'#343239');
  text(training?modeLabel:modeLabel+'  ⇄',w/2,foot+fh/2,tall?20:17,'#eee8d5',{align:'center'});
  if(!training)hit('mode',mx,foot,mw,fh,'切换模式，当前'+modeLabel);
 }else{
  const cellWidth=tall?100:150;
  let x=(w-cellWidth*classicModes.size)/2;
  for(const [id,label] of classicModes){
   const active=state.mode===id;
   rect(x+2,foot+5,cellWidth-4,fh-10,active?'#eee8d5':'#343239');
   text(label,x+cellWidth/2,foot+fh/2,tall?16:17,active?'#1c1a24':'#eee8d5',{align:'center'});
   hit('mode:'+id,x,foot,cellWidth,fh,(active?'当前：':'切换到')+label);
   x+=cellWidth;
  }
 }
 const action=state.mode==='online'?'进入联机':locks.every(Boolean)?(training?'开始训练':state.aiMode==='auction'?'进入拍卖':state.aiMode?'进入谈判':'开始对战'):(locks[seat]?'解锁 ':'锁定 ')+seatName(seat);
 rect(w-bw-margin,foot+5,bw,fh-10,colors[seat]);text(action,w-margin-bw/2,foot+fh/2,tall?22:18,'#1c1a24',{align:'center'});hit('confirm',w-bw-margin,foot,bw,fh,action);
 ctx.restore();return hits
}
function startingState(time=0){return {picks:[Math.min(2,SELECT_CAST.length-1),Math.min(4,SELECT_CAST.length-1)],locks:[false,false],seat:0,entered:[time-2,time-2],lockedAt:[-1e6,-1e6]}}
function act(s,id,t){
 if(id.startsWith('seat')){s.seat=Number(id.slice(4));return}
 if(id==='switch'){s.seat=1-s.seat;return}
 if(id.startsWith('pick')){const n=Number(id.slice(4));if(!s.locks[s.seat]&&n!==s.picks[s.seat]){s.picks[s.seat]=n;s.entered[s.seat]=t}return}
 if(id==='confirm'){if(s.locks.every(Boolean)){s.locks=[false,false];s.lockedAt=[-1e6,-1e6];s.seat=0;return}const j=s.seat;s.locks[j]=!s.locks[j];s.lockedAt[j]=s.locks[j]?t:-1e6;if(s.locks[j]&&!s.locks[1-j])s.seat=1-j}
}

