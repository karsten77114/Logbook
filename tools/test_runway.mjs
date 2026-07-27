// 執行：node tools/test_runway.mjs（不需任何套件）
// 用合成進場航跡驗證 detectRunway：從門檻沿延伸中心線往外推點，看能不能挑對跑道
import { detectRunway } from '../js/utils/runway.js'
import { RUNWAYS } from '../js/data/runways.js'

const D2R = Math.PI / 180
const R = 6371000

// 從 (lat,lon) 沿 brg 走 dist 公尺
function dest(lat, lon, brg, dist) {
  const d = dist / R, t = brg * D2R, p1 = lat * D2R, l1 = lon * D2R
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t))
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1),
                             Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  return [p2 / D2R, l2 / D2R]
}

/** 造一條 12 NM 直線最後進場 + 觸地，帶 GPS 噪聲與航向噪聲 */
function synth(rw, { noiseM = 30, hdgErr = 0, seed = 1 } = {}) {
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5 }
  const pts = []
  const t0 = 1750000000
  // 從 22 km 外進場，每 15 秒一點，3° 下滑
  for (let i = 0; i <= 26; i++) {
    const distOut = 22000 - i * 850          // 22 km → 750 m
    const alt = Math.max(60, distOut * Math.tan(3 * D2R) * 3.2808)
    // 沿反方位往外推，加側向噪聲
    let [la, lo] = dest(rw.lat, rw.lon, (rw.hdg + 180) % 360, distOut)
    const lateral = rnd() * 2 * noiseM + (hdgErr ? distOut * Math.tan(hdgErr * D2R) : 0)
    ;[la, lo] = dest(la, lo, (rw.hdg + 90) % 360, lateral)
    pts.push({ t: t0 + i * 15, la, lo, a: Math.round(alt), s: 150 })
  }
  // 觸地後滑行幾點（<100 ft）
  for (let i = 1; i <= 4; i++) {
    const [la, lo] = dest(rw.lat, rw.lon, rw.hdg, i * 400)
    pts.push({ t: t0 + 26 * 15 + i * 10, la, lo, a: 0, s: 60 })
  }
  return pts
}

let pass = 0, fail = 0
const failures = []
for (const [iata, rws] of Object.entries(RUNWAYS)) {
  for (const rw of rws) {
    if (rw.lat == null) continue
    const got = detectRunway(synth(rw), iata)
    if (got === rw.id) pass++
    else { fail++; failures.push(`${iata} ${rw.id} → ${got}`) }
  }
}
console.log(`合成航跡（乾淨進場）：pass ${pass} / fail ${fail}`)
failures.slice(0, 40).forEach(f => console.log('  ✗', f))

// 重點案例：TPE 平行跑道 + 噪聲/偏移
console.log('\n--- TPE 平行跑道壓力測試 ---')
for (const id of ['05L', '05R', '23L', '23R']) {
  const rw = RUNWAYS.TPE.find(r => r.id === id)
  for (const opt of [{ noiseM: 30 }, { noiseM: 120 }, { hdgErr: 1.5 }, { noiseM: 150, hdgErr: -1 }]) {
    const got = detectRunway(synth(rw, opt), 'TPE')
    console.log(`  ${id} ${JSON.stringify(opt).padEnd(28)} → ${got}${got === id ? ' ✓' : ' ✗'}`)
  }
}

// 不存在的機場 / 空航跡 → 應回 null（不亂猜）
console.log('\n--- 不猜測試 ---')
console.log('  未知機場 XXX      →', detectRunway(synth(RUNWAYS.TPE[0]), 'XXX'))
console.log('  空航跡            →', detectRunway([], 'TPE'))
console.log('  只有 3 點         →', detectRunway(synth(RUNWAYS.TPE[0]).slice(0, 3), 'TPE'))
// 航跡完全對不上任何跑道（從正北進場到 TPE，只有 05/23）
const bogus = synth({ ...RUNWAYS.TPE[0], hdg: 180 })
console.log('  方位對不上 (180°) →', detectRunway(bogus, 'TPE'))
