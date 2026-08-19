#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sheet-to-json.py — 把 Google Sheet 匯出的店家資料 CSV 轉成網站用的 data/shops.json

使用方式：
    1. 打開你的 Google Sheet，選單「檔案」→「下載」→「逗號分隔值（.csv，目前工作表）」
    2. 執行：
        python3 scripts/sheet-to-json.py 你下載的檔案.csv -o data/shops.json
    3. 檢查終端機印出的統計數字／可疑條目，確認沒有明顯錯誤（尤其是新加的店家）
    4. 把產生的 data/shops.json 覆蓋掉 repo 裡原本的檔案、commit、push
       （如果是用 GitHub Pages，push 完幾分鐘內網站就會用新資料）

CSV 欄位需求（跟原始 Google Sheet 欄位名稱要一致）：
    店名, 地址, 電話, FB網址, IG網址, MAP 網址, 營業時間, 店休時間, tag, 內用/純外帶/提醒事項

營業時間欄位可以是任何常見的中文寫法，例如：
    "11:00-18:00"                                      單一時段，全週套用（再看店休時間欄位排除公休日）
    "週一13:00–18:00/週二-週五14:00–22:00/週六12:00–20:00"  每天分別指定，完整覆蓋一週
    "週五12:00–17:30"                                    只指定某一天（其餘天視為公休）
    "查無資料"                                            完全未知，會標記 irregularClosure=true 並提示去看 FB/IG

店休時間欄位：
    "週二、三"、"週一-三"、"週日至四"等  → 解析成明確公休日（irregularClosure=false）
    "無固定店休"、"依IG公告"、"查無資料"等 → 視為不定休（irregularClosure=true）

