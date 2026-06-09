// ══════════════════════════════════════════════
// Roster Page — PegaSys 月曆版 (v50)
// ══════════════════════════════════════════════
import { getDoc, setDoc, doc }  from 'firebase/firestore'
import { getFirestore }          from 'firebase/firestore'
import { getFirebaseApp }        from '../auth.js'
import { state }                 from '../state.js'
import { navigate, showToast }   from '../app.js'

const WORKER_URL  = 'https://jx-briefing.karsten77114.workers.dev'
const KB_URL      = 'https://karsten77114.github.io/Kneeboard/'
const MONTHS      = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
const WDAYS       = ['日','一','二','三','四','五','六']
const STYLE_ID    = 'roster-cal-v1'

// ── CSS 注入（版本號防重複）─────────────────────
function _injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    .cal-day {
      display:flex; flex-direction:column; align-items:center;
      padding:3px 1px; min-height:50px; border-radius:7px;
      box-sizing:border-box;
    }
    .cal-day.cal-duty { cursor:pointer; }
    .cal-day.cal-selected { background:rgba(255,255,255,.1); }
    .cal-day-num {
      font-size:14px; line-height:26px; width:26px; height:26px;
      text-align:center; border-radius:50%; flex-shrink:0;
    }
    .cal-today .cal-day-num {
      background:var(--color-primary,#60a5fa);
      color:#000; font-weight:700;
    }
    .cal-fn {
      font-size:9px; font-weight:700; line-height:1.3;
      color:var(--color-primary,#60a5fa);
      text-align:center; word-break:keep-all;
    }
    .cal-dot {
      width:5px; height:5px; border-radius:50%;
      background:var(--color-primary,#60a5fa); margin-top:3px;
    }
  `
  document.head.appendChild(s)
}

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
function todayStr() {
  const n = new Date()
  return `${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}`
}
function blockStr(min) {
  if (!min) return ''
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

// ── 月曆狀態 ──────────────────────────────────
let _calYear  = new Date().getFullYear()
let _calMonth = new Date().getMonth()   // 0-indexed
let _pairings = []
let _selected = null                    // 'YYYYMMDD'

// ── 月曆渲染 ──────────────────────────────────
function renderCalendar(scrollEl) {
  _injectStyles()
  const today = todayStr()
  const year  = _calYear
  const month = _calMonth

  const firstDow    = new Date(year, month, 1).getDay()   // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // 日期格線
  let cells = ''
  for (let i = 0; i < firstDow; i++) cells += '<div></div>'

  for (let d = 1; d <= daysInMonth; d++) {
    const ds       = `${year}${String(month+1).padStart(2,'0')}${String(d).padStart(2,'0')}`
    const ps       = _pairings.filter(p => p.date === ds)
    const isToday  = ds === today
    const isSel    = ds === _selected
    const hasDuty  = ps.length > 0
    const isPast   = ds < today && !isToday

    // 最多顯示 2 段航班號（去 JX 前綴）
    const fns = hasDuty
      ? ps.flatMap(p => p.legs.map(l => l.flightNumber.replace(/^JX/i, ''))).slice(0, 2)
      : []

    cells += `
      <div class="cal-day${isToday?' cal-today':''}${isSel?' cal-selected':''}${hasDuty?' cal-duty':''}"
           ${hasDuty ? `data-date="${ds}"` : ''}>
        <div class="cal-day-num" style="${isPast?'color:var(--color-text-tertiary)':''}">${d}</div>
        ${fns.map(fn => `<div class="cal-fn">${fn}</div>`).join('')}
        ${hasDuty && fns.length === 0 ? '<div class="cal-dot"></div>' : ''}
      </div>`
  }

  // 選取日詳情
  let detailHtml = ''
  if (_selected) {
    const ps      = _pairings.filter(p => p.date === _selected)
    const isToday = _selected === today
    if (ps.length > 0) {
      const p    = ps[0]
      const legs = p.legs || []
      const rows = legs.map(lg => `
        <div style="display:flex;align-items:center;padding:9px 0;border-bottom:1px solid var(--border-subtle)">
          <div style="flex:1;min-width:0">
            <span style="font-weight:700;font-size:15px">${lg.flightNumber}</span>
            <span style="font-size:12px;color:var(--color-text-secondary);margin-left:8px">
              ${lg.dep} → ${lg.dest}
            </span>
            <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px">
              ${lg.std_local}–${lg.sta_local}L
              ${lg.blockTime ? `&nbsp;·&nbsp;${blockStr(lg.blockTime)}` : ''}
            </div>
          </div>
          ${isToday ? `
            <a href="${KB_URL}#roster?fn=${lg.flightNumber.replace(/^JX/i,'')}&date=${p.date}"
               target="_blank"
               class="btn btn-sm btn-primary"
               style="flex-shrink:0;text-decoration:none;margin-left:8px;white-space:nowrap">
              KneeBoard ✈
            </a>` : ''}
        </div>`).join('')

      const selDateLabel = `${parseInt(_selected.slice(6,8))} ${MONTHS[parseInt(_selected.slice(4,6))-1]} ${_selected.slice(0,4)}`

      detailHtml = `
        <div style="margin-top:12px;background:var(--bg-card,var(--color-surface));
                    border-radius:12px;padding:10px 14px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
            <div style="font-weight:700;font-size:14px">${selDateLabel}</div>
            ${p.reportTime ? `
              <div style="font-size:12px;color:var(--color-text-secondary)">
                報到 ${p.reportAirport} ${p.reportTime}L
              </div>` : ''}
          </div>
          ${rows || `<div style="font-size:13px;color:var(--color-text-secondary);padding:6px 0">無飛行任務</div>`}
          ${!isToday && legs.length > 0 ? `
            <div style="font-size:11px;color:var(--color-text-tertiary);text-align:center;
                        padding-top:8px">KneeBoard 僅執勤當天開放</div>` : ''}
        </div>`
    }
  }

  scrollEl.innerHTML = `
    <div style="padding:8px 12px 40px">

      <!-- 月份導航 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <button id="cal-prev"
          style="background:none;border:none;color:var(--color-primary);
                 font-size:26px;padding:2px 10px;cursor:pointer;line-height:1">‹</button>
        <div style="font-weight:700;font-size:17px;letter-spacing:.5px">
          ${MONTHS[month]} ${year}
        </div>
        <button id="cal-next"
          style="background:none;border:none;color:var(--color-primary);
                 font-size:26px;padding:2px 10px;cursor:pointer;line-height:1">›</button>
      </div>

      <!-- 星期標頭 -->
      <div style="display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:4px">
        ${WDAYS.map((w,i) => `
          <div style="text-align:center;font-size:11px;padding:2px 0;
               color:${i===0?'#ef4444':i===6?'#60a5fa':'var(--color-text-secondary)'}">
            ${w}</div>`).join('')}
      </div>

      <!-- 日期格線 -->
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
        ${cells}
      </div>

      <!-- 詳情面板 -->
      <div id="cal-detail">${detailHtml}</div>

    </div>`

  // ── 事件 ─────────────────────
  scrollEl.querySelector('#cal-prev').addEventListener('click', () => {
    _calMonth--
    if (_calMonth < 0) { _calMonth = 11; _calYear-- }
    _selected = null
    renderCalendar(scrollEl)
  })
  scrollEl.querySelector('#cal-next').addEventListener('click', () => {
    _calMonth++
    if (_calMonth > 11) { _calMonth = 0; _calYear++ }
    _selected = null
    renderCalendar(scrollEl)
  })
  scrollEl.querySelectorAll('.cal-day[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      _selected = _selected === cell.dataset.date ? null : cell.dataset.date
      renderCalendar(scrollEl)
    })
  })
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

// ── 登入表單 ──────────────────────────────────
function renderLoginForm(scroll, uid, onSuccess) {
  scroll.innerHTML = `
    <div style="padding:16px 16px 32px">
      <div class="card">
        <div style="font-weight:700;font-size:16px;margin-bottom:4px">PegaSys 登入</div>
        <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:20px;line-height:1.5">
          帳密加密後存於 Firestore，跨裝置共用。<br>
          公司強制更新密碼後請重新輸入。
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

  const uidInp   = scroll.querySelector('#pg-uid')
  const pwInp    = scroll.querySelector('#pg-pw')
  const errEl    = scroll.querySelector('#pg-err')
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

// ── Main export ───────────────────────────────
export async function renderRoster(root) {
  const uid = state.user?.uid
  if (!uid) { navigate('login'); return }

  root.innerHTML = `
    <div class="page">
      <div class="topbar">
        <button id="cred-btn"
          style="width:44px;background:none;border:none;cursor:pointer;padding:0;
                 font-size:11px;color:var(--color-text-tertiary);line-height:1.2">
          帳密<br>設定
        </button>
        <div class="topbar-title" style="text-align:center">Roster</div>
        <button id="roster-refresh"
          style="width:44px;background:none;border:none;
                 color:var(--color-primary);font-size:18px;cursor:pointer;padding:0">↻</button>
      </div>
      <div class="scroll" id="roster-scroll" style="padding-top:0"></div>
      ${bottomNav()}
    </div>`

  root.querySelectorAll('[data-nav]').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.nav))
  )

  const scroll     = root.querySelector('#roster-scroll')
  const refreshBtn = root.querySelector('#roster-refresh')
  const credBtn    = root.querySelector('#cred-btn')

  // 帳密按鈕：強制顯示登入表單（更新密碼用）
  credBtn.addEventListener('click', () => {
    renderLoginForm(scroll, uid, (employeeId, password) => {
      _pairings = []
      doFetch(scroll, refreshBtn, uid, employeeId, password)
    })
  })

  // 讀取 credentials
  scroll.innerHTML = `<div class="list-loading"><div class="loader"></div></div>`
  const creds = await getPegasysCreds(uid)

  if (!creds?.employeeId || !creds?.password) {
    renderLoginForm(scroll, uid, (employeeId, password) => {
      doFetch(scroll, refreshBtn, uid, employeeId, password)
    })
    return
  }

  // 自動取得班表
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
    const result   = await fetchRoster(employeeId, password)
    const pairings = result.pairings
    const isReal   = Array.isArray(pairings) && pairings.length > 0 && pairings[0].date
    const isDebug  = !Array.isArray(pairings) && pairings?._debug === true

    if (isReal) {
      _pairings = pairings

      // 自動導航至最近有出勤的月份
      const today    = todayStr()
      const upcoming = pairings
        .filter(p => p.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))
      if (upcoming.length > 0) {
        _calYear  = parseInt(upcoming[0].date.slice(0, 4))
        _calMonth = parseInt(upcoming[0].date.slice(4, 6)) - 1
      } else {
        _calYear  = new Date().getFullYear()
        _calMonth = new Date().getMonth()
      }

      // 如果今天有執勤就自動選取
      _selected = pairings.some(p => p.date === today) ? today : null

      renderCalendar(scroll)
      const futureCount = pairings.filter(p => p.date >= today).length
      showToast(`✅ 班表已更新（${futureCount} 個出勤日）`)

    } else if (isDebug) {
      scroll.innerHTML = `
        <div style="padding:16px">
          <div class="card" style="border:1px solid #f59e0b44">
            <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:6px">
              🔍 ${pairings._reason || '解析中'}
            </div>
            <div style="font-size:11px;font-family:monospace;color:var(--color-text-secondary)">
              alloc: ${pairings.alloc_count ?? '?'} &nbsp;|&nbsp; activity: ${pairings.activity_count ?? '?'}
            </div>
          </div>
        </div>`
      showToast(`⚠ ${pairings._reason || '解析中'}`)

    } else {
      _pairings = []
      _calYear  = new Date().getFullYear()
      _calMonth = new Date().getMonth()
      renderCalendar(scroll)
      showToast('📅 本月無班表')
    }

  } catch (e) {
    if (e.status === 401) {
      await clearPegasysCreds(uid)
      showToast('❌ 帳號或密碼已失效，請重新登入')
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
