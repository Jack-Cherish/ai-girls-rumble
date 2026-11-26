(function(root){function create(){let states=new WeakMap();return{
reset(ctx){if(ctx)states.delete(ctx);else states=new WeakMap();},
sample({context,id,key,b,time}){if(!context||!b)return null;let seats=states.get(context);if(!seats)states.set(context,seats=new Map());const clear=()=>{seats.delete(b.index);return null;};if(id!=='qwen'||!Number.isFinite(time))return clear();let st=seats.get(b.index);const dir=b.facing??b.dir;
if(st&&(time<st.time||time-st.time>.25||st.dir!==dir)){seats.delete(b.index);st=null;}
if(key==='jump'){seats.set(b.index,{key,time,dir,phase:b.phase,air:326+(b.depth||0)-b.y});return null;}
if(key!=='idle'||Math.abs(326+(b.depth||0)-b.y)>1)return clear();
if(st?.key==='jump'&&st.phase>.5&&st.air>0)st={key:'landing',start:time,time,dir};
if(st?.key==='landing'){st.time=time;seats.set(b.index,st);const t=time-st.start;if(t>=0&&t<.18)return{key:'qwen_landing_soft',phase:t/.18};}
return clear();
}}}if(typeof module==='object')module.exports=create;else root.QwenLandingTiming=create();})(typeof window==='object'?window:globalThis);
