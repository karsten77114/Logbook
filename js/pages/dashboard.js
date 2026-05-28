// ══════════════════════════════════════════════
// Dashboard — Pilot Home Screen
// ══════════════════════════════════════════════
import { getAllFlights }     from '../db.js'
import { state }             from '../state.js'
import { fmtDuration }       from '../utils/time.js'
import { navigate }          from '../app.js'

const FTD_REGS = new Set(['T12-FTD-01', 'T12-FTD-02'])

// ── Main render ───────────────────────────────

export async function renderDashboard(root) {
  root.innerHTML = buildShell()
  attachNav(root)

  try {
    const uid     = state.user.uid
    const flights = await getAllFlights(uid)
    const stats   = computeDashStats(flights)
    renderAll(root, stats, flights)
  } catch (e) {
    root.querySelector('#dash-scroll').innerHTML =
      `<div class="empty-state"><div class="empty-state-icon">⚠</div>
       <div class="empty-state-title">載入失敗</div>
       <div class="empty-state-sub">${e.message}</div></div>`
  }
}

// ── Shell ─────────────────────────────────────

function buildShell() {
  return `
    <div class="page" id="dash-page">
      <div class="scroll" id="dash-scroll" style="padding-top:var(--safe-top)">
        <div class="list-loading"><div class="loader"></div></div>
      </div>
      ${bottomNav()}
    </div>`
}

function bottomNav() {
  return `
    <nav class="bottom-nav">
      <button class="nav-item active" data-nav="dashboard">
        <span class="nav-icon">⊞</span><span>Dashboard</span>
      </button>
      <button class="nav-item" data-nav="list">
        <span class="nav-icon">✈</span><span>Flights</span>
      </button>
      <button class="nav-item" data-nav="settings">
        <span class="nav-icon">⚙</span><span>Settings</span>
      </button>
    </nav>`
}

function attachNav(root) {
  root.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav))
  })
}

// ── Compute ───────────────────────────────────

function computeDashStats(flights) {
  const real    = flights.filter(f => !FTD_REGS.has(f.registration))
  const today   = new Date()
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  // Totals
  let block = 0, pfTo = 0, pfLdg = 0, picBlock = 0
  const airports = new Set()
  const byType   = {}

  for (const f of real) {
    block += f.blockTime || 0
    if (f.pfTakeoff) pfTo++
    if (f.pfLanding) pfLdg++
    if (f.pic)        picBlock += f.blockTime || 0
    if (f.from) airports.add(f.from)
    if (f.to)   airports.add(f.to)

    const t = f.aircraftType || 'Unknown'
    if (!byType[t]) byType[t] = { block: 0, sectors: 0 }
    byType[t].block   += f.blockTime || 0
    byType[t].sectors += 1
  }

  // Recent activity (7 / 30 / 90 days)
  const act7  = sumBlockSince(real, todayMs - 7  * 86400000)
  const act30 = sumBlockSince(real, todayMs - 30 * 86400000)
  const act90 = sumBlockSince(real, todayMs - 90 * 86400000)

  // Currency (last 3 PF T/O and PF LDG, 90-day rule)
  const lastToFlights  = real.filter(f => f.pfTakeoff).slice(0, 3)
  const lastLdgFlights = real.filter(f => f.pfLanding).slice(0, 3)

  const toExp  = currencyExpiry(lastToFlights)
  const ldgExp = currencyExpiry(lastLdgFlights)

  // Recent flights (last 8)
  const recentFlights = real.slice(0, 8)

  // Monthly hours (last 6 months)
  const monthly = buildMonthly(real, 6)

  return {
    sectors: real.length,
    block,
    pfTo,
    pfLdg,
    picBlock,
    airports: airports.size,
    act7, act30, act90,
    lastToFlights,
    lastLdgFlights,
    toExp,
    ldgExp,
    recentFlights,
    monthly,
    byType,
  }
}

function sumBlockSince(flights, sinceMs) {
  return flights.reduce((sum, f) => {
    const d = dateMs(f.date)
    return d >= sinceMs ? sum + (f.blockTime || 0) : sum
  }, 0)
}

