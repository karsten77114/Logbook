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

  // 取中點座標（簡化：用起降機場平均）
  const coords = fromCoords && toCoords
    ? [(fromCoords[0]+toCoords[0])/2, (fromCoords[1]+toCoords[1])/2]
    : (fromCoords || toCoords)

  // 在每一分鐘取樣，判斷是否為夜間
  // 效能優化：每 5 分鐘取樣一次
  const SAMPLE = 5
  let nightSamples = 0
  let totalSamples = 0

  for (let ms = offUtc; ms < onUtc; ms += SAMPLE * 60000) {
    const times = SunCalc.getTimes(new Date(ms), coords[0], coords[1])
    const isNight = new Date(ms) < times.sunrise || new Date(ms) > times.sunset
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
