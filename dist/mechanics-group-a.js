/* Role-specific authoritative mechanics + procedural canvas FX. No random state. */
(function(root){
'use strict';
const ids=['tide','chatgpt','gemini'];
const palettes={tide:['#67ddec','#e1ffff','#3979b1'],chatgpt:['#d4b9ff','#fff8ff','#865dc9'],gemini:['#b395ff','#fff0a4','#60ddff']};
function release(c){
 const {f,enemy,m,dir,y,distance,shots,addFX,landHit,charge,clamp,aligned}=c;
 const id=c.id||c.char||c.characterId;
 if(!ids.includes(id)||m.type==='attack')return false;
 const ult=m.type==='ultimate',s=ult?f.kit.ultimate:f.kit[m.type];
 if(!s)return false;
 const fx=(style,x=f.x,yy=y-60,extra={})=>addFX('identity',x,yy,palettes[id][0],ult?.78:.55,{owner:f.index,identity:id,style,dir,...extra});
 const hit=(power,reach,width=26)=>distance>=-12&&distance<=reach&&aligned(f,enemy,width)&&Math.abs(f.y-enemy.y)<100&&landHit(f,enemy,power,dir,ult?'ultimate':'skill');
 const shot=(dx,depth,power,style,ultimate=false,delay=0)=>c.spawnShot({x:f.x+dir*dx,y:f.y+depth-59,depth,dir,color:palettes[id][0],life:ultimate?.9:1.48,damage:power,ultimate,identity:id,style,delay,speed:ultimate?700:530,radius:ultimate?24:18,...(ultimate&&id==='gemini'?{hitStyle:style==='star3'?'ultimate':'light',pushback:style==='star3'?410:0}:{})});
 if(id==='tide'){
  if(ult||s.kind==='dash') {const start=f.x; m.hit=hit(s.power,ult?300:213);f.x=clamp(f.x+dir*(ult?181:177),32,928);fx('whale',start,y-55,{end:f.x,ultimate:ult});}
  else if(s.kind==='burst') {const towards=enemy.x>=f.x?1:-1;m.hit=Math.abs(enemy.x-f.x)<151&&aligned(f,enemy,30)&&Math.abs(f.y-enemy.y)<95&&landHit(f,enemy,s.power,towards,'skill');if(m.hit&&!(enemy.guard&&enemy.dir===-towards)&&!enemy.shield)enemy.recoil=towards*310;fx('sonar',f.x,y-12);}
  else if(s.kind==='projectile'){shot(30,f.depth,s.power,'sonar');fx('bubble');}
  else return false;
 }else if(id==='chatgpt'){
  if(ult){m.hit=hit(s.power,300,34);const start=f.x;f.x=clamp(f.x+dir*181,32,928);fx('dragon',start,y-65,{end:f.x});}
  else if(s.kind==='shield'){f.shield=1.1;f.shieldEarned=false;fx('wings');}
  else if(s.kind==='burst'){const charged=f.shield>0&&f.shieldEarned;const towards=enemy.x>=f.x?1:-1;const reach=charged?175:145;m.hit=Math.abs(enemy.x-f.x)<reach&&aligned(f,enemy,30)&&Math.abs(f.y-enemy.y)<95&&landHit(f,enemy,s.power+(charged?6:0),towards,'skill');if(charged){f.shield=0;f.shieldEarned=false;}fx('tail',f.x,y-45,{charged,reach});}
  else return false;
 }else if(id==='gemini'){
  if(ult){for(let j=0;j<4;j++)shot(30,f.depth+(j%2?12:-12),j===3?s.power-3*Math.floor(s.power/4):Math.floor(s.power/4),'star'+j,true,j*.10);fx('constellation');}
  else if(s.kind==='projectile'){shot(30,f.depth-9,Math.ceil(s.power/2),'star0');shot(30,f.depth+9,Math.floor(s.power/2),'star1',false,.12);fx('twins');}
  else if(s.kind==='dash'){const start=f.x,oldDepth=f.depth;f.depth=clamp(f.depth+(f.depth>0?-24:24),-36,40);m.hit=hit(s.power,213,25);f.x=clamp(f.x+dir*151,32,928);fx('orbit',start,f.y+oldDepth-65,{end:f.x,depthEnd:f.depth-oldDepth});}
  else return false;
 }
 if(m.hit&&!ult)charge(f);return true;
}
function star(ctx,x,y,r,color,angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();for(let i=0;i<8;i++){let a=i*Math.PI/4,v=i%2?r*.23:r;ctx.lineTo(Math.cos(a)*v,Math.sin(a)*v);}ctx.closePath();ctx.fill();ctx.restore();}
function feather(ctx,x,y,s,a,color){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(s,s);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-25);ctx.bezierCurveTo(20,-15,13,4,0,25);ctx.bezierCurveTo(-7,8,-10,-9,0,-25);ctx.fill();ctx.strokeStyle='#a987d4';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(0,25);ctx.stroke();ctx.restore();}
function effect(ctx,e){
 if(e.kind!=='identity'||!ids.includes(e.identity))return false;
 const u=Math.max(0,Math.min(1,1-e.life/e.max)),p=palettes[e.identity];ctx.save();ctx.translate(e.x,e.y);ctx.scale(e.dir||1,1);ctx.globalAlpha=Math.min(1,(1-u)*2);ctx.lineCap='round';ctx.lineJoin='round';
 if(e.style==='whale'){
  const len=Math.abs(e.end-e.x),x=len*u;ctx.translate(x,0);ctx.fillStyle=p[0];ctx.strokeStyle=p[1];ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-83,12);ctx.bezierCurveTo(-48,-42,27,-39,52,-2);ctx.bezierCurveTo(66,17,29,35,-25,23);ctx.lineTo(-59,30);ctx.lineTo(-80,51);ctx.lineTo(-74,21);ctx.lineTo(-105,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=p[1];ctx.beginPath();ctx.ellipse(22,14,22,9,-.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#254b79';ctx.beginPath();ctx.arc(36,-3,3,0,7);ctx.fill();
  for(let i=0;i<9;i++){ctx.strokeStyle=i%2?p[0]:p[1];ctx.beginPath();ctx.moveTo(-85-i*12,12+i%3*9);ctx.quadraticCurveTo(-110-i*12,28,-140-i*12,17);ctx.stroke();}
 }else if(e.style==='sonar'||e.style==='bubble'){
  for(let j=0;j<3;j++){let t=Math.max(0,(u-j*.12)/(1-j*.12));ctx.globalAlpha=(1-t)*.8;ctx.strokeStyle=p[j];ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,12+145*t,3+30*t,0,0,7);ctx.stroke();}
  for(let j=0;j<12;j++){let a=j*2.4;ctx.fillStyle=p[j%3];ctx.beginPath();ctx.arc(Math.cos(a)*115*u,Math.sin(a)*20*u-25*u,2+(j%3),0,7);ctx.fill();}
 }else if(e.style==='wings'||e.style==='dragon'){
  if(e.style==='dragon')ctx.translate(Math.abs(e.end-e.x)*u,0);
  for(let side of [-1,1]){ctx.save();ctx.scale(side,1);ctx.fillStyle=p[1];ctx.strokeStyle=p[0];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(4,20);ctx.bezierCurveTo(26,-4,35,-77,83,-62);ctx.lineTo(63,-39);ctx.lineTo(77,-29);ctx.lineTo(50,-12);ctx.lineTo(55,0);ctx.quadraticCurveTo(25,12,4,20);ctx.globalAlpha*=e.style==='wings'?.2:.65;ctx.fill();ctx.globalAlpha*=e.style==='wings'?3.5:1;ctx.stroke();ctx.restore();}
  for(let j=0;j<7;j++)feather(ctx,(j-3)*25*u,-30+j%3*15+u*28,.3,j*.7+u,p[1]);
 }else if(e.style==='tail'){
  const count=e.charged?12:7;
  for(let j=0;j<count;j++){const t=j/(count-1),x=25+t*e.reach*.65+u*24,y=4+Math.sin(t*3.2)*13+(j%2?1:-1)*u*24;feather(ctx,x,y,(e.charged?.25:.18)*(1-u*.5),-.7+t*.4+u*.5,e.charged?'#fff0bf':p[1]);}
  for(let j=0;j<4;j++)star(ctx,55+j*19+u*12,-6+(j%2?12:-12)*(1+u),3*(1-u),e.charged?'#ffe6a1':p[0],j+u);
 }else{
  const span=e.style==='orbit'?Math.abs(e.end-e.x):100;
  if(e.style==='orbit'){ctx.strokeStyle=p[0];ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(span*.3,-65,span*.7,65+e.depthEnd,span,e.depthEnd);ctx.stroke();}
  const count=e.style==='constellation'?7:2;
  let points=[];for(let j=0;j<count;j++){let a=j*2.399+u*1.5,x=e.style==='orbit'?span*u:Math.cos(a)*(25+65*u),y=Math.sin(a)*(25+30*u);points.push([x,y]);star(ctx,x,y,10+(1-u)*6,p[j%3],a);}
  if(count>2){ctx.strokeStyle=p[0];ctx.lineWidth=1;ctx.beginPath();points.forEach(([x,y])=>ctx.lineTo(x,y));ctx.closePath();ctx.stroke();}
 }
 ctx.restore();return true;
}
function projectile(ctx,p,env){const elapsed=env.elapsed||0;if(!ids.includes(p.identity))return false;const colors=palettes[p.identity];ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.dir,1);if(p.identity==='gemini'){ctx.strokeStyle=colors[0];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-52,0);ctx.quadraticCurveTo(-23,Math.sin(elapsed*20)*13,0,0);ctx.stroke();star(ctx,0,0,p.ultimate?17:13,colors[p.style==='star0'?2:1],elapsed*6);star(ctx,-23,4,5,colors[0],elapsed*5);}else {ctx.strokeStyle=colors[1];ctx.lineWidth=2;for(let j=0;j<3;j++){ctx.beginPath();ctx.arc(-j*11,0,7+j*3,-1.1,1.1);ctx.stroke();}}ctx.restore();return true;}
const api=Object.fromEntries(ids.map(id=>[id,{release:c=>release({...c,id}),drawEffect:(ctx,e,env)=>{if(e.kind==='cast')return effect(ctx,{...e,kind:'identity',identity:id,style:id==='tide'?'bubble':id==='chatgpt'?'wings':'twins'});return effect(ctx,e,env);},drawShot:projectile}]));
api.chatgpt.drawAura=function(ctx,f,env){if(!f.shield)return false;ctx.save();ctx.translate(f.x,f.y-100);ctx.scale(f.facing||f.dir||1,1);const pulse=.04*Math.sin((env.elapsed||0)*5);for(let side of [-1,1]){ctx.save();ctx.scale(side,1);ctx.globalAlpha=.25+pulse;ctx.fillStyle=f.shieldEarned?'#fff0bc':'#e7d7ff';ctx.strokeStyle=f.shieldEarned?'#ffe59b':'#c6a8f5';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(12,69);ctx.bezierCurveTo(40,30,37,-63,83,-75);ctx.lineTo(64,-36);ctx.lineTo(78,-28);ctx.lineTo(57,-5);ctx.lineTo(66,3);ctx.quadraticCurveTo(35,46,12,69);ctx.fill();ctx.globalAlpha=.8;ctx.stroke();ctx.restore();}if(f.shieldEarned){for(let j=0;j<3;j++)star(ctx,(j-1)*19,-64,5,'#ffedb8',(env.elapsed||0)*.5);}ctx.restore();return true;};
api.tide.presets={skill:{name:'鲸跃',kind:'dash',power:16,cooldown:5,delay:.32,prompt:'好奇地探向新的发现，借鲸浪轻跃向前177像素，命中同一路线的对手。'},skill2:{name:'回声潮汐',kind:'burst',power:18,cooldown:6,delay:.16,prompt:'认真聆听潮汐的回声，轻推掌心、甩鳍放出探知波；命中近身对手后推开距离。'}};
api.chatgpt.presets={skill:{name:'白翼结界',kind:'shield',power:14,cooldown:6,delay:.06,prompt:'温柔地展开白翼护住身前1.55秒；挡住攻击后，在护盾消失前使用龙尾回环可强化反击。'},skill2:{name:'龙尾回环',kind:'burst',power:18,cooldown:6,delay:.22,prompt:'以克制的转身扫尾推开近身威胁；当前护盾已吸收攻击时，消耗护盾，伤害提高6、范围增至175像素。'}};
api.gemini.presets={skill:{name:'双星交映',kind:'projectile',power:14,cooldown:4.5,delay:.14,prompt:'前后相隔120毫秒发射两枚星弹，分居相邻深度路线，总伤害14。'},skill2:{name:'星轨穿梭',kind:'dash',power:16,cooldown:5,delay:.18,prompt:'向相邻路线横移24像素并向前突进151像素，攻击新路线附近的敌人。'},ultimate:{name:'双子流星群',kind:'volley',power:30,delay:.35,prompt:'连续发射四枚错线星弹，间隔100毫秒，总伤害30；换线或防御可应对。'}};if(typeof module==='object'&&module.exports)module.exports=api;root.FighterGroupA=api;Object.assign(root.ArenaCharacterModules ||= {},api);
})(typeof globalThis==='undefined'?window:globalThis);
