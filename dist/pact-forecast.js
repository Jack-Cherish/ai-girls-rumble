// One worker per negotiation. Keep the ordinary-rules baseline across counteroffers.
self.window=self;
importScripts('mechanics-group-a.js','chatgpt-tail-direction-v1.js','mechanics-group-b.js','mechanics-group-c.js','mechanics-laoda.js','mechanics-nailong.js','pact-personality.js','pact-rules.js','combat.js');
const samples=32,cache=new Map();
function simulate(team,kits,difficulty,terms){
  let wins=0,draws=0;
  for(let i=0;i<samples;i++){
    const seed=(Math.imul(i+1,2654435761)+37)>>>0;
    const game=DormCombat.createMatch(team,{mode:'cpu',seed,difficulty,forecastKits:kits,pact:{terms}});
    for(let frame=0;!game.result && frame<65000;frame++)game.step();
    if(!game.result)throw Error('推演未能打完整场比赛');
    if(game.result.winner===1)wins++;
    if(game.result.winner===null)draws++;
  }
  return {wins,draws,games:samples,rate:100*wins/samples};
}
self.onmessage=({data})=>{
  try{
    const {team,kits,difficulty,options}=data;
    function run(terms){
      const key=JSON.stringify([team,kits,difficulty,terms]);
      if(!cache.has(key))cache.set(key,simulate(team,kits,difficulty,terms));
      return cache.get(key);
    }
    self.postMessage({baseline:run(null),outcomes:options.map(x=>run(x.terms))});
  }catch(e){self.postMessage({error:e.message});}
};
