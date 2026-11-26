/* Visual-only: air heavy_hit, grounded fall then down. No simulation mutations. */
(function(root){function create(){let states=new WeakMap();return{
reset(context){if(context)states.delete(context);else states=new WeakMap();},
sample({context,id,key,b,time,phase}){if(!context||!b)return null;if(id!=='quill'){states.get(context)?.delete(b.index);return null;}
let seats=states.get(context);if(!seats)states.set(context,seats=new Map());if(key!=='down'){seats.delete(b.index);return null;}
let st=seats.get(b.index),fresh=!st||time<st.time;if(fresh)st={time,airSeen:false,land:null};
const airborne=326+(b.depth||0)-b.y>2;if(fresh&&!airborne&&phase>=1)st.land=time-.45;
if(airborne){st.airSeen=true;st.land=null;}else if(st.land===null&&(st.airSeen||phase>=.12))st.land=time;
st.time=time;seats.set(b.index,st);if(st.land===null)return{key:'down',phase:.09};const t=Math.max(0,time-st.land);
return{key:'down',phase:t>=.45-1e-6?1:t<.18?.105+(.271-.105)*t/.18:Math.min(1,.271+.729*(t-.18)/.27)};
}}}if(typeof module==='object')module.exports=create;else root.ClaudeDownTiming=create();})(typeof window==='object'?window:globalThis);