這支工具是從實際專案裡處理過的營業時間格式歸納出來的解析邏輯，涵蓋了絕大多數常見寫法，
但中文自由格式終究有解析不完美的邊界情況——**每次轉換後，強烈建議抽查幾間店的營業時間結果**
（尤其是格式比較特殊的新加店家），必要時直接手動修改 data/shops.json 裡那一筆資料即可，
不需要重新跑一次整個轉換。
"""

import csv
import re
import json
import sys
import argparse

WD = {'日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6}
WD_LABEL = ["日", "一", "二", "三", "四", "五", "六"]

CLOSED_UNCLEAR = ['無固定店休', '查無資料', '看ig', '看IG', '依ig公告', '依IG公告', '依粉專公告', '不定休']
CHUNK_RE = re.compile(r'([週星期日一二三四五六至\-、]*?)(\d{1,2}[:：]\d{2})\s*[–\-~]\s*(\d{1,2}[:：]\d{2})')
LATLNG_RE = re.compile(r'@(-?\d+\.\d+),(-?\d+\.\d+)')


def norm_time(t):
    t = t.replace('：', ':').strip()
    h, m = t.split(':')
    return int(h), int(m)


def fmt_time(h, m):
    if h == 0 and m == 0:
        h = 24
    return f"{h:02d}:{m:02d}"


def to_minutes(h, m):
    return h * 60 + m


def parse_daychars(s):
    """把 '一、二、三' / '一-六' / '五六' / '日至四' 這類字串解析成星期幾的集合（0=日...6=六）。"""
    s = s.replace('週', '').replace('星期', '').strip()
    s = s.strip('、-至 ')
    if not s:
        return None
    days = set()
    for g in re.split('、', s):
        g = g.strip()
        if not g:
            continue
        sep = '至' if '至' in g else ('-' if '-' in g else None)
        if sep:
            parts = g.split(sep)
            start_c = next((ch for ch in parts[0] if ch in WD), None)
            end_c = next((ch for ch in parts[-1] if ch in WD), None)
            if start_c and end_c:
                si, ei = WD[start_c], WD[end_c]
                days.update(range(si, ei + 1) if si <= ei else list(range(si, 7)) + list(range(0, ei + 1)))
            else:
                days.update(WD[ch] for ch in g if ch in WD)
        else:
            days.update(WD[ch] for ch in g if ch in WD)
    return sorted(days) if days else None


def parse_hours_text(text):
    """回傳 [(days_or_None, (oh,om), (ch,cm)), ...]，days=None 代表這個時段沒指定星期（全週套用）。"""
    if not text or '查無資料' in text:
        return []
    chunks = []
    for m in CHUNK_RE.finditer(text):
        dayspec, ot, ct = m.groups()
        days = parse_daychars(dayspec) if dayspec else None
        chunks.append((days, norm_time(ot), norm_time(ct)))
    return chunks


def merge_range(existing, new_o, new_c):
    oh, om = new_o
    ch, cm = new_c
    if ch == 0 and cm == 0:
        ch = 24  # 跨午夜的收店時間一律視為當天 24:00 截止
    if existing is None:
        return (oh, om, ch, cm)
    eoh, eom, ech, ecm = existing
    no = min(to_minutes(oh, om), to_minutes(eoh, eom))
    nc = max(to_minutes(ch, cm), to_minutes(ech, ecm))
    return (no // 60, no % 60, nc // 60, nc % 60)


def parse_closure_days(text):
    if not text:
        return None
    t = text.strip()
    for u in CLOSED_UNCLEAR:
        if t == u or (t.startswith(u) and not t.replace(u, '').strip('，, ')):
            return None
    if any(ch in t for ch in ['週', '星期']) or any(ch in WD for ch in t):
        if t.startswith('除'):
            return 'EXCEPT_HANDLED'  # 「除週X都休」這種，已經被完整的逐日營業時間涵蓋，這裡不重複處理
        days = parse_daychars(t)
        return set(days) if days else None
    return None


def build_hours(hours_text, closure_text):
    """回傳 (week_dict, unknown, has_dayspecific)。week_dict: {0..6: (oh,om,ch,cm)|None}"""
    chunks = parse_hours_text(hours_text)
    has_dayspecific = any(c[0] is not None for c in chunks)
    week = {d: None for d in range(7)}

    if not chunks:
        return week, True, False

    if has_dayspecific:
        default = None
        for days, o, c in chunks:
            if days is None:
                default = merge_range(default, o, c)
        if default:
            for d in range(7):
                week[d] = default
        for days, o, c in chunks:
            if days is not None:
                for d in days:
                    week[d] = merge_range(week[d], o, c)
    else:
        default = None
        for days, o, c in chunks:
            default = merge_range(default, o, c)
        for d in range(7):
            week[d] = default
        closed = parse_closure_days(closure_text)
        if closed and closed != 'EXCEPT_HANDLED':
            for d in closed:
                week[d] = None

    return week, False, has_dayspecific


def clean_phone(phone_raw):
    """回傳 (phone, phone_note)。查無資料/無電話類文字會清成空字串，並在 phone_note 附上說明。"""
    phone_raw = (phone_raw or '').strip()
    if not phone_raw or '查無資料' in phone_raw or '查無電話' in phone_raw:
        return '', ''
    if '無電話' in phone_raw:
        m = re.search(r'（(.*?)）|\((.*?)\)', phone_raw)
        note = '無電話，' + (m.group(1) or m.group(2)) if m else '無電話'
        return '', note
    return phone_raw, ''


def clean_link(raw):
    raw = (raw or '').strip()
    return '' if ('查無資料' in raw or not raw) else raw


def extract_latlng(map_url):
    m = LATLNG_RE.search(map_url or '')
    if m:
        return float(m.group(1)), float(m.group(2))
    return None, None


def parse_row(i, row, city):
    name = (row.get('店名') or '').strip()
    addr = (row.get('地址') or '').strip()
    phone, phone_note = clean_phone(row.get('電話'))
    fb = clean_link(row.get('FB網址'))
    ig = clean_link(row.get('IG網址'))
    map_url = (row.get('MAP 網址') or '').strip()
    hours_text = (row.get('營業時間') or '').strip()
    closure_text = (row.get('店休時間') or '').strip()
    tags_raw = (row.get('tag') or '').strip()
    tags = [t.lstrip('#').strip().strip('()（）?？') for t in tags_raw.split() if t.strip().lstrip('#').strip()]
    tags = [t for t in tags if t]
    extra_note = (row.get('內用/純外帶/提醒事項') or '').strip()

    week, unknown, has_dayspecific = build_hours(hours_text, closure_text)

    week_json = {}
    for d in range(7):
        if week[d] is None:
            week_json[str(d)] = None
        else:
            oh, om, ch, cm = week[d]
            week_json[str(d)] = {"open": fmt_time(oh, om), "close": fmt_time(ch, cm)}

    note_parts = []
    irregular = False
    if unknown:
        note_parts.append("營業時間請洽 FB/IG 或 Google 地圖")
        irregular = True
    elif has_dayspecific:
        closed_days = [d for d in range(7) if week[d] is None]
        if closed_days:
            note_parts.append("公休：" + "、".join("週" + WD_LABEL[d] for d in closed_days))
    else:
        closed = parse_closure_days(closure_text)
        if closed and closed != 'EXCEPT_HANDLED':
            note_parts.append("公休：" + "、".join("週" + WD_LABEL[d] for d in sorted(closed)))
        elif closure_text == '無固定店休':
            note_parts.append("無固定公休，請以最新公告為準")
            irregular = True
        elif closure_text and closure_text != '查無資料':
            note_parts.append(f"店休：{closure_text}")
            irregular = True
        else:
            irregular = True
    if phone_note:
        note_parts.append(phone_note)

    lat, lng = extract_latlng(map_url)

    return {
        "id": f"s{i}",
        "city": city,
        "name": name,
        "address": addr,
        "phone": phone,
        "fb": fb,
        "ig": ig,
        "mapUrl": map_url,
        "lat": lat,
        "lng": lng,
        "tags": tags,
        "hoursByWeekday": week_json,
        "noteOnClosure": "；".join(note_parts),
        "extraNote": extra_note,
        "irregularClosure": irregular,
    }


def main():
    ap = argparse.ArgumentParser(description="把 Google Sheet 匯出的店家 CSV 轉成 data/shops.json")
    ap.add_argument("csv_path", help="輸入的 CSV 檔案路徑")
    ap.add_argument("-o", "--output", default="data/shops.json", help="輸出的 JSON 路徑（預設 data/shops.json）")
    ap.add_argument("--city", default="嘉義市", help="這批資料的縣市名稱（預設 嘉義市）")
    ap.add_argument("--id-prefix", default="s", help="店家 id 前綴（預設 s，會產生 s1, s2, ...）")
    args = ap.parse_args()

    with open(args.csv_path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        required = {'店名', '地址', '電話', 'FB網址', 'IG網址', 'MAP 網址', '營業時間', '店休時間', 'tag'}
        missing = required - set(reader.fieldnames or [])
        if missing:
            print(f"⚠️  警告：CSV 缺少欄位 {missing}，這些欄位會視為空值處理", file=sys.stderr)
        rows = list(enumerate(reader, 1))

    results = [parse_row(i, row, args.city) for i, row in rows]
    for i, r in enumerate(results, 1):
        r["id"] = f"{args.id_prefix}{i}"

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    # 統計摘要，方便快速抽查
    total = len(results)
    unknown_hours = sum(1 for r in results if r["noteOnClosure"].startswith("營業時間請洽"))
    irregular = sum(1 for r in results if r["irregularClosure"])
    no_latlng = sum(1 for r in results if r["lat"] is None)
    no_phone = sum(1 for r in results if not r["phone"])

    print(f"✅ 完成：共 {total} 間店家 → {args.output}")
    print(f"   - 營業時間完全未知：{unknown_hours} 間")
    print(f"   - 不定休（irregularClosure=true）：{irregular} 間")
    print(f"   - 沒有解析出經緯度（Google 地圖連結格式特殊）：{no_latlng} 間")
    print(f"   - 沒有電話：{no_phone} 間")
    if no_latlng:
        print("     沒有經緯度的店家：" + "、".join(r["name"] for r in results if r["lat"] is None))
    print("\n建議打開 data 目錄下輸出的 JSON，抽查幾間新加或格式特殊的店家，確認營業時間解析正確。")


if __name__ == "__main__":
    main()
