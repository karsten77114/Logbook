// ══════════════════════════════════════════════
// Add Flight — 5-Step Wizard (Prototype Design)
// ══════════════════════════════════════════════
import { addFlight }               from '../db.js'
import { state }                   from '../state.js'
import { navigate, showToast }     from '../app.js'
import { invalidateStats }         from './list.js'
import { diffMin, normalizeHm,
         isValidHm, todayUTC }     from '../utils/time.js'
import { calcNightTime }           from '../utils/nighttime.js'
import { APPROACH_TYPES,
         ALL_REGISTRATIONS,
         getTypeByReg }            from '../data/fleet.js'

const STEP_LABELS = ['Route', 'Times', 'Aircraft', 'Piloting', 'Crew']
const CREW_ROLES  = ['Pilot in Command', 'Crew 2', 'Crew 3', 'Crew 4']
const TOTAL       = 5

// ── URL params prefill (Kneeboard integration) ─
function parseUrlParams() {
  const hash   = location.hash
  const search = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const p      = new URLSearchParams(search)
  return {
    flightNumber:       p.get('fn')   || '',
    date:               p.get('date') || todayUTC(),
    from:               p.get('from') || '',
    to:                 p.get('to')   || '',
    registration:       p.get('reg')  || '',
    aircraftType:       p.get('type') || '',
    flightPlanDistance: parseInt(p.get('dist') || '0', 10),
  }
}

