// ══════════════════════════════════════════════
// Settings Page
// ══════════════════════════════════════════════
import { getProfile, saveProfile,
         getAllFlights }                        from '../db.js'
import { logout }                              from '../auth.js'
import { state, setProfile }                   from '../state.js'
import { navigate, showToast }                 from '../app.js'

export async function renderSettings(root) {
  root.innerHTML = buildShell()
  attachNav(root)
  await loadData(root)
}

function buildShell() {
  return `
    <div class="page">
      <div class="topbar">
        <div style="width:44px"></div>
        <div class="topbar-title" style="text-align:center">Settings</div>
        <div style="width:44px"></div>
      </div>

      <div class="scroll" id="settings-scroll">
        <div class="list-loading"><div class="loader"></div></div>
      </div>

      <nav class="bottom-nav">
        <button class="nav-item" data-nav="dashboard">
          <span class="nav-icon">⊞</span><span>Dashboard</span>
        </button>
        <button class="nav-item" data-nav="list">
          <span class="nav-icon">✈</span><span>Flights</span>
        </button>
        <button class="nav-item active" data-nav="settings">
          <span class="nav-icon">⚙</span><span>Settings</span>
        </button>
      </nav>
    </div>`
}

function attachNav(root) {
  root.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav))
  })
}

async function loadData(root) {
  const uid  = state.user.uid
  const prof = await getProfile(uid)
  if (prof) setProfile(prof)
  renderContent(root)
}

function renderContent(root) {
  const scroll = root.querySelector('#settings-scroll')
  const prof   = state.profile || {}

  scroll.innerHTML = `
    <!-- Profile -->
    <div class="settings-header">個人資料</div>
    <div class="settings-section">
      <div class="settings-row" id="row-name">
        <span class="settings-row-label">姓名</span>
        <span class="settings-row-value">${prof.name || '未設定'}</span>
        <span class="settings-row-chevron">›</span>
      </div>
    </div>

    <!-- Data -->
    <div class="settings-header">資料管理</div>
    <div class="settings-section">
      <div class="settings-row" id="row-export">
        <span class="settings-row-label">匯出備份（JSON）</span>
        <span class="settings-row-chevron">›</span>
      </div>
      <div class="settings-row" id="row-import-tool">
        <span class="settings-row-label">開啟匯入工具</span>
        <span class="settings-row-chevron">›</span>
      </div>
    </div>

    <!-- Account -->
    <div class="settings-header">帳號</div>
    <div class="settings-section">
      <div class="settings-row" style="color:var(--text-dim)">
        <span class="settings-row-label">登入帳號</span>
        <span class="settings-row-value" style="font-size:12px">${state.user?.email || ''}</span>
      </div>
      <div class="settings-row" id="row-logout" style="color:var(--red)">
        <span class="settings-row-label">登出</span>
      </div>
    </div>

    <div style="height:20px"></div>
  `

  attachSettingsEvents(root)
}


function attachSettingsEvents(root) {
  // Name edit
  root.querySelector('#row-name')?.addEventListener('click', () => {
    showInputSheet(root, '姓名', state.profile?.name || '', async val => {
      await saveProfile(state.user.uid, { name: val })
      setProfile({ ...(state.profile || {}), name: val })
      renderContent(root)
    })
  })

  // Export
  root.querySelector('#row-export')?.addEventListener('click', async () => {
    try {
      const flights = await getAllFlights(state.user.uid)
      const blob = new Blob([JSON.stringify(flights, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `logbook_${new Date().toISOString().slice(0,10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast(`已匯出 ${flights.length} 筆`, 'success')
    } catch (e) {
      showToast('匯出失敗: ' + e.message, 'error')
    }
  })

  // Import tool
  root.querySelector('#row-import-tool')?.addEventListener('click', () => {
    window.open('tools/import.html', '_blank')
  })

  // Logout
  root.querySelector('#row-logout')?.addEventListener('click', () => {
    showConfirm('確定要登出？', async () => {
      await logout()
      navigate('login')
    })
  })
}

// ── Sheets ─────────────────────────────────────

function showInputSheet(root, title, value, onSave) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${title}</div>
      <input class="form-input" id="sheet-input" type="text" value="${value}"
             style="font-size:16px">
      <button class="btn btn-primary btn-full" id="sheet-save">儲存</button>
    </div>`
  document.body.appendChild(overlay)
  const inp = overlay.querySelector('#sheet-input')
  inp.focus(); inp.select()
  overlay.querySelector('#sheet-save').addEventListener('click', async () => {
    await onSave(inp.value.trim())
    overlay.remove()
    showToast('已儲存', 'success')
  })
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}


function showConfirm(message, onOk) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet" style="gap:16px">
      <div class="modal-handle"></div>
      <div style="text-align:center;font-size:15px;color:var(--text)">${message}</div>
      <button class="btn btn-primary btn-full" id="ok-btn">確定</button>
      <button class="btn btn-secondary btn-full" id="cancel-btn">取消</button>
    </div>`
  document.body.appendChild(overlay)
  overlay.querySelector('#ok-btn').addEventListener('click', () => { overlay.remove(); onOk() })
  overlay.querySelector('#cancel-btn').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}
