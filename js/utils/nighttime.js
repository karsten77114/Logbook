// ══════════════════════════════════════════════
// Night Time 計算 (使用 SunCalc.js)
// 計算飛行期間在夜間（日落後 ~ 日出前）的分鐘數
// ══════════════════════════════════════════════

// 機場座標（常用機場）
const AIRPORT_COORDS = {
  TPE: [25.077, 121.233],
  TSA: [25.069, 121.552],
  RMQ: [24.264, 120.621],
  KHH: [22.577, 120.350],
  TNN: [22.950, 120.206],
  CYI: [23.462, 120.393],
  HUN: [23.879, 121.618],
  TTT: [22.754, 121.101],
  KNH: [24.427, 118.359],
  MZG: [23.568, 119.628],
  GNI: [23.605, 119.467],
  LZN: [26.160, 119.958],
  // 國際
  NRT: [35.765, 140.386],
  HND: [35.553, 139.781],
  KIX: [34.435, 135.244],
  ITM: [34.785, 135.438],
  FUK: [33.585, 130.451],
  NGO: [34.858, 136.805],
  OKA: [26.196, 127.646],
  SGN: [10.819, 106.652],
  HAN: [21.221, 105.807],
  DAD: [16.044, 108.199],
  BKK: [13.681, 100.747],
  DMK: [13.912, 100.607],
  KUL: [2.746, 101.710],
  SIN: [1.359, 103.989],
  CGK: [-6.126, 106.656],
  MNL: [14.509, 121.020],
  CEB: [10.307, 123.979],
  ICN: [37.469, 126.451],
  GMP: [37.559, 126.794],
  PUS: [35.179, 128.938],
  HKG: [22.308, 113.915],
  MFM: [22.149, 113.592],
  PVG: [31.143, 121.805],
  SHA: [31.198, 121.336],
  PEK: [40.080, 116.584],
  PKX: [39.509, 116.411],
  KMG: [24.992, 102.743],
  CAN: [23.392, 113.299],
}

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

  const fromCoords = AIRPORT_COORDS[fromIATA]
  const toCoords   = AIRPORT_COORDS[toIATA]
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
  return AIRPORT_COORDS[iata] || null
}
