(function(root){const api={nailong:{drawThreat(c,e,u){
  if(e.kind!=='threat'||e.characterId!=='nailong')return false;
  const progress=Math.max(0,Math.min(1,u));
  const flare=Math.max(0,(progress-.8)/.2);
  c.save();c.translate(e.x,e.y);c.scale(e.dir||1,1);
  c.beginPath();c.rect(-180,-36,360,72);c.clip();
  c.fillStyle='#ffcf42';c.globalAlpha=.16+.22*flare;
  c.fillRect(-180,-36,360,72);
  c.strokeStyle='#fff1b2';c.lineWidth=3;c.globalAlpha=.55+.45*flare;
  c.strokeRect(-180,-36,360,72);
  // Ripple crests travel away from the fighter on both sides.
  c.strokeStyle='#fff4ae';
  for (const side of [-1,1]) {
    for (let crest=0;crest<3;crest++) {
      const phase=(progress*.92+crest/3)%1;
      const x=side*(18+145*phase);
      c.globalAlpha=(.4+.6*Math.sin(Math.PI*phase))*(.7+.3*flare);
      c.lineWidth=3+2*flare;
      c.beginPath();c.moveTo(x-side*8,-26);
      c.quadraticCurveTo(x+side*17,0,x-side*8,26);c.stroke();
    }
  }
  c.restore();return true;
 },
drawEffect(c,e,env){return api.nailong.drawThreat(c,e,env.u)},presets:{skill:{name:'狂笑三连波',kind:'projectile',power:15,cooldown:5,delay:.42,prompt:'向前连续释放三道可格挡笑波，每道基础威力5。'},skill2:{name:'笑到打滚',kind:'dash',power:16,cooldown:5.5,delay:.23,prompt:'使用既有突进规则向前177像素，配打滚动画。'},ultimate:{name:'捧腹大狂笑',kind:'volley',power:30,delay:.74,prompt:'释放一次近身环形震荡，基础威力30。'}},release(c){
const {f,enemy,m,dir,y,distance,aligned,landHit,spawnShot,addFX}=c;
if(m.type==='skill'){
 for(let i=0;i<3;i++)spawnShot({damage:Math.max(1,Math.round(f.kit.skill.power/3)),delay:i*.12,life:1.5,speed:530,radius:22,color:'#ffd650'});
 addFX('ring',f.x+dir*30,y-60,'#ffdc63',.35,{size:36});return true;
}
if(m.type==='ultimate'){
 addFX('ring',f.x,y-45,'#ffe68c',.65,{size:180});
 if(Math.abs(enemy.x-f.x)<=180&&aligned(f,enemy,36)&&Math.abs(enemy.y-f.y)<105)m.hit=landHit(f,enemy,f.kit.ultimate.power,enemy.x>=f.x?1:-1,'ultimate');
 return true;
}
return false; // skill2 deliberately retains authoritative built-in dash implementation.
}}};if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root.ArenaCharacterModules ||= {},api);})(typeof window==='undefined'?globalThis:window);
