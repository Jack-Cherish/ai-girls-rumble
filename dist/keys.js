// The engine, lobby, training room and controls dialog share this keyboard layout.
(() => {
  'use strict';
  const actions = [
    {id:'left', label:'向左', codes:[['KeyA'],['ArrowLeft']]},
    {id:'right', label:'向右', codes:[['KeyD'],['ArrowRight']]},
    {id:'up', label:'向场地内侧移动', codes:[['KeyW'],['ArrowUp']]},
    {id:'down', label:'向场地外侧移动', codes:[['KeyS'],['ArrowDown']]},
    {id:'attack', label:'普通攻击（连按可连击）', codes:[['KeyJ'],['Numpad1','Digit7']]},
    {id:'skill', label:'一技能', codes:[['KeyK'],['Numpad2','Digit8']]},
    {id:'skill2', label:'二技能', codes:[['KeyL'],['Numpad3','Digit9']]},
    {id:'ultimate', label:'奥义（消耗四点）', codes:[['KeyI'],['Numpad5','Digit0']]},
    {id:'substitute', label:'替身（受击时使用）', codes:[['KeyU'],['Numpad4','Digit6']]},
    {id:'jump', label:'跳跃', codes:[['Space'],['Numpad0','Minus']]},
    {id:'guard', label:'防御（按住，只挡正面）', codes:[['KeyO'],['Numpad6','Equal']]},
    {id:'evade', label:'闪避（快速位移）', codes:[['KeyH'],['NumpadDecimal','BracketRight']]},
    {id:'plea', label:'触发残血谈判（AI 博弈）', codes:[['KeyF'],[]]}
  ];
  const byCode = new Map();
  const storage='neural-clash-keyboard-v1';
  const defaults=actions.map(a=>a.codes.map(c=>c.slice()));
  const allowed=code=>/^(Key[A-Z]|Digit[0-9]|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|Arrow(?:Up|Down|Left|Right)|Space|Enter|ShiftLeft|ShiftRight|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Backquote)$/.test(code);
  function apply(layout){
    const seen=new Set();
    for(const [i,a] of actions.entries()){
      if(!Array.isArray(layout?.[i])||layout[i].length!==2)return false;
      for(const seat of [0,1]){
        const codes=layout[i][seat];
        if(!Array.isArray(codes)||codes.length!==defaults[i][seat].length)return false;
        for(const code of codes){
          if(typeof code!=='string'||!allowed(code)||seen.has(code))return false;
          seen.add(code);
        }
      }
    }
    byCode.clear();
    actions.forEach((a,i)=>{
      a.codes=layout[i].map(c=>c.slice());
      a.codes.forEach((codes,seat)=>codes.forEach(code=>byCode.set(code,[seat,a.id])));
    });
    return true;
  }
  apply(defaults);
  try{
    const saved=JSON.parse(localStorage.getItem(storage));
    if(Array.isArray(saved) && saved.length===actions.length-1){
      const used=new Set(saved.flat(2));
      const letters=Array.from('FGABCDEHIJKLMNOPQRSTUVWXYZ',letter=>'Key'+letter);
      const digits=Array.from('0123456789',digit=>'Digit'+digit);
      const free=letters.concat(digits).find(code=>!used.has(code));
      saved.push([[free],[]]);
    }
    apply(saved);
  }catch{}
  function save(layout){
    if(!apply(layout))throw Error('无效键位');
    let stored=true;try{localStorage.setItem(storage,JSON.stringify(layout));}catch{stored=false;}
    window.dispatchEvent(new Event('arena-keys-changed'));return stored;
  }
  function bind(action,seat,slot,code){
    if(!allowed(code))throw Error('请选择字母、数字、方向键、Shift、空格、回车或标点键');
    const layout=actions.map(a=>a.codes.map(c=>c.slice()));
    const index=actions.indexOf(action),old=layout[index][seat][slot],conflict=byCode.get(code);
    if(conflict){
      const other=layout[actions.findIndex(a=>a.id===conflict[1])][conflict[0]];
      other[other.indexOf(code)]=old;
    }
    layout[index][seat][slot]=code;
    return save(layout);
  }
  function caption(code){
    const named={ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Space:'空格',Minus:'-',Equal:'=',
      BracketRight:']',BracketLeft:'[',NumpadDecimal:'.',ShiftLeft:'左Shift',ShiftRight:'右Shift',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\',Backquote:'反引号'};
    return named[code] || code.replace(/^(Key|Digit|Numpad)/,'');
  }
  function list(action,player,compact=false){
    const codes=action.codes[player];
    if(!codes.length)return '—';
    if(compact)return caption(codes[0]);
    return codes.map(code=>code.startsWith('Numpad')?'小键盘 '+caption(code):code.startsWith('Digit')?'顶部 '+caption(code):caption(code)).join(' / ');
  }
  const actionById=Object.fromEntries(actions.map(a=>[a.id,a]));
  function key(action,seat){return list(actionById[action],seat,true);}
  window.DormKeys={actions,caption,list,key,bind,reset:()=>save(defaults),bindingFor:code=>byCode.get(code)};
})();
