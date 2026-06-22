// ══════════════════════════════════════════════
// Add Flight — 5-Step Wizard (Prototype Design)
// ══════════════════════════════════════════════
import { addFlight, saveCrew,
         saveCustomAircraftList,
         getFlightsByDate }        from '../db.js'
import { state, setCustomAircraft } from '../state.js'
import { navigate, showToast }     from '../app.js'
import { invalidateStats }                from './list.js'
import { backgroundFetchAndSaveTrack,
         fetchRunwayForFlight }           from './detail.js'
import { diffMin, normalizeHm,
         isValidHm, todayUTC }     from '../utils/time.js'
import { calcNightTime }           from '../utils/nighttime.js'
import { APPROACH_TYPES,
         ALL_REGISTRATIONS,
         getTypeByReg }            from '../data/fleet.js'
import { ALL_AIRPORT_CODES,
         lookupAirport }           from '../data/airports.js'
import { isAircraftActive,
         isCrewActive }            from '../state.js'
import { showCountryPicker,
         getCountryName }          from '../data/countries.js'
import { getRecentLegsForPicker,
         WORKER_URL }               from './roster.js'

const STEP_LABELS = ['Route', 'Times', 'Aircraft', 'Piloting', 'Crew']
const CREW_ROLES  = ['Pilot in Command', 'Crew 2', 'Crew 3', 'Crew 4']
const TOTAL       = 5

// ── Custom Aircraft helpers ────────────────────
function getCustomAircraft() {
  return state.customAircraft || []
}
async function addCustomAircraftEntry(reg, type) {
  const list = getCustomAircraft()
  if (!list.find(a => a.reg === reg)) {
    const updated = [...list, { reg, type }]
    setCustomAircraft(updated)
    await saveCustomAircraftList(state.user.uid, updated)
  }
}

