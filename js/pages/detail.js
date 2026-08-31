// ══════════════════════════════════════════════
// Flight Detail Page
// ══════════════════════════════════════════════
import { getFlight, deleteFlight, updateFlight } from '../db.js'
import { state, isCrewActive }                    from '../state.js'
import { navigate, showToast }                    from '../app.js'
import { invalidateStats }                        from './list.js'
import { fmtDate, fmtDuration,
         diffMin, normalizeHm, isValidHm }        from '../utils/time.js'
import { fetchTrack, getTimeRange }               from '../utils/opensky.js'
import { detectRunway }                           from '../utils/runway.js'
import { FLEET, APPROACH_TYPES,
         ALL_REGISTRATIONS, getTypeByReg }        from '../data/fleet.js'
import { isAircraftActive }                       from '../state.js'

const EDIT_CREW_ROLES = ['Pilot in Command', 'Crew 2', 'Crew 3', 'Crew 4']

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
    setupTrackRefresh(root, f, flightId)

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

    // Try to fetch track if none stored. Existing tracks are rendered as-is;
    // use Refresh or Save Changes to force a fresh pull after delayed FR24 data.
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
        <div class="detail-card-title" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span>Flight Track</span>
          <button class="btn btn-sm" id="track-refresh" type="button">Refresh</button>
        </div>
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

