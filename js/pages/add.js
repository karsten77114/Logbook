// ══════════════════════════════════════════════
// Add Flight — 5-Step Wizard
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

// Prefill from URL params (Kneeboard integration)
function parseUrlParams() {
  const hash   = location.hash  // e.g. #add?fn=JX761&date=...
  const search = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const p      = new URLSearchParams(search)
  return {
    flightNumber: p.get('fn')   || '',
    date:         p.get('date') || todayUTC(),
    from:         p.get('from') || '',
    to:           p.get('to')   || '',
    registration: p.get('reg')  || '',
    aircraftType: p.get('type') || '',
    flightPlanDistance: parseInt(p.get('dist') || '0', 10),
  }
}

export function renderAdd(root) {
  const prefill = parseUrlParams()

  // Form state
  const form = {
    // Step 1
    date:         prefill.date,
    flightNumber: prefill.flightNumber,
    from:         prefill.from,
    to:           prefill.to,
    // Step 2
    outTime: '', offTime: '', onTime: '', inTime: '',
    blockTime: 0, flightTime: 0, nightTime: 0,
    // Step 3
    registration: prefill.registration,
    aircraftType: prefill.aircraftType || getTypeByReg(prefill.registration),
    approachType: '',
    runway: '',
    // Step 4
    pfTakeoff: false, pfLanding: false, pic: false,
    autoland: false,  goAround: false,  diverted: false,
    totalPax: 0, totalPayload: 0,
    flightPlanDistance: prefill.flightPlanDistance,
    // Step 5
    crew: [], crewNames: [],
  }

  let currentStep = 0
  const TOTAL = 5

  root.innerHTML = `
    <div class="page">
      <div class="topbar">
        <button class="topbar-action btn-back" id="btn-cancel">✕</button>
        <div class="topbar-title">New Flight</div>
        <button class="topbar-action" id="btn-save" style="display:none">Save</button>
      </div>

      <div class="wizard">
        <div class="wizard-progress" id="wizard-progress">
          ${[...Array(TOTAL)].map((_, i) =>
            `<div class="wizard-dot ${i === 0 ? 'active' : ''}" data-dot="${i}"></div>`
          ).join('')}
        </div>

        <div class="wizard-steps" id="wizard-steps">
          ${step1Html(form)}
          ${step2Html(form)}
          ${step3Html(form)}
          ${step4Html(form)}
          ${step5Html(form)}
        </div>

        <div class="wizard-footer">
          <button class="btn btn-secondary" id="btn-prev" style="display:none">Back</button>
          <button class="btn btn-primary" id="btn-next">Next →</button>
        </div>
      </div>
    </div>
  `

  // Wire up navigation
  root.querySelector('#btn-cancel').addEventListener('click', () => navigate('list'))

  const btnNext = root.querySelector('#btn-next')
  const btnPrev = root.querySelector('#btn-prev')
  const btnSave = root.querySelector('#btn-save')

  btnNext.addEventListener('click', () => {
    if (!validateStep(root, form, currentStep)) return
    collectStep(root, form, currentStep)
    currentStep++
    goToStep(root, form, currentStep, TOTAL)
    updateNav(root, currentStep, TOTAL, btnPrev, btnNext, btnSave)
  })

  btnPrev.addEventListener('click', () => {
    currentStep--
    goToStep(root, form, currentStep, TOTAL)
    updateNav(root, currentStep, TOTAL, btnPrev, btnNext, btnSave)
  })

  btnSave.addEventListener('click', () => saveFlight(root, form))

  // Attach step-specific interactivity
  attachStep1(root, form)
  attachStep2(root, form)
  attachStep3(root, form)
  attachStep4(root, form)
  attachStep5(root, form)
}

function goToStep(root, form, step, total) {
  const stepsEl = root.querySelector('#wizard-steps')
  stepsEl.style.transform = `translateX(-${step * 100}%)`

  // Update dots
  root.querySelectorAll('.wizard-dot').forEach((d, i) => {
    d.className = 'wizard-dot' + (i === step ? ' active' : i < step ? ' done' : '')
  })
}

function updateNav(root, step, total, btnPrev, btnNext, btnSave) {
  btnPrev.style.display = step > 0 ? '' : 'none'
  btnNext.style.display = step < total - 1 ? '' : 'none'
  btnSave.style.display = step === total - 1 ? '' : 'none'
}

