// ══════════════════════════════════════════════
// App 全域狀態
// ══════════════════════════════════════════════

export const state = {
  user:    null,    // Firebase user object
  profile: null,   // { name, ... }
  career:  [],     // career records
  crew:    [],     // crew members from Firestore
  aircraftSettings: {}, // { [reg]: { active: bool } }
  customAircraft: [],   // [{ reg, type, airline, msn, icao24 }]

  // list page cache
  flights:     [],
  flightTotal: 0,
  flightPages: 0,
  currentPage: 0,
  filters:     {},
  search:      '',
}

export function setUser(u)               { state.user             = u }
export function setProfile(p)            { state.profile          = p }
export function setCareer(c)             { state.career           = c }
export function setCrew(c)               { state.crew             = c }
export function setAircraftSettings(s)   { state.aircraftSettings = s }
export function setCustomAircraft(a)     { state.customAircraft   = a }

/** 判斷某架飛機是否 active（預設 true）*/
export function isAircraftActive(reg) {
  const s = state.aircraftSettings[reg]
  return s === undefined ? true : s.active !== false
}

/** 判斷某位機師是否 active（預設 true）*/
export function isCrewActive(crew) {
  return crew.active !== false
}
