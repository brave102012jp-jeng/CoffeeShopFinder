/*!
 * TastingForm — 設定檔驅動的品飲紀錄欄位產生器（豆名／處理法／焙度／N 軸評分…）。
 * 純函式 + 少量 DOM 讀取輔助，無外部依賴，只依賴呼叫方提供的 esc() 逃逸函式（或用內建的）。
 *
 * 設計重點：
 *   - 欄位清單（text / select / radar-axis）全部來自外部設定檔，新增/刪除/改名欄位
 *     只改設定檔的 fields 陣列，完全不用碰這支程式。
 *   - radar-axis 類型的欄位會「一魚兩吃」：同時變成表單裡的滑桿＋描述輸入框，
 *     也可以直接餵給 radar-chart skill 的 RadarChart.render() 當作軸設定
 *     （用 deriveRadarAxes() 轉換），兩邊永遠對得起來，不用分別維護。
 *   - 產生的 input 都帶 `data-field="key"`／`data-field="descKey"`，方便外部用
 *     event delegation 統一處理輸入事件（跟原專案 app.js 的既有 pattern 一致）。
 *
 * 用法：
 *   fetch('tasting-form-fields.json').then(r=>r.json()).then(config=>{
 *     const entry = TastingForm.emptyEntry(config, 'c1');
 *     containerEl.innerHTML = TastingForm.fieldsHTML(config, entry, 0);
 *     const axes = TastingForm.deriveRadarAxes(config); // 直接餵給 RadarChart.render(axes, entry, {...})
 *   });
 */
(function(global){
"use strict";

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

let uidCounter = 0;

/**
 * 建立一筆空白的品飲紀錄資料物件，所有欄位依設定檔預填預設值。
 * @param {Object} config - 完整設定檔物件（含 `fields` 陣列）
 * @param {string} [uidPrefix] - uid 前綴，預設 "c"
 * @returns {Object} 一筆新的咖啡/品項紀錄，含 uid、flavorTags:[]、以及每個欄位的預設值
 */
function emptyEntry(config, uidPrefix){
  uidCounter++;
  const entry = { uid: (uidPrefix || "c") + uidCounter, flavorTags: [] };
  (config.fields || []).forEach(f => {
    if(f.type === "radar-axis"){
      entry[f.key] = f.default != null ? f.default : Math.round((f.max || 10) / 2);
      if(f.descKey) entry[f.descKey] = "";
    } else if(f.type === "select"){
      entry[f.key] = f.default != null ? f.default : (f.options && f.options[0]) || "";
    } else {
      entry[f.key] = f.default != null ? f.default : "";
    }
  });
  return entry;
}

/**
 * 從設定檔篩出所有 radar-axis 欄位，轉成 radar-chart skill 可直接吃的軸陣列。
 * @param {Object} config
 * @returns {Array<{key:string,label:string,max:number}>}
 */
function deriveRadarAxes(config){
  return (config.fields || [])
    .filter(f => f.type === "radar-axis")
    .map(f => ({ key: f.key, label: (f.label || "").split(" ")[0], max: f.max != null ? f.max : 10 }));
}

function textFieldHTML(f, entry){
  return `<div class="field"><label>${esc(f.label)}</label><input type="text" data-field="${esc(f.key)}" value="${esc(entry[f.key])}" placeholder="${esc(f.placeholder || "")}"/></div>`;
}
function selectFieldHTML(f, entry){
  const opts = (f.options || []).map(o => `<option ${entry[f.key] === o ? "selected" : ""}>${esc(o)}</option>`).join("");
  return `<div class="field"><label>${esc(f.label)}</label><select data-field="${esc(f.key)}">${opts}</select></div>`;
}
function radarAxisFieldHTML(f, entry){
  const val = entry[f.key] != null ? entry[f.key] : 0;
  const max = f.max != null ? f.max : 10;
  const descVal = f.descKey ? (entry[f.descKey] || "") : "";
  let html = `<div class="slider-field"><label>${esc(f.label)}</label><input type="range" min="0" max="${max}" data-field="${esc(f.key)}" value="${esc(val)}"/><span data-out="${esc(f.key)}">${esc(val)}/${max}</span></div>`;
  if(f.descKey){
    html += `<div class="field"><input type="text" data-field="${esc(f.descKey)}" value="${esc(descVal)}" placeholder="${esc(f.descPlaceholder || "")}"/></div>`;
  }
  return html;
}

/**
 * 產生一筆品飲紀錄「欄位輸入區塊」的 HTML（不含外層的杯次標題/移除按鈕/風味輪/雷達圖預覽掛載點，
 * 那些由呼叫方的頁面模板包起來，這支只負責「欄位本身」，方便任意排版組合）。
 * @param {Object} config
 * @param {Object} entry - 這筆紀錄目前的資料（通常是 emptyEntry() 建立、或編輯既有資料時的物件）
 * @returns {string} HTML 片段
 */
function fieldsHTML(config, entry){
  return (config.fields || []).map(f => {
    if(f.type === "text") return textFieldHTML(f, entry);
    if(f.type === "select") return selectFieldHTML(f, entry);
    if(f.type === "radar-axis") return radarAxisFieldHTML(f, entry);
    return "";
  }).join("");
}

/**
 * 從一個已經插入 DOM 的區塊裡，把所有 `[data-field]` 輸入的目前值讀回一個純值物件
 * （key 是欄位的 data-field 值，value 是輸入框目前的字串/數字值——型別轉換交給呼叫方自己視需求做）。
 * @param {HTMLElement} blockEl - 包含這些 data-field 輸入的容器元素
 * @returns {Object}
 */
function readValues(blockEl){
  const out = {};
  blockEl.querySelectorAll("[data-field]").forEach(inp => {
    out[inp.getAttribute("data-field")] = inp.value;
  });
  return out;
}

/**
 * 從一個區塊即時讀出目前所有 radar-axis 欄位的數值（給即時預覽雷達圖用，
 * 不用等使用者送出表單）。
 * @param {Object} config
 * @param {HTMLElement} blockEl
 * @returns {Object} {[axisKey]: number}
 */
function readRadarValues(config, blockEl){
  const out = {};
  (config.fields || []).filter(f => f.type === "radar-axis").forEach(f => {
    const inp = blockEl.querySelector(`[data-field="${f.key}"]`);
    out[f.key] = inp ? Number(inp.value) || 0 : 0;
  });
  return out;
}

global.TastingForm = { emptyEntry, deriveRadarAxes, fieldsHTML, readValues, readRadarValues };

})(typeof window !== "undefined" ? window : this);
