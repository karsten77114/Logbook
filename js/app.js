// ══════════════════════════════════════════════
// Pilot Logbook — Main App Router
// ══════════════════════════════════════════════
import { initFirebase, onAuth,
         handleRedirectResult }  from './auth.js'
import { initDb }                from './db.js'
import { state, setUser,
         setProfile, setCrew,
         setAircraftSettings }   from './state.js'
import { getProfile, getCrew,
         getAircraftSettings }   from './db.js'
import { renderLogin }           from './pages/login.js'
import { renderDashboard }       from './pages/dashboard.js'
import { renderList }            from './pages/list.js'
import { renderAdd }             from './pages/add.js'
import { renderDetail }          from './pages/detail.js'
import { renderSettings }        from './pages/settings.js'

const root = document.getElementById('app')

// ── Init ──────────────────────────────────────

async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
    // 新版 SW 接管後收到通知 → 強制重載以載入最新程式碼
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log('[App] SW updated to', event.data.version, '— reloading…')
        setTimeout(() => window.location.reload(), 1500)
      }
    })
  }

  // Init Firebase
  initFirebase()
  initDb()

  // Handle OAuth redirect result (iOS)
  await handleRedirectResult()

  // Auth state listener
  onAuth(async user => {
    if (user) {
      setUser(user)
      await loadUserData(user.uid)
      // Route to list (or whatever hash says)
      const page = currentPage()
      if (!page || page === 'login') {
        navigate('dashboard')
      } else {
        router()
      }
    } else {
      setUser(null)
      renderLogin(root)
      hideSplash()
    }
  })
}

async function loadUserData(uid) {
  const [profile, crew, aircraftSettings] = await Promise.all([
    getProfile(uid).catch(() => null),
    getCrew(uid).catch(() => []),
    getAircraftSettings(uid).catch(() => ({})),
  ])
  if (profile)          setProfile(profile)
  if (crew)             setCrew(crew)
  if (aircraftSettings) setAircraftSettings(aircraftSettings)
}

// ── Router ────────────────────────────────────

function currentPage() {
  const hash = location.hash.slice(1) || ''
  return hash.split('?')[0].split('/')[0]
}

function currentParams() {
  const hash  = location.hash.slice(1) || ''
  const parts = hash.split('?')[0].split('/')
  return parts.slice(1)
}

function router() {
  if (!state.user) { renderLogin(root); return }

  const page   = currentPage()
  const params = currentParams()

  hideSplash()

  switch (page) {
    case 'add':       renderAdd(root, params);       break
    case 'detail':    renderDetail(root, params);    break
    case 'settings':  renderSettings(root, params);  break
    case 'list':      renderList(root, params);      break
    case 'dashboard':
    default:          renderDashboard(root, params); break
  }
}

export function navigate(path) {
  location.hash = path
}

window.addEventListener('hashchange', () => {
  if (state.user) router()
})

// ── Splash ────────────────────────────────────

function hideSplash() {
  const splash = document.getElementById('splash')
  if (splash) {
    splash.style.opacity = '0'
    splash.style.transition = 'opacity 0.3s'
    setTimeout(() => splash.remove(), 300)
  }
}

// ── Toast ─────────────────────────────────────

export function showToast(message, type = '') {
  const existing = document.querySelector('.toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.3s'
    setTimeout(() => toast.remove(), 300)
  }, 2500)
}

// ── Start ─────────────────────────────────────

init().catch(e => {
  console.error('App init error:', e)
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;
                justify-content:center;height:100%;gap:16px;color:#e04040;padding:32px;text-align:center">
      <div style="font-size:32px">⚠</div>
      <div style="font-size:16px">初始化失敗</div>
      <div style="font-size:12px;color:#6888a0">${e.message}</div>
      <div style="font-size:12px;color:#6888a0">請確認 js/config.js 中的 Firebase 設定是否正確</div>
    </div>`
  hideSplash()
})
