// ══════════════════════════════════════════════
// Crew Detail — 統計 + 航班歷史
// ══════════════════════════════════════════════
import { getAllFlights, saveCrew, deleteCrew } from '../db.js'
import { state, setCrew, isCrewActive }        from '../state.js'
import { navigate, showToast }                 from '../app.js'
import { fmtDuration }                         from '../utils/time.js'

export async function renderCrewDetail(root, params) {
  const crewId = params[0]
  const person = (state.crew || []).find(c => c.id === crewId)
  if (!person) { navigate('list'); return }

  // Loading shell
  root.innerHTML = `
    <div class="page">
      <div class="topbar">
        <button class="topbar-action btn-back" id="btn-back">‹</button>
        <div class="topbar-title">${person.firstName} ${person.lastName}</div>
        <button class="topbar-action" id="btn-edit" style="font-size:14px;letter-spacing:0.04em">Edit</button>
      </div>
      <div class="scroll" id="crew-detail-scroll">
        <div class="list-loading"><div class="loader"></div></div>
      </div>
    </div>`

  root.querySelector('#btn-back').addEventListener('click', () => navigate('list'))

  try {
    const allFlights = await getAllFlights(state.user.uid)
    const name       = `${person.firstName} ${person.lastName}`.trim()

    // Match by crew ID array or crewNames array
    const together = allFlights.filter(f =>
      f.crew?.includes(crewId) ||
      f.crewNames?.some(n => n.trim() === name)
    ).sort((a, b) => b.date.localeCompare(a.date))

    const sectors  = together.length
    const blockMin = together.reduce((s, f) => s + (f.blockTime || 0), 0)
    const airports = new Set()
    together.forEach(f => { if (f.from) airports.add(f.from); if (f.to) airports.add(f.to) })

    const stats = { sectors, blockMin, airports: airports.size }
    _paintDetail(root, person, stats, together)
  } catch (e) {
    root.querySelector('#crew-detail-scroll').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">載入失敗</div>
        <div class="empty-state-sub">${e.message}</div>
      </div>`
  }
}

function _paintDetail(root, person, stats, flights) {
  const scroll   = root.querySelector('#crew-detail-scroll')
  const active   = isCrewActive(person)
  const initials = `${person.firstName?.[0] || ''}${person.lastName?.[0] || ''}`.toUpperCase() || '?'

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
      <div class="cd-avatar">${initials}</div>
      <div class="cd-name">${person.firstName} ${person.lastName}</div>
      <div class="cd-position">${person.position || '—'}</div>
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
      ${_infoRow('#', 'Employee ID',    person.employeeId    || '—')}
      ${_infoRow('📋', 'Licence No.',   person.licenceNumber || '—')}
      ${_infoRow('🌏', 'Nationality',   person.nationality   || '—')}
      ${_infoRow('●', 'Status',
        `<span class="hub-status-badge ${active ? 'badge-active' : 'badge-inactive'}" style="font-size:10px">
          ${active ? 'Active' : 'Inactive'}
        </span>`
      )}
    </div>

    <!-- Flights together -->
    <div class="cd-flights-header">FLIGHTS TOGETHER</div>
    ${flights.length === 0
      ? `<div class="empty-state" style="padding:40px 0">
           <div class="empty-state-icon">✈</div>
           <div class="empty-state-sub">尚無共同航班記錄</div>
         </div>`
      : Object.entries(byYear).map(([yr, fls]) => `
          <div class="cd-year-label">${yr}</div>
          ${fls.map(f => _flightRowHtml(f)).join('')}
        `).join('')
    }
    <div style="height:32px"></div>
  `

  // Edit button
  root.querySelector('#btn-edit')?.addEventListener('click', () => {
    _showEditSheet(root, person)
  })

  // Flight rows → detail
  root.querySelectorAll('[data-flight-id]').forEach(row => {
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
  const dateStr   = mo && d ? `${_MON[parseInt(mo,10)-1]} ${d}` : f.date || ''
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

// ── Edit sheet ─────────────────────────────────

function _showEditSheet(root, person) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">編輯機師</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">名字</label>
          <input class="form-input" id="cr-first" type="text" value="${person.firstName || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">姓氏</label>
          <input class="form-input" id="cr-last" type="text" value="${person.lastName || ''}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">職位</label>
        <select class="form-select" id="cr-position">
          <option value="" ${!person.position ? 'selected' : ''}>— 未設定 —</option>
          ${['FO','SFO','CA','Check Captain','學生機師','其他'].map(p =>
            `<option value="${p}" ${p === person.position ? 'selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Employee ID</label>
          <input class="form-input mono" id="cr-empid" type="text"
                 value="${person.employeeId || ''}" placeholder="59989">
        </div>
        <div class="form-group">
          <label class="form-label">Licence No.</label>
          <input class="form-input mono" id="cr-licence" type="text"
                 value="${person.licenceNumber || ''}" placeholder="103077">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Nationality</label>
        <input class="form-input" id="cr-national" type="text"
               value="${person.nationality || ''}" placeholder="Taiwan">
      </div>

      <div class="form-group">
        <label class="form-label">狀態</label>
        <div class="hub-toggle-row" id="cr-active-toggle" data-active="${person.active !== false}">
          <span class="hub-toggle-label" id="cr-active-label">
            ${person.active !== false ? '✓ Active' : '✕ Inactive'}
          </span>
          <div class="hub-toggle-switch ${person.active !== false ? 'on' : ''}"></div>
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="crew-save">儲存</button>
      <button class="btn btn-danger btn-full" id="crew-del">刪除此機師</button>
    </div>`
  document.body.appendChild(overlay)

  // Active toggle
  const toggleRow    = overlay.querySelector('#cr-active-toggle')
  const toggleSwitch = overlay.querySelector('.hub-toggle-switch')
  const toggleLabel  = overlay.querySelector('#cr-active-label')
  toggleRow?.addEventListener('click', () => {
    const nowActive = toggleRow.dataset.active !== 'true'
    toggleRow.dataset.active = nowActive
    toggleSwitch?.classList.toggle('on', nowActive)
    if (toggleLabel) toggleLabel.textContent = nowActive ? '✓ Active' : '✕ Inactive'
  })

  overlay.querySelector('#crew-save').addEventListener('click', async () => {
    const data = {
      firstName:     overlay.querySelector('#cr-first').value.trim(),
      lastName:      overlay.querySelector('#cr-last').value.trim(),
      position:      overlay.querySelector('#cr-position').value,
      employeeId:    overlay.querySelector('#cr-empid').value.trim(),
      licenceNumber: overlay.querySelector('#cr-licence').value.trim(),
      nationality:   overlay.querySelector('#cr-national').value.trim(),
      active:        toggleRow?.dataset.active !== 'false',
    }
    if (!data.firstName && !data.lastName) { showToast('請填入名字', 'error'); return }
    try {
      await saveCrew(state.user.uid, person.id, data)
      const idx = state.crew.findIndex(c => c.id === person.id)
      if (idx >= 0) state.crew[idx] = { id: person.id, ...data }
      overlay.remove()
      showToast('已更新', 'success')
      // Re-render with updated person
      navigate('crew-detail/' + person.id)
    } catch (e) {
      showToast('儲存失敗', 'error')
    }
  })

  overlay.querySelector('#crew-del').addEventListener('click', async () => {
    if (!confirm('確定刪除？')) return
    await deleteCrew(state.user.uid, person.id)
    state.crew = state.crew.filter(c => c.id !== person.id)
    setCrew(state.crew)
    overlay.remove()
    navigate('list')
    showToast('已刪除', 'success')
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}
