(function(root) {
  const characters = [
    {id:'tide', name:'DeepSeek 娘', title:'深海回响', role:'近身突进', note:'乘鲸潮突入近身，用环形声波震开对手。', facing:-1, color:'#7ac7ff'},
    {id:'quill', name:'Claude 娘', title:'终章校订', role:'远程牵制', note:'用飞页牵制直线，趁对手换线时突进追击。', facing:1, color:'#ffab79'},
    {"id":"chatgpt","name":"ChatGPT 娘","title":"白翼译者","role":"近身防反","note":"用白翼护盾承受攻势，以龙尾震荡反击近身对手。","color":"#9ce8d4","facing":1},
    {"id":"gemini","name":"Gemini 娘","title":"双星观测员","role":"星轨追击","note":"交错星光覆盖对手的落点，适合持续施压。","color":"#c4b1ff","facing":1},
    {"id":"grok","name":"Grok 娘","title":"绯夜叛客","role":"贴身强攻","note":"用黑翼缩短距离，以鲜红十字刃终结近身交锋。","color":"#ff869c","facing":1},
    {"id":"kimi","name":"Kimi 娘","title":"月海琴师","role":"远程牵制","note":"以月牙和琴音牵制对手，掌握出手距离。","color":"#d4ceff","facing":1},
    {"id":"doubao","name":"豆包娘","title":"双影玩偶师","role":"远程守护","note":"召唤玩偶分身牵制对手，用六角护盾抵挡攻击；护盾不回复体力。","color":"#dcc0ff","facing":1},
    {"id":"minimax","name":"MiniMax 娘","title":"海螺信使","role":"贴身防守","note":"用贝壳护盾化解进攻，待对手靠近后释放海螺震荡。","color":"#ffca8e","facing":1},
    {"id":"glm","name":"GLM 娘","title":"黑白司书","role":"中距控制","note":"让黑白书页封锁中距离，等待反击机会。","color":"#c3c5df","facing":1},
    {"id":"qwen","name":"千问娘","title":"紫扇行者","role":"扇影游击","note":"折扇挥出弧形攻势，以距离换取下一次出手机会。","color":"#c0b0ff","facing":1}
  ];
  characters.push({id:'laoda',name:'牢大',title:'旋翼肘击',role:'近身反击',note:'用冰红茶投掷牵制对手，近身后以转体肘击反击。',facing:-1,color:'#d8aa35'});
  characters.push({id:'nailong',name:'奶龙',title:'捧腹狂笑',role:'笑波与滚动',note:'连发三道笑波压制对手，打滚靠近后以捧腹大笑震开两侧敌人。',facing:1,color:'#ffd650'});
  const rows = ['idle','walk','attack','skill','hit','guard','jump','down'];
  const animation = {rows, cols:4, cell:256, anchor:[128,220], height:278,
    fps:{idle:5,walk:12,hit:8,guard:5}, phaseDriven:['attack','skill','jump','down']};
  const manifest={characters,animation,stage:['sky.webp','gantry.svg','deck.svg','edge.svg']};
  if(typeof module==='object' && module.exports) module.exports=manifest;
  else root.ArenaManifest=manifest;
})(globalThis);