// ── Main render ───────────────────────────────
export function renderAdd(root) {
  const prefill = parseUrlParams()

  const form = {
    date:               prefill.date,
    flightNumber:       prefill.flightNumber,
    from:               prefill.from,
    to:                 prefill.to,
    outTime: '', offTime: '', onTime: '', inTime: '',
    blockTime: 0, flightTime: 0, nightTime: 0,
    registration:       prefill.registration,
    aircraftType:       prefill.aircraftType || getTypeByReg(prefill.registration),
    approachType:       '',
    runway:             '',
    pfTakeoff: false, pfLanding: false, pic: false,
    autoland:  false, goAround:  false, diverted: false,
    totalPax: 0, totalPayload: 0,
    flightPlanDistance: prefill.flightPlanDistance,
    crew: [], crewNames: [],
  }

  // crewSlots[i] = crew object | null
  const crewSlots   = [null, null, null, null]
  let currentStep   = 0
  let activeSlotIdx = -1

  root.innerHTML = buildHTML(form)

  // Element refs
  const wizSteps    = root.querySelector('#wizard-steps')
  const btnBack     = root.querySelector('#btn-wiz-back')
  const btnNext     = root.querySelector('#btn-wiz-next')
  const sheetEl     = root.querySelector('#crew-sheet')
  const sheetSearch = root.querySelector('#sheet-search')
  const sheetList   = root.querySelector('#sheet-list')

  // ── Cancel ───────────────────────────────────
  root.querySelector('#btn-cancel').addEventListener('click', () => navigate('list'))

  // ── Next / Save ──────────────────────────────
  btnNext.addEventListener('click', async () => {
    if (btnNext.classList.contains('save')) {
      await saveFlight(root, form, crewSlots, btnNext)
      return
    }
    if (!validateStep(root, form, currentStep)) return
    collectStep(root, form, currentStep)
    currentStep++
    goToStep(root, currentStep, wizSteps)
    updateNav(root, currentStep, btnBack, btnNext)
  })

  // ── Back ─────────────────────────────────────
  btnBack.addEventListener('click', () => {
    currentStep--
    goToStep(root, currentStep, wizSteps)
    updateNav(root, currentStep, btnBack, btnNext)
  })

  // ── Step 1 — auto uppercase ──────────────────
  ;['f-fn', 'f-from', 'f-to'].forEach(id => {
    root.querySelector(`#${id}`)?.addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase()
    })
  })

  // ── Step 2 — time calc ───────────────────────
  const blockVal  = root.querySelector('#c-block')
  const flightVal = root.querySelector('#c-flight')
  const nightInp  = root.querySelector('#f-night')

  function recalc() {
    const out = root.querySelector('#f-out')?.value
    const off = root.querySelector('#f-off')?.value
    const on  = root.querySelector('#f-on')?.value
    const inT = root.querySelector('#f-in')?.value

    if (isValidHm(out) && isValidHm(inT)) {
      const bt = diffMin(out, inT)
      form.blockTime = bt
      if (blockVal) blockVal.textContent = minHm(bt)
    }
    if (isValidHm(off) && isValidHm(on)) {
      const ft = diffMin(off, on)
      form.flightTime = ft
      if (flightVal) flightVal.textContent = minHm(ft)

      if (!nightInp?.dataset.manual) {
        const date = root.querySelector('#f-date')?.value || form.date
        const from = root.querySelector('#f-from')?.value || form.from
        const to   = root.querySelector('#f-to')?.value   || form.to
        if (date && from && to) {
          try {
            const nt = calcNightTime(date, normalizeHm(off), normalizeHm(on), from, to)
            form.nightTime = nt
            if (nightInp) nightInp.placeholder = minHm(nt)
          } catch (_) {}
        }
      }
    }
  }

  ;['f-out', 'f-off', 'f-on', 'f-in'].forEach(id => {
    root.querySelector(`#${id}`)?.addEventListener('input', recalc)
  })
  nightInp?.addEventListener('input', () => { nightInp.dataset.manual = '1' })

  // ── Step 3 — registration buttons ────────────
  root.querySelector('#reg-inline')?.addEventListener('click', e => {
    const btn = e.target.closest('.reg-btn')
    if (!btn) return
    root.querySelectorAll('.reg-btn').forEach(b => b.classList.remove('sel'))
    btn.classList.add('sel')
    form.registration = btn.dataset.reg
    form.aircraftType = getTypeByReg(btn.dataset.reg)
    const el = root.querySelector('#f-type-display')
    if (el) el.textContent = form.aircraftType || '—'
  })

  // Highlight pre-filled registration
  if (prefill.registration) {
    root.querySelector(`.reg-btn[data-reg="${prefill.registration}"]`)
      ?.classList.add('sel')
  }

  // ── Step 3 — approach buttons ─────────────────
  root.querySelector('#approach-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.approach-btn')
    if (!btn) return
    root.querySelectorAll('.approach-btn').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    form.approachType = btn.dataset.approach
  })

  // ── Step 4 — toggles ─────────────────────────
  root.querySelectorAll('.toggle-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.toggle
      form[key] = !form[key]
      card.classList.toggle('on', form[key])
    })
  })

  // ── Step 5 — crew slots ───────────────────────
  root.querySelectorAll('.crew-slot').forEach((slot, idx) => {
    slot.addEventListener('click', () => {
      activeSlotIdx = idx
      openSheet(sheetEl, sheetSearch, sheetList, crewSlots, idx)
    })
  })

  root.querySelector('#sheet-close')?.addEventListener('click', () => closeSheet(sheetEl))
  sheetEl?.addEventListener('click', e => { if (e.target === sheetEl) closeSheet(sheetEl) })

  sheetSearch?.addEventListener('input', () => {
    renderSheetList(sheetList, crewSlots, activeSlotIdx, sheetSearch.value)
  })

  sheetList?.addEventListener('click', e => {
    const item = e.target.closest('.sheet-crew-item')
    if (!item) return
    const id     = item.dataset.id
    const crew   = state.crew || []
    const person = crew.find(c => c.id === id)
    if (!person || activeSlotIdx < 0) return

    // Toggle: tap same person again → remove from slot
    if (crewSlots[activeSlotIdx]?.id === id) {
      crewSlots[activeSlotIdx] = null
    } else {
      // Remove from any other slot if already assigned there
      for (let i = 0; i < crewSlots.length; i++) {
        if (crewSlots[i]?.id === id) crewSlots[i] = null
      }
      crewSlots[activeSlotIdx] = person
    }
    closeSheet(sheetEl)
    renderCrewSlots(root, crewSlots)
  })

  // ── 步驟標籤自由跳轉 ─────────────────────────
  root.querySelectorAll('.step-lbl').forEach((lbl, idx) => {
    lbl.addEventListener('click', () => {
      collectStep(root, form, currentStep)  // 儲存目前步驟資料
      currentStep = idx
      goToStep(root, currentStep, wizSteps)
      updateNav(root, currentStep, btnBack, btnNext)
    })
  })

  // Initial state
  updateNav(root, 0, btnBack, btnNext)
  renderSheetList(sheetList, crewSlots, -1, '')
}

