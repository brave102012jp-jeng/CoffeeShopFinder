
(function(){
"use strict";
const HS=6,HE=24,HC=HE-HS,DL=["日","一","二","三","四","五","六"],YOBI=["日","月","火","水","木","金","土"],BAR_H=6,BAR_GAP=4,DAY_PAD=8;

/* ===== EXTERNAL CONFIG (loaded once at startup — see data/ and skills/*/assets/*.json) =====
   店家資料、標籤分類、雷達圖軸設定、品飲表單欄位，全部是外部 JSON，不寫死在這支程式裡。
   想調整任何一項，改對應的 JSON 檔案即可，不用碰 app.js。 */
let TAG_CATEGORIES={};
let TAG_CATEGORY_LOOKUP={};
let RADAR_AXES=[];
let TASTING_CONFIG={fields:[]};

function buildTagLookup(){
  TAG_CATEGORY_LOOKUP={};
  Object.entries(TAG_CATEGORIES).forEach(([key,cat])=>{(cat.tags||[]).forEach(t=>{TAG_CATEGORY_LOOKUP[t]=key;});});
}
function tagCategoryOf(tag){return TAG_CATEGORY_LOOKUP[tag]||"service";}
function tagPillHTML(tag){return `<span class="tag-pill tag-cat-${tagCategoryOf(tag)}">#${esc(tag)}</span>`;}

async function loadExternalConfig(){
  const [shopsData, tagTaxonomy, tastingFields] = await Promise.all([
    fetch("data/shops.json").then(r=>r.json()).catch(()=>[]),
    fetch("data/tag-taxonomy.json").then(r=>r.json()).catch(()=>({})),
    fetch("skills/tasting-record-form/assets/tasting-form-fields.json").then(r=>r.json()).catch(()=>({fields:[]}))
  ]);
  DEFAULT_SHOPS=shopsData;
  TAG_CATEGORIES=tagTaxonomy;
  buildTagLookup();
  TASTING_CONFIG=tastingFields;
  RADAR_AXES=TastingForm.deriveRadarAxes(TASTING_CONFIG);
}
let DEFAULT_SHOPS=[];
let SHOPS=[],statuses={},reviews={},activeTags=new Set(),weekStart=startOfWeek(new Date()),selectedDayIdx=null,viewMode="filtered",randomPicks=[],openReviewsExpanded=new Set(),expandedCards=new Set(),ridCounter=Date.now();
let shopSearchQuery="",journalSearchQuery="";
function nameMatchesQuery(name,q){
  if(!q) return true;
  return String(name||"").trim().toLowerCase().includes(q.trim().toLowerCase());
}
const CARD_LIMIT=5;
const CHIAYI_CENTER={lat:23.4801,lng:120.4491};
let userLoc={lat:CHIAYI_CENTER.lat,lng:CHIAYI_CENTER.lng,isReal:false};
function haversineKm(lat1,lng1,lat2,lng2){
  if(lat1==null||lng1==null||lat2==null||lng2==null) return Infinity;
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function shopDistanceKm(shop){return haversineKm(userLoc.lat,userLoc.lng,shop.lat,shop.lng);}
function requestGeolocation(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos=>{userLoc={lat:pos.coords.latitude,lng:pos.coords.longitude,isReal:true};renderCards();},
    ()=>{/* denied or unavailable: keep Chiayi center fallback */},
    {timeout:8000, maximumAge:600000}
  );
}
function startOfWeek(d){const n=new Date(d);n.setDate(n.getDate()-n.getDay());n.setHours(0,0,0,0);return n;}
function isoDate(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function pad(n){return String(n).padStart(2,"0");}
function hhmmToMin(s){const[h,m]=s.split(":").map(Number);return h*60+m;}
function fmtHour(h){return pad(h)+":00";}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function phoneLine(phone){
  if(!phone) return `<div class="row">☎️ <span style="color:var(--ink-soft);">無電話資訊</span></div>`;
  const isDialable=/^[0-9\-+() ]+$/.test(phone);
  return isDialable?`<div class="row">☎️ <a href="tel:${esc(phone.replace(/[^0-9+]/g,''))}">${esc(phone)}</a></div>`:`<div class="row">☎️ ${esc(phone)}</div>`;
}
/*
 * 地圖定位圖示（已去過／未去過）樣式參考：
 * "Pin location" icons created by I M Set - Flaticon
 * https://www.flaticon.com/free-icons/pin-location
 * "Location" icons created by Shahid-Mehmood - Flaticon
 * https://www.flaticon.com/free-icons/location
 * （以下為依此樣式重新繪製的 SVG，非直接引用原始檔案）
 */
function pinIcon(visited){
  if(visited){
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7 12 7.39 12.36.35.34.87.34 1.22 0C13 22 20 15.25 20 10c0-4.42-3.58-8-8-8z"/><path d="M12 6.3l1.35 2.74 3.02.44-2.19 2.13.52 3.01-2.7-1.42-2.7 1.42.52-3.01-2.19-2.13 3.02-.44z" fill="#fff"/></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7 12 7.39 12.36.35.34.87.34 1.22 0C13 22 20 15.25 20 10c0-4.42-3.58-8-8-8z"/><circle cx="12" cy="10" r="3"/></svg>`;
}
/*
 * FB / IG 圖示樣式參考：
 * 原始素材「Facebook and instagram logo」（Vecteezy #15566559，作者 Nur Maulidiah）
 * https://www.vecteezy.com/vector-art/15566559-facebook-and-instagram-logo
 * 授權：Vecteezy Free License，原始素材僅限編輯用途、需標註
 * 下方為依此素材視覺風格「重新繪製」的線條版 SVG（深藍 FB 方框 + 粉紅 IG 相機），
 * 非直接引用原始檔案，依原始素材附帶的授權說明文件，重繪版本不受版權限制，
 * 可自由用於任何用途（含商業），故此處不需另外加上公開頁面授權標示。
 */
const ICON_FB='<svg width="16" height="16" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke="#1B2A4A" stroke-width="2.4"/><path d="M23.5 13.5H21c-1.1 0-1.5.5-1.5 1.6v3.4h4l-.5 4h-3.5V29h-4v-6.5h-3v-4h3v-4c0-3.2 1.8-5 5-5h3v4.5z" fill="#1B2A4A"/></svg>';
const ICON_IG='<svg width="16" height="16" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="32" height="32" rx="10" fill="none" stroke="#B4467E" stroke-width="2.6"/><circle cx="20" cy="20" r="7.5" fill="none" stroke="#B4467E" stroke-width="2.6"/><circle cx="28.5" cy="11.5" r="2" fill="#B4467E"/></svg>';
function socialButtonsHTML(shop){
  let out='';
  if(shop.fb) out+=`<a class="icon-btn" href="${esc(shop.fb)}" target="_blank" rel="noopener" title="Facebook">${ICON_FB}</a>`;
  if(shop.ig) out+=`<a class="icon-btn" href="${esc(shop.ig)}" target="_blank" rel="noopener" title="Instagram">${ICON_IG}</a>`;
  return out;
}
function addressLine(shop){
  const visited=getStatus(shop.id).visited;
  const icon=shop.mapUrl
    ? `<a class="pin-inline" href="${esc(shop.mapUrl)}" target="_blank" rel="noopener" title="${visited?'Google 地圖（已去過）':'Google 地圖'}">${pinIcon(visited)}</a>`
    : `<span class="pin-inline" aria-hidden="true">📍</span>`;
  return `${icon}${esc(shop.address)}`;
}
function shopColorIdx(shop){return SHOPS.indexOf(shop)%8;}

// Storage abstraction: uses window.storage when available (Claude.ai artifact context),
// otherwise falls back to browser localStorage (for standalone / self-hosted use).
const STORAGE_KEY="coffee-explorer-user-data";
const hasClaudeStorage = typeof window!=="undefined" && !!window.storage;
async function storageGet(){
  if(hasClaudeStorage){ return await window.storage.get("user-data", false); }
  try{ const raw=localStorage.getItem(STORAGE_KEY); return raw?{value:raw}:null; }catch(e){ return null; }
}
async function storageSet(value){
  if(hasClaudeStorage){ return await window.storage.set("user-data", value, false); }
  try{ localStorage.setItem(STORAGE_KEY, value); }catch(e){}
}
async function loadState(){await loadExternalConfig();try{const r=await storageGet();if(r&&r.value){const p=JSON.parse(r.value);statuses=p.statuses||{};reviews=p.reviews||{};SHOPS=p.shopOverrides&&p.shopOverrides.length?p.shopOverrides:DEFAULT_SHOPS;ridCounter=p.ridCounter||Date.now();}else SHOPS=DEFAULT_SHOPS;}catch(e){SHOPS=DEFAULT_SHOPS;}
  // self-heal: fix stale "visited" flags left over from earlier data/schema versions
  // where a shop was marked visited but has no actual saved review record
  let healed=false;
  Object.keys(statuses).forEach(id=>{
    if(statuses[id]&&statuses[id].visited&&(!reviews[id]||!reviews[id].length)){
      statuses[id]=Object.assign({},statuses[id],{visited:false});
      healed=true;
    }
  });
  if(healed) saveState();
}
async function saveState(){try{await storageSet(JSON.stringify({statuses,reviews,ridCounter,shopOverrides:SHOPS===DEFAULT_SHOPS?null:SHOPS}));}catch(e){}}
function getStatus(id){return statuses[id]||{interested:false,visited:false};}
function setStatus(id,patch){statuses[id]=Object.assign({},getStatus(id),patch);saveState();}
function tickClock(){const n=new Date();document.getElementById("nowClock").innerHTML=pad(n.getHours())+":"+pad(n.getMinutes())+'<span>'+YOBI[n.getDay()]+"曜日 ‧ "+(n.getMonth()+1)+"/"+n.getDate()+'</span>';}
function allTags(){const s=new Set();SHOPS.forEach(sh=>sh.tags.forEach(t=>s.add(t)));return Array.from(s).sort();}
function shopOpenAt(shop,dow,hour){const h=shop.hoursByWeekday[dow]??shop.hoursByWeekday[String(dow)];if(!h)return false;return hhmmToMin(h.open)<(hour+1)*60&&hhmmToMin(h.close)>hour*60;}
function filteredShops(){if(activeTags.size===0)return SHOPS;return SHOPS.filter(sh=>sh.tags.some(t=>activeTags.has(t)));}
let tagsPanelExpanded=false;
let expandedTagGroups=new Set();
function renderTagChips(){
  const present=allTags();
  const groups=[
    {key:'brew',label:'☕ 沖煮'},
    {key:'food',label:'🍰 餐點'},
    {key:'service',label:'🏠 服務／裝潢'}
  ];
  let groupsHTML='';
  groups.forEach(g=>{
    const tagsInGroup=present.filter(t=>tagCategoryOf(t)===g.key).sort((a,b)=>a.localeCompare(b,'zh-Hant'));
    if(!tagsInGroup.length) return;
    const selectedCount=tagsInGroup.filter(t=>activeTags.has(t)).length;
    const isOpen=expandedTagGroups.has(g.key);
    groupsHTML+=`<div class="tag-category-group">
      <button class="tag-category-header tag-cat-${g.key}" data-tag-group-toggle="${g.key}">
        <span>${g.label} <span class="tag-cat-count">（${tagsInGroup.length}${selectedCount?`，已選 ${selectedCount}`:''}）</span></span>
        <span>${isOpen?'▴':'▾'}</span>
      </button>
      ${isOpen?`<div class="tag-category-body">${tagsInGroup.map(t=>`<button class="tag-chip tag-cat-${g.key} ${activeTags.has(t)?'active':''}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>`:''}
    </div>`;
  });
  document.getElementById("controlsPanel").innerHTML=`
    <div class="controls-top-row">
      <button class="tag-filter-toggle" id="tagFilterToggle">🏷️ 標籤篩選${activeTags.size?` <span class="active-count">(已選 ${activeTags.size})</span>`:''} <span>${tagsPanelExpanded?'▴':'▾'}</span></button>
      <div class="spacer"></div>
      <div class="view-toggle"><button data-view="filtered" class="${viewMode==='filtered'?'active':''}">依篩選顯示</button><button data-view="random" class="${viewMode==='random'?'active':''}">隨機抽 5 間</button></div>
      <button class="btn action-btn small" id="drawBtn">🔀 ${viewMode==='random'?'換一組':'隨機抽 5 間營業中'}</button>
    </div>
    <div class="search-row">
      <span class="search-icon">🔍</span>
      <input type="text" id="shopSearchInput" placeholder="搜尋店家名稱…" value="${esc(shopSearchQuery)}"/>
      <button class="search-clear-btn" id="clearShopSearch" style="${shopSearchQuery?'':'display:none;'}">✕</button>
    </div>
    ${tagsPanelExpanded?`<div class="tag-filter-body">${groupsHTML}</div>`:''}
  `;
}

/* ===== GANTT ===== */
function pickShopsForDay(dow, onlyCurrentlyOpen, hour){
  const pool=filteredShops().filter(sh=>{
    const hd=sh.hoursByWeekday[dow]??sh.hoursByWeekday[String(dow)];
    if(!hd) return false;
    if(onlyCurrentlyOpen) return shopOpenAt(sh,dow,hour);
    return true;
  });
  const {unvisited,visited}=splitByVisited(pool);
  const byDist=s=>shopDistanceKm(s);
  return [...unvisited.sort((a,b)=>byDist(a)-byDist(b)), ...visited.sort((a,b)=>byDist(a)-byDist(b))].slice(0,CARD_LIMIT);
}

let didInitialGanttScroll=false;
function scrollGanttToNow(){
  const scrollWrap=document.getElementById("ganttScroll");
  const marker=document.querySelector('[data-now-marker="1"]');
  if(!scrollWrap||!marker) return;
  const wrapRect=scrollWrap.getBoundingClientRect();
  const markerRect=marker.getBoundingClientRect();
  const markerOffsetWithinScroll=(markerRect.left-wrapRect.left)+scrollWrap.scrollLeft;
  const target=markerOffsetWithinScroll-scrollWrap.clientWidth/2;
  scrollWrap.scrollLeft=Math.max(0,target);
}
function renderGantt(){
  const tbl=document.getElementById("ganttTable");
  const scrollWrap=document.getElementById("ganttScroll");
  const prevScrollLeft=scrollWrap?scrollWrap.scrollLeft:0;
  const now=new Date(),todayISO=isoDate(now),nowH=now.getHours(),nowM=now.getMinutes();
  const allDays=[];for(let i=0;i<7;i++){const d=new Date(weekStart);d.setDate(d.getDate()+i);allDays.push(d);}
  // reorder: today first, then subsequent days, then earlier days
  const todayIdx=allDays.findIndex(d=>isoDate(d)===todayISO);
  const days=todayIdx>=0?[...allDays.slice(todayIdx),...allDays.slice(0,todayIdx)]:allDays;

  // thead
  let head=`<thead><tr><th class="corner">星期 / 時</th>`;
  for(let h=HS;h<HE;h++){const isNow=todayIdx>=0&&h===nowH;head+=`<th class="${isNow?'now-hour':''}">${pad(h)}</th>`;}
  head+=`</tr></thead>`;

  // tbody
  let body=`<tbody>`;
  days.forEach((d,di)=>{
    const dow=d.getDay(),iso=isoDate(d),isToday=iso===todayISO,isSel=selectedDayIdx===di;
    const isExpanded=isToday||isSel;

    if(!isExpanded){
      // COLLAPSED: just date + weekday, click to expand
      body+=`<tr>`;
      body+=`<td class="day-label" data-day-idx="${di}" data-dow="${dow}" data-iso="${iso}">星期${DL[dow]}<span class="day-date">${d.getMonth()+1}/${d.getDate()}</span></td>`;
      body+=`<td class="bar-cell collapsed-day" colspan="${HC}" data-day-idx="${di}"><div class="bar-container collapsed-hint" style="height:32px;">點擊展開查看當天營業時間 ▸</div></td>`;
      body+=`</tr>`;
      return;
    }

    const isActiveDay=(selectedDayIdx===null&&isToday)||(selectedDayIdx!==null&&isSel);
    const shopsToday=isActiveDay
      ?currentCardList.filter(sh=>{const hd=sh.hoursByWeekday[dow]??sh.hoursByWeekday[String(dow)];return!!hd;})
      :(isToday?pickShopsForDay(dow,true,nowH):pickShopsForDay(dow,false));
    const rowH=Math.max(32,shopsToday.length*(BAR_H+BAR_GAP)+DAY_PAD*2);

    body+=`<tr>`;
    body+=`<td class="day-label ${isToday?'today':''} ${isSel?'selected':''}" data-day-idx="${di}" data-dow="${dow}" data-iso="${iso}">星期${DL[dow]}<span class="day-date">${d.getMonth()+1}/${d.getDate()}</span></td>`;
    body+=`<td class="bar-cell" colspan="${HC}"><div class="bar-container" style="height:${rowH}px;">`;

    // past overlay (only for today or past days in current week) + current-time reference line
    const pastPct=((nowH-HS)*60+nowM)/(HC*60)*100;
    if(iso<todayISO){
      body+=`<div class="past-overlay" style="width:100%;"></div>`;
    } else if(iso===todayISO){
      if(pastPct>0) body+=`<div class="past-overlay" style="width:${Math.min(100,pastPct)}%;"></div>`;
      if(pastPct>=0&&pastPct<=100) body+=`<div class="now-marker" data-now-marker="1" style="left:${pastPct}%"></div>`;
    } else if(pastPct>=0&&pastPct<=100){
      // future day: no graying (nothing has "passed" on it), but still show the current-time
      // reference line so it's easy to compare against today's current hour at a glance
      body+=`<div class="now-marker now-marker-ref" style="left:${pastPct}%"></div>`;
    }

    // bars
    shopsToday.forEach((sh,si)=>{
      const hd=sh.hoursByWeekday[dow]??sh.hoursByWeekday[String(dow)];
      const oMin=hhmmToMin(hd.open),cMin=hhmmToMin(hd.close);
      const leftPct=((oMin-HS*60)/(HC*60))*100;
      const wPct=((cMin-oMin)/(HC*60))*100;
      const top=DAY_PAD+si*(BAR_H+BAR_GAP);
      const ci=si%8;
      body+=`<div class="shop-bar bar-c${ci}" data-shop-id="${sh.id}" data-name="${esc(sh.name)}" data-hours="${hd.open}–${hd.close}" style="left:${Math.max(0,leftPct)}%;width:${Math.max(.5,wPct)}%;top:${top}px;"></div>`;
    });

    if(!shopsToday.length) body+=`<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--ink-soft);font-size:11px;">${isToday?'目前沒有符合篩選的店家營業中':'無店家營業'}</div>`;
    body+=`</div></td></tr>`;
  });
  body+=`</tbody>`;
  tbl.innerHTML=head+body;
  if(!didInitialGanttScroll){
    didInitialGanttScroll=true;
    requestAnimationFrame(scrollGanttToNow);
  } else if(scrollWrap){
    scrollWrap.scrollLeft=prevScrollLeft;
  }

  const line=document.getElementById("selectedLine");
  if(selectedDayIdx!==null){
    const sd=days[selectedDayIdx],sdow=sd.getDay();
    const cnt=filteredShops().filter(sh=>{const h=sh.hoursByWeekday[sdow]??sh.hoursByWeekday[String(sdow)];return!!h;}).length;
    line.innerHTML=`已展開 <b>星期${DL[sdow]}（${sd.getMonth()+1}/${sd.getDate()}）</b> — 共 <b>${cnt}</b> 間店家有營業（最多顯示 ${CARD_LIMIT} 間） <button id="clearSlot">收合</button>`;
  } else line.innerHTML="";
}

/* ===== CARDS ===== */
function currentQ(){
  const now=new Date(),todayISO=isoDate(now);
  if(selectedDayIdx===null){
    return{dow:now.getDay(),hour:now.getHours(),dateISO:todayISO,isToday:true};
  }
  // replicate the same today-first reordering used by renderGantt so selectedDayIdx maps to the correct date
  const allDays=[];for(let i=0;i<7;i++){const d=new Date(weekStart);d.setDate(d.getDate()+i);allDays.push(d);}
  const todayIdx=allDays.findIndex(d=>isoDate(d)===todayISO);
  const days=todayIdx>=0?[...allDays.slice(todayIdx),...allDays.slice(0,todayIdx)]:allDays;
  const d=days[selectedDayIdx]||now;
  const iso=isoDate(d);
  return{dow:d.getDay(),hour:now.getHours(),dateISO:iso,isToday:iso===todayISO};
}
function starStr(r){r=Math.round(r||0);return"★".repeat(r)+"☆".repeat(5-r);}
function avgRating(id){const rs=reviews[id]||[];if(!rs.length)return null;return rs.reduce((a,r)=>a+(r.rating||0),0)/rs.length;}
function radarSVG(c,size){return RadarChart.render(RADAR_AXES, c, {size:size||140});}


/* Mount points for active FlavorWheel instances, keyed by coffee entry uid */
let flavorWheelInstances={};
function initFlavorWheel(c){
  const mount=document.querySelector(`[data-flavor-wheel-mount="${c.uid}"]`);
  if(!mount) return;
  flavorWheelInstances[c.uid]=FlavorWheel.create(mount,{
    getTags:()=>c.flavorTags||[],
    onToggle:(leaf)=>{
      if(!c.flavorTags)c.flavorTags=[];
      const i=c.flavorTags.indexOf(leaf.zh);
      if(i===-1)c.flavorTags.push(leaf.zh);else c.flavorTags.splice(i,1);
      updateFlavorTagsRow(c.uid,c);
    }
  });
}
function updateFlavorTagsRow(uid,c){
  const tagsRow=document.querySelector(`[data-flavor-tags="${uid}"]`);
  if(tagsRow) tagsRow.innerHTML=(c.flavorTags&&c.flavorTags.length)?c.flavorTags.map(t=>`<span class="tag-pill">#${esc(t)} <button type="button" class="tag-remove-x" data-remove-flavor-tag="${uid}" data-flavor-value="${esc(t)}">✕</button></span>`).join(""):'<span style="color:var(--ink-soft);font-size:11px;">尚未選擇風味標籤</span>';
}
function flavorWheelHTML(c){
  const tags=c.flavorTags||[];
  return `<div class="flavor-wheel-block" data-flavor-wheel="${c.uid}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <label style="margin:0;">風味輪（拖曳旋轉或點選細項，可複選）</label>
      <a href="https://en.wikipedia.org/wiki/Coffee_taster%27s_flavor_wheel" target="_blank" rel="noopener" style="font-size:11px;color:var(--teal-dark);">🔗 關於風味輪</a>
    </div>
    <div class="fw-mount" data-flavor-wheel-mount="${c.uid}"></div>
    <div class="tags-row" data-flavor-tags="${c.uid}" style="margin-top:8px;">${tags.length?tags.map(t=>`<span class="tag-pill">#${esc(t)} <button type="button" class="tag-remove-x" data-remove-flavor-tag="${c.uid}" data-flavor-value="${esc(t)}">✕</button></span>`).join(""):'<span style="color:var(--ink-soft);font-size:11px;">尚未選擇風味標籤</span>'}</div>
  </div>`;
}

function shopCardHTML(shop,idx){
  const q=currentQ(),isOpen=shopOpenAt(shop,q.dow,q.hour);
  const todayH=shop.hoursByWeekday[q.dow]??shop.hoursByWeekday[String(q.dow)];
  const st=getStatus(shop.id),rs=reviews[shop.id]||[];
  const ci=idx!=null?(idx%8):shopColorIdx(shop);
  const isExpanded=expandedCards.has(shop.id);
  const gRating=shop.googleRating!=null?`<span class="google-rating-badge">⭐ <b>${shop.googleRating}</b>${shop.googleReviewCount?` (${shop.googleReviewCount})`:''}</span>`:'';
  const distKm=shopDistanceKm(shop);
  const distLine=isFinite(distKm)?`<div style="font-size:11.5px;color:var(--ink-soft);">📍 距離約 ${distKm<1?Math.round(distKm*1000)+' 公尺':distKm.toFixed(1)+' 公里'}</div>`:'';

  if(!isExpanded){
    // COLLAPSED: name, google rating (top-right), address, phone only
    return`<div class="shop-card" data-shop="${shop.id}">
      <div class="card-topright">${gRating}</div>
      <div class="shop-card-header" data-toggle-card="${shop.id}">
        <span class="color-dot dot-c${ci}"></span><h3>${esc(shop.name)}</h3>
      </div>
      <div class="collapsed-lines">
        <div>${addressLine(shop)}</div>
        ${phoneLine(shop.phone)}
        ${distLine}
      </div>
      <button class="expand-toggle" data-toggle-card="${shop.id}">▾ 展開詳細資訊</button>
    </div>`;
  }

  // EXPANDED: name / address+phone+distance / hours / closure day /
  // FB+IG buttons (+ inline irregular-closure warning) / extra note block / tags /
  // interest+visited actions / tasting record list (date - coffee name, click opens viewer)
  return`<div class="shop-card" data-shop="${shop.id}">
    <div class="card-topright">
      <span class="status-pill ${isOpen?'open':'closed'}">${isOpen?'營業中':'休息中'}</span>
      ${gRating}
    </div>
    <div class="shop-card-header" data-toggle-card="${shop.id}">
      <span class="color-dot dot-c${ci}"></span><h3>${esc(shop.name)}</h3>
    </div>
    <div class="shop-meta"><div class="row">${addressLine(shop)}</div>${phoneLine(shop.phone)}${distLine}</div>
    <div class="hours-line">${todayH?`今日營業 ${todayH.open}–${todayH.close}`:"今日公休"}</div>
    ${shop.noteOnClosure?`<div class="closure-day-line">${esc(shop.noteOnClosure)}</div>`:''}
    <div class="social-row">${socialButtonsHTML(shop)}${shop.irregularClosure?`<span class="inline-irregular-warn">⚠️ 常有不定休，出發前請確認粉專／IG</span>`:''}</div>
    ${shop.extraNote?`<div class="extra-note-block">📌 ${esc(shop.extraNote)}</div>`:''}
    <div class="tags-row">${shop.tags.map(t=>tagPillHTML(t)).join("")}</div>
    <div class="card-actions"><button class="btn ${st.interested?'gold':'ghost'} small" data-action="interest" data-id="${shop.id}">${st.interested?'❤️ 已加入興趣':'🤍 有興趣'}</button><button class="btn ${st.visited?'gold':'ghost'} small" data-action="visited" data-id="${shop.id}">${st.visited?'📝 補寫/新增評論':'✅ 已去過'}</button></div>
    ${recordListHTML(shop)}
    <button class="expand-toggle" data-toggle-card="${shop.id}">▴ 收合</button>
  </div>`;
}
function recordListHTML(shop){
  const rs=reviews[shop.id]||[];
  if(!rs.length) return '';
  const lines=rs.slice().reverse().map(r=>{
    const dateStr=(r.visitDate||'').slice(0,10);
    const coffeeNames=(r.coffees||[]).map((c,i)=>c.beanOrigin||('第'+(i+1)+'杯')).filter(Boolean).join('、')||'（未填豆名）';
    return `<button class="record-line-item" data-open-record="${shop.id}" data-rid="${r._rid}"><span class="record-date">${esc(dateStr)}</span><span class="record-coffee">${esc(coffeeNames)}</span><span class="record-stars">${starStr(r.rating)}</span></button>`;
  }).join('');
  return `<div class="tasting-records"><div class="tasting-records-title">📖 品飲紀錄（${rs.length} 筆）</div><div class="record-list">${lines}</div></div>`;
}
function openPool(){
  const q=currentQ();
  return filteredShops().filter(sh=>{
    const hd=sh.hoursByWeekday[q.dow]??sh.hoursByWeekday[String(q.dow)];
    if(!hd) return false;
    if(q.isToday) return shopOpenAt(sh,q.dow,q.hour);
    return true; // non-today selected day: show anytime open that day, not just current hour
  });
}
function splitByVisited(list){
  const unvisited=[],visited=[];
  list.forEach(s=>(getStatus(s.id).visited?visited:unvisited).push(s));
  return {unvisited,visited};
}
let currentCardList=[];
function renderCards(){
  const wrap=document.getElementById("shopCards"),title=document.getElementById("cardsTitle"),hint=document.getElementById("cardsHint");
  const q=currentQ();
  let list;
  const trimmedSearch=shopSearchQuery.trim();
  if(trimmedSearch){
    list=filteredShops().filter(s=>nameMatchesQuery(s.name,trimmedSearch));
    title.textContent=`搜尋「${trimmedSearch}」`;
    hint.textContent=`共找到 ${list.length} 間店家（不受營業狀態與 5 間上限限制）`;
  }else if(viewMode==="random"){
    list=randomPicks.map(id=>SHOPS.find(s=>s.id===id)).filter(Boolean);
    title.textContent=q.isToday?"隨機抽選探店清單":`星期${DL[q.dow]} 隨機抽選探店清單`;
    hint.textContent=`${q.isToday?'僅列出目前營業中的店家':'僅列出當天有營業的店家'}，隨機抽選最多 ${CARD_LIMIT} 間，優先推薦尚未去過的`;
  }else{
    const pool=openPool();
    const {unvisited,visited}=splitByVisited(pool);
    const byDist=s=>shopDistanceKm(s);
    const sorted=[...unvisited.sort((a,b)=>byDist(a)-byDist(b)), ...visited.sort((a,b)=>byDist(a)-byDist(b))];
    list=sorted.slice(0,CARD_LIMIT);
    if(selectedDayIdx!==null){
      title.textContent=q.isToday?"目前營業中的推薦店家":`星期${DL[q.dow]} 有營業的推薦店家`;
    }else{
      title.textContent="目前營業中的推薦店家";
    }
    const locNote=userLoc.isReal?"依你目前定位":"依嘉義市中心（尚未取得定位權限）";
    hint.textContent=`標籤：${activeTags.size?[...activeTags].join('、'):'（無篩選）'} ‧ ${locNote}距離由近到遠，最多 ${CARD_LIMIT} 間，優先推薦尚未去過的`;
  }
  currentCardList=list;
  wrap.innerHTML=list.length?list.map((s,i)=>shopCardHTML(s,i)).join(""):`<div class="empty-note">${trimmedSearch?'找不到符合的店家。':'目前沒有符合條件的店家。'}</div>`;
  renderGantt(); // keep the gantt's active-day bars in sync with whichever shops are now shown below
}
function computeRandomPicks(){
  const pool=openPool();
  const {unvisited,visited}=splitByVisited(pool);
  const shuffled=[...unvisited.sort(()=>Math.random()-.5), ...visited.sort(()=>Math.random()-.5)];
  randomPicks=shuffled.slice(0,CARD_LIMIT).map(s=>s.id);
}

function renderInterestStrip(){
  const wrap=document.getElementById("interestStrip"),list=SHOPS.filter(s=>getStatus(s.id).interested);
  if(!list.length){wrap.innerHTML=`<div class="empty-note">還沒有加入任何店家。</div>`;return;}
  const q=currentQ();
  wrap.innerHTML=list.map(s=>{
    const ci=shopColorIdx(s);
    const todayH=s.hoursByWeekday[q.dow]??s.hoursByWeekday[String(q.dow)];
    const gRating=s.googleRating!=null?`<span class="google-rating-badge">⭐ <b>${s.googleRating}</b>${s.googleReviewCount?` (${s.googleReviewCount})`:''}</span>`:'';
    return`<div class="mini-card">
      <button class="x" data-remove-interest="${s.id}">✕</button>
      <div class="mini-card-body">
        <h4 style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span class="color-dot dot-c${ci}"></span>${esc(s.name)} ${gRating}</h4>
        <div style="font-size:11.5px;color:var(--ink-soft);">${addressLine(s)}</div>
        <div style="font-size:11.5px;color:var(--ink-soft);">${phoneLine(s.phone)}</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink-soft);">${todayH?`今日 ${todayH.open}–${todayH.close}`:'今日公休'}</div>
        <div class="social-row" style="margin-top:4px;">${socialButtonsHTML(s)}${s.irregularClosure?`<span class="inline-irregular-warn">⚠️ 常有不定休</span>`:''}</div>
        ${s.extraNote?`<div class="extra-note-block">📌 ${esc(s.extraNote)}</div>`:''}
        <div class="tags-row" style="margin-top:6px;">${s.tags.map(t=>tagPillHTML(t)).join("")}</div>
      </div>
    </div>`;
  }).join("");
}

/* Modal */
let coffeeCounter=0,snackCounter=0;
function emptyCoffee(){return TastingForm.emptyEntry(TASTING_CONFIG,"c");}
function emptySnack(){snackCounter++;return{uid:"sn"+snackCounter,name:"",tasteNote:"",pairing:""};}
let modalState=null;
function openReviewModal(shopId,editRid){const shop=SHOPS.find(s=>s.id===shopId);if(!shop)return;if(editRid){const rs=reviews[shopId]||[];const ex=rs.find(r=>r._rid===editRid);if(!ex)return;modalState={shopId,editRid,visitDate:ex.visitDate||'',rating:ex.rating||4,overallNote:ex.overallNote||"",coffees:(ex.coffees||[]).map(c=>({uid:"c"+(++coffeeCounter),...c})),hasSnack:ex.hasSnack||false,snacks:(ex.snacks||[]).map(s=>({uid:"sn"+(++snackCounter),...s}))};}else{const n=new Date();modalState={shopId,editRid:null,visitDate:n.getFullYear()+"-"+pad(n.getMonth()+1)+"-"+pad(n.getDate())+"T"+pad(n.getHours())+":"+pad(n.getMinutes()),rating:4,overallNote:"",coffees:[emptyCoffee()],hasSnack:false,snacks:[]};}renderModal();}
function closeModal(){modalState=null;flavorWheelInstances={};document.getElementById("modalRoot").innerHTML="";}
function renderModal(){const root=document.getElementById("modalRoot");if(!modalState){root.innerHTML="";return;}const shop=SHOPS.find(s=>s.id===modalState.shopId),isEdit=!!modalState.editRid;root.innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><h2>${isEdit?'✏️ 編輯品飲紀錄':'📝 新增品飲紀錄'}</h2><div class="sub">${esc(shop.name)}</div><div class="field"><label>整體星等</label><div class="star-picker" id="starPicker">${[1,2,3,4,5].map(n=>`<span data-star="${n}" class="${n<=modalState.rating?'on':''}">★</span>`).join("")}</div></div><div class="row2"><div class="field"><label>店家名稱</label><input type="text" value="${esc(shop.name)}" disabled/></div><div class="field"><label>走訪日期時間</label><input type="datetime-local" id="visitDate" value="${modalState.visitDate}"/></div></div><div class="field"><label>整體評論</label><textarea id="overallNote" placeholder="這次造訪的整體感受、環境、服務…">${esc(modalState.overallNote)}</textarea></div><h3 style="font-size:16px;margin:16px 0 8px;">☕ 咖啡風味紀錄</h3><div id="coffeeList">${modalState.coffees.map((c,i)=>coffeeBlockHTML(c,i)).join("")}</div><button class="add-line-btn" id="addCoffeeBtn">＋ 新增一杯咖啡</button><h3 style="font-size:16px;margin:18px 0 8px;">🍪 餐點／點心</h3><div class="field"><label><input type="checkbox" id="hasSnack" ${modalState.hasSnack?'checked':''} style="width:auto;margin-right:6px;"/>是否有供餐點／點心</label></div><div id="snackWrap" style="${modalState.hasSnack?'':'display:none;'}"><div id="snackList">${modalState.snacks.map((s,i)=>snackBlockHTML(s,i)).join("")}</div><button class="add-line-btn" id="addSnackBtn">＋ 新增一項點心</button></div><div class="modal-actions"><button class="btn ghost" id="cancelModal">取消</button><button class="btn gold" id="saveModal">${isEdit?'更新紀錄':'儲存紀錄'}</button></div></div></div>`;
  flavorWheelInstances={};
  modalState.coffees.forEach(c=>initFlavorWheel(c));
}
function coffeeBlockHTML(c,i){return`<div class="coffee-block" data-coffee="${c.uid}">
  <div class="coffee-head">
    <b>第 ${i+1} 杯</b>
    <div style="display:flex;align-items:center;gap:8px;">
      ${i>0?`<button class="remove-btn" data-remove-coffee="${c.uid}">移除</button>`:''}
    </div>
  </div>
  <div class="coffee-radar-mini" data-radar-for="${c.uid}" style="float:right;margin-left:12px;">${radarSVG(c,120)}</div>
  ${TastingForm.fieldsHTML(TASTING_CONFIG,c)}
  ${flavorWheelHTML(c)}
  <div style="clear:both;"></div>
</div>`;}
function snackBlockHTML(s,i){return`<div class="snack-block" data-snack="${s.uid}"><div class="coffee-head"><b>點心 ${i+1}</b><button class="remove-btn" data-remove-snack="${s.uid}">移除</button></div><div class="field"><label>點心名稱</label><input type="text" data-sfield="name" value="${esc(s.name)}"/></div><div class="field"><label>品嘗描述</label><input type="text" data-sfield="tasteNote" value="${esc(s.tasteNote)}"/></div><div class="field"><label>搭配狀況</label><input type="text" data-sfield="pairing" value="${esc(s.pairing)}"/></div></div>`;}
function syncModalFromDOM(){if(!modalState)return;const dt=document.getElementById("visitDate");if(dt)modalState.visitDate=dt.value;const on=document.getElementById("overallNote");if(on)modalState.overallNote=on.value;document.querySelectorAll(".coffee-block").forEach(b=>{const c=modalState.coffees.find(x=>x.uid===b.getAttribute("data-coffee"));if(!c)return;b.querySelectorAll("[data-field]").forEach(inp=>{c[inp.getAttribute("data-field")]=inp.value;});});document.querySelectorAll(".snack-block").forEach(b=>{const s=modalState.snacks.find(x=>x.uid===b.getAttribute("data-snack"));if(!s)return;b.querySelectorAll("[data-sfield]").forEach(inp=>{s[inp.getAttribute("data-sfield")]=inp.value;});});}
function saveReview(){syncModalFromDOM();const{shopId,editRid}=modalState;const rec={_rid:editRid||String(++ridCounter),visitDate:modalState.visitDate,rating:modalState.rating,overallNote:modalState.overallNote||"",coffees:modalState.coffees.map(c=>{const copy={...c};delete copy.uid;(TASTING_CONFIG.fields||[]).forEach(f=>{if(f.type==="radar-axis")copy[f.key]=Number(copy[f.key])||0;});copy.flavorTags=c.flavorTags||[];return copy;}),hasSnack:modalState.hasSnack,snacks:modalState.hasSnack?modalState.snacks.map(s=>({name:s.name,tasteNote:s.tasteNote,pairing:s.pairing})):[],conclusionCoffee:(modalState.coffees[0]&&modalState.coffees[0].conclusionDesc)||""};if(!reviews[shopId])reviews[shopId]=[];if(editRid){const idx=reviews[shopId].findIndex(r=>r._rid===editRid);if(idx!==-1)reviews[shopId][idx]=rec;}else reviews[shopId].push(rec);setStatus(shopId,{visited:true});saveState();closeModal();renderAll();}
function deleteReview(shopId,rid){if(!reviews[shopId])return;reviews[shopId]=reviews[shopId].filter(r=>r._rid!==rid);if(!reviews[shopId].length){delete reviews[shopId];setStatus(shopId,{visited:false});}saveState();renderAll();}
function showConfirm(msg,onYes){const root=document.getElementById("confirmRoot");root.innerHTML=`<div class="confirm-overlay" id="confirmOverlay"><div class="confirm-box"><p>${msg}</p><div class="actions"><button class="btn ghost small" id="confirmNo">取消</button><button class="btn danger small" id="confirmYes">確定刪除</button></div></div></div>`;document.getElementById("confirmYes").onclick=()=>{root.innerHTML="";onYes();};document.getElementById("confirmNo").onclick=()=>{root.innerHTML="";};document.getElementById("confirmOverlay").onclick=e=>{if(e.target===e.currentTarget)root.innerHTML="";};}

/* ===== RECORD VIEWER (read-only detail view, opened by clicking a "date - coffee name" line) ===== */
let recordViewerState=null; // {shopId, rid}
function openRecordViewer(shopId,rid){recordViewerState={shopId,rid};renderRecordViewer();}
function closeRecordViewer(){recordViewerState=null;const root=document.getElementById("recordViewerRoot");if(root)root.innerHTML="";}
function renderRecordViewer(){
  const root=document.getElementById("recordViewerRoot");
  if(!recordViewerState){root.innerHTML="";return;}
  const shop=SHOPS.find(s=>s.id===recordViewerState.shopId);
  const r=shop&&(reviews[shop.id]||[]).find(x=>x._rid===recordViewerState.rid);
  if(!shop||!r){closeRecordViewer();return;}
  const coffeesHTML=(r.coffees||[]).map((c,i)=>`
    <div class="record-coffee-block">
      <div class="record-coffee-head">☕ 第 ${i+1} 杯：${esc(c.beanOrigin||'（未填豆名）')}</div>
      <div class="record-coffee-meta">處理法：${esc(c.process||'－')}　焙度：${esc(c.roast||'－')}</div>
      <div class="radar-wrap">${radarSVG(c,140)}</div>
      ${(c.flavorTags&&c.flavorTags.length)?`<div class="tags-row">${c.flavorTags.map(t=>`<span class="tag-pill">#${esc(t)}</span>`).join('')}</div>`:''}
      <div class="record-axis-detail">
        <div>香氣 ${c.aroma??'-'}/10${c.aromaDesc?'　－ '+esc(c.aromaDesc):''}</div>
        <div>Body ${c.body??'-'}/10${c.bodyDesc?'　－ '+esc(c.bodyDesc):''}</div>
        <div>苦味 ${c.bitterness??'-'}/10${c.bitternessDesc?'　－ '+esc(c.bitternessDesc):''}</div>
        <div>酸質 ${c.acidity??'-'}/10${c.acidityDesc?'　－ '+esc(c.acidityDesc):''}</div>
        <div>甜感 ${c.sweetness??'-'}/10${c.sweetnessDesc?'　－ '+esc(c.sweetnessDesc):''}</div>
        <div>餘韻 ${c.aftertaste??'-'}/10${c.aftertasteDesc?'　－ '+esc(c.aftertasteDesc):''}</div>
      </div>
      <div class="record-conclusion">結論：我${esc(c.liked||'')}${c.conclusionDesc?'　－ '+esc(c.conclusionDesc):''}</div>
    </div>`).join('');
  const snackHTML=(r.hasSnack&&r.snacks&&r.snacks.length)?`
    <div class="record-snack-block">
      <div class="record-coffee-head" style="font-size:14px;">🍪 點心</div>
      ${r.snacks.map(sn=>`<div>${esc(sn.name||'')}${sn.tasteNote?'－'+esc(sn.tasteNote):''}${sn.pairing?'（搭配：'+esc(sn.pairing)+'）':''}</div>`).join('')}
    </div>`:'';
  root.innerHTML=`<div class="modal-backdrop" id="recordViewerBackdrop">
    <div class="modal">
      <h2>📖 品飲紀錄</h2>
      <div class="sub">${esc(shop.name)} ‧ ${esc((r.visitDate||'').slice(0,16).replace('T',' '))} ‧ ${starStr(r.rating)}</div>
      ${r.overallNote?`<div class="record-overall-note">${esc(r.overallNote)}</div>`:''}
      ${coffeesHTML}
      ${snackHTML}
      <div class="modal-actions">
        <button class="btn ghost" id="closeRecordViewer">關閉</button>
        <button class="btn danger" data-delete-review="${shop.id}" data-rid="${r._rid}">🗑 刪除這筆紀錄</button>
        <button class="btn gold" data-edit-review="${shop.id}" data-rid="${r._rid}">✏️ 編輯這筆紀錄</button>
      </div>
    </div>
  </div>`;
}

/* Export */
function shopExportBlock(shop){return[0,1,2,3,4,5,6].map(d=>{const h=shop.hoursByWeekday[d];return`${DL[d]} ${h?h.open+"–"+h.close:"公休"}`;}).join("｜");}
function generateInterestMD(){const list=SHOPS.filter(s=>getStatus(s.id).interested);let md=`# 探店清單（有興趣）\n\n匯出：${new Date().toLocaleString()}\n\n`;list.forEach(s=>{md+=`## ${s.name}\n- 地點：${s.address}\n- 電話：${s.phone||'無電話資訊'}\n- 標籤：${s.tags.map(t=>'#'+t).join(' ')}\n- 營業：${shopExportBlock(s)}\n- 備註：${s.noteOnClosure||''}\n- FB：${s.fb||'（無）'}　IG：${s.ig||'（無）'}\n- Google 地圖：${s.mapUrl||'（無）'}\n\n`;});return md||md+"_空。_\n";}
function generateInterestHTML(){const list=SHOPS.filter(s=>getStatus(s.id).interested);const body=list.map(s=>`<section style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #ddd;"><h2>${esc(s.name)}</h2><p>📍 ${esc(s.address)} ｜ ☎️ ${esc(s.phone||'無電話資訊')}</p><p>${s.tags.map(t=>'#'+esc(t)).join(' ')}</p><p style="font-family:monospace;">${esc(shopExportBlock(s))}</p><p style="color:#666;">${esc(s.noteOnClosure||'')}</p><p>${s.fb?`<a href="${esc(s.fb)}">Facebook</a> `:''}${s.ig?`<a href="${esc(s.ig)}">Instagram</a> `:''}${s.mapUrl?`<a href="${esc(s.mapUrl)}">Google 地圖</a>`:''}</p></section>`).join("");return wrapExportHTML("探店清單",body||"<p>空。</p>");}
function generateRecordsMD(){let md=`# 探店品飲紀錄\n\n匯出：${new Date().toLocaleString()}\n\n`;SHOPS.filter(s=>(reviews[s.id]||[]).length).forEach(s=>{md+=`## ${s.name}\n\n`;(reviews[s.id]||[]).forEach((r,i)=>{md+=`### 紀錄 ${i+1}｜${r.visitDate}｜${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}\n\n`;r.coffees.forEach((c,ci)=>{md+=`**第 ${ci+1} 杯** 豆：${c.beanOrigin||'＿'}　處理法：${c.process||'＿'}　焙度：${c.roast}\n風味標籤：${(c.flavorTags&&c.flavorTags.length)?c.flavorTags.map(t=>'#'+t).join(' '):'（無）'}\n香氣 ${c.aroma||0}/10（${c.aromaDesc||''}）　Body ${c.body||0}/10（${c.bodyDesc||''}）　苦味 ${c.bitterness||0}/10（${c.bitternessDesc||''}）\n酸質 ${c.acidity||0}/10（${c.acidityDesc||''}）　甜感 ${c.sweetness||0}/10（${c.sweetnessDesc||''}）　餘韻 ${c.aftertaste||0}/10（${c.aftertasteDesc||''}）\n結論：我${c.liked} — ${c.conclusionDesc||''}\n\n`;});if(r.hasSnack&&r.snacks.length){r.snacks.forEach(sn=>{md+=`- 點心：${sn.name||'＿'}／${sn.tasteNote||''}／搭配：${sn.pairing||''}\n`;});md+='\n';}});});return md;}
function generateRecordsHTML(){const sw=SHOPS.filter(s=>(reviews[s.id]||[]).length);const body=sw.map(s=>{const recs=(reviews[s.id]||[]).map(r=>{const ch=r.coffees.map((c,ci)=>`<div style="background:#f7f1e6;border:1px solid #d8cbb4;border-radius:8px;padding:10px 14px;margin-bottom:8px;"><b>第 ${ci+1} 杯</b><div style="display:flex;gap:14px;flex-wrap:wrap;"><div style="flex:1;min-width:200px;"><p>豆：${esc(c.beanOrigin||'＿')}　處理法：${esc(c.process||'＿')}　焙度：${esc(c.roast)}</p><p>風味：${(c.flavorTags&&c.flavorTags.length)?c.flavorTags.map(t=>'#'+esc(t)).join(' '):'（無）'}</p><p>香氣 ${c.aroma||0}/10　Body ${c.body||0}/10　苦味 ${c.bitterness||0}/10</p><p>酸質 ${c.acidity||0}/10　甜感 ${c.sweetness||0}/10　餘韻 ${c.aftertaste||0}/10</p><p>結論：我${esc(c.liked)} — ${esc(c.conclusionDesc||'')}</p></div><div>${radarSVG(c,120)}</div></div></div>`).join("");return`<div style="margin-bottom:16px;"><p style="font-family:monospace;">${esc(r.visitDate)} ｜ ${starStr(r.rating)}</p>${ch}</div>`;}).join("<hr style='border:none;border-top:1px dashed #ccc;margin:14px 0;'>");return`<section style="margin-bottom:28px;"><h2>${esc(s.name)}</h2>${recs}</section>`;}).join("");return wrapExportHTML("探店品飲紀錄",body||"<p>無紀錄。</p>");}
function csvCell(v){v=String(v??"");if(/[",\n\r]/.test(v))v='"'+v.replace(/"/g,'""')+'"';return v;}
function csvRow(arr){return arr.map(csvCell).join(",");}
function generateInterestCSV(){
  const list=SHOPS.filter(s=>getStatus(s.id).interested);
  const header=["店名","縣市","地點","電話","標籤","週日","週一","週二","週三","週四","週五","週六","Facebook","Instagram","Google地圖","備註"];
  const rows=list.map(s=>{
    const hrs=[0,1,2,3,4,5,6].map(d=>{const h=s.hoursByWeekday[d];return h?`${h.open}-${h.close}`:"公休";});
    return csvRow([s.name,s.city||"",s.address,s.phone,s.tags.join("、"),...hrs,s.fb,s.ig,s.mapUrl||"",s.noteOnClosure||""]);
  });
  return "\ufeff"+[csvRow(header),...rows].join("\r\n");
}
function generateRecordsCSV(){
  const header=["店名","走訪日期","整體星等(個人)","整體評論","杯次","豆名/產地","處理法","焙度","風味標籤","香氣","香氣描述","Body","Body描述","苦味","苦味描述","酸質","酸質描述","甜感","甜感描述","餘韻","餘韻描述","結論","結論描述","點心"];
  const rows=[];
  SHOPS.forEach(s=>{
    (reviews[s.id]||[]).forEach(r=>{
      const snackStr=(r.hasSnack&&r.snacks&&r.snacks.length)?r.snacks.map(sn=>`${sn.name}（${sn.tasteNote}／${sn.pairing}）`).join("；"):"";
      const coffees=r.coffees&&r.coffees.length?r.coffees:[{}];
      coffees.forEach((c,i)=>{
        rows.push(csvRow([
          s.name,(r.visitDate||"").slice(0,16).replace("T"," "),r.rating,r.overallNote||"",
          i+1,c.beanOrigin||"",c.process||"",c.roast||"",
          (c.flavorTags||[]).join("、"),
          c.aroma??"",c.aromaDesc||"",c.body??"",c.bodyDesc||"",c.bitterness??"",c.bitternessDesc||"",
          c.acidity??"",c.acidityDesc||"",c.sweetness??"",c.sweetnessDesc||"",c.aftertaste??"",c.aftertasteDesc||"",
          c.liked||"",c.conclusionDesc||"",
          i===0?snackStr:""
        ]));
      });
    });
  });
  return "\ufeff"+[csvRow(header),...rows].join("\r\n");
}
function wrapExportHTML(t,b){return`<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>${esc(t)}</title><style>body{font-family:system-ui,sans-serif;background:#EFE6D8;color:#2E1D12;max-width:760px;margin:40px auto;padding:0 20px;}h1,h2{font-family:serif;}h2{border-bottom:2px solid #2E1D12;padding-bottom:6px;}@media print{body{margin:0;background:#fff;}}</style></head><body><h1>${esc(t)}</h1><p style="font-family:monospace;color:#5A4636;">匯出：${new Date().toLocaleString()}</p>${b}</body></html>`;}
function downloadBlob(c,f,m){const b=new Blob([c],{type:m}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=f;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);}
function doExport(kind,fmt){const isI=kind==="interest",base=isI?"探店興趣清單":"探店品飲紀錄",stamp=new Date().toISOString().slice(0,10);
  if(fmt==="md"){downloadBlob(isI?generateInterestMD():generateRecordsMD(),`${base}_${stamp}.md`,"text/markdown;charset=utf-8");return;}
  if(fmt==="html"){downloadBlob(isI?generateInterestHTML():generateRecordsHTML(),`${base}_${stamp}.html`,"text/html;charset=utf-8");return;}
  if(fmt==="csv"){downloadBlob(isI?generateInterestCSV():generateRecordsCSV(),`${base}_${stamp}.csv`,"text/csv;charset=utf-8");return;}
  if(fmt==="pdf"){const html=isI?generateInterestHTML():generateRecordsHTML();const w=window.open("","_blank");if(!w){alert("請允許彈出視窗");return;}w.document.write(html);w.document.close();setTimeout(()=>{w.focus();w.print();},400);return;}
}

let journalPageIndex={}; // shopId -> current record index (0 = newest)
function renderJournal(){
  const wrap=document.getElementById("journalTimeline");
  let groups=[];
  SHOPS.forEach(shop=>{
    const rs=(reviews[shop.id]||[]).slice().sort((a,b)=>(b.visitDate||'').localeCompare(a.visitDate||''));
    if(rs.length) groups.push({shop,records:rs});
  });
  const trimmedJSearch=journalSearchQuery.trim();
  if(trimmedJSearch) groups=groups.filter(({shop})=>nameMatchesQuery(shop.name,trimmedJSearch));
  groups.sort((a,b)=>(b.records[0].visitDate||'').localeCompare(a.records[0].visitDate||''));
  if(!groups.length){wrap.innerHTML=`<div class="empty-note">${trimmedJSearch?'找不到符合的店家紀錄。':'尚無任何探店紀錄，在店卡上按「✅ 已去過」即可開始記錄。'}</div>`;return;}
  wrap.innerHTML=groups.map(({shop,records})=>{
    const ci=shopColorIdx(shop);
    let idx=journalPageIndex[shop.id]||0;
    if(idx<0) idx=records.length-1;
    if(idx>=records.length) idx=0;
    journalPageIndex[shop.id]=idx;
    const r=records[idx];
    const firstCoffee=(r.coffees&&r.coffees[0])||{};
    const coffeeNames=(r.coffees||[]).map((c,i)=>c.beanOrigin||('第'+(i+1)+'杯')).filter(Boolean).join('、')||'（未填豆名）';
    const roastLevels=[...new Set((r.coffees||[]).map(c=>c.roast).filter(Boolean))].join('／');
    const gBadge=shop.googleRating!=null?` <span class="google-rating-badge" style="position:static;font-size:10px;">⭐ ${shop.googleRating}</span>`:'';
    return `<div class="journal-group">
      <div class="je-shop-header"><span class="color-dot dot-c${ci}"></span>${esc(shop.name)}${gBadge}</div>
      <div class="journal-pager-row">
        ${records.length>1?`<button class="pager-btn" data-journal-prev="${shop.id}">‹</button>`:''}
        <button class="journal-preview" data-open-record="${shop.id}" data-rid="${r._rid}">
          <div class="jp-date">${esc(r.visitDate?.slice(0,10)||'')} ‧ <span class="stars">${starStr(r.rating)}</span></div>
          <div class="jp-coffee">${esc(coffeeNames)}${roastLevels?`　${esc(roastLevels)}`:''}</div>
          <div class="jp-radar">${radarSVG(firstCoffee,120)}</div>
        </button>
        ${records.length>1?`<button class="pager-btn" data-journal-next="${shop.id}">›</button>`:''}
      </div>
      ${records.length>1?`<div class="pager-dots">第 ${idx+1}／${records.length} 筆</div>`:''}
    </div>`;
  }).join("");
}

function renderAll(){renderTagChips();renderCards();renderInterestStrip();renderJournal();}

const tooltip=document.getElementById("barTooltip");
document.addEventListener("mouseover",function(e){const bar=e.target.closest(".shop-bar");if(bar){tooltip.textContent=bar.getAttribute("data-name")+" ‧ "+bar.getAttribute("data-hours");tooltip.style.display="block";}});
document.addEventListener("mousemove",function(e){if(tooltip.style.display==="block"){tooltip.style.left=(e.clientX+12)+"px";tooltip.style.top=(e.clientY-30)+"px";}});
document.addEventListener("mouseout",function(e){if(e.target.closest(".shop-bar"))tooltip.style.display="none";});

document.addEventListener("click",function(e){
  if(e.target.closest("#tagFilterToggle")){tagsPanelExpanded=!tagsPanelExpanded;renderTagChips();return;}
  const tagGroupToggle=e.target.closest("[data-tag-group-toggle]");if(tagGroupToggle){const key=tagGroupToggle.getAttribute("data-tag-group-toggle");expandedTagGroups.has(key)?expandedTagGroups.delete(key):expandedTagGroups.add(key);renderTagChips();return;}
  const tag=e.target.closest("[data-tag]");if(tag){const t=tag.getAttribute("data-tag");activeTags.has(t)?activeTags.delete(t):activeTags.add(t);if(viewMode==="random")computeRandomPicks();renderAll();return;}
  const vb=e.target.closest("[data-view]");if(vb){const newMode=vb.getAttribute("data-view");if(newMode==="random"&&viewMode!=="random")computeRandomPicks();viewMode=newMode;renderTagChips();renderCards();return;}
  if(e.target.id==="drawBtn"){viewMode="random";computeRandomPicks();renderTagChips();renderCards();return;}
  const dayLbl=e.target.closest("td.day-label, td.bar-cell.collapsed-day");if(dayLbl){const idx=Number(dayLbl.getAttribute("data-day-idx"));selectedDayIdx=selectedDayIdx===idx?null:idx;if(viewMode==="random")computeRandomPicks();renderCards();return;}
  const bar=e.target.closest(".shop-bar");if(bar){const sid=bar.getAttribute("data-shop-id");const card=document.querySelector(`.shop-card[data-shop="${sid}"]`);if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.style.outline='3px solid var(--gold)';setTimeout(()=>card.style.outline='',2000);}return;}
  if(e.target.id==="clearSlot"){selectedDayIdx=null;if(viewMode==="random")computeRandomPicks();renderCards();return;}
  if(e.target.id==="clearShopSearch"){shopSearchQuery="";const inp=document.getElementById("shopSearchInput");if(inp)inp.value="";e.target.style.display="none";renderCards();return;}
  if(e.target.id==="clearJournalSearch"){journalSearchQuery="";const inp=document.getElementById("journalSearchInput");if(inp)inp.value="";e.target.style.display="none";renderJournal();return;}
  if(e.target.id==="weekPrev"){weekStart.setDate(weekStart.getDate()-7);renderCards();return;}
  if(e.target.id==="weekNext"){weekStart.setDate(weekStart.getDate()+7);renderCards();return;}
  if(e.target.id==="weekToday"){weekStart=startOfWeek(new Date());selectedDayIdx=null;if(viewMode==="random")computeRandomPicks();renderCards();return;}
  const act=e.target.closest("[data-action]");if(act){const id=act.getAttribute("data-id"),a=act.getAttribute("data-action");if(a==="interest"){setStatus(id,{interested:!getStatus(id).interested});renderCards();renderInterestStrip();}else if(a==="visited")openReviewModal(id,null);return;}
  const ri=e.target.closest("[data-remove-interest]");if(ri){setStatus(ri.getAttribute("data-remove-interest"),{interested:false});renderCards();renderInterestStrip();return;}
  const tr=e.target.closest("[data-toggle-reviews]");if(tr){const id=tr.getAttribute("data-toggle-reviews");openReviewsExpanded.has(id)?openReviewsExpanded.delete(id):openReviewsExpanded.add(id);renderCards();return;}
  const tc=e.target.closest("[data-toggle-card]");if(tc){const id=tc.getAttribute("data-toggle-card");expandedCards.has(id)?expandedCards.delete(id):expandedCards.add(id);renderCards();return;}
  const jPrev=e.target.closest("[data-journal-prev]");if(jPrev){const sid=jPrev.getAttribute("data-journal-prev");journalPageIndex[sid]=(journalPageIndex[sid]||0)-1;renderJournal();return;}
  const jNext=e.target.closest("[data-journal-next]");if(jNext){const sid=jNext.getAttribute("data-journal-next");journalPageIndex[sid]=(journalPageIndex[sid]||0)+1;renderJournal();return;}
  const openRec=e.target.closest("[data-open-record]");if(openRec){openRecordViewer(openRec.getAttribute("data-open-record"),openRec.getAttribute("data-rid"));return;}
  if(e.target.id==="closeRecordViewer"||e.target.id==="recordViewerBackdrop"){closeRecordViewer();return;}
  const eb=e.target.closest("[data-edit-review]");if(eb){closeRecordViewer();openReviewModal(eb.getAttribute("data-edit-review"),eb.getAttribute("data-rid"));return;}
  const db=e.target.closest("[data-delete-review]");if(db){const sid=db.getAttribute("data-delete-review"),rid=db.getAttribute("data-rid");showConfirm("確定要刪除這則品飲紀錄嗎？",()=>{closeRecordViewer();deleteReview(sid,rid);});return;}
  if(e.target.id==="modalBackdrop"||e.target.id==="cancelModal"){closeModal();return;}
  if(e.target.id==="saveModal"){saveReview();return;}
  const star=e.target.closest("[data-star]");if(star){modalState.rating=Number(star.getAttribute("data-star"));renderModal();return;}
  if(e.target.id==="addCoffeeBtn"){syncModalFromDOM();modalState.coffees.push(emptyCoffee());renderModal();return;}
  const rc=e.target.closest("[data-remove-coffee]");if(rc){syncModalFromDOM();modalState.coffees=modalState.coffees.filter(c=>c.uid!==rc.getAttribute("data-remove-coffee"));renderModal();return;}
  const rmFlavor=e.target.closest("[data-remove-flavor-tag]");if(rmFlavor){const uid=rmFlavor.getAttribute("data-remove-flavor-tag");const val=rmFlavor.getAttribute("data-flavor-value");const c=modalState.coffees.find(x=>x.uid===uid);if(!c)return;c.flavorTags=(c.flavorTags||[]).filter(t=>t!==val);updateFlavorTagsRow(uid,c);if(flavorWheelInstances[uid])flavorWheelInstances[uid].refresh();return;}
  if(e.target.id==="addSnackBtn"){syncModalFromDOM();modalState.snacks.push(emptySnack());renderModal();return;}
  const rsn=e.target.closest("[data-remove-snack]");if(rsn){syncModalFromDOM();modalState.snacks=modalState.snacks.filter(s=>s.uid!==rsn.getAttribute("data-remove-snack"));renderModal();return;}
  const exp=e.target.closest("[data-export]");if(exp){doExport(exp.getAttribute("data-export"),exp.getAttribute("data-fmt"));return;}
  if(e.target.id==="dataPanelToggle"){const dp=document.getElementById("dataPanel");dp.style.display=dp.style.display==="none"?"block":"none";return;}
  if(e.target.id==="importBtn"){const txt=document.getElementById("importText").value.trim();if(!txt){alert("請貼上 JSON");return;}try{const d=JSON.parse(txt);if(!Array.isArray(d))throw new Error("非陣列");SHOPS=d;activeTags.clear();selectedDayIdx=null;randomPicks=[];if(viewMode==="random")computeRandomPicks();saveState();renderAll();alert("匯入成功！"+d.length+" 間。");}catch(err){alert("JSON 錯誤："+err.message);}return;}
  if(e.target.id==="resetBtn"){if(confirm("清除所有本機資料？")){SHOPS=DEFAULT_SHOPS;statuses={};reviews={};activeTags.clear();selectedDayIdx=null;randomPicks=[];if(viewMode==="random")computeRandomPicks();saveState();renderAll();}return;}
});
document.addEventListener("input",function(e){
  if(e.target.id==="shopSearchInput"){
    shopSearchQuery=e.target.value;
    const clearBtn=document.getElementById("clearShopSearch");
    if(clearBtn) clearBtn.style.display=shopSearchQuery.trim()?"":"none";
    renderCards();
    return;
  }
  if(e.target.id==="journalSearchInput"){
    journalSearchQuery=e.target.value;
    const clearBtn=document.getElementById("clearJournalSearch");
    if(clearBtn) clearBtn.style.display=journalSearchQuery.trim()?"":"none";
    renderJournal();
    return;
  }
  if(e.target.id==="hasSnack"){modalState.hasSnack=e.target.checked;if(modalState.hasSnack&&!modalState.snacks.length)modalState.snacks.push(emptySnack());renderModal();return;}
  const isRadarAxisInput=(TASTING_CONFIG.fields||[]).some(f=>f.type==="radar-axis"&&e.target.matches(`[data-field="${f.key}"]`));
  if(isRadarAxisInput){
    const out=e.target.parentElement.querySelector(`[data-out="${e.target.getAttribute('data-field')}"]`);
    if(out) out.textContent=e.target.value+"/"+e.target.max;
    const block=e.target.closest(".coffee-block");
    if(block){
      const radarEl=block.querySelector("[data-radar-for]");
      if(radarEl) radarEl.innerHTML=radarSVG(TastingForm.readRadarValues(TASTING_CONFIG,block),120);
    }
  }
});
document.getElementById("citySelect").addEventListener("change",function(e){if(e.target.value==="嘉義市")document.getElementById("cityLabel").textContent="嘉義市";});

function setupGanttDragScroll(){
  const wrap=document.getElementById("ganttScroll");
  if(!wrap) return;
  let drag=null;
  wrap.addEventListener("pointerdown",function(e){
    // touch already scrolls natively via CSS overflow; only add JS drag-to-scroll for mouse/pen
    if(e.pointerType==="touch") return;
    drag={pointerId:e.pointerId,startX:e.clientX,startScrollLeft:wrap.scrollLeft,captured:false};
  });
  wrap.addEventListener("pointermove",function(e){
    if(!drag||drag.pointerId!==e.pointerId) return;
    const dx=e.clientX-drag.startX;
    if(!drag.captured&&Math.abs(dx)>6){
      drag.captured=true;
      try{wrap.setPointerCapture(drag.pointerId);}catch(err){}
      wrap.classList.add("gantt-dragging");
    }
    if(drag.captured){
      wrap.scrollLeft=drag.startScrollLeft-dx;
      e.preventDefault();
    }
  });
  function endDrag(e){
    if(drag&&drag.captured){try{wrap.releasePointerCapture(drag.pointerId);}catch(err){}}
    wrap.classList.remove("gantt-dragging");
    drag=null;
  }
  wrap.addEventListener("pointerup",endDrag);
  wrap.addEventListener("pointercancel",endDrag);
  wrap.addEventListener("pointerleave",function(e){ if(drag&&!drag.captured) drag=null; });
}
async function init(){await loadState();tickClock();setInterval(tickClock,30000);viewMode="filtered";requestGeolocation();setupGanttDragScroll();renderAll();}
init();
})();
