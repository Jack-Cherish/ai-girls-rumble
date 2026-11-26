/* Quill release residue only. No extra projectile, radius, hit or persistent state. */
(function(root){
function install(modules){if(!modules)return false;const role=modules.quill||(modules.quill={});if(role.finaleFxV1)return true;const previous=role.drawEffect;
role.drawEffect=function(c,e,env){if(e.kind!=='finale'||e.characterId!=='quill'||e.quillFinale!==true||e.variant!==1)return previous?.(c,e,env)||false;
const u=Math.max(0,Math.min(1,1-e.life/e.max));if(u>.7)return true;
// Short stationary paper-curl residue below the casting hand, never a second shot.
c.save();c.translate(e.x+(e.dir||1)*65,e.y-174);c.scale(e.dir||1,1);c.globalAlpha=.7*(1-u/.7);c.lineCap='round';
for(let j=0;j<2;j++){const yy=8+j*9,xx=-14-j*5;c.beginPath();c.moveTo(xx-12,yy+2);c.bezierCurveTo(xx+2,yy-8,xx+22,yy-8,xx+29,yy-1);c.quadraticCurveTo(xx+17,yy-3,xx+5,yy+5);c.strokeStyle=j?'#a66d47':'#ffe9b8';c.lineWidth=j?1.1:2.2;c.stroke();}
c.restore();return true;};role.finaleFxV1=true;return true;}
if(typeof module==='object'&&module.exports)module.exports=install;else install(root.ArenaCharacterModules);
})(typeof window==='undefined'?globalThis:window);
