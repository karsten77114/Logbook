// ══════════════════════════════════════════════
// Flights Hub — Flights / Crew / Airplanes / Experience
// ══════════════════════════════════════════════
import { getFlights, getAllFlights,
         getCareer, saveCareer,
         getCrew, saveCrew, deleteCrew,
         getAircraftSettings, saveAircraftSettings,
         saveCustomAircraftList }                   from '../db.js'
import { state, setCareer, setCrew,
         setAircraftSettings, setCustomAircraft,
         isAircraftActive, isCrewActive }            from '../state.js'
import { fmtDate, fmtDuration }                      from '../utils/time.js'
import { FLEET, ALL_REGISTRATIONS, getTypeByReg }    from '../data/fleet.js'
import { navigate, showToast }                       from '../app.js'
import { showCountryPicker, getCountryName }         from '../data/countries.js'
import { navIcon }                                   from '../ui/nav-icons.js'

// ── Module-level state ────────────────────────
let _section    = 'flights'  // flights | crew | airplanes | experience
let _allStats   = null       // cached stats
let _allFlights = null       // cached all flights (avoid double-fetch)

const SECTIONS = [
  { id: 'flights',    label: 'Flights',    icon: '✈' },
  { id: 'crew',       label: 'Crew',       icon: '👥' },
  { id: 'airplanes',  label: 'Airplanes',  icon: '🛩' },
  { id: 'experience', label: 'Experience', icon: '🕐' },
]

// ── Main entry ────────────────────────────────
export async function renderList(root) {
  root.innerHTML = buildShell()
  attachNav(root)
  attachDropdown(root)

  // Load data needed across sections
  await refreshData(root)
  renderSection(root)
}

async function refreshData(root) {
  const uid = state.user.uid
  try {
    const [crew, career, aircraftSettings] = await Promise.all([
      getCrew(uid).catch(() => []),
      getCareer(uid).catch(() => []),
      getAircraftSettings(uid).catch(() => ({})),
    ])
    setCrew(crew)
    setCareer(career)
    setAircraftSettings(aircraftSettings)
  } catch (e) {
    console.error('[Hub] refreshData error:', e)
  }
}

// ── Shell HTML ────────────────────────────────
function buildShell() {
  const sec = SECTIONS.find(s => s.id === _section) || SECTIONS[0]
  return `
    <div class="page" id="list-page">

      <div class="topbar" id="list-topbar">
        <div style="width:44px"></div>
        <button class="hub-title-btn" id="hub-title-btn">
          <span id="hub-title-text">${sec.label}</span>
          <span class="hub-chevron" id="hub-chevron">▾</span>
        </button>
        <button class="topbar-action" id="hub-top-add"
                style="font-size:22px;visibility:hidden;pointer-events:none" title="Add">＋</button>
      </div>

      <!-- Dropdown -->
      <div class="hub-dropdown" id="hub-dropdown">
        ${SECTIONS.map(s => `
          <div class="hub-option ${s.id === _section ? 'hub-option-active' : ''}"
               data-section="${s.id}">
            <span class="hub-opt-icon">${s.icon}</span>
            <span class="hub-opt-label">${s.label}</span>
            <span class="hub-opt-check">${s.id === _section ? '✓' : ''}</span>
          </div>`).join('')}
      </div>

      <!-- Stats strip (Flights only) -->
      <div class="stats-header" id="stats-header" style="display:none">
        ${[...Array(6)].map(() => `
          <div class="stat-cell">
            <div class="stat-label">…</div>
            <div class="stat-value">—</div>
          </div>`).join('')}
      </div>

      <!-- Search (Flights only) -->
      <div class="search-bar" id="search-bar" style="display:none">
        <input class="search-input" id="search-input" type="search"
               placeholder="Flight, airport, crew…" autocomplete="off">
      </div>

      <!-- Content -->
      <div class="scroll" id="list-scroll" style="min-height:0"></div>

      <!-- FAB (Flights only) -->
      <button class="fab" id="fab-add" title="Add Flight" style="display:none">＋</button>

      ${bottomNav()}
    </div>`
}

// ── Bottom nav ────────────────────────────────
function bottomNav() {
  const items = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'list',      label: 'Flights'   },
    { id: 'roster',    label: 'Roster'    },
    { id: 'settings',  label: 'Settings'  },
  ]
  return `
    <nav class="bottom-nav">
      ${items.map(i => `
        <button class="nav-item ${i.id === 'list' ? 'active' : ''}"
                data-nav="${i.id}">
          <span class="nav-icon">${navIcon(i.id)}</span>
          <span>${i.label}</span>
        </button>`).join('')}
    </nav>`
}

function attachNav(root) {
  root.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav))
  })
  root.querySelector('#fab-add')?.addEventListener('click', () => navigate('add'))
}

// ── Dropdown ──────────────────────────────────
function attachDropdown(root) {
  const titleBtn  = root.querySelector('#hub-title-btn')
  const dropdown  = root.querySelector('#hub-dropdown')
  const chevron   = root.querySelector('#hub-chevron')

  titleBtn?.addEventListener('click', e => {
    e.stopPropagation()
    const open = dropdown.classList.toggle('hub-dropdown-open')
    if (chevron) chevron.textContent = open ? '▴' : '▾'
  })

  dropdown?.querySelectorAll('[data-section]').forEach(opt => {
    opt.addEventListener('click', () => {
      _section = opt.dataset.section
      closeDropdown(root)
      renderSection(root)
    })
  })

  // Close on outside tap
  document.addEventListener('click', function _close() {
    closeDropdown(root)
    // Remove listener when page changes
    if (!document.contains(titleBtn)) {
      document.removeEventListener('click', _close)
    }
  })
}

