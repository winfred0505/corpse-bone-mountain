# 勇闖屍骨山 — 尋藥之旅

> 結合《2026 毒劇中藥材安全性》教材與《軒轅劍參外傳：天之痕》水墨國風美學的 3D 網頁動作遊戲（支援電腦鍵鼠與手機觸控）。

## 線上立即遊玩（GitHub Pages）
👉 **https://winfred0505.github.io/corpse-bone-mountain/**

## 離線單檔版
- 下載 [`dist/勇闖屍骨山.html`](dist/勇闖屍骨山.html)（約 715 KB），免網路、免伺服器，在電腦雙擊或傳至手機瀏覽器開啟即可遊玩。

## 操作方式
- **電腦鍵鼠**：`WASD` 移動｜`J` / 左鍵 三連擊｜`K` / 右鍵 格擋彈反｜`Space` / `Shift` 閃避｜`Q` 文火久煎訣（炮製破甲）｜`E` 解毒湯｜`R` 神農百草印｜`Tab` 毒劇本草圖鑑｜`M` 靜音
- **手機觸控**：左半螢幕滑動出現浮動水墨搖桿｜右下角 3×2 拇指技能按鈕

## 專案結構
- `index.html` / `dist/勇闖屍骨山.html`：獨立單檔成品（GitHub Pages 入口）
- `game/`：Three.js 原始碼、著色器、IK 角色、戰鬥與 Web Audio 引擎
- `scripts/build_single_html.mjs`：一鍵打包成單一 HTML 的腳本
- `docs/`：階段 0 企劃書與開發驗證清單
