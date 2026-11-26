(function(root){function create(){let contexts=new WeakMap();return {reset(context){if(context)contexts.delete(context);else contexts=new WeakMap();},sample({context,id,key,b,time,chosen}){
if(!context||!b)return null;let seats=contexts.get(context);if(!seats)contexts.set(context,seats=new Map());const index=b.index,old=seats.get(index),facing=b.facing??b.dir;
const clear=()=>{seats.delete(index);return null;};
if(id!=='doubao'||!Number.isFinite(time)||!Number.isFinite(b.depth)||!Number.isFinite(b.y)||Math.abs(326+b.depth-b.y)>2)return clear();
if(old&&(old.id!==id||old.facing!==facing||time<old.time||time-old.time>.25))seats.delete(index);
let st=seats.get(index);
// Never override a current special pose, including a cancelled-body substitute cycle.
if(b.action!=='walk'&&b.action!=='idle')return clear();
if(b.moveType||b.blockPhase>=0||b.subPhase>=0||b.guard||b.shield>0||!['far','idle'].includes(key)||!['far','idle'].includes(chosen?.key??key))return clear();
if(key==='far'){
 if(b.action!=='walk'||!(b.laneStep<0)||b.depth>-36)return clear();
 seats.set(index,{id,facing,time,stage:'held'});return {key:'depth_stop_diagnostic',phase:0};
}
if(!st)return null;
if(st.stage==='held')st={id,facing,time,start:time,stage:'turn'};
st.time=time;const elapsed=(time-st.start)*1000;
if(elapsed>=170)return clear();seats.set(index,st);return {key:'depth_turn_diagnostic',phase:Math.max(0,elapsed)/170};
}};}if(typeof module==='object')module.exports=create;else root.DoubaoDepthStopCandidate=create();})(typeof window==='object'?window:globalThis);
