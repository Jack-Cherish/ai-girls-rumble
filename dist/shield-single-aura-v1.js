/* Remove duplicate fixed-position wall rendering, not effect state or shield mechanics.
   Existing drawAura continues rendering the role-specific wall at the live fighter. */
(()=>{for(const [id,kind]of [['minimax','shell-wall'],['glm','ink-wall']]){const role=window.ArenaCharacterModules[id],previous=role.drawEffect;role.drawEffect=function(ctx,e,env){if(e.characterId===id&&e.kind===kind)return true;return previous.call(this,ctx,e,env);};}})();
