// Render the approved transparent cels at the same world anchors on every client.
(() => {
  'use strict';
  const previous = window.DormArt;
  const cast = window.DuelCels;
  if (!previous || !cast) return;
  const height = 208;
  const images = new Map();
  const timelines = new WeakMap();
  // Per canvas and fighter seat: snapshots are new objects each tick.
  // Only the Claude movement candidate uses entry-relative timing.
  const movementClocks = new WeakMap();
  const movementKeys = new Set(['advance','retreat','near','far']);
  function movementElapsed(c,id,key,s,time,dir) {
    if (id !== 'quill') { movementClocks.get(c)?.delete(s.index); return null; }
    let seats=movementClocks.get(c);
    if (!seats) movementClocks.set(c,seats=new Map());
    const old=seats.get(s.index);
    const changed=!old || old.id!==id || old.key!==key || old.dir!==dir || time<old.time;
    const start=changed?time:old.start;
    seats.set(s.index,{id,key,dir,start,time});
    return movementKeys.has(key)?Math.max(0,time-start)*1000:null;
  }
  const clamp = n => Math.min(1, Math.max(0, n));
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  function character(player, seat) {
    if (player?.look?.face) return null;
    const index = Number.isInteger(player?.body) ? player.body : seat;
    const id = window.ArenaManifest?.characters?.[index]?.id;
    return id && cast[id] ? id : null;
  }

  function load(path, retry = false) {
    let entry = images.get(path);
    if (entry && !(retry && entry.failed)) return entry;
    const img = new Image();
    entry = {img, loaded:false, failed:false};
    images.set(path, entry);
    entry.promise = new Promise(resolve => {
      let settled=false,timer;
      const finish=ok=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);entry.loaded=ok;entry.failed=!ok;resolve(ok);};
      const variant=window.DuelAssetVariants?.[path];let fallback=false;
      img.onload = () => finish(true);
      img.onerror = () => {if(!settled&&variant&&!fallback){fallback=true;img.src=previous.assetURL(path);}else finish(false);};
      if(typeof setTimeout==='function')timer=setTimeout(()=>finish(false),30000);
      img.src = previous.assetURL(variant||path);
    });
    return entry;
  }

  function atlasPaths(players) {
    const paths = new Set();
    for (const [seat,player] of players.entries()) {
      const ch = cast[character(player,seat)];
      if (ch) {
        // Replaced clips may leave old atlas entries behind. Load only frames still reachable by actions.
        const actions=Object.values(ch.actions||{});
        if(!actions.length){for(const path of ch.atlases)paths.add(path);continue;}
        for(const action of actions)for(const rec of action.frames||[]){
          const rect=ch.frames[rec[0]],path=rect&&ch.atlases[rect[0]];if(path)paths.add(path);
        }
      }
    }
    return [...paths];
  }

  function preload(players,onProgress) {
    const paths=atlasPaths(players);
    const tasks=paths.map(path => load(path,true).promise.then(ok=>{onProgress?.(loadStatus(players));return ok;}));
    onProgress?.(loadStatus(players));
    const layers=players.some((p,i)=>character(p,i)==='kimi')?window.KimiInstrumentLayers?.preloadOnce?.():null;
    if(layers)tasks.push(Promise.resolve(layers).then(()=>{onProgress?.(loadStatus(players));return true;},()=>{onProgress?.(loadStatus(players));return true;})); // optional layers fail back to original cel
    return Promise.all(tasks).then(results => results.every(Boolean));
  }

  // Keep only the active pair's battle atlases; portraits remain for the lobby.
  // Deleting references permits reclamation, but is not a promise of immediate GPU/HTTP cache release.
  function trimCache(players) {
    const keep=new Set(atlasPaths(players));let removed=0;
    for(const [path] of images){if(!keep.has(path)&&!path.endsWith('-face.webp')){images.delete(path);removed++;}}
    return removed;
  }

  function loadStatus(players) {
    const paths=atlasPaths(players), extra=players.some((p,i)=>character(p,i)==='kimi')?window.KimiInstrumentLayers?.status?.():null;return {total:paths.length+(extra?1:0),loaded:paths.filter(p=>images.get(p)?.loaded).length+(extra&&(extra.ready||extra.failed)?1:0),failed:paths.filter(p=>images.get(p)?.failed).length};
  }

  function isReadyFor(players) {
    return atlasPaths(players).every(path => images.get(path)?.loaded);
  }

  function choose(b, id) {
    if (['laoda','nailong'].includes(id) && b.downStage==='getup') return 'getup';
    if (b.action === 'down') return 'down';
    if (b.action === 'hit') return 'hit';
    if (b.moveType === 'attack' || b.action === 'attack' || (b.action === 'skill' && b.attackStage > 0))
      return ['jab','cross','finisher'][Math.min(3,Math.max(1,b.attackStage||1))-1];
    if (b.moveType === 'ultimate') return 'ultimate';
    if (b.moveType === 'skill' || b.moveType === 'skill2') {
      if (id === 'tide' && b.skillKind === 'projectile') return 'beacon';
      return b.moveType === 'skill2' ? 'skill2' : 'skill1';
    }
    if (b.moveType === 'evade') return id==='laoda' && b.evadeSign<0 && cast[id].actions.evade_back ? 'evade_back' : 'evade';
    if (b.blockPhase >= 0) return 'block_hit';
    if (b.subPhase >= 0) return 'substitute';
    if (b.action === 'guard') return 'guard';
    if (b.action === 'jump') return 'jump';
    if (b.action === 'walk') return b.laneStep > 0 ? 'near' : b.laneStep < 0 ? 'far' : b.strideSign < 0 ? 'retreat' : 'advance';
    if (b.action === 'skill') return 'skill1'; // Older network snapshot.
    return 'idle';
  }

  function sample(action, fraction) {
    let ends = timelines.get(action);
    if (!ends) {
      let total=0;
      ends=action.frames.map(f => total+=f[3]);
      timelines.set(action,ends);
    }
    const ms=clamp(fraction)*ends[ends.length-1];
    let i=0;
    while(i<ends.length-1 && ms>=ends[i]) i++;
    return action.frames[i];
  }

  function phase(action,key,s,time,movementMs=null) {
    if (key==='idle' && reduced?.matches) return 0;
    if (key==='getup') return s.getupPhase??0;
    if (key==='hit') return s.hitPhase??s.phase??0;
    if (key==='block_hit') return s.blockPhase;
    // The body reappears at the new seat immediately. Its paper double dissolves at the old seat.
    if (key==='substitute') return action.fullSubTimeline ? clamp(s.subPhase) : .68+.32*clamp(s.subPhase);
    if (key==='guard') return Math.min(.55, (s.guardTime??.3)*1000/action.duration);
    if (s.moveType || key==='down' || key==='jump' || key==='evade') {
      const t=clamp(s.phase||0),impact=s.impactPhase,artImpact=action.contact;
      if (typeof artImpact==='number' && artImpact>0 && artImpact<1 && impact>0 && impact<1) {
        return t<impact ? t/impact*artImpact : artImpact+(t-impact)/(1-impact)*(1-artImpact);
      }
      return t;
    }
    const ms=movementMs===null?(time+s.index*.083)*1000:movementMs;
    return ms%action.duration/action.duration;
  }

  // Visual-only orientation bridge. Engine movement/hit timings are never delayed.
  const nailongTurnStates = new WeakMap();
  const nailongTurnKeys = new Set(['idle','advance','retreat','near','far']);
  function nailongDepthTurn(c,key,s,time,dir,basePhase) {
    let seats=nailongTurnStates.get(c);
    if(!seats)nailongTurnStates.set(c,seats=new Map());
    let st=seats.get(s.index);
    const target=key==='far'?1:0;
    if(!nailongTurnKeys.has(key)){seats.delete(s.index);return {key,phase:basePhase};}
    if(!st||time<st.time||st.dir!==dir){
      seats.set(s.index,{angle:target,time,dir});return {key,phase:basePhase};
    }
    const step=Math.max(0,time-st.time)/.18;
    st.angle+=Math.sign(target-st.angle)*Math.min(Math.abs(target-st.angle),step);
    st.time=time;
    if(Math.abs(st.angle-target)<1e-6)return {key,phase:basePhase};
    return {key:'depth_turn_'+Math.min(2,Math.floor(st.angle*3)),phase:0};
  }
  const transitionStates = new WeakMap();
  const pairedMoves = new Set(['advance','retreat']);
  function transitionChoice(c,id,key,s,time,dir,basePhase) {
    if(id==='nailong')return nailongDepthTurn(c,key,s,time,dir,basePhase);
    if(id!=='quill') { transitionStates.get(c)?.delete(s.index); return {key,phase:basePhase}; }
    const ch=cast[id];let seats=transitionStates.get(c);
    if(!seats)transitionStates.set(c,seats=new Map());
    let st=seats.get(s.index);
    if(st && time<st.time)st=null;
    const changed=!st||st.logical!==key||st.dir!==dir;
    if(changed){
      const prior=st, next={logical:key,dir,time,start:time,offset:0,entry:false,clip:null,lastFrame:prior?.lastFrame};
      if(pairedMoves.has(key)){
        const unfinishedExit=prior?.clip&&prior.logical==='idle'&&(time-prior.start)*1000<(ch.actions[prior.clip]?.duration||0);
        if(prior&&(pairedMoves.has(prior.logical)||unfinishedExit)&&prior.dir===dir){
          // Select an existing target pose nearest the last drawn foot silhouette.
          // No image interpolation and no change to movement velocity.
          const old=ch.movementFrameMeta?.[prior.lastFrame];let best=Infinity,ms=0;
          for(const f of ch.actions[key].frames){const v=ch.movementFrameMeta?.[f[0]];if(old&&v){let score=(v[0]-old[0])**2+(v[1]-old[1])**2+.25*(v[2]-old[2])**2;if(score<best){best=score;next.offset=ms;}}ms+=f[3];}
        // Arm halfway pose only when its foot silhouette fits the outgoing pose.
          if(prior.logical!==key&&pairedMoves.has(prior.logical)&&old){let bestBridge=Infinity;for(const name of ['turn-wide','turn-narrow']){const f=ch.actions[name]?.frames[0],v=f&&ch.movementFrameMeta?.[f[0]];if(v&&Math.abs(v[0]-old[0])<60&&Math.abs(v[1]-old[1])<60){const d=(v[0]-old[0])**2+(v[1]-old[1])**2;if(d<bestBridge){bestBridge=d;next.bridge=name;}}}}
        } else if(!prior||prior.logical==='idle')next.entry=true;
      }else if(key==='skill1'&&s.moveType==='skill'&&prior&&(pairedMoves.has(prior.logical)||(prior.logical==='idle'&&prior.clip&&(time-prior.start)*1000<(ch.actions[prior.clip]?.duration||0)))){
        const v=ch.movementFrameMeta?.[prior.lastFrame];next.skillEntry=!!(v&&v[1]-v[0]>=180);
        if(next.skillEntry){const d0=(v[0]+242)**2+(v[1]-165)**2,d1=(v[0]+155)**2+(v[1]-70)**2;next.skillEntryOffset=d1<d0?160:0;}
      }else if(key==='idle'&&prior&&pairedMoves.has(prior.logical)){
        const v=ch.movementFrameMeta?.[prior.lastFrame];
        const narrow=v&&(v[1]-v[0]<180);
        next.clip=(narrow?'exit_narrow_':'exit_')+prior.logical;
      }
      st=next;seats.set(s.index,st);
    }
    st.time=time;
    const elapsed=Math.max(0,(time-st.start)*1000);
    let result={key,phase:basePhase};
    if(pairedMoves.has(key)){
      const intro=ch.actions['enter_'+key];
      if(st.bridge&&elapsed<ch.actions[st.bridge].duration)result={key:st.bridge,phase:elapsed/ch.actions[st.bridge].duration};
      else if(st.entry&&intro&&elapsed<intro.duration)result={key:'enter_'+key,phase:elapsed/intro.duration};
      else {const offsetTime=Math.max(0,elapsed-(st.entry?(intro?.duration||0):st.bridge?(ch.actions[st.bridge]?.duration||0):0));result={key,phase:((offsetTime+st.offset)%ch.actions[key].duration)/ch.actions[key].duration};}
    }else if(key==='skill1'&&st.skillEntry&&basePhase*ch.actions.skill1.duration<580){result={key:'skill_move_enter',phase:((st.skillEntryOffset||0)+basePhase*ch.actions.skill1.duration*(580-(st.skillEntryOffset||0))/580)/580};
    }else if(key==='idle'&&st.clip){const clip=ch.actions[st.clip];if(clip&&elapsed<clip.duration)result={key:st.clip,phase:elapsed/clip.duration};}
    const act=ch.actions[result.key]||ch.actions.idle;
    st.lastFrame=sample(act,result.phase)[0];return result;
  }

  function paint(c,id,key,fraction,x,y,dir,targetHeight=height) {
    const ch=cast[id], act=ch?.actions[key]||ch?.actions.idle;
    if (!act) return false;
    const [index,ax,ay,,opacity=1,frameScale=1]=sample(act,fraction);
    if(window.KimiInstrumentLayers?.paint(c,{id,key,index,fraction,x,y,dir,targetHeight,nativeHeight:ch.nativeHeight,ax,ay,action:act}))return true;
    const [page,sx,sy,w,h]=ch.frames[index], entry=load(ch.atlases[page]);
    if (!entry.loaded) return false;
    const scale=targetHeight/ch.nativeHeight*frameScale;dir*=ch.nativeFacing||1;
    c.save();c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.globalAlpha*=opacity;c.translate(x,y);c.scale(dir<0?-scale:scale,scale);
    c.drawImage(entry.img,sx,sy,w,h,-ax,-ay,w,h);
    c.restore();return true;
  }

  function fallback(c,id,x,y,dir,size) {
    const im=load('duel2d/'+id+'-full.webp');
    if (!im.loaded) return;
    const h=im.img.naturalHeight,w=im.img.naturalWidth;
    c.save();c.translate(x,y);c.scale(dir<0?-1:1,1);
    c.drawImage(im.img,-size*w/h/2,-size,size*w/h,size);c.restore();
  }

  function drawFighter(c,b,p,t=0) {
    const customId=window.ArenaManifest.characters[p.body]?.id, library=window.HeroLibrary;
    const sheet=library?.images.get(customId+'sheet'), portrait=library?.images.get(customId+'art');
    if(portrait?.naturalWidth){
      const rows=['idle','walk','attack','skill','hit','guard','jump','down'];
      const animated=sheet?.naturalWidth>0,img=animated?sheet:portrait;
      const sw=img.width/(animated?4:1),sh=img.height/(animated?8:1),w=height*sw/sh;
      const row=Math.max(0,rows.indexOf(b.action)),col=Math.min(3,Math.max(0,Math.floor((b.phase||0)*4)));
      c.save();c.translate(b.x,b.y);c.scale(b.facing??b.dir??1,1);
      c.drawImage(img,animated?col*sw:0,animated?row*sh:0,sw,sh,-w/2,-height,w,height);c.restore();return;
    }
    const id=character(p,b.index);
    if (!id || !cast[id]) { window.DoubaoDepthStopCandidate?.sample({context:c,id:null,key:"idle",b,time:t}); window.ClaudeGuardReleaseTiming?.sample({context:c,id:null,key:"idle",b,time:t}); window.ClaudeBlockVisual?.filter({context:c,id:null,b,time:t}); window.QwenLandingTiming?.sample({context:c,id:null,key:"idle",b,time:t}); window.MinimaxLandingTiming?.sample({context:c,id:null,key:"idle",b,time:t}); window.GeminiLandingTiming?.sample({context:c,id:null,key:"idle",b,time:t}); window.GroupBDownTiming?.sample({context:c,id:null,key:"idle",b,time:t,phase:0}); window.ClaudeDownTiming?.sample({context:c,id:null,key:"idle",b,time:t,phase:0}); window.ChatGPTLandingTiming?.sample({context:c,id:null,key:"idle",b,time:t}); window.GLMLandingTiming?.sample({context:c,id:null,key:"idle",b,time:t}); window.ClaudeLandingTiming?.sample({context:c,id:null,key:"idle",b,time:t}); movementClocks.get(c)?.delete(b.index); transitionStates.get(c)?.delete(b.index); window.TideDownTiming?.sample({context:c,id:null,key:"idle",b,time:t,phase:0}); window.TideLandingTiming?.sample({context:c,id:null,key:"idle",b,time:t}); window.KimiLandingDiagnostic?.sample({context:c,id:null,key:"idle",b,time:t}); window.GLMDownTiming?.sample({context:c,id:null,key:"idle",b,time:t,phase:0}); window.ChatGPTDownTiming?.sample({context:c,id:null,key:"idle",b,time:t,phase:0}); window.GrokLandingDiagnostic?.sample({context:c,id:null,key:"idle",b,time:t}); window.GeminiDownTiming?.sample({context:c,id:null,key:"idle",b,time:t,phase:0}); window.QwenDownTiming?.sample({context:c,id:null,key:"idle",b,time:t,phase:0}); window.MinimaxDownTiming?.sample({context:c,id:null,key:"idle",b,time:t,phase:0}); window.DoubaoLandingDiagnostic?.sample({context:c,id:null,key:"idle",b,time:t}); window.GroupBSubstituteVisual?.filter({context:c,id:null,b,time:t}); window.DoubaoAirHitTiming?.sample({context:c,id:null,key:"idle",b,time:t}); window.GroupBMovementEntry?.sample({context:c,id:null,key:"idle",b,time:t}); return previous.drawFighter(c,b,p,t); }
    const floor=326+(b.depth||0), air=clamp((floor-b.y)/120);
    c.save();c.translate(b.x,floor+1);
    c.fillStyle='rgba(13,20,31,'+(.41-air*.19)+')';
    c.beginPath();c.ellipse(0,0,30-8*air,4.8-1.8*air,0,0,Math.PI*2);c.fill();
    c.strokeStyle=b.index?'#ffb998':'#94dfff';c.lineWidth=1.3;
    c.beginPath();c.ellipse(0,1,27-7*air,3.6-air,0,.20,Math.PI-.20);c.stroke();c.restore();
    const substituteB=window.GroupBSubstituteVisual?.filter({context:c,id,b,time:t})||b; const visualB=window.ClaudeBlockVisual?.filter({context:c,id,b:substituteB,time:t})||substituteB; const key=choose(visualB,id), ch=cast[id],act=ch.actions[key]||ch.actions.idle;
    const dir=b.facing??b.dir;
    const movementMs=movementElapsed(c,id,key,b,t,dir);
    const base=transitionChoice(c,id,key,b,t,dir,phase(act,key,b,t,movementMs));const tideLanding=window.TideLandingTiming?.sample({context:c,id,key,b,time:t}), kimiLanding=window.KimiLandingDiagnostic?.sample({context:c,id,key,b,time:t}), tideDown=window.TideDownTiming?.sample({context:c,id,key,b,time:t,phase:base.phase}), glmDown=window.GLMDownTiming?.sample({context:c,id,key,b,time:t,phase:base.phase}), chatgptDown=window.ChatGPTDownTiming?.sample({context:c,id,key,b,time:t,phase:base.phase}); const grokLanding=window.GrokLandingDiagnostic?.sample({context:c,id,key,b,time:t}); const geminiDown=window.GeminiDownTiming?.sample({context:c,id,key,b,time:t,phase:base.phase}); const qwenDown=window.QwenDownTiming?.sample({context:c,id,key,b,time:t,phase:base.phase}); const minimaxDown=window.MinimaxDownTiming?.sample({context:c,id,key,b,time:t,phase:base.phase}); const doubaoLanding=window.DoubaoLandingDiagnostic?.sample({context:c,id,key,b,time:t}); const claudeLanding=window.ClaudeLandingTiming?.sample({context:c,id,key,b,time:t}); const chatgptLanding=window.ChatGPTLandingTiming?.sample({context:c,id,key,b,time:t}); const glmLanding=window.GLMLandingTiming?.sample({context:c,id,key,b,time:t}); const claudeDown=window.ClaudeDownTiming?.sample({context:c,id,key,b,time:t,phase:base.phase}); const groupBDown=window.GroupBDownTiming?.sample({context:c,id,key,b,time:t,phase:base.phase}); const geminiLanding=window.GeminiLandingTiming?.sample({context:c,id,key,b,time:t}); const minimaxLanding=window.MinimaxLandingTiming?.sample({context:c,id,key,b,time:t}); const qwenLanding=window.QwenLandingTiming?.sample({context:c,id,key,b,time:t}); const doubaoAirHit=window.DoubaoAirHitTiming?.sample({context:c,id,key,b,time:t,phase:b.hitPhase});const groupBMoveEntry=window.GroupBMovementEntry?.sample({context:c,id,key,b,time:t});const claudeGuardRelease=window.ClaudeGuardReleaseTiming?.sample({context:c,id,key,b,time:t});const chosenBase=claudeGuardRelease||groupBMoveEntry||doubaoAirHit||qwenLanding||minimaxLanding||geminiLanding||groupBDown||claudeDown||chatgptLanding||glmLanding||claudeLanding||doubaoLanding||tideLanding||kimiLanding||grokLanding||tideDown||glmDown||chatgptDown||geminiDown||qwenDown||minimaxDown||base;
    const stopChoice=window.DoubaoDepthStopCandidate?.sample({context:c,id,key,b,time:t,chosen:chosenBase}); const chosen=stopChoice||chosenBase; if (!paint(c,id,chosen.key,chosen.phase,b.x,b.y,dir) &&
        !paint(c,id,'idle',0,b.x,b.y,dir)) fallback(c,id,b.x,b.y,dir,height);
  }

  function drawKey(c,x,y,h,p,seat) {
    const id=character(p,seat);
    if (!id) return previous.drawKey(c,x,y,h,p,seat);
    if (!paint(c,id,'idle',0,x,y,seat?-1:1,h)) fallback(c,id,x,y,seat?-1:1,h);
  }

  function drawPortrait(c,w,h,p,seat) {
    const key=window.ArenaManifest.characters[p.body]?.id, lib=window.HeroLibrary;
    const image=lib?.images.get(key+'face')||lib?.images.get(key+'art');
    if(image?.naturalWidth){const scale=Math.max(w/image.width,h/image.height);c.drawImage(image,(w-image.width*scale)/2,0,image.width*scale,image.height*scale);return;}
    const id=character(p,seat);
    if (!id) return previous.drawPortrait(c,w,h,p,seat);
    c.save();c.clearRect(0,0,w,h);c.fillStyle=id==='tide'?'#43576e':'#715648';c.fillRect(0,0,w,h);
    const entry=load('duel2d/'+id+'-face.webp');
    if(entry.loaded) {
      const img=entry.img,k=Math.max(w/img.naturalWidth,h/img.naturalHeight);
      c.drawImage(img,(w-img.naturalWidth*k)/2,(h-img.naturalHeight*k)/2,img.naturalWidth*k,img.naturalHeight*k);
    }
    c.restore();
  }

  function drawEcho(c,p,seat,dir,t) {
    const id=character(p,seat);
    if (!id) return previous.drawEcho(c,p,seat,dir,t);
    c.save();c.globalAlpha*=1-clamp((t-.60)/.40);
    paint(c,id,cast[id]?.actions.substitute_echo?'substitute_echo':'substitute',.19+.42*clamp(t),0,0,dir);
    c.restore();
  }

  function shotOffset(player,seat,kind) {
    const id=character(player,seat);
    if (!id) return null;
    const ch=cast[id],key=kind==='ultimate'?'ultimate':id==='tide'?'beacon':'skill1';
    const origin=ch.actions[key]?.origin;
    if(origin) return {x:origin[0]*height/ch.nativeHeight,y:origin[1]*height/ch.nativeHeight};
    return {x:id==='quill'?85:44,y:id==='quill'?-155:-112};
  }

  function hasBakedFx(player, seat, body) { const id=character(player,seat); return !!cast[id]?.actions[choose(body||{},id)]?.fxBaked; }
  function resetMovementClock(context) { nailongTurnStates.delete(context); window.DoubaoDepthStopCandidate?.reset(context); window.ClaudeGuardReleaseTiming?.reset(context); window.ClaudeBlockVisual?.reset(context); window.QwenLandingTiming?.reset(context); window.MinimaxLandingTiming?.reset(context); window.GeminiLandingTiming?.reset(context); window.GroupBDownTiming?.reset(context); window.ClaudeDownTiming?.reset(context); window.ChatGPTLandingTiming?.reset(context); window.GLMLandingTiming?.reset(context); window.ClaudeLandingTiming?.reset(context); movementClocks.delete(context); transitionStates.delete(context); window.TideDownTiming?.reset(context); window.TideLandingTiming?.reset(context); window.KimiLandingDiagnostic?.reset(context); window.GLMDownTiming?.reset(context); window.ChatGPTDownTiming?.reset(context); window.GrokLandingDiagnostic?.reset(context); window.GeminiDownTiming?.reset(context); window.QwenDownTiming?.reset(context); window.MinimaxDownTiming?.reset(context); window.DoubaoLandingDiagnostic?.reset(context); window.GroupBSubstituteVisual?.reset(context); window.GroupBMovementEntry?.reset(context); window.DoubaoAirHitTiming?.reset(context); }
  window.DuelArt={preload,isReadyFor,loadStatus,trimCache,character,shotOffset,drawFighter,hasBakedFx,resetMovementClock};
  window.DormArt={...previous,drawFighter,drawEcho,drawKey,drawPortrait};
  Promise.all(Object.keys(cast).map(id=>load('duel2d/'+id+'-face.webp').promise))
    .then(()=>window.dispatchEvent(new Event('dorm-art-ready')));
})();
