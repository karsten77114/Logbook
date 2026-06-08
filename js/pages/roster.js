// ══════════════════════════════════════════════
// Roster Page — PegaSys 班表整合
// ══════════════════════════════════════════════
import { getDoc, setDoc, doc }  from 'firebase/firestore'
import { getFirestore }          from 'firebase/firestore'
import { getFirebaseApp }        from '../auth.js'
import { state }                 from '../state.js'
import { navigate, showToast }   from '../app.js'

const WORKER_URL    = 'https://jx-briefing.karsten77114.workers.dev'
const KB_URL        = 'https://karsten77114.github.io/Kneeboard/'
const MONTHS        = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

// ── Firestore helpers ─────────────────────────

function db() { return getFirestore(getFirebaseApp()) }

async function getPegasysCreds(uid) {
  try {
    const snap = await getDoc(doc(db(), 'users', uid, 'meta', 'pegasys'))
    return snap.exists() ? snap.data() : null
  } catch { return null }
}

async function savePegasysCreds(uid, employeeId, password) {
  await setDoc(doc(db(), 'users', uid, 'meta', 'pegasys'), { employeeId, password }, { merge: true })
}

async function clearPegasysCreds(uid) {
  await setDoc(doc(db(), 'users', uid, 'meta', 'pegasys'), { employeeId: null, password: null })
}

// ── Helpers ───────────────────────────────────

function formatDate(d) {
  const m = parseInt(d.slice(4, 6), 10)
  return `${d.slice(6, 8)} ${MONTHS[m - 1]} ${d.slice(0, 4)}`
}

function isToday(d) {
  const n = new Date()
  return d === `${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}`
}

function isFuture(d) {
  const n = new Date()
  const t = `${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}`
  return d >= t
}

function blockStr(min) {
  return `${Math.floor(min/60)}h${String(min%60).padStart(2,'0')}m`
}

// ── Worker fetch ──────────────────────────────

