// 執行：npm test（node:test，不需任何套件，不連網路、不碰正式資料）
// 用真實的 detectRunway 與 RUNWAYS 做 smoke test；合成航跡是確定性的（無亂數）
import test from 'node:test'
import assert from 'node:assert/strict'
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

/** 沿跑道延伸中心線的 3° 直線進場（22 km → 750 m，每 15 秒一點）+ 觸地後滑行 */
function synth(rw) {
  const pts = []
  const t0 = 1750000000
  for (let i = 0; i <= 26; i++) {
    const distOut = 22000 - i * 850
    const alt = Math.max(60, distOut * Math.tan(3 * D2R) * 3.2808)
    const [la, lo] = dest(rw.lat, rw.lon, (rw.hdg + 180) % 360, distOut)
    pts.push({ t: t0 + i * 15, la, lo, a: Math.round(alt), s: 150 })
  }
  for (let i = 1; i <= 4; i++) {
    const [la, lo] = dest(rw.lat, rw.lon, rw.hdg, i * 400)
    pts.push({ t: t0 + 26 * 15 + i * 10, la, lo, a: 0, s: 60 })
  }
  return pts
}

test('未知機場回 null（不猜）', () => {
  assert.equal(detectRunway(synth(RUNWAYS.TPE[0]), 'XXX'), null)
})

test('空航跡 / 過短航跡回 null', () => {
  assert.equal(detectRunway([], 'TPE'), null)
  assert.equal(detectRunway(undefined, 'TPE'), null)
  assert.equal(detectRunway(synth(RUNWAYS.TPE[0]).slice(0, 3), 'TPE'), null)
})

test('TPE 合成乾淨進場能判出正確跑道（含平行跑道 L/R）', () => {
  for (const id of ['05L', '05R', '23L', '23R']) {
    const rw = RUNWAYS.TPE.find(r => r.id === id)
    assert.ok(rw, `RUNWAYS.TPE 缺少 ${id}`)
    assert.equal(detectRunway(synth(rw), 'TPE'), id)
  }
})
