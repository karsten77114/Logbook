#!/usr/bin/env python3
"""從 OurAirports 公共領域資料產生 js/data/runways.js（跑道門檻座標表）。

用法：python3 tools/gen_runways.py [工作目錄]
缺 airports.csv / runways.csv 會自動下載到工作目錄（預設 /tmp）。
"""
import csv, math, re, sys, os, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
LOGBOOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

for name in ("airports.csv", "runways.csv"):
    path = os.path.join(BASE, name)
    if not os.path.exists(path):
        url = f"https://davidmegginson.github.io/ourairports-data/{name}"
        print("downloading", url, file=sys.stderr)
        urllib.request.urlretrieve(url, path)

# IATA codes used by the app
src = open(os.path.join(LOGBOOK, "js/data/airports.js"), encoding="utf-8").read()
iata = set(re.findall(r"^  ([A-Z]{3}): \{", src, re.M))
iata |= {"CRK", "CXR"}   # Clark, Cam Ranh (Nha Trang)

# IATA -> ICAO ident
ident_by_iata = {}
with open(os.path.join(BASE, "airports.csv"), encoding="utf-8") as fh:
    for r in csv.DictReader(fh):
        code = (r["iata_code"] or "").strip().upper()
        if code in iata and r["type"] in ("large_airport", "medium_airport", "small_airport"):
            # prefer large > medium > small if duplicates
            rank = {"large_airport": 0, "medium_airport": 1, "small_airport": 2}[r["type"]]
            prev = ident_by_iata.get(code)
            if prev is None or rank < prev[1]:
                ident_by_iata[code] = (r["ident"], rank)
ident_by_iata = {k: v[0] for k, v in ident_by_iata.items()}
# 手動別名：OurAirports 尚未把舊 IATA 掛到新機場
ident_by_iata.setdefault("REP", "VDSA")   # Siem Reap–Angkor Intl（新站，OurAirports 標 SAI）
missing = sorted(iata - set(ident_by_iata))
if missing:
    print("!! no ICAO ident for:", missing, file=sys.stderr)

by_ident = {v: k for k, v in ident_by_iata.items()}


def bearing(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


out = {}
with open(os.path.join(BASE, "runways.csv"), encoding="utf-8") as fh:
    for r in csv.DictReader(fh):
        code = by_ident.get(r["airport_ident"])
        if not code or r["closed"] == "1":
            continue
        ends = []
        for pfx, opp in (("le", "he"), ("he", "le")):
            ident = (r[f"{pfx}_ident"] or "").strip().upper()
            if not ident or ident.startswith("H"):   # skip helipads
                continue
            if not re.match(r"^\d{1,2}[LRCWG]?$", ident):
                continue
            try:
                lat = float(r[f"{pfx}_latitude_deg"]); lon = float(r[f"{pfx}_longitude_deg"])
                olat = float(r[f"{opp}_latitude_deg"]); olon = float(r[f"{opp}_longitude_deg"])
            except (TypeError, ValueError):
                lat = lon = olat = olon = None
            num = int(re.match(r"^(\d{1,2})", ident).group(1))
            if lat is None or olat is None:
                # 無門檻座標（OurAirports 缺資料）→ 只留編號 + 估計方位，供 heading-only 比對
                try:
                    hdg = float(r[f"{pfx}_heading_degT"])
                except (TypeError, ValueError):
                    hdg = float(num * 10 % 360)
                ends.append({"id": ident, "hdg": round(hdg, 1)})
                continue
            # true bearing threshold -> far end (= landing direction)
            hdg = bearing(lat, lon, olat, olon)
            # sanity: designator number should roughly match the geometry (mag var tolerance)
            diff = abs(((num * 10 - hdg + 540) % 360) - 180)
            if diff > 25:
                print(f"!! {code} {ident}: designator vs geometry off by {diff:.0f}deg", file=sys.stderr)
                continue
            ends.append({
                "id": ident,
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "hdg": round(hdg, 1),
                "elat": round(olat, 5),
                "elon": round(olon, 5),
            })
        if ends:
            out.setdefault(code, []).extend(ends)

for code in out:
    out[code].sort(key=lambda e: (int(re.match(r"^(\d+)", e["id"]).group(1)), e["id"]))

print(f"airports: {len(out)}, ends: {sum(len(v) for v in out.values())}", file=sys.stderr)
print("no runway data:", sorted(iata - set(out)), file=sys.stderr)

lines = []
for code in sorted(out):
    parts = []
    for e in out[code]:
        if "lat" in e:
            parts.append("{" + f"id:'{e['id']}',lat:{e['lat']},lon:{e['lon']},hdg:{e['hdg']},elat:{e['elat']},elon:{e['elon']}" + "}")
        else:
            parts.append("{" + f"id:'{e['id']}',hdg:{e['hdg']}" + "}")
    ends = ", ".join(parts)
    lines.append(f"  {code}: [{ends}],")

js = """// ══════════════════════════════════════════════
// 跑道資料：門檻座標 + 真方位（landing direction）
// IATA → [{ id, lat, lon, hdg, elat, elon }]
//   id   跑道編號（含 L/R/C）
//   lat/lon  進場端門檻座標
//   hdg  真方位角（門檻→對面端），非磁方位
//   elat/elon  對面端（stop end）座標，用來算中心線
// 資料來源：OurAirports (public domain)，%s 產生
// 產生腳本：tools/gen_runways.py
// ══════════════════════════════════════════════

export const RUNWAYS = {
%s
}

export function getRunways(iata) {
  return RUNWAYS[(iata || '').toUpperCase()] || null
}
""" % ("2026-07-27", "\n".join(lines))

with open(os.path.join(LOGBOOK, "js/data/runways.js"), "w", encoding="utf-8") as fh:
    fh.write(js)
print("written", os.path.join(LOGBOOK, "js/data/runways.js"), file=sys.stderr)