// ── URL params prefill (Roster / KneeBoard integration) ─
function parseUrlParams() {
  const hash   = location.hash
  const search = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const p      = new URLSearchParams(search)

  // Decode roster crew from base64 JSON (from PegaSys bookmarklet)
  let rosterCrew = []
  const crewB64 = p.get('crew')
  if (crewB64) {
    try { rosterCrew = JSON.parse(atob(crewB64)) } catch (_) {}
  }

  return {
    flightNumber:       p.get('fn')   || '',
    date:               p.get('date') || todayUTC(),
    from:               p.get('from') || '',
    to:                 p.get('to')   || '',
    registration:       p.get('reg')  || '',
    aircraftType:       p.get('type') || '',
    flightPlanDistance: parseInt(p.get('dist') || '0', 10),
    // Roster-injected fields
    stdUtc:             p.get('std')  || '',   // HHMM UTC e.g. "0745"
    staUtc:             p.get('sta')  || '',   // HHMM UTC
    blockMinutes:       parseInt(p.get('block') || '0', 10),
    rosterCrew,
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

  root.addEventListener('input', () => setWizardError(root, ''))
  root.addEventListener('change', () => setWizardError(root, ''))

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

  // ── Step 1 — airport auto-lookup on blur ─────
  // 若輸入的 IATA 不在內建表，背景查 Worker，補座標後重算 Night Time
  ;['f-from', 'f-to'].forEach(id => {
    root.querySelector(`#${id}`)?.addEventListener('blur', async e => {
      const code = (e.target.value || '').toUpperCase().trim()
      if (code.length !== 3) return
      const result = await lookupAirport(code)
      // If coords were newly fetched (not in built-in), recalc night time
      if (result) recalc()
    })
  })

  // ── Step 1 — 機號自動帶入（Worker /api/gate，AeroDataBox，免 LIDO）──
  // fn + date 一齊知道後查實際派遣機號，自動填入 Step 3 Registration/Type
  let _lastAcLookup = ''
  async function tryAutoFillAircraft() {
    const fn   = (root.querySelector('#f-fn')?.value || form.flightNumber || '').trim().toUpperCase()
    const date = root.querySelector('#f-date')?.value || form.date
    if (!fn || !date) return
    const key = `${fn}_${date}`
    if (key === _lastAcLookup) return   // 避免同一組重複查
    _lastAcLookup = key

    try {
      const resp = await fetch(`${WORKER_URL}/api/gate?fno=${encodeURIComponent(fn)}&date=${date}`)
      if (!resp.ok) return
      const data = await resp.json()
      if (!data.aircraft) return

      const reg  = data.aircraft.toUpperCase()
      // 已知機號優先用本地機隊資料的簡寫型號（如 A321-252NX），
      // Worker/AeroDataBox 回傳的 acType 是完整名稱（如 "Airbus A321 NEO"），只在機號未知時當備援
      const type = getTypeByReg(reg) || data.acType || form.aircraftType

      // 若該機號不在現有機隊/自訂清單，自動加入自訂機隊
      const known = ALL_REGISTRATIONS.includes(reg) || getCustomAircraft().some(a => a.reg === reg)
      if (!known) await addCustomAircraftEntry(reg, type)

      form.registration = reg
      form.aircraftType = type

      // 同步 Step 3 UI（無論目前在哪一步都先更新好，使用者翻到時就看到）
      const regSel = root.querySelector('#f-reg')
      if (regSel) {
        if (!regSel.querySelector(`option[value="${reg}"]`)) {
          const opt = document.createElement('option')
          opt.value = reg
          opt.textContent = `${reg} — ${type}`
          regSel.appendChild(opt)
        }
        regSel.value = reg
      }
      const typeEl = root.querySelector('#f-type-display')
      if (typeEl) typeEl.textContent = type || '—'

      // 背景查落地跑道（過去航班才有 ADS-B track）
      const _from = form.from || root.querySelector('#f-from')?.value || ''
      const _to   = form.to   || root.querySelector('#f-to')?.value   || ''
      if (date <= todayUTC() && _from && _to) {
        fetchRunwayForFlight({ fn, date, reg, from: _from, to: _to })
          .then(runway => {
            if (!runway) return
            form.runway = runway
            const rwEl = root.querySelector('#f-runway')
            if (rwEl && !rwEl.value) {
              rwEl.value = runway
              showToast(`Runway ${runway} auto-detected`, 'success')
            }
          })
          .catch(() => {})
      }
    } catch (_) {}
  }

  root.querySelector('#f-fn')?.addEventListener('blur', tryAutoFillAircraft)
  root.querySelector('#f-date')?.addEventListener('change', tryAutoFillAircraft)

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

      // Night time 用 Block time 區間（OUT→IN）計算
      if (!nightInp?.dataset.manual) {
        const date = root.querySelector('#f-date')?.value || form.date
        const from = root.querySelector('#f-from')?.value || form.from
        const to   = root.querySelector('#f-to')?.value   || form.to
        if (date && from && to) {
          try {
            const nt = calcNightTime(date, normalizeHm(out), normalizeHm(inT), from, to)
            form.nightTime = nt
            if (nightInp && !nightInp.dataset.manual) nightInp.value = minHm(nt)
          } catch (_) {}
        }
      }
    }
    if (isValidHm(off) && isValidHm(on)) {
      const ft = diffMin(off, on)
      form.flightTime = ft
      if (flightVal) flightVal.textContent = minHm(ft)
    }
  }

  const OOOI_IDS = ['f-out', 'f-off', 'f-on', 'f-in']
  OOOI_IDS.forEach((id, i) => {
    const input = root.querySelector(`#${id}`)
    input?.addEventListener('input', e => {
      // 純數字 + 限 4 碼（避免貼上或某些鍵盤帶入非數字字元）
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)
      recalc()
      if (e.target.value.length === 4) {
        const nextId = OOOI_IDS[i + 1]
        if (nextId) root.querySelector(`#${nextId}`)?.focus()
        else e.target.blur()
      }
    })
  })
  nightInp?.addEventListener('input', () => { nightInp.dataset.manual = '1' })

  // ── Step 3 — registration select ─────────────
  root.querySelector('#f-reg')?.addEventListener('change', e => {
    form.registration = e.target.value
    form.aircraftType = getTypeByReg(e.target.value)
    const el = root.querySelector('#f-type-display')
    if (el) el.textContent = form.aircraftType || '—'
  })

  // ── Step 3 — approach select ──────────────────
  root.querySelector('#f-approach')?.addEventListener('change', e => {
    form.approachType = e.target.value
  })

  // ── Step 4 — toggles ─────────────────────────
  root.querySelectorAll('[data-toggle]').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.toggle
      form[key] = !form[key]
      row.dataset.val = form[key] ? '1' : '0'
      row.querySelector('.hub-toggle-switch')?.classList.toggle('on', form[key])
    })
  })

  // ── Step 3 — Aircraft quick-add ──────────────
  root.querySelector('#btn-add-ac')?.addEventListener('click', () => {
    showAircraftQuickAdd(root, form)
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

  // Crew quick-add in sheet
  root.querySelector('#sheet-add-crew')?.addEventListener('click', () => {
    showCrewQuickAdd(sheetList, crewSlots, activeSlotIdx, sheetSearch)
  })

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
      setWizardError(root, '')
    })
  })

  // Initial state
  updateNav(root, 0, btnBack, btnNext)
  renderSheetList(sheetList, crewSlots, -1, '')

  // 已有 fn+date 來源（Roster 補記錄按鈕 / PegaSys 連結）但沒帶機號 → 立即查
  if (prefill.flightNumber && prefill.date && !prefill.registration) {
    tryAutoFillAircraft()
  }

  // Pre-fill cockpit crew from roster URL params (PegaSys bookmarklet)
  if (prefill.rosterCrew?.length && state.crew?.length) {
    const cockpitRanks = new Set(['CAP', 'FO', 'TFO', 'SO', 'SFO', 'PFO', 'CP', 'FI'])
    const cockpit = prefill.rosterCrew.filter(c => cockpitRanks.has(c.rank))
    let slot = 0
    for (const rc of cockpit) {
      if (slot >= crewSlots.length) break
      const matched = state.crew.find(c =>
        c.employeeId && c.employeeId === rc.staffId
      )
      if (matched && !crewSlots.some(s => s?.id === matched.id)) {
        crewSlots[slot++] = matched
      }
    }
    if (slot > 0) renderCrewSlots(root, crewSlots)
  }

  // 載入 Roster 選擇器（若已有 prefill 則隱藏）
  _loadRosterPicker(root, form, prefill, (rosterCrew) => {
    tryAutoFillAircraft()
    // 用 employeeId 比對 Crew List，自動填入駕駛艙組員
    if (rosterCrew?.length && state.crew?.length) {
      const cockpitRanks = new Set(['CAP', 'FO', 'TFO', 'SO', 'SFO', 'PFO', 'CP', 'FI'])
      const cockpit = rosterCrew.filter(c => cockpitRanks.has(c.rank))
      let slot = 0
      for (const rc of cockpit) {
        if (slot >= crewSlots.length) break
        const matched = state.crew.find(c => c.employeeId && c.employeeId === rc.staffId)
        if (matched && !crewSlots.some(s => s?.id === matched.id)) {
          crewSlots[slot++] = matched
        }
      }
      if (slot > 0) renderCrewSlots(root, crewSlots)
    }
  })
}