async function fetchRoster(employeeId, password) {
  const resp = await fetch(`${WORKER_URL}/pegasys/roster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, password }),
  })
  const data = await resp.json()
  if (!resp.ok) throw Object.assign(new Error(data.error || `HTTP ${resp.status}`), { status: resp.status })
  return data
}

// ── Pairing card ──────────────────────────────

function pairingCard(p) {
  const dateLabel = formatDate(p.date) + (isToday(p.date) ? ' — Today' : '')

  const legs = (p.legs || []).map(lg => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border-subtle)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="min-width:0">
          <div style="font-weight:700;font-size:15px">${lg.flightNumber}</div>
          <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px">
            ${lg.dep} → ${lg.dest}
            &nbsp;·&nbsp;
            ${lg.std_local}–${lg.sta_local}L
            &nbsp;·&nbsp;
            ${blockStr(lg.blockTime)}
          </div>
          <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:1px">
            STD ${lg.std_utc}Z · STA ${lg.sta_utc}Z
          </div>
        </div>
        <a href="${KB_URL}#roster?fn=${lg.flightNumber.replace(/^JX/i,'')}&date=${p.date}"
           target="_blank"
           class="btn btn-sm btn-secondary"
           style="white-space:nowrap;flex-shrink:0;text-decoration:none">
          KneeBoard ✈
        </a>
      </div>
    </div>`).join('')

  return `
    <div class="card" style="margin-bottom:12px">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${dateLabel}</div>
      ${p.reportTime ? `<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:8px">Report ${p.reportAirport} ${p.reportTime}L</div>` : ''}
      ${legs}
    </div>`
}

// ── Debug card (raw WS events) ────────────────

function debugCard(wsEvents) {
  if (!wsEvents?.length) return ''
  const rows = wsEvents.map(e =>
    `<div style="margin-bottom:6px"><b style="color:#f59e0b">${e.event}</b><br>
     <span style="font-size:10px;word-break:break-all">${JSON.stringify(e.data).slice(0,200)}</span></div>`
  ).join('')
  return `
    <div class="card" style="margin-bottom:12px;border:1px solid #f59e0b22">
      <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:8px">
        🔍 Debug — ${wsEvents.length} WS events received
      </div>
      <div style="font-size:11px;color:var(--color-text-secondary);line-height:1.7">${rows}</div>
      <div style="font-size:10px;color:var(--color-text-tertiary);margin-top:8px">
        Event names above → update _parseRosterEvents() in worker.js once structure is known.
      </div>
    </div>`
}

// ── Bottom nav ────────────────────────────────

function bottomNav() {
  const items = [
    { id: 'dashboard', icon: '⊞', label: 'Dashboard' },
    { id: 'list',      icon: '✈', label: 'Flights'   },
    { id: 'roster',    icon: '📅', label: 'Roster'    },
    { id: 'settings',  icon: '⚙', label: 'Settings'  },
  ]
  return `
    <nav class="bottom-nav">
      ${items.map(i => `
        <button class="nav-item ${i.id === 'roster' ? 'active' : ''}" data-nav="${i.id}">
          <span class="nav-icon">${i.icon}</span>
          <span>${i.label}</span>
        </button>`).join('')}
    </nav>`
}

// ── Login form ────────────────────────────────

function renderLoginForm(scroll, uid, onSuccess) {
  scroll.innerHTML = `
    <div style="padding:16px 16px 32px">
      <div class="card">
        <div style="font-weight:700;font-size:16px;margin-bottom:4px">PegaSys 登入</div>
        <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:20px;line-height:1.5">
          帳密加密後存於 Firestore，跨裝置共用。
        </div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:6px">員工編號</label>
          <input id="pg-uid" type="text" inputmode="numeric" autocomplete="username"
                 placeholder="2317073" maxlength="10"
                 style="width:160px;padding:10px 12px;border:1px solid var(--border-subtle);
                        border-radius:8px;background:var(--color-bg);color:var(--color-text);
                        font-size:15px">
        </div>
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:6px">密碼</label>
          <input id="pg-pw" type="password" autocomplete="current-password"
                 placeholder="••••••••" maxlength="64"
                 style="width:200px;padding:10px 12px;border:1px solid var(--border-subtle);
                        border-radius:8px;background:var(--color-bg);color:var(--color-text);
                        font-size:15px">
        </div>
        <div id="pg-err" style="display:none;font-size:13px;color:#ef4444;margin-bottom:14px"></div>
        <button id="pg-login-btn" class="btn btn-primary" style="padding:11px 28px;font-size:15px">
          登入
        </button>
      </div>
    </div>`

  const uidInp  = scroll.querySelector('#pg-uid')
  const pwInp   = scroll.querySelector('#pg-pw')
  const errEl   = scroll.querySelector('#pg-err')
  const loginBtn = scroll.querySelector('#pg-login-btn')

  const doLogin = async () => {
    const employeeId = uidInp.value.trim()
    const password   = pwInp.value
    if (!employeeId) { uidInp.focus(); return }
    if (!password)   { pwInp.focus();  return }

    loginBtn.disabled = true
    loginBtn.textContent = '驗證中…'
    errEl.style.display = 'none'

    try {
      const resp = await fetch(`${WORKER_URL}/pegasys/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        errEl.textContent = data.error === 'invalid_credentials' ? '帳號或密碼錯誤' : `錯誤：${data.error}`
        errEl.style.display = 'block'
        loginBtn.disabled = false
        loginBtn.textContent = '登入'
        return
      }
      await savePegasysCreds(uid, employeeId, password)
      showToast('✅ 登入成功')
      onSuccess(employeeId, password)
    } catch (e) {
      errEl.textContent = `連線失敗：${e.message}`
      errEl.style.display = 'block'
      loginBtn.disabled = false
      loginBtn.textContent = '登入'
    }
  }

  loginBtn.addEventListener('click', doLogin)
  pwInp.addEventListener('keydown',  e => { if (e.key === 'Enter') doLogin() })
  uidInp.addEventListener('keydown', e => { if (e.key === 'Enter') pwInp.focus() })
}

// ── Roster content ────────────────────────────

