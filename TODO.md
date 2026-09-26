# TODO

## Current

**Doing（2026-09-26）：** 上一輪建議的 12 項全部做完：
- 規則：搶槓胡（1 台）、七搶一（8 台）、過水、截胡／一炮多響、連莊上限（設定 → 牌桌規則，下一場生效）
- 難度：輕鬆／普通／高手（開打前選，金幣 ×0.6／1／1.5）
- 危險牌提示：有人看起來聽了（只看公開資訊），手牌標「危」「安」、對手標「聽?」
- 教練覆盤：每局挑 1–3 張可以打更好的牌（差一步／進張少／危險牌），點了直接開對應的課
- 引導局：第一次玩按第一關就預設勾選；8 個時機說明、不計時、對手放水、標教練建議
- 開打前確認：有沒打完的一場會提醒（不用 confirm()）
- 成就 28 個＋戰績頁；角色好感度 5 級（24 段故事、24 句專屬台詞已配音、12 套新衣服）
- 背景音樂（WebAudio 合成，五種氣氛）＋音效／配音／音樂三個音量
- 每日挑戰：同一副牌、分享戰績（🟩🟨🟥⬜）、排行榜 API（Worker ＋ D1，本機實測過；可選重播驗證）
- 鍵盤快捷鍵；離線：Service Worker（實測斷網能開頁、開打、播配音）、字型自己帶（裁成 1161 字、約 600 KB，scripts/fonts.py）
- 60 個測試全過；瀏覽器實測引導局、覆盤、危險牌、一炮多響結算、角色、戰績、設定、每日挑戰、排行榜送出（本機 D1，重播驗證擋得住作弊）
- 試玩版更新到第 8 版：https://claude.ai/artifact/1Pas8Y1RnFHrN93PdTfEoL（排行榜在試玩版不能用，要正式上線）

**Doing（2026-09-26 下午）：** 你的名字（第一次打開問、設定可改、牌桌和結算都用）；第一關對手改名：大舅媽、鄒家雀神、小姨丈（4 句台詞改寫重新配音）；危險牌提示預設關。

**網站：** https://hule.leh-x.workers.dev （Cloudflare Worker `hule`，帳號 lin.enhsiang@gmail.com）
- 2026-09-26：push 之後的自動 build 沒有觸發或失敗（最後一次自動部署是 7c87d4c），
  所以用 `npx wrangler deploy` 手動部署了 633e208（wrangler 已登入）。原因還沒查到：wrangler 的登入看不到 build 紀錄，要在後台 Deployments 看

**Next:**
1. 查自動部署：後台 hule → Deployments 看 2e59af7、633e208 有沒有 build 紀錄；沒有的話看 Settings → Build 的 Git 連線
   （在修好之前，改完用 `npm run deploy` 手動部署）
2. 排行榜：`npx wrangler d1 create hule` → database_id 貼進 wrangler.toml（拿掉註解）→
   `npx wrangler d1 execute hule --remote --file=schema.sql` → 部署
3. 真人試玩：難度、引導局節奏、音樂好不好聽

**Blockers:** 自動部署的原因要看後台

## Backlog

- 英文版
