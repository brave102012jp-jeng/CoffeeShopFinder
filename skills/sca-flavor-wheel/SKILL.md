---
name: sca-flavor-wheel
description: Build an interactive rotating flavor/aroma wheel picker widget — a right-anchored, draggable semicircle wheel (like a spinning dial) with three simultaneous rings (category → subcategory → descriptor), a fixed left-side pointer that shows the live-selected term, and click-to-tag interaction. Comes bundled with the full SCA Coffee Taster's Flavor Wheel (2016, SCA/WCR) data pre-translated into Traditional Chinese (81 descriptors across 9 categories). Use this skill whenever the user wants a "flavor wheel", "aroma wheel", "tasting wheel", "風味輪", "香氣輪", or any radial/dial picker for selecting hierarchical tasting-note tags — for coffee, tea, wine, whisky, beer, or similar tasting/journaling apps — especially in single-file HTML/JS projects. Also use it if the user asks to translate the SCA flavor wheel into Chinese, or wants a draggable/rotating dial-style selector UI in general.
---

# SCA 風味輪互動元件（Flavor Wheel Widget）

一個可直接複用的「可拖曳旋轉風味輪」UI 元件：圓心固定在畫布右側，向左展開成半圓；
使用者用手指／滑鼠拖曳（或滑鼠滾輪、方向按鈕）旋轉輪盤，固定在畫面左側的指標會即時顯示
目前對齊到的風味名稱，也可以直接點選輪盤上任一圈文字來加入/移除標籤。

內建資料是 SCA（Specialty Coffee Association）2016 年版 Coffee Taster's Flavor Wheel，
已整理成三層（9 大分類 → 19 中分類 → 81 細項）並translate成繁體中文，中英對照。
資料結構是通用的，只要照同樣格式替換掉 `SCA_FLAVOR_TREE`，就能做成茶、酒、威士忌、啤酒
等任何領域的風味／香氣輪。

## 什麼時候用這個 skill

- 使用者要做咖啡／茶／酒類的品飲紀錄、探店日誌、風味筆記類 app，需要一個風味選擇 UI
- 使用者提到「風味輪」「香氣輪」「flavor wheel」「aroma wheel」「tasting wheel」
- 使用者想要一個「可以拖曳旋轉的圓形／半圓選擇器」，不一定跟咖啡有關（這個互動模式— 圓心
  偏一側、拖曳旋轉、固定指標即時顯示 — 本身就是個實用的「旋轉式選擇器」樣式，可以泛用在其他
  情境，例如選城市、選日期、選等級）
- 使用者要把 SCA 風味輪翻譯成中文，或詢問風味輪的分類結構

## 快速開始（3 步驟整合進新專案）

1. **複製兩個檔案**到專案目錄：`assets/flavor-wheel.css`、`assets/flavor-wheel.js`
   （純 CSS + 純 JS，無外部套件依賴，`<link>`/`<script>` 引入即可；若是單檔 HTML 專案，
   可以直接把兩個檔案內容貼進同一個 `<style>`/`<script>` 區塊）
2. 在頁面上準備一個空容器，例如 `<div id="wheelContainer"></div>`
3. 呼叫 `FlavorWheel.create(container, options)`：

```js
const wheel = FlavorWheel.create(document.getElementById('wheelContainer'), {
  getTags:  () => myCurrentTagsArray,   // 回傳目前已選的中文標籤陣列
  onToggle: (leaf) => {                 // 使用者切換某細項時呼叫，leaf = {zh,en,catZh,catEn,subZh,subEn}
    const i = myCurrentTagsArray.indexOf(leaf.zh);
    if (i === -1) myCurrentTagsArray.push(leaf.zh); else myCurrentTagsArray.splice(i, 1);
    // 更新自己畫面上的標籤列表...
  },
  startCategory: '花香'                  // 選填，初始指標指向哪個大分類
});

// 如果 tags 是在元件外部被改的（例如另一個刪除按鈕），改完呼叫一次讓輪盤重繪：
wheel.refresh();
```

完整可執行範例見 `assets/demo.html`（可直接用瀏覽器打開預覽／測試拖曳手感）。

## 元件 API

`FlavorWheel.create(container, opts) → { refresh(), getPointerLeaf(), setRotation(deg), destroy() }`