// ── Step 1: Route & Date ──────────────────────

function step1Html(form) {
  return `
    <div class="wizard-step" data-step="0">
      <div class="form-group">
        <label class="form-label">Date (UTC)</label>
        <input class="form-input mono" id="f-date" type="date" value="${form.date}">
      </div>
      <div class="form-group">
        <label class="form-label">Flight Number</label>
        <input class="form-input mono" id="f-fn" type="text" placeholder="JX761"
               value="${form.flightNumber}" autocomplete="off" autocorrect="off"
               autocapitalize="characters">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">FROM</label>
          <input class="form-input mono" id="f-from" type="text" placeholder="TPE"
                 value="${form.from}" maxlength="4" autocomplete="off"
                 autocapitalize="characters">
        </div>
        <div class="form-group">
          <label class="form-label">TO</label>
          <input class="form-input mono" id="f-to" type="text" placeholder="NRT"
                 value="${form.to}" maxlength="4" autocomplete="off"
                 autocapitalize="characters">
        </div>
      </div>
    </div>`
}

function attachStep1(root, form) {
  root.querySelector('#f-from')?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase()
  })
  root.querySelector('#f-to')?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase()
  })
  root.querySelector('#f-fn')?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase()
  })
}

// ── Step 2: OOOI Times ────────────────────────

function step2Html(form) {
  return `
    <div class="wizard-step" data-step="1">
      <div class="oooi-grid">
        ${['OUT','OFF','ON','IN'].map(label => `
          <div class="oooi-cell">
            <div class="oooi-label">${label}</div>
            <input class="form-input mono" id="f-${label.toLowerCase()}"
                   type="text" inputmode="numeric"
                   placeholder="HHMM" maxlength="4"
                   value="${form[label.toLowerCase() + 'Time'] || ''}">
          </div>`).join('')}
      </div>

      <div class="form-hint">UTC 時間，4 位數字，例如 0143 = 01:43</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Block Time</label>
          <div class="form-computed" id="c-block">—:——</div>
        </div>
        <div class="form-group">
          <label class="form-label">Flight Time</label>
          <div class="form-computed" id="c-flight">—:——</div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Night Time (auto, 可手動覆蓋)</label>
        <input class="form-input mono" id="f-night" type="text"
               inputmode="numeric" placeholder="自動計算" maxlength="4">
      </div>
    </div>`
}

function attachStep2(root, form) {
  const fields  = ['out','off','on','in']
  const blockEl = root.querySelector('#c-block')
  const flightEl= root.querySelector('#c-flight')
  const nightEl = root.querySelector('#f-night')

  function recalc() {
    const out = root.querySelector('#f-out')?.value
    const off = root.querySelector('#f-off')?.value
    const on  = root.querySelector('#f-on')?.value
    const inT = root.querySelector('#f-in')?.value

    if (isValidHm(out) && isValidHm(inT)) {
      const bt = diffMin(out, inT)
      form.blockTime = bt
      if (blockEl) blockEl.textContent = `${Math.floor(bt/60)}:${String(bt%60).padStart(2,'0')}`
    }

    if (isValidHm(off) && isValidHm(on)) {
      const ft = diffMin(off, on)
      form.flightTime = ft
      if (flightEl) flightEl.textContent = `${Math.floor(ft/60)}:${String(ft%60).padStart(2,'0')}`

      // Auto calc night time
      const date = root.querySelector('#f-date')?.value || form.date
      const from = root.querySelector('#f-from')?.value || form.from
      const to   = root.querySelector('#f-to')?.value   || form.to

      if (date && from && to && typeof SunCalc !== 'undefined') {
        const nt = calcNightTime(date, normalizeHm(off), normalizeHm(on), from, to)
        form.nightTime = nt
        if (nightEl && !nightEl.dataset.manualOverride) {
          nightEl.placeholder = `${Math.floor(nt/60)}:${String(nt%60).padStart(2,'0')} (自動)`
        }
      }
    }
  }

  fields.forEach(f => {
    root.querySelector(`#f-${f}`)?.addEventListener('input', recalc)
  })

  nightEl?.addEventListener('input', () => {
    nightEl.dataset.manualOverride = '1'
  })
}

