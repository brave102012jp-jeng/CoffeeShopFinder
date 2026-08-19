---
name: tasting-record-form
description: Use this skill whenever a user wants a tasting/review record form (coffee, tea, wine, whisky, beer, food, or similar) whose fields need to stay easily adjustable later — e.g. adding a new field like "水粉比" (ratio), "濾杯" (dripper), or removing/renaming an existing field, without touching the form's rendering code. Especially use it when the fields should double as radar-chart axes automatically (pair with the radar-chart skill) so the form and chart never drift out of sync. Trigger on phrases like "品飲紀錄表單", "tasting form", "review form with adjustable fields", or when refactoring a hard-coded review form into a config-driven one.
---

# Tasting Record Form（設定檔驅動的品飲紀錄表單）

一個「欄位清單來自外部設定檔」的品飲紀錄表單產生器。核心目標：**表單有哪些欄位、順序、型態，全部是資料不是程式碼**——新增一個「粉水比」欄位，只要在 JSON 設定檔裡加一筆物件，表單、以及（如果搭配 `radar-chart` skill）雷達圖的軸，會自動一起更新。

這個 skill 是從一個真實專案（咖啡探店 App 的品飲紀錄功能）抽出來的，原始需求原文：「品飲紀錄表單形式也是一個可以單元控制的項目⋯內含有的項目仍還可以做增減微調（咖啡名、杯數、烘焙度，可能之後還會增加粉水比或是濾杯等等）」。

## 什麼時候用這個 skill

- 使用者要做任何品飲/評分類的紀錄表單，且提到欄位以後可能會增減調整
- 使用者已經有一個雷達圖或多維度評分功能，想要「表單欄位」跟「雷達圖軸」自動同步
- 使用者要把一個欄位寫死在程式碼裡的現有表單，重構成可設定化

## 三種欄位型態

| type | 說明 | 必填 | 選填 |
|---|---|---|---|
| `text` | 單行文字輸入 | `key`, `label` | `placeholder` |
| `select` | 下拉選單 | `key`, `label`, `options`（字串陣列） | `default` |
| `radar-axis` | 0～`max` 滑桿評分，**自動搭配一組文字描述輸入框** | `key`, `label`, `max` | `default`, `descKey`, `descPlaceholder` |

`radar-axis` 欄位是這個 skill 的重點：它同時是表單的一個輸入（滑桿＋描述），也是雷達圖的一個軸——用 `deriveRadarAxes()` 從設定檔篩出來，直接餵給 `radar-chart` skill 的 `RadarChart.render()`，兩邊資料同源，不會改了表單忘記改圖、或改了圖忘記改表單。

完整範例設定檔見 `assets/tasting-form-fields.json`，裡面也附了「以後想加欄位」的複製貼上範例（粉水比、濾杯、水溫）。

## 快速開始

1. 複製 `assets/tasting-record-form.js` 到專案（若要即時預覽雷達圖，同時複製 `radar-chart` skill 的 `radar-chart.js`）
2. 複製 `assets/tasting-form-fields.json` 作為預設欄位設定，依需求增刪欄位
3. 呼叫：

```js
const config = await fetch('tasting-form-fields.json').then(r => r.json());
const entry = TastingForm.emptyEntry(config);          // 建立一筆空白紀錄
container.innerHTML = TastingForm.fieldsHTML(config, entry); // 渲染欄位輸入區塊

// 如果要搭配雷達圖即時預覽：
const axes = TastingForm.deriveRadarAxes(config);
function redraw(){
  const vals = TastingForm.readRadarValues(config, container);
  radarMount.innerHTML = RadarChart.render(axes, vals, {size:120});
}
container.addEventListener('input', redraw); // 滑桿拖動時即時重繪
```

完整可執行範例見 `assets/demo.html`（含即時雷達圖預覽）。

## API

| 函式 | 說明 |
|---|---|
| `TastingForm.emptyEntry(config, uidPrefix?)` | 建立一筆新紀錄物件，所有欄位依設定檔預填預設值，並帶一個唯一 `uid` 與空的 `flavorTags: []`（給 `sca-flavor-wheel` skill 用） |
| `TastingForm.fieldsHTML(config, entry)` | 回傳所有欄位輸入框的 HTML 字串（不含外層杯次標題、移除按鈕、風味輪、雷達圖，那些由頁面模板自行包裝） |
| `TastingForm.deriveRadarAxes(config)` | 篩出所有 `radar-axis` 欄位，轉成 `[{key,label,max}]`，可直接餵給 `RadarChart.render()` |
| `TastingForm.readValues(blockEl)` | 從已插入 DOM 的區塊讀回所有 `[data-field]` 輸入的目前值，回傳純值物件 |
| `TastingForm.readRadarValues(config, blockEl)` | 只讀 `radar-axis` 欄位的目前數值（給即時預覽雷達圖用，比整份 `readValues` 更輕量） |

所有產生的輸入框都帶 `data-field="key"` 屬性（`radar-axis` 的滑桿另外帶 `data-out="key"` 對應顯示目前數值的 `<span>`），方便用單一個 event delegation 處理所有欄位的輸入事件，不用每個欄位分別綁定。

## 跟其他 skill 搭配

- **`radar-chart`**：`deriveRadarAxes()` 的輸出直接可餵給 `RadarChart.render()`，見上方範例
- **`sca-flavor-wheel`**：`emptyEntry()` 已經預留 `flavorTags: []`，風味輪的 `onToggle` callback 直接操作這個陣列即可，不用另外處理
- **點心／餐點等「重複性項目」**：不建議塞進同一份 `fields` 設定檔（型態不同，是「可重複新增的項目列表」而不是「單筆紀錄的欄位」），建議在頁面模板層另外用一個簡單的陣列處理（複製一份空物件、push 進陣列、渲染成列表），這個 skill 專注在「單筆品飲紀錄本身的欄位」

## 設計取捨（為什麼不把「杯數」做成一個欄位）

原始需求提到「咖啡名、杯數、烘焙度」，但「杯數」在實際應用裡通常不是單筆紀錄裡的一個欄位，而是「使用者按了幾次『新增一杯咖啡』」——也就是說，杯數＝這次造訪產生的 `entry` 物件數量，不是某個 `entry` 內部的欄位值。所以這個 skill 只處理「一杯咖啡（一筆 entry）內部有哪些欄位」，「這次造訪喝了幾杯」交給頁面模板層維護一個 `entries` 陣列（`push`/`splice` 增減），對應「＋新增一杯」「移除」按鈕。
