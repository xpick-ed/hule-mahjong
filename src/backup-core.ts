// 存檔轉移碼：網頁和伺服器共用的部分（哪些東西要搬、轉移碼長什麼樣子）。

/** 要搬到新手機的東西（localStorage 的 key）：進度、設定、記帳、排行榜的身分、排行榜用的名字 */
export const BACKUP_KEYS = ['hule.progress.v2', 'hule.settings.v2', 'hule.ledger.v1', 'hule.uid', 'hule.name'] as const

/** 轉移碼：8 碼，拿掉容易看錯的 0 O 1 I */
export const SAVE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const SAVE_RE = /^[A-HJ-NP-Z2-9]{8}$/

/** 使用者打的轉移碼：去掉空白、橫線，轉大寫 */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** 顯示用：ABCD-EFGH */
export const showCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`

/** 轉移碼幾天後失效 */
export const SAVE_DAYS = 30

/** 存檔最大多少（字元） */
export const SAVE_MAX = 200_000
