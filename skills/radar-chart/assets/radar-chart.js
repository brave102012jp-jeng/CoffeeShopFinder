/*!
 * RadarChart — 產生設定檔驅動的 N 軸雷達圖 SVG，純函式，無外部依賴。
 *
 * 設計重點：
 *   - 軸的數量、名稱、最大值全部來自外部傳入的「軸設定陣列」，角度一律自動平分
 *     （360° / 軸數），新增/刪除/改名軸只要改設定檔，完全不用碰這支程式。
 *   - 純函式回傳 SVG 字串，不吃 DOM、不吃全域狀態，方便在任何專案裡直接拿來用
 *     （品飲紀錄卡片預覽、匯出 HTML、PDF 都可以重複呼叫同一支函式）。
 *
 * 用法：
 *   const axes = [
 *     {key:'aroma', label:'香氣', max:10},
 *     {key:'body',  label:'Body', max:10},
 *     {key:'bitterness', label:'苦味', max:10},
 *     {key:'acidity', label:'酸質', max:10},
 *     {key:'sweetness', label:'甜感', max:10},
 *     {key:'aftertaste', label:'餘韻', max:10}
 *   ];
 *   const values = {aroma:7, body:6, bitterness:4, acidity:8, sweetness:5, aftertaste:6};
 *   const svgString = RadarChart.render(axes, values, {size:140});
 *   container.innerHTML = svgString;
 *
 * 也可以只給 3 軸、8 軸，或任何軸數，角度會自動用 `360/軸數` 平分，不需要另外算。
 */
(function(global){
"use strict";

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

/**
 * 產生雷達圖 SVG 字串。
 * @param {Array<{key:string,label:string,max?:number}>} axes - 軸設定，順序即畫圖順序，角度自動平分。
 *   每個軸的 `max` 選填，預設 10（沒填就用 defaultMax），可以每軸各自不同上限。
 * @param {Object} values - 資料物件，key 對應 axes 裡的 key，value 是數值（0 ~ 該軸 max）。
 * @param {Object} [opts]
 * @param {number} [opts.size=140]        - SVG 寬度（正方形，高度會依比例微調，含底部文字空間）
 * @param {number} [opts.defaultMax=10]   - 軸沒指定 max 時的預設滿分
 * @param {string} [opts.fillColor]       - 資料多邊形填色（含透明度自行帶 rgba）
 * @param {string} [opts.strokeColor]     - 資料多邊形邊線顏色
 * @param {string} [opts.gridColor]       - 背景格線顏色
 * @param {string} [opts.labelColor]      - 軸標籤文字顏色
 * @returns {string} 完整 <svg>...</svg> 字串
 */
function render(axes, values, opts){
  opts = opts || {};
  values = values || {};
  const size = opts.size || 140;
  const defaultMax = opts.defaultMax != null ? opts.defaultMax : 10;
  const fillColor = opts.fillColor || "rgba(47,111,98,.22)";
  const strokeColor = opts.strokeColor || "#2F6F62";
  const gridColor = opts.gridColor || "#B9A886";
  const labelColor = opts.labelColor || "#5A4636";
  const dotColor = opts.dotColor || strokeColor;

  const sc = size / 140; // 縮放係數，內部幾何常數是以 140 為基準設計的
  const cx = 70 * sc, cy = 70 * sc, R = 42 * sc;
  const n = axes.length;
  if(n < 3){
    // 少於 3 軸畫不成有意義的多邊形，直接回傳空 svg 避免報錯
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  }
  const ang = axes.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i / n));
  function pt(a, r){ return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }

  // 背景格線（25% / 50% / 75% / 100%）
  let grid = "";
  [.25, .5, .75, 1].forEach(f => {
    const pts = ang.map(a => pt(a, R * f).join(",")).join(" ");
    grid += `<polygon points="${pts}" fill="none" stroke="${gridColor}" stroke-width="${f === 1 ? .8 : .3}" stroke-dasharray="${f === 1 ? '' : '2,2'}"/>`;
  });
  // 軸線
  let axesLines = "";
  ang.forEach(a => {
    const [x, y] = pt(a, R);
    axesLines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${gridColor}" stroke-width=".3"/>`;
  });

  // 資料多邊形
  const dims = axes.map((ax, i) => {
    const max = ax.max != null ? ax.max : defaultMax;
    const raw = Number(values[ax.key]) || 0;
    const ratio = max > 0 ? Math.min(1, Math.max(0, raw / max)) : 0;
    return { label: ax.label, raw, ratio };
  });
  const dataPts = dims.map((d, i) => pt(ang[i], R * d.ratio).join(",")).join(" ");
  const dataPolygon = `<polygon points="${dataPts}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${1.3 * sc}"/>`;

  // 資料點 + 軸標籤（標籤畫在格線外側）
  let dots = "", labels = "";
  const fs = Math.max(7, 9 * sc);
  dims.forEach((d, i) => {
    const [dx, dy] = pt(ang[i], R * d.ratio);
    dots += `<circle cx="${dx}" cy="${dy}" r="${2.5 * sc}" fill="${dotColor}"/>`;
    const [lx, ly] = pt(ang[i], R + 13 * sc);
    labels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="${labelColor}">${esc(d.label)} ${d.raw}</text>`;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${grid}${axesLines}${dataPolygon}${dots}${labels}</svg>`;
}

global.RadarChart = { render };

})(typeof window !== "undefined" ? window : this);