function closeDropdown(root) {
  const dropdown = root.querySelector('#hub-dropdown')
  const chevron  = root.querySelector('#hub-chevron')
  dropdown?.classList.remove('hub-dropdown-open')
  if (chevron) chevron.textContent = '▾'
}

// ── Section router ────────────────────────────
function renderSection(root) {
  // Update title
  const sec = SECTIONS.find(s => s.id === _section) || SECTIONS[0]
  const titleEl = root.querySelector('#hub-title-text')
  if (titleEl) titleEl.textContent = sec.label

  // Update dropdown active indicators
  root.querySelectorAll('[data-section]').forEach(opt => {
    const active = opt.dataset.section === _section
    opt.classList.toggle('hub-option-active', active)
    const check = opt.querySelector('.hub-opt-check')
    if (check) check.textContent = active ? '✓' : ''
  })

  // Show / hide chrome elements per section
  const statsEl  = root.querySelector('#stats-header')
  const searchEl = root.querySelector('#search-bar')
  const fab      = root.querySelector('#fab-add')
  const topAdd   = root.querySelector('#hub-top-add')

  const isFlights = _section === 'flights'
  const isCrewSec = _section === 'crew'
  if (statsEl)  statsEl.style.display  = isFlights ? '' : 'none'
  if (searchEl) searchEl.style.display = (isFlights || isCrewSec) ? '' : 'none'
  if (fab)      fab.style.display      = isFlights ? '' : 'none'
  if (topAdd) {
    const showBtn = !isFlights
    topAdd.style.visibility   = showBtn ? 'visible' : 'hidden'
    topAdd.style.pointerEvents = showBtn ? '' : 'none'
  }

  // Update search placeholder & clear when switching between non-search sections
  const searchInput = root.querySelector('#search-input')
  if (searchInput) {
    if (isFlights)      searchInput.placeholder = 'Flight, airport, crew…'
    else if (isCrewSec) searchInput.placeholder = 'Name, position…'
    if (!isFlights && !isCrewSec) { searchInput.value = ''; state.search = '' }
  }

  // Route to section renderer
  switch (_section) {
    case 'flights':    renderFlightsSection(root);    break
    case 'crew':       renderCrewSection(root);       break
    case 'airplanes':  renderAirplanesSection(root);  break
    case 'experience': renderExperienceSection(root); break
  }
}

// ══════════════════════════════════════════════
// SECTION: Flights
// ══════════════════════════════════════════════

async function renderFlightsSection(root) {
  const scroll = root.querySelector('#list-scroll')

  // Load once, cache for both stats + list
  if (!_allFlights) {
    if (scroll) scroll.innerHTML = `<div class="list-loading"><div class="loader"></div></div>`
    try {
      _allFlights = await getAllFlights(state.user.uid)
    } catch (e) {
      if (scroll) scroll.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠</div>
          <div class="empty-state-title">Load failed</div>
          <div class="empty-state-sub">${e.message}</div>
        </div>`
      return
    }
  }

  if (!_allStats) {
    _allStats = computeStats(_allFlights)
  }
  renderStats(root, _allStats)
  renderFlightsList(root, _allFlights)
  attachSearchFilter(root)
}

const FTD_REGS = new Set(['T12-FTD-01', 'T12-FTD-02'])

function computeStats(flights) {
  let block = 0, flight = 0, night = 0, pfTo = 0, pfLdg = 0, sectors = 0
  for (const f of flights) {
    if (FTD_REGS.has(f.registration)) continue
    sectors++
    block  += f.blockTime  || 0
    flight += f.flightTime || 0
    night  += f.nightTime  || 0
    if (f.pfTakeoff) pfTo++
    if (f.pfLanding) pfLdg++
  }
  return { sectors, block, flight, night, pfTo, pfLdg }
}

function renderStats(root, s) {
  const cells = [
    { label: 'Sectors', value: fmtNum(s.sectors) },
    { label: 'Block',   value: fmtDuration(s.block) },
    { label: 'Flight',  value: fmtDuration(s.flight) },
    { label: 'Night',   value: fmtDuration(s.night) },
    { label: 'PF T/O',  value: fmtNum(s.pfTo) },
    { label: 'PF LDG',  value: fmtNum(s.pfLdg) },
  ]
  const el = root.querySelector('#stats-header')
  if (!el) return
  el.style.display = ''
  el.innerHTML = cells.map(c => `
    <div class="stat-cell">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}</div>
    </div>`).join('')
}

function renderFlightsList(root, allFlights) {
  const scroll = root.querySelector('#list-scroll')
  if (!scroll) return

  const q = (state.search || '').toLowerCase().trim()
  let flights = allFlights || []
  if (q) {
    flights = flights.filter(f =>
      (f.from         || '').toLowerCase().includes(q) ||
      (f.to           || '').toLowerCase().includes(q) ||
      (f.flightNumber || '').toLowerCase().includes(q) ||
      (f.aircraftType || '').toLowerCase().includes(q) ||
      (f.registration || '').toLowerCase().includes(q) ||
      (f.crewNames    || []).some(n => n.toLowerCase().includes(q))
    )
  }

  state.flights = flights

  if (flights.length === 0) {
    scroll.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✈</div>
        <div class="empty-state-title">${q ? 'No matching flights' : 'No flight records'}</div>
        <div class="empty-state-sub">${q ? 'Try another keyword' : 'Tap ＋ to add your first flight'}</div>
      </div>`
    return
  }

  scroll.innerHTML = `<ul class="flight-list" id="flight-list"></ul>`
  renderRows(root, flights)
}