// ── Roster Picker ─────────────────────────────

const _RP_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function _rpFmtDate(iso) {
  const [, m, d] = iso.split('-')
  return `${_RP_MON[parseInt(m,10)-1]} ${parseInt(d,10)}`
}

async function _loadRosterPicker(root, form, prefill, onPick) {
  const section = root.querySelector('#rp-section')
  const listEl  = root.querySelector('#rp-list')
  if (!section || !listEl) return

  // Came from Roster "補記錄" button — already prefilled, hide picker
  if (prefill.flightNumber) { section.remove(); return }

  let legs
  try { legs = await getRecentLegsForPicker(state.user.uid) } catch {}

  if (!legs?.length) { section.remove(); return }

  // crew lookup by fn|date (crew is at pairing level, same for all legs)
  const crewByKey = new Map()
  listEl.innerHTML = legs.map(lg => {
    crewByKey.set(`${lg.flightNumber}|${lg.dateIso}`, lg.crew || [])
    return `
    <div class="rp-row${lg.logged ? ' rp-logged' : ''}"
         data-fn="${lg.flightNumber}" data-date="${lg.dateIso}"
         data-from="${lg.from}" data-to="${lg.to}">
      <span class="rp-fn">${lg.flightNumber}</span>
      <span class="rp-route">${lg.from}&nbsp;→&nbsp;${lg.to}</span>
      <span class="rp-meta">${_rpFmtDate(lg.dateIso)}${lg.stdLocal ? ' · ' + lg.stdLocal + 'L' : ''}</span>
      ${lg.logged ? '<span class="rp-check">✓</span>' : ''}
    </div>`
  }).join('')

  listEl.querySelectorAll('.rp-row').forEach(row => {
    row.addEventListener('click', () => {
      const fn   = row.dataset.fn
      const date = row.dataset.date
      const from = row.dataset.from
      const to   = row.dataset.to

      form.flightNumber = fn
      form.date         = date
      form.from         = from
      form.to           = to

      const q = s => root.querySelector(s)
      const el = q('#f-fn'); if (el) el.value = fn
      const ed = q('#f-date'); if (ed) ed.value = date
      const ef = q('#f-from'); if (ef) ef.value = from
      const et = q('#f-to');   if (et) et.value = to

      // Highlight selected row
      listEl.querySelectorAll('.rp-row').forEach(r => r.classList.remove('rp-selected'))
      row.classList.add('rp-selected')

      onPick(crewByKey.get(`${fn}|${date}`) || [])  // pass roster crew to callback
    })
  })
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
  const q    = (query || '').toLowerCase().trim()
  // 只顯示 Active 機師（搜尋時也只在 Active 裡找）
  const crew = (state.crew || []).filter(c => isCrewActive(c))
  const list = q ? crew.filter(c =>
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)
  ) : crew

  if (list.length === 0) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-faint);font-size:13px">
      ${q ? 'No crew found' : 'No crew yet. Tap ＋ to add.'}
    </div>`
    return
  }

  const currentId = slotIdx >= 0 ? crewSlots[slotIdx]?.id : null
  listEl.innerHTML = list.map(c => {
    const checked  = c.id === currentId
    return `<div class="sheet-crew-item" data-id="${c.id}">
      ${crewAvatarHtml(c, 16)}
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

