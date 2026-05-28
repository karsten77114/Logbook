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
      renderMap(root, f.flightTrack)
      renderCharts(root, f.flightTrack)
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
      </div>

      <!-- Charts placeholder -->
      <div class="detail-card hidden" id="charts-card">
        <div class="detail-card-title">Altitude Profile</div>
        <canvas id="chart-altitude" style="width:100%;max-height:160px"></canvas>
        <div class="detail-card-title" style="margin-top:16px">Groundspeed</div>
        <canvas id="chart-speed" style="width:100%;max-height:120px"></canvas>
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
      renderMap(root, track)
      renderCharts(root, track)
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


function _initMap(wrap) {
  wrap.innerHTML = `<div id="track-map" style="height:240px;border-radius:var(--radius)"></div>`
  const map = L.map('track-map', { zoomControl: false, attributionControl: false })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map)
  return map
}

/** ADS-B 實際軌跡（藍色實線） */
function renderMap(root, track) {
  if (!track?.length || typeof L === 'undefined') return
  const wrap = root.querySelector('#track-map-wrap')
  if (!wrap) return
  const map     = _initMap(wrap)
  const latlngs = track.map(p => [p.la, p.lo])
  const line    = L.polyline(latlngs, { color: '#00b4d8', weight: 2, opacity: 0.8 }).addTo(map)
  map.fitBounds(line.getBounds(), { padding: [20, 20] })
}


function renderCharts(root, track) {
  if (!track?.length || typeof Chart === 'undefined') return

  const card = root.querySelector('#charts-card')
  if (card) card.classList.remove('hidden')

  // Sample every 5 points for performance
  const sample   = track.filter((_, i) => i % 5 === 0)
  const labels   = sample.map(p => {
    const d = new Date(p.t * 1000)
    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
  })
  const altData  = sample.map(p => p.a)
  const spdData  = sample.map(p => p.s)

  const chartOpts = (color) => ({
    type: 'line',
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      elements: { point: { radius: 0 }, line: { tension: 0.3 } },
      scales: {
        x: { ticks: { color: '#6888a0', font: { size: 10 } }, grid: { color: '#1e2d3d' } },
        y: { ticks: { color: '#6888a0', font: { size: 10 } }, grid: { color: '#1e2d3d' } },
      },
    },
    data: {
      labels,
      datasets: [{ data: altData, borderColor: color, borderWidth: 1.5, fill: false }],
    },
  })

  const altCtx = root.querySelector('#chart-altitude')?.getContext('2d')
  if (altCtx) new Chart(altCtx, { ...chartOpts('#00b4d8'), data: { labels, datasets: [{ data: altData, borderColor: '#00b4d8', borderWidth:1.5, fill:false }] } })

  const spdCtx = root.querySelector('#chart-speed')?.getContext('2d')
  if (spdCtx) new Chart(spdCtx, { ...chartOpts('#f0a030'), data: { labels, datasets: [{ data: spdData, borderColor: '#f0a030', borderWidth:1.5, fill:false }] } })
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
