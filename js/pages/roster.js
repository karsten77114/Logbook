// ══════════════════════════════════════════════
// Roster Page — PegaSys 月曆版 (v52)
// ══════════════════════════════════════════════
import { getDoc, setDoc, doc, collection, query, where, getDocs } from 'firebase/firestore'
import { getFirestore }          from 'firebase/firestore'
import { getFirebaseApp }        from '../auth.js'
import { state }                 from '../state.js'
import { navigate, showToast }   from '../app.js'
import { navIcon }               from '../ui/nav-icons.js'

export const WORKER_URL  = 'https://jx-briefing.karsten77114.workers.dev'
const KB_URL      = 'https://karsten77114.github.io/Kneeboard/'
const MONTHS      = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
const WDAYS       = ['日','一','二','三','四','五','六']
const STYLE_ID    = 'roster-cal-v3'
const ROSTER_TIMEOUT_MS = 15000

// ── Roster 快取（localStorage）────────────────
const _RC_KEY = 'lb_roster_v1'
const _RC_TTL = 45 * 60 * 1000  // 45 分鐘

function _rcGet(uid) {
  try {
    const c = JSON.parse(localStorage.getItem(_RC_KEY) || 'null')
    if (!c || c.uid !== uid || Date.now() - c.t > _RC_TTL) return null
    return c.pairings
  } catch { return null }
}

function _rcSet(uid, pairings) {
  try {
    localStorage.setItem(_RC_KEY, JSON.stringify({ uid, pairings, t: Date.now() }))
  } catch {}
}

/** 靜默暖機：App 開啟 / 回前台時呼叫，確保快取是新鮮的 */
export async function warmRosterCache(uid) {
  if (_rcGet(uid)) return            // 快取還新鮮，不重抓
  const creds = await getPegasysCreds(uid).catch(() => null)
  if (!creds?.employeeId || !creds?.password) return
  try {
    const r = await fetchRoster(creds.employeeId, creds.password)
    if (r.pairings?.length) _rcSet(uid, r.pairings)
  } catch {}                         // 靜默失敗，不影響主流程
}

