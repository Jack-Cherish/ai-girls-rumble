/* Shared by the workshop, both phone clients and the LAN host. */
(function (root, makeKit) {
  if (typeof module === 'object' && module.exports) module.exports = makeKit(require('./arena-manifest.js'),require('./mechanics.js'));
  else root.DormKit = makeKit(root.ArenaManifest,root.ArenaCharacterModules||{});
})(typeof window === 'undefined' ? globalThis : window, function (manifest, modules) {
  'use strict';

  const moves = {
    dash: {name:'踩点闪现', power:16, cooldown:5, delay:.15, description:'向前突进，攻击同一路线的对手。'},
    projectile: {name:'隔桌空投', power:14, cooldown:4.5, delay:.15, description:'向面前发射飞行道具。'},
    shield: {name:'被窝结界', power:14, cooldown:6, delay:0, description:'张开临时护盾，挡下对手的攻击。'},
    heal: {name:'满血续杯', power:12, cooldown:8, delay:.45, description:'短暂蓄力，回复自己的生命。'},
    burst: {name:'熄灯震场', power:20, cooldown:6, delay:.22, description:'在身边引爆震荡，攻击近身对手。'}
  };
  const templates = [
    {
      first: {name:'鲸跃', kind:'dash', power:16, cooldown:5, delay:.32},
      second: {name:'回声潮汐', kind:'burst', power:18, cooldown:6, delay:.16, prompt:'《回声潮汐》甩动鲸尾，向四周释放近身声波。'},
      alternate: {name:'潮汐信标', kind:'projectile', power:13, cooldown:4.5, delay:.12, prompt:'《潮汐信标》朝前方发射声呐脉冲。'},
      ultimate: {name:'深海回响', kind:'rush', power:32, delay:.24, prompt:'消耗四点奥义，乘鲸浪向前突进，打击同一路线的对手。'}
    },
    {
      first: {name:'飞页批注', kind:'projectile', power:14, cooldown:4, delay:.2},
      second: {name:'折页跃迁', kind:'dash', power:15, cooldown:5, delay:.13, prompt:'《折页跃迁》沿折页向前突进，追击同一路线的对手。'},
      alternate: {name:'页边注', kind:'projectile', power:14, cooldown:4.5, delay:.2, prompt:'《页边注》从书脊送出一道批注，逼迫对手换位。'},
      ultimate: {name:'终章校订', kind:'volley', power:30, delay:.35, prompt:'消耗四点奥义，把整叠校样送向前方，打出远程终结技。'}
    }
  ];
  // Every preset uses one of the five moves implemented by the combat simulator.
  const move = (name, kind, power, cooldown, delay) => ({name, kind, power, cooldown, delay});
  function preset(first, second, ultimateName, kind) {
    return {first, second, alternate:first, ultimate:{name:ultimateName, kind,
      power:kind==='rush'?32:30, delay:kind==='rush'?.24:.35,
      prompt:kind==='rush'?'消耗四点奥义，沿当前路线发起突袭。':'消耗四点奥义，沿当前路线发射连续弹幕。'}};
  }
  const namedTemplates = {
    tide:templates[0], quill:templates[1],
    laoda:preset(move('冰红茶投掷','projectile',14,4.8,.39),move('转体肘击','burst',18,6,.22),'旋翼肘击','rush'),
    chatgpt:preset(move('白翼结界','shield',14,6,.06),move('龙尾回环','burst',18,6,.22),'白龙巡空','rush'),
    gemini:preset(move('双星交映','projectile',14,4.5,.14),move('星轨穿梭','dash',16,5,.18),'双子流星群','volley'),
    grok:preset(move('黑翼斧袭','dash',17,5.4,.20),move('逆十字裂地','burst',21,6,.26),'绯色处刑场','rush'),
    kimi:preset(move('月光琴键','projectile',13,4,.12),move('夜曲休止','heal',12,8.5,.5),'满月协奏曲','volley'),
    doubao:preset(move('团子抛接','projectile',15,4.8,.23),move('暖锅续杯','heal',13,8,.48),'沸腾厨房','volley'),
    minimax:preset(move('螺音回荡','burst',19,5.8,.24),move('贝壳护壁','shield',15,6.2,.05),'海螺号角','volley'),
    glm:preset(move('墨纹封页','shield',15,6.4,.04),move('黑曜书签','projectile',14,4.6,.16),'终卷墨雨','volley'),
    qwen:preset(move('折扇逐风','dash',15,4.8,.14),move('流云扇影','projectile',15,4.7,.21),'千帆回旋','rush')
  };
  function resolveBody(body, seat = 0) {
    return Number.isInteger(body) && body>=0 && body<manifest.characters.length ? body : seat===1?1:0;
  }
  function number(value, min, max, fallback) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }
  function text(value, limit) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
  }
  function validMove(value) {
    return value && typeof value.kind === 'string' && Object.hasOwn(moves, value.kind);
  }
  function skillCard(value, fallback) {
    const source = validMove(value) ? value : fallback;
    const base = moves[source.kind];
    const name = text(source.name, 24) || base.name;
    return {
      name, kind:source.kind,
      power:Math.round(number(source.power, 8, 24, base.power)),
      delay:Math.round(number(source.delay, 0, 1.2, base.delay) * 100) / 100,
      cooldown:Math.round(number(source.cooldown, 3, 9, base.cooldown) * 100) / 100,
      prompt:text(source.prompt, 900) || '《' + name + '》' + base.description
    };
  }
  function forPlayer(player, index = 0) {
    const body = resolveBody(player?.body,index);
    const characterId=manifest.characters[body].id, original=namedTemplates[characterId]||templates[0], overrides=modules[characterId]?.presets||{};const template={...original,first:{...original.first,...overrides.skill},second:{...original.second,...overrides.skill2},ultimate:{...original.ultimate,...overrides.ultimate}};
    // 只比名字、类型和威力：平衡调整只改前摇和冷却，旧存档里的预设招式仍能被识别。
    const same=(a,b)=>!a||['name','kind','power'].every(k=>a[k]===b[k]);
    const source1=player?.skill&&same(player.skill,original.first)?template.first:player?.skill;const source2=player?.skill2&&same(player.skill2,original.second)?template.second:player?.skill2;
    const custom=globalThis.HeroLibrary?.record(body);
    const skill = skillCard(custom ? player?.skill || custom.skill : source1, template.first);
    // A migrated first skill can already occupy the template's second mechanic.
    const second = template.second.kind === skill.kind && !same(skill,template.first) ? template.alternate : template.second;
    const skill2=skillCard(custom ? player?.skill2 || custom.skill2 : source2,second);return {characterId,presetSlots:{skill:same(skill,template.first),skill2:same(skill2,template.second),ultimate:!custom?.ultimate || ['kind','power','delay'].every(k=>custom.ultimate[k]===template.ultimate[k])},skill,skill2,ultimate:{...template.ultimate,...custom?.ultimate}};
  }
  function rosterPlayer(index) {
    const body = resolveBody(index);
    const character = manifest.characters[body];
    const {skill,skill2}=forPlayer({body});
    return {body,name:character.name,story:character.note,skill,skill2,
      mechanism:skill.prompt,mechanism2:skill2.prompt,appearance:'',
      look:{color:character.color,accent:character.color,skin:'#d9a482',hair:'long',glasses:false,face:''}};
  }
  // The room and the other device only receive the appearance and mechanics used in combat.
  function forWire(player, index) {
    if (!player || typeof player.name !== 'string' || !player.name.trim() || !player.look ||
        !validMove(player.skill) || (player.skill2 != null && !validMove(player.skill2))) return null;
    const look = player.look;
    const face = look.face ?? '';
    if (typeof face !== 'string' || face.length > 300000 ||
        (face && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z\d+/]+={0,2}$/.test(face))) return null;
    const validColor = (value, fallback) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
    const {skill, skill2} = forPlayer(player, index);
    const publicSkill = ({name, kind, delay, cooldown, power}) => ({name, kind, delay, cooldown, power});
    return {
      name: player.name.trim().slice(0, 12), body: resolveBody(player.body,index),
      look: {color:validColor(look.color, '#45596f'), accent:validColor(look.accent, '#f28538'),
        skin:validColor(look.skin, '#d8a080'), hair:['short', 'messy', 'long', 'cap'].includes(look.hair) ? look.hair : 'short',
        glasses:look.glasses === true, face},
      skill: publicSkill(skill), skill2: publicSkill(skill2)
    };
  }
  return {forPlayer, forWire, rosterPlayer, resolveBody};
});
