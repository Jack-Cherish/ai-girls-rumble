/* Only Quill's existing dash event, identified by the renderer's authoritative cueId. */
(function(root){const prior=root.ArenaTelegraph?.draw;if(!prior||root.ArenaTelegraph.quillDashV1)return;
root.ArenaTelegraph.draw=function(c,e,id,u){if(id!=='quill'||e.kind!=='dash'||![0,1].includes(e.owner)||!Number.isFinite(e.end)||![1,-1].includes(e.dir))return prior(c,e,id,u);
const q=Math.max(0,Math.min(1,u)),d=e.end-e.x;c.save();c.translate(e.x,e.y-58);c.globalAlpha=.65*(1-q);c.lineCap='round';
// Short fading paper fibres follow the existing displacement, not a new attack area.
for(let j=0;j<3;j++){const y=(j-1)*7,begin=d*(.08+.14*q),end=d*(.82+.10*q);c.strokeStyle=j===1?'#fff0c9':'#dca86c';c.lineWidth=j===1?2:1.1;c.beginPath();c.moveTo(begin,y+4);c.bezierCurveTo(d*.36,y-5,d*.65,y+5,end,y-3);c.stroke();}
for(let j=0;j<3;j++){const x=d*(.28+j*.19),y=-13+j*9;c.save();c.translate(x,y);c.rotate((j-1)*.2*(e.dir||1));c.fillStyle='#fff0c9';c.strokeStyle='#b97d4e';c.lineWidth=.9;c.beginPath();c.moveTo(-5,-4);c.quadraticCurveTo(0,-2,5,-4);c.lineTo(4,4);c.quadraticCurveTo(0,3,-5,4);c.closePath();c.fill();c.stroke();c.restore();}c.restore();return true;};root.ArenaTelegraph.quillDashV1=true;
})(typeof window==='undefined'?globalThis:window);