// ── Sheet ─────────────────────────────────────

function openSheet(sheetEl, searchEl, listEl, crewSlots, slotIdx) {
  if (!sheetEl) return
  sheetEl.classList.add('open')
  if (searchEl) { searchEl.value = ''; setTimeout(() => searchEl.focus(), 100) }
  renderSheetList(listEl, crewSlots, slotIdx, '')
}

function closeSheet(sheetEl) {
  sheetEl?.classList.remove('open')
}

function renderSheetList(listEl, crewSlots, slotIdx, query) {
  if (!listEl) return
  const q      = (query || '').toLowerCase().trim()
  const crew   = state.crew || []
  const list   = q ? crew.filter(c =>
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)
  ) : crew

  if (list.length === 0) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-faint);font-size:13px">
      ${q ? '找不到符合的組員' : '尚無組員資料，請至 Settings → Crew 新增'}
    </div>`
    return
  }

  const currentId = slotIdx >= 0 ? crewSlots[slotIdx]?.id : null
  listEl.innerHTML = list.map(c => {
    const initials = initials2(c)
    const checked  = c.id === currentId
    return `<div class="sheet-crew-item" data-id="${c.id}">
      <div class="sci-avatar">${initials}</div>
      <div class="sci-name">${c.firstName} ${c.lastName}
        <span style="font-size:11px;color:var(--text-dim);display:block">${c.position || ''}</span>
      </div>
      ${checked ? '<span class="sci-check">✓</span>' : ''}
    </div>`
  }).join('')
}

// ── Crew slots display ────────────────────────

function renderCrewSlots(root, crewSlots) {
  crewSlots.forEach((person, i) => {
    const slot    = root.querySelector(`.crew-slot[data-slot="${i}"]`)
    if (!slot) return
    const avatarEl = slot.querySelector('.crew-avatar')
    const nameEl   = slot.querySelector('.crew-name-val')
    if (person) {
      slot.classList.add('filled')
      if (avatarEl) avatarEl.textContent = initials2(person)
      if (nameEl)   nameEl.textContent   = `${person.firstName} ${person.lastName}`
    } else {
      slot.classList.remove('filled')
      if (avatarEl) avatarEl.textContent = String(i + 1)
      if (nameEl)   nameEl.textContent   = 'Tap to assign'
    }
  })
}

// ── Navigation ────────────────────────────────

function goToStep(root, step, wizSteps) {
  if (wizSteps) wizSteps.style.transform = `translateX(-${step * 100}%)`

  root.querySelectorAll('.prog-seg').forEach((seg, i) => {
    seg.className = 'prog-seg' +
      (i < step ? ' done' : i === step ? ' active' : '')
  })
  root.querySelectorAll('.step-lbl').forEach((lbl, i) => {
    lbl.className = 'step-lbl' +
      (i < step ? ' done' : i === step ? ' active' : '')
  })
}

function updateNav(root, step, btnBack, btnNext) {
  if (btnBack) btnBack.style.display = step > 0 ? '' : 'none'
  if (!btnNext) return
  if (step === TOTAL - 1) {
    btnNext.textContent = 'SAVE'
    btnNext.classList.add('save')
  } else {
    btnNext.textContent = 'Continue'
    btnNext.classList.remove('save')
  }
}

// ── Validate ──────────────────────────────────

function validateStep(root, form, step) {
  if (step === 0) {
    const date = root.querySelector('#f-date')?.value
    const from = root.querySelector('#f-from')?.value
    const to   = root.querySelector('#f-to')?.value
    if (!date)        { showToast('請填入日期', 'error'); return false }
    if (!from || !to) { showToast('請填入出發及目的地機場', 'error'); return false }
  }
  if (step === 1) {
    const out = root.querySelector('#f-out')?.value
    const inT = root.querySelector('#f-in')?.value
    if (!isValidHm(out) || !isValidHm(inT)) {
      showToast('請填入 OUT / IN 時間（HHMM）', 'error'); return false
    }
  }
  return true
}

// ── Collect ───────────────────────────────────

function collectStep(root, form, step) {
  if (step === 0) {
    form.date         = root.querySelector('#f-date')?.value || ''
    form.flightNumber = (root.querySelector('#f-fn')?.value || '').toUpperCase()
    form.from         = (root.querySelector('#f-from')?.value || '').toUpperCase()
    form.to           = (root.querySelector('#f-to')?.value || '').toUpperCase()
  }
  if (step === 1) {
    form.outTime  = normalizeHm(root.querySelector('#f-out')?.value || '')
    form.offTime  = normalizeHm(root.querySelector('#f-off')?.value || '')
    form.onTime   = normalizeHm(root.querySelector('#f-on')?.value  || '')
    form.inTime   = normalizeHm(root.querySelector('#f-in')?.value  || '')
    const nightRaw = root.querySelector('#f-night')?.value
    if (nightRaw && isValidHm(nightRaw)) {
      form.nightTime = diffMin('00:00', normalizeHm(nightRaw))
    }
  }
  if (step === 2) {
    form.runway = (root.querySelector('#f-runway')?.value || '').toUpperCase()
  }
  if (step === 3) {
    form.totalPax           = parseInt(root.querySelector('#f-pax')?.value     || '0', 10)
    form.totalPayload       = parseFloat(root.querySelector('#f-payload')?.value || '0')
    form.flightPlanDistance = parseInt(root.querySelector('#f-dist')?.value    || '0', 10)
  }
}

// ── Save ──────────────────────────────────────

async function saveFlight(root, form, crewSlots, btn) {
  btn.disabled = true
  btn.textContent = 'Saving…'

  // Collect remaining steps
  collectStep(root, form, 2)
  collectStep(root, form, 3)

  // Build crew arrays from slots
  form.crew      = crewSlots.filter(Boolean).map(c => c.id)
  form.crewNames = crewSlots.filter(Boolean).map(c => `${c.firstName} ${c.lastName}`)

  try {
    await addFlight(state.user.uid, form)
    invalidateStats()
    showToast('✓ 已儲存', 'success')
    navigate('list')
  } catch (e) {
    showToast(e.message || '儲存失敗', 'error')
    btn.disabled = false
    btn.textContent = 'SAVE'
    btn.classList.add('save')
  }
}

// ── HTML Builders ─────────────────────────────

function buildHTML(form) {
  return `
    <div class="page">
      <div class="topbar">
        <button class="topbar-action" id="btn-cancel" style="font-size:20px;color:var(--text-dim)">✕</button>
        <div class="topbar-title" style="font-family:var(--font-mono);font-size:12px;letter-spacing:0.14em">LOG FLIGHT</div>
        <div style="width:44px"></div>
      </div>

      <div class="wizard">
        <div class="wizard-progress">
          ${[...Array(TOTAL)].map((_, i) =>
            `<div class="prog-seg ${i === 0 ? 'active' : ''}"></div>`
          ).join('')}
        </div>

        <div class="step-labels">
          ${STEP_LABELS.map((lbl, i) =>
            `<div class="step-lbl ${i === 0 ? 'active' : ''}">${lbl}</div>`
          ).join('')}
        </div>

        <div class="wizard-steps-port">
          <div class="wizard-steps" id="wizard-steps">
            ${step1Html(form)}
            ${step2Html(form)}
            ${step3Html(form)}
            ${step4Html(form)}
            ${step5Html()}
          </div>
        </div>

        <div class="step-nav">
          <button class="btn-wiz-back" id="btn-wiz-back" style="display:none">← Back</button>
          <button class="btn-wiz-next" id="btn-wiz-next">Continue</button>
        </div>
      </div>
    </div>

    ${crewSheetHtml()}
  `
}

// ── Step 1: Route ─────────────────────────────

function step1Html(form) {
  return `
    <div class="wizard-step" data-step="0">
      <div class="step-head">
        <div class="step-num">01 / 05</div>
        <div class="step-title">Route</div>
      </div>

      <div class="input-row">
        <span class="row-icon">📅</span>
        <div class="row-lbl">
          Date
          <div class="row-sub">UTC</div>
        </div>
        <input class="date-input" id="f-date" type="date" value="${form.date}">
      </div>

      <div class="input-row">
        <span class="row-icon">✈</span>
        <div class="row-lbl">Flight No.</div>
        <input class="inline-input" id="f-fn" type="text"
               placeholder="JX761" value="${form.flightNumber}"
               autocomplete="off" autocorrect="off" autocapitalize="characters">
      </div>

      <div class="input-row">
        <span class="row-icon">🛫</span>
        <div class="row-lbl">From</div>
        <input class="inline-input" id="f-from" type="text"
               placeholder="TPE" value="${form.from}"
               maxlength="4" autocomplete="off" autocapitalize="characters">
      </div>

      <div class="input-row">
        <span class="row-icon">🛬</span>
        <div class="row-lbl">To</div>
        <input class="inline-input" id="f-to" type="text"
               placeholder="NRT" value="${form.to}"
               maxlength="4" autocomplete="off" autocapitalize="characters">
      </div>
    </div>`
}

// ── Step 2: Times ─────────────────────────────

function step2Html(form) {
  const cells = [
    { key: 'out', dot: 'dot-out', label: 'OUT', val: form.outTime },
    { key: 'off', dot: 'dot-off', label: 'OFF', val: form.offTime },
    { key: 'on',  dot: 'dot-on',  label: 'ON',  val: form.onTime  },
    { key: 'in',  dot: 'dot-in',  label: 'IN',  val: form.inTime  },
  ]
  return `
    <div class="wizard-step" data-step="1">
      <div class="step-head">
        <div class="step-num">02 / 05</div>
        <div class="step-title">Times</div>
      </div>

      <div class="oooi-grid">
        ${cells.map(o => `
          <div class="oooi-cell">
            <div class="oooi-label">
              <div class="oooi-dot ${o.dot}"></div>
              ${o.label}
            </div>
            <input class="oooi-input" id="f-${o.key}"
                   type="text" inputmode="numeric"
                   placeholder="HHMM" maxlength="4"
                   value="${o.val || ''}">
          </div>`).join('')}
      </div>

      <div class="calc-strip">
        <div class="calc-box">
          <div class="calc-lbl">Block</div>
          <div class="calc-val" id="c-block">—:——</div>
        </div>
        <div class="calc-box">
          <div class="calc-lbl">Flight</div>
          <div class="calc-val" id="c-flight">—:——</div>
        </div>
        <div class="calc-box">
          <div class="calc-lbl">Night</div>
          <input class="night-input" id="f-night"
                 type="text" inputmode="numeric"
                 placeholder="auto" maxlength="4">
        </div>
      </div>
    </div>`
}

// ── Step 3: Aircraft ──────────────────────────

function step3Html(form) {
  const regBtns = ALL_REGISTRATIONS.map(r => {
    const type = getTypeByReg(r)
    const sel  = r === form.registration ? ' sel' : ''
    return `<div class="reg-btn${sel}" data-reg="${r}">
      <div class="reg-reg">${r}</div>
      <div class="reg-type-label">${type}</div>
    </div>`
  }).join('')

  return `
    <div class="wizard-step" data-step="2">
      <div class="step-head">
        <div class="step-num">03 / 05</div>
        <div class="step-title">Aircraft</div>
      </div>

      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px">Registration</div>
      <div class="reg-scroll-wrap" style="margin-bottom:14px">
        <div class="reg-inline" id="reg-inline">${regBtns}</div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:var(--surface);border:1px solid var(--border-med);border-radius:12px;margin-bottom:20px">
        <span style="font-size:12px;color:var(--text-dim);flex:1;letter-spacing:0.04em">Aircraft Type</span>
        <span id="f-type-display" style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--text)">${form.aircraftType || '—'}</span>
      </div>

      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px">Approach Type</div>
      <div class="approach-grid" id="approach-grid" style="margin-bottom:20px">
        ${APPROACH_TYPES.map(a => `
          <button class="approach-btn ${a === form.approachType ? 'selected' : ''}"
                  data-approach="${a}">${a}</button>`).join('')}
      </div>

      <div class="rwy-wrap">
        <span class="rwy-label">Landing Runway</span>
        <input class="rwy-input" id="f-runway" type="text"
               placeholder="05L" maxlength="4"
               value="${form.runway}" autocapitalize="characters">
      </div>
    </div>`
}

// ── Step 4: Piloting ──────────────────────────

function step4Html(form) {
  const toggles = [
    { id: 'pfTakeoff', icon: '↑', label: 'PF Takeoff' },
    { id: 'pfLanding', icon: '↓', label: 'PF Landing' },
    { id: 'pic',       icon: '★', label: 'PIC' },
    { id: 'autoland',  icon: '⊙', label: 'Autoland' },
    { id: 'goAround',  icon: '↻', label: 'Go-Around' },
    { id: 'diverted',  icon: '⚡', label: 'Diverted' },
  ]
  return `
    <div class="wizard-step" data-step="3">
      <div class="step-head">
        <div class="step-num">04 / 05</div>
        <div class="step-title">Piloting</div>
      </div>

      <div class="toggle-grid">
        ${toggles.map(t => `
          <div class="toggle-card ${form[t.id] ? 'on' : ''}" data-toggle="${t.id}">
            <span class="toggle-card-icon">${t.icon}</span>
            <span class="toggle-card-label">${t.label}</span>
          </div>`).join('')}
      </div>

      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                  color:var(--text-dim);margin:20px 0 8px">Load</div>
      <div class="num-grid">
        <div class="num-box">
          <div class="num-box-lbl">PAX</div>
          <input class="num-box-input" id="f-pax" type="number"
                 inputmode="numeric" placeholder="0" min="0"
                 value="${form.totalPax || ''}">
          <div class="num-box-unit">passengers</div>
        </div>
        <div class="num-box">
          <div class="num-box-lbl">Payload</div>
          <input class="num-box-input" id="f-payload" type="number"
                 inputmode="decimal" placeholder="0.0" step="0.1" min="0"
                 value="${form.totalPayload || ''}">
          <div class="num-box-unit">tonnes</div>
        </div>
        <div class="num-box" style="grid-column:1/-1">
          <div class="num-box-lbl">Distance</div>
          <input class="num-box-input" id="f-dist" type="number"
                 inputmode="numeric" placeholder="0" min="0"
                 value="${form.flightPlanDistance || ''}">
          <div class="num-box-unit">nautical miles</div>
        </div>
      </div>
    </div>`
}

// ── Step 5: Crew ──────────────────────────────

function step5Html() {
  return `
    <div class="wizard-step" data-step="4">
      <div class="step-head">
        <div class="step-num">05 / 05</div>
        <div class="step-title">Crew</div>
      </div>

      <div class="crew-slots">
        ${CREW_ROLES.map((role, i) => `
          <div class="crew-slot" data-slot="${i}">
            <div class="crew-avatar">${i + 1}</div>
            <div class="crew-info">
              <div class="crew-role">${role}</div>
              <div class="crew-name-val">Tap to assign</div>
            </div>
            <span class="crew-chevron">›</span>
          </div>`).join('')}
      </div>

      <div style="margin-top:16px;font-size:12px;color:var(--text-faint);text-align:center;line-height:1.5">
        若同事不在清單中<br>可至 Settings → Crew 新增
      </div>
    </div>`
}

// ── Crew Bottom Sheet ─────────────────────────

function crewSheetHtml() {
  return `
    <div class="sheet-overlay" id="crew-sheet">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <div class="sheet-head-title">Select Crew</div>
          <button class="sheet-close" id="sheet-close">✕</button>
        </div>
        <div class="sheet-search-wrap">
          <input class="sheet-search-input" id="sheet-search"
                 type="text" placeholder="Search by name…"
                 autocomplete="off" autocorrect="off">
        </div>
        <div class="sheet-list" id="sheet-list"></div>
      </div>
    </div>`
}

// ── Utils ─────────────────────────────────────

function minHm(min) {
  if (min == null || isNaN(min)) return '—:——'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function initials2(person) {
  if (!person) return '?'
  return `${person.firstName?.[0] || ''}${person.lastName?.[0] || ''}`.toUpperCase() || '?'
}
