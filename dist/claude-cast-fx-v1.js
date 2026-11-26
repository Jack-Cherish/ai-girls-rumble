/* Quill book-cast decoration follows the live owner, never the projectile origin. */
(function(root){const role=root.ArenaCharacterModules?.quill;if(!role||role.bookCastV1)return;const prior=role.drawEffect;
role.drawEffect=function(c,e,env){const f=env?.fighters?.[e.owner];if(e.characterId!=='quill'||e.kind!=='cast'||![0,1].includes(e.owner)||!f||env.players?.[e.owner]?.body!==1||env.players?.[e.owner]?.look?.face)return prior?.call(this,c,e,env)||false;
if(root.DuelArt?.hasBakedFx?.(env.players[e.owner],e.owner,f))return true;
const u=Math.max(0,Math.min(1,env.u)),time=env.elapsed||0;c.save();c.translate(f.x+(f.dir||1)*12,f.y-145);c.globalAlpha=Math.min(1,(1-u)*2.2);
for(let j=0;j<5;j++){const a=time*6+j*1.2566,radius=14+(1-u)*23;c.save();c.translate(Math.cos(a)*radius,Math.sin(a)*radius);c.rotate(a);c.scale(.45,.45);c.fillStyle='#fff1c8';c.strokeStyle='#e7ab74';c.lineWidth=1.4;c.beginPath();c.moveTo(-9,-6);c.quadraticCurveTo(0,-3,9,-7);c.lineTo(7,6);c.quadraticCurveTo(-1,10,-11,6);c.closePath();c.fill();c.stroke();c.beginPath();c.moveTo(-6,-1);c.lineTo(4,-2);c.moveTo(-6,2);c.lineTo(2,1);c.strokeStyle='#a35835';c.lineWidth=.85;c.stroke();c.restore();}c.restore();return true;};role.bookCastV1=true;
})(typeof window==='undefined'?globalThis:window);
