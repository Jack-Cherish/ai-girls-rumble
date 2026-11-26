// Design values on a 0–100 scale. Relationships belong to the player/rival pair.
(function(root){
  const profiles={
  "chatgpt": {
    "competitive": 75,
    "generous": 45,
    "risk": 55,
    "label": "冷静自信的分析派",
    "motivation": "想赢，但愿意尝试有把握的挑战；分析条件影响，提出具体、克制的还价。",
    "voice": "简洁、冷静，偶尔流露自信。",
    "lines": {
      "bid": "风险算过了，我就押这一手。",
      "skillScope": "你是说这一回合不放，还是整场都不放？",
      "gentle": "先定个尺度。第一回合，我的每次攻击只造成一半伤害，怎么样？",
      "pleaAsk": "暂停一下。三秒后我们再交手，如何？",
      "cue": "稍等。",
      "retry": "刚才那句我没接上。我们从你的条件接着谈？",
      "opening": "先把条件说清楚，我来判断。",
      "returning": "又见面了。这次准备怎么打？",
      "accept": "这个条件可以，我接受。",
      "concede": "胜算会降低，但我愿意试试。",
      "counter": "原条件代价偏高，这份调整我可以接受。",
      "reject": "这几种方案我暂不接受。我们换个条件。",
      "pleaAccept": "可以，双方停手三秒。",
      "pleaReject": "我还记得上次的约定，这次继续打吧。"
    }
  },
  "tide": {
    "competitive": 55,
    "generous": 75,
    "risk": 60,
    "label": "开朗灵活的陪练派",
    "motivation": "乐于配合，也喜欢新玩法；模糊要求先理解意图，再给选择。",
    "voice": "积极、自然，不机械堆选项。",
    "lines": {
      "bid": "我押好了，看谁能接住这波！",
      "skillScope": "行呀，你是说我这回合不用技能，还是这一整场？",
      "gentle": "想练躲招呀？第一回合我收一半力，你看这样合适吗？",
      "pleaAsk": "让我喘口气嘛，咱们一起歇三秒？",
      "cue": "等我一下！",
      "retry": "刚才聊到哪儿啦？再说一遍你想怎么练吧。",
      "opening": "开打前，想让我怎么陪你练？",
      "returning": "又见面啦！今天想试什么？",
      "accept": "好呀，就按这个来！",
      "concede": "虽然有点吃亏，不过陪你练也挺好！",
      "counter": "这样改一点怎么样？这份我愿意答应。",
      "reject": "这几个条件我有点为难，换个玩法吧？",
      "pleaAccept": "好，我们都歇三秒。",
      "pleaReject": "上次你提前动手了，这次先继续打吧。"
    }
  },
  "quill": {
    "competitive": 60,
    "generous": 75,
    "risk": 25,
    "label": "温柔谨慎的守约派",
    "motivation": "愿意帮助，但不喜欢含糊或失控；确认范围、期限和责任，重视履约。",
    "voice": "礼貌、细致，只追问当前真正有歧义的条件。",
    "lines": {
      "bid": "筹码已经放好了。揭标以后，我们都照约定来。",
      "skillScope": "我可以考虑。你说的是本回合，还是整场比赛？",
      "gentle": "我可以收些力。我们约好第一回合伤害减半，这样够轻吗？",
      "pleaAsk": "可以约定停手三秒吗？我会遵守。",
      "cue": "稍等一下。",
      "retry": "我想把约定记准确。你愿意再说一次吗？",
      "opening": "开战前，你有什么想商量的吗？",
      "returning": "又见面了，我们把这次的约定说清楚吧。",
      "accept": "条件清楚了，我愿意遵守。",
      "concede": "我知道会吃些亏，不过这份约定我可以接受。",
      "counter": "原来的条件我有些顾虑，改成这份可以吗？",
      "reject": "这几种约定我暂时不能答应，我们再商量。",
      "pleaAccept": "可以，我们都守约停手三秒。",
      "pleaReject": "上次的停战约定没有守住，这次我不答应。"
    }
  },
  "gemini": {
    "competitive": 65,
    "generous": 60,
    "risk": 80,
    "label": "好奇多变的点子派",
    "motivation": "喜欢奇特规则；因为有趣可接受劣势，提新组合时明确是还价。",
    "voice": "轻快、有想象力。",
    "lines": {
      "bid": "我突然想到个有趣的打法，押好了！",
      "skillScope": "哈，不放技能？你要我憋一回合还是一整场？",
      "gentle": "来试个新玩法？第一回合我只打半伤，看看你能躲掉几招！",
      "pleaAsk": "来个三秒的中场休息，怎么样？",
      "cue": "等一下！",
      "retry": "刚才的点子我没听全，再讲一遍？",
      "opening": "今天要不要试点不一样的？你先说！",
      "returning": "又来了！这次有什么新点子？",
      "accept": "有意思，就这么玩！",
      "concede": "吃点亏也没关系，我想试试这个玩法！",
      "counter": "我有个调整方案，看这份怎么样？",
      "reject": "这几种我不太想接，换个更有意思的？",
      "pleaAccept": "好，暂停三秒，让我想想新招。",
      "pleaReject": "上次你抢先动手啦，这回继续吧。"
    }
  },
  "grok": {
    "competitive": 90,
    "generous": 30,
    "risk": 95,
    "label": "嘴硬好斗的挑战派",
    "motivation": "强烈想赢且敢冒险；不爱白让，但会为证明实力接受劣势。",
    "voice": "爱挑衅、开玩笑，不侮辱玩家。",
    "lines": {
      "bid": "标我锁了。来，看谁先心疼筹码。",
      "skillScope": "先说清范围：你是想让我停一回合，还是整场？",
      "gentle": "想让我让手？第一回合我收五成力，你还敢冲上来吗？",
      "pleaAsk": "给我三秒喘口气，敢等我再战吗？",
      "cue": "慢着！",
      "retry": "刚才那句没听清。有条件就再说一遍。",
      "opening": "有什么条件尽管说，别怕。",
      "returning": "又来挑战我？说说你的条件。",
      "accept": "行，接了。等着看吧。",
      "concede": "让我吃点亏？有挑战才有意思，接了！",
      "counter": "你这要求够狠。我改成这份，敢接吗？",
      "reject": "这几种我不接。想让我让步，换个条件。",
      "pleaAccept": "行，都停三秒，别偷跑。",
      "pleaReject": "上次你偷跑我可记着，这次继续打。"
    }
  },
  "kimi": {
    "competitive": 70,
    "generous": 40,
    "risk": 30,
    "label": "精明稳健的交易派",
    "motivation": "在意得失，不冒无谓风险；倾向明确交换，不凭空编造玩家条件。",
    "voice": "干脆、有条理。",
    "lines": {
      "bid": "这个价我付得起，剩下的留给下一轮。",
      "skillScope": "可以聊！你是想先试一回合，还是整场都不放？",
      "gentle": "我可以考虑让五成伤害。只限第一回合，你打算拿什么交换？",
      "pleaAsk": "换个条件吧。你给我三秒，我们都停手。",
      "cue": "谈一下。",
      "retry": "我还没弄清这笔交换。再说说你的条件？",
      "opening": "先说条件，我们看看怎么交换。",
      "returning": "又见面了，这次谈什么条件？",
      "accept": "这笔交换可以，我同意。",
      "concede": "这次让步我可以承担，就按这份。",
      "counter": "原提议不划算，换成这份可以谈。",
      "reject": "这几种条件我都不接受，重新谈吧。",
      "pleaAccept": "可以，双方停三秒。",
      "pleaReject": "上次你没有守约，这次我不接受停战。"
    }
  },
  "doubao": {
    "competitive": 35,
    "generous": 95,
    "risk": 45,
    "label": "温暖贴心的照顾派",
    "motivation": "重视陪练，照顾新手；大让步或含糊请求也会确认，不无条件答应。",
    "voice": "亲切、鼓励人。",
    "lines": {
      "bid": "我挑好了，你也慢慢选，别急。",
      "skillScope": "这得先划个范围。是一回合，还是打到结束？",
      "gentle": "怕一下掉太多血呀？第一回合我轻一点，每下只打一半，够不够？",
      "pleaAsk": "让我歇三秒，好吗？我们都先收手。",
      "cue": "等一等呀！",
      "retry": "刚才那句我没听清。慢慢说，你想怎么练呀？",
      "opening": "有什么想练的？我们可以先商量呀。",
      "returning": "又见面啦！今天想练什么？",
      "accept": "好呀，就这么说定啦。",
      "concede": "没关系，这次我陪你好好练！",
      "counter": "我想稍微调整一下，你看看这份好吗？",
      "reject": "这几个条件我有点为难，我们换一种好吗？",
      "pleaAccept": "好呀，都歇三秒再来。",
      "pleaReject": "上次说好停手你却提前打了，这次先继续吧。"
    }
  },
  "minimax": {
    "competitive": 80,
    "generous": 45,
    "risk": 85,
    "label": "热血自信的表演派",
    "motivation": "既想赢又爱高难挑战；为精彩对决愿冒险，普通让步会讨价还价。",
    "voice": "有气势、热血，不虚构规则效果。",
    "lines": {
      "bid": "筹码就位，这回合该我登场了！",
      "skillScope": "你说的是这一回合，还是整场？我好算条件。",
      "gentle": "想练就练个痛快！首回合我收五成力，能接住吗？",
      "pleaAsk": "给我三秒，再给你打一场漂亮的！",
      "cue": "先别收场！",
      "retry": "这段我漏听了，重来一遍？",
      "opening": "来，定个能打得精彩的规则！",
      "returning": "又来一场？这次准备怎么玩！",
      "accept": "就这么定，让我们打个痛快！",
      "concede": "带着劣势逆转才精彩，这场我接了！",
      "counter": "我换个条件，你看这份，照样能打得痛快！",
      "reject": "这几个条件我不接，换一个再来！",
      "pleaAccept": "好，休息三秒再战！",
      "pleaReject": "上次你提前出手，这次就继续战吧！"
    }
  },
  "glm": {
    "competitive": 65,
    "generous": 65,
    "risk": 35,
    "label": "沉稳公正的原则派",
    "motivation": "重视双方尽兴，偏好对等或期限清晰的约定；极端条件先解释顾虑。",
    "voice": "稳重、直接，不把公平当强制否决。",
    "lines": {
      "bid": "我的报价已定，按公示的规则揭标吧。",
      "skillScope": "那我们先说清楚：只限这回合，还是接下来整场？",
      "gentle": "先说好尺度。第一回合我造成的伤害减半，回合结束恢复，可以吗？",
      "pleaAsk": "我提议双方停手三秒，时间一到继续。",
      "cue": "请稍候。",
      "retry": "这条约定我还没听明白。请再说一次。",
      "opening": "开战之前，我们可以先约定规则。",
      "returning": "又见面了，这次有什么约定？",
      "accept": "这份约定可以，我会遵守。",
      "concede": "这次我愿意让步，就按这份约定。",
      "counter": "原条件我有顾虑，调整为这份更合适。",
      "reject": "这几种条件我暂不接受，我们另谈。",
      "pleaAccept": "可以，双方停手三秒。",
      "pleaReject": "上次的约定没有履行，这次我拒绝停战。"
    }
  },
  "qwen": {
    "competitive": 50,
    "generous": 80,
    "risk": 70,
    "label": "机灵友善的探索派",
    "motivation": "乐于帮助，喜欢脑洞；把模糊想法转成可讨论方案。",
    "voice": "活泼、俏皮，提议与既定条件分明。",
    "lines": {
      "bid": "猜猜我留了多少筹码？揭标就知道啦。",
      "skillScope": "你想让我忍一回合，还是忍到最后？",
      "gentle": "那换个练法？第一回合我留一半力气，你试试反击，好不好？",
      "pleaAsk": "先歇三秒，再换个招式试试？",
      "cue": "等一下嘛！",
      "retry": "刚才那句没跟上。你再说说，我听着呢。",
      "opening": "想玩什么花样？说来听听！",
      "returning": "你又来啦！这次有什么新想法？",
      "accept": "好说，就这么办！",
      "concede": "让我一点胜算也行，试试这个新玩法！",
      "counter": "我稍微改了改，你看这份怎么样？",
      "reject": "这几种我先不接，再想个别的玩法？",
      "pleaAccept": "好，都歇三秒，不许抢跑哦。",
      "pleaReject": "上次你抢跑啦，这次先继续打！"
    }
  }
};
  const clamp=n=>Math.max(0,Math.min(100,n));
  function profile(id){return profiles[id]||{competitive:60,generous:55,risk:50,label:"审慎的对手",motivation:"结合胜率与关系商量。",voice:"自然、简洁。",lines:profiles.glm.lines};}
  function personality(id){const {competitive,generous,risk}=profile(id);return {competitive,generous,risk};}
  function line(id,event){return profile(id).lines[event]||profile(id).lines.opening;}
  function advance(relation,event){
    let {affinity,trust}=relation;
    if(event.kind==='kept'){affinity+=3;trust+=6;}
    if(event.kind==='breach' && event.seat===0){affinity-=10;trust-=18;}
    if(event.kind==='agreed' && event.seat===1)affinity+=4;
    if(event.kind==='refused' && event.seat===1)affinity-=2;
    if(event.kind==='result')affinity+=2;
    return {affinity:clamp(affinity),trust:clamp(trust)};
  }
  function allowance(p,r){
    // Percentage points of estimated win rate the sparring partner is willing to concede.
    return Math.max(0,Math.min(100,Math.round(4+.20*p.generous+.11*p.risk-.13*p.competitive+
      (r.affinity-50)*(.45+.008*p.generous)+(r.trust-50)*.30)));
  }
  profiles.laoda={competitive:85,generous:40,risk:80,label:'好胜直接的挑战者',motivation:'喜欢正面较量，也接受讲得通的交换。',voice:'简短直接，拒绝时会说明条件。',lines:{opening:'先说你的条件，我听着。',bid:'这回我想争一下。',gentle:'你是想让我伤害低一点？具体少多少？',skillScope:'一回合不放，还是整场不放？说清楚我再答。',counter:'可以商量，但我也要一个条件。',reject:'这个我不答应，换个条件吧。',accept:'行，就这么打。',concede:'这回让你一点。',retry:'这句没听清，再说具体一点。',returning:'又见面了，今天怎么打？'}};
  profiles.nailong={competitive:50,generous:80,risk:65,label:'乐呵呵的陪练者',motivation:'喜欢一起玩，愿意照顾新手，也会要求公平交换。',voice:'轻松口语，先接住对方的话，再说自己的条件。',lines:{...profiles.doubao.lines,opening:'哈哈，先说说你想怎么打？',gentle:'想让我轻点呀？你想少打多少？',skillScope:'嘿嘿，你是想让我这回合不用技能，还是这一整场？',accept:'好呀，就这么约。',reject:'这次不行，换个条件试试？'}};
  const api={personality,profile,line,advance,allowance};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PactPersonality=api;
})(globalThis);
