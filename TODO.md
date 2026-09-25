# TODO

## Current

**Doing:** 改版完成第一個可玩版本：台灣十六張麻將，你對三個電腦，汽水 Pop 風格（橫向）。
- 規則引擎：吃碰槓胡、補花、暗槓加槓、截胡、流局、連莊、台數（30 個測試）
- 電腦：向聽數＋進張選牌、有人快胡會防守、吃碰判斷；12 個角色各有打法和台詞
- 闖關四關（巷口→尾牙→過年→雀神），拿第一解鎖下一關和桌布
- 絕招：換牌、偷看、好運；提示：打哪張會聽、聽哪幾張剩幾張
- 瀏覽器實測：手機橫向 844×390、電腦 1280×800、直拿提示轉橫；機器人在畫面上打完一整場東風圈沒有錯誤

**Doing（2026-09-26）：** 配音接上了。12 個角色＋你（女聲／男聲）都有報牌（34 種牌）、吃碰槓胡、全部台詞，共 691 句。
- 使用者選的：美玲姐 A、林伯 A、二舅 A、阿嬤 B，其他人照同樣思路配（設定在 `scripts/voice-lines.ts`）
- 流程：`npx tsx scripts/voice-lines.ts` → `.venv-voice/bin/python scripts/gen_voices.py` → `.venv-voice/bin/python scripts/voice_sprites.py`
- 每個角色打包成一個音檔（public/voice/，共 3.9 MB，一場只載 4 個約 1.1 MB），WebAudio 切片播放
- 設定可關配音、換你的聲音；試玩版已更新（https://claude.ai/artifact/1Pas8Y1RnFHrN93PdTfEoL）
- 台語：edge-tts 沒有台語聲音，要真人錄或另找台語 TTS

**Next:**
1. 真人試玩：節奏（電腦出牌速度）、難度（`npm run sim` 平均只有 1.6 台，電腦太愛小胡）、台詞頻率
2. 部署：Cloudflare 的 wrangler 登入過期了，要重新 `npx wrangler login`；或開 GitHub repo 接 Cloudflare Pages
   - 目前的試玩版放在 claude.ai：https://claude.ai/artifact/1Pas8Y1RnFHrN93PdTfEoL（`npm run artifact` 產生 dist-artifact/hule.html 再重新發佈）
3. 新手教學：第一局帶一次（點兩下打牌、吃碰按鈕、聽牌提示）
4. 手感：摸牌／打牌的飛行動畫、胡牌演出再華麗一點、電腦「思考中」的小動作
5. 電腦版鍵盤：數字鍵選牌、空白鍵打出、Enter 胡

**Blockers:** 部署需要使用者登入 Cloudflare

## Backlog

- 搶槓胡、七搶一、一炮多響（目前截胡）
- 對手也會用絕招（雀神）
- 統計頁：胡牌率、最大台數、放槍率
- PWA：加到主畫面、離線、字型自己託管
- 英文版
