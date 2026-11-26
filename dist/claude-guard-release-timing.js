(function(root){function create(){let states=new WeakMap();return{
reset(ctx){if(ctx)states.delete(ctx);else states=new WeakMap();},
sample({context,id,key,b,time}){if(!context||!b)return null;let seats=states.get(context);if(!seats)states.set(context,seats=new Map());const clear=()=>{seats.delete(b.index);return null;};if(id!=='quill'||!Number.isFinite(time))return clear();let st=seats.get(b.index);const dir=b.facing??b.dir;if(st&&(time<st.time||time-st.time>.25||st.dir!==dir)){clear();st=null;}
const ground=Math.abs(326+(b.depth||0)-b.y)<1;const reacting=b.blockPhase>=0||b.hitRemaining>0||b.subPhase>=0;
if(key==='guard'&&b.guard&&!b.shield&&ground&&!reacting){seats.set(b.index,{held:b.guardTime>=.12,time,dir});return null;}
if(key!=='idle'||b.guard||b.shield||!ground||reacting)return clear();
if(st?.held)st={start:time,time,dir,held:false};
if(st?.start!==undefined){const dt=time-st.start;st.time=time;seats.set(b.index,st);if(dt>=0&&dt<.1-1e-8)return{key:'claude_guard_release',phase:dt/.1};}return clear();
}}}if(typeof module==='object')module.exports=create;else root.ClaudeGuardReleaseTiming=create();})(typeof window==='object'?window:globalThis);
