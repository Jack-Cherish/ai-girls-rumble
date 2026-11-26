/* Cancel only stale block pose after a real unguarded movement. No combat writes. */
(function(root){function create(){let states=new WeakMap();return{reset(context){if(context)states.delete(context);else states=new WeakMap();},
filter({context,id,b,time}){if(!context||!b)return b;let seats=states.get(context);if(!seats)states.set(context,seats=new Map());
if(!['quill','minimax','glm','qwen','tide','chatgpt','gemini','grok','kimi','doubao'].includes(id)||!(b.blockPhase>=0)){seats.delete(b.index);return b;}
const start=time-b.blockPhase*.25;let st=seats.get(b.index);if(!st||st.id!==id||time<st.time||b.blockPhase<st.phase||Math.abs(start-st.start)>.035)st={id,start,cancelled:false};
if(!b.guard&&!b.shield&&['jump','walk'].includes(b.action))st.cancelled=true;st.phase=b.blockPhase;st.time=time;seats.set(b.index,st);
return st.cancelled?{...b,blockPhase:-1}:b;
}};}if(typeof module==='object')module.exports=create;else root.ClaudeBlockVisual=create();})(typeof window==='object'?window:globalThis);
