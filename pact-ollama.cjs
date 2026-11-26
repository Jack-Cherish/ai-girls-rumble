// Local-only inference. The game owns the prompt, endpoint and permitted decisions.
const {schema:termsSchema,valid,canAppend}=require('./dist/pact-rules.js');
const {profile,personality,allowance}=require('./dist/pact-personality.js');
const origin='http://127.0.0.1:11434';
async function query(path, body, signal){
  const call=async()=>{
    const r=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,
      body:body?JSON.stringify(body):undefined,redirect:'error',signal});
    if(!r.ok){
      const detail=await r.text();
      let reason=detail;
      try{reason=JSON.parse(detail).error||detail;}catch{}
      const error=new Error('Ollama '+r.status+' · '+String(reason).replace(/\s+/g,' ').slice(0,220));
      error.upstreamStatus=r.status;
      throw error;
    }
    return r.json();
  };
  return call();
}
async function models(signal){
  const data=await query('/api/tags',null,signal);
  return (data.models||[]).filter(m=>typeof m.name==='string'&&!m.remote_model&&!m.remote_host&&!/cloud/i.test(m.name)).map(m=>m.name);
}
const rounds={首回合:1,第1回合:1,第一回合:1,第2回合:2,第二回合:2,第3回合:3,第三回合:3,第4回合:4,第四回合:4,第5回合:5,第五回合:5};
const roundPrefix=/^(首回合|第[一二三四五1-5]回合|当前回合|本回合|这回合|整场比赛|整场|这场比赛|这场|本场)(?:[，,])?/;
function explicitDamage(text,conversation,midRound){
  let words=text.normalize('NFKC').replace(/[\s“”「」『』"']/g,'').replace(/[。.！!]+$/,'');
  words=words.replace(/^(?:轻点打|打轻点|下手轻点)(?:的意思)?(?:是指|就是)/,'');
  const scope=words.match(roundPrefix);
  // Earlier scope or other mechanics may be part of a multi-turn offer.
  if(conversation.some(turn=>turn?.terms||turn?.speaker==='玩家'&&/回合|整场|本场|这场|先攻|先手|停手|停战|技能|冷却|速度/.test(turn.text)))return null;
  let round=0;
  if(scope){
    const label=scope[1];
    if(label.endsWith('回合')){
      round=rounds[label]??midRound;
      if(!round||round<midRound)return null;
    }
    words=words.slice(scope[0].length);
  }
  const parts=words.split(/[,，]/);
  if(parts.length>2)return null;
  const [damage,social='']=parts;
  if(social&&!/^(?:我)?请你(?:吃|喝)[^。.!?？;；，,]{1,24}(?:是)?(?:赛后|打完(?:后)?|比赛结束后)(?:兑现|请客|再请)$/.test(social))return null;
  const match=damage.match(/^(?:请|麻烦)?(?:把)?(?:你的?)?(?:扣血)?伤害(?:比例)?(降至|降到|降低到|调到|改到|设为|降低|减少)([1-9]\d?)(%)?$/);
  if(!match)return null;
  const [,operator,amount,unit]=match;
  const reduction=operator==='降低'||operator==='减少';
  if(reduction&&!unit)return null;
  return {terms:{clauses:[{kind:'damage',seat:1,round,percent:reduction?100-Number(amount):Number(amount)}]},social};
}
function explicitCeasefire(text,round){
  if(round<1||round>5)return null;
  const words=text.normalize('NFKC').replace(/[\s“”「」『』"']/g,'');
  const match=words.match(/^(?:从现在(?:开始|起)?[,]?)?(?:我们(?:俩)?|咱们(?:俩)?|双方|两边)(?:都|一起)?(?:先)?(?:停手|停战|休战|暂停出招|不出招|别出招)([1-9]\d?|[一二两三四五六七八九]|[二三四五六]?十[一二三四五六七八九]?)秒(?:钟)?(?:再打|后继续(?:打|战斗)?)?(?:吧|好吗|行吗|可以吗|吗)?[。.！!？?]*$/);
  if(!match)return null;
  const duration=match[1].replace('两','二');
  const digit=c=>'零一二三四五六七八九'.indexOf(c);
  let seconds=Number(duration);
  if(duration.includes('十')){
    const [tens,ones]=duration.split('十');
    seconds=(tens?digit(tens):1)*10+(ones?digit(ones):0);
  }else if(Number.isNaN(seconds))seconds=digit(duration);
  if(seconds<1||seconds>60)return null;
  const clauses=[0,1].map(seat=>({kind:'hold',seat,round,seconds,untilAttack:false}));
  return {terms:{clauses},ceasefireSeconds:seconds};
}
async function decide(data,signal){
  const plea=data.task==='plea',judge=data.task==='judge',opening=data.task==='opening';
  const options=Array.isArray(data.offers)?data.offers:[];
  if(judge && (!options.length || options.length>2 || !options.every(o=>valid(o.terms))))throw Error('待评估协议无效');

  const person=profile(data.rival);
  const midRound=Number.isInteger(data.midRound)&&data.midRound>0?data.midRound:0;
  const text=String(data.text||'').slice(0,300);
  if(!(await models(signal)).includes(data.model))throw Error('请先选择已安装的本地模型');
  const meta=await query('/api/show',{model:data.model},signal);
  if(meta.remote_model||meta.remote_host)throw Error('请选择本地模型');

  const conversation=(Array.isArray(data.history)?data.history.slice(-6):[]).filter(turn=>turn&&['玩家','对手'].includes(turn.speaker)&&typeof turn.text==='string')
    .map(turn=>({speaker:turn.speaker,text:turn.text.slice(0,300),...(valid(turn.terms)?{terms:turn.terms}:{})}));
  const userWords=[...conversation.filter(t=>t.speaker==='玩家').map(t=>t.text),text].join('。');
  const mentionsFirst=/(?:先攻|先手|先出手|先打|先动手|先出招|抢攻)/.test(userWords);
  const hasFirst=terms=>terms?.clauses?.some(c=>c.kind==='first')||Number.isInteger(terms?.first)&&terms.first!==-1;
  const explicit=(data.task==='deal'||judge)?explicitCeasefire(text,midRound)||explicitDamage(text,conversation,midRound):null;
  if(data.task==='deal' && explicit && (!midRound||canAppend(data.battle?.existing||[],explicit.terms,midRound))){
    const {terms}=explicit;
    return {decision:'accept',line:'条件清楚了，我考虑一下。',terms,proposal:terms};
  }
  const settledWording=judge&&explicit&&options.length===1&&signature(options[0].terms)===signature(explicit.terms);
  const shortRequest=text.replace(/[，。？！、,.!?\s～~]/g,'');
  const gentle=data.task==='deal' &&
    /^(?:请|请你|你)?(?:能不能|可以|能|可不可以)?(?:对我)?(?:轻(?:一)?点(?:儿)?(?:打)?|打轻(?:一)?点(?:儿)?|下手轻(?:一)?点(?:儿)?|手下留情)(?:吗|嘛|呀|吧|啊)?$/.test(shortRequest);
  const decisions=opening?['propose']:gentle?['clarify']:judge?(settledWording?['choose','reject']:['choose','reject','clarify']):plea?['accept','reject']:['accept','counter','reject','clarify'];
  const properties={decision:{type:'string',enum:decisions},line:{type:'string',maxLength:120}};
  if(judge)properties.choice={type:'integer',enum:[-1,...options.map((_,i)=>i)]};
  if(opening)properties.proposal=termsSchema;
  else if(!plea && !judge && !gentle){
    // proposal is the player's terms. A counteroffer may change individual fields.
    const nullable={anyOf:[termsSchema,{type:'null'}]};
    properties.proposal=nullable;properties.counter=nullable;
  }
  if(opening && (!midRound || midRound>5))throw Error('缺少当前回合');
  const schema={type:'object',additionalProperties:false,required:Object.keys(properties),properties};
  const roleGuide='你扮演这场格斗的对手，用第一人称说一句自然的中文。依据 personality 的动机、语气，好胜、慷慨、冒险三项性格及好感和信任做决定。'+
    'proposal 字段中的玩家原话和本次 conversation 是理解当前提议的依据。分清是谁说的话。玩家明确承接上轮报价时才沿用该报价的条款。这是首次谈话，不认识玩家，没有上次交手、谈判或承诺。当前窗口的报价不是已经执行的协议。'+
    '回应玩家实际说的事。沿用本轮和之前已经说明的数值、范围和时间，不要再次确认已回答的问题。对玩笑、请客或人情可以接话，这些社交承诺不转换成战斗效果，也不需要追问餐厅等细节。只追问会影响执行且还没回答的歧义，一次问一个问题。没有提到先攻，就不询问先攻、不添加先攻。只说不放技能时，可以就禁用范围追问，也可以拒绝或提出自己的交换条件。你主动增加的交换条件是你自己的还价，不能说成玩家提过或已同意。';
  const ruleGuide='seat 0 是玩家，1 是你。每条有 seat、round（0 为本场剩余时间，也可指定当前或将来的某个回合）。'+
    'hold 表示该方暂停主动出招，可移动和防御；seconds 为等待秒数，0 表示至条款到期；untilAttack 只有在玩家明确提到对方先出招即解除时才设为 true。玩家用“我们都”“咱们一起”或“双方”表示两名角色，双方停手需为 seat 0 和 seat 1 各写一条 hold，时长相同。时长支持 1 到 60 秒，中文数词同样有效。'+
    'lend 是该方借出 skill 指定的招式，uses 为成功释放次数；lock 是该方禁用该技能。skill、skill2、ultimate 分别是一技能、二技能、奥义。'+
    'first 是该方优先出招的秒数；damage 是该方造成的扣血伤害比例（percent 1–99）。伤害比例降到 70 或降到 70% 都是原伤害的 70%，降低 70% 则是剩下 30%。确定比例后，若没有指定期限且前文也没有限定，round=0。speed 和 recharge 是走位速度（50–150%）与普通技能冷却恢复速率（50–200%），100 表示没有变化。'+
    '条款可组合，仅可执行引擎支持的效果。battle.arenaRule 是双方公共规则，不能通过私人协议修改。';
  let taskGuide;
  if(opening)taskGuide='战中由你主动叫停。结合当前血量、能量、关系和局势，直接向玩家提一份具体交易。line 和 proposal 表达同一交易，不替玩家答应。';
  else if(gentle)taskGuide='玩家在试探你愿不愿意让步。按你的性格回应并问清一项具体尺度。只返回 clarify 和 line。';
  else if(judge)taskGuide='现在决定是否接受。根据 offers 的来源区分原提议与你的还价。权衡性格、这次对话里的人情与收益；baseline 为 null 时没有胜率数据，不得编造。有推演时它仅是模拟估计，平局单列；你可以作出超出让步参考值的决定。从 offers 中选择时 choice 写索引，拒绝或追问时写 -1。台词与所选条款一致。';
  else if(plea)taskGuide='玩家残血，请求双方停战三秒。按性格决定接受或拒绝。';
  else taskGuide='翻译当前提议，此步尚未成交。明确的条件用 accept，proposal 只写玩家实际提出或明确承接的战斗条款，counter=null。需要澄清时用 clarify。也可以用 counter 主动开出完整、可执行的还价，并明确是你提出的；原提议无法完整表达时 proposal=null。reject 和 clarify 时两项均为 null。玩家明确要求整场无条件停手也可以提出。';
  if(settledWording)taskGuide+='这份提议已经解析完毕。按 offers 的条款作出接受或拒绝的决定，不再追问。若有 socialNote，可以顺带回应。';
  const instructions=roleGuide+taskGuide+'line 只含对玩家说的话，不写人物标签、Markdown、角色设定或分析过程。技能列表不是战斗记录；胜率推演是模拟。遇到纯闲聊，只回应原话，deal 返回 clarify，不生成条款。不得编造以往借招、出招或交手经过。';
  const characterProfile=person,traits=personality(data.rival);
  const relation={affinity:50,trust:50};
  const context={traits,relation,skills:Array.isArray(data.skills)?data.skills.slice(0,2):[],player:String(data.player||'玩家').slice(0,32),name:String(data.name||'对手').slice(0,32),personality:{label:characterProfile.label,motivation:characterProfile.motivation,voice:characterProfile.voice},
    conversation,proposal:text};
  
  if(midRound){context.currentRound=midRound;context.battle=data.battle||{};context.phase='残血谈判，双方暂停。新条款从恢复战斗起算，round=0 表示本场剩余时间。不得指定已过回合。没有比赛初始胜率推演可用于这一刻。';}
  if(!midRound)context.phase='赛前：本场还未开打。没有以前的交手或协议。本窗口仅记录当前谈话，不代表条款已执行。';
  if(judge)Object.assign(context,{offers:options,baseline:data.baseline,allowancePoints:allowance(traits,relation)});
  if(settledWording&&explicit.social)context.socialNote=explicit.social;
  const body={model:data.model,stream:false,format:schema,messages:[{role:'system',content:instructions+ruleGuide},{role:'user',content:JSON.stringify(context)}],options:{temperature:opening ? 0.9 : judge ? 0.55 : 0.25,num_predict:1024,num_ctx:4096}};
  body.think=false;
  body.messages[0].content+=' 只输出 JSON。decision 为 '+decisions.join('/')+'，line 为你的中文答复。';
  let repaired=false;
  for(;;){
    let raw;
    try{raw=await query('/api/chat',body,signal);}
    catch(e){
      if(e.upstreamStatus && body.format!=='json' && /schema|grammar|format|anyOf|unmarshal.*string/i.test(e.message)){
        body.format='json';
        body.messages[0].content+=' 输出字段定义：'+JSON.stringify(schema);
        continue;
      }
      throw e;
    }
    try{
      const reply=parseDecision(raw,decisions,plea,judge?options.length:0);
      const stale=/(?:上次|上场|上一[次场局]|之前|以前|老对手)[^。！？!?]{0,24}(?:借过|借招|借你|借我|交手|打过|出招|签了|签过|约定|违约|守约|背约|欠我|答应过|偷袭|赢了|输了)|(?:又见面|还记得你|好久不见|刚才那招)|(?:刚才|方才)[^。！？!?]{0,16}(?:你打了|你出招|我借了|你借了)/.test(reply.line);
      if(stale)throw Error('当前是首次谈话，不能声称有旧交手、旧交易或已执行的报价。');
      if(!opening&&!plea&&!mentionsFirst&&(!judge||!options.some(o=>hasFirst(o.terms)))&&
        (/先攻|先手|先出招秒数/.test(reply.line)||hasFirst(reply.terms)||hasFirst(reply.proposal)))
        throw Error('玩家没有提出先攻，不要追问或添加先攻相关条款。');
      if(midRound && reply.terms && !canAppend(context.battle.existing||[],reply.terms,midRound))throw Error('提议与仍在执行的约定冲突或指定了已过回合。请换一个能执行的条件。');
      if(gentle && (!/[？?]|多少|几成|多久|行吗|可以吗/.test(reply.line) || /先攻|先手|已生效|已成交/.test(reply.line)))reply.line=person.lines.gentle;
      if(settledWording&&explicit.ceasefireSeconds&&reply.decision==='choose'){
        reply.line='可以，我们都停手 '+explicit.ceasefireSeconds+' 秒。';
      }else if(settledWording&&/[？?]/.test(reply.line)){
        if(explicit.ceasefireSeconds&&/停手|停战|休息|暂停|出招|几秒|多久/.test(reply.line))reply.line=person.lines.reject;
        else if(reply.decision==='choose'&&/伤害|扣血|比例|赛后|餐厅|请客|兑现/.test(reply.line))reply.line=person.lines.accept;
      }
      return reply;
    }
    catch(e){
      if(repaired){
        if(opening)throw e;
        if(judge)return {decision:'reject',choice:-1,line:person.lines.reject};
        if(plea)return {decision:'reject',line:person.lines.reject};
        const asksSkills=/(?:不|别|禁|不要|不能)[^。！？!?]{0,6}(?:技能|招式|奥义)/.test(text);
        return {decision:'clarify',line:gentle?person.lines.gentle:asksSkills?person.lines.skillScope:person.lines.retry};
      }
      repaired=true;
      const retry=settledWording?'条件已明确，只能接受或拒绝。':'条件不明确可用 clarify。';
      body.messages.push({role:'user',content:'请重做上一条提议的 JSON。上一次的问题是：'+e.message+'。保留玩家原意。'+retry});
    }
  }
}
function signature(terms){
  return JSON.stringify((terms?.clauses||[]).map(c=>JSON.stringify(Object.entries(c).sort(([a],[b])=>a.localeCompare(b)))).sort());
}
function parseDecision(raw,decisions,plea,choices){
  const content=raw?.message?.content;
  const text=typeof content==='string'?content.trim().replace(/^<think>[\s\S]*?<\/think>\s*/i,'').replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1'):'';
  if(!text)throw Error(raw?.done_reason==='length'?'模型已达到输出长度上限，还没有返回协议。':'模型回复为空。');
  let value;
  try{value=JSON.parse(text);}
  catch{throw Error(raw?.done_reason==='length'?'模型输出达到长度上限，协议没有写完。':'模型回复不是完整的 JSON。');}
  if(!value || !decisions.includes(value.decision)||typeof value.line!=='string'||!value.line.trim())throw Error('模型回复缺少有效的决定或台词。');
  const line=value.line.trim();
  if(line.length>120 || /[{}]|```|\*\*|<\/?(?:think|analysis)>|玩家(?:的)?(?:原话|意图)|作为(?:一个|一名)?(?:AI|人工智能)助手|根据(?:系统提示词|我的人格设定)|推演线程|JSON字段/i.test(line))
    throw Object.assign(Error('line 只写角色直接对玩家说的简短台词，不附加设定、分析或格式标记。'),{code:'INVALID_DIALOGUE'});
  const reply={decision:value.decision,line};
  if(choices){
    const index=value.choice;
    if(value.decision==='choose' ? !Number.isInteger(index)||index<0||index>=choices : index!==-1)throw Error('请返回一个有效的候选编号');
    return {...reply,choice:index};
  }
  if(plea || ['reject','clarify'].includes(value.decision))return reply;
  const counter=value.decision==='counter';
  if(!valid(counter?value.counter:value.proposal) || (counter && value.proposal!=null && !valid(value.proposal)) || (!counter && value.counter!=null))
    throw Error('协议字段无效或条款冲突。请分别检查每条约定的对象、作用期限及该类型的参数。');
  return {...reply,terms:counter?value.counter:value.proposal,proposal:value.proposal??null};
}
let inFlight=null;
module.exports=async function servePact(req,res,url,readBody,json){
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||
    !['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+req.headers.host).hostname)||
    (req.headers.origin && req.headers.origin!=='http://'+req.headers.host)||req.headers['sec-fetch-site']==='cross-site')
    return json(res,403,{error:'本地推理仅供此电脑上的游戏页面使用'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),url.pathname.endsWith('/models')?5500:150000);
  res.once('close',()=>controller.abort());
  try{
    if(req.method==='GET'&&url.pathname==='/pact/models')return json(res,200,{models:await models(controller.signal)});
    if(req.method!=='POST'||url.pathname!=='/pact/decide'||!(req.headers['content-type']||'').startsWith('application/json'))return json(res,400,{error:'无效的博弈请求'});
    const data=await readBody(req,32000);
    if(!data || !['plea','deal','judge','opening','auction'].includes(data.task))return json(res,400,{error:'未知的博弈操作'});
    const background=data.task==='auction'&&data.background===true;
    if(inFlight&&!inFlight.controller.signal.aborted){
      if((background&&!(inFlight.lineOnly&&!data.lineOnly))||!inFlight.background)return json(res,429,{error:'模型正在处理另一条提议'});
      inFlight.controller.abort('foreground');
    }
    inFlight={controller,background,lineOnly:data.lineOnly===true};
    try{return json(res,200,await (data.task==='auction'?require('./auction-model.cjs'):decide)(data,controller.signal,models,query));}
    finally{if(inFlight?.controller===controller)inFlight=null;}
  }catch(e){
    if(!res.destroyed){
      if(controller.signal.reason==='foreground')return json(res,409,{error:'后台规则生成已让位给当前操作'});
      const timeout=controller.signal.aborted;
      const reason=timeout?(url.pathname.endsWith('/models')?'读取模型列表超时。':'本机模型在 150 秒内没有完成回复，可在设置中测试模型。'):
        e.message==='fetch failed'?'未连接本机 Ollama':e.message;
      json(res,timeout?504:503,{error:reason});
    }
  }
  finally{clearTimeout(timer)}
};