// ── CSS 注入（版本號防重複）─────────────────────
function _injectStyles() {
  document.getElementById('roster-cal-v1')?.remove()  // 清除舊版
  document.getElementById('roster-cal-v2')?.remove()  // 清除舊版
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
    .cal-day.cal-selected { background:rgba(160,104,24,.10); }
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
      text-align:center; word-break:keep-all;
    }
    .cal-fn-future   { color:var(--accent,#a06818); }
    .cal-fn-logged   { color:var(--green,#1a7838); }
    .cal-fn-unlogged { color:var(--amber,#b85808); }
    .cal-fn-old      { color:var(--text-faint,#9a7858); }
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
// "20260524" → "2026-05-24"
function _dsToIso(ds) {
  return `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`
}
// "06:55" → "0655"  （add.js 的 std/sta 參數不含冒號）
function _hhmm(s) { return (s || '').replace(':', '') }
// n 天前的 YYYYMMDD 字串
function _daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
}
// n 天後的 YYYYMMDD 字串
function _daysAhead(n) {
  const d = new Date(); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
}

// ── Worker fetch ──────────────────────────────
async function fetchRoster(employeeId, password) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ROSTER_TIMEOUT_MS)
  try {
    const resp = await fetch(`${WORKER_URL}/pegasys/roster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, password }),
      signal: ctrl.signal,
    })
    const data = await resp.json()
    if (!resp.ok) throw Object.assign(new Error(data.error || `HTTP ${resp.status}`), { status: resp.status })
    return data
  } finally {
    clearTimeout(timer)
  }
}

// ── Logbook 連動：查詢過去航班是否已記錄 ─────
// key: "YYYYMMDD_fnWithoutJX"  →  value: Firestore flightId
let _loggedFlights = new Map()

async function loadLoggedFlights(uid, pairings) {
  const today  = todayStr()
  const cutoff = _daysAgo(PAST_DAYS_LIMIT)   // 90 天前，不追蹤更舊的

  // 只查最近 90 天的過去出勤日
  const past = pairings.filter(p => p.date < today && p.date >= cutoff)
  if (past.length === 0) { _loggedFlights = new Map(); return }

  // fingerprint：過去出勤日清單（歷史班表固定，可長效快取）
  const sig = uid + ':' + past.map(p => p.date).sort().join(',')

  // cache hit：同一批日期且距上次查詢 < 5 分鐘
  if (sig === _loggedFlightsSig && Date.now() - _loggedFlightsTs < LOGGED_TTL_MS) return

  const dates = past.map(p => p.date)
  const minDs = dates.reduce((a, b) => a < b ? a : b)
  const maxDs = dates.reduce((a, b) => a > b ? a : b)

  try {
    const q    = query(
      collection(db(), 'users', uid, 'flights'),
      where('date', '>=', _dsToIso(minDs)),
      where('date', '<=', _dsToIso(maxDs))
    )
    const snap = await getDocs(q)
    _loggedFlights = new Map()
    for (const d of snap.docs) {
      const f       = d.data()
      const dateKey = (f.date || '').replace(/-/g, '')           // YYYY-MM-DD → YYYYMMDD
      const fn      = (f.flightNumber || '').replace(/^JX/i, '') // 去 JX 前綴
      if (dateKey && fn) _loggedFlights.set(`${dateKey}_${fn}`, d.id)
    }
    _loggedFlightsSig = sig
    _loggedFlightsTs  = Date.now()
  } catch (e) {
    console.warn('[Roster] loadLoggedFlights failed:', e)
    _loggedFlights = new Map()
  }
}

// ── 給 Add Flight 用：取得「最新一筆尚未記錄」的 leg ─
// 供 add.js 在使用者直接點 + 新增（非經 Roster 補記錄按鈕）時自動帶入
export async function getLatestUnloggedLeg(uid) {
  const creds = await getPegasysCreds(uid)
  if (!creds?.employeeId || !creds?.password) return null

  // 快取命中 → 立即回傳，同時在背景更新
  let pairings = _rcGet(uid)
  if (pairings) {
    fetchRoster(creds.employeeId, creds.password)
      .then(r => { if (r.pairings?.length) _rcSet(uid, r.pairings) })
      .catch(() => {})
  } else {
    try {
      const result = await fetchRoster(creds.employeeId, creds.password)
      pairings = result.pairings
      if (pairings?.length) _rcSet(uid, pairings)
    } catch { return null }
  }
  if (!Array.isArray(pairings) || !pairings.length || !pairings[0]?.date) return null

  await loadLoggedFlights(uid, pairings)

  const today  = todayStr()
  const cutoff = _daysAgo(PAST_DAYS_LIMIT)

  // 含今天、不含未來；由新到舊
  const candidates = pairings
    .filter(p => p.date <= today && p.date >= cutoff)
    .flatMap(p => (p.legs || []).map(lg => ({ ...lg, date: p.date })))
    .sort((a, b) => b.date.localeCompare(a.date))

  for (const lg of candidates) {
    const fn = lg.flightNumber.replace(/^JX/i, '')
    if (!_loggedFlights.has(`${lg.date}_${fn}`)) {
      return {
        flightNumber: lg.flightNumber,
        date:         _dsToIso(lg.date),
        from:         lg.dep,
        to:           lg.dest,
      }
    }
  }
  return null
}

/** Add Flight Step 1 選擇器：取得最近 7 天 + 未來 3 天的所有 legs，含已記錄狀態 */
export async function getRecentLegsForPicker(uid) {
  const creds = await getPegasysCreds(uid).catch(() => null)
  if (!creds?.employeeId || !creds?.password) return null

  let pairings = _rcGet(uid)
  if (!pairings) {
    try {
      const r = await fetchRoster(creds.employeeId, creds.password)
      pairings = r.pairings
      if (pairings?.length) _rcSet(uid, pairings)
    } catch { return null }
  }
  if (!Array.isArray(pairings) || !pairings.length) return null

  await loadLoggedFlights(uid, pairings)

  const today  = todayStr()
  const cutoff = _daysAgo(7)
  // UTC+8 HHMM — STARLUX 航班以台灣時區為基準判斷是否已起飛
  const nowHhmm = new Date(Date.now() + 8 * 3600000).toISOString().slice(11, 16).replace(':', '')

  const legs = pairings
    .filter(p => p.date >= cutoff && p.date <= today)  // 只看過去 7 天 + 今天（不含未來）
    .flatMap(p => (p.legs || []).map(lg => ({
      flightNumber: lg.flightNumber,
      dateDs:       p.date,
      dateIso:      _dsToIso(p.date),
      from:         lg.dep,
      to:           lg.dest,
      stdLocal:     lg.std_local || '',
      blockTime:    lg.blockTime || 0,
      logged:       _loggedFlights.has(`${p.date}_${lg.flightNumber.replace(/^JX/i, '')}`),
    })))
    .filter(leg => {
      if (leg.logged) return false                       // 已記錄 → 不顯示
      if (leg.dateDs < today) return true                // 過去日期 → 一定已起飛
      // 今天：表訂起飛 (UTC+8) 已過才顯示
      const std = (leg.stdLocal || '').replace(':', '')
      return !std || std <= nowHhmm
    })

  // 最近未記錄航班在最上面（只有過去航班，直接由新到舊）
  return legs.sort((a, b) => b.dateDs.localeCompare(a.dateDs))
}

// ── 月曆狀態 ──────────────────────────────────
let _calYear  = new Date().getFullYear()
let _calMonth = new Date().getMonth()   // 0-indexed
let _pairings = []
let _selected = null                    // 'YYYYMMDD'

// ── loadLoggedFlights 快取狀態 ────────────────
let _loggedFlightsTs  = 0     // 上次查詢時間（ms）
let _loggedFlightsSig = ''    // 過去出勤日 fingerprint
const LOGGED_TTL_MS   = 5 * 60 * 1000   // 5 分鐘 TTL
const PAST_DAYS_LIMIT = 90              // 只追蹤最近 90 天

// ── 月曆渲染 ──────────────────────────────────
function renderCalendar(scrollEl) {
  _injectStyles()
  const today = todayStr()
  const year  = _calYear
  const month = _calMonth

  const firstDow    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // ── 日期格線 ─────────────────────────────────
  let cells = ''
  for (let i = 0; i < firstDow; i++) cells += '<div></div>'

  for (let d = 1; d <= daysInMonth; d++) {
    const ds      = `${year}${String(month+1).padStart(2,'0')}${String(d).padStart(2,'0')}`
    const ps      = _pairings.filter(p => p.date === ds)
    const isToday = ds === today
    const isSel   = ds === _selected
    const hasDuty = ps.length > 0
    const isPast  = ds < today   // 今天 ds===today 不滿足 < 所以 isPast=false

    const allLegs = hasDuty ? ps.flatMap(p => p.legs) : []

    // 每個腿的顏色：過去→看 _loggedFlights；今天/未來→藍色；90 天外→灰色不追蹤
    const cutoff = _daysAgo(PAST_DAYS_LIMIT)
    let fnBadges = ''
    if (hasDuty) {
      for (const lg of allLegs.slice(0, 2)) {
        const fn  = lg.flightNumber.replace(/^JX/i, '')
        let cls = 'cal-fn-future'
        if (isPast) {
          if (ds < cutoff) {
            cls = 'cal-fn-old'   // 超過 90 天，不追蹤
          } else {
            cls = _loggedFlights.has(`${ds}_${fn}`) ? 'cal-fn-logged' : 'cal-fn-unlogged'
          }
        }
        fnBadges += `<div class="cal-fn ${cls}">${fn}</div>`
      }
    }

    cells += `
      <div class="cal-day${isToday?' cal-today':''}${isSel?' cal-selected':''}${hasDuty?' cal-duty':''}"
           ${hasDuty ? `data-date="${ds}"` : ''}>
        <div class="cal-day-num" style="${isPast?'color:var(--color-text-tertiary)':''}">${d}</div>
        ${fnBadges}
        ${hasDuty && allLegs.length === 0 ? '<div class="cal-dot"></div>' : ''}
      </div>`
  }

  // ── 選取日詳情面板 ─────────────────────────────
  let detailHtml = ''
  if (_selected) {
    const ps      = _pairings.filter(p => p.date === _selected)
    const isToday = _selected === today
    const isPast  = _selected < today   // 今天不是 past

    if (ps.length > 0) {
      const p    = ps[0]
      const legs = p.legs || []

      const cutoff = _daysAgo(PAST_DAYS_LIMIT)
      const rows = legs.map(lg => {
        const fn       = lg.flightNumber.replace(/^JX/i, '')
        const key      = `${_selected}_${fn}`
        const inWindow = isPast && _selected >= cutoff   // 90 天內才追蹤
        const logged   = inWindow && _loggedFlights.has(key)
        const unlogged = inWindow && !_loggedFlights.has(key)
        const fId      = _loggedFlights.get(key)

        // 補記 URL（預填 add wizard）
        const addUrl = `add?fn=${lg.flightNumber}&date=${p.date}` +
          `&from=${lg.dep}&to=${lg.dest}` +
          `&std=${_hhmm(lg.std_local)}&sta=${_hhmm(lg.sta_local)}` +
          `&block=${lg.blockTime || 0}`

        return `
          <div ${logged && fId ? `data-navigate="detail/${fId}"` : ''}
               style="display:flex;align-items:center;padding:9px 0;
                      border-bottom:1px solid var(--border-subtle);
                      ${logged && fId ? 'cursor:pointer;' : ''}">
            <!-- 左側：航班資訊 -->
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-weight:700;font-size:15px">${lg.flightNumber}</span>
                <span style="font-size:12px;color:var(--color-text-secondary)">${lg.dep} → ${lg.dest}</span>
                ${logged   ? `<span style="font-size:10px;color:#4ade80;font-weight:700">✓ 已記錄</span>` : ''}
                ${unlogged ? `<span style="font-size:10px;color:#fb923c;font-weight:700">⚠ 未記錄</span>` : ''}
              </div>
              <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px">
                ${lg.std_local}–${lg.sta_local}L
                ${lg.blockTime ? `&nbsp;·&nbsp;${blockStr(lg.blockTime)}` : ''}
              </div>
            </div>
            <!-- 右側 -->
            <div style="flex-shrink:0;margin-left:8px;display:flex;align-items:center;gap:6px">
              ${unlogged ? `
                <button class="btn btn-sm btn-primary"
                        data-navigate="${addUrl}"
                        style="white-space:nowrap;font-size:11px;
                               background:#fb923c;border-color:#fb923c">
                  補記錄
                </button>` : ''}
              ${isToday ? `
                <a href="${KB_URL}#roster?fn=${fn}&date=${p.date}"
                   target="_blank"
                   class="btn btn-sm btn-primary"
                   style="text-decoration:none;white-space:nowrap">
                  KneeBoard ✈
                </a>` : ''}
              ${logged && fId ? `<span style="color:var(--color-text-tertiary);font-size:18px;line-height:1">›</span>` : ''}
            </div>
          </div>`
      }).join('')

      const selDateLabel =
        `${parseInt(_selected.slice(6,8))} ${MONTHS[parseInt(_selected.slice(4,6))-1]} ${_selected.slice(0,4)}`
      const isFuture = _selected > today

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
          ${isFuture && legs.length > 0 ? `
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

  // ── 事件綁定 ─────────────────────────────────
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
  // 日期格：點擊選取
  scrollEl.querySelectorAll('.cal-day[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      _selected = _selected === cell.dataset.date ? null : cell.dataset.date
      renderCalendar(scrollEl)
    })
  })
  // 詳情按鈕：navigate（查看記錄 / 補記錄）
  scrollEl.querySelectorAll('[data-navigate]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.navigate))
  })
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
        <button class="nav-item ${i.id === 'roster' ? 'active' : ''}" data-nav="${i.id}">
          <span class="nav-icon">${navIcon(i.id)}</span>
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
                 placeholder="員工編號" maxlength="10"
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

function renderRosterLoading(scroll, message = '正在讀取 PegaSys 班表…') {
  scroll.innerHTML = `
    <div class="roster-state">
      <div class="loader"></div>
      <div class="roster-state-title">${message}</div>
      <div class="roster-state-sub">通常幾秒內會完成；若密碼剛更新，可能需要重新設定帳密。</div>
    </div>`
}

function renderRosterError(scroll, { title, message, showCreds = true }, onRetry, onCreds) {
  scroll.innerHTML = `
    <div class="roster-state">
      <div class="roster-state-icon">⚠</div>
      <div class="roster-state-title">${title}</div>
      <div class="roster-state-sub">${message}</div>
      <div class="roster-state-actions">
        <button class="btn btn-primary btn-sm" id="roster-retry">重新整理</button>
        ${showCreds ? '<button class="btn btn-secondary btn-sm" id="roster-creds">帳密設定</button>' : ''}
      </div>
    </div>`
  scroll.querySelector('#roster-retry')?.addEventListener('click', onRetry)
  scroll.querySelector('#roster-creds')?.addEventListener('click', onCreds)
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
      doFetch(scroll, refreshBtn, uid, employeeId, password, true)
    })
  })

  // 讀取 credentials
  renderRosterLoading(scroll, '正在讀取帳密設定…')
  const creds = await getPegasysCreds(uid)

  if (!creds?.employeeId || !creds?.password) {
    renderLoginForm(scroll, uid, (employeeId, password) => {
      doFetch(scroll, refreshBtn, uid, employeeId, password, true)
    })
    return
  }

  // 自動取得班表
  doFetch(scroll, refreshBtn, uid, creds.employeeId, creds.password)

  refreshBtn.addEventListener('click', async () => {
    const c = await getPegasysCreds(uid)
    if (c?.employeeId) doFetch(scroll, refreshBtn, uid, c.employeeId, c.password, true)
  })
}

