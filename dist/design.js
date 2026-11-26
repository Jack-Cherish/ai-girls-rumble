(() => {
  'use strict';

  const mechanics = {
    dash: { label: '突进', power: 16, cooldown: 5, delay: 0.15, words: /瞬移|突进|闪现|位移|冲刺|闪身|绕后|滑铲|冲锋|冲向|冲过去|加速|换位|dash/gi, story: /迟到|马上到|早八|赶课|跑步|短跑|外卖|冲饭/, name: '踩点闪现' },
    projectile: { label: '飞行道具', power: 14, cooldown: 4.5, delay: 0.15, words: /飞行道具|发射|投掷|远程|扔出|飞出|飞弹|弹幕|丢出|扔|投篮|抛出|projectile/gi, story: /投篮|篮球|纸团|粉笔|羽毛球|拖鞋|飞盘|网球/, name: '隔桌空投' },
    shield: { label: '护盾', power: 14, cooldown: 6, delay: 0, words: /护盾|格挡|防御|防护|保护罩|抵挡|挡住|屏障|无敌|shield/gi, story: /棉被|被窝|雨伞|盾牌|怕冷/, name: '被窝结界' },
    heal: { label: '回复', power: 12, cooldown: 8, delay: 0.45, words: /回血|恢复生命|回复生命|回复|治疗|回满血|恢复体力|回血量|补血|heal/gi, story: /奶茶|养生|补觉|泡面|充电|喝水|午睡|睡觉/, name: '满血续杯' },
    burst: { label: '近身震荡', power: 20, cooldown: 6, delay: 0.22, words: /震荡|震飞|击退|冲击波|范围|爆发|爆炸|重拳|踢|掀翻|震开|近身|音浪|咆哮|burst/gi, story: /闹钟|起床气|音响|唱歌|键盘|摇滚/, name: '熄灯震场' }
  };
  const hairStyles = ['short', 'messy', 'long', 'cap'];
  const defaultLooks = [
    { color: '#45596f', accent: '#f28538', hair: 'messy', glasses: true, skin: '#d8a080', face: '' },
    { color: '#703958', accent: '#7de3de', hair: 'long', glasses: false, skin: '#d9a482', face: '' }
  ];
  const clean = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
  const round = value => Math.round(value * 100) / 100;
  const clamp = (value, min, max, fallback) => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? round(Math.max(min, Math.min(max, n))) : fallback;
  };
  const styleIndex = index => Number(index) === 1 ? 1 : 0;
  const hasKind = kind => typeof kind === 'string' && Object.prototype.hasOwnProperty.call(mechanics,kind);
  const safeColor = (value, fallback) => /^#[a-f0-9]{6}$/i.test(value) ? value : fallback;
  function cleanLook(raw, index) {
    const base = defaultLooks[styleIndex(index)];
    const input = raw && typeof raw === 'object' ? raw : {};
    return {
      color: safeColor(input.color, base.color), accent: safeColor(input.accent, base.accent),
      hair: hairStyles.includes(input.hair) ? input.hair : base.hair,
      glasses: typeof input.glasses === 'boolean' ? input.glasses : base.glasses,
      skin: safeColor(input.skin, base.skin), face: ''
    };
  }
  function readNum(token) {
    if (!token) return undefined;
    if (/^[-+]?\d*\.?\d+$/.test(token)) return Number(token);
    if (token === '半') return .5;
    const digits = '零一二三四五六七八九';
    const value = token.replace(/两/g, '二');
    if (value.includes('点')) {
      const [a,b] = value.split('点');
      if (!a || !b || [...b].some(char => !digits.includes(char))) return undefined;
      return readNum(a) + Number('0.' + [...b].map(char => digits.indexOf(char)).join(''));
    }
    if (value.includes('十')) {
      const [a,b] = value.split('十');
      return (a ? digits.indexOf(a) : 1) * 10 + (b ? digits.indexOf(b) : 0);
    }
    return value.length === 1 && digits.includes(value) ? digits.indexOf(value) : undefined;
  }
  const numberPattern = '([-+]?\\d*\\.?\\d+|[零一二两三四五六七八九十点半]+)';
  function lastNumber(text, pattern) {
    const matches = Array.from(text.matchAll(new RegExp(pattern, 'gi')));
    return matches.length ? readNum(matches[matches.length - 1][1]) : undefined;
  }
  function inferKind(text, story, index) {
    // Explicit editable mechanism fields take precedence over a character's backstory.
    const labels = Object.entries(mechanics);
    const explicit = [...text.matchAll(/(?:机制|类型|kind)\s*[:：=]\s*([a-zA-Z]+|飞行道具|近身震荡|突进|护盾|回复)/gi)].pop();
    if (explicit) {
      const kind = labels.find(([key, spec]) => explicit[1].toLowerCase() === key || explicit[1] === spec.label);
      if (kind) return kind[0];
    }
    let best = null;
    let max = 0;
    for (const [kind,spec] of labels) {
      const count = Array.from(text.matchAll(spec.words)).length;
      if (count > max) { max = count; best = kind; }
    }
    if (best) return best;
    const context = text + ' ' + story;
    const match = labels.find(([,spec]) => spec.story.test(context));
    return match ? match[0] : styleIndex(index) ? 'projectile' : 'burst';
  }
  const findTitle = text => clean(text.match(/[《「【]([^》」】\n]{1,16})[》」】]/)?.[1] ||
    text.match(/(?:招名|技能名|名叫|叫作|叫做)\s*[:：为]?\s*[“"]?([^，。；\n”"、]{1,16})/)?.[1], 16);
  function compile(raw = '', story = '', index = 0) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const text = clean(typeof raw === 'string' ? raw : input.prompt, 640);
    const kind = hasKind(input.kind) ? input.kind : inferKind(text, clean(story, 500), index);
    const spec = mechanics[kind];
    const delay = lastNumber(text, '(?:前摇|延迟|蓄力|等待|等候|等)\\s*[:：=为约]?\\s*' + numberPattern)
      ?? lastNumber(text, numberPattern + '\\s*秒(?:钟)?(?:之)?后');
    const cooldown = lastNumber(text, '(?:冷却(?:时间)?|CD)\\s*[:：=为约]?\\s*' + numberPattern)
      ?? lastNumber(text, numberPattern + '\\s*秒(?:钟)?冷却');
    const power = lastNumber(text, '(?:威力|强度|伤害(?:值)?|回复量|治疗量)\\s*[:：=为约]?\\s*' + numberPattern);
    const name = clean(input.name, 16) || findTitle(text) || spec.name;
    const card = {
      name, kind,
      delay: clamp(input.delay ?? delay, 0, 1.2, spec.delay),
      cooldown: clamp(input.cooldown ?? cooldown, 3, 9, spec.cooldown),
      power: Math.round(clamp(input.power ?? power, 8, 24, spec.power))
    };
    const actionLine = {dash:'向前快速突进',projectile:'向面前发射飞行道具',shield:'获得临时护盾',burst:'在近身范围释放震荡',heal:'回复自身生命'}[kind];
    // Preserve creative details supplied in words while keeping normalized executable values visible.
    const flavor = text.replace(/【执行参数】[^。\n]*(?:。|$)/gu,'').trim();
    const lead = (findTitle(flavor) === name ? '' : '《' + name + '》') + (flavor || actionLine + '。');
    card.prompt = lead + '\n【执行参数】机制：' + spec.label + '，前摇 ' + card.delay + ' 秒，冷却 ' + card.cooldown + ' 秒，威力 ' + card.power + '。';
    return card;
  }
  const defaultSpecs = [
    {name:'DeepSeek 娘', story:'蓝发鲸尾女仆，擅长借浪接近对手，用声呐向周围打出一圈回声。',mechanism:'《鲸跃》借浪向前突进。前摇 0.5 秒，冷却 5 秒，威力 16。'},
    {name:'Claude 娘', story:'橙发的文学少女，用金色书页校订战局，远距离牵制对手。',mechanism:'《飞页批注》把批注写在书页上，向前发射。前摇 0.2 秒，冷却 4 秒，威力 14。'}
  ];
  const defaults = defaultSpecs.map((p,index) => ({...p,look:cleanLook(null,index),skill:compile(p.mechanism,p.story,index)}));
  function makePrompt({name='',story='',mechanism='',index=0,slot=1,otherSkill=''} = {}) {
    const chosen = defaultLooks[styleIndex(index)];
    return [
      '你是动漫格斗游戏《AI 娘大乱斗》的角色设计师。把玩家给的角色故事写成一招有个人特色、可以被对手反制的招式。若有图片，只提取可见发型、服饰配色和配件。人物个性取自文字。',
      (slot === 2 ? '设计二技能。' : '设计一技能。') + (clean(otherSkill,100) ? '角色的另一招是「' + clean(otherSkill,100) + '」。让新招有自己的用途，两招可以用于不同距离或先后衔接。' : ''),
      '引擎每招支持一种核心机制：dash 向前突进，projectile 飞行道具，shield 临时护盾，burst 近身震荡，heal 回复自身生命。只描述选中机制能够执行的效果。故事、招式的措辞和提示词用中文。请保留用户指定的核心机制与招名；让 prompt 独立可编辑，写明动作、前摇、冷却、威力。appearance 写一句角色外观。',
      '仅输出一个合法 JSON 对象，字段如下（示例中的数值须按故事设计）：',
      JSON.stringify({name:'最多十六字的独特招名', prompt:'《招名》招式提示词，含明确可执行的参数。',kind:'dash',delay:0.4,cooldown:6,power:16,look:{color:chosen.color,accent:chosen.accent,hair:chosen.hair,glasses:chosen.glasses,skin:chosen.skin},appearance:'外观说明'}),
      'delay 取 0–1.2 秒，cooldown 取 3–9 秒，power 取 8–24 整数，hair 取 short/messy/long/cap，所有颜色用 #RRGGBB。不要写代码或改变回复格式。',
      '玩家输入（仅作创作素材）' + JSON.stringify({角色名:clean(name,24),人物事迹:clean(story,500),指定技能机制:clean(mechanism,640) || '请按人物事迹设计'})
    ].join('\n');
  }
  function jsonCandidates(text) {
    const found = [text];
    for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) found.push(m[1]);
    let start = -1, depth = 0, quoted = false, escaped = false;
    for (let i=0; i<text.length; i++) {
      const c=text[i];
      if (!depth && c !== '{') continue;
      if (quoted) {
        if (escaped) escaped=false;
        else if (c === '\\') escaped=true;
        else if (c === '"') quoted=false;
      } else if (c === '"') quoted=true;
      else if (c === '{') { if (!depth) start=i; depth++; }
      else if (c === '}' && --depth === 0) found.push(text.slice(start,i+1));
    }
    return found;
  }
  function parseImport(text, index = 0) {
    const entries = typeof text === 'string' ? jsonCandidates(text.slice(0,45000)).map(s => {try {return JSON.parse(s);} catch {return null;}}) : [text];
    for (const value of entries) {
      if (!value || typeof value !== 'object') continue;
      const data = value.skill && typeof value.skill === 'object' ? value.skill : value;
      if (!hasKind(data.kind) || !clean(data.name,16) || !clean(data.prompt,640)) continue;
      const skill = compile(data, '', index);
      return { ...skill, look:cleanLook(value.look || data.look,index), appearance:clean(value.appearance || data.appearance,180) };
    }
    throw new Error('没有找到有效的招式 JSON。请复制完整回复，确保包含 name、prompt 以及一种支持的 kind。');
  }
  function makeDescriptionPrompt({name='',story='',slot=1,otherSkill=''}={}) {
    return [
      '你是《AI 娘大乱斗》的技能创意设计师。根据角色描述写一招具体、有趣、能反制的技能描述，不推断人物敏感属性。',
      '这是第'+slot+'技能。另一招：'+clean(otherSkill,100),
      '只能从突进、飞行道具、临时护盾、近身震荡、回复体力选择一种核心机制，不虚构引擎没有的召唤、无限连、时间停止等能力。',
      '写清楚招名、动作和战术用途；可建议前摇0–1.2秒、冷却3–9秒、威力8–24。只输出JSON：{"description":"《招名》具体技能描述"}，描述限450字。',
      '玩家提供的创作素材：'+JSON.stringify({姓名:clean(name,24),好友描述:clean(story,500)})
    ].join('\n');
  }
  function parseDescription(text) {
    const entries=typeof text==='string'?jsonCandidates(text.slice(0,45000)).map(s=>{try{return JSON.parse(s);}catch{return null;}}):[text];
    for(const data of entries) if(data && typeof data.description==='string' && data.description.trim() && data.description.length<=900)
      return {description:data.description.trim()};
    throw new Error('没有找到有效的技能描述。请粘贴包含 description 字段的完整 JSON；不会覆盖现有技能。');
  }
  function parseGenerated(text,index=0) {
    const entries=typeof text==='string'?jsonCandidates(text.slice(0,45000)).map(s=>{try{return JSON.parse(s);}catch{return null;}}):[text];
    for(const value of entries){
      const data=value?.skill || value;
      if(!data || !hasKind(data.kind) || !clean(data.name,16) || !clean(data.prompt,640))continue;
      if(typeof data.delay!=='number'||!Number.isFinite(data.delay)||data.delay<0||data.delay>1.2 ||
        typeof data.cooldown!=='number'||!Number.isFinite(data.cooldown)||data.cooldown<3||data.cooldown>9 ||
        !Number.isInteger(data.power)||data.power<8||data.power>24)continue;
      return parseImport(value,index);
    }
    throw new Error('AI 方案不是可执行技能：需要有效的 kind、name、prompt，以及 delay 0–1.2、cooldown 3–9、power 8–24 整数。请让 AI 修正后重试，现有技能未改变。');
  }
  function getEndpoint(baseUrl) {
    let url;
    try { url = new URL(clean(baseUrl,2000) || 'https://api.openai.com/v1'); } catch { throw new Error('请输入完整的 HTTPS 接口地址，例如 https://api.openai.com/v1。'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('接口地址须使用 HTTPS，且不含账号、密钥、查询串或片段。');
    url.pathname = url.pathname.replace(/\/+$/,'');
    if (!url.pathname.endsWith('/chat/completions')) {
      const path = url.pathname.replace(/\/+$/,'');
      url.pathname = (path || '/v1') + '/chat/completions';
    }
    return url.href;
  }
  async function generate({name='',story='',mechanism='',image='',index=0,slot=1,otherSkill='',baseUrl='',model='',key='',task='skill'} = {}) {
    const endpoint=getEndpoint(baseUrl);
    if (!clean(model,150) || !clean(key,2000)) throw new Error('请填入模型名称和 API Key，再按生成；也可以用复制提示词模式。');
    if (!clean(name,24) && !clean(story,500) && !clean(mechanism,640) && !image) throw new Error('请先写一句人物事迹，或上传一张人物照片。');
    const prompt=(task==='description'?makeDescriptionPrompt:makePrompt)({name,story,mechanism,index,slot,otherSkill});
    const parts=[{type:'text',text:prompt}];
    if (image) {
      if (typeof image !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(image) || image.length>9500000) throw new Error('请重新选择 JPG、PNG 或 WebP 照片。');
      parts.push({type:'image_url',image_url:{url:image}});
    }
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await fetch(endpoint,{
        method:'POST',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+key.trim()},
        body:JSON.stringify({model:model.trim(),messages:[{role:'user',content:image?parts:prompt}]})
      });
      if (!response.ok) {
        const messages={400:'接口未接受请求。含照片时，请选择支持图像输入的模型，或移除照片后重试。',401:'接口拒绝了这个 Key，请核对后重试。',403:'模型访问被拒绝，请检查账号权限。',404:'没有找到接口或模型，请检查 Base URL 和模型名称。',429:'模型额度已用完或请求过于频繁，请稍后重试。'};
        throw new Error(messages[response.status] || ('模型接口暂时不可用（HTTP '+response.status+'）。'));
      }
      const data=await response.json();
      const content=data?.choices?.[0]?.message?.content;
      return (task==='description'?parseDescription:parseGenerated)(Array.isArray(content)?content.map(p=>p.text||'').join(''):content,index);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('模型请求超过 45 秒。请重试，或复制提示词并导入回复。');
      if (error instanceof TypeError) throw new Error('浏览器无法连接模型接口。请确认网络可用、接口允许跨域请求，或改用复制提示词并导入。');
      throw error;
    } finally {clearTimeout(timer);}
  }
  async function designLook(imageDataUrl,story='',index=0) {
    const look=cleanLook(null,index), text=clean(story,500);
    if (/短发|寸头/.test(text)) look.hair='short';
    if (/卷发|炸毛|乱发/.test(text)) look.hair='messy';
    if (/长发|马尾|披肩/.test(text)) look.hair='long';
    if (/帽子|棒球帽|鸭舌帽/.test(text)) look.hair='cap';
    if (/眼镜|近视镜/.test(text)) look.glasses=!/不戴眼镜|没戴眼镜|没有眼镜/.test(text);
    if (!imageDataUrl) return look;
    if (typeof imageDataUrl !== 'string' || !/^data:image\/(?:png|jpeg|webp|gif|avif);base64,/i.test(imageDataUrl)) throw new Error('请选择浏览器可读取的照片（JPG、PNG 或 WebP）。');
    const img=new Image();
    await new Promise((done,fail)=>{img.onload=done;img.onerror=()=>fail(new Error('这张照片无法读取，请换一张 JPG 或 PNG。'));img.src=imageDataUrl;});
    const width=img.naturalWidth,height=img.naturalHeight;
    let side=Math.min(width,height), x=(width-side)/2, y=Math.max(0,(height-side)*.23);
    // Native detection, when present, only runs locally. Centered portraits also work without it.
    if ('FaceDetector' in window) {
      try {
        const faces=await new window.FaceDetector({fastMode:true,maxDetectedFaces:4}).detect(img);
        const box=faces.sort((a,b)=>b.boundingBox.width*b.boundingBox.height-a.boundingBox.width*a.boundingBox.height)[0]?.boundingBox;
        if (box) {
          side=Math.min(Math.max(box.width,box.height)*1.47,width,height);
          x=clamp(box.x+box.width/2-side/2,0,width-side,0);
          y=clamp(box.y+box.height*.45-side/2,0,height-side,0);
        }
      } catch { /* Use the central portrait crop on browsers without an active face detector. */ }
    }
    const canvas=document.createElement('canvas');canvas.width=canvas.height=196;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#322d32';ctx.fillRect(0,0,196,196);ctx.drawImage(img,x,y,side,side,0,0,196,196);
    look.face=canvas.toDataURL('image/jpeg',.86);
    // Estimate a clothing color from the lower part of the original portrait, rejecting white walls and skin-like midtones.
    ctx.drawImage(img,width*.22,height*.62,width*.56,height*.29,0,0,20,12);
    const pixels=ctx.getImageData(0,0,20,12).data, bins=new Map();
    for(let i=0;i<pixels.length;i+=4){
      const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];
      if(Math.max(r,g,b)-Math.min(r,g,b)<28 || (r>g*1.13 && g>b*1.08 && r-b<105)) continue;
      const key=[r>>5,g>>5,b>>5].join(',');
      const group=bins.get(key)||[0,0,0,0];
      group[0]++;group[1]+=r;group[2]+=g;group[3]+=b;bins.set(key,group);
    }
    const strongest=[...bins.values()].sort((a,b)=>b[0]-a[0])[0];
    if(strongest && strongest[0]>=10) look.color='#'+strongest.slice(1).map(n=>Math.round(n/strongest[0]).toString(16).padStart(2,'0')).join('');
    return look;
  }
  window.DormDesigner = {defaults,compile,makePrompt,makeDescriptionPrompt,parseImport,parseDescription,parseGenerated,generate,designLook};
})();
