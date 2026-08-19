/*!
 * FlavorWheel — 可拖曳旋轉的半圓風味輪元件（SCA Coffee Taster's Flavor Wheel 三層中文化資料 + 通用互動邏輯）
 * 無外部依賴，純 JS + SVG。搭配 flavor-wheel.css 使用。
 *
 * 用法：
 *   const wheel = FlavorWheel.create(containerEl, {
 *     getTags:  () => currentTagArray,       // 回傳目前已選的風味（中文字串陣列）
 *     onToggle: (leaf) => { ... },           // 使用者加入／移除某個細項時呼叫，leaf = {zh,en,catZh,catEn,subZh,subEn}
 *     startCategory: '花香'                   // 選填：初始指標指向哪個大分類（預設 FLAVOR_TREE 第一項）
 *   });
 *   // 當外部的 tags 狀態改變（例如從別處刪除了某個標籤）時，呼叫：
 *   wheel.refresh();
 *
 * 設計重點（從實際專案中萃取出的經驗）：
 *   - 圓心刻意畫在 SVG viewBox 右側（WHEEL_CX 接近 viewBox 寬度），只讓左半圓落在可視範圍內，
 *     不需要真的去裁切扇形路徑，SVG 預設就會裁掉超出 viewBox 的部分。
 *   - 「指標」不是畫出來的圖案在動，而是固定在 270°（正左方）方向，改成用 CSS transform: rotate()
 *     去轉動整個 <g> 群組；要找目前指到誰，反推 effectiveAngle = 270 − rotation 即可，
 *     不需要每次旋轉都重繪 SVG（效能好、拖曳才會滑順）。
 *   - 三層（大分類／中分類／細項）角度只需算一次並快取（見 computeAngles），拖曳/旋轉時純查表。
 *   - 左側文字說明區塊務必和中間的虛線指標線保持垂直間距（本元件用 padding-top 及較緊的行距做到），
 *     不然文字最後一行會被指標線「切過去」，是最容易被忽略的視覺 bug。
 *   - 旋轉用 CSS transition 只在「動畫式」旋轉（滾輪、上一個/下一個按鈕）時開啟；
 *     手指/滑鼠拖曳時要關閉 transition（transition:none），否則拖曳會有延遲感、跟不上手指。
 */
