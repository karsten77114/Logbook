// ══════════════════════════════════════════════
// Night Time 計算 (使用 SunCalc.js)
// 計算飛行期間在夜間（日落後 ~ 日出前）的分鐘數
// ══════════════════════════════════════════════
import { getAirportCoords as _getCoords } from '../data/airports.js'

/**
 * 計算 night time（分鐘）
 * @param {string} date     YYYY-MM-DD (UTC date)
 * @param {string} offTime  HH:MM UTC
 * @param {string} onTime   HH:MM UTC
 * @param {string} fromIATA departure airport IATA
 * @param {string} toIATA   arrival airport IATA
 * @returns {number} night minutes
 */
export function calcNightTime(date, offTime, onTime, fromIATA, toIATA) {
  // SunCalc must be loaded globally
  if (typeof SunCalc === 'undefined') return 0

  const fromCoords = _getCoords(fromIATA)
  const toCoords   = _getCoords(toIATA)
  if (!fromCoords && !toCoords) return 0

  // Build UTC Date objects for off and on times
  const [y, mo, d] = date.split('-').map(Number)
  const [offH, offM] = offTime.split(':').map(Number)
  const [onH,  onM]  = onTime.split(':').map(Number)

  const offUtc = Date.UTC(y, mo-1, d, offH, offM)
  let onUtc    = Date.UTC(y, mo-1, d, onH, onM)
  if (onUtc <= offUtc) onUtc += 86400000 // 跨日

  const totalMin = (onUtc - offUtc) / 60000
  if (totalMin <= 0) return 0

  // 每 5 分鐘取樣，沿大圓線性插值位置（比固定中點更準確，尤其對長途航班）
  const SAMPLE = 5
  let nightSamples = 0
  let totalSamples = 0
  const duration = onUtc - offUtc

  for (let ms = offUtc; ms < onUtc; ms += SAMPLE * 60000) {
    const progress = duration > 0 ? (ms - offUtc) / duration : 0
    const lat = fromCoords && toCoords
      ? fromCoords[0] + progress * (toCoords[0] - fromCoords[0])
      : (fromCoords || toCoords)[0]
    const lon = fromCoords && toCoords
      ? fromCoords[1] + progress * (toCoords[1] - fromCoords[1])
      : (fromCoords || toCoords)[1]
    const times = SunCalc.getTimes(new Date(ms), lat, lon)
    // 航空業界定義：夜間 = 民用晨昏蒙影之外（dawn/dusk，太陽在地平線下 6 度）
    const isNight = new Date(ms) < times.dawn || new Date(ms) > times.dusk
    if (isNight) nightSamples++
    totalSamples++
  }

  if (totalSamples === 0) return 0
  return Math.round(totalMin * nightSamples / totalSamples)
}

/**
 * 取得機場座標（供外部使用）
 */
export function getAirportCoords(iata) {
  return _getCoords(iata)
}
