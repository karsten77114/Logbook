// ══════════════════════════════════════════════
// Flight Detail Page
// ══════════════════════════════════════════════
import { getFlight, deleteFlight, updateFlight } from '../db.js'
import { state }                                  from '../state.js'
import { navigate, showToast }                    from '../app.js'
import { invalidateStats }                        from './list.js'
import { fmtDate, fmtDuration,
         diffMin, normalizeHm, isValidHm }        from '../utils/time.js'
import { fetchTrack, getTimeRange }               from '../utils/opensky.js'
import { FLEET, APPROACH_TYPES,
         ALL_REGISTRATIONS, getTypeByReg }        from '../data/fleet.js'
import { isAircraftActive }                       from '../state.js'

export async function renderDetail(root, params) {
  const flightId = params[0]
  if (!flightId) { navigate('list'); return }

  root.innerHTML = `
    <div class="page">
      <div class="topbar">
        <button class="topbar-action btn-back" id="btn-back">‹</button>
        <div class="topbar-title" id="detail-title">…</div>
        <div style="display:flex;gap:4px">
          <button class="topbar-action" id="btn-edit" style="font-size:14px;letter-spacing:0.04em;color:var(--accent)">Edit</button>
          <button class="topbar-action" id="btn-delete" style="color:var(--red)">⌫</button>
        </div>
      </div>
      <div class="scroll" id="detail-scroll">
        <div class="list-loading"><div class="loader"></div></div>
      </div>
    </div>`

  root.querySelector('#btn-back').addEventListener('click', () => navigate('list'))

  try {
    const f = await getFlight(state.user.uid, flightId)
    if (!f) { showToast('Record not found', 'error'); navigate('list'); return }

    root.querySelector('#detail-title').textContent =
      `${f.from || '?'} → ${f.to || '?'}`

    root.querySelector('#detail-scroll').innerHTML = buildDetailHtml(f)

    // Edit button
    root.querySelector('#btn-edit').addEventListener('click', () => {
      showEditSheet(root, f, flightId)
    })

    // Delete button
    root.querySelector('#btn-delete').addEventListener('click', () => {
      showConfirm(root, async () => {
        await deleteFlight(state.user.uid, flightId)
        invalidateStats()
        showToast('Deleted', 'success')
        navigate('list')
      })
    })

    // Try to fetch track if none stored
    if (!f.flightTrack && f.offTime && f.onTime) {
      tryFetchTrack(root, f, flightId)
    } else if (f.flightTrack?.length > 0) {
      renderTrack(root, f.flightTrack)
      // Detect runway from saved track if not already set
      if (!f.runway) autoDetectRunway(root, f.flightTrack, f.to, flightId)
    }

  } catch (e) {
    root.querySelector('#detail-scroll').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">Load failed</div>
        <div class="empty-state-sub">${e.message}</div>
      </div>`
  }
}

function buildDetailHtml(f) {
  const yn  = v => v ? '<span class="text-green">Yes</span>' : '<span class="text-dim">No</span>'
  const blk = fmtDuration(f.blockTime)
  const flt = fmtDuration(f.flightTime)
  const nt  = fmtDuration(f.nightTime)

  return `
    <!-- Hero -->
    <div class="detail-hero">
      <div class="detail-route">
        <div class="detail-airport">${f.from || '???'}</div>
        <div class="detail-arrow">→</div>
        <div class="detail-airport">${f.to || '???'}</div>
      </div>
      <div class="detail-fn">${f.flightNumber || '—'} · ${fmtDate(f.date)}</div>
    </div>

    <div class="detail-cards">

      <!-- OOOI Times -->
      <div class="detail-card">
        <div class="detail-card-title">OOOI Times (UTC)</div>
        <div class="time-grid">
          ${['OUT','OFF','ON','IN'].map(l => `
            <div class="time-cell">
              <div class="time-cell-label">${l}</div>
              <div class="time-cell-val">${f[l.toLowerCase()+'Time'] || '--:--'}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Times -->
      <div class="detail-card">
        <div class="detail-card-title">Flight Times</div>
        ${detailRow('Block Time',  blk,  'accent')}
        ${detailRow('Flight Time', flt,  'accent')}
        ${detailRow('Night Time',  nt,   nt !== '--:--' && f.nightTime > 0 ? 'amber' : '')}
      </div>

      <!-- Aircraft -->
      <div class="detail-card">
        <div class="detail-card-title">Aircraft</div>
        ${detailRow('Type',         f.aircraftType  || '—')}
        ${detailRow('Registration', f.registration  || '—')}
        ${detailRow('Approach',     f.approachType  || '—')}
        <div class="detail-row">
          <span class="detail-key">Runway</span>
          <span class="detail-val" id="det-runway">${f.runway || '—'}</span>
        </div>
      </div>

      <!-- Piloting -->
      <div class="detail-card">
        <div class="detail-card-title">Piloting</div>
        ${detailRow('PF Takeoff', yn(f.pfTakeoff))}
        ${detailRow('PF Landing', yn(f.pfLanding))}
        ${detailRow('PIC',        yn(f.pic))}
        ${detailRow('Autoland',   yn(f.autoland))}
        ${detailRow('Go-Around',  yn(f.goAround))}
        ${detailRow('Diverted',   yn(f.diverted))}
      </div>

      <!-- Load -->
      <div class="detail-card">
        <div class="detail-card-title">Load Data</div>
        ${detailRow('PAX',       (f.totalPax || 0).toString())}
        ${detailRow('Payload',   f.totalPayload ? `${f.totalPayload} t` : '—')}
        ${detailRow('Distance',  f.flightPlanDistance ? `${f.flightPlanDistance} NM` : '—')}
      </div>

      <!-- Crew -->
      ${f.crewNames?.length ? `
      <div class="detail-card">
        <div class="detail-card-title">Crew</div>
        ${f.crewNames.map((n, i) => detailRow(`Crew ${i+1}`, n)).join('')}
      </div>` : ''}

      <!-- Map placeholder -->
      <div class="detail-card" id="map-card">
        <div class="detail-card-title">Flight Track</div>
        <div id="track-map-wrap">
          <div style="color:var(--text-faint);font-size:13px;text-align:center;padding:20px">
            Loading flight track…
          </div>
        </div>
        <!-- Timeline scrubber (hidden until track loads) -->
        <div id="track-timeline" class="track-tl hidden">
          <div class="tl-info">
            <span id="tl-time">--:--Z</span>
            <span id="tl-alt">-- ft</span>
            <span id="tl-spd">-- kts</span>
          </div>
          <div class="tl-row">
            <span id="tl-dep" class="tl-label">--:--</span>
            <input type="range" id="tl-slider" class="tl-slider" min="0" max="1000" value="0">
            <span id="tl-arr" class="tl-label">--:--</span>
          </div>
        </div>
      </div>

      <!-- Charts placeholder -->
      <div class="detail-card hidden" id="charts-card">
        <div class="detail-card-title">Altitude · Groundspeed</div>
        <canvas id="chart-combined" style="width:100%;max-height:200px"></canvas>
      </div>

    </div>`
}

function detailRow(key, val, cls = '') {
  return `
    <div class="detail-row">
      <span class="detail-key">${key}</span>
      <span class="detail-val ${cls ? 'detail-val--'+cls : ''}"
            style="${cls === 'accent' ? 'color:var(--accent)' :
                    cls === 'green'  ? 'color:var(--green)' :
                    cls === 'amber'  ? 'color:var(--amber)' : ''}">${val}</span>
    </div>`
}

// ── Track / Map ────────────────────────────────

const PROXY_BASE = 'https://jx-briefing.karsten77114.workers.dev'

/**
 * Strategy 2: FR24 via Cloudflare Worker proxy
 * Returns track array [{la, lo, a, t, s}] or null
 */
async function fetchTrackFR24(reg, date, from, to, fn) {
  if (!reg || !date) return null
  try {
    const qs = new URLSearchParams({ reg, date, from: from || '', to: to || '', fn: fn || '' })
    const res = await fetch(`${PROXY_BASE}/api/track/fr24?${qs}`, {
      signal: AbortSignal.timeout(18000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.track?.length ? data.track : null
  } catch (e) {
    console.warn('[FR24] proxy failed:', e.message)
    return null
  }
}

async function tryFetchTrack(root, f, flightId) {
  const wrap = root.querySelector('#track-map-wrap')
  if (!wrap) return

  // Ground ops: no airborne time → skip
  if (f.flightTime === 0 && f.offTime === '00:00' && f.onTime === '00:00') {
    wrap.innerHTML = `<div style="color:var(--text-faint);font-size:12px;text-align:center;padding:20px">
      Ground operation — no flight track</div>`
    return
  }

  // Resolve ICAO24 from flight record or fleet lookup
  const icao24 = (f.icao24 || FLEET[f.registration]?.icao24 || '').trim().toLowerCase()

  const doFetch = async (ic) => {
    wrap.innerHTML = `<div style="color:var(--text-faint);font-size:13px;text-align:center;padding:24px">
      ⏳ Fetching ADS-B track…</div>`

    const { begin, midpoint } = getTimeRange(f.date, f.offTime, f.onTime)
    const tooOld = (Date.now() / 1000 - begin) > 30 * 86400

    // Strategy 1: OpenSky (direct browser + Worker proxy)
    let track = null
    if (ic && !tooOld) track = await fetchTrack(ic, midpoint)

    // Strategy 2: FR24 via Worker proxy (works when Cloudflare allows)
    if (!track?.length && f.registration && f.date) {
      wrap.innerHTML = `<div style="color:var(--text-faint);font-size:13px;text-align:center;padding:24px">
        ⏳ Fetching FR24 track…</div>`
      track = await fetchTrackFR24(f.registration, f.date, f.from, f.to, f.flightNumber)
    }

    if (track?.length) {
      renderTrack(root, track)
      // Persist track to Firestore so future visits don't re-fetch
      if (flightId) {
        updateFlight(state.user.uid, flightId, { flightTrack: track }).catch(() => {})
      }
      // Auto-detect runway if not already set
      if (!f.runway && flightId) {
        autoDetectRunway(root, track, f.to, flightId)
      }
    } else {
      wrap.innerHTML = `<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">
        No ADS-B track available</div>`
    }
  }

  if (icao24) {
    doFetch(icao24)
  } else {
    // 先查 hexdb.io 取得 ICAO24
    wrap.innerHTML = `<div style="color:var(--text-faint);font-size:13px;text-align:center;padding:24px">
      ⏳ Looking up registration…</div>`
    try {
      const hexResp = await fetch(
        `https://hexdb.io/reg-hex?reg=${encodeURIComponent(f.registration)}`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (hexResp.ok) {
        const lookedUp = (await hexResp.text()).trim().toLowerCase()
        if (/^[0-9a-f]{6}$/.test(lookedUp)) { doFetch(lookedUp); return }
      }
    } catch (_) {}
    // ICAO24 不明でも FR24 は registration で検索できる
    doFetch(null)
  }
}


// ── Helpers ────────────────────────────────────

function _bearing(p1, p2) {
  const toR = d => d * Math.PI / 180
  const y = Math.sin(toR(p2.lo - p1.lo)) * Math.cos(toR(p2.la))
  const x = Math.cos(toR(p1.la)) * Math.sin(toR(p2.la)) -
            Math.sin(toR(p1.la)) * Math.cos(toR(p2.la)) * Math.cos(toR(p2.lo - p1.lo))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// SVG airplane pointing NORTH (up) at 0° — rotate(hdg) needs no offset on any platform
const _PLANE_SVG = `<svg viewBox="0 0 20 20" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
  <path fill="#1e1610" d="M10,1 L13,9 L19,11 L19,13 L13,11.5 L13,17 L15,18.5 L15,19.5 L10,18 L5,19.5 L5,18.5 L7,17 L7,11.5 L1,13 L1,11 L7,9 Z"/>
</svg>`

function _planeIcon(hdg) {
  return L.divIcon({
    html: `<div style="transform:rotate(${Math.round(hdg)}deg);line-height:0;filter:drop-shadow(0 0 4px rgba(255,255,255,1)) drop-shadow(0 0 2px rgba(255,255,255,0.8))">${_PLANE_SVG}</div>`,
    className: 'plane-marker-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

// ── Map ────────────────────────────────────────

function _initMap(wrap) {
  wrap.innerHTML = `<div id="track-map" style="height:240px;border-radius:var(--radius)"></div>`
  const map = L.map('track-map', { zoomControl: false, attributionControl: false })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map)
  return map
}

/** Render ADS-B track; returns {map, marker, flownLine} for timeline use */
function renderMap(root, track) {
  if (!track?.length || typeof L === 'undefined') return null
  const wrap = root.querySelector('#track-map-wrap')
  if (!wrap) return null

  const map     = _initMap(wrap)
  const latlngs = track.map(p => [p.la, p.lo])

  // Dim full-route line
  L.polyline(latlngs, { color: '#a06818', weight: 2, opacity: 0.28 }).addTo(map)
  // Bright "flown" line (filled by timeline scrubber)
  const flownLine = L.polyline([], { color: '#a06818', weight: 3.5, opacity: 0.88 }).addTo(map)

  map.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] })

  const hdg0  = track.length > 1 ? _bearing(track[0], track[1]) : 0
  const marker = L.marker([track[0].la, track[0].lo], { icon: _planeIcon(hdg0) }).addTo(map)

  return { map, marker, flownLine }
}

// ── Charts ─────────────────────────────────────

/** Cursor plugin: vertical dashed line + dots on both datasets */
const _cursorPlugin = {
  id: 'trackCursor',
  afterDraw(chart) {
    const idx = chart._cursorIdx
    if (idx == null) return
    const { ctx, chartArea } = chart
    if (!chartArea) return
    let lineX = null
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i)
      if (!meta?.data?.[idx]) return
      const x = meta.data[idx].x
      const y = meta.data[idx].y
      if (lineX == null) lineX = x
      // dot for each line
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = ds.borderColor
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    })
    if (lineX != null) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(lineX, chartArea.top)
      ctx.lineTo(lineX, chartArea.bottom)
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.restore()
    }
  },
}

/** Render combined altitude + groundspeed chart with dual Y-axes; returns {chart, sample} */
function renderCharts(root, track) {
  if (!track?.length || typeof Chart === 'undefined') return null

  const card = root.querySelector('#charts-card')
  if (card) card.classList.remove('hidden')

  const sample  = track.filter((_, i) => i % 5 === 0)
  const labels  = sample.map(p => {
    const d = new Date(p.t * 1000)
    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
  })

  const ctx = root.querySelector('#chart-combined')?.getContext('2d')
  if (!ctx) return { chart: null, sample }

  const chart = new Chart(ctx, {
    type: 'line',
    plugins: [_cursorPlugin],
    data: {
      labels,
      datasets: [
        {
          label: 'Alt (ft)',
          data:  sample.map(p => p.a),
          borderColor: '#00b4d8', borderWidth: 1.5, fill: false,
          yAxisID: 'yAlt', tension: 0.3, pointRadius: 0,
        },
        {
          label: 'GS (kts)',
          data:  sample.map(p => p.s),
          borderColor: '#f0a030', borderWidth: 1.5, fill: false,
          yAxisID: 'ySpd', tension: 0.3, pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: '#6888a0', font: { size: 10 }, maxRotation: 0 },
          grid:  { color: '#1e2d3d' },
        },
        yAlt: {
          type: 'linear', position: 'left',
          ticks: { color: '#00b4d8', font: { size: 9 } },
          grid:  { color: '#1e2d3d' },
        },
        ySpd: {
          type: 'linear', position: 'right',
          ticks: { color: '#f0a030', font: { size: 9 } },
          grid:  { drawOnChartArea: false },
        },
      },
    },
  })

  return { chart, sample }
}

// ── Timeline ───────────────────────────────────

function initTimeline(root, track, mapObjs, chartObjs) {
  const tl = root.querySelector('#track-timeline')
  if (!tl) return
  tl.classList.remove('hidden')

  const slider = root.querySelector('#tl-slider')
  const tlTime = root.querySelector('#tl-time')
  const tlAlt  = root.querySelector('#tl-alt')
  const tlSpd  = root.querySelector('#tl-spd')
  const tlDep  = root.querySelector('#tl-dep')
  const tlArr  = root.querySelector('#tl-arr')

  slider.min = 0
  slider.max = track.length - 1
  slider.value = 0

  const fmtUTC = ts => {
    const d = new Date(ts * 1000)
    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}Z`
  }
  tlDep.textContent = fmtUTC(track[0].t)
  tlArr.textContent = fmtUTC(track[track.length - 1].t)

  const { marker, flownLine } = mapObjs
  const { chart, sample } = chartObjs || {}
  const sampleLen = sample?.length || 1

  function update(rawIdx) {
    const idx = Math.max(0, Math.min(rawIdx, track.length - 1))
    const pt  = track[idx]

    // Map: rotate plane via DOM (avoids re-creating Leaflet icon element each tick)
    const hdg = idx > 0
      ? _bearing(track[idx - 1], pt)
      : _bearing(track[0], track[Math.min(1, track.length - 1)])
    marker.setLatLng([pt.la, pt.lo])
    const markerEl = marker.getElement()
    if (markerEl) {
      const div = markerEl.querySelector('div')
      if (div) div.style.transform = `rotate(${Math.round(hdg)}deg)`
    }
    flownLine.setLatLngs(track.slice(0, idx + 1).map(p => [p.la, p.lo]))

    // Info bar
    tlTime.textContent = fmtUTC(pt.t)
    tlAlt.textContent  = pt.a > 0 ? `${pt.a.toLocaleString()} ft` : 'GND'
    tlSpd.textContent  = `${pt.s} kts`

    // Combined chart cursor
    const si = Math.min(Math.floor(idx / 5), sampleLen - 1)
    if (chart) { chart._cursorIdx = si; chart.draw() }
  }

  slider.addEventListener('input', () => update(parseInt(slider.value)))
  update(0)
}

/** Render full track: map + charts + timeline scrubber */
function renderTrack(root, track) {
  const mapObjs   = renderMap(root, track)
  const chartObjs = renderCharts(root, track)
  if (mapObjs) initTimeline(root, track, mapObjs, chartObjs)
}

// ── Runway Detection ───────────────────────────

/** Known runway configurations: IATA → [[designator, magnetic_heading], ...] */
const RUNWAY_DB = {
  TPE: [['05L',46],['05R',46],['23L',226],['23R',226]],
  CGK: [['07L',72],['07R',72],['25L',252],['25R',252]],
  UKB: [['09',88],['27',268]],
  RMQ: [['18',178],['36',358]],
  CEB: [['04',38],['22',218]],
  MNL: [['06',58],['24',238],['13',131],['31',311]],
  CRK: [['02',20],['20',200]],
  DAD: [['17L',171],['17R',171],['35L',351],['35R',351]],
  KUL: [['14L',136],['14R',136],['32L',316],['32R',316]],
  FUK: [['16L',160],['16R',160],['34L',340],['34R',340]],
  ITM: [['14L',136],['14R',136],['32L',316],['32R',316]],
  KIX: [['06L',60],['06R',60],['24L',240],['24R',240]],
  KMJ: [['07',74],['25',254]],
  TAK: [['26',257],['08',77]],
  OKA: [['18L',180],['18R',180],['36L',360],['36R',360]],
  NGO: [['34L',340],['34R',340],['16L',160],['16R',160]],
  NRT: [['16L',160],['16R',160],['34L',340],['34R',340]],
  HND: [['05',50],['23',230],['16L',160],['16R',160],['34R',340]],
  KHH: [['09L',90],['09R',90],['27L',270],['27R',270]],
  NHA: [['02',19],['20',199]],   // Nha Trang
  HAN: [['11L',106],['11R',106],['29L',286],['29R',286]],  // Hanoi
  SGN: [['07L',72],['07R',72],['25L',252],['25R',252]],    // Ho Chi Minh
  BKK: [['01L',9],['01R',9],['19L',189],['19R',189]],      // Bangkok Suvarnabhumi
  SIN: [['02C',20],['02L',20],['02R',20],['20C',200],['20L',200],['20R',200]], // Singapore
  ICN: [['15L',146],['15R',146],['33L',326],['33R',326],['16',160],['34',340]], // Seoul Incheon
  PVG: [['16L',160],['16R',160],['34L',340],['34R',340]],  // Shanghai Pudong
}

/**
 * Detect landing runway from ADS-B track using final approach bearing.
 * @param {Array} track [{t,la,lo,a,s}]
 * @param {string} destIata destination IATA code
 * @returns {string|null} runway designator (e.g. '23L', '27') or null
 */
function detectRunway(track, destIata) {
  if (!track?.length) return null

  // Find last airborne point (altitude > 100 ft)
  let lastAirIdx = -1
  for (let i = track.length - 1; i >= 0; i--) {
    if (track[i].a > 100) { lastAirIdx = i; break }
  }
  if (lastAirIdx < 5) return null

  // Final approach: 3 min before touchdown, below 3000 ft
  const tLand = track[lastAirIdx].t
  const approach = track.filter(p =>
    p.t >= tLand - 180 && p.t <= tLand && p.a < 3000 && p.a > 50
  )
  if (approach.length < 5) return null

  // Circular mean bearing
  let sinS = 0, cosS = 0
  for (let i = 1; i < approach.length; i++) {
    const r = _bearing(approach[i - 1], approach[i]) * Math.PI / 180
    sinS += Math.sin(r); cosS += Math.cos(r)
  }
  const avgBearing = (Math.atan2(sinS, cosS) * 180 / Math.PI + 360) % 360

  // Match against known runways (within ±20°)
  const runways = RUNWAY_DB[destIata?.toUpperCase()]
  if (runways) {
    let best = null, bestDiff = 999
    for (const [name, hdg] of runways) {
      const diff = Math.abs(((avgBearing - hdg + 540) % 360) - 180)
      if (diff < bestDiff && diff < 20) { best = name; bestDiff = diff }
    }
    if (best) return best
  }

  // Fallback: heading-based runway number (no L/R suffix)
  const rwyNum = Math.round(avgBearing / 10) % 36 || 36
  return String(rwyNum).padStart(2, '0')
}

/**
 * Detect runway, update UI, and persist to Firestore if not already set.
 */
async function autoDetectRunway(root, track, destIata, flightId) {
  const detected = detectRunway(track, destIata)
  if (!detected) return

  // Update UI
  const el = root.querySelector('#det-runway')
  if (el) {
    el.textContent = detected
    el.style.color = 'var(--accent)'
    el.title = 'Auto-detected from ADS-B track'
  }

  // Persist to Firestore
  try {
    await updateFlight(state.user.uid, flightId, { runway: detected })
  } catch (e) {
    console.warn('[Runway] Firestore update failed:', e.message)
  }
}

// ── Background Track Fetch (callable from add.js) ─────────────────
/**
 * 儲存航班後在背景自動抓取 ADS-B track 並存回 Firestore。
 * 不需要 DOM，fire-and-forget 用（catch 在呼叫方處理）。
 */
export async function backgroundFetchAndSaveTrack(uid, flightId, f) {
  if (!f.offTime || !f.onTime) return
  // Ground op：沒有飛行時間，跳過
  if (f.flightTime === 0 && f.offTime === '00:00' && f.onTime === '00:00') return

  const icao24 = (f.icao24 || FLEET[f.registration]?.icao24 || '').trim().toLowerCase()
  const { begin, midpoint } = getTimeRange(f.date, f.offTime, f.onTime)
  const tooOld = (Date.now() / 1000 - begin) > 30 * 86400

  let track = null

  // Strategy 1: OpenSky（ICAO24 已知）
  if (icao24 && !tooOld) track = await fetchTrack(icao24, midpoint)

  // Strategy 1b: hexdb.io → ICAO24 → OpenSky
  if (!track?.length && !icao24 && f.registration && !tooOld) {
    try {
      const r = await fetch(
        `https://hexdb.io/reg-hex?reg=${encodeURIComponent(f.registration)}`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (r.ok) {
        const hex = (await r.text()).trim().toLowerCase()
        if (/^[0-9a-f]{6}$/.test(hex)) track = await fetchTrack(hex, midpoint)
      }
    } catch (_) {}
  }

  // Strategy 2: FR24 via Worker proxy
  if (!track?.length && f.registration && f.date) {
    track = await fetchTrackFR24(f.registration, f.date, f.from, f.to, f.flightNumber)
  }

  if (!track?.length) return

  // 存 track
  await updateFlight(uid, flightId, { flightTrack: track })

  // 自動偵測跑道
  const runway = detectRunway(track, f.to)
  if (runway && !f.runway) {
    await updateFlight(uid, flightId, { runway })
  }
}