let _fetching = false

async function doFetch(scroll, refreshBtn, uid, employeeId, password, forceRefresh = false) {
  if (_fetching) return

  // Cache-first: render immediately from localStorage when not forcing a refresh
  if (!forceRefresh) {
    const cached = _rcGet(uid)
    if (cached) {
      _pairings = cached
      await loadLoggedFlights(uid, cached)
      const today = todayStr()
      const upcoming = cached.filter(p => p.date >= today).sort((a, b) => a.date.localeCompare(b.date))
      if (upcoming.length > 0) {
        _calYear  = parseInt(upcoming[0].date.slice(0, 4))
        _calMonth = parseInt(upcoming[0].date.slice(4, 6)) - 1
      } else {
        _calYear  = new Date().getFullYear()
        _calMonth = new Date().getMonth()
      }
      _selected = cached.some(p => p.date === today) ? today : null
      renderCalendar(scroll)
      return
    }
  }

  _fetching = true
  refreshBtn.disabled = true
  refreshBtn.textContent = '…'
  renderRosterLoading(scroll)

  const slowTimer = setTimeout(() => {
    if (_fetching) {
      renderRosterLoading(scroll, 'PegaSys 回應較久，仍在等待…')
    }
  }, 8000)

  try {
    const result   = await fetchRoster(employeeId, password)
    const pairings = result.pairings
    const isReal   = Array.isArray(pairings) && pairings.length > 0 && pairings[0].date
    const isDebug  = !Array.isArray(pairings) && pairings?._debug === true

    if (isReal) {
      _pairings = pairings
      _rcSet(uid, pairings)   // 更新 localStorage 快取

      // 查詢 Logbook：過去航班是否已記錄
      await loadLoggedFlights(uid, pairings)

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
      _pairings      = []
      _loggedFlights = new Map()
      _calYear  = new Date().getFullYear()
      _calMonth = new Date().getMonth()
      renderCalendar(scroll)
      showToast('📅 本月無班表')
    }

  } catch (e) {
    if (e.status === 401) {
      await clearPegasysCreds(uid)
      showToast('❌ 帳號或密碼已失效，請重新登入')
      renderLoginForm(scroll, uid, (eid, pw) => doFetch(scroll, refreshBtn, uid, eid, pw, true))
    } else {
      const isTimeout = e.name === 'AbortError'
      const message = isTimeout
        ? 'PegaSys 或同步 Worker 回應逾時。請稍後重試；如果公司剛更新密碼，請重新設定帳密。'
        : e.message
      showToast(`❌ ${isTimeout ? '班表讀取逾時' : e.message}`)
      renderRosterError(scroll, {
        title: isTimeout ? '班表讀取逾時' : '班表讀取失敗',
        message,
      }, () => doFetch(scroll, refreshBtn, uid, employeeId, password, true), () => {
        renderLoginForm(scroll, uid, (eid, pw) => doFetch(scroll, refreshBtn, uid, eid, pw, true))
      })
    }
  } finally {
    clearTimeout(slowTimer)
    _fetching = false
    refreshBtn.disabled = false
    refreshBtn.textContent = '↻'
  }
}