function renderRosterContent(scroll, wsResult, cachedPairings) {
  const pairings = cachedPairings.filter(p => isFuture(p.date))
    .sort((a, b) => a.date.localeCompare(b.date))

  const staleHtml = wsResult?.stale
    ? `<div style="font-size:12px;color:#f59e0b;padding:8px 12px;background:rgba(245,158,11,.1);
                   border-radius:8px;margin-bottom:12px">
         ⚠ 離線快取（${(wsResult.cached_at||'').slice(0,16).replace('T',' ')} UTC）
       </div>` : ''

  const dbgHtml  = wsResult?.debug ? debugCard(wsResult.ws_events) : ''

  const listHtml = pairings.length > 0
    ? pairings.map(pairingCard).join('')
    : `<div class="empty-state">
         <div class="empty-state-icon">📅</div>
         <div class="empty-state-title">尚無班表資料</div>
         <div class="empty-state-sub">點擊右上角 ↻ 取得最新班表</div>
       </div>`

  scroll.innerHTML = `<div style="padding:16px 16px 32px">${staleHtml}${dbgHtml}${listHtml}</div>`
}

// ── Main export ───────────────────────────────

export async function renderRoster(root) {
  const uid = state.user?.uid
  if (!uid) { navigate('login'); return }

  // Build shell
  root.innerHTML = `
    <div class="page">
      <div class="topbar">
        <div style="width:44px"></div>
        <div class="topbar-title" style="text-align:center">Roster</div>
        <button id="roster-refresh" style="width:44px;background:none;border:none;
                color:var(--color-primary);font-size:18px;cursor:pointer;padding:0">↻</button>
      </div>
      <div class="scroll" id="roster-scroll" style="padding-top:0"></div>
      ${bottomNav()}
    </div>`

  root.querySelectorAll('[data-nav]').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.nav))
  )

  const scroll = root.querySelector('#roster-scroll')
  const refreshBtn = root.querySelector('#roster-refresh')

  // Load credentials
  scroll.innerHTML = `<div class="list-loading"><div class="loader"></div></div>`
  const creds = await getPegasysCreds(uid)

  if (!creds?.employeeId || !creds?.password) {
    renderLoginForm(scroll, uid, (employeeId, password) => {
      doFetch(scroll, refreshBtn, uid, employeeId, password)
    })
    return
  }

  // Auto-fetch on mount
  doFetch(scroll, refreshBtn, uid, creds.employeeId, creds.password)

  refreshBtn.addEventListener('click', async () => {
    const c = await getPegasysCreds(uid)
    if (c?.employeeId) doFetch(scroll, refreshBtn, uid, c.employeeId, c.password)
  })
}

let _fetching = false

async function doFetch(scroll, refreshBtn, uid, employeeId, password) {
  if (_fetching) return
  _fetching = true
  refreshBtn.disabled = true
  refreshBtn.textContent = '…'
  scroll.innerHTML = `<div class="list-loading"><div class="loader"></div></div>`

  try {
    const result = await fetchRoster(employeeId, password)

    // Parse and cache pairings if properly structured
    let pairings = []
    if (result.pairings?.length > 0 && !result.pairings[0]._raw_event) {
      pairings = result.pairings
      showToast(`✅ 班表已更新（${pairings.length} 筆）`)
    } else if (result.ws_events?.length > 0) {
      showToast(`📡 收到 ${result.ws_events.length} 個 WS 事件`)
    } else {
      showToast('⚠ 未收到班表資料')
    }

    renderRosterContent(scroll, result, pairings)
  } catch (e) {
    if (e.status === 401) {
      await clearPegasysCreds(uid)
      showToast('❌ 帳號或密碼已失效，請重新登入')
      const c2 = await getPegasysCreds(uid)  // will be cleared, triggers login form
      renderLoginForm(scroll, uid, (eid, pw) => doFetch(scroll, refreshBtn, uid, eid, pw))
    } else {
      showToast(`❌ ${e.message}`)
      scroll.innerHTML = `
        <div style="padding:32px 16px;text-align:center">
          <div style="font-size:32px;margin-bottom:12px">⚠</div>
          <div style="font-size:14px;color:var(--color-text-secondary)">${e.message}</div>
        </div>`
    }
  } finally {
    _fetching = false
    refreshBtn.disabled = false
    refreshBtn.textContent = '↻'
  }
}
