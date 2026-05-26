// ══════════════════════════════════════════════
// OpenSky Network API 整合
// 免費 API，歷史軌跡保留 30 天，有 rate limit
// ══════════════════════════════════════════════

const BASE = 'https://opensky-network.org/api'

/**
 * 查詢飛行軌跡
 * @param {string} icao24   ICAO24 hex code (e.g. "899210")
 * @param {number} timeUnix Unix timestamp (秒，飛行期間任一時間點)
 * @returns {TrackPoint[] | null}
 */
export async function fetchTrack(icao24, timeUnix) {
  if (!icao24) return null
  try {
    const url = `${BASE}/tracks/all?icao24=${icao24.toLowerCase()}&time=${timeUnix}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.path || data.path.length === 0) return null

    // path: [[time, lat, lon, baro_alt, true_track, on_ground], ...]
    return data.path
      .filter(p => p[1] != null && p[2] != null)
      .map(p => ({
        t:  p[0],
        la: parseFloat((p[1] || 0).toFixed(4)),
        lo: parseFloat((p[2] || 0).toFixed(4)),
        a:  Math.round((p[3] || 0) * 3.28084), // meters → feet
        s:  0, // groundspeed not available in track endpoint
      }))
  } catch (e) {
    console.warn('OpenSky track fetch failed:', e)
    return null
  }
}

/**
 * 查詢航班記錄（by aircraft）
 * @param {string} icao24
 * @param {number} beginUnix
 * @param {number} endUnix
 */
export async function fetchFlights(icao24, beginUnix, endUnix) {
  if (!icao24) return null
  try {
    const url = `${BASE}/flights/aircraft?icao24=${icao24.toLowerCase()}&begin=${beginUnix}&end=${endUnix}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return await res.json()
  } catch (e) {
    console.warn('OpenSky flights fetch failed:', e)
    return null
  }
}

/**
 * 將飛行記錄中的 offTime/onTime + date 轉換為 Unix timestamp
 * @param {string} date    YYYY-MM-DD
 * @param {string} offTime HH:MM UTC
 * @param {string} onTime  HH:MM UTC
 */
export function getTimeRange(date, offTime, onTime) {
  const [y, mo, d] = date.split('-').map(Number)
  const [offH, offM] = offTime.split(':').map(Number)
  const [onH,  onM]  = onTime.split(':').map(Number)

  const offMs = Date.UTC(y, mo-1, d, offH, offM)
  let onMs    = Date.UTC(y, mo-1, d, onH, onM)
  if (onMs <= offMs) onMs += 86400000

  return {
    begin: Math.floor(offMs / 1000) - 300,   // -5min buffer
    end:   Math.floor(onMs  / 1000) + 300,    // +5min buffer
    midpoint: Math.floor((offMs + onMs) / 2 / 1000),
  }
}
