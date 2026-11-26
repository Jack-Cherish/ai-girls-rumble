/* DeepSeek-only palm droplets; cosmetic swing event, never damage/projectiles. */
(function(root){
 function install(modules){const role=modules?.tide;if(!role||role.tideComboFxVersion==='v1')return false;const previous=role.drawEffect;
 role.drawEffect=function(c,e,env){if(e.kind!=='swing'||e.characterId!=='tide')return previous?.(c,e,env)||false;
 const u=Math.max(0,Math.min(1,1-e.life/e.max)),stage=Math.max(1,Math.min(3,e.stage||1));
 const anchor=stage===1?[30,-89]:stage===2?[30,-87]:[32,-86];
 c.save();c.translate(e.x+(e.dir||1)*anchor[0],e.y+anchor[1]);c.scale(e.dir||1,1);c.globalAlpha=(1-u)*.94;
 for(let n=0;n<stage+1;n++){const spread=n-stage/2;c.save();c.translate(2+u*8+Math.abs(spread)*3,spread*6+u*spread*5);c.rotate(.95+spread*.3);c.fillStyle='#c7fbff';c.strokeStyle='#2685ad';c.lineWidth=.9;c.beginPath();c.moveTo(0,-4.5);c.quadraticCurveTo(4,0,2,3);c.quadraticCurveTo(0,5,-2,3);c.quadraticCurveTo(-4,0,0,-4.5);c.fill();c.stroke();c.restore();}
 c.restore();return true;};role.tideComboFxVersion='v1';return true;}
 if(typeof module==='object'&&module.exports)module.exports=install;else install(root.ArenaCharacterModules);
})(typeof globalThis==='undefined'?window:globalThis);
