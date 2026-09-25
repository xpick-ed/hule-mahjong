// 對手角色：長相（扁平插畫參數）、打法、台詞。

import type { AiStyle } from './ai'

export type Hair = 'perm' | 'short' | 'spiky' | 'bald' | 'bun' | 'long' | 'bob' | 'slick' | 'ponytail'
export type Extra = 'glasses' | 'sunglasses' | 'cap' | 'earrings' | 'mustache' | 'beard' | 'bow' | 'tie' | 'headphones'

export interface Look {
  skin: string
  hair: Hair
  hairColor: string
  shirt: string
  bg: string
  extras?: Extra[]
  capColor?: string
}

export type LineKey = 'hello' | 'pon' | 'chi' | 'kong' | 'ting' | 'tsumo' | 'ron' | 'dealIn' | 'otherWin' | 'exhausted' | 'matchWin' | 'matchLose'

export interface Character {
  id: string
  name: string
  bio: string
  look: Look
  style: AiStyle
  lines: Partial<Record<LineKey, string[]>>
}

const SKIN = '#f6c9a8'
const SKIN2 = '#e8b48f'

export const CHARACTERS: Record<string, Character> = {
  meiling: {
    id: 'meiling',
    name: '美玲姐',
    bio: '巷口美髮院老闆娘。八卦第一名，能碰就碰。',
    look: { skin: SKIN, hair: 'perm', hairColor: '#3b2a3f', shirt: '#ff6f91', bg: '#ffe3ea', extras: ['earrings'] },
    style: { speed: 0.8, defense: 0.2, greed: 0.2, mistakes: 0.5 },
    lines: {
      hello: ['來來來，今天手氣一定很好！', '打完這圈我還要回去幫客人染頭髮喔'],
      pon: ['碰！這張我等很久了', '碰～謝啦！'],
      chi: ['吃一下吃一下', '這張我要了喔'],
      kong: ['槓！開花開花～'],
      ting: ['欸，我好像快了喔～', '嘿嘿，你們小心點'],
      tsumo: ['自摸！大家掏錢掏錢～', '哎唷，自己摸到了啦'],
      ron: ['胡啦！謝謝你喔～', '就是這張！'],
      dealIn: ['唉唷，打錯了啦', '早知道就不打這張'],
      otherWin: ['好啦好啦，給你胡', '下一把換我'],
      exhausted: ['流局！再來再來'],
      matchWin: ['今天手氣真的不錯耶～'],
      matchLose: ['下次再找你們報仇！'],
    },
  },
  lin: {
    id: 'lin',
    name: '林伯',
    bio: '退休公務員。打牌跟做人一樣穩，很少放槍。',
    look: { skin: SKIN, hair: 'short', hairColor: '#9aa0a6', shirt: '#f0c64a', bg: '#e4f6ef', extras: ['cap', 'mustache'], capColor: '#13a37f' },
    style: { speed: 0.3, defense: 0.8, greed: 0.1, mistakes: 0.3 },
    lines: {
      hello: ['慢慢打，不要急', '年輕人，讓伯伯教你'],
      pon: ['碰。'],
      chi: ['吃。'],
      kong: ['槓。'],
      ting: ['嗯……差不多了'],
      tsumo: ['自摸，不好意思啦'],
      ron: ['胡了，承讓承讓'],
      dealIn: ['老了老了，眼睛不好'],
      otherWin: ['打得不錯'],
      exhausted: ['流局也好，安全'],
      matchWin: ['薑還是老的辣'],
      matchLose: ['後生可畏喔'],
    },
  },
  kai: {
    id: 'kai',
    name: '阿凱',
    bio: '工程師。說自己用機率打牌，其實超好勝。',
    look: { skin: SKIN, hair: 'short', hairColor: '#1d2a4a', shirt: '#3a6df0', bg: '#e6edff', extras: ['glasses'] },
    style: { speed: 0.5, defense: 0.5, greed: 0.3, mistakes: 0.35 },
    lines: {
      hello: ['我算過了，這桌我期望值最高'],
      pon: ['碰，進張數 +8'],
      chi: ['吃，效率最佳解'],
      kong: ['槓，變異數拉高'],
      ting: ['聽了。機率大概 38%'],
      tsumo: ['自摸，符合預期'],
      ron: ['胡了，你那張很危險欸'],
      dealIn: ['……這不科學'],
      otherWin: ['樣本數太小啦'],
      matchWin: ['數據不會說謊'],
      matchLose: ['回去調一下參數'],
    },
  },
  wang: {
    id: 'wang',
    name: '王經理',
    bio: '部門主管。只做大牌，放槍也要有面子。',
    look: { skin: SKIN2, hair: 'slick', hairColor: '#2b2b2b', shirt: '#2f4b7c', bg: '#e8ecf5', extras: ['tie', 'glasses'] },
    style: { speed: 0.3, defense: 0.35, greed: 0.9, mistakes: 0.3 },
    lines: {
      hello: ['今天不談公事，大家輕鬆打'],
      pon: ['碰，這就是決策力'],
      chi: ['吃，靈活調度'],
      kong: ['槓，擴大營收'],
      ting: ['這手不小喔'],
      tsumo: ['自摸！年終有著落了'],
      ron: ['胡了，KPI 達成'],
      dealIn: ['……這張算我請客'],
      otherWin: ['不錯，明年加薪考慮一下'],
      matchWin: ['領導就是要以身作則'],
      matchLose: ['今天先讓你們贏'],
    },
  },
  xiaomei: {
    id: 'xiaomei',
    name: '小美',
    bio: '新進會計。第一次打尾牙麻將，新手運超強。',
    look: { skin: SKIN, hair: 'bob', hairColor: '#7a4a2a', shirt: '#ffb3c7', bg: '#fff0f4', extras: ['bow'] },
    style: { speed: 0.6, defense: 0.2, greed: 0.2, mistakes: 0.6 },
    lines: {
      hello: ['我不太會打，請大家多指教～'],
      pon: ['這個可以碰嗎？碰！'],
      chi: ['我吃～是這樣吃嗎？'],
      kong: ['四張一樣的可以槓對吧？'],
      ting: ['咦，這樣是聽牌嗎？'],
      tsumo: ['我……我好像自摸了？'],
      ron: ['胡了！新手運新手運'],
      dealIn: ['啊，對不起！'],
      otherWin: ['好厲害喔'],
      matchWin: ['謝謝大家讓我～'],
      matchLose: ['下次我會更努力的！'],
    },
  },
  jie: {
    id: 'jie',
    name: '阿傑',
    bio: '業務一哥。節奏超快，能吃就吃。',
    look: { skin: SKIN2, hair: 'spiky', hairColor: '#3a2618', shirt: '#ff8a3d', bg: '#fff1e3' },
    style: { speed: 0.95, defense: 0.3, greed: 0.2, mistakes: 0.3 },
    lines: {
      hello: ['快點快點，打完還要去續攤'],
      pon: ['碰碰碰！'],
      chi: ['吃！節奏要快'],
      kong: ['槓！衝業績'],
      ting: ['聽了聽了，誰要放槍'],
      tsumo: ['自摸！業績達標'],
      ron: ['胡！謝謝老闆'],
      dealIn: ['哎呀，衝太快了'],
      otherWin: ['下一把我一定贏'],
      matchWin: ['今晚續攤我請！'],
      matchLose: ['輸了？不可能！再一場！'],
    },
  },
  ama: {
    id: 'ama',
    name: '阿嬤',
    bio: '打了五十年麻將。防守滴水不漏。',
    look: { skin: SKIN, hair: 'bun', hairColor: '#c9ccd1', shirt: '#8b5cf6', bg: '#f1ebff', extras: ['glasses', 'earrings'] },
    style: { speed: 0.4, defense: 0.95, greed: 0.4, mistakes: 0.05 },
    lines: {
      hello: ['乖孫，阿嬤不會讓你喔', '來，陪阿嬤打一圈'],
      pon: ['碰啦'],
      chi: ['阿嬤吃一下'],
      kong: ['槓，阿嬤手氣好'],
      ting: ['阿嬤要胡囉'],
      tsumo: ['自摸！紅包拿來'],
      ron: ['胡！阿嬤眼睛還很利'],
      dealIn: ['哎唷，阿嬤老花了'],
      otherWin: ['不錯喔，有阿嬤的遺傳'],
      exhausted: ['流局，再來'],
      matchWin: ['紅包阿嬤先收著～'],
      matchLose: ['乖孫長大了喔'],
    },
  },
  erjiu: {
    id: 'erjiu',
    name: '二舅',
    bio: '家族嘴砲王。喝了兩杯之後更衝。',
    look: { skin: '#f0a987', hair: 'bald', hairColor: '#3a2618', shirt: '#ffb020', bg: '#fff5d6', extras: ['beard'] },
    style: { speed: 0.85, defense: 0.15, greed: 0.5, mistakes: 0.4 },
    lines: {
      hello: ['今年二舅要把紅包贏回來！'],
      pon: ['碰！看到沒！'],
      chi: ['吃！'],
      kong: ['槓！運氣來了擋不住'],
      ting: ['二舅聽牌了，誰敢放槍'],
      tsumo: ['自摸！乾杯乾杯'],
      ron: ['胡啦！就知道你會打這張'],
      dealIn: ['欸，這張怎麼會有人要'],
      otherWin: ['好啦，算你厲害'],
      matchWin: ['今年發財啦！'],
      matchLose: ['明年……明年一定'],
    },
  },
  biaomei: {
    id: 'biaomei',
    name: '表妹',
    bio: '大學生。一邊滑手機一邊打，偶爾很準。',
    look: { skin: SKIN, hair: 'long', hairColor: '#2a1c14', shirt: '#33c2a0', bg: '#e0f7f1', extras: ['headphones'] },
    style: { speed: 0.5, defense: 0.3, greed: 0.3, mistakes: 0.5 },
    lines: {
      hello: ['等一下我回個訊息……好了好了'],
      pon: ['喔，碰'],
      chi: ['吃～'],
      kong: ['槓，這要截圖'],
      ting: ['欸我聽了耶'],
      tsumo: ['自摸～要發限動'],
      ron: ['胡了！'],
      dealIn: ['蛤？這張有人要喔'],
      otherWin: ['好喔'],
      matchWin: ['這要打卡'],
      matchLose: ['我本來就只是湊人數的'],
    },
  },
  queshen: {
    id: 'queshen',
    name: '雀神',
    bio: '傳說中的雀神。話很少，幾乎不放槍。',
    look: { skin: SKIN2, hair: 'slick', hairColor: '#e8e8e8', shirt: '#1d2a4a', bg: '#dfe4ee', extras: ['sunglasses'] },
    style: { speed: 0.5, defense: 1, greed: 0.6, mistakes: 0 },
    lines: {
      hello: ['……開始吧。'],
      pon: ['碰。'],
      chi: ['吃。'],
      kong: ['槓。'],
      ting: ['你聽得到嗎？牌的聲音。'],
      tsumo: ['自摸。'],
      ron: ['胡。'],
      dealIn: ['有意思。'],
      otherWin: ['不錯。'],
      matchWin: ['還差得遠。'],
      matchLose: ['……你，就是下一個雀神。'],
    },
  },
  longge: {
    id: 'longge',
    name: '龍哥',
    bio: '老牌麻將館老闆。什麼大風大浪都見過。',
    look: { skin: SKIN2, hair: 'slick', hairColor: '#1a1a1a', shirt: '#b3261e', bg: '#ffe4e0', extras: ['mustache'] },
    style: { speed: 0.7, defense: 0.75, greed: 0.7, mistakes: 0.05 },
    lines: {
      hello: ['在我的館子，規矩最重要'],
      pon: ['碰'],
      chi: ['吃'],
      kong: ['槓'],
      ting: ['小心了'],
      tsumo: ['自摸，收錢'],
      ron: ['胡。你太急了'],
      dealIn: ['哼'],
      otherWin: ['好牌'],
      matchWin: ['常來坐'],
      matchLose: ['江山代有人才出'],
    },
  },
  coco: {
    id: 'coco',
    name: 'Coco',
    bio: '麻將直播主。很會演，也真的很會打。',
    look: { skin: SKIN, hair: 'ponytail', hairColor: '#ff6f91', shirt: '#1d2a4a', bg: '#ffe6f0', extras: ['earrings', 'headphones'] },
    style: { speed: 0.6, defense: 0.7, greed: 0.5, mistakes: 0.05 },
    lines: {
      hello: ['哈囉聊天室！今天挑戰雀神～'],
      pon: ['碰！聊天室刷一波'],
      chi: ['吃～這個判斷給幾分？'],
      kong: ['槓！斗內破千我就再槓'],
      ting: ['聽牌了，大家猜我聽什麼'],
      tsumo: ['自摸！！感謝斗內'],
      ron: ['胡了～這張我等好久'],
      dealIn: ['剪掉剪掉，這段不要播'],
      otherWin: ['好啦，給你一個讚'],
      matchWin: ['記得訂閱開小鈴鐺～'],
      matchLose: ['今天的精華就是你了'],
    },
  },
}

export function line(ch: Character, key: LineKey, r: number): string | null {
  const ls = ch.lines[key]
  if (!ls || !ls.length) return null
  return ls[Math.floor(r * ls.length) % ls.length]
}