function setWizardError(root, message) {
  const el = root.querySelector('#wizard-error')
  if (!el) return
  el.textContent = message || ''
  el.classList.toggle('show', Boolean(message))
}

// ── Validate ──────────────────────────────────

function validateStep(root, form, step) {
  if (step === 0) {
    const date = root.querySelector('#f-date')?.value
    const from = root.querySelector('#f-from')?.value
    const to   = root.querySelector('#f-to')?.value
    if (!date)        { setWizardError(root, 'Please enter a date.'); showToast('Please enter a date', 'error'); return false }
    if (!from || !to) { setWizardError(root, 'Please enter departure and arrival airports.'); showToast('Please enter departure and arrival airports', 'error'); return false }
  }
  if (step === 1) {
    const out = root.querySelector('#f-out')?.value
    const inT = root.querySelector('#f-in')?.value
    if (!isValidHm(out) || !isValidHm(inT)) {
      setWizardError(root, 'Please enter OUT and IN times in HHMM format.')
      showToast('Please enter OUT / IN times (HHMM)', 'error'); return false
    }
  }
  setWizardError(root, '')
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
    form.registration = root.querySelector('#f-reg')?.value || form.registration
    form.aircraftType = getTypeByReg(form.registration) || form.aircraftType
    form.approachType = root.querySelector('#f-approach')?.value || ''
    form.runway       = (root.querySelector('#f-runway')?.value || '').toUpperCase()
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
  btn.textContent = 'Checking…'

  // Collect remaining steps
  collectStep(root, form, 2)
  collectStep(root, form, 3)

  // Build crew arrays from slots
  form.crew      = crewSlots.filter(Boolean).map(c => c.id)
  form.crewNames = crewSlots.filter(Boolean).map(c => `${c.firstName} ${c.lastName}`)

  try {
    // ── Duplicate flight detection ─────────────
    if (form.date) {
      const sameDay = await getFlightsByDate(state.user.uid, form.date)
      const dup = sameDay.find(f =>
        f.flightNumber === form.flightNumber &&
        f.from         === form.from &&
        f.to           === form.to
      )
      if (dup) {
        const go = confirm(
          `Duplicate detected:\n${form.date}  ${form.flightNumber || '—'}  ${form.from || '?'} → ${form.to || '?'}\n\nThis flight appears to already exist. Save anyway?`
        )
        if (!go) {
          btn.disabled = false
          btn.textContent = 'SAVE'
          btn.classList.add('save')
          return
        }
      }
    }

    const flightId = await addFlight(state.user.uid, form)
    invalidateStats()
    // 背景抓取 ADS-B track，不等結果、不阻擋 UI
    backgroundFetchAndSaveTrack(state.user.uid, flightId, form).catch(() => {})
    showToast('✓ Saved', 'success')
    navigate('list')
  } catch (e) {
    showToast(e.message || 'Save failed', 'error')
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
            `<button type="button" class="step-lbl ${i === 0 ? 'active' : ''}" aria-label="Go to ${lbl} step">
              <span class="step-lbl-num">${i + 1}</span>
              <span class="step-lbl-text">${lbl}</span>
            </button>`
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
          <div class="wizard-error" id="wizard-error" aria-live="polite"></div>
          <button class="btn-wiz-back" id="btn-wiz-back" style="display:none">← Back</button>
          <button class="btn-wiz-next" id="btn-wiz-next">Continue</button>
        </div>
      </div>
    </div>

    ${crewSheetHtml()}
    ${airportDatalistHtml()}
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

      <div id="rp-section" class="rp-section">
        <div class="rp-header">Roster Flights</div>
        <div id="rp-list" class="rp-list">
          <div class="rp-loading"><div class="loader" style="width:18px;height:18px;border-width:2px"></div></div>
        </div>
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
               maxlength="4" list="airport-list" autocomplete="off" autocapitalize="characters">
      </div>

      <div class="input-row">
        <span class="row-icon">🛬</span>
        <div class="row-lbl">To</div>
        <input class="inline-input" id="f-to" type="text"
               placeholder="NRT" value="${form.to}"
               maxlength="4" list="airport-list" autocomplete="off" autocapitalize="characters">
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
  // 顯示 Active 飛機 + localStorage 自訂機號
  const activeRegs   = ALL_REGISTRATIONS.filter(r => isAircraftActive(r))
  const customAC     = getCustomAircraft()
  const regOptions   = activeRegs.map(r => {
    const type = getTypeByReg(r)
    const sel  = r === form.registration ? ' selected' : ''
    return `<option value="${r}"${sel}>${r} — ${type}</option>`
  }).join('')
  const customOptions = customAC.map(a => {
    const sel = a.reg === form.registration ? ' selected' : ''
    return `<option value="${a.reg}"${sel}>${a.reg} — ${a.type}</option>`
  }).join('')

  const approachOptions = APPROACH_TYPES.map(a => {
    const sel = a === form.approachType ? ' selected' : ''
    return `<option value="${a}"${sel}>${a}</option>`
  }).join('')

  return `
    <div class="wizard-step" data-step="2">
      <div class="step-head">
        <div class="step-num">03 / 05</div>
        <div class="step-title">Aircraft</div>
      </div>

      <div class="input-row">
        <span class="row-icon">🪪</span>
        <div class="row-lbl">Registration</div>
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
          <select class="inline-select" id="f-reg" style="flex:1;min-width:0">
            <option value="">—</option>
            ${regOptions}
            ${customOptions}
          </select>
          <button class="wiz-inline-add" id="btn-add-ac" title="Add Aircraft" style="margin-left:0">＋</button>
        </div>
      </div>

      <div class="input-row">
        <span class="row-icon">🛩</span>
        <div class="row-lbl">Type</div>
        <span id="f-type-display" style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--text)">${form.aircraftType || '—'}</span>
      </div>

      <div class="input-row">
        <span class="row-icon">🛬</span>
        <div class="row-lbl">Approach</div>
        <select class="inline-select" id="f-approach">
          <option value="">—</option>
          ${approachOptions}
        </select>
      </div>

      <div class="input-row">
        <span class="row-icon">🏁</span>
        <div class="row-lbl">Runway</div>
        <input class="inline-input" id="f-runway" type="text"
               placeholder="05L" maxlength="4"
               value="${form.runway}" autocapitalize="characters"
               autocomplete="off">
      </div>
    </div>`
}

// ── Step 4: Piloting ──────────────────────────

function step4Html(form) {
  const toggles = [
    { id: 'pfTakeoff', label: 'PF Takeoff' },
    { id: 'pfLanding', label: 'PF Landing' },
    { id: 'pic',       label: 'PIC' },
    { id: 'autoland',  label: 'Autoland' },
    { id: 'goAround',  label: 'Go-Around' },
    { id: 'diverted',  label: 'Diverted' },
  ]
  return `
    <div class="wizard-step" data-step="3">
      <div class="step-head">
        <div class="step-num">04 / 05</div>
        <div class="step-title">Piloting</div>
      </div>

      <div class="dash-card" style="padding:4px 16px;margin:4px 0">
        ${toggles.map(t => `
          <div class="edit-toggle-row" data-toggle="${t.id}" data-val="${form[t.id] ? '1' : '0'}">
            <span class="edit-toggle-lbl">${t.label}</span>
            <div class="hub-toggle-switch ${form[t.id] ? 'on' : ''}"></div>
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
          <button class="sheet-close" id="sheet-add-crew"
                  style="color:var(--accent);font-size:22px;margin-right:4px"
                  title="Add Crew Member">＋</button>
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

/** Convert 2-letter ISO country code to flag emoji, or return null */
function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return null
  const c = cc.toUpperCase()
  if (!/^[A-Z]{2}$/.test(c)) return null
  return [...c].map(x => String.fromCodePoint(0x1F1E6 + x.charCodeAt(0) - 65)).join('')
}

/** Flag circle if nationality set, otherwise SVG person icon */
function crewAvatarHtml(person, size = 16) {
  const flag = flagEmoji(person?.nationality)
  if (flag) {
    return `<div class="sci-avatar" style="font-size:20px;background:none;border:none;overflow:visible">${flag}</div>`
  }
  return `<div class="sci-avatar"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 10c-4.4 0-8 2-8 4v1h16v-1c0-2-3.6-4-8-4z"/></svg></div>`
}

// ── Aircraft Quick-Add ─────────────────────────

function showAircraftQuickAdd(root, form) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.zIndex = '10001'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">Add Aircraft</div>
      <div class="form-group">
        <label class="form-label">Registration</label>
        <input class="form-input mono" id="qac-reg" type="text"
               placeholder="B-12345" autocapitalize="characters" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <input class="form-input mono" id="qac-type" type="text"
               placeholder="A321-252NX" autocomplete="off">
      </div>
      <button class="btn btn-primary btn-full" id="qac-save">Add</button>
    </div>`
  document.body.appendChild(overlay)
  setTimeout(() => overlay.querySelector('#qac-reg')?.focus(), 50)

  overlay.querySelector('#qac-save').addEventListener('click', async () => {
    const reg  = (overlay.querySelector('#qac-reg').value  || '').trim().toUpperCase()
    const type = (overlay.querySelector('#qac-type').value || '').trim()
    if (!reg || !type) { showToast('Registration and type required', 'error'); return }

    await addCustomAircraftEntry(reg, type)

    // Append to Registration select and select it
    const sel = root.querySelector('#f-reg')
    if (sel) {
      const existing = sel.querySelector(`option[value="${reg}"]`)
      if (existing) existing.remove()
      const opt = document.createElement('option')
      opt.value = reg
      opt.textContent = `${reg} — ${type}`
      opt.selected = true
      sel.appendChild(opt)
      sel.dispatchEvent(new Event('change'))
    }
    form.registration = reg
    form.aircraftType = type
    const typeEl = root.querySelector('#f-type-display')
    if (typeEl) typeEl.textContent = type

    overlay.remove()
    showToast('Aircraft added', 'success')
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

// ── Crew Quick-Add ─────────────────────────────

function showCrewQuickAdd(listEl, crewSlots, slotIdx, searchEl) {
  let _natCode = ''

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.zIndex = '10001'
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">Add Crew Member</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">First Name</label>
          <input class="form-input" id="qc-first" type="text">
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input class="form-input" id="qc-last" type="text">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Position</label>
        <select class="form-select" id="qc-pos">
          <option value="">— Select —</option>
          ${['FO','SFO','CA','Check Captain','Student Pilot','Other'].map(p =>
            `<option value="${p}">${p}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Employee ID</label>
          <input class="form-input mono" id="qc-empid" type="text">
        </div>
        <div class="form-group">
          <label class="form-label">Licence No.</label>
          <input class="form-input mono" id="qc-lic" type="text">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Nationality</label>
        <button class="form-picker-btn" id="qc-nat-btn" type="button">
          <span id="qc-nat-display" style="color:var(--text-faint)">Tap to select…</span>
        </button>
      </div>
      <button class="btn btn-primary btn-full" id="qc-save">Add</button>
    </div>`
  document.body.appendChild(overlay)
  setTimeout(() => overlay.querySelector('#qc-first')?.focus(), 50)

  overlay.querySelector('#qc-nat-btn').addEventListener('click', () => {
    showCountryPicker(_natCode, (code, name) => {
      _natCode = code
      const flagCp = [...code].map(x => String.fromCodePoint(0x1F1E6 + x.charCodeAt(0) - 65)).join('')
      const display = overlay.querySelector('#qc-nat-display')
      if (display) {
        display.textContent = `${flagCp}  ${name}`
        display.style.color = 'var(--text)'
      }
    })
  })

  overlay.querySelector('#qc-save').addEventListener('click', async () => {
    const first = (overlay.querySelector('#qc-first').value || '').trim()
    const last  = (overlay.querySelector('#qc-last').value  || '').trim()
    const pos   = overlay.querySelector('#qc-pos').value
    const empId = (overlay.querySelector('#qc-empid').value || '').trim()
    const lic   = (overlay.querySelector('#qc-lic').value   || '').trim()
    if (!first && !last) { showToast('Name is required', 'error'); return }

    // ── Duplicate crew detection ───────────────
    const existingCrew = state.crew || []
    const dupByEmpId = empId && existingCrew.find(c => c.employeeId && c.employeeId === empId)
    const dupByName  = existingCrew.find(c =>
      `${c.firstName} ${c.lastName}`.toLowerCase() === `${first} ${last}`.toLowerCase()
    )
    if (dupByEmpId) {
      showToast(`Employee ID "${empId}" already exists`, 'error'); return
    }
    if (dupByName) {
      const go = confirm(`A crew member named "${first} ${last}" already exists. Add anyway?`)
      if (!go) return
    }

    const id   = `crew_${Date.now()}`
    const data = {
      firstName: first, lastName: last, position: pos, active: true,
      ...(empId    && { employeeId: empId }),
      ...(lic      && { licenceNumber: lic }),
      ...(_natCode && { nationality: _natCode }),
    }
    try {
      await saveCrew(state.user.uid, id, data)
      state.crew = [...(state.crew || []), { id, ...data }]
      overlay.remove()
      renderSheetList(listEl, crewSlots, slotIdx, searchEl?.value || '')
      showToast('Crew member added', 'success')
    } catch (e) {
      showToast('Add failed', 'error')
    }
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

// ── Airport Datalist ──────────────────────────

function airportDatalistHtml() {
  const options = ALL_AIRPORT_CODES.map(code =>
    `<option value="${code}">`
  ).join('')
  return `<datalist id="airport-list">${options}</datalist>`
}
