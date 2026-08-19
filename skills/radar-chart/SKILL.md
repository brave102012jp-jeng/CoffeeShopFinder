---
name: radar-chart
description: Use this skill whenever a user wants a small SVG radar/spider chart (雷達圖) whose axes need to stay easily adjustable later — e.g. tasting notes (coffee, tea, wine, whisky), skill/attribute charts, product comparison charts, or any "N-axis score visualization" in a single-file HTML/JS project. Especially use it when the user says the axis list or count might change in the future (add/remove/rename an axis) and wants that to be a config change, not a code change. Also use it when pairing with a form whose fields should double as the chart's axes (e.g. a tasting-record-form skill) so the two stay in sync automatically.
---

# Radar Chart（設定檔驅動的雷達圖）

一個純函式、無外部依賴的 N 軸雷達圖 SVG 產生器。核心設計目標：**軸的數量／名稱／順序永遠來自外部設定，角度一律自動平分**，日後想加減軸、改名，只改設定檔，完全不用碰產生器本身的程式碼。

這個 skill 是從一個真實專案（咖啡探店 App）抽出來的——原本雷達圖軸是寫死在函式裡的（香氣/Body/苦味/酸質/甜感/餘韻六軸），使用者提出「以後可能會加粉水比、濾杯之類的欄位，雷達圖軸可能也要跟著調整」的需求後，重構成現在這個「軸只是資料，不是程式碼」的形式。

## 什麼時候用這個 skill

- 使用者要做任何品飲/評分/屬性類的雷達圖，且明確或暗示「軸可能之後會調整」
- 使用者已經有一個表單在收集多維度分數，想要「表單填的軸＝雷達圖畫的軸」自動同步，不要兩邊分別維護
- 使用者要重構一個「雷達圖軸寫死在程式碼裡」的現有專案，變成可設定化

## 快速開始

1. 複製 `assets/radar-chart.js` 到專案，`<script>` 引入（或貼進單檔 HTML 的 `<script>` 區塊）
2. 複製 `assets/radar-axes.config.json` 作為預設軸設定，依專案需求增刪修改
3. 呼叫：

```js
const axes = [
  {key:'aroma', label:'香氣', max:10},
  {key:'body',  label:'Body', max:10},
  {key:'bitterness', label:'苦味', max:10},
  {key:'acidity', label:'酸質', max:10},
  {key:'sweetness', label:'甜感', max:10},
  {key:'aftertaste', label:'餘韻', max:10}
];
const values = {aroma:7, body:6, bitterness:4, acidity:8, sweetness:5, aftertaste:6};
const svgString = RadarChart.render(axes, values, {size:140});
container.innerHTML = svgString;
```

軸數改成 4 軸、8 軸、任何數字都直接可用，角度會自動用 `360° / 軸數` 平分，不需要另外算角度、不需要改 `render()` 的邏輯。完整可執行範例見 `assets/demo.html`。

## API

`RadarChart.render(axes, values, opts) → string`（回傳完整 `<svg>...</svg>` 字串）

| 參數 | 說明 |
|---|---|
| `axes` | 陣列，每個元素 `{key, label, max?}`。順序＝畫圖順序（從正上方順時針）。`max` 選填，該軸沒填就用 `opts.defaultMax`（預設 10），**每個軸可以各自不同滿分** |
| `values` | 物件，`{[axis.key]: number}`，對應各軸的實際數值 |
| `opts.size` | SVG 寬高（正方形），預設 140 |
| `opts.defaultMax` | 軸沒指定 `max` 時的預設滿分，預設 10 |
| `opts.fillColor` / `opts.strokeColor` / `opts.gridColor` / `opts.labelColor` / `opts.dotColor` | 顏色客製化，不給則用預設的暖色系配色 |

少於 3 軸時（雷達圖畫不出有意義的多邊形）會回傳一個空的 `<svg>`，不會報錯。

## 跟 tasting-record-form skill 搭配使用

如果同時使用 `tasting-record-form` skill，把兩份設定檔的 `key` 對齊，表單裡標記 `"type":"radar-axis"` 的欄位會自動同時：
1. 出現在表單裡（滑桿＋描述欄）
2. 變成雷達圖的一個軸（`axes` 陣列直接從表單設定裡的 `radar-axis` 欄位篩出來即可，見 `tasting-record-form` skill 的 `deriveRadarAxes()` 函式）

這樣「表單有哪幾軸」跟「雷達圖畫哪幾軸」永遠是同一份真相來源（設定檔），不會兩邊改到後來對不起來。

## 實作重點

- 幾何常數是以 `size=140` 為基準設計的（`cx=70,cy=70,R=42`），其他 size 透過 `sc = size/140` 縮放，包含線寬、字級、點的半徑都會跟著等比縮放，維持視覺一致
- 背景格線畫 25%／50%／75%／100% 四圈，最外圈實線、內圈虛線，是常見雷達圖的視覺慣例
- 標籤文字畫在格線外側（`R + 13*sc`），標籤內容同時顯示軸名稱與實際數值（例如「酸質 8」），不用另外查表對照
- 資料多邊形用單一 `<polygon>`（不是逐段 path），效能與可讀性最好，軸數變動時這段邏輯完全不用改
