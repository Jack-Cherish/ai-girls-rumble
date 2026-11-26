/* GPT-only visual swing dressing. No physics, hit inference or persistent state. */
(function(root){
 function install(modules){const role=modules?.chatgpt;if(!role||role.comboFxVersion==='v1')return false;const previous=role.drawEffect;
 function plume(c,x,y,size,rotation){c.save();c.translate(x,y);c.rotate(rotation);c.scale(size,size);c.fillStyle='#fff8fb';c.strokeStyle='#9675b1';c.lineWidth=1.1;c.beginPath();c.moveTo(0,-6);c.bezierCurveTo(5,-3,4,3,0,7);c.bezierCurveTo(-3,3,-3,-3,0,-6);c.fill();c.stroke();c.beginPath();c.moveTo(0,-4);c.lineTo(0,5);c.stroke();c.restore();}
 role.drawEffect=function(c,e,env){if(e.kind!=='swing'||e.characterId!=='chatgpt')return previous?.(c,e,env)||false;
 const u=Math.max(0,Math.min(1,1-e.life/e.max)),stage=Math.max(1,Math.min(3,e.stage||1));
 // Palm, horizontal physical tail, and downward palms have separate world anchors.
 const anchor=stage===1?[43,-94]:stage===2?[48,-22]:[43,-76];
 c.save();c.translate(e.x+(e.dir||1)*anchor[0],e.y+anchor[1]);c.scale(e.dir||1,1);c.globalAlpha=(1-u)*.92;
 const count=stage+1;for(let n=0;n<count;n++){const xx=(n-(count-1)/2)*5+u*7,yy=(n-(count-1)/2)*(stage===2?5:8)+u*4;plume(c,xx,yy,.8+stage*.06,-.65+n*.18+u*.3);}
 c.restore();return true;};role.comboFxVersion='v1';return true;}
 if(typeof module==='object'&&module.exports)module.exports=install;else install(root.ArenaCharacterModules);
})(typeof globalThis==='undefined'?window:globalThis);
