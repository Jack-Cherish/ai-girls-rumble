/* Isolated character VFX. No combat state mutations. ctx is local to effect/projectile. */
(function(root){
'use strict';
const ids=new Set(['grok','kimi','doubao']);
const TAU=Math.PI*2;
function line(c,pts,color,w=2){c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=w;c.stroke();}
function star(c,x,y,r,color){c.fillStyle=color;c.beginPath();for(let i=0;i<8;i++){let a=i*Math.PI/4,d=i%2?r*.25:r;i?c.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d):c.moveTo(x+d,y);}c.closePath();c.fill();}
function moon(c,x,y,r,rot=0){c.save();c.translate(x,y);c.rotate(rot);c.fillStyle='#efeaff';c.strokeStyle='#b3a0ff';c.lineWidth=1.5;c.beginPath();c.arc(0,0,r,-Math.PI/2,Math.PI/2);c.quadraticCurveTo(r*.95,0,0,-r);c.closePath();c.fill();c.stroke();c.restore();}
function note(c,x,y,s){c.save();c.translate(x,y);c.scale(s,s);c.fillStyle='#ded7ff';c.beginPath();c.ellipse(0,6,4,2.5,-.4,0,TAU);c.fill();line(c,[[3,5],[3,-9],[9,-6]],'#ded7ff',2);c.restore();}
function hex(c,x,y,r,color,w=2){c.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3; i?c.lineTo(x+r*Math.cos(a),y+r*Math.sin(a)):c.moveTo(x+r,y);}c.closePath();c.strokeStyle=color;c.lineWidth=w;c.stroke();}
function doll(c,x,y,s,t){c.save();c.translate(x,y);c.rotate(Math.sin(t)*.12);c.scale(s,s);c.fillStyle='#d8c5ff';c.beginPath();c.ellipse(0,8,9,12,0,0,TAU);c.fill();c.fillStyle='#4c3269';c.beginPath();c.arc(0,-7,12,0,TAU);c.fill();c.fillStyle='#ffe5d5';c.beginPath();c.ellipse(0,-5,8,9,0,0,TAU);c.fill();c.fillStyle='#3a2852';c.fillRect(-4,-7,2,3);c.fillRect(3,-7,2,3);line(c,[[-3,-1],[0,1],[3,-1]],'#ad6788',1);line(c,[[-7,7],[-14,2]],'#ac86e2',4);line(c,[[7,7],[14,2]],'#ac86e2',4);star(c,0,8,4,'#77ffff');c.restore();}
function cross(c,x,y,r,t){c.save();c.translate(x,y);c.rotate(t);for(let a of [-.65,.65]){c.save();c.rotate(a);c.fillStyle='#ff315f';c.beginPath();c.moveTo(-r,-3);c.lineTo(r,0);c.lineTo(-r,4);c.lineTo(-r*.35,0);c.closePath();c.fill();line(c,[[-r*.65,0],[r*.92,0]],'#fff0f2',1.5);c.restore();}c.restore();}
function effect(c,e,u,id){if(!ids.has(id)||!['swing','cast','dash','ring','finale','decoy'].includes(e.kind))return false;
 c.save();const k=e.kind,p=1-u,dir=e.dir||1;c.globalAlpha=Math.min(1,p*2);c.shadowBlur=9;c.shadowColor=id==='grok'?'#f62e58':id==='kimi'?'#b9a4ff':'#6cf6f3';
 if(id==='grok'){
  if(k==='dash'){const d=(e.end-e.x);for(let j=0;j<5;j++)line(c,[[d*u-dir*(28+j*12),-j*6],[d*(.3+.7*u)-dir*14,12-j*7],[d*(.5+.5*u),-j*4]],j%2?'#ffd3b2':'#e52f59',j%2?1:3);cross(c,d*(.65+.35*u),0,22+12*u,0);}
  else if(k==='ring'||k==='finale'){c.scale(dir,1);if(k==='finale')c.translate(Math.min(e.reach||200,210)*(.2+.6*u),-50);cross(c,0,0,35+85*u,0);for(let j=0;j<8;j++){const a=j*TAU/8,r=25+100*u;line(c,[[Math.cos(a)*r,Math.sin(a)*r*.4],[Math.cos(a)*(r+12),Math.sin(a)*(r+12)*.4]],'#ff7891',2);} }
  else if(k==='swing'){c.scale(dir,1);cross(c,25,-3,25+22*Math.sin(Math.PI*u),e.stage===2?.4:0);}
  else{for(let j=0;j<4;j++){let a=j*TAU/4+u*1.8;star(c,Math.cos(a)*23,Math.sin(a)*23,6,'#ff6387');}if(k==='decoy')cross(c,0,0,35*p,u);}
 }else if(id==='kimi'){
  if(k==='ring'){moon(c,0,-6,22+38*u,-.4);for(let j=0;j<7;j++){let a=j*TAU/7;note(c,Math.cos(a)*(20+60*u),Math.sin(a)*(12+25*u),.75);}if(Number.isInteger(e.intercepted)&&e.intercepted>0){c.save();c.translate(0,Math.max(-125-12*u,18-e.y));c.globalAlpha=Math.min(1,(1-u)*3);c.shadowBlur=0;c.font='bold 14px "Noto Sans CJK JP","Microsoft YaHei","PingFang SC",sans-serif';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#262137';c.fillStyle='#eee6ff';const label='拦截成功';c.strokeText(label,0,0);c.fillText(label,0,0);c.restore();}}
  else if(k==='finale'){c.scale(dir,1);c.translate(0,-57);moon(c,12,-4,42+15*u,-.2);for(let j=0;j<9;j++){let x=12+j*17+u*35,y=-32+8*Math.sin(j*.7+u*2);line(c,[[x-5,y+13],[x+18,y+13]],'#a99ae2',1);note(c,x,y,1);}}
  else if(k==='swing'){c.scale(dir,1);moon(c,26,0,18+10*u,-.7+u);}
  else{for(let j=0;j<5;j++){let a=j*TAU/5+u;note(c,Math.cos(a)*(18+10*u),Math.sin(a)*24,.9);}moon(c,0,0,8+4*u,u);}
 }else{
  if(k==='ring'){for(let j=0;j<7;j++){const a=j*TAU/6,r=j===6?0:30;hex(c,Math.cos(a)*r,Math.sin(a)*r,19+u*5,j%2?'#b99aff':'#83fff3',2);}for(let j=0;j<3;j++)line(c,[[-30,-25+j*24],[30,-25+j*24]],'#efffff',.7);}
  else if(k==='finale'){c.scale(dir,1);c.translate(64,-145);for(let j=0;j<3;j++){hex(c,0,0,18+j*8+u*10,j%2?'#c6a2ff':'#81fff0',1.3);const a=j*TAU/3+u;star(c,Math.cos(a)*38,Math.sin(a)*38,3,'#d6baff');}}
  else if(k==='decoy'){doll(c,0,0,1.5,u*5);for(let j=0;j<6;j++)star(c,Math.cos(j)*45*u,Math.sin(j)*30*u,4,'#88ffec');}
  else if(k==='swing'){c.scale(dir,1);for(let j=0;j<3;j++)hex(c,15+j*14,Math.sin(j+u)*8,5+3*p,'#80ffed',2);}
  else{hex(c,0,0,18+14*p,'#86fff5',2);for(let j=0;j<3;j++)star(c,Math.cos(j*2.1+u)*27,Math.sin(j*2.1+u)*27,4,'#d6baff');}
 }c.restore();return true;
}
function shot(c,p,id,t){if(!ids.has(id))return false;c.save();c.shadowBlur=10;c.shadowColor=id==='kimi'?'#b3a1ff':'#77fff1';
 if(id==='kimi'){const n=1;for(let j=n-1;j>=0;j--){let x=-j*22,y=p.ultimate?Math.sin(t*6+j)*13:0;for(let i=1;i<=3;i++){c.globalAlpha=.17/i;moon(c,x-i*9,y,15,-.15);}c.globalAlpha=1;moon(c,x,y,p.ultimate?20:15,-.15);note(c,x-19,y-18,.75);}}
 else if(id==='doubao'){const n=1;for(let j=n-1;j>=0;j--){let x=-j*28,y=0;c.globalAlpha=.35;line(c,[[x-34,y+5],[x-14,y+5]],'#81fff3',3);c.globalAlpha=1;doll(c,x,y,p.ultimate?.9:.75,t*6+j);hex(c,x,y,19,'#88fff5',1.2);}}
 else cross(c,0,0,p.ultimate?28:18,t*4);c.restore();return true;}
root.FighterFXB={effect,shot};
})(typeof window==='undefined'?globalThis:window);
(function(root){
'use strict';
const fx=root.FighterFXB;
const skill=(name,kind,power,cooldown,delay,prompt)=>({name,kind,power,cooldown,delay,prompt});
function wrap(id,release,presets){return {presets,release,
 drawEffect(c,e,env){if(e.characterId!==id)return false;if(id==='doubao'&&e.kind==='ring'&&e.slot==='skill2')return true;c.save();c.translate(e.x,e.y);const handled=fx.effect(c,e,env.u,id);c.restore();return handled;},
 drawShot(c,p,env){if(p.characterId!==id)return false;c.save();c.translate(p.x,p.y+(id==='kimi'&&p.ultimate?([-18,0,18].includes(p.visualLaneOffset)?p.visualLaneOffset:0):0));c.scale(p.dir||1,1);const handled=fx.shot(c,p,id,env.elapsed);c.restore();return handled;}
};}
const grok=wrap('grok',ctx=>{const {f,enemy,dir,y,slot,addFX,spawnShot,landHit,clamp,aligned}=ctx;
 if(slot==='skill'){const old=f.x, gap=(enemy.x-old)*dir, sameLane=aligned(f,enemy,22)&&Math.abs(f.y-enemy.y)<83;const travel=sameLane&&gap>=0?Math.min(166,Math.max(0,gap-100)):166;f.x=clamp(f.x+dir*travel,32,928);addFX('dash',old,y-95,'#ff426b',.36,{end:f.x,dir});if((enemy.x-old)*dir>=-12&&(enemy.x-old)*dir<213&&aligned(f,enemy,22)&&Math.abs(f.y-enemy.y)<83)ctx.m.hit=landHit(f,enemy,f.kit.skill.power,dir,'skill');return true;}
 if(slot==='skill2'){const power=f.kit.skill2.power;addFX('ring',f.x,y-88,'#ff426b',.5,{size:110,burst:true,dir});spawnShot({x:f.x+dir*42,speed:0,life:.08,radius:104,depthTolerance:29,damage:Math.ceil(power*.6),visual:'cross'});spawnShot({x:f.x+dir*42,speed:0,delay:.16,life:.08,radius:104,depthTolerance:29,damage:Math.floor(power*.4),visual:'cross'});return true;}
 if(slot==='ultimate'){addFX('finale',f.x,y,'#ff426b',.7,{reach:300,dir});spawnShot({speed:760,life:.48,radius:32,damage:20,ultimate:true,visual:'cross'});spawnShot({speed:670,delay:.18,life:.5,radius:36,damage:12,ultimate:true,visual:'cross'});return true;}return false;
},{skill:skill('黑翼斧袭','dash',17,5.4,.2,'向前突进最多166像素，同路敌人前100像素停位，以前伸斧刃命中；不会穿到敌人背后。'),skill2:skill('逆十字裂地','burst',21,6.7,.33,'在身前交叉劈砍，两次判定间隔0.16秒，总伤害21；可后撤或换线躲开。'),ultimate:{name:'绯色双断',kind:'volley',power:32,delay:.35,prompt:'连续发射两道十字斧刃，前后间隔0.18秒，命中伤害分别为20与12。'}});
const kimi=wrap('kimi',ctx=>{const {f,dir,y,slot,spawnShot,addFX,shots}=ctx;
 if(slot==='skill'){spawnShot({speed:430,life:1.65,damage:f.kit.skill.power,radius:22,visual:'moon'});return true;}
 if(slot==='skill2'){let removed=0;for(let i=shots.length-1;i>=0;i--){const p=shots[i];if(p.owner!==f.index&&Math.abs(p.x-f.x)<132&&Math.abs(p.depth-f.depth)<30){shots.splice(i,1);removed++;}}addFX('ring',f.x,y-100,'#c8b9ff',.65,{size:110,intercepted:removed});spawnShot({speed:330,life:1.4,boomerang:true,returnAfter:.6,damage:7,radius:24,visual:'moon'});return true;}
 if(slot==='ultimate'){addFX('finale',f.x,y,'#c8b9ff',.7,{dir,reach:240});for(let i=0;i<3;i++)spawnShot({speed:450,delay:i*.16,life:1.3,damage:10,radius:24,depth:f.depth+(i-1)*18,visualLaneOffset:(i-1)*18,depthTolerance:16,ultimate:true,visual:'moon'});return true;}return false;
},{skill:skill('月光琴键','projectile',13,4,.12,'发出速度较慢的月音投射，牵制同路对手。'),skill2:skill('夜曲休止','projectile',14,7,.3,'清除周身132像素内、同纵深的敌方弹体，再发射一枚去返月牙；每程最多命中一次，每次7点。'),ultimate:{name:'满月协奏曲',kind:'volley',power:30,delay:.35,prompt:'依次向三条不同纵深路线发出月牙，间隔0.16秒；每枚命中造成10点。对手可以换线躲避，不保证三枚全部命中。'}});
const doubao=wrap('doubao',ctx=>{const {f,dir,y,slot,spawnShot,addFX}=ctx;
 if(slot==='skill'){spawnShot({speed:350,life:1.8,radius:26,damage:f.kit.skill.power,visual:'doll'});return true;}
 if(slot==='skill2'){f.shield=1.05;f.shieldEarned=false;addFX('ring',f.x,y-100,'#8affed',.7,{size:65});return true;}
 if(slot==='ultimate'){addFX('finale',f.x,y,'#9bfef1',.8,{dir,reach:220});for(let i=0;i<3;i++)spawnShot({speed:330+i*70,delay:i*.22,life:1.5,radius:26,damage:10,ultimate:true,visual:'doll'});return true;}return false;
},{skill:skill('玩偶投递','projectile',15,4.8,.23,'召唤并派出全息玩偶分身，速度较慢、碰撞范围稍大；腰间的实体挂件保留，不是取下投掷。'),skill2:skill('六角护幕','shield',13,7,.08,'张开持续1.35秒的六角护盾，抵挡攻击；不恢复生命。'),ultimate:{name:'玩偶接力',kind:'volley',power:30,delay:.35,prompt:'召唤三只全息玩偶分身，间隔0.22秒接力飞出，后发分身速度更快，每只10点伤害。'}});
doubao.drawAura=function(c,f,env){if(!(f.shield>0))return false;c.save();c.translate(f.x,f.y-102);c.scale(f.facing||f.dir||1,1);c.globalAlpha=.7;c.shadowBlur=7;c.shadowColor='#81fff3';for(let j=0;j<7;j++){let a=j*Math.PI/3,r=j===6?0:28,x=Math.cos(a)*r,y=Math.sin(a)*r;c.beginPath();for(let k=0;k<6;k++){let b=k*Math.PI/3;k?c.lineTo(x+18*Math.cos(b),y+18*Math.sin(b)):c.moveTo(x+18,y);}c.closePath();c.strokeStyle=j%2?'#c6a2ff':'#81fff3';c.lineWidth=1.7;c.stroke();}c.restore();return true;};
const modules={grok,kimi,doubao};if(typeof module==='object'&&module.exports)module.exports=modules;else Object.assign(root.ArenaCharacterModules ||= {},modules);
})(typeof window==='undefined'?globalThis:window);