function renderRows(root, flights) {
  const list = root.querySelector('#flight-list')
  if (!list) return

  let lastYear = null
  const html = []
  for (const f of flights) {
    const yr = (f.date || '').slice(0, 4)
    if (yr && yr !== lastYear) {
      html.push(`<li class="year-divider" aria-hidden="true">${yr}</li>`)
      lastYear = yr
    }
    html.push(flightRowHtml(f))
  }
  list.innerHTML = html.join('')

  list.querySelectorAll('.flight-row').forEach(row => {
    row.addEventListener('click', () => navigate('detail/' + row.dataset.id))
  })
}

function flightRowHtml(f) {
  const [, mo, d] = (f.date || '').split('-')
  const dateStr   = mo && d ? `${mo}/${d}` : f.date || ''
  const block     = fmtDuration(f.blockTime)

  // PIC: if self is PIC → badge; otherwise show PIC crew name
  const picBadge = f.pic
    ? '<span class="badge badge-pic">PIC</span>'
    : ''
  const picName  = !f.pic && f.crewNames?.length
    ? `<span class="flight-row-pic-name">${f.crewNames[0]}</span>`
    : ''

  const badges    = [
    f.pfTakeoff ? '<span class="badge badge-to">T/O</span>'   : '',
    f.pfLanding ? '<span class="badge badge-ldg">LDG</span>'  : '',
    picBadge,
    f.nightTime > 0 ? '<span class="badge badge-night">N</span>' : '',
    f.goAround  ? '<span class="badge badge-ga">GA</span>'    : '',
    f.autoland  ? '<span class="badge badge-auto">AUTO</span>': '',
  ].filter(Boolean).join('')

  return `
    <li class="flight-row" data-id="${f.id}">
      <div class="flight-row-date mono">${dateStr}</div>
      <div class="flight-row-route">
        <div class="flight-row-route-main">
          <span>${f.from || '???'}</span>
          <span class="route-arrow">→</span>
          <span>${f.to   || '???'}</span>
        </div>
        <div class="flight-row-fn">${f.flightNumber || ''} · ${f.aircraftType || ''}${picName ? ' · ' : ''}${picName}</div>
      </div>
      <div class="flight-row-right">
        <div class="flight-row-block mono">${block}</div>
        <div class="flight-row-badges">${badges}</div>
      </div>
    </li>`
}

function attachSearchFilter(root) {
  let debounceTimer
  root.querySelector('#search-input')?.addEventListener('input', e => {
    clearTimeout(debounceTimer)
    state.search = e.target.value
    debounceTimer = setTimeout(() => renderFlightsList(root, _allFlights || []), 350)
  })
}

// ══════════════════════════════════════════════
// SECTION: Crew
// ══════════════════════════════════════════════

function renderCrewSection(root) {
  // Wire "+" in topbar
  const topAdd = root.querySelector('#hub-top-add')
  if (topAdd) {
    topAdd.onclick = () => showCrewEditSheet(root, null, async data => {
      const id   = `crew_${Date.now()}`
      const crew = { id, ...data }
      await saveCrew(state.user.uid, id, data)
      state.crew.push(crew)
      renderCrewSection(root)
      showToast('Added', 'success')
    })
  }
  _attachCrewSearch(root)
  _paintCrewList(root)
}

function _attachCrewSearch(root) {
  const inp = root.querySelector('#search-input')
  if (!inp || inp.dataset.crewBound) return
  inp.dataset.crewBound = '1'
  let timer
  inp.addEventListener('input', e => {
    if (_section !== 'crew') return
    clearTimeout(timer)
    state.search = e.target.value
    timer = setTimeout(() => _paintCrewList(root), 200)
  })
}