// ── Step 3: Aircraft & Approach ───────────────

function step3Html(form) {
  const regOpts = ALL_REGISTRATIONS.map(r =>
    `<option value="${r}" ${r === form.registration ? 'selected' : ''}>${r}</option>`
  ).join('')

  return `
    <div class="wizard-step" data-step="2">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Registration</label>
          <select class="form-select mono" id="f-reg">
            <option value="">選擇…</option>
            ${regOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Aircraft Type</label>
          <input class="form-input mono" id="f-type" type="text" readonly
                 value="${form.aircraftType}" placeholder="自動帶入">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Approach Type</label>
        <div class="approach-grid" id="approach-grid">
          ${APPROACH_TYPES.map(a => `
            <button class="approach-btn ${a === form.approachType ? 'selected' : ''}"
                    data-approach="${a}">${a}</button>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Landing Runway</label>
        <input class="form-input mono" id="f-runway" type="text"
               placeholder="05L" maxlength="4"
               value="${form.runway}" autocapitalize="characters">
      </div>
    </div>`
}

function attachStep3(root, form) {
  root.querySelector('#f-reg')?.addEventListener('change', e => {
    const type = getTypeByReg(e.target.value)
    root.querySelector('#f-type').value = type
    form.aircraftType = type
  })

  root.querySelector('#approach-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.approach-btn')
    if (!btn) return
    root.querySelectorAll('.approach-btn').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    form.approachType = btn.dataset.approach
  })
}

// ── Step 4: Piloting & Load ───────────────────

function step4Html(form) {
  const toggles = [
    { id: 'pfTakeoff', icon: '↑', label: 'PF\nTakeoff' },
    { id: 'pfLanding', icon: '↓', label: 'PF\nLanding' },
    { id: 'pic',       icon: '★', label: 'PIC' },
    { id: 'autoland',  icon: '⊙', label: 'Autoland' },
    { id: 'goAround',  icon: '↻', label: 'Go-Around' },
    { id: 'diverted',  icon: '⚡', label: 'Diverted' },
  ]

  return `
    <div class="wizard-step" data-step="3">
      <div class="toggle-grid">
        ${toggles.map(t => `
          <div class="toggle-card ${form[t.id] ? 'on' : ''}" data-toggle="${t.id}">
            <span class="toggle-card-icon">${t.icon}</span>
            <span class="toggle-card-label">${t.label.replace('\n','<br>')}</span>
          </div>`).join('')}
      </div>

      <div class="form-row-3">
        <div class="form-group">
          <label class="form-label">PAX</label>
          <input class="form-input mono" id="f-pax" type="number"
                 inputmode="numeric" placeholder="0" min="0"
                 value="${form.totalPax || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Payload (t)</label>
          <input class="form-input mono" id="f-payload" type="number"
                 inputmode="decimal" placeholder="0.0" step="0.1" min="0"
                 value="${form.totalPayload || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Dist (NM)</label>
          <input class="form-input mono" id="f-dist" type="number"
                 inputmode="numeric" placeholder="0" min="0"
                 value="${form.flightPlanDistance || ''}">
        </div>
      </div>
    </div>`
}

function attachStep4(root, form) {
  root.querySelectorAll('.toggle-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.toggle
      form[key] = !form[key]
      card.classList.toggle('on', form[key])
    })
  })
}

// ── Step 5: Crew ──────────────────────────────

function step5Html(form) {
  return `
    <div class="wizard-step" data-step="4">
      <div class="form-group">
        <label class="form-label">Crew（最多 4 位）</label>
        <div class="crew-search-wrap">
          <input class="form-input" id="f-crew-search" type="text"
                 placeholder="輸入名字搜尋…" autocomplete="off">
          <div class="crew-list hidden" id="crew-dropdown"></div>
        </div>
      </div>
      <div class="crew-selected-list" id="crew-selected"></div>

      <div class="form-hint" style="margin-top:8px">
        若同事不在清單中，可在「Settings → Crew」新增
      </div>
    </div>`
}

function attachStep5(root, form) {
  const searchEl   = root.querySelector('#f-crew-search')
  const dropdownEl = root.querySelector('#crew-dropdown')
  const selectedEl = root.querySelector('#crew-selected')

  renderSelectedCrew(root, form, selectedEl)

  searchEl?.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase()
    if (!q) { dropdownEl.classList.add('hidden'); return }

    const crew  = state.crew || []
    const results = crew.filter(c =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) &&
      !form.crew.includes(c.id)
    ).slice(0, 8)

    if (results.length === 0) { dropdownEl.classList.add('hidden'); return }

    dropdownEl.classList.remove('hidden')
    dropdownEl.innerHTML = results.map(c => `
      <div class="crew-option" data-id="${c.id}" data-name="${c.firstName} ${c.lastName}">
        <span>${c.firstName} ${c.lastName}</span>
        <span class="text-dim" style="font-size:12px">${c.position || ''}</span>
      </div>`).join('')

    dropdownEl.querySelectorAll('.crew-option').forEach(opt => {
      opt.addEventListener('click', () => {
        if (form.crew.length >= 4) { showToast('最多選 4 位', 'error'); return }
        form.crew.push(opt.dataset.id)
        form.crewNames.push(opt.dataset.name)
        dropdownEl.classList.add('hidden')
        searchEl.value = ''
        renderSelectedCrew(root, form, selectedEl)
      })
    })
  })
}

function renderSelectedCrew(root, form, el) {
  if (!el) return
  el.innerHTML = form.crewNames.map((name, i) => `
    <div class="crew-selected-item">
      <span>${name}</span>
      <button class="btn-remove-crew" data-idx="${i}">✕</button>
    </div>`).join('')

  el.querySelectorAll('.btn-remove-crew').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10)
      form.crew.splice(idx, 1)
      form.crewNames.splice(idx, 1)
      renderSelectedCrew(root, form, el)
    })
  })
}

// ── Collect & Validate ─────────────────────────

function collectStep(root, form, step) {
  if (step === 0) {
    form.date         = root.querySelector('#f-date')?.value || ''
    form.flightNumber = root.querySelector('#f-fn')?.value.toUpperCase() || ''
    form.from         = root.querySelector('#f-from')?.value.toUpperCase() || ''
    form.to           = root.querySelector('#f-to')?.value.toUpperCase() || ''
  }
  if (step === 1) {
    form.outTime   = normalizeHm(root.querySelector('#f-out')?.value || '')
    form.offTime   = normalizeHm(root.querySelector('#f-off')?.value || '')
    form.onTime    = normalizeHm(root.querySelector('#f-on')?.value  || '')
    form.inTime    = normalizeHm(root.querySelector('#f-in')?.value  || '')
    const nightRaw = root.querySelector('#f-night')?.value
    if (nightRaw && isValidHm(nightRaw)) {
      form.nightTime = diffMin('00:00', normalizeHm(nightRaw))
    }
  }
  if (step === 2) {
    form.registration = root.querySelector('#f-reg')?.value || ''
    form.runway       = root.querySelector('#f-runway')?.value.toUpperCase() || ''
  }
  if (step === 3) {
    form.totalPax           = parseInt(root.querySelector('#f-pax')?.value || '0', 10)
    form.totalPayload       = parseFloat(root.querySelector('#f-payload')?.value || '0')
    form.flightPlanDistance = parseInt(root.querySelector('#f-dist')?.value || '0', 10)
  }
}

function validateStep(root, form, step) {
  if (step === 0) {
    if (!root.querySelector('#f-date')?.value) {
      showToast('請填入日期', 'error'); return false
    }
    if (!root.querySelector('#f-from')?.value || !root.querySelector('#f-to')?.value) {
      showToast('請填入出發與目的地機場', 'error'); return false
    }
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

// ── Save ─────────────────────────────────────

async function saveFlight(root, form) {
  const btn = root.querySelector('#btn-save')
  btn.disabled = true
  btn.textContent = 'Saving…'

  try {
    collectStep(root, form, 4)  // collect step 5 data (already done via events)
    await addFlight(state.user.uid, form)
    invalidateStats()
    showToast('✓ 已儲存', 'success')
    navigate('list')
  } catch (e) {
    showToast(e.message || '儲存失敗', 'error')
    btn.disabled = false
    btn.textContent = 'Save'
  }
}
