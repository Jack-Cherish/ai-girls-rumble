/* Stationary resonance ring center follows authoritative radius center; retain visual chest height. */
(()=>{const m=window.ArenaCharacterModules.minimax,previous=m.drawShot;
m.drawShot=function(ctx,p,env){
 if(p.characterId==='minimax'&&p.visual==='resonance-pulse'&&Number.isFinite(p.physicsX))
  return previous.call(this,ctx,{...p,x:p.physicsX},env);
 return previous.call(this,ctx,p,env);
};
})();
