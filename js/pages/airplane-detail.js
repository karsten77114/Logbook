// ══════════════════════════════════════════════
// Airplane Detail — 統計 + 航班歷史
// ══════════════════════════════════════════════
import { getAllFlights, saveAircraftSettings,
         saveCustomAircraft }                  from '../db.js'
import { state, setAircraftSettings,
         setCustomAircraft, isAircraftActive } from '../state.js'
import { navigate, showToast }                 from '../app.js'
import { fmtDuration }                         from '../utils/time.js'
import { FLEET }                               from '../data/fleet.js'

export async function renderAirplaneDetail(root, params) {
  const reg    = decodeURIComponent(params[0] || '')
  const info   = FLEET[reg] || (state.customAircraft || []).find(a => a.reg === reg)
  const custom = !FLEET[reg] && !!info
  if (!reg || !info) { navigate('list'); return }

  // Loading shell
  root.innerHTML = `
    <div class="page">
      <div class="topbar">
        <button class="topbar-action btn-back" id="btn-back">‹</button>
        <div class="topbar-title mono" style="letter-spacing:0.05em">${reg}</div>
        ${custom
          ? `<button class="topbar-action" id="btn-edit-ac" style="font-size:14px;letter-spacing:0.04em;color:var(--accent)">Edit</button>`
          : `<div style="width:44px"></div>`
        }
      </div>
      <div class="scroll" id="ad-scroll">
        <div class="list-loading"><div class="loader"></div></div>
      </div>
    </div>`

  root.querySelector('#btn-back').addEventListener('click', () => navigate('list'))

  root.querySelector('#btn-edit-ac')?.addEventListener('click', () => {
    _showAircraftEditSheet(root, reg, info)
  })

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
    _paintDetail(root, reg, info, stats, together, custom)
  } catch (e) {
    root.querySelector('#ad-scroll').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">Load failed</div>
        <div class="empty-state-sub">${e.message}</div>
      </div>`
  }
}

function _paintDetail(root, reg, info, stats, flights, isCustom = false) {
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

// ── Edit sheet for custom aircraft ────────────

function _showAircraftEditSheet(root, reg, info) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">Edit Aircraft</div>

      <div class="form-group">
        <label class="form-label">Registration</label>
        <input class="form-input mono" id="ae-reg" type="text"
               value="${info.reg || reg}" readonly style="opacity:0.6">
      </div>
      <div class="form-group">
        <label class="form-label">Aircraft Type</label>
        <input class="form-input mono" id="ae-type" type="text"
               value="${info.type || ''}" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Airline / Operator</label>
        <input class="form-input" id="ae-airline" type="text"
               value="${info.airline || ''}" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">MSN (optional)</label>
        <input class="form-input mono" id="ae-msn" type="text"
               value="${info.msn || ''}" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">ICAO24 hex (optional)</label>
        <input class="form-input mono" id="ae-icao24" type="text"
               value="${info.icao24 || ''}" maxlength="6" autocomplete="off">
      </div>
      <button class="btn btn-primary btn-full" id="ae-save">Save Changes</button>
      <button class="btn btn-danger btn-full" id="ae-del">Delete Aircraft</button>
    </div>`
  document.body.appendChild(overlay)

  overlay.querySelector('#ae-save').addEventListener('click', async () => {
    const type    = (overlay.querySelector('#ae-type').value    || '').trim()
    const airline = (overlay.querySelector('#ae-airline').value || '').trim()
    const msn     = (overlay.querySelector('#ae-msn').value     || '').trim()
    const icao24  = (overlay.querySelector('#ae-icao24').value  || '').trim().toLowerCase()
    if (!type) { showToast('Type is required', 'error'); return }

    const updated = (state.customAircraft || []).map(a =>
      a.reg === reg ? { reg, type, airline, msn, icao24 } : a
    )
    try {
      await saveCustomAircraft(state.user.uid, updated)
      setCustomAircraft(updated)
      overlay.remove()
      showToast('Updated', 'success')
      navigate('airplane-detail/' + encodeURIComponent(reg))
    } catch (e) {
      showToast('Save failed', 'error')
    }
  })

  overlay.querySelector('#ae-del').addEventListener('click', async () => {
    if (!confirm(`Delete ${reg}? This will not delete existing flight records.`)) return
    const updated = (state.customAircraft || []).filter(a => a.reg !== reg)
    try {
      await saveCustomAircraft(state.user.uid, updated)
      setCustomAircraft(updated)
      overlay.remove()
      navigate('list')
      showToast('Deleted', 'success')
    } catch (e) {
      showToast('Delete failed', 'error')
    }
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}
