// 用「真實 FR24 航跡」檢查跑道判定，並印出觸地點到各跑道中心線的側向距離當佐證。
//
//   node tools/check_runway_real.mjs B-58201 2026-07-26 CNX TPE JX752
//
// 五個參數都要給：機號 日期 起點 終點 班號。
// （Worker 的 /api/track/fr24 要靠 fn 或 from+to 才對得到那一班，只給 to 會回 no_flight）

import { detectRunway } from '../js/utils/runway.js'
import { RUNWAYS } from '../js/data/runways.js'

const WORKER = 'https://jx-briefing.karsten77114.workers.dev'
const [reg, date, from, to, fn] = process.argv.slice(2)
if (!reg || !date || !from || !to || !fn) {
  console.error('用法：node tools/check_runway_real.mjs <reg> <YYYY-MM-DD> <from> <to> <fn>')
  process.exit(1)
}

const D2R = Math.PI / 180, R = 6371000
const bearing = (a, b) => {
  const y = Math.sin((b.lo - a.lo) * D2R) * Math.cos(b.la * D2R)
  const x = Math.cos(a.la * D2R) * Math.sin(b.la * D2R) -
            Math.sin(a.la * D2R) * Math.cos(b.la * D2R) * Math.cos((b.lo - a.lo) * D2R)
  return (Math.atan2(y, x) / D2R + 360) % 360
}
const dist = (a, b) => {
  const dLat = (b.la - a.la) * D2R, dLon = (b.lo - a.lo) * D2R
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.la * D2R) * Math.cos(b.la * D2R) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const qs = new URLSearchParams({ reg, date, from, to, fn })
const res = await fetch(`${WORKER}/api/track/fr24?${qs}`)
const data = await res.json()
if (!data.track?.length) {
  console.error('抓不到航跡：', data)
  process.exit(2)
}
const track = data.track

console.log(`${fn} ${from}>${to} ${date}  (${track.length} 點)`)
console.log(`判定跑道 → ${detectRunway(track, to) ?? 'null（判不出來，不猜）'}`)

let idx = -1
for (let i = track.length - 1; i >= 0; i--) { if (track[i].a > 100) { idx = i; break } }
const td = track[Math.min(idx + 1, track.length - 1)]
console.log(`觸地點 ${td.la.toFixed(4)},${td.lo.toFixed(4)} 到各跑道中心線：`)
;(RUNWAYS[to.toUpperCase()] || []).filter(r => r.lat != null).map(rw => {
  const d = dist({ la: rw.lat, lo: rw.lon }, td)
  const brg = bearing({ la: rw.lat, lo: rw.lon }, td)
  return [rw.id, Math.abs(d * Math.sin((brg - rw.hdg) * D2R)), d * Math.cos((brg - rw.hdg) * D2R)]
}).sort((a, b) => a[1] - b[1]).forEach(([id, c, a]) =>
  console.log(`  ${id.padEnd(4)} 側向 ${c.toFixed(0).padStart(6)} m   沿跑道 ${a.toFixed(0).padStart(7)} m`))