function dateMs(dateStr) {
  if (!dateStr) return 0
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function currencyExpiry(last3) {
  if (last3.length < 3) return null
  const oldest = last3[2].date
  const [y, m, d] = oldest.split('-').map(Number)
  const exp = new Date(Date.UTC(y, m - 1, d) + 90 * 86400000)
  return exp
}

function buildMonthly(flights, months) {
  const result = []
  const now   = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })
    const block = flights
      .filter(f => (f.date || '').startsWith(ym))
      .reduce((s, f) => s + (f.blockTime || 0), 0)
    result.push({ ym, label, block, isCurrent: i === 0 })
  }
  return result
}

// ── Render ────────────────────────────────────

function renderAll(root, s, flights) {
  const prof  = state.profile || {}
  const name  = prof.name || state.user?.displayName || '—'
  const airline = prof.airline || ''

  const scroll = root.querySelector('#dash-scroll')
  if (!scroll) return

  scroll.innerHTML = `
    ${heroHtml(name, airline, s)}
    ${statsGridHtml(s)}
    ${activityHtml(s)}
    ${currencyHtml(s)}
    ${recentFlightsHtml(s.recentFlights)}
    ${monthlyHtml(s.monthly)}
    ${fleetHtml(s.byType)}
    <div style="height:24px"></div>
  `

  // click handlers
  scroll.querySelectorAll('.recent-row').forEach(row => {
    row.addEventListener('click', () => navigate('detail/' + row.dataset.id))
  })
}

// ── Hero ──────────────────────────────────────

function heroHtml(name, airline, s) {
  return `
    <div class="dash-hero">
      <div class="dash-airline-logo">✈</div>
      <div class="dash-pilot-info">
        <div class="dash-pilot-name">${name.toUpperCase()}</div>
        ${airline ? `<div class="dash-airline-name">${airline}</div>` : ''}
      </div>
      <div class="dash-grand-total">
        <div class="dash-gt-value">${fmtDuration(s.block)}</div>
        <div class="dash-gt-label">Grand Total</div>
      </div>
    </div>`
}

// ── Stats Grid ────────────────────────────────

function statsGridHtml(s) {
  const nonPic = s.block - s.picBlock
  const cells = [
    { icon: '✈', value: fmtNum(s.sectors), label: 'Flights' },
    { icon: '📍', value: fmtNum(s.airports), label: 'Unique Airports' },
    { icon: '↑', value: fmtNum(s.pfTo), label: 'Takeoffs' },
    { icon: '↓', value: fmtNum(s.pfLdg), label: 'Landings' },
    { icon: '★', value: fmtDuration(s.picBlock), label: 'PIC Hours' },
    { icon: '👤', value: fmtDuration(nonPic), label: 'Non-PIC Hours' },
  ]
  return `
    <div class="dash-stats-grid">
      ${cells.map(c => `
        <div class="dash-stat-card">
          <div class="dash-stat-icon">${c.icon}</div>
          <div class="dash-stat-value">${c.value}</div>
          <div class="dash-stat-label">${c.label}</div>
        </div>`).join('')}
    </div>`
}

// ── Recent Activity ────────────────────────────

function activityHtml(s) {
  const max = Math.max(s.act7, s.act30, s.act90, 1)
  const bar = (val) => `
    <div class="act-bar-bg">
      <div class="act-bar-fill" style="width:${Math.round(val/max*100)}%"></div>
    </div>`
  const rows = [
    { label: '7 Days',  val: s.act7  },
    { label: '30 Days', val: s.act30 },
    { label: '90 Days', val: s.act90 },
  ]
  return `
    <div class="dash-card">
      <div class="dash-section-title">RECENT ACTIVITY</div>
      ${rows.map(r => `
        <div class="act-row">
          <span class="act-label">${r.label}</span>
          ${bar(r.val)}
          <span class="act-val">${fmtDuration(r.val)}</span>
        </div>`).join('')}
    </div>`
}

// ── Currency ──────────────────────────────────