function _paintCrewList(root) {
  const scroll = root.querySelector('#list-scroll')
  if (!scroll) return
  const q = (state.search || '').toLowerCase().trim()
  let crew = state.crew || []

  if (q) {
    crew = crew.filter(c =>
      `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase().includes(q) ||
      (c.position    || '').toLowerCase().includes(q) ||
      (c.employeeId  || '').toLowerCase().includes(q)
    )
  }

  const active   = crew.filter(c => isCrewActive(c))
  const inactive = crew.filter(c => !isCrewActive(c))

  if (crew.length === 0) {
    scroll.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">${q ? 'No matching crew' : 'No crew yet'}</div>
        <div class="empty-state-sub">${q ? 'Try another keyword' : 'Tap ＋ to add'}</div>
      </div>`
    return
  }

  scroll.innerHTML = `
    ${active.length > 0 ? `
      <div class="hub-section-label">Active (${active.length})</div>
      <div class="hub-list">
        ${active.map(c => crewRowHtml(c)).join('')}
      </div>` : ''}
    ${inactive.length > 0 ? `
      <div class="hub-section-label" style="margin-top:12px">Inactive (${inactive.length})</div>
      <div class="hub-list hub-list-dim">
        ${inactive.map(c => crewRowHtml(c)).join('')}
      </div>` : ''}
  `

  scroll.querySelectorAll('[data-crew-id]').forEach(row => {
    row.addEventListener('click', () => {
      navigate('crew-detail/' + row.dataset.crewId)
    })
  })
}

function _flagEmoji(cc) {
  if (!cc || cc.length !== 2) return null
  const c = cc.toUpperCase()
  if (!/^[A-Z]{2}$/.test(c)) return null
  return [...c].map(x => String.fromCodePoint(0x1F1E6 + x.charCodeAt(0) - 65)).join('')
}

function crewRowHtml(c) {
  const active = isCrewActive(c)
  const flag   = _flagEmoji(c.nationality)
  const avatarInner = flag
    ? `<span style="font-size:22px">${flag}</span>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 10c-4.4 0-8 2-8 4v1h16v-1c0-2-3.6-4-8-4z"/></svg>`
  return `
    <div class="hub-row" data-crew-id="${c.id}">
      <div class="hub-row-avatar" style="${active ? '' : 'opacity:0.4'}">${avatarInner}</div>
      <div class="hub-row-info">
        <div class="hub-row-name">${c.firstName || ''} ${c.lastName || ''}</div>
        <div class="hub-row-sub">${c.position || '—'}</div>
      </div>
      <div class="hub-status-badge ${active ? 'badge-active' : 'badge-inactive'}">
        ${active ? 'Active' : 'Inactive'}
      </div>
      <span class="settings-row-chevron">›</span>
    </div>`
}

function showCrewEditSheet(root, person, onSave, onDelete) {
  const c     = person || {}
  const isNew = !person
  let _natCode = c.nationality || ''

  const _flagEmoji = code => {
    if (!code || code.length !== 2) return ''
    const u = code.toUpperCase()
    return [...u].map(x => String.fromCodePoint(0x1F1E6 + x.charCodeAt(0) - 65)).join('')
  }

  const natDisplay = _natCode
    ? `${_flagEmoji(_natCode)}  ${getCountryName(_natCode)}`
    : ''

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${isNew ? 'Add Crew' : 'Edit Crew'}</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">First Name</label>
          <input class="form-input" id="cr-first" type="text" value="${c.firstName || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input class="form-input" id="cr-last" type="text" value="${c.lastName || ''}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Position</label>
        <select class="form-select" id="cr-position">
          <option value="" ${!c.position ? 'selected' : ''}>— Select —</option>
          ${['FO','SFO','CA','Check Captain','Student Pilot','Other'].map(p =>
            `<option value="${p}" ${p === c.position ? 'selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Employee ID</label>
          <input class="form-input mono" id="cr-empid" type="text" value="${c.employeeId || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Licence No.</label>
          <input class="form-input mono" id="cr-licence" type="text" value="${c.licenceNumber || ''}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Nationality</label>
        <button class="form-picker-btn" id="cr-nat-btn" type="button">
          <span id="cr-nat-display" style="${natDisplay ? '' : 'color:var(--text-faint)'}">
            ${natDisplay || 'Tap to select…'}
          </span>
        </button>
      </div>

      <div class="form-group">
        <label class="form-label">Status</label>
        <div class="hub-toggle-row" id="cr-active-toggle" data-active="${c.active !== false}">
          <span class="hub-toggle-label" id="cr-active-label">${c.active !== false ? '✓ Active' : '✕ Inactive'}</span>
          <div class="hub-toggle-switch ${c.active !== false ? 'on' : ''}"></div>
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="crew-save">Save</button>
      ${!isNew ? `<button class="btn btn-danger btn-full" id="crew-del">Delete Crew Member</button>` : ''}
    </div>`
  document.body.appendChild(overlay)

  // Nationality picker
  overlay.querySelector('#cr-nat-btn').addEventListener('click', () => {
    showCountryPicker(_natCode, (code, name) => {
      _natCode = code
      const display = overlay.querySelector('#cr-nat-display')
      if (display) {
        const flag = [...code].map(x => String.fromCodePoint(0x1F1E6 + x.charCodeAt(0) - 65)).join('')
        display.textContent = `${flag}  ${name}`
        display.style.color = 'var(--text)'
      }
    })
  })

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
      nationality:   _natCode,
      active:        toggleRow?.dataset.active !== 'false',
    }
    if (!data.firstName && !data.lastName) {
      showToast('Name is required', 'error'); return
    }

    // ── Duplicate crew detection (新增時才檢查) ─
    if (isNew) {
      const existingCrew = state.crew || []
      const dupByEmpId = data.employeeId &&
        existingCrew.find(c => c.employeeId && c.employeeId === data.employeeId)
      const dupByName = existingCrew.find(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase() ===
        `${data.firstName} ${data.lastName}`.toLowerCase()
      )
      if (dupByEmpId) {
        showToast(`Employee ID "${data.employeeId}" already exists`, 'error'); return
      }
      if (dupByName) {
        const go = confirm(
          `A crew member named "${data.firstName} ${data.lastName}" already exists. Add anyway?`
        )
        if (!go) return
      }
    }

    await onSave(data)
    overlay.remove()
  })

  overlay.querySelector('#crew-del')?.addEventListener('click', async () => {
    overlay.remove()
    await onDelete()
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

// ══════════════════════════════════════════════
// SECTION: Airplanes
// ══════════════════════════════════════════════

function renderAirplanesSection(root) {
  const topAdd = root.querySelector('#hub-top-add')
  if (topAdd) {
    topAdd.style.display = ''
    topAdd.onclick = () => showAircraftAddSheet(root)
  }
  _paintAirplaneList(root)
}

function showAircraftAddSheet(root) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">Add Aircraft</div>
      <div class="form-group">
        <label class="form-label">Registration</label>
        <input class="form-input mono" id="ac-reg" type="text"
               placeholder="B-12345" autocapitalize="characters" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <input class="form-input mono" id="ac-type" type="text"
               placeholder="A321-252NX" autocomplete="off">
      </div>
      <button class="btn btn-primary btn-full" id="ac-save">Add</button>
    </div>`
  document.body.appendChild(overlay)
  setTimeout(() => overlay.querySelector('#ac-reg')?.focus(), 50)

  overlay.querySelector('#ac-save').addEventListener('click', async () => {
    const reg  = (overlay.querySelector('#ac-reg').value  || '').trim().toUpperCase()
    const type = (overlay.querySelector('#ac-type').value || '').trim()
    if (!reg)  { showToast('Registration required', 'error'); return }
    if (!type) { showToast('Type required', 'error'); return }

    const existing = (state.customAircraft || []).find(a => a.reg === reg)
    if (existing) { showToast('Already in list', 'error'); return }

    const updated = [...(state.customAircraft || []), { reg, type }]
    setCustomAircraft(updated)
    try {
      await saveCustomAircraftList(state.user.uid, updated)
      overlay.remove()
      _paintAirplaneList(root)
      showToast('Aircraft added', 'success')
    } catch (e) {
      setCustomAircraft(state.customAircraft.filter(a => a.reg !== reg))
      showToast('Save failed', 'error')
    }
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

function _paintAirplaneList(root) {
  const scroll = root.querySelector('#list-scroll')
  if (!scroll) return

  // Group fleet aircraft by type
  const byType = {}
  for (const reg of ALL_REGISTRATIONS) {
    const info = FLEET[reg]
    if (!info) continue
    if (state.aircraftSettings?.[reg]?.deleted) continue
    const type = state.aircraftSettings?.[reg]?.typeOverride || info.type || '—'
    if (!byType[type]) byType[type] = []
    byType[type].push({ reg, ...info, type })
  }

  const customAC = state.customAircraft || []
  const customSection = customAC.length
    ? `<div class="hub-section-label">Custom</div>
       <div class="hub-list">
         ${customAC.map(a => customAirplaneRowHtml(a)).join('')}
       </div>`
    : ''

  // Sort: type groups with ≥1 active aircraft float to top, then alphabetical
  const sortedTypes = Object.entries(byType).sort(([tA, psA], [tB, psB]) => {
    const aA = psA.some(p => isAircraftActive(p.reg))
    const aB = psB.some(p => isAircraftActive(p.reg))
    if (aA !== aB) return aA ? -1 : 1
    return tA.localeCompare(tB)
  })
  // Within each type group, active aircraft before inactive
  sortedTypes.forEach(([, planes]) =>
    planes.sort((a, b) => {
      const da = isAircraftActive(a.reg), db = isAircraftActive(b.reg)
      if (da !== db) return da ? -1 : 1
      return a.reg.localeCompare(b.reg)
    })
  )

  scroll.innerHTML = sortedTypes.map(([type, planes]) => `
    <div class="hub-section-label">${type}</div>
    <div class="hub-list">
      ${planes.map(p => airplaneRowHtml(p)).join('')}
    </div>
  `).join('') + customSection

  // Fleet rows → detail page
  scroll.querySelectorAll('[data-reg]').forEach(row => {
    if (row.dataset.custom) return
    row.addEventListener('click', () => navigate('airplane-detail/' + row.dataset.reg))
  })

  // Custom rows → edit sheet
  scroll.querySelectorAll('[data-custom]').forEach(row => {
    row.addEventListener('click', () => {
      const entry = (state.customAircraft || []).find(a => a.reg === row.dataset.reg)
      if (entry) showCustomAircraftEditSheet(root, entry)
    })
  })
}

function customAirplaneRowHtml(a) {
  return `
    <div class="hub-row" data-reg="${a.reg}" data-custom="1">
      <div class="hub-row-avatar hub-plane-avatar">✈</div>
      <div class="hub-row-info">
        <div class="hub-row-name mono">${a.reg}</div>
        <div class="hub-row-sub">${a.type}</div>
      </div>
      <span style="color:var(--text-faint);font-size:18px;margin-left:4px">›</span>
    </div>`
}

function showCustomAircraftEditSheet(root, entry) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">Edit Aircraft</div>
      <div class="form-group">
        <label class="form-label">Registration</label>
        <input class="form-input mono" id="ace-reg" type="text"
               value="${entry.reg}" autocapitalize="characters" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <input class="form-input mono" id="ace-type" type="text"
               value="${entry.type}" autocomplete="off">
      </div>
      <button class="btn btn-primary btn-full" id="ace-save">Save</button>
      <button class="btn btn-danger btn-full" id="ace-del">Remove Aircraft</button>
    </div>`
  document.body.appendChild(overlay)

  overlay.querySelector('#ace-save').addEventListener('click', async () => {
    const reg  = (overlay.querySelector('#ace-reg').value  || '').trim().toUpperCase()
    const type = (overlay.querySelector('#ace-type').value || '').trim()
    if (!reg || !type) { showToast('Registration and type required', 'error'); return }
    const updated = (state.customAircraft || []).map(a =>
      a.reg === entry.reg ? { reg, type } : a
    )
    setCustomAircraft(updated)
    try {
      await saveCustomAircraftList(state.user.uid, updated)
      overlay.remove()
      _paintAirplaneList(root)
      showToast('Updated', 'success')
    } catch (e) {
      showToast('Save failed', 'error')
    }
  })

  overlay.querySelector('#ace-del').addEventListener('click', async () => {
    if (!confirm(`Remove ${entry.reg}?`)) return
    const updated = (state.customAircraft || []).filter(a => a.reg !== entry.reg)
    setCustomAircraft(updated)
    await saveCustomAircraftList(state.user.uid, updated)
    overlay.remove()
    _paintAirplaneList(root)
    showToast('Removed', 'success')
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

function airplaneRowHtml(p) {
  const active = isAircraftActive(p.reg)
  return `
    <div class="hub-row" data-reg="${p.reg}">
      <div class="hub-row-avatar hub-plane-avatar" style="${active ? '' : 'opacity:0.4'}">✈</div>
      <div class="hub-row-info">
        <div class="hub-row-name mono">${p.reg}</div>
        <div class="hub-row-sub">${p.type} · ${p.airline || ''}</div>
      </div>
      <div class="hub-status-badge ${active ? 'badge-active' : 'badge-inactive'}">
        ${active ? 'Active' : 'Inactive'}
      </div>
      <span style="color:var(--text-faint);font-size:18px;margin-left:4px">›</span>
    </div>`
}

// ══════════════════════════════════════════════
// SECTION: Experience
// ══════════════════════════════════════════════

// 預設職涯記錄：CPL → 華信 → 星宇
// autoCalc: true → 從已登入的 Flights 依機型自動計算
const _DEFAULT_EXPERIENCES = [
  {
    _id:          'apex',
    name:         'APEX Flight Academy',
    startDate:    '2015-10-01',
    endDate:      '2017-04-03',
    note:         'CPL Training — DA40 / DA42',
    autoCalc:     false,
    linkedTypes:  ['DA40-NG', 'DA42-NG', 'DA40-NG-FTD', 'DA42-NG-FTD'],
    manualMinutes: 12102,  // 201:42
  },
  {
    _id:          'mandarin',
    name:         'Mandarin Airlines',
    startDate:    '',
    endDate:      '',
    note:         'ATR72-600',
    autoCalc:     true,
    linkedTypes:  ['ATR72-600'],
    manualMinutes: 0,
  },
  {
    _id:          'starlux',
    name:         'Starlux Airlines',
    startDate:    '',
    endDate:      '',
    note:         'A321-252NX',
    autoCalc:     true,
    linkedTypes:  ['A321-252NX'],
    manualMinutes: 0,
  },
]

// 從現有 career 判斷某個預設是否已存在（模糊比對）
function _hasEntry(career, keywords) {
  return career.some(c => {
    const haystack = `${c.name || ''} ${c.airline || ''}`.toLowerCase()
    return keywords.some(k => haystack.includes(k.toLowerCase()))
  })
}

// 標準化舊格式 → 新格式
function _normalizeExp(c) {
  return {
    name:          c.name      || c.airline  || '—',
    startDate:     c.startDate || '',
    endDate:       c.endDate   || null,
    note:          c.note      || [c.position, c.aircraftType].filter(Boolean).join(' · ') || '',
    autoCalc:      c.autoCalc  ?? false,
    linkedTypes:   c.linkedTypes || [],
    manualMinutes: c.manualMinutes ?? c.totalMinutes ?? 0,
    _id:           c._id || null,
  }
}

// 依 linkedTypes + 日期範圍從 allFlights 計算 blockTime 總和
function _computeExpMinutes(entry, allFlights) {
  if (!entry.autoCalc) return entry.manualMinutes || 0
  let flights = allFlights
  if (entry.linkedTypes?.length) {
    flights = flights.filter(f => entry.linkedTypes.includes(f.aircraftType))
  }
  if (entry.startDate) flights = flights.filter(f => f.date >= entry.startDate)
  if (entry.endDate)   flights = flights.filter(f => f.date <= entry.endDate)
  return flights.reduce((s, f) => s + (f.blockTime || 0), 0)
}

// 從 autoCalc entries 推算日期範圍（用 flights 的最早/最晚日期）
function _deriveRange(entry, allFlights) {
  if (!entry.autoCalc || !entry.linkedTypes?.length) return { start: entry.startDate, end: entry.endDate }
  const matching = allFlights.filter(f => entry.linkedTypes.includes(f.aircraftType))
  if (!matching.length) return { start: entry.startDate, end: entry.endDate }
  const dates = matching.map(f => f.date).sort()
  return {
    start: entry.startDate || dates[0],
    end:   entry.endDate   || (entry._id === 'starlux' ? null : dates[dates.length - 1]),
  }
}

async function renderExperienceSection(root) {
  const topAdd = root.querySelector('#hub-top-add')

  // 確保預設職涯記錄存在
  const uid        = state.user.uid
  let career       = state.career || []
  let needsSave    = false

  if (!_hasEntry(career, ['Apex', 'APEX', 'CPL'])) {
    career = [...career, { ..._DEFAULT_EXPERIENCES[0] }]
    needsSave = true
  }
  if (!_hasEntry(career, ['Mandarin', 'mandarin'])) {
    career = [...career, { ..._DEFAULT_EXPERIENCES[1] }]
    needsSave = true
  }
  if (!_hasEntry(career, ['Starlux', 'starlux'])) {
    career = [...career, { ..._DEFAULT_EXPERIENCES[2] }]
    needsSave = true
  }

  if (needsSave) {
    setCareer(career)
    await saveCareer(uid, career)
    showToast('Career records created', 'success')
  }

  // 載入所有航班（用於 autoCalc）
  let allFlights = []
  try {
    allFlights = await getAllFlights(uid)
  } catch (e) { console.warn('[Exp] getAllFlights failed', e) }

  if (topAdd) {
    topAdd.style.display = ''
    topAdd.onclick = () => showExpEditSheet(root, null, allFlights, async data => {
      const newCareer = [...(state.career || []), data]
      await saveCareer(uid, newCareer)
      setCareer(newCareer)
      _paintExperience(root, allFlights)
      showToast('Added', 'success')
    })
  }

  _paintExperience(root, allFlights)
}

function _paintExperience(root, allFlights = []) {
  const scroll = root.querySelector('#list-scroll')
  if (!scroll) return
  const career = (state.career || []).map(_normalizeExp)

  // 計算各期時數
  const entries = career.map(c => ({
    ...c,
    computed: _computeExpMinutes(c, allFlights),
    range:    _deriveRange(c, allFlights),
  }))

  const grandTotal = entries.reduce((s, e) => s + e.computed, 0)

  scroll.innerHTML = `
    <div class="hub-exp-total">
      <div class="hub-exp-total-label">Total Experience</div>
      <div class="hub-exp-total-val">${fmtDuration(grandTotal)}</div>
      <div class="hub-exp-total-sub">${entries.length} ${entries.length === 1 ? 'record' : 'records'}</div>
    </div>

    <div class="hub-section-label" style="margin-top:8px">Career Records</div>
    <div class="hub-list">
      ${entries.length === 0
        ? `<div class="hub-empty-row">Tap ＋ to add</div>`
        : entries.map((e, i) => expRowHtml(e, i)).join('')}
    </div>
  `

  scroll.querySelectorAll('[data-exp-idx]').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.expIdx, 10)
      showExpEditSheet(root, state.career[idx], allFlights, async data => {
        const newCareer = [...state.career]
        newCareer[idx]  = data
        await saveCareer(state.user.uid, newCareer)
        setCareer(newCareer)
        _paintExperience(root, allFlights)
        showToast('Updated', 'success')
      }, async () => {
        const newCareer = state.career.filter((_, i) => i !== idx)
        await saveCareer(state.user.uid, newCareer)
        setCareer(newCareer)
        _paintExperience(root, allFlights)
        showToast('Deleted', 'success')
      })
    })
  })
}

