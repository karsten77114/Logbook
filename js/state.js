// ══════════════════════════════════════════════
// App 全域狀態
// ══════════════════════════════════════════════

export const state = {
  user:    null,    // Firebase user object
  profile: null,   // { name, ... }
  career:  [],     // career records
  crew:    [],     // crew members from Firestore

  // list page cache
  flights:     [],
  flightTotal: 0,
  flightPages: 0,
  currentPage: 0,
  filters:     {},
  search:      '',
}

export function setUser(u)    { state.user    = u }
export function setProfile(p) { state.profile = p }
export function setCareer(c)  { state.career  = c }
export function setCrew(c)    { state.crew    = c }