// ── Edit Sheet ─────────────────────────────────

function _minHm(min) {
  if (min == null || isNaN(min)) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function showEditSheet(root, f, flightId) {
  const activeRegs = ALL_REGISTRATIONS.filter(r => isAircraftActive(r))
  const regOptions = activeRegs.map(r => {
    const type = getTypeByReg(r)
    const sel  = r === f.registration ? ' selected' : ''
    return `<option value="${r}"${sel}>${r} — ${type}</option>`
  }).join('')
  const approachOptions = APPROACH_TYPES.map(a =>
    `<option value="${a}" ${a === f.approachType ? 'selected' : ''}>${a}</option>`
  ).join('')

  const yn = (key) => `
    <div class="edit-toggle-row" data-key="${key}" data-val="${f[key] ? '1' : '0'}">
      <span class="edit-toggle-lbl">${key === 'pfTakeoff' ? 'PF Takeoff' :
                                      key === 'pfLanding' ? 'PF Landing' :
                                      key === 'pic'       ? 'PIC' :
                                      key === 'autoland'  ? 'Autoland' :
                                      key === 'goAround'  ? 'Go-Around' : 'Diverted'}</span>
      <div class="hub-toggle-switch ${f[key] ? 'on' : ''}"></div>
    </div>`

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:90vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <div class="modal-title">Edit Flight</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Date (UTC)</label>
          <input class="form-input" id="ef-date" type="date" value="${f.date || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Flight No.</label>
          <input class="form-input mono" id="ef-fn" type="text" value="${f.flightNumber || ''}"
                 autocapitalize="characters" autocomplete="off">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">From</label>
          <input class="form-input mono" id="ef-from" type="text" value="${f.from || ''}"
                 maxlength="4" autocapitalize="characters">
        </div>
        <div class="form-group">
          <label class="form-label">To</label>
          <input class="form-input mono" id="ef-to" type="text" value="${f.to || ''}"
                 maxlength="4" autocapitalize="characters">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">OUT</label>
          <input class="form-input mono" id="ef-out" type="text" value="${f.outTime || ''}"
                 placeholder="HHMM" maxlength="5">
        </div>
        <div class="form-group">
          <label class="form-label">OFF</label>
          <input class="form-input mono" id="ef-off" type="text" value="${f.offTime || ''}"
                 placeholder="HHMM" maxlength="5">
        </div>
        <div class="form-group">
          <label class="form-label">ON</label>
          <input class="form-input mono" id="ef-on" type="text" value="${f.onTime || ''}"
                 placeholder="HHMM" maxlength="5">
        </div>
        <div class="form-group">
          <label class="form-label">IN</label>
          <input class="form-input mono" id="ef-in" type="text" value="${f.inTime || ''}"
                 placeholder="HHMM" maxlength="5">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Night Time</label>
          <input class="form-input mono" id="ef-night" type="text"
                 value="${_minHm(f.nightTime)}" placeholder="H:MM">
        </div>
        <div class="form-group" style="flex:0;min-width:0"></div>
      </div>

      <div class="form-group">
        <label class="form-label">Registration</label>
        <select class="form-select" id="ef-reg">
          <option value="">—</option>
          ${regOptions}
          ${f.registration && !activeRegs.includes(f.registration)
            ? `<option value="${f.registration}" selected>${f.registration}</option>`
            : ''}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Approach</label>
          <select class="form-select" id="ef-approach">
            <option value="">—</option>
            ${approachOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Runway</label>
          <input class="form-input mono" id="ef-runway" type="text"
                 value="${f.runway || ''}" maxlength="4" autocapitalize="characters">
        </div>
      </div>

      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);padding:12px 0 8px">Piloting</div>
      ${['pfTakeoff','pfLanding','pic','autoland','goAround','diverted'].map(yn).join('')}

      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);padding:12px 0 8px">Load</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">PAX</label>
          <input class="form-input" id="ef-pax" type="number" inputmode="numeric"
                 value="${f.totalPax || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Payload (t)</label>
          <input class="form-input" id="ef-payload" type="number" inputmode="decimal"
                 step="0.1" value="${f.totalPayload || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Dist (NM)</label>
          <input class="form-input" id="ef-dist" type="number" inputmode="numeric"
                 value="${f.flightPlanDistance || ''}">
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="ef-save">Save Changes</button>
    </div>`
  document.body.appendChild(overlay)

  // Toggle switches
  overlay.querySelectorAll('.edit-toggle-row').forEach(row => {
    row.addEventListener('click', () => {
      const isOn = row.dataset.val === '1'
      row.dataset.val = isOn ? '0' : '1'
      row.querySelector('.hub-toggle-switch')?.classList.toggle('on', !isOn)
    })
  })

  // Auto-uppercase airports / fn
  ;['ef-fn','ef-from','ef-to','ef-runway'].forEach(id => {
    overlay.querySelector(`#${id}`)?.addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase()
    })
  })

  overlay.querySelector('#ef-save').addEventListener('click', async () => {
    const outV  = overlay.querySelector('#ef-out').value
    const inV   = overlay.querySelector('#ef-in').value
    const offV  = overlay.querySelector('#ef-off').value
    const onV   = overlay.querySelector('#ef-on').value
    const nightV = overlay.querySelector('#ef-night').value

    const blockTime  = isValidHm(outV) && isValidHm(inV) ? diffMin(outV, inV) : f.blockTime
    const flightTime = isValidHm(offV) && isValidHm(onV)  ? diffMin(offV, onV) : f.flightTime
    const nightTime  = isValidHm(nightV) ? diffMin('0:00', normalizeHm(nightV)) : f.nightTime

    const regVal = overlay.querySelector('#ef-reg').value || f.registration
    const toggleVals = {}
    overlay.querySelectorAll('.edit-toggle-row').forEach(row => {
      toggleVals[row.dataset.key] = row.dataset.val === '1'
    })

    const changes = {
      date:               overlay.querySelector('#ef-date').value    || f.date,
      flightNumber:       (overlay.querySelector('#ef-fn').value    || '').toUpperCase() || f.flightNumber,
      from:               (overlay.querySelector('#ef-from').value  || '').toUpperCase() || f.from,
      to:                 (overlay.querySelector('#ef-to').value    || '').toUpperCase() || f.to,
      outTime:            isValidHm(outV)  ? normalizeHm(outV)  : f.outTime,
      offTime:            isValidHm(offV)  ? normalizeHm(offV)  : f.offTime,
      onTime:             isValidHm(onV)   ? normalizeHm(onV)   : f.onTime,
      inTime:             isValidHm(inV)   ? normalizeHm(inV)   : f.inTime,
      blockTime,
      flightTime,
      nightTime,
      registration:       regVal,
      aircraftType:       getTypeByReg(regVal) || f.aircraftType,
      approachType:       overlay.querySelector('#ef-approach').value,
      runway:             (overlay.querySelector('#ef-runway').value || '').toUpperCase(),
      ...toggleVals,
      totalPax:           parseInt(overlay.querySelector('#ef-pax').value     || '0', 10),
      totalPayload:       parseFloat(overlay.querySelector('#ef-payload').value || '0'),
      flightPlanDistance: parseInt(overlay.querySelector('#ef-dist').value    || '0', 10),
    }

    try {
      await updateFlight(state.user.uid, flightId, changes)
      invalidateStats()
      overlay.remove()
      showToast('Updated', 'success')
      // Reload detail page
      const scroll = root.querySelector('#detail-scroll')
      const newF   = { ...f, ...changes }
      if (scroll) scroll.innerHTML = buildDetailHtml(newF)
      const titleEl = root.querySelector('#detail-title')
      if (titleEl) titleEl.textContent = `${newF.from || '?'} → ${newF.to || '?'}`
    } catch (e) {
      showToast('Save failed', 'error')
    }
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

// ── Delete Confirm ─────────────────────────────

function showConfirm(root, onConfirm) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet" style="gap:20px">
      <div class="modal-handle"></div>
      <div style="text-align:center; font-size:16px; color:var(--text)">Delete this flight record?</div>
      <div style="text-align:center; font-size:13px; color:var(--text-dim)">This action cannot be undone</div>
      <button class="btn btn-danger btn-full" id="confirm-del">Delete</button>
      <button class="btn btn-secondary btn-full" id="cancel-del">Cancel</button>
    </div>`

  document.body.appendChild(overlay)
  overlay.querySelector('#cancel-del').addEventListener('click', () => overlay.remove())
  overlay.querySelector('#confirm-del').addEventListener('click', () => {
    overlay.remove()
    onConfirm()
  })
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}