(function(global){
"use strict";

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

/* ===== SCA Coffee Taster's Flavor Wheel（2016, SCA/WCR）三層中文化資料 =====
   要做別的主題風味輪（例如茶、酒、威士忌），把這個陣列換掉即可，
   結構固定為：[{en,zh,color,subs:[{en,zh,items:[{en,zh}, ...]}, ...]}, ...] */
const SCA_FLAVOR_TREE=[
 {en:"Fruity",zh:"水果調",color:"#E0507A",subs:[
   {en:"Berry",zh:"莓果",items:[{en:"Blackberry",zh:"黑莓"},{en:"Raspberry",zh:"覆盆莓"},{en:"Blueberry",zh:"藍莓"},{en:"Strawberry",zh:"草莓"}]},
   {en:"Dried Fruit",zh:"果乾",items:[{en:"Raisin",zh:"葡萄乾"},{en:"Prune",zh:"黑棗"}]},
   {en:"Other Fruit",zh:"其他水果",items:[{en:"Coconut",zh:"椰子"},{en:"Cherry",zh:"櫻桃"},{en:"Pomegranate",zh:"石榴"},{en:"Pineapple",zh:"鳳梨"},{en:"Grape",zh:"葡萄"},{en:"Apple",zh:"蘋果"},{en:"Peach",zh:"水蜜桃"},{en:"Pear",zh:"梨"}]},
   {en:"Citrus Fruit",zh:"柑橘",items:[{en:"Grapefruit",zh:"葡萄柚"},{en:"Orange",zh:"柳橙"},{en:"Lemon",zh:"檸檬"},{en:"Lime",zh:"萊姆"}]}
 ]},
 {en:"Sour/Fermented",zh:"酸味／發酵",color:"#B7A233",subs:[
   {en:"Sour",zh:"酸味",items:[{en:"Sour Aromatics",zh:"酸香氣"},{en:"Acetic Acid",zh:"醋酸"},{en:"Butyric Acid",zh:"丁酸"},{en:"Isovaleric Acid",zh:"異戊酸"},{en:"Citric Acid",zh:"檸檬酸"},{en:"Malic Acid",zh:"蘋果酸"}]},
   {en:"Alcohol/Fermented",zh:"酒精／發酵",items:[{en:"Winey",zh:"酒香"},{en:"Whiskey",zh:"威士忌"},{en:"Fermented",zh:"發酵味"},{en:"Overripe",zh:"過熟"}]}
 ]},
 {en:"Green/Vegetative",zh:"生青／植物",color:"#4C9A4A",subs:[
   {en:"Olive Oil",zh:"橄欖油",items:[{en:"Olive Oil",zh:"橄欖油"}]},
   {en:"Raw",zh:"生澀",items:[{en:"Raw",zh:"生澀"}]},
   {en:"Green/Vegetative",zh:"生青植物感",items:[{en:"Under-ripe",zh:"未熟"},{en:"Peapod",zh:"豆莢"},{en:"Fresh",zh:"新鮮"},{en:"Dark Green",zh:"深綠"},{en:"Vegetative",zh:"植物感"},{en:"Hay-like",zh:"乾草感"},{en:"Herb-like",zh:"草本感"}]},
   {en:"Beany",zh:"豆腥",items:[{en:"Beany",zh:"豆腥"}]}
 ]},
 {en:"Other",zh:"其他",color:"#8C8C8C",subs:[
   {en:"Papery/Musty",zh:"紙味／霉味",items:[{en:"Stale",zh:"陳腐"},{en:"Cardboard",zh:"紙板味"},{en:"Papery",zh:"紙味"},{en:"Woody",zh:"木質"},{en:"Moldy/Damp",zh:"潮濕霉味"},{en:"Musty/Dusty",zh:"塵霉味"},{en:"Musty/Earthy",zh:"土霉味"},{en:"Animalic",zh:"動物感"}]},
   {en:"Chemical",zh:"化學感",items:[{en:"Rubber",zh:"橡膠味"},{en:"Skunky",zh:"臭鼬味"},{en:"Petroleum",zh:"石油味"},{en:"Medicinal",zh:"藥感"}]}
 ]},
 {en:"Roasted",zh:"烘焙調",color:"#6B4423",subs:[
   {en:"Pipe Tobacco",zh:"菸斗菸草",items:[{en:"Pipe Tobacco",zh:"菸斗菸草"}]},
   {en:"Tobacco",zh:"菸草",items:[{en:"Tobacco",zh:"菸草"}]},
   {en:"Burnt",zh:"焦感",items:[{en:"Acrid",zh:"刺激嗆味"},{en:"Ashy",zh:"灰燼感"},{en:"Smoky",zh:"煙燻"},{en:"Brown, Roast",zh:"焦褐烘焙感"}]},
   {en:"Cereal",zh:"穀物調",items:[{en:"Grain",zh:"穀物"},{en:"Malt",zh:"麥芽"}]}
 ]},
 {en:"Spices",zh:"香料",color:"#C97A3B",subs:[
   {en:"Pungent",zh:"辛辣感",items:[{en:"Pungent",zh:"辛辣感"}]},
   {en:"Pepper",zh:"胡椒",items:[{en:"Pepper",zh:"胡椒"}]},
   {en:"Brown Spice",zh:"褐色香料",items:[{en:"Anise",zh:"八角"},{en:"Nutmeg",zh:"肉荳蔻"},{en:"Cinnamon",zh:"肉桂"},{en:"Clove",zh:"丁香"}]}
 ]},
 {en:"Nutty/Cocoa",zh:"堅果／可可",color:"#8A5A34",subs:[
   {en:"Nutty",zh:"堅果",items:[{en:"Peanuts",zh:"花生"},{en:"Hazelnut",zh:"榛果"},{en:"Almond",zh:"杏仁"}]},
   {en:"Cocoa",zh:"可可",items:[{en:"Chocolate",zh:"巧克力"},{en:"Dark Chocolate",zh:"黑巧克力"}]}
 ]},
 {en:"Sweet",zh:"甜感",color:"#D9A441",subs:[
   {en:"Brown Sugar",zh:"黑糖調",items:[{en:"Molasses",zh:"糖蜜"},{en:"Maple Syrup",zh:"楓糖漿"},{en:"Caramelized",zh:"焦糖化"},{en:"Honey",zh:"蜂蜜"}]},
   {en:"Vanilla",zh:"香草",items:[{en:"Vanillin",zh:"香草醛"},{en:"Vanilla",zh:"香草"}]},
   {en:"Overall Sweet",zh:"整體甜感",items:[{en:"Overall Sweet",zh:"整體甜感"}]},
   {en:"Sweet Aromatics",zh:"甜香氣",items:[{en:"Sweet Aromatics",zh:"甜香氣"}]}
 ]},
 {en:"Floral",zh:"花香",color:"#B06BB0",subs:[
   {en:"Floral",zh:"花香",items:[{en:"Chamomile",zh:"洋甘菊"},{en:"Rose",zh:"玫瑰"},{en:"Jasmine",zh:"茉莉"}]},
   {en:"Black Tea",zh:"紅茶",items:[{en:"Black Tea",zh:"紅茶"}]}
 ]}
];

function polarXY(cx,cy,r,deg){const a=(deg-90)*Math.PI/180;return[cx+r*Math.cos(a),cy+r*Math.sin(a)];}
function donutSegPath(cx,cy,rIn,rOut,a0,a1){
  const large=(a1-a0)>180?1:0;
  const[x1,y1]=polarXY(cx,cy,rOut,a0),[x2,y2]=polarXY(cx,cy,rOut,a1),[x3,y3]=polarXY(cx,cy,rIn,a1),[x4,y4]=polarXY(cx,cy,rIn,a0);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${rOut},${rOut} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${rIn},${rIn} 0 ${large} 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`;
}

/* 幾何常數：圓心置於畫布右側，向左展開成半圓。viewBox 寬度需 >= WHEEL_CX，高度需 >= WHEEL_CY*2 */
const WHEEL_CX=280,WHEEL_CY=280,WHEEL_R0=40,WHEEL_R1=130,WHEEL_R2=200,WHEEL_R3=262;
const WHEEL_VIEWBOX_W=300,WHEEL_VIEWBOX_H=560;

function computeAngles(tree){
  const totalLeaves=tree.reduce((s,cat)=>s+cat.subs.reduce((s2,su)=>s2+su.items.length,0),0);
  const catAngles=[],subAngles=[],leafAngles=[];
  let angle=0;
  tree.forEach(cat=>{
    const catLeaves=cat.subs.reduce((s,su)=>s+su.items.length,0);
    const catAngle=catLeaves/totalLeaves*360,catStart=angle,catEnd=angle+catAngle;
    catAngles.push({a0:catStart,a1:catEnd,zh:cat.zh,en:cat.en,color:cat.color});
    let subCur=catStart;
    cat.subs.forEach(su=>{
      const subAngle=su.items.length/catLeaves*catAngle,subStart=subCur,subEnd=subCur+subAngle;
      subAngles.push({a0:subStart,a1:subEnd,zh:su.zh,en:su.en,color:cat.color,catZh:cat.zh,catEn:cat.en});
      let leafCur=subStart;const leafAngle=subAngle/su.items.length;
      su.items.forEach(leaf=>{
        const leafStart=leafCur,leafEnd=leafCur+leafAngle;
        leafAngles.push({a0:leafStart,a1:leafEnd,zh:leaf.zh,en:leaf.en,color:cat.color,catZh:cat.zh,catEn:cat.en,subZh:su.zh,subEn:su.en});
        leafCur=leafEnd;
      });
      subCur=subEnd;
    });
    angle=catEnd;
  });
  return{catAngles,subAngles,leafAngles};
}

function buildWheelSVGInner(angles,tags){
  const cx=WHEEL_CX,cy=WHEEL_CY,r0=WHEEL_R0,r1=WHEEL_R1,r2=WHEEL_R2,r3=WHEEL_R3;let html="";
  angles.catAngles.forEach(cat=>{
    html+=`<path class="fw-seg fw-cat" d="${donutSegPath(cx,cy,r0,r1,cat.a0,cat.a1)}" fill="${cat.color}" data-zh="${esc(cat.zh)}" data-en="${esc(cat.en)}"/>`;
    if(cat.a1-cat.a0>16){const m=(cat.a0+cat.a1)/2,[lx,ly]=polarXY(cx,cy,(r0+r1)/2,m);html+=`<text class="fw-label fw-cat-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${esc(cat.zh)}</text>`;}
  });
  angles.subAngles.forEach(su=>{
    html+=`<path class="fw-seg fw-sub" d="${donutSegPath(cx,cy,r1,r2,su.a0,su.a1)}" fill="${su.color}" fill-opacity=".68" data-zh="${esc(su.zh)}" data-en="${esc(su.en)}"/>`;
    if(su.a1-su.a0>13){const m=(su.a0+su.a1)/2,[lx,ly]=polarXY(cx,cy,(r1+r2)/2,m);html+=`<text class="fw-label fw-sub-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${esc(su.zh)}</text>`;}
  });
  angles.leafAngles.forEach(leaf=>{
    const active=tags.includes(leaf.zh);
    html+=`<path class="fw-seg fw-leaf${active?' active':''}" d="${donutSegPath(cx,cy,r2,r3,leaf.a0,leaf.a1)}" fill="${leaf.color}" fill-opacity="${active?1:.42}" data-zh="${esc(leaf.zh)}" data-en="${esc(leaf.en)}"/>`;
    if(leaf.a1-leaf.a0>5.5){const m=(leaf.a0+leaf.a1)/2,[lx,ly]=polarXY(cx,cy,(r2+r3)/2,m);html+=`<text class="fw-label fw-leaf-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${esc(leaf.zh)}</text>`;}
  });
  return html;
}

