// ══════════════════════════════════════════════
// Airplane Detail — 統計 + 航班歷史
// ══════════════════════════════════════════════
import { getAllFlights, saveAircraftSettings } from '../db.js'
import { state, setAircraftSettings,
         isAircraftActive }                    from '../state.js'
import { navigate, showToast }                 from '../app.js'
import { fmtDuration }                         from '../utils/time.js'
import { FLEET }                               from '../data/fleet.js'

export async function renderAirplaneDetail(root, params) {
  const reg  = params[0]
  const info = FLEET[reg]
  if (!reg || !info) { navigate('list'); return }

  // Loading shell
  root.innerHTML = `
    <div class="page">
      <div class="topbar">
        <button class="topbar-action btn-back" id="btn-back">‹</button>
        <div class="topbar-title mono" style="letter-spacing:0.05em">${reg}</div>
        <div style="width:44px"></div>
      </div>
      <div class="scroll" id="ad-scroll">
        <div class="list-loading"><div class="loader"></div></div>
      </div>
    </div>`

  root.querySelector('#btn-back').addEventListener('click', () => navigate('list'))

  try {
    const allFlights = await getAllFlights(state.user.uid)

    // Match by registration
    const together = allFlights
      .filter(f => f.registration === reg)
      .sort((a, b) => b.date.localeCompare(a.date))

    const sectors  = together.length
    const blockMin = together.reduce((s, f) => s + (f.blockTime || 0), 0)
    const airports = new Set()
    together.forEach(f => {
      if (f.from) airports.add(f.from)
      if (f.to)   airports.add(f.to)
    })

    const stats = { sectors, blockMin, airports: airports.size }
    _paintDetail(root, reg, info, stats, together)
  } catch (e) {
    root.querySelector('#ad-scroll').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">Load failed</div>
        <div class="empty-state-sub">${e.message}</div>
      </div>`
  }
}

function _paintDetail(root, reg, info, stats, flights) {
  const scroll = root.querySelector('#ad-scroll')
  const active = isAircraftActive(reg)

  // Group flights by year
  const byYear = {}
  flights.forEach(f => {
    const yr = (f.date || '').slice(0, 4) || '—'
    if (!byYear[yr]) byYear[yr] = []
    byYear[yr].push(f)
  })

  scroll.innerHTML = `
    <!-- Profile card -->
    <div class="cd-profile-card">
      <div class="cd-avatar ad-plane-icon">✈</div>
      <div class="cd-name mono" style="letter-spacing:0.06em">${reg}</div>
      <div class="cd-position">${info.type} · ${info.airline || ''}</div>
      <div class="cd-stats-row">
        <div class="cd-stat">
          <div class="cd-stat-val">${stats.sectors}</div>
          <div class="cd-stat-lbl">Flights</div>
        </div>
        <div class="cd-stat-divider"></div>
        <div class="cd-stat">
          <div class="cd-stat-val mono">${fmtDuration(stats.blockMin)}</div>
          <div class="cd-stat-lbl">Block Time</div>
        </div>
        <div class="cd-stat-divider"></div>
        <div class="cd-stat">
          <div class="cd-stat-val">${stats.airports}</div>
          <div class="cd-stat-lbl">Airports</div>
        </div>
      </div>
    </div>

    <!-- Info rows -->
    <div class="cd-section">
      ${_infoRow('✈', 'Aircraft Type', info.type)}
      ${_infoRow('🏢', 'Airline',       info.airline || '—')}
      ${_infoRow('●', 'Status',
        `<span class="hub-status-badge ${active ? 'badge-active' : 'badge-inactive'}" style="font-size:10px">
          ${active ? 'Active' : 'Inactive'}
        </span>`
      )}
    </div>

    <!-- Active toggle -->
    <div class="cd-section" style="padding:0 16px">
      <div class="hub-toggle-row" id="ad-active-toggle" data-active="${active}">
        <span class="hub-toggle-label" id="ad-active-label"
              style="color:var(--text);font-size:14px">
          ${active ? '✓ Active' : '✕ Inactive'}
        </span>
        <div class="hub-toggle-switch ${active ? 'on' : ''}"></div>
      </div>
    </div>

    <!-- Flights -->
    <div class="cd-flights-header">FLIGHT HISTORY</div>
    ${flights.length === 0
      ? `<div class="empty-state" style="padding:40px 0">
           <div class="empty-state-icon">✈</div>
           <div class="empty-state-sub">No flight records for this aircraft</div>
         </div>`
      : Object.entries(byYear).map(([yr, fls]) => `
          <div class="cd-year-label">${yr}</div>
          ${fls.map(f => _flightRowHtml(f)).join('')}
        `).join('')
    }
    <div style="height:32px"></div>
  `

  // Active toggle logic
  const toggleRow    = scroll.querySelector('#ad-active-toggle')
  const toggleSwitch = scroll.querySelector('.hub-toggle-switch')
  const toggleLabel  = scroll.querySelector('#ad-active-label')
  let   _active      = active

  toggleRow?.addEventListener('click', async () => {
    _active = !_active
    toggleRow.dataset.active = _active
    toggleSwitch?.classList.toggle('on', _active)
    if (toggleLabel) toggleLabel.textContent = _active ? '✓ Active' : '✕ Inactive'

    // Also update the status badge in the info section
    const badge = scroll.querySelector('.hub-status-badge')
    if (badge) {
      badge.className = `hub-status-badge ${_active ? 'badge-active' : 'badge-inactive'}`
      badge.style.fontSize = '10px'
      badge.textContent = _active ? 'Active' : 'Inactive'
    }

    const newSettings = {
      ...state.aircraftSettings,
      [reg]: { active: _active },
    }
    setAircraftSettings(newSettings)
    try {
      await saveAircraftSettings(state.user.uid, newSettings)
      showToast(_active ? 'Set to Active' : 'Set to Inactive', 'success')
    } catch (e) {
      showToast('Save failed', 'error')
      // Revert
      _active = !_active
      setAircraftSettings({ ...newSettings, [reg]: { active: _active } })
      toggleRow.dataset.active = _active
      toggleSwitch?.classList.toggle('on', _active)
      if (toggleLabel) toggleLabel.textContent = _active ? '✓ Active' : '✕ Inactive'
    }
  })

  // Flight rows → detail
  scroll.querySelectorAll('[data-flight-id]').forEach(row => {
    row.addEventListener('click', () => navigate('detail/' + row.dataset.flightId))
  })
}

function _infoRow(icon, label, valueHtml) {
  return `
    <div class="cd-info-row">
      <span class="cd-info-icon">${icon}</span>
      <span class="cd-info-label">${label}</span>
      <span class="cd-info-value">${valueHtml}</span>
    </div>`
}

function _flightRowHtml(f) {
  const [, mo, d] = (f.date || '').split('-')
  return `
    <div class="cd-flight-row" data-flight-id="${f.id}">
      <div class="cd-flight-date">
        <div class="cd-flight-day">${d || ''}</div>
        <div class="cd-flight-mon">${_MON[parseInt(mo,10)-1] || ''}</div>
      </div>
      <div class="cd-flight-route">
        <div class="cd-flight-route-main">${f.from || '?'} → ${f.to || '?'}</div>
        <div class="cd-flight-fn">${f.flightNumber || ''}</div>
      </div>
      <div class="cd-flight-block mono">${fmtDuration(f.blockTime)}</div>
    </div>`
}

const _MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
