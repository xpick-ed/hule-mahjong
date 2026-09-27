-- 每日挑戰排行榜。建立：npx wrangler d1 execute hule --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS daily (
  date TEXT NOT NULL,
  uid TEXT NOT NULL,
  name TEXT NOT NULL,
  points INTEGER NOT NULL,
  place INTEGER NOT NULL,
  grid TEXT NOT NULL,
  log TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  PRIMARY KEY (date, uid)
);
CREATE INDEX IF NOT EXISTS daily_rank ON daily (date, points DESC, at);

-- 存檔轉移碼（換手機用）：30 天後失效。worker/save.ts 第一次用到時也會自己建
CREATE TABLE IF NOT EXISTS saves (
  code TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  at INTEGER NOT NULL
);
