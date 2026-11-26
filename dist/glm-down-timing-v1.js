/* Visual-only KO landing timing. Never changes physics, health or result delay. */
(function(root){function create(){let states=new WeakMap();return {reset(context){if(context)states.delete(context);else states=new WeakMap();},sample({context,id,key,b,time,phase}){
 if(!context||!b)return null;if(id!=='glm'){states.get(context)?.delete(b.index);return null;}let seats=states.get(context);if(!seats)states.set(context,seats=new Map());if(key!=='down'){seats.delete(b.index);return null;}
 let st=seats.get(b.index);const fresh=!st||time<st.time;if(fresh)st={time,airSeen:false,land:null};const airborne=326+(b.depth||0)-b.y>2;
 if(fresh&&!airborne&&phase>=1){st.land=time-.45;}
 if(airborne){st.airSeen=true;st.land=null;}else if(st.land===null&&(st.airSeen||phase>=.17))st.land=time;
 st.time=time;seats.set(b.index,st);return {key:'down',phase:st.land===null?.09:time-st.land>=.45-1e-6?1:Math.min(1,.17+.83*(time-st.land)/.45)};
 }};}if(typeof module==='object')module.exports=create;else root.GLMDownTiming=create();})(typeof window==='object'?window:globalThis);