| opts 欄位 | 說明 |
|---|---|
| `data` | 選填。自訂風味資料樹，格式見下方「資料結構」；不給則用內建 SCA 咖啡風味輪 |
| `getTags` | 選填函式，回傳目前已選中文字串陣列（不給則視為空陣列，元件仍可運作但無法顯示已選狀態） |
| `onToggle` | 選填函式 `(leaf) => void`，使用者點選細項、按下「加入標籤」鈕、或送出自訂標籤時呼叫 |
| `startCategory` | 選填，字串，對應資料樹裡某個大分類的 `zh`，決定初始指標位置 |
| `allowCustomTags` | 選填，預設 `true`。是否在輪盤下方顯示一個文字輸入框，讓使用者輸入輪盤上沒有的風味（例如「梔子花」「杏桃」）當自訂標籤。送出時一樣會呼叫 `onToggle`，只是 leaf 物件是組出來的假資料（`{zh,en:"",catZh:"自訂",catEn:"Custom",subZh:"自訂",subEn:"Custom",custom:true}`），外部的 `onToggle` 通常只讀 `leaf.zh`，完全不用另外寫分支處理 |

回傳物件：
- `refresh()` — 標籤集合在元件外部被改變後，呼叫這個讓輪盤畫面同步
- `getPointerLeaf()` — 回傳目前指標對齊的細項物件
- `setRotation(deg)` — 手動將輪盤動畫旋轉到指定角度（進階用法，一般用不到）
- `addCustomTag(text)` — 程式化加入一個自訂標籤（跟使用者自己在輸入框送出效果一樣），有需要在別處觸發加入時可以呼叫
- `destroy()` — 清空容器、移除元件

標籤的**移除**（例如點一下已選標籤的 pill 就取消）不是元件內建功能——因為標籤列表本來就是外部
（consumer）在管理、渲染的，直接在你自己的標籤 pill 上綁 `onclick`，把該標籤從你的陣列裡刪掉，
再呼叫一次 `wheel.refresh()` 讓輪盤上對應的細項高亮同步消失即可（`assets/demo.html` 裡已經是
完整範例，標籤 pill 點一下就會移除，含自訂輸入的標籤）。

## 資料結構（如何換成別的主題風味輪）

```js
[
  { en:"Fruity", zh:"水果調", color:"#E0507A", subs:[
    { en:"Berry", zh:"莓果", items:[
      { en:"Blackberry", zh:"黑莓" }, { en:"Raspberry", zh:"覆盆莓" }
    ]},
    // ...更多中分類
  ]},
  // ...更多大分類
]
```

三層固定是「大分類（有 color）→ 中分類 → 細項（葉節點，實際可被點選加標籤的層級）」。
換成茶／酒／威士忌風味輪時，保持這個結構、把內容換掉即可，`FlavorWheel.computeAngles()`
會自動依每個大分類底下的細項數量比例分配角度（細項越多，佔的圓弧角度越大），不需要手動算角度。

若某個中分類底下只有一個「代表詞」而不需再往下分（例如 SCA 輪裡的「Olive Oil」「Pungent」），
就讓 `items` 陣列只放一個跟中分類同名的項目即可，元件會自動把它畫成中分類與細項共用同一格。

## 實作重點 ／ 踩過的坑（照抄可省下重新踩雷的時間）

1. **圓心刻意畫在 SVG viewBox 右側**（`WHEEL_CX` 接近 viewBox 寬度），只讓左半圓落在
   可視範圍內。不需要真的去裁切扇形路徑或只算半圓的角度 — SVG 預設就會裁掉超出 viewBox
   的部分，圓心右移、viewBox 夠窄，自然就只看到左半圓。

2. **指標是「固定的」，轉動的是輪盤本身**。指標邏輯上固定在 270°（正左方）方向，用 CSS
   `transform: rotate(deg)` 去轉動整個 `<g>` 群組（`transform-origin` 設在圓心座標）。
   要知道目前指到哪個細項，直接反推 `effectiveAngle = 270 − rotation` 再去查表即可，
   **不需要每次旋轉都重新產生/重繪 SVG path**（角度表只需算一次並快取，見 `computeAngles`），
   這樣拖曳才會滑順、不卡頓。

3. **⚠️ Pointer Capture 會吃掉點擊事件，這是最容易忽略、實測才會發現的坑**：如果在
   `pointerdown` 當下就立刻呼叫 `setPointerCapture()`，那麼「單純點一下（tap）沒有拖曳」
   時，隨後產生的 `click` 事件的 `target` 會被瀏覽器重新導向成「有 capture 的那個元素」
   （也就是輪盤外層的容器），而不是使用者實際點到的那個扇形 `<path>`，導致「點選細項直接
   加標籤」完全失效，但用滑鼠肉眼看、或用測試工具的 `force click` 去戳都不會發現，只有
   真人用滑鼠/手指單純點一下才會踩到。
   **正確做法**：`pointerdown` 時先不要 capture，等 `pointermove` 累積位移超過一個小門檻
   （例如 4px）才視為「真的在拖曳」，這時候才 `setPointerCapture`；沒超過門檻的單純點擊，
   click 事件會正常打在原本的 `<path>` 上。本 skill 內的 `flavor-wheel.js` 已經是修好的版本。

