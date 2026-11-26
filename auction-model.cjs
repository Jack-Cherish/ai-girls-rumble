// The model designs the slate before bidding. Only validated game data leaves this module.
const rules=require('./dist/auction-rules.js');
module.exports=async function generate(data,signal,models,query){
  if(!(await models(signal)).includes(data.model))throw Error('请先在设置的「本地 AI」中保存已安装的模型');
  const meta=await query('/api/show',{model:data.model},signal);
  if(meta.remote_model||meta.remote_host)throw Error('请选择本地模型');
  let prompt='你是格斗赛事的中立规则设计师。为当前回合原创指定数量的机制不同且适合双方的擂台规则。名称用简短中文。一条规则组合1至2个条款。每个条款对双方使用同一判断。trigger 为 pulse（全场同时周期触发）、hit（对敌方实际造成伤害后）、guard（正面防住）。condition 为 always、low（自身半血及以下）、behind（自身血量落后）。effect 为 drain（扣触发者自身1至5血，至少留1）、heal（恢复1至5血）、leech（仅hit，按实伤1至30%吸血）、charge（加1能量）、recover（双技能冷却缩短1至3秒）。amount 是上述整数。seconds 为2至12秒，pulse表示基础周期，其他为每方单独触发间隔。jitter 为脉冲周期额外随机0至4秒，其他填0。pulse 的 drain 或 heal 可用 spread 增加随机幅度0至4，amount+spread不超过5，同次两人共用一次抽签。其他填0。避免刷血、秒杀、场上无作用或三项只换数字。不能针对某个角色。遵照格式返回 rules。';
  const context={round:data.round,opponents:(data.names||[]).slice(0,2).map(x=>String(x).slice(0,32)),recent:(data.recent||[]).slice(-6).map(x=>String(x).slice(0,80)),feedback:String(data.feedback||'').slice(0,400)};
  const count=data.count??3;
  if(!Number.isInteger(count)||count<1||count>3)throw Error('候选数量无效');
  context.count=count;
  context.kept=(data.kept||[]).slice(0,2).map(rules.check);
  const voice=data.rival?require('./dist/pact-personality.js').profile(data.rival):null;
  const line={type:'string',minLength:1,maxLength:48};
  const entries={...rules.schema.properties.rules,minItems:count,maxItems:count};
  const properties=data.lineOnly?{line}:{rules:entries};
  if(voice){
    properties.line=line;
    context.speaker=String(data.names?.[1]||data.rival).slice(0,32);
    context.voice=voice.voice;context.motivation=voice.motivation;
  }
  if(data.lineOnly)prompt='写一句这位斗士锁定暗标时亲口说的中文台词。';
  else prompt+=' 仅生成 count 张新卡。不得重复 kept 中已有的名称或触发、条件、效果组合。';
  if(voice||data.lineOnly)prompt+=' line 为符合该角色语气的一句简短竞价台词，不披露所选规则、报价或胜负。';
  const format={type:'object',properties,required:Object.keys(properties),additionalProperties:false};
  const body={model:data.model,stream:false,format,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(context)}],options:{temperature:.9,num_ctx:4096,num_predict:data.lineOnly?96:count*340+100}};
  body.think=false;
  let reply;
  try{reply=await query('/api/chat',body,signal);}catch(e){
    if(!e.upstreamStatus||!/schema|grammar|format/i.test(e.message))throw e;
    body.format='json';body.messages[0].content+=JSON.stringify(format);reply=await query('/api/chat',body,signal);
  }
  let raw;try{raw=JSON.parse(reply.message.content);}catch{throw Error('模型返回了无法解析的规则，请重新生成');}
  const quote=typeof raw?.line==='string'?raw.line.trim().slice(0,48):'';
  if(data.lineOnly)return {line:quote};
  if(!Array.isArray(raw?.rules))throw Error('缺少候选规则列表');
  const checked=raw.rules.slice(0,count).map(item=>{
    try{return rules.check(item);}catch{return null;}
  });
  return {rules:checked,line:quote};
};
