// 「有什麼新東西」：更新之後第一次打開跳出來，一項一項介紹新功能。加新東西時把 NEWS_VERSION 加一、清單換掉。

export const NEWS_VERSION = 1

export type NewsAction = 'blitz' | 'tourney' | 'look' | 'calc' | 'save' | 'online'

export interface NewsItem {
  title: string
  text: string
  /** 按下去直接去那裡 */
  action?: { label: string; go: NewsAction }
  /** 卡片的顏色 */
  tone: 'red' | 'blue' | 'green' | 'purple' | 'orange' | 'ink'
}

export const NEWS: readonly NewsItem[] = [
  { title: '全國錦標賽', text: '長春路 → 竹東鎮 → 全國，每站兩個特別道具，拿第一才晉級。', action: { label: '去挑戰', go: 'tourney' }, tone: 'green' },
  { title: '閃電局', text: '只打 4 局、每一步 5 秒，大概 5 分鐘一場。', action: { label: '打一場', go: 'blitz' }, tone: 'purple' },
  { title: '我的造型', text: '換髮型、衣服、配件：安全帽、斗笠、皇冠…連線時朋友也看得到。', action: { label: '換造型', go: 'look' }, tone: 'red' },
  { title: '算台記帳', text: '家裡真的打麻將時用：點牌算台數，還能記整場帳、算誰給誰多少。', action: { label: '打開看看', go: 'calc' }, tone: 'orange' },
  { title: '宿敵', text: '放槍給同一個人兩次，他就變成宿敵；讓他付錢給你就算報仇，有金幣。', tone: 'red' },
  { title: '上帝視角回放', text: '每一局結算時按「回放」，四家的牌攤開重播，看誰在聽什麼。', tone: 'blue' },
  { title: '開局擲骰子', text: '莊家先擲骰子決定從哪裡開門，你當莊要自己擲；設定可以關掉。', tone: 'ink' },
  { title: '觀戰', text: '朋友那桌已經開打？點邀請連結也能進去看，下一場有位子就一起打。', action: { label: '跟朋友打', go: 'online' }, tone: 'blue' },
  { title: '存檔轉移碼', text: '換手機不怕進度不見：設定 → 存檔，拿轉移碼到新手機輸入。', action: { label: '去備份', go: 'save' }, tone: 'green' },
]