function setupTrackRefresh(root, f, flightId) {
  const btn = root.querySelector('#track-refresh')
  if (!btn) return
  btn.addEventListener('click', async () => {
    btn.disabled = true
    btn.textContent = 'Refreshing…'
    try {
      await tryFetchTrack(root, f, flightId, { force: true })
    } finally {
      btn.disabled = false
      btn.textContent = 'Refresh'
    }
  })
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
    const qs = new URLSearchParams({
      reg,
      date,
      from: from || '',
      to: to || '',
      fn: fn || '',
      _: String(Date.now()),
    })
    const res = await fetch(`${PROXY_BASE}/api/track/fr24?${qs}`, {
      signal: AbortSignal.timeout(18000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.track?.length ? data.track : null
  } catch (e) {
    console.warn('[FR24] proxy failed:', e.message)
    return null
  }
}

function _addDaysIso(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function _hmToMin(s) {
  const v = (s || '').replace(':', '')
  if (!/^\d{3,4}$/.test(v)) return null
  const h = parseInt(v.length === 4 ? v.slice(0, 2) : v.slice(0, 1), 10)
  const m = parseInt(v.slice(-2), 10)
  return h * 60 + m
}
function _trackDateCandidates(f) {
  const date = f.date || ''
  const dates = []
  const add = d => { if (d && !dates.includes(d)) dates.push(d) }

  add(f.rosterDate)
  const depMin = _hmToMin(f.offTime || f.outTime)
  if (date && depMin != null && depMin >= 16 * 60) add(_addDaysIso(date, 1))
  add(date)
  return dates
}
function _actualUtcDateForFlight(f) {
  if (!f.rosterDate) return f.date
  const depMin = _hmToMin(f.offTime || f.outTime)
  if (depMin == null) return f.date
  // UTC 16:00-23:59 maps to the next local roster date (UTC+8);
  // UTC 00:00-15:59 is the same local roster date.
  return depMin >= 16 * 60 ? _addDaysIso(f.rosterDate, -1) : f.rosterDate
}
function _dateAfterActualTimeEdit(f, date, outTime, offTime) {
  return _actualUtcDateForFlight({
    ...f,
    date,
    outTime,
    offTime,
  }) || date
}

async function fetchTrackFR24ForFlight(f) {
  let best = null
  for (const date of _trackDateCandidates(f)) {
    const track = await fetchTrackFR24(f.registration, date, f.from, f.to, f.flightNumber)
    if (_isBetterTrack(track, best)) best = track
  }
  return best
}

function _trackDurationSec(track) {
  if (!track?.length) return 0
  const first = track[0]?.t || 0
  const last  = track[track.length - 1]?.t || 0
  return Math.max(0, last - first)
}
function _isBetterTrack(candidate, current) {
  if (!candidate?.length) return false
  if (!current?.length) return true
  const candDur = _trackDurationSec(candidate)
  const currDur = _trackDurationSec(current)
  if (candDur > currDur + 10 * 60) return true
  if (Math.abs(candDur - currDur) <= 10 * 60 && candidate.length > current.length) return true
  return false
}
function _isTrackLikelyPartial(track, f) {
  if (!track?.length || !f.flightTime) return !track?.length
  return _trackDurationSec(track) < f.flightTime * 60 * 0.75
}

async function tryFetchTrack(root, f, flightId, opts = {}) {
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

    const trackDate = _actualUtcDateForFlight(f)
    const { begin, midpoint } = getTimeRange(trackDate, f.offTime, f.onTime)
    const tooOld = (Date.now() / 1000 - begin) > 30 * 86400

    // Strategy 1: OpenSky (direct browser + Worker proxy)
    let track = null
    if (ic && !tooOld) track = await fetchTrack(ic, midpoint)

    // Strategy 2: FR24 via Worker proxy. Force-refresh always checks FR24,
    // and normal fetches also check it when OpenSky looks partial.
    if (f.registration && f.date && (opts.force || !track?.length || _isTrackLikelyPartial(track, f))) {
      wrap.innerHTML = `<div style="color:var(--text-faint);font-size:13px;text-align:center;padding:24px">
        ⏳ Fetching FR24 track…</div>`
      const fr24Track = await fetchTrackFR24ForFlight(f)
      if (_isBetterTrack(fr24Track, track)) track = fr24Track
    }

    if (track?.length) {
      if (opts.force && f.flightTrack?.length && !_isBetterTrack(track, f.flightTrack)) {
        renderTrack(root, f.flightTrack)
        showToast('Existing flight track is more complete', 'error')
        return
      }
      renderTrack(root, track)
      // Persist track to Firestore so future visits don't re-fetch
      if (flightId) {
        updateFlight(state.user.uid, flightId, { flightTrack: track }).catch(() => {})
      }
      // Auto-detect runway if not already set；使用者按 Refresh 則重新判定並覆蓋
      if (flightId && (!f.runway || opts.force)) {
        autoDetectRunway(root, track, f.to, flightId, { force: opts.force, current: f.runway })
      }
      if (opts.force) showToast('Flight track refreshed', 'success')
    } else {
      if (opts.force && f.flightTrack?.length) {
        renderTrack(root, f.flightTrack)
        showToast('No newer ADS-B track available', 'error')
        return
      }
      wrap.innerHTML = `<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">
        ${opts.force ? 'No newer ADS-B track available' : 'No ADS-B track available'}</div>`
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
  if (wrap._trackMap) {
    wrap._trackMap.remove()
    wrap._trackMap = null
  }
  wrap.innerHTML = `<div id="track-map" style="height:240px;border-radius:var(--radius)"></div>`
  const map = L.map('track-map', { zoomControl: false, attributionControl: false })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map)
  wrap._trackMap = map
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

  const step = Math.max(1, Math.ceil(track.length / 180))
  const sample = track.filter((_, i) => i % step === 0)
  const last = track[track.length - 1]
  if (sample[sample.length - 1] !== last) sample.push(last)
  const labels  = sample.map(p => {
    const d = new Date(p.t * 1000)
    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
  })

  const canvas = root.querySelector('#chart-combined')
  if (!canvas) return { chart: null, sample }

  const existing = Chart.getChart?.(canvas)
  if (existing) existing.destroy()

  const ctx = canvas.getContext('2d')
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

function _indexForTrackTime(track, ts) {
  if (!track?.length) return 0
  if (ts <= track[0].t) return 0
  if (ts >= track[track.length - 1].t) return track.length - 1

  let lo = 0
  let hi = track.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (track[mid].t < ts) lo = mid + 1
    else hi = mid
  }

  const prev = Math.max(0, lo - 1)
  return Math.abs(track[prev].t - ts) <= Math.abs(track[lo].t - ts) ? prev : lo
}

function _sampleIndexForTime(sample, ts) {
  return _indexForTrackTime(sample, ts)
}

function initTimeline(root, track, mapObjs, chartObjs) {
  const tl = root.querySelector('#track-timeline')
  if (!tl) return
  tl.classList.remove('hidden')

  const currentSlider = root.querySelector('#tl-slider')
  const slider = currentSlider.cloneNode(true)
  currentSlider.replaceWith(slider)

  const tlTime = root.querySelector('#tl-time')
  const tlAlt  = root.querySelector('#tl-alt')
  const tlSpd  = root.querySelector('#tl-spd')
  const tlDep  = root.querySelector('#tl-dep')
  const tlArr  = root.querySelector('#tl-arr')

  slider.min = 0
  slider.max = 1000
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
  const startTs = track[0].t
  const endTs   = track[track.length - 1].t
  const spanSec = Math.max(1, endTs - startTs)

  function update(rawValue) {
    const value = Math.max(0, Math.min(rawValue, 1000))
    const cursorTs = startTs + spanSec * (value / 1000)
    const idx = _indexForTrackTime(track, cursorTs)
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
    const si = sample?.length ? _sampleIndexForTime(sample, pt.t) : Math.min(idx, sampleLen - 1)
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
// 判定邏輯在 js/utils/runway.js（可用 node 單獨測試）

/**
 * Detect runway, update UI, and persist to Firestore if not already set.
 */
async function autoDetectRunway(root, track, destIata, flightId, opts = {}) {
  const detected = detectRunway(track, destIata)
  if (!detected) return
  if (opts.current && detected === opts.current) return   // 已經一樣，不用重寫

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
    if (opts.force && opts.current) showToast(`Runway 重新判定為 ${detected}`, 'success')
  } catch (e) {
    console.warn('[Runway] Firestore update failed:', e.message)
  }
}

// ── Runway pre-fetch for Add Flight (no DOM, no Firestore) ──────────
/**
 * Add Flight 選航班時立即背景查跑道，回傳跑道字串或 null。
 * 只需 fn/date/reg/from/to，不需要 OOOI 時間。
 */
export async function fetchRunwayForFlight({ fn, date, rosterDate, reg, from, to }) {
  if (!reg || !date) return null
  const track = await fetchTrackFR24ForFlight({
    flightNumber: fn,
    date,
    rosterDate,
    registration: reg,
    from,
    to,
  })
  if (!track?.length) return null
  return detectRunway(track, to) ?? null
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
  const trackDate = _actualUtcDateForFlight(f)
  const { begin, midpoint } = getTimeRange(trackDate, f.offTime, f.onTime)
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
  if (f.registration && f.date && (!track?.length || _isTrackLikelyPartial(track, f))) {
    const fr24Track = await fetchTrackFR24ForFlight(f)
    if (_isBetterTrack(fr24Track, track)) track = fr24Track
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

function _escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function _crewName(person) {
  return `${person?.firstName || ''} ${person?.lastName || ''}`.trim() ||
         person?.displayName ||
         person?.name ||
         ''
}

function _crewInitials(person) {
  const name = _crewName(person)
  if (!name) return ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function _crewAvatar(person, fallback) {
  return _escapeHtml(_crewInitials(person) || fallback)
}

function _initialCrewSlots(f) {
  const byId = new Map((state.crew || []).map(c => [c.id, c]))
  const ids = Array.isArray(f.crew) ? f.crew : []
  const names = Array.isArray(f.crewNames) ? f.crewNames : []
  const size = Math.max(EDIT_CREW_ROLES.length, ids.length, names.length)
  return Array.from({ length: size }, (_, i) => {
    const id = ids[i]
    if (id && byId.has(id)) return byId.get(id)
    if (id || names[i]) {
      return {
        id: id || '',
        displayName: names[i] || id,
        legacyOnly: !byId.has(id),
      }
    }
    return null
  })
}

function _editCrewSlotsHtml(crewSlots) {
  return crewSlots.map((person, i) => {
    const role = EDIT_CREW_ROLES[i] || `Crew ${i + 1}`
    const name = person ? _crewName(person) || 'Unknown crew' : 'Tap to assign'
    const meta = person?.position || person?.employeeId || (person?.legacyOnly ? 'Saved name only' : '')
    return `
      <div class="crew-slot edit-crew-slot${person ? ' filled' : ''}" data-slot="${i}">
        <div class="crew-avatar">${person ? _crewAvatar(person, String(i + 1)) : String(i + 1)}</div>
        <div class="crew-info">
          <div class="crew-role">${_escapeHtml(role)}</div>
          <div class="crew-name-val">${_escapeHtml(name)}</div>
          ${meta ? `<div class="edit-crew-meta">${_escapeHtml(meta)}</div>` : ''}
        </div>
        <span class="crew-chevron">›</span>
      </div>`
  }).join('')
}

function _renderEditCrewSlots(overlay, crewSlots) {
  const wrap = overlay.querySelector('#ef-crew-slots')
  if (wrap) wrap.innerHTML = _editCrewSlotsHtml(crewSlots)
}

function _openEditCrewPicker(overlay, crewSlots, slotIdx) {
  const sheet = document.createElement('div')
  sheet.className = 'sheet-overlay open'
  sheet.style.zIndex = '10001'

  const renderList = (query = '') => {
    const q = query.trim().toLowerCase()
    const crew = (state.crew || []).filter(c => isCrewActive(c))
    const list = q
      ? crew.filter(c => `${c.firstName || ''} ${c.lastName || ''} ${c.employeeId || ''}`.toLowerCase().includes(q))
      : crew
    const currentId = crewSlots[slotIdx]?.id || ''
    const clearRow = crewSlots[slotIdx] ? `
      <div class="sheet-crew-item edit-crew-clear" data-clear="1">
        <div class="sci-avatar">-</div>
        <div class="sci-name">Clear this slot</div>
      </div>` : ''
    const rows = list.length ? list.map(c => `
      <div class="sheet-crew-item" data-id="${_escapeHtml(c.id)}">
        <div class="sci-avatar">${_crewAvatar(c, '')}</div>
        <div class="sci-name">${_escapeHtml(_crewName(c))}
          <span style="font-size:11px;color:var(--text-dim);display:block">${_escapeHtml(c.position || c.employeeId || '')}</span>
        </div>
        ${c.id === currentId ? '<span class="sci-check">✓</span>' : ''}
      </div>`).join('') : `
      <div style="padding:24px;text-align:center;color:var(--text-faint);font-size:13px">
        ${q ? 'No crew found' : 'No active crew'}
      </div>`
    sheet.querySelector('#edit-crew-list').innerHTML = clearRow + rows
  }

  sheet.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-head-title">Select Crew</div>
        <button class="sheet-close" id="edit-crew-close">✕</button>
      </div>
      <div class="sheet-search-wrap">
        <input class="sheet-search-input" id="edit-crew-search"
               type="text" placeholder="Search by name or staff ID..."
               autocomplete="off" autocorrect="off">
      </div>
      <div class="sheet-list" id="edit-crew-list"></div>
    </div>`
  document.body.appendChild(sheet)
  renderList()

  const search = sheet.querySelector('#edit-crew-search')
  setTimeout(() => search?.focus(), 80)
  search?.addEventListener('input', () => renderList(search.value))
  sheet.querySelector('#edit-crew-close')?.addEventListener('click', () => sheet.remove())
  sheet.querySelector('#edit-crew-list')?.addEventListener('click', e => {
    const row = e.target.closest('.sheet-crew-item')
    if (!row) return
    if (row.dataset.clear) {
      crewSlots[slotIdx] = null
    } else {
      const person = (state.crew || []).find(c => c.id === row.dataset.id)
      if (!person) return
      for (let i = 0; i < crewSlots.length; i++) {
        if (crewSlots[i]?.id === person.id) crewSlots[i] = null
      }
      crewSlots[slotIdx] = person
    }
    _renderEditCrewSlots(overlay, crewSlots)
    sheet.remove()
  })
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.remove() })
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
  const crewSlots = _initialCrewSlots(f)

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
    <div class="modal-sheet edit-flight-sheet">
      <div class="modal-handle"></div>
      <div class="edit-flight-head">
        <div>
          <div class="modal-title">Edit Flight</div>
          <div class="edit-flight-route">${f.from || '???'} → ${f.to || '???'}</div>
        </div>
        <div class="edit-flight-chip">${f.flightNumber || '—'}</div>
      </div>

      <div class="edit-section">
        <div class="edit-section-title">Flight</div>
        <div class="edit-grid two">
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
        <div class="edit-grid two">
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
      </div>

      <div class="edit-section">
        <div class="edit-section-title">Times</div>
        <div class="edit-grid four">
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
        <div class="form-group edit-night-field">
          <label class="form-label">Night Time</label>
          <input class="form-input mono" id="ef-night" type="text"
                 value="${_minHm(f.nightTime)}" placeholder="H:MM">
        </div>
      </div>

      <div class="edit-section">
        <div class="edit-section-title">Aircraft</div>
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
        <div class="edit-grid two">
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
      </div>

      <div class="edit-section">
        <div class="edit-section-title">Piloting</div>
        ${['pfTakeoff','pfLanding','pic','autoland','goAround','diverted'].map(yn).join('')}
      </div>

      <div class="edit-section">
        <div class="edit-section-title">Load</div>
        <div class="edit-grid three">
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
      </div>

      <div class="edit-section">
        <div class="edit-section-title">Crew</div>
        <div class="crew-slots edit-crew-slots" id="ef-crew-slots">
          ${_editCrewSlotsHtml(crewSlots)}
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

  overlay.querySelector('#ef-crew-slots')?.addEventListener('click', e => {
    const slot = e.target.closest('.edit-crew-slot')
    if (!slot) return
    _openEditCrewPicker(overlay, crewSlots, parseInt(slot.dataset.slot, 10))
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

    const nextDate = overlay.querySelector('#ef-date').value || f.date
    const nextOut  = isValidHm(outV) ? normalizeHm(outV) : f.outTime
    const nextOff  = isValidHm(offV) ? normalizeHm(offV) : f.offTime

    const changes = {
      date:               _dateAfterActualTimeEdit(f, nextDate, nextOut, nextOff),
      flightNumber:       (overlay.querySelector('#ef-fn').value    || '').toUpperCase() || f.flightNumber,
      from:               (overlay.querySelector('#ef-from').value  || '').toUpperCase() || f.from,
      to:                 (overlay.querySelector('#ef-to').value    || '').toUpperCase() || f.to,
      outTime:            nextOut,
      offTime:            nextOff,
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
      crew:               crewSlots.filter(c => c?.id && !c.legacyOnly).map(c => c.id),
      crewNames:          crewSlots.filter(Boolean).map(c => _crewName(c)).filter(Boolean),
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
      setupTrackRefresh(root, newF, flightId)
      const titleEl = root.querySelector('#detail-title')
      if (titleEl) titleEl.textContent = `${newF.from || '?'} → ${newF.to || '?'}`
      if (newF.offTime && newF.onTime) {
        tryFetchTrack(root, newF, flightId, { force: true }).catch(() => {})
      }
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
