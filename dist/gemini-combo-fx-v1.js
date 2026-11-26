/* Visual-only. Existing authoritative swing event is the sole trigger.
   No hit inference, physics mutation, particles persisting outside event life. */
(function(root){
 function install(modules){const role=modules?.gemini;if(!role||role.comboFxVersion==='v1')return false;const previous=role.drawEffect;
 function sparkle(c,x,y,r,color,rotation){c.save();c.translate(x,y);c.rotate(rotation);c.fillStyle=color;c.beginPath();for(let n=0;n<8;n++){const a=n*Math.PI/4,s=n%2?r*.23:r;c.lineTo(Math.cos(a)*s,Math.sin(a)*s);}c.closePath();c.fill();c.restore();}
 role.drawEffect=function(c,e,env){if(e.kind!=='swing'||e.characterId!=='gemini')return previous?.(c,e,env)||false;
 const u=Math.max(0,Math.min(1,1-e.life/e.max)),stage=Math.max(1,Math.min(3,e.stage||1));
 // Native sprites place palms/boot above the legacy capsule-height swing anchor.
 const anchor=stage===1?[34,-94]:stage===2?[62,-80]:[38,-86];
 c.save();c.translate(e.x+(e.dir||1)*anchor[0],e.y+anchor[1]);c.scale(e.dir||1,1);c.globalAlpha=(1-u)*.85;
 const count=stage===3?4:2;
 for(let n=0;n<count;n++){const yy=stage===3?(n-1.5)*9:(n?5:-5),xx=-8-n*5+u*7; sparkle(c,xx,yy,(stage===3?7:5)*(1-u*.4),n%2?'#fff1ad':'#c8b7ff',u*.5+n*.3);c.strokeStyle=n%2?'#fff1ad':'#b8cfff';c.lineWidth=1.1;c.beginPath();c.moveTo(xx-4,yy);c.lineTo(xx-13-u*6,yy+(n%2?1:-1)*2);c.stroke();}
 c.restore();return true;};role.comboFxVersion='v1';return true;}
 if(typeof module==='object'&&module.exports)module.exports=install;else install(root.ArenaCharacterModules);
})(typeof globalThis==='undefined'?window:globalThis);