function currencyHtml(s) {
  const fmt = (f) => {
    const [, m, d] = (f.date || '').split('-')
    const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${parseInt(d, 10)} ${months[parseInt(m, 10)]} ${f.from || '?'} ${f.flightNumber || ''}`
  }

  const expStr = (exp) => {
    if (!exp) return '—'
    const now     = Date.now()
    const expMs   = exp.getTime()
    const daysLeft = Math.ceil((expMs - now) / 86400000)
    const dateStr = exp.toLocaleDateString('en', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    })
    const color = daysLeft <= 30 ? 'var(--red)' : daysLeft <= 60 ? 'var(--amber)' : 'var(--green)'
    return `<span style="color:${color}">${dateStr}<br>${daysLeft > 0 ? daysLeft + ' days to go' : 'EXPIRED'}</span>`
  }

  const toCount  = s.lastToFlights.length
  const ldgCount = s.lastLdgFlights.length
  const toOk     = toCount >= 3
  const ldgOk    = ldgCount >= 3

  return `
    <div class="dash-card">
      <div class="dash-section-title">CURRENCY</div>
      <div class="curr-grid">
        <div class="curr-col">
          <div class="curr-head">
            <span class="curr-icon">↑</span>
            <span class="curr-type">TAKEOFFS</span>
            <span class="curr-count" style="color:${toOk?'var(--green)':'var(--amber)'}">${toCount}/3</span>
          </div>
          ${s.lastToFlights.map(f => `<div class="curr-item">${fmt(f)}</div>`).join('')}
          <div class="curr-expiry">${expStr(s.toExp)}</div>
        </div>
        <div class="curr-col">
          <div class="curr-head">
            <span class="curr-icon">↓</span>
            <span class="curr-type">LANDINGS</span>
            <span class="curr-count" style="color:${ldgOk?'var(--green)':'var(--amber)'}">${ldgCount}/3</span>
          </div>
          ${s.lastLdgFlights.map(f => `<div class="curr-item">${fmt(f)}</div>`).join('')}
          <div class="curr-expiry">${expStr(s.ldgExp)}</div>
        </div>
      </div>
    </div>`
}

// ── Recent Flights ────────────────────────────

function recentFlightsHtml(flights) {
  if (!flights.length) return ''
  return `
    <div class="dash-card">
      <div class="dash-section-header">
        <div class="dash-section-title">RECENT FLIGHTS</div>
        <button class="dash-view-all" data-nav="list">View All</button>
      </div>
      ${flights.map(f => {
        const [, mo, d] = (f.date || '').split('-')
        const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const dateLbl = mo && d ? `${parseInt(d,10)} ${months[parseInt(mo,10)]}` : f.date || ''
        return `
          <div class="recent-row" data-id="${f.id}">
            <div class="recent-date">${dateLbl}</div>
            <div class="recent-route">
              <span class="recent-airports">${f.from || '?'} → ${f.to || '?'}</span>
              <span class="recent-fn">${f.flightNumber || ''}</span>
            </div>
            <div class="recent-block">${fmtDuration(f.blockTime)}</div>
          </div>`
      }).join('')}
    </div>`
}

// ── Monthly Hours ─────────────────────────────

function monthlyHtml(monthly) {
  const max = Math.max(...monthly.map(m => m.block), 1)
  return `
    <div class="dash-card">
      <div class="dash-section-title">MONTHLY HOURS</div>
      <div class="month-chart">
        ${monthly.map(m => {
          const pct = Math.round(m.block / max * 100)
          return `
            <div class="month-col ${m.isCurrent ? 'current' : ''}">
              <div class="month-val">${m.block ? fmtDuration(m.block) : ''}</div>
              <div class="month-bar-wrap">
                <div class="month-bar" style="height:${pct}%"></div>
              </div>
              <div class="month-label">${m.label}</div>
            </div>`
        }).join('')}
      </div>
    </div>`
}

// ── Fleet Experience ──────────────────────────

function fleetHtml(byType) {
  const types = Object.entries(byType)
    .filter(([t]) => t !== 'DA40-NG-FTD' && t !== 'DA42-NG-FTD')
    .sort((a, b) => b[1].block - a[1].block)

  if (!types.length) return ''
  return `
    <div class="dash-card">
      <div class="dash-section-title">FLEET EXPERIENCE</div>
      <div class="fleet-grid">
        ${types.map(([type, d]) => `
          <div class="fleet-card">
            <div class="fleet-type">${type}</div>
            <div class="fleet-stats">
              <div>
                <div class="fleet-val">${fmtDuration(d.block)}</div>
                <div class="fleet-lbl">hours</div>
              </div>
              <div>
                <div class="fleet-val">${fmtNum(d.sectors)}</div>
                <div class="fleet-lbl">flights</div>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`
}

// ── Utils ─────────────────────────────────────

function fmtNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
