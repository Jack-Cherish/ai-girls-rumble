/* Laoda isolated prototype. Existing engine owns damage, hitstop, movement and cooldowns. */
(function(root){'use strict';
const api={laoda:{
 drawThreat(c,e,u){
  if(e.kind!=='threat'||e.characterId!=='laoda')return false;
  const progress=Math.max(0,Math.min(1,u));
  const flare=Math.max(0,(progress-.8)/.2);
  c.save();c.translate(e.x,e.y);c.scale(e.dir||1,1);
  c.beginPath();c.rect(-15,-30,265,60);c.clip();
  c.fillStyle='#e78240';c.globalAlpha=.16+.22*flare;
  c.fillRect(-15,-30,265,60);
  c.strokeStyle='#fff1b2';c.lineWidth=3;c.globalAlpha=.55+.45*flare;
  c.strokeRect(-15,-30,265,60);
  // The chevrons follow facing, including a left-facing approach.
  c.fillStyle='#ffe2ab';c.globalAlpha=.72+.28*flare;
  for (let index=0;index<4;index++) {
    const x=3+index*52+progress*40;
    c.beginPath();c.moveTo(x,-21);c.lineTo(x+10,-21);
    c.lineTo(x+32,0);c.lineTo(x+10,21);c.lineTo(x,21);
    c.lineTo(x+20,0);c.closePath();c.fill();
  }
  c.restore();return true;
 },
 release(c){const {f,enemy,m,dir,y,slot,spawnShot,addFX,landHit,aligned,clamp}=c;
 if(slot==='skill'){spawnShot({speed:490,life:1.3,radius:25,damage:f.kit.skill.power,visual:'iced-tea'});return true;}
 if(slot==='skill2'){addFX('ring',f.x,y-90,'#f5be3d',.35,{dir});if(Math.abs(enemy.x-f.x)<135&&aligned(f,enemy,24)&&Math.abs(f.y-enemy.y)<88)m.hit=landHit(f,enemy,f.kit.skill2.power,dir,'skill');return true;}
 if(slot==='ultimate'){const old=f.x,dist=(enemy.x-old)*dir;f.x=clamp(old+dir*120,32,928);addFX('finale',f.x,y-95,'#f5be3d',.65,{dir});if(dist>=-15&&dist<250&&aligned(f,enemy,30)&&Math.abs(f.y-enemy.y)<110)m.hit=landHit(f,enemy,f.kit.ultimate.power,dir,'ultimate');return true;}return false;
 },
 drawShot(c,p){if(p.characterId!=='laoda')return false;c.save();c.translate(p.x,p.y);c.rotate((p.age||0)*11*(p.dir||1));c.fillStyle='#efa12e';c.strokeStyle='#fff1b4';c.lineWidth=2;c.beginPath();c.roundRect(-7,-13,14,27,4);c.fill();c.stroke();c.fillStyle='#e8e6f1';c.fillRect(-5,-18,10,6);c.fillStyle='#ffd66a';c.fillRect(-4,-7,3,12);c.restore();return true;},
 drawEffect(c,e,env){if(api.laoda.drawThreat(c,e,env.u))return true;if(e.characterId!=='laoda'||!['ring','finale'].includes(e.kind))return false;c.save();c.translate(e.x,e.y);c.globalAlpha=Math.max(0,1-env.u);c.strokeStyle='#ffce54';c.lineWidth=5;for(let i=0;i<2;i++){c.beginPath();c.ellipse(0,i*10,38+env.u*75,10+env.u*13,0,env.u*8+i,env.u*8+i+Math.PI*1.65);c.stroke()}c.restore();return true;}
}};if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root.ArenaCharacterModules ||= {},api);
})(typeof window==='undefined'?globalThis:window);
