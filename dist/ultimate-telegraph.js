/* Decorative charge cues, not area-of-effect markers. No battle state mutation. */
(function(root){
'use strict';
const palette={tide:['#8edbe8','#def9ff'],quill:['#dba26e','#fff0ce'],chatgpt:['#c3aee7','#fff4df'],gemini:['#a9c5ff','#f4dcff'],grok:['#b63757','#ffd4ce'],kimi:['#b8a3dc','#f7ecff'],doubao:['#a3ded3','#eddbff'],minimax:['#ecc99d','#cef2dc'],glm:['#c7ae83','#f7eed9'],qwen:['#b4a2df','#f1e5ff']};
function draw(c,e,id,u){
if(e.kind!=='threat'||!palette[id])return false;
const [base,light]=palette[id],q=Math.max(0,Math.min(1,u));
c.save();c.translate(e.x+(e.dir||1)*24,e.y-225);c.scale(e.dir||1,1);c.globalAlpha=.4+.5*q;c.strokeStyle=base;c.fillStyle=light;c.lineWidth=1.7;c.lineJoin='round';
const line=(pts,col=base,w=1.7)=>{c.strokeStyle=col;c.lineWidth=w;c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();};
const star=(x,y,r)=>{c.fillStyle=light;c.beginPath();for(let k=0;k<8;k++){let a=k*Math.PI/4,rr=k%2?r*.3:r;let X=x+Math.cos(a)*rr,Y=y+Math.sin(a)*rr;k?c.lineTo(X,Y):c.moveTo(X,Y)}c.closePath();c.fill();};
// Gentle gathering, not an expanding hit radius. Character-specific silhouettes.
c.translate(0,-3*q);c.scale(.82+.18*q,.82+.18*q);
if(id==='quill'||id==='glm'){
 if(id==='quill'){for(let j=0;j<3;j++){let x=j*11-14,y=-j*7;c.fillStyle=j%2?base:light;c.beginPath();c.moveTo(x-7,y-12);c.quadraticCurveTo(x+3,y-16,x+11,y-10);c.lineTo(x+8,y+10);c.quadraticCurveTo(x,y+6,x-10,y+10);c.closePath();c.fill();line([[x-4,y-5],[x+5,y-4]],'#a66d47',1)}}
 else{for(let j=0;j<3;j++){let x=j*12-12,y=-j*7;c.fillStyle=j===1?base:'#393540';c.fillRect(x-4,y-18,9,31);line([[x-1,y-12],[x+2,y-9],[x-1,y-5]],light,1);line([[x-4,y+13],[x,y+7],[x+5,y+13]],base,1)}}
}else if(id==='grok'){line([[-18,19],[7,-22],[14,-27]],light,4);line([[-16,-18],[12,18],[20,21]],base,5);line([[18,-18],[28,-24]],light,1);
}else if(id==='gemini'){star(-12,-6,13);star(15,-18,10);line([[-7,-10],[8,-16]],base,1);star(5,12,4);
}else if(id==='chatgpt'){for(let s of [-1,1]){c.save();c.scale(s,1);for(let j=0;j<4;j++){c.fillStyle=j%2?base:light;c.beginPath();c.moveTo(1,6);c.quadraticCurveTo(12,-7-j*4,23+j*3,-22+j*6);c.quadraticCurveTo(22,5+j*3,1,13);c.fill();}c.restore();}
}else if(id==='kimi'){c.fillStyle=light;c.beginPath();c.moveTo(9,-23);c.bezierCurveTo(-27,-15,-25,25,10,23);c.bezierCurveTo(-8,11,-7,-12,9,-23);c.fill();star(20,-9,4);line([[20,14],[20,1],[28,4]],base,2);
}else if(id==='doubao'){c.fillStyle=light;c.beginPath();c.moveTo(-11,-10);c.quadraticCurveTo(-17,-26,0,-25);c.quadraticCurveTo(17,-26,11,-10);c.lineTo(15,13);c.quadraticCurveTo(0,22,-15,13);c.closePath();c.fill();line([[-6,-14],[-4,-14]],base,2);line([[4,-14],[6,-14]],base,2);star(0,5,5);
}else if(id==='minimax'){c.fillStyle=light;c.beginPath();c.moveTo(-21,12);c.bezierCurveTo(-29,-3,-11,-28,9,-22);c.bezierCurveTo(30,-16,27,11,9,15);c.quadraticCurveTo(2,20,4,27);c.lineTo(-6,23);c.quadraticCurveTo(-4,12,-21,12);c.fill();c.strokeStyle=base;c.lineWidth=2;c.beginPath();c.moveTo(-15,5);c.bezierCurveTo(-17,-13,11,-22,17,-6);c.bezierCurveTo(24,10,-1,13,-2,0);c.bezierCurveTo(-3,-9,11,-7,9,0);c.stroke();line([[-6,19],[3,22]],base,2);
}else if(id==='qwen'){c.fillStyle=light;c.beginPath();c.moveTo(0,17);c.quadraticCurveTo(-36,-7,-18,-22);c.quadraticCurveTo(0,-34,22,-20);c.quadraticCurveTo(34,1,0,17);c.fill();for(let j=0;j<6;j++){let x=-19+j*8;line([[0,17],[x,-17-Math.max(0,8-Math.abs(x)*.4)]],base,1.2)}if(id==='minimax')line([[0,17],[8,20],[11,15]],base,2);
}else if(id==='tide'){c.fillStyle=light;c.beginPath();c.moveTo(0,-29);c.bezierCurveTo(-3,-16,-23,-3,-14,11);c.bezierCurveTo(-4,24,21,15,15,0);c.quadraticCurveTo(8,-15,0,-29);c.fill();line([[-9,7],[-2,12],[6,10]],base,2);}
// Sparse forward wisps communicate the wind-up without drawing a fake AOE.
for(let j=0;j<3;j++){const y=24+j*5,x=-28+(j*17+q*14)%34;line([[x,y],[x+8,y-2]],j%2?light:base,1);}
c.restore();return true;
}
const api={draw};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ArenaTelegraph=api;
})(typeof window==='undefined'?globalThis:window);