function expRowHtml(e, i) {
  const startStr = e.range.start || null
  const endStr   = e.range.end   || null
  const start    = startStr ? _fmtExpDate(startStr) : '—'
  const end      = endStr   ? _fmtExpDate(endStr)   : 'Present'
  const hours    = e.computed > 0 ? fmtDuration(e.computed) : '—'
  const autoTag  = e.autoCalc
    ? `<span class="exp-auto-tag">AUTO</span>`
    : ''

  return `
    <div class="hub-row" data-exp-idx="${i}">
      <div class="hub-row-avatar hub-clock-avatar">🕐</div>
      <div class="hub-row-info">
        <div class="hub-row-name">${e.name}</div>
        <div class="hub-row-sub">${start} – ${end}</div>
        ${e.note ? `<div class="hub-row-sub" style="color:var(--text-faint)">${e.note}</div>` : ''}
      </div>
      <div class="hub-row-right-col">
        <div class="hub-row-hours mono">${hours}</div>
        ${autoTag}
      </div>
      <span style="color:var(--text-faint);font-size:18px;margin-left:4px">›</span>
    </div>`
}

function _fmtExpDate(d) {
  if (!d) return ''
  const [y, m] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[(parseInt(m,10)-1) % 12]} ${y}`
}

// ── 簡化後的 Experience 編輯表單 ───────────────

function showExpEditSheet(root, entry, allFlights, onSave, onDelete) {
  const e        = entry ? _normalizeExp(entry) : {}
  const isNew    = !entry
  const isAuto   = e.autoCalc ?? false

  // 計算目前 autoCalc 顯示值
  const previewMin = isAuto ? _computeExpMinutes(e, allFlights) : 0

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${isNew ? 'Add Record' : 'Edit Record'}</div>

      <!-- Name -->
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="exp-name" type="text"
               value="${e.name !== '—' ? (e.name || '') : ''}"
               placeholder="e.g. Starlux Airlines, ATPL Training…">
      </div>

      <!-- Date range -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start Date</label>
          <input class="form-input" id="exp-start" type="date" value="${e.startDate || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">End (blank = present)</label>
          <input class="form-input" id="exp-end" type="date" value="${e.endDate || ''}">
        </div>
      </div>

      <!-- Time mode toggle -->
      <div class="form-group">
        <label class="form-label">Flight Hours</label>
        <div class="exp-time-modes">
          <button class="exp-mode-btn ${!isAuto ? 'active' : ''}" id="mode-manual">Manual</button>
          <button class="exp-mode-btn ${isAuto  ? 'active' : ''}" id="mode-auto">Auto from Flights</button>
        </div>
      </div>

      <!-- Manual time -->
      <div id="panel-manual" style="${isAuto ? 'display:none' : ''}">
        <div class="form-group">
          <label class="form-label">Total hours (e.g. 201.70)</label>
          <input class="form-input mono" id="exp-hours" type="number"
                 inputmode="decimal" step="0.01" min="0"
                 value="${!isAuto && e.manualMinutes ? (e.manualMinutes / 60).toFixed(2) : ''}"
                 placeholder="0.00">
        </div>
      </div>

      <!-- Auto calc -->
      <div id="panel-auto" style="${isAuto ? '' : 'display:none'}">
        <div class="form-group">
          <label class="form-label">Filter by type (comma-separated)</label>
          <input class="form-input mono" id="exp-types" type="text"
                 value="${(e.linkedTypes || []).join(', ')}"
                 placeholder="A321-252NX, ATR72-600">
        </div>
        <div class="exp-auto-preview">
          Current result: <strong id="exp-preview">${previewMin > 0 ? fmtDuration(previewMin) : '—'}</strong>
        </div>
      </div>

      <!-- Note -->
      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input class="form-input" id="exp-note" type="text"
               value="${e.note || ''}" placeholder="Type, position, etc.">
      </div>

      <button class="btn btn-primary btn-full" id="exp-save">Save</button>
      ${!isNew ? `<button class="btn btn-danger btn-full" id="exp-del">Delete Record</button>` : ''}
    </div>`
  document.body.appendChild(overlay)

  // Mode toggle
  let _isAuto = isAuto
  const panelManual = overlay.querySelector('#panel-manual')
  const panelAuto   = overlay.querySelector('#panel-auto')
  const btnManual   = overlay.querySelector('#mode-manual')
  const btnAuto     = overlay.querySelector('#mode-auto')

  function _setMode(auto) {
    _isAuto = auto
    panelManual.style.display = auto ? 'none' : ''
    panelAuto.style.display   = auto ? '' : 'none'
    btnManual.classList.toggle('active', !auto)
    btnAuto.classList.toggle('active',   auto)
  }
  btnManual.addEventListener('click', () => _setMode(false))
  btnAuto.addEventListener('click',   () => _setMode(true))

  // Live preview for autoCalc
  overlay.querySelector('#exp-types')?.addEventListener('input', e => {
    const types   = e.target.value.split(',').map(t => t.trim()).filter(Boolean)
    const previewEl = overlay.querySelector('#exp-preview')
    const startDate = overlay.querySelector('#exp-start').value
    const endDate   = overlay.querySelector('#exp-end').value
    const mock = { autoCalc: true, linkedTypes: types, startDate, endDate }
    const min  = _computeExpMinutes(mock, allFlights)
    if (previewEl) previewEl.textContent = min > 0 ? fmtDuration(min) : '—'
  })

  overlay.querySelector('#exp-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#exp-name').value.trim()
    if (!name) { showToast('Name is required', 'error'); return }

    const typesRaw   = overlay.querySelector('#exp-types').value
    const linkedTypes = typesRaw.split(',').map(t => t.trim()).filter(Boolean)
    const hoursVal   = parseFloat(overlay.querySelector('#exp-hours').value || '0')

    const data = {
      name,
      startDate:    overlay.querySelector('#exp-start').value || '',
      endDate:      overlay.querySelector('#exp-end').value   || null,
      note:         overlay.querySelector('#exp-note').value.trim(),
      autoCalc:     _isAuto,
      linkedTypes:  _isAuto ? linkedTypes : [],
      manualMinutes: _isAuto ? 0 : (hoursVal > 0 ? Math.round(hoursVal * 60) : 0),
      // keep _id for default entries
      _id:          e._id || null,
    }
    await onSave(data)
    overlay.remove()
  })

  overlay.querySelector('#exp-del')?.addEventListener('click', async () => {
    overlay.remove()
    await onDelete()
  })

  overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove() })
}

// ── Public exports ────────────────────────────
export function invalidateStats() { _allStats = null; _allFlights = null }

// ── Utils ─────────────────────────────────────
function fmtNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
