// ══════════════════════════════════════════════
// OpenSky Network API 整合
// ══════════════════════════════════════════════

const OPENSKY_BASE = 'https://opensky-network.org/api'
const PROXY_BASE   = 'https://jx-briefing.karsten77114.workers.dev'

export async function fetchTrack(icao24, timeUnix) {
  if (!icao24) return null

  // Strategy 1: fetch directly from browser (user's IP; OpenSky API supports CORS)
  try {
    const url = `${OPENSKY_BASE}/tracks/all?icao24=${icao24.toLowerCase()}&time=${timeUnix}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      if (data.path?.length) return _parsePath(data.path)
      // Got a valid response but no track points → definitive empty, don't try proxy
      return null
    }
  } catch (e) {
    // CORS failure or network error → fall through to proxy
    console.warn('[OpenSky] direct fetch failed, trying proxy:', e.message)
  }

  // Strategy 2: Cloudflare Worker proxy (fallback)
  try {
    const url = `${PROXY_BASE}/api/track?icao24=${icao24.toLowerCase()}&time=${timeUnix}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.path?.length) return null
    return _parsePath(data.path)
  } catch (e) {
    console.warn('[OpenSky] proxy fetch failed:', e)
    return null
  }
}

function _parsePath(path) {
  // path: [[time, lat, lon, baro_alt_m, true_track, on_ground], ...]
  return path
    .filter(p => p[1] != null && p[2] != null)
    .map(p => ({
      t:  p[0],
      la: parseFloat((p[1] || 0).toFixed(4)),
      lo: parseFloat((p[2] || 0).toFixed(4)),
      a:  Math.round((p[3] || 0) * 3.28084), // metres → feet
      s:  0,
    }))
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
    begin:    Math.floor(offMs / 1000) - 300,
    end:      Math.floor(onMs  / 1000) + 300,
    midpoint: Math.floor((offMs + onMs) / 2 / 1000),
  }
}