let instanceCounter=0;

/**
 * 建立一個風味輪元件實例。
 * @param {HTMLElement} container - 要掛載元件的空容器
 * @param {Object} opts
 * @param {Array}    [opts.data]          - 自訂風味資料樹（預設用 SCA 咖啡風味輪）
 * @param {Function} [opts.getTags]       - () => string[]，回傳目前已選中文標籤陣列（預設回傳 [] ）
 * @param {Function} [opts.onToggle]      - (leaf) => void，使用者切換某細項時呼叫
 * @param {string}   [opts.startCategory] - 初始指標指向的大分類中文名稱
 * @returns {{refresh:Function, getPointerLeaf:Function, setRotation:Function, destroy:Function}}
 */
function create(container,opts){
  opts=opts||{};
  const tree=opts.data||SCA_FLAVOR_TREE;
  const getTags=opts.getTags||(()=>[]);
  const onToggle=opts.onToggle||function(){};
  const allowCustomTags=opts.allowCustomTags!==false; // 預設開啟，可用 allowCustomTags:false 關閉
  const angles=computeAngles(tree);
  const uid="fw"+(++instanceCounter);
  let rotation=0;
  if(opts.startCategory){
    const firstLeaf=angles.leafAngles.find(l=>l.catZh===opts.startCategory);
    if(firstLeaf)rotation=270-(firstLeaf.a0+firstLeaf.a1)/2;
  }

  function findLeafAtAngle(effAngle){
    effAngle=((effAngle%360)+360)%360;
    return angles.leafAngles.find(l=>effAngle>=l.a0&&effAngle<l.a1)||angles.leafAngles[0];
  }
  function pointerLeaf(){return findLeafAtAngle(270-rotation);}

  function labelHTML(){
    const leaf=pointerLeaf(),on=getTags().includes(leaf.zh);
    return `<div class="fw-crumb">${esc(leaf.catZh)} › ${esc(leaf.subZh)}</div>
      <div class="fw-main">${esc(leaf.zh)}<span class="fw-en">${esc(leaf.en)}</span></div>
      <div class="fw-nav-btns">
        <button type="button" class="fw-nav-btn" data-fw-step="-1" title="上一個風味">◀</button>
        <button type="button" class="fw-nav-btn" data-fw-step="1" title="下一個風味">▶</button>
      </div>
      <button type="button" class="fw-add-btn ${on?'on':''}" data-fw-add="1">${on?'✓ 已加入':'＋ 加入標籤'}</button>`;
  }

  container.innerHTML=`<div class="fw-shell">
    <div class="fw-wrap">
      <div class="fw-side-label"></div>
      <div class="fw-pointer-line"></div>
      <div class="fw-clip">
        <svg viewBox="0 0 ${WHEEL_VIEWBOX_W} ${WHEEL_VIEWBOX_H}" xmlns="http://www.w3.org/2000/svg">
          <g class="fw-rotor" style="transform-origin:${WHEEL_CX}px ${WHEEL_CY}px;transform:rotate(${rotation}deg);">${buildWheelSVGInner(angles,getTags())}</g>
        </svg>
      </div>
    </div>
    <div class="fw-hint">👆 直接<b>拖曳</b>風味輪（或滑鼠滾輪／◀▶按鈕）旋轉，指標對到的風味會即時顯示在左側；也可直接點選任一圈文字加入標籤</div>
    ${allowCustomTags?`<div class="fw-custom-row">
      <input type="text" class="fw-custom-input" placeholder="輪上沒有？自己輸入，例如：梔子花、杏桃"/>
      <button type="button" class="fw-custom-add">＋ 加入</button>
    </div>`:""}
  </div>`;

  const els={
    label:container.querySelector(".fw-side-label"),
    clip:container.querySelector(".fw-clip"),
    rotor:container.querySelector(".fw-rotor"),
    svg:container.querySelector("svg")
  };
  els.label.innerHTML=labelHTML();

  function setRotation(deg,animate){
    rotation=deg;
    els.rotor.style.transition=animate?"transform .4s cubic-bezier(.22,.8,.2,1)":"none";
    els.rotor.style.transform=`rotate(${deg}deg)`;
    els.label.innerHTML=labelHTML();
  }
  function step(dir){
    const cur=pointerLeaf(),idx=angles.leafAngles.indexOf(cur),n=angles.leafAngles.length;
    const next=angles.leafAngles[((idx+dir)%n+n)%n],mid=(next.a0+next.a1)/2;
    let rot=270-mid;
    while(rot-rotation>180)rot-=360;while(rot-rotation<-180)rot+=360;
    setRotation(rot,true);
  }
  function refresh(){
    // 標籤集合可能在外部被改變（例如從別處刪除了標籤），重繪整個輪盤與左側文字
    els.rotor.innerHTML=buildWheelSVGInner(angles,getTags());
    els.label.innerHTML=labelHTML();
  }
  function toggleLeafEl(zh){
    const leafEl=els.rotor.querySelector(`.fw-seg.fw-leaf[data-zh="${CSS.escape(zh)}"]`);
    if(leafEl){leafEl.classList.toggle("active");leafEl.setAttribute("fill-opacity",leafEl.classList.contains("active")?"1":".42");}
  }

  // 拖曳旋轉（Pointer Events，滑鼠與觸控通用）
  // 注意：只有在位移超過門檻、確定是「拖曳」而非單純點擊時才 setPointerCapture，
  // 否則單純點擊（tap）也會被 capture 攔截，導致點擊事件的 target 被錯誤導向成 clip 本身，
  // 使「點選細項加標籤」失效。
  let drag=null;
  els.clip.addEventListener("pointerdown",function(e){
    drag={pointerId:e.pointerId,startY:e.clientY,startRotation:rotation,captured:false};
  });
  els.clip.addEventListener("pointermove",function(e){
    if(!drag)return;
    const dy=e.clientY-drag.startY;
    if(!drag.captured&&Math.abs(dy)>4){
      drag.captured=true;
      try{els.clip.setPointerCapture(drag.pointerId);}catch(err){}
    }
    if(drag.captured)setRotation(drag.startRotation+dy*0.6,false);
  });
  els.clip.addEventListener("pointerup",function(e){
    if(drag&&drag.captured){try{els.clip.releasePointerCapture(e.pointerId);}catch(err){}}
    drag=null;
  });
  els.clip.addEventListener("pointercancel",function(){drag=null;});
  // 滑鼠滾輪旋轉（帶動畫）
  els.clip.addEventListener("wheel",function(e){
    e.preventDefault();
    setRotation(rotation+e.deltaY*0.35,true);
  },{passive:false});
  // 點擊最外圈細項／上一個下一個按鈕／加入標籤按鈕
  container.addEventListener("click",function(e){
    const leafEl=e.target.closest(".fw-seg.fw-leaf");
    if(leafEl){const zh=leafEl.getAttribute("data-zh");onToggle(findLeafByZh(zh));toggleLeafEl(zh);els.label.innerHTML=labelHTML();return;}
    const stepBtn=e.target.closest("[data-fw-step]");
    if(stepBtn){step(Number(stepBtn.getAttribute("data-fw-step")));return;}
    const addBtn=e.target.closest("[data-fw-add]");
    if(addBtn){const leaf=pointerLeaf();onToggle(leaf);toggleLeafEl(leaf.zh);els.label.innerHTML=labelHTML();return;}
  });
  function findLeafByZh(zh){return angles.leafAngles.find(l=>l.zh===zh);}

  // 自訂標籤：不在輪盤上的風味，讓使用者自己輸入文字加入。
  // 呼叫 onToggle 時帶一個「假的 leaf 物件」，欄位形狀跟真的細項一樣（多一個 custom:true 可供分辨），
  // 這樣外部的 onToggle 邏輯（通常只是讀 leaf.zh 去操作陣列）完全不用另外寫特殊分支。
  function addCustomTag(text){
    const val=String(text||"").trim();if(!val)return;
    onToggle({zh:val,en:"",catZh:"自訂",catEn:"Custom",subZh:"自訂",subEn:"Custom",custom:true});
  }
  if(allowCustomTags){
    const input=container.querySelector(".fw-custom-input"),addBtn=container.querySelector(".fw-custom-add");
    function submit(){addCustomTag(input.value);input.value="";}
    addBtn.addEventListener("click",submit);
    input.addEventListener("keydown",function(e){if(e.key==="Enter")submit();});
  }

  function destroy(){container.innerHTML="";}

  return{refresh,getPointerLeaf:pointerLeaf,setRotation:d=>setRotation(d,true),addCustomTag,destroy};
}

global.FlavorWheel={create,SCA_FLAVOR_TREE,computeAngles};

})(typeof window!=="undefined"?window:this);
