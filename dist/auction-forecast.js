// Score one round, then swap both fighters and their starting resources with the same seed.
self.window=self;
importScripts('arena-manifest.js','mechanics-group-a.js','chatgpt-tail-direction-v1.js','chatgpt-shield-wording-v1.js','mechanics-group-b.js','mechanics-group-c.js','mechanics-laoda.js','mechanics-nailong.js','mechanics.js','kit.js','auction-rules.js','pact-personality.js','pact-rules.js','combat.js');
self.onmessage=({data})=>{
  try{
    const {team,kits,energy,difficulty,rules,seed,clauses=[]}=data;
    const results=(data.includeBaseline===false?rules:[null,...rules]).map(rule=>{
      let points=0,short=0,stall=0,seconds=0,activations=0;
      for(let i=0;i<16;i++)for(let side=0;side<2;side++){
        const order=x=>side?x.slice().reverse():x;
        const pairedSeed=(seed+Math.imul(i+1,2654435761))>>>0;let done=false;
        const match=DormCombat.createMatch(order(team),{mode:'cpu',seed:pairedSeed,forecastKits:order(kits),forecastEnergy:order(energy),difficulty,
          pact:clauses.length?{}:null,forecastClauses:clauses.map(c=>({...c,seat:side?1-c.seat:c.seat})),
          auction:rule?{current:()=>rule,feedback:()=>activations++}:null,onRoundData(outcome,t,hp,max){
            points+=outcome.winner===null?.5:Number(outcome.winner===1-side);
            short+=Number(t<8);stall+=Number(outcome.reason==='时间到'&&hp.every(v=>v>=max*.5));seconds+=t;done=true;
          }});
        for(let frame=0;!done&&frame<18000;frame++)match.step();
        if(!done)throw Error('规则推演未完成');
      }
      return {rate:points/32,short,stall,seconds:seconds/32,activations,n:32};
    });
    self.postMessage({results});
  }catch(e){self.postMessage({error:e.message});}
};
