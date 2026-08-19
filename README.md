# 咖啡因班表｜嘉義獨立咖啡店探店地圖

一個純前端（無後端、無資料庫）的咖啡店探店與品飲紀錄網站。用 GitHub Pages 就能免費部署成公開網址。

**目前線上資料**：嘉義市 86 間獨立咖啡店（手動整理自 Google Sheet）。

---

## 網站結構

整個網站刻意拆成「資料」「網站骨架」「可重複使用的元件（skill）」三種可以各自獨立調整的部分：

```
coffee-explorer/
├── index.html                      ← 網站骨架，把下面所有部分串起來
├── css/
│   ├── theme.css                    ← 顏色變數、字體（設計 token）
│   ├── layout.css                   ← 頁面版面、甘特圖、卡片、控制列、日誌
│   └── modal.css                    ← 品飲紀錄表單、彈窗、確認對話框
├── js/
│   └── app.js                       ← 網站互動邏輯（甘特圖／篩選／搜尋／有興趣清單／匯出…）
├── data/
│   ├── shops.json                   ← 店家資料【手動維護】
│   └── tag-taxonomy.json            ← 標籤三分類（沖煮／餐點／服務裝潢）【手動維護】
├── scripts/
│   └── sheet-to-json.py             ← Google Sheet CSV → data/shops.json 的轉換工具
└── skills/
    ├── radar-chart/                  ← 雷達圖元件（軸可設定）
    ├── tasting-record-form/          ← 品飲紀錄表單元件（欄位可設定）
    └── sca-flavor-wheel/             ← 風味輪元件（SCA 官方風味輪，中文化）
```

**改動範圍對照表**（想調整某個東西，改哪個檔案）：

| 想做的事 | 改這個檔案 | 需要碰程式碼嗎 |
|---|---|---|
| 更新店家資料（新增/修改店家、營業時間、標籤…） | `data/shops.json`（用 `scripts/sheet-to-json.py` 從 Google Sheet 轉出） | 不用 |
| 調整標籤分類或顏色 | `data/tag-taxonomy.json` | 不用 |
| 品飲紀錄表單要加/減欄位（例如「粉水比」「濾杯」） | `skills/tasting-record-form/assets/tasting-form-fields.json` | 不用 |
| 雷達圖要加/減軸 | 目前雷達圖軸是直接沿用 `tasting-form-fields.json` 裡標記 `"type":"radar-axis"` 的欄位（見下方說明），改表單設定檔即可同步影響雷達圖 | 不用 |
| 換一套風味輪主題（茶／酒／威士忌） | `skills/sca-flavor-wheel/assets/flavor-wheel.js` 裡的 `SCA_FLAVOR_TREE` | 要（換資料，不用改互動邏輯） |
| 版面/樣式微調 | `css/*.css` | 要 |
| 甘特圖／篩選／搜尋邏輯調整 | `js/app.js` | 要 |

---

## 怎麼部署到 GitHub Pages（第一次）

1. 在 GitHub 建一個新的 repository（例如 `coffee-explorer`），把這個資料夾**整個內容**（不是壓縮檔本身）上傳上去，確保 `index.html` 在 repo 根目錄
2. 到 repo 的 **Settings → Pages**
3. Source 選擇 `Deploy from a branch`，Branch 選 `main`（或你的預設分支）、資料夾選 `/ (root)`，儲存
4. 等 1-2 分鐘，會出現一個網址，格式類似：
   `https://你的帳號.github.io/coffee-explorer/`
5. 之後每次 push 更新，網站幾分鐘內就會自動更新（不需要重新部署）

---

## 怎麼更新店家資料（日常維護，最常做的事）

### 方法：手動轉換＋覆蓋（你目前採用的方式，資料不開放給其他人自行調整）

1. 在你的 Google Sheet 整理好資料後，**檔案 → 下載 → 逗號分隔值（.csv，目前工作表）**
2. 在電腦上執行轉換腳本（需要先安裝 Python 3，不需要額外套件）：
   ```bash
   cd coffee-explorer
   python3 scripts/sheet-to-json.py 你下載的檔案.csv -o data/shops.json
   ```
