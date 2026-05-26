// ══════════════════════════════════════════════
// Flight List Page
// ══════════════════════════════════════════════
import { getFlights, getAllFlights } from '../db.js'
import { state }                    from '../state.js'
import { fmtDate, fmtDuration }     from '../utils/time.js'
import { navigate }                 from '../app.js'

let _allStats = null  // cached stats

export async function renderList(root) {
  root.innerHTML = buildShell()
  attachNav(root)

  // Load stats (once per session)
  if (!_allStats) await loadStats(root)
  else            renderStats(root, _allStats)

  await loadFlights(root)
  attachSearchFilter(root)
}

function buildShell() {
  return `
    <div class="page" id="list-page">
      <!-- Stats header -->
      <div class="stats-header" id="stats-header">
        ${[...Array(6)].map(() => `
          <div class="stat-cell">
            <div class="stat-label">…</div>
            <div class="stat-value">—</div>
          </div>`).join('')}
      </div>

      <!-- Search -->
      <div class="search-bar">
        <input class="search-input" id="search-input" type="search"
               placeholder="航班號、機場、機師名字…" autocomplete="off">
        <button class="btn-filter" id="btn-filter" title="篩選">⚙︎</button>
      </div>

      <!-- List -->
      <div class="scroll" id="list-scroll">
        <div class="list-loading"><div class="loader"></div></div>
      </div>

      <!-- FAB -->
      <button class="fab" id="fab-add" title="新增航班">＋</button>

      <!-- Bottom Nav -->
      ${bottomNav('list')}
    </div>
  `
}

function bottomNav(active) {
  const items = [
    { id: 'list',     icon: '≡', label: 'Logbook' },
    { id: 'settings', icon: '⚙', label: 'Settings' },
  ]
  return `
    <nav class="bottom-nav">
      ${items.map(i => `
        <button class="nav-item ${i.id === active ? 'active' : ''}" data-nav="${i.id}">
          <span class="nav-icon">${i.icon}</span>
          <span>${i.label}</span>
        </button>`).join('')}
    </nav>
  `
}

function attachNav(root) {
  root.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav))
  })
  root.querySelector('#fab-add')?.addEventListener('click', () => navigate('add'))
}

// ── Stats ─────────────────────────────────────

async function loadStats(root) {
  try {
    const uid     = state.user.uid
    const flights = await getAllFlights(uid)
    const stats   = computeStats(flights)
    _allStats     = stats
    renderStats(root, stats)
  } catch (e) {
    console.error(e)
  }
}

function computeStats(flights) {
  let block = 0, flight = 0, night = 0, pfTo = 0, pfLdg = 0
  for (const f of flights) {
    block  += f.blockTime  || 0
    flight += f.flightTime || 0
    night  += f.nightTime  || 0
    if (f.pfTakeoff) pfTo++
    if (f.pfLanding) pfLdg++
  }
  return {
    sectors: flights.length,
    block, flight, night, pfTo, pfLdg,
  }
}

function renderStats(root, s) {
  const cells = [
    { label: 'Sectors',      value: fmtNum(s.sectors) },
    { label: 'Block',        value: fmtDuration(s.block) },
    { label: 'Flight',       value: fmtDuration(s.flight) },
    { label: 'Night',        value: fmtDuration(s.night) },
    { label: 'PF T/O',       value: fmtNum(s.pfTo) },
    { label: 'PF LDG',       value: fmtNum(s.pfLdg) },
  ]
  const el = root.querySelector('#stats-header')
  if (!el) return
  el.innerHTML = cells.map(c => `
    <div class="stat-cell">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}</div>
    </div>`).join('')
}

// ── Flight list ────────────────────────────────

async function loadFlights(root, page = 0) {
  const scroll = root.querySelector('#list-scroll')
  if (!scroll) return

  scroll.innerHTML = `<div class="list-loading"><div class="loader"></div></div>`

  try {
    const uid = state.user.uid
    const { flights, total, pages } = await getFlights(
      uid, page, state.filters, state.search
    )
    state.currentPage  = page
    state.flightPages  = pages
    state.flights      = flights

    if (flights.length === 0) {
      scroll.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✈</div>
          <div class="empty-state-title">尚無飛行記錄</div>
          <div class="empty-state-sub">點右下角 ＋ 新增第一筆航班</div>
        </div>`
      return
    }

    scroll.innerHTML = `
      <ul class="flight-list" id="flight-list"></ul>
      ${pages > 1 ? paginationHtml(page, pages, total) : ''}
    `
    renderRows(root, flights)
    attachPagination(root, loadFlights)
  } catch (e) {
    scroll.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠</div>
      <div class="empty-state-title">載入失敗</div>
      <div class="empty-state-sub">${e.message}</div>
    </div>`
  }
}

function renderRows(root, flights) {
  const list = root.querySelector('#flight-list')
  if (!list) return
  list.innerHTML = flights.map(f => flightRowHtml(f)).join('')
  list.querySelectorAll('.flight-row').forEach(row => {
    row.addEventListener('click', () => navigate('detail/' + row.dataset.id))
  })
}

function flightRowHtml(f) {
  const [, mo, d] = (f.date || '').split('-')
  const dateStr = mo && d ? `${mo}/${d}` : f.date || ''
  const block   = fmtDuration(f.blockTime)
  const badges  = [
    f.pfTakeoff ? '<span class="badge badge-to">T/O</span>' : '',
    f.pfLanding ? '<span class="badge badge-ldg">LDG</span>' : '',
    f.nightTime > 0 ? '<span class="badge badge-night">N</span>' : '',
    f.goAround  ? '<span class="badge badge-ga">GA</span>' : '',
    f.autoland  ? '<span class="badge badge-auto">AUTO</span>' : '',
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
        <div class="flight-row-fn">${f.flightNumber || ''} · ${f.aircraftType || ''}</div>
      </div>
      <div class="flight-row-right">
        <div class="flight-row-block mono">${block}</div>
        <div class="flight-row-badges">${badges}</div>
      </div>
    </li>`
}

function paginationHtml(page, pages, total) {
  return `
    <div class="pagination">
      <button class="btn-page" id="btn-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button>
      <span class="page-info">${page+1} / ${pages}</span>
      <button class="btn-page" id="btn-next" ${page >= pages-1 ? 'disabled' : ''}>Next →</button>
    </div>`
}

function attachPagination(root, loader) {
  root.querySelector('#btn-prev')?.addEventListener('click', () => loader(root, state.currentPage - 1))
  root.querySelector('#btn-next')?.addEventListener('click', () => loader(root, state.currentPage + 1))
}

// ── Search ─────────────────────────────────────

function attachSearchFilter(root) {
  let debounceTimer
  root.querySelector('#search-input')?.addEventListener('input', e => {
    clearTimeout(debounceTimer)
    state.search = e.target.value
    debounceTimer = setTimeout(() => loadFlights(root, 0), 350)
  })
}

// 重置快取（在新增/刪除航班後呼叫）
export function invalidateStats() {
  _allStats = null
}

// 千位分隔符（不依賴 locale，避免 iOS 顯示 "3, 181"）
function fmtNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
