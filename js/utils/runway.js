// ══════════════════════════════════════════════
// 落地跑道判定（由 ADS-B 航跡推算）
// ══════════════════════════════════════════════
//
// v99 改寫：改用「跑道門檻座標 + 延伸中心線側向偏移」判定，取代舊的純航向比對。
// 舊法的三個錯誤來源：
//   1. 只比對進場航向 → 平行跑道（05L/05R）方位完全相同，永遠選到清單第一條
//      （TPE 幾乎都被判成 23L）
//   2. 舊表存的是磁方位，航跡算出來的是真方位，本身就差好幾度
//   3. 比不中時用「航向 ÷ 10」瞎猜，猜出該機場根本不存在的跑道號
// 現在：
//   1. 用側向偏移（cross-track）挑平行跑道中最接近的那條 → L/R/C 才可能對
//   2. 全部用真方位（runways.js 的 hdg 由兩端門檻座標算出）
//   3. 判不出來就回 null，不猜——寧可留空讓使用者自己填，也不要填錯的跑道

import { getRunways } from '../data/runways.js'

const R_EARTH = 6371000    // m
const D2R = Math.PI / 180

/** 真方位角 p1 → p2（0–360） */
export function bearingDeg(p1, p2) {
  const y = Math.sin((p2.lo - p1.lo) * D2R) * Math.cos(p2.la * D2R)
  const x = Math.cos(p1.la * D2R) * Math.sin(p2.la * D2R) -
            Math.sin(p1.la * D2R) * Math.cos(p2.la * D2R) * Math.cos((p2.lo - p1.lo) * D2R)
  return (Math.atan2(y, x) / D2R + 360) % 360
}

/** great-circle 距離（公尺） */
function distM(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * D2R
  const dLon = (lon2 - lon1) * D2R
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * 點相對於「門檻 + 真方位」這條延伸中心線的位置。
 * @returns {{cross:number, along:number}} cross=側向偏移絕對值(m)；
 *          along=沿跑道方向距離(m)，負值＝門檻外（還在進場），正值＝已越過門檻
 */
function trackOffsets(p, thrLat, thrLon, hdgDeg) {
  const d = distM(thrLat, thrLon, p.la, p.lo)
  if (d === 0) return { cross: 0, along: 0 }
  const brg = bearingDeg({ la: thrLat, lo: thrLon }, { la: p.la, lo: p.lo })
  const dTheta = (brg - hdgDeg) * D2R
  return { cross: Math.abs(d * Math.sin(dTheta)), along: d * Math.cos(dTheta) }
}

/** 兩個方位角的最小夾角（0–180） */
function angDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180)
}

/**
 * 由 ADS-B 航跡判定落地跑道。
 * @param {Array}  track    [{t,la,lo,a,s}]（a = 高度 ft，t = epoch 秒）
 * @param {string} destIata 目的地 IATA
 * @returns {string|null} 跑道編號（如 '23R'）；判不出來回 null（不猜）
 */
export function detectRunway(track, destIata) {
  if (!track?.length) return null
  const runways = getRunways(destIata)
  if (!runways?.length) return null    // 沒有該機場跑道資料 → 不猜

  // 最後一個空中點（>100 ft）當作觸地時間基準
  let lastAirIdx = -1
  for (let i = track.length - 1; i >= 0; i--) {
    if (track[i].a > 100) { lastAirIdx = i; break }
  }
  if (lastAirIdx < 5) return null
  const tLand = track[lastAirIdx].t

  // 最後進場段：觸地前 5 分鐘、2500 ft 以下（不含地面滑行）
  let approach = track.filter(p =>
    p.t >= tLand - 300 && p.t <= tLand && p.a < 2500 && p.a > 50
  )
  if (approach.length < 4) {
    approach = track.filter(p => p.t >= tLand - 420 && p.t <= tLand && p.a < 5000 && p.a > 50)
  }
  if (approach.length < 3) return null

  // 進場平均航跡（真方位，circular mean）
  let sinS = 0, cosS = 0
  for (let i = 1; i < approach.length; i++) {
    const r = bearingDeg(approach[i - 1], approach[i]) * D2R
    sinS += Math.sin(r); cosS += Math.cos(r)
  }
  const avgBearing = (Math.atan2(sinS, cosS) / D2R + 360) % 360

  // ── 1. 有門檻座標 → 用側向偏移挑（能分辨 L/R/C）
  let best = null, bestCross = Infinity
  for (const rw of runways) {
    if (rw.lat == null) continue
    if (angDiff(avgBearing, rw.hdg) > 30) continue      // 航向對不上就跳過
    // 只取「門檻外 15 km 內～門檻後 2 km」的點，避免用到 downwind/base
    const seg = approach
      .map(p => trackOffsets(p, rw.lat, rw.lon, rw.hdg))
      .filter(o => o.along > -15000 && o.along < 2000)
    if (seg.length < 3) continue
    // 取最靠近門檻的一半算中位數偏移（越靠近越能分辨平行跑道）
    seg.sort((a, b) => b.along - a.along)
    const near = seg.slice(0, Math.max(3, Math.ceil(seg.length / 2)))
                    .map(o => o.cross).sort((a, b) => a - b)
    const median = near[Math.floor(near.length / 2)]
    if (median < bestCross) { bestCross = median; best = rw.id }
  }
  // 側向偏移 1 km 內才算數（平行跑道間距通常 ≥1.3 km）
  if (best && bestCross < 1000) return best

  // ── 2. 沒門檻座標的機場（OurAirports 缺資料）→ 只能比航向，且必須唯一才採用
  const byHdg = runways.filter(rw => rw.lat == null && angDiff(avgBearing, rw.hdg) <= 25)
  if (byHdg.length === 1) return byHdg[0].id

  return null    // 判不出來就留空，不要填錯的跑道
}