3. 腳本執行完會印出統計數字（幾間店營業時間完全未知、幾間不定休、有沒有解析不出經緯度的），**建議照著提示抽查幾間新加或格式特殊的店家**，打開 `data/shops.json` 確認結果正確
4. 如果有解析錯誤（中文營業時間的自由格式終究無法 100% 涵蓋所有寫法），直接在 `data/shops.json` 裡手動修正那一筆資料即可，不需要重新跑整個轉換
5. 把改好的 `data/shops.json` commit、push 上 GitHub，網站幾分鐘內就會用新資料

> ⚠️ **重要提醒**：如果你之前在 `data/shops.json` 裡手動修正過某些店家的資料（例如營業時間打錯字的更正），下次重新整份跑轉換腳本時，那些手動修正**會被覆蓋掉**（因為是重新從原始 CSV 轉換）。建議兩種做法擇一：
> - 把修正同步回 Google Sheet 原始資料（推薦，一勞永逸）
> - 或者轉換完之後再手動把之前修正過的那幾筆重新改一次

### 資料格式（`data/shops.json` 單筆店家的 schema）

```json
{
  "id": "s1",
  "city": "嘉義市",
  "name": "店名",
  "address": "地址",
  "phone": "電話（查無資料時是空字串）",
  "fb": "Facebook 連結（沒有是空字串）",
  "ig": "Instagram 連結（沒有是空字串）",
  "mapUrl": "Google 地圖連結",
  "lat": 23.4801,
  "lng": 120.4491,
  "tags": ["手沖", "寵物友善"],
  "hoursByWeekday": {
    "0": {"open": "10:00", "close": "18:00"},
    "1": null,
    "...": "0=週日 ... 6=週六，null 代表當天公休"
  },
  "noteOnClosure": "顯示在店卡上的公休說明文字",
  "extraNote": "內用/純外帶等提醒事項，顯示成綠色色塊",
  "irregularClosure": false
}
```

---

## 三個 skill 的簡介（各自的 `SKILL.md` 有完整說明）

- **`radar-chart`** — 純函式的 N 軸雷達圖 SVG 產生器，軸的數量／名稱／滿分全部來自外部設定，角度自動平分。
- **`tasting-record-form`** — 設定檔驅動的品飲紀錄表單，欄位型態支援 `text`／`select`／`radar-axis`，`radar-axis` 型態的欄位會自動同時變成雷達圖的軸。
- **`sca-flavor-wheel`** — 可拖曳旋轉的半圓風味輪，內建 SCA 官方咖啡風味輪資料（9 大分類、19 中分類、81 細項，中文化）。

這三個資料夾本身就是獨立的 Claude Skill 格式（含 `SKILL.md`），如果你之後在其他專案裡想用同一套元件，直接把整個資料夾複製過去即可。

---

## 已知限制

- **這是純前端網站，沒有共用資料庫**：每個訪客的「有興趣」「已去過」「品飲紀錄」都只存在他自己瀏覽器的 localStorage 裡，訪客之間互相看不到彼此的紀錄，也不會互相覆蓋。如果之後想做成「大家共用同一份紀錄」，需要另外接雲端資料庫（例如 Firebase），目前架構沒有做這塊。
- **中文營業時間解析無法保證 100% 正確**：`scripts/sheet-to-json.py` 涵蓋了絕大多數常見寫法，但自由格式的中文文字終究有解析不完美的邊界情況，每次轉換後建議抽查。
- **經緯度**：從 Google 地圖連結裡用正規表達式抓 `@緯度,經度` 格式，少數連結格式特殊（例如用短網址或 Place ID 格式）抓不到，這種情況 `lat`/`lng` 會是 `null`，該店家在「依距離排序」時會被排到最後，但仍會出現在其他清單裡。
