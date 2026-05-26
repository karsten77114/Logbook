// ══════════════════════════════════════════════
// Settings Page
// ══════════════════════════════════════════════
import { getProfile, saveProfile,
         getCareer, saveCareer,
         getCrew, saveCrew, deleteCrew,
         getAllFlights }                        from '../db.js'
import { logout }                              from '../auth.js'
import { state, setProfile, setCareer, setCrew } from '../state.js'
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
        <div class="topbar-title">Settings</div>
      </div>

      <div class="scroll" id="settings-scroll">
        <div class="list-loading"><div class="loader"></div></div>
      </div>

      <nav class="bottom-nav">
        <button class="nav-item" data-nav="list">
          <span class="nav-icon">≡</span><span>Logbook</span>
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
  const career = await getCareer(uid)
  setCareer(career)
  const crew = await getCrew(uid)
  setCrew(crew)

  renderContent(root)
}

function renderContent(root) {
  const scroll = root.querySelector('#settings-scroll')
  const prof   = state.profile || {}
  const career = state.career  || []
  const crew   = state.crew    || []

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

    <!-- Career -->
    <div class="settings-header">職涯記錄</div>
    <div class="settings-section" id="career-section">
      ${career.length === 0
        ? `<div class="settings-row" style="color:var(--text-dim)">尚無記錄</div>`
        : career.map((c, i) => careerItemHtml(c, i)).join('')}
      <div class="settings-row" id="row-add-career" style="color:var(--accent)">
        <span class="settings-row-label">＋ 新增職涯記錄</span>
      </div>
    </div>

    <!-- Crew -->
    <div class="settings-header">Crew 名單（${crew.length} 位）</div>
    <div class="settings-section" id="crew-section">
      ${crew.slice(0,20).map(c => crewRowHtml(c)).join('')}
      ${crew.length > 20 ? `<div class="settings-row text-dim">…還有 ${crew.length-20} 位</div>` : ''}
      <div class="settings-row" id="row-add-crew" style="color:var(--accent)">
        <span class="settings-row-label">＋ 新增機師</span>
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

function careerItemHtml(c, i) {
  const end = c.endDate || '至今'
  return `
    <div class="career-item" data-career-idx="${i}">
      <div class="career-dates mono">${c.startDate || '?'} – ${end}</div>
      <div class="career-main">${c.airline || '—'} · ${c.position || '—'}</div>
      <div class="career-sub">${c.aircraftType || '—'} · Base: ${c.base || '—'}</div>
    </div>`
}

function crewRowHtml(c) {
  return `
    <div class="settings-row" data-crew-id="${c.id}">
      <span class="settings-row-label">${c.firstName} ${c.lastName}</span>
      <span class="settings-row-value">${c.position || ''}</span>
    </div>`
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

  // Career add
  root.querySelector('#row-add-career')?.addEventListener('click', () => {
    showCareerSheet(root, null, async data => {
      const career = [...(state.career || []), data]
      await saveCareer(state.user.uid, career)
      setCareer(career)
      renderContent(root)
    })
  })

  // Career edit (tap on item)
  root.querySelectorAll('[data-career-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.careerIdx, 10)
      showCareerSheet(root, state.career[idx], async data => {
        const career = [...state.career]
        career[idx]  = data
        await saveCareer(state.user.uid, career)
        setCareer(career)
        renderContent(root)
      }, async () => {
        const career = state.career.filter((_, i) => i !== idx)
        await saveCareer(state.user.uid, career)
        setCareer(career)
        renderContent(root)
      })
    })
  })

  // Crew add
  root.querySelector('#row-add-crew')?.addEventListener('click', () => {
    showCrewSheet(root, null, async data => {
      const id = `crew_${Date.now()}`
      await saveCrew(state.user.uid, id, data)
      state.crew.push({ id, ...data })
      renderContent(root)
      showToast('已新增', 'success')
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

function showCareerSheet(root, career, onSave, onDelete) {
  const c = career || {}
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${career ? '編輯職涯記錄' : '新增職涯記錄'}</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">開始日期</label>
          <input class="form-input" id="c-start" type="date" value="${c.startDate || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">結束日期（空白=至今）</label>
          <input class="form-input" id="c-end" type="date" value="${c.endDate || ''}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">航空公司</label>
        <input class="form-input" id="c-airline" type="text"
               value="${c.airline || ''}" placeholder="例：星宇航空">
      </div>

      <div class="form-group">
        <label class="form-label">職位</label>
        <select class="form-select" id="c-position">
          ${['學生機師/CPL','FO','SFO','CA','Check Captain','其他'].map(p =>
            `<option ${p === c.position ? 'selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">機型</label>
          <input class="form-input mono" id="c-type" type="text"
                 value="${c.aircraftType || ''}" placeholder="A321-252NX">
        </div>
        <div class="form-group">
          <label class="form-label">Base</label>
          <input class="form-input mono" id="c-base" type="text"
                 value="${c.base || ''}" placeholder="TPE" maxlength="4"
                 autocapitalize="characters">
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="career-save">儲存</button>
      ${onDelete ? `<button class="btn btn-danger btn-full" id="career-del">刪除這段記錄</button>` : ''}
    </div>`
  document.body.appendChild(overlay)

  overlay.querySelector('#career-save').addEventListener('click', async () => {
    const data = {
      startDate:   overlay.querySelector('#c-start').value,
      endDate:     overlay.querySelector('#c-end').value || null,
      airline:     overlay.querySelector('#c-airline').value,
      position:    overlay.querySelector('#c-position').value,
      aircraftType: overlay.querySelector('#c-type').value,
      base:        overlay.querySelector('#c-base').value.toUpperCase(),
    }
    await onSave(data)
    overlay.remove()
    showToast('已儲存', 'success')
  })

  overlay.querySelector('#career-del')?.addEventListener('click', async () => {
    overlay.remove()
    await onDelete()
    showToast('已刪除', 'success')
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

function showCrewSheet(root, crew, onSave) {
  const c = crew || {}
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${crew ? '編輯機師' : '新增機師'}</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">名字</label>
          <input class="form-input" id="cr-first" type="text" value="${c.firstName || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">姓氏</label>
          <input class="form-input" id="cr-last" type="text" value="${c.lastName || ''}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">職位</label>
        <select class="form-select" id="cr-position">
          ${['FO','SFO','CA','Check Captain','其他'].map(p =>
            `<option ${p === c.position ? 'selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </div>

      <button class="btn btn-primary btn-full" id="crew-save">儲存</button>
    </div>`
  document.body.appendChild(overlay)

  overlay.querySelector('#crew-save').addEventListener('click', async () => {
    const data = {
      firstName: overlay.querySelector('#cr-first').value.trim(),
      lastName:  overlay.querySelector('#cr-last').value.trim(),
      position:  overlay.querySelector('#cr-position').value,
    }
    if (!data.firstName && !data.lastName) {
      showToast('請填入名字', 'error'); return
    }
    await onSave(data)
    overlay.remove()
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
