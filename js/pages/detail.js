// ══════════════════════════════════════════════
// Flight Detail Page
// ══════════════════════════════════════════════
import { getFlight, deleteFlight, updateFlight } from '../db.js'
import { state }                                  from '../state.js'
import { navigate, showToast }                    from '../app.js'
import { invalidateStats }                        from './list.js'
import { fmtDate, fmtDuration }                   from '../utils/time.js'
import { fetchTrack, getTimeRange }               from '../utils/opensky.js'
import { FLEET }                                  from '../data/fleet.js'

export async function renderDetail(root, params) {
  const flightId = params[0]
  if (!flightId) { navigate('list'); return }

  root.innerHTML = `
    <div class="page">
      <div class="topbar">
        <button class="topbar-action btn-back" id="btn-back">‹</button>
        <div class="topbar-title" id="detail-title">…</div>
        <button class="topbar-action" id="btn-delete" style="color:var(--red)">⌫</button>
      </div>
      <div class="scroll" id="detail-scroll">
        <div class="list-loading"><div class="loader"></div></div>
      </div>
    </div>`

  root.querySelector('#btn-back').addEventListener('click', () => navigate('list'))

  try {
    const f = await getFlight(state.user.uid, flightId)
    if (!f) { showToast('找不到記錄', 'error'); navigate('list'); return }

    root.querySelector('#detail-title').textContent =
      `${f.from || '?'} → ${f.to || '?'}`

    root.querySelector('#detail-scroll').innerHTML = buildDetailHtml(f)

    // Delete button
    root.querySelector('#btn-delete').addEventListener('click', () => {
      showConfirm(root, async () => {
        await deleteFlight(state.user.uid, flightId)
        invalidateStats()
        showToast('已刪除', 'success')
        navigate('list')
      })
    })

    // Try to fetch track if none stored
    if (!f.flightTrack && f.offTime && f.onTime) {
      tryFetchTrack(root, f)
    } else if (f.flightTrack?.length > 0) {
      renderTrack(root, f.flightTrack)
    }

  } catch (e) {
    root.querySelector('#detail-scroll').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">載入失敗</div>
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
        ${detailRow('Runway',       f.runway        || '—')}
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
            正在查詢軌跡資料…
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

async function tryFetchTrack(root, f) {
  const wrap = root.querySelector('#track-map-wrap')
  if (!wrap) return

  // Ground ops: no airborne time → skip
  if (f.flightTime === 0 && f.offTime === '00:00' && f.onTime === '00:00') {
    wrap.innerHTML = `<div style="color:var(--text-faint);font-size:12px;text-align:center;padding:20px">
      地面操作，無飛行軌跡</div>`
    return
  }

  // Resolve ICAO24 from flight record or fleet lookup
  const icao24 = (f.icao24 || FLEET[f.registration]?.icao24 || '').trim().toLowerCase()

  const doFetch = async (ic) => {
    wrap.innerHTML = `<div style="color:var(--text-faint);font-size:13px;text-align:center;padding:24px">
      ⏳ 查詢 ADS-B 軌跡中…</div>`

    const { begin, midpoint } = getTimeRange(f.date, f.offTime, f.onTime)
    const tooOld = (Date.now() / 1000 - begin) > 30 * 86400

    // Strategy 1: OpenSky (direct browser + Worker proxy)
    let track = null
    if (ic && !tooOld) track = await fetchTrack(ic, midpoint)

    // Strategy 2: FR24 via Worker proxy (works when Cloudflare allows)
    if (!track?.length && f.registration && f.date) {
      wrap.innerHTML = `<div style="color:var(--text-faint);font-size:13px;text-align:center;padding:24px">
        ⏳ 查詢 FR24 軌跡中…</div>`
      track = await fetchTrackFR24(f.registration, f.date, f.from, f.to, f.flightNumber)
    }

    if (track?.length) {
      renderTrack(root, track)
    } else {
      wrap.innerHTML = `<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">
        暫無 ADS-B 軌跡資料</div>`
    }
  }

  if (icao24) {
    doFetch(icao24)
  } else {
    // 先查 hexdb.io 取得 ICAO24
    wrap.innerHTML = `<div style="color:var(--text-faint);font-size:13px;text-align:center;padding:24px">
      ⏳ 查詢機號中…</div>`
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

function _planeIcon(hdg) {
  return L.divIcon({
    html: `<div style="transform:rotate(${Math.round(hdg)}deg);font-size:20px;line-height:1;
                       text-shadow:0 0 6px #000,0 0 12px #000;color:#fff">✈</div>`,
    className: 'plane-marker-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

// ── Map ────────────────────────────────────────

function _initMap(wrap) {
  wrap.innerHTML = `<div id="track-map" style="height:240px;border-radius:var(--radius)"></div>`
  const map = L.map('track-map', { zoomControl: false, attributionControl: false })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map)
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
  L.polyline(latlngs, { color: '#00b4d8', weight: 2, opacity: 0.25 }).addTo(map)
  // Bright "flown" line (filled by timeline scrubber)
  const flownLine = L.polyline([], { color: '#00d4f8', weight: 3, opacity: 0.9 }).addTo(map)

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

// ── Delete Confirm ─────────────────────────────

function showConfirm(root, onConfirm) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet" style="gap:20px">
      <div class="modal-handle"></div>
      <div style="text-align:center; font-size:16px; color:var(--text)">確定刪除這筆記錄？</div>
      <div style="text-align:center; font-size:13px; color:var(--text-dim)">此操作無法復原</div>
      <button class="btn btn-danger btn-full" id="confirm-del">確定刪除</button>
      <button class="btn btn-secondary btn-full" id="cancel-del">取消</button>
    </div>`

  document.body.appendChild(overlay)
  overlay.querySelector('#cancel-del').addEventListener('click', () => overlay.remove())
  overlay.querySelector('#confirm-del').addEventListener('click', () => {
    overlay.remove()
    onConfirm()
  })
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}