4. **左側文字說明區塊要跟中間的虛線指標線保持垂直間距**，不然文字最後一行（通常是「加入
   標籤」按鈕）會被指標線「切過去」。用 `padding-top` 把文字區塊往上推、緊縮行距，讓整組
   文字內容都落在指標線（容器垂直置中處）之上，抓 20px 左右的安全間距即可。

5. **滾輪／方向按鈕旋轉要開 CSS transition 做平滑動畫，手指拖曳時要關掉**：拖曳時
   `transition:none` 直接跟手，放開後如果是用滾輪或按鈕微調，才加上
   `transition:transform .4s cubic-bezier(...)` 讓它有平滑的滑順動畫感。兩種旋轉來源共用
   同一個 `setRotation(deg, animate)` 函式，用 `animate` 參數切換要不要加 transition。

6. **「上一個／下一個」方向按鈕要跳到精確的角度**，不要只是加減固定角度值 —
   否則容易停在兩個細項的交界，畫面看起來像選中了 A 但其實有效角度落在 B。做法是直接找
   下一個／上一個細項在角度表裡的中點角度，算出對應的 `rotation` 目標值再動畫過去，並處理
   0°/360° 的最短路徑（避免轉一大圈的視覺跳動，見 `flavor-wheel.js` 裡 `step()` 函式中
   `while(rot-curRot>180)` 的正規化寫法）。

7. 每個細項（葉節點）的中文名稱在整份資料裡建議保持唯一，因為標籤儲存與比對都是直接用中文
   字串（`leaf.zh`）而不是 id，選中狀態的高亮（`.fw-seg.fw-leaf.active`）也是用
   `data-zh` 屬性去比對。內建的 SCA 資料已確保 81 個細項互不重複。

8. **「標籤切換」的邏輯只能寫在一個地方，不要一邊呼叫共用函式、一邊自己手動再切一次
   class** — 這是實際踩過的另一個坑：如果 A 處理常式呼叫了 `toggleTag()`（裡面會去找到
   對應的輪盤 `<path>` 並切換 `.active`），A 自己又手動對同一個 `<path>` 做一次
   `classList.toggle("active")`，兩次切換會互相抵銷，結果看起來像「什麼都沒發生」，但資料
   其實已經正確更新了（只是畫面沒反映），很容易誤判成別的 bug。統一寫法：所有「加入/移除
   標籤」的入口（點輪盤細項、按加入鈕、自訂標籤輸入框送出、標籤 pill 點擊移除）都只呼叫
   同一個 `toggleTag()`／`onToggle()`，DOM 同步只在那一個函式裡做一次。

9. **自訂標籤（輪盤上沒有的風味文字）** 用「組一個假的 leaf 物件丟給 `onToggle`」來實作，
   不要另外開一條資料路徑——這樣外部程式不用區分「這個標籤是從輪盤選的還是手打的」，統一都
   走同一個陣列、同一個 `onToggle(leaf)=>{...}` 邏輯，程式碼最少也最不容易漏同步。假 leaf
   物件只要保留 `zh` 是真正要存的文字即可，其他欄位（`catZh`、`subZh` 等）填什麼都不影響
   功能，純粹是給外部程式如果想顯示分類資訊時不會因為欄位不存在而報錯。

## 客製化

- 配色：CSS variable 覆寫（`--fw-ink`、`--fw-accent`、`--fw-pointer`、`--fw-font-serif` 等，
  見 `flavor-wheel.css` 檔頭註解），不用改 CSS 本體
- 圓的大小／半徑比例：`flavor-wheel.js` 裡的 `WHEEL_CX/CY/R0/R1/R2/R3` 幾個常數
- 拖曳靈敏度：`pointermove` handler 裡 `dy*0.6` 的係數；滾輪靈敏度：`wheel` handler 裡
  `e.deltaY*0.35` 的係數
- 一次要不要顯示三層文字標籤：目前小扇形（角度太小）會自動隱藏文字只留色塊，靠左側指標
  文字補足可讀性；門檻在 `buildWheelSVGInner` 裡的 `>16` / `>13` / `>5.5` 幾個角度判斷
