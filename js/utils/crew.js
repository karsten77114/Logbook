// ══════════════════════════════════════════════
// Crew helpers — pure functions (no DOM / no Firestore), testable with node
// ══════════════════════════════════════════════

/** "First Last" display name */
export function crewFullName(person) {
  return `${person?.firstName || ''} ${person?.lastName || ''}`.trim() ||
         person?.displayName ||
         person?.name ||
         ''
}

/** Normalised name used for legacy name-only matching */
export function crewNameKey(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Nonempty crew IDs stored on a flight (includes unknown / deleted IDs) */
export function flightCrewIds(f) {
  return (Array.isArray(f?.crew) ? f.crew : [])
    .map(id => (id == null ? '' : String(id).trim()))
    .filter(Boolean)
}

/** "Position · EmployeeID" sub-label used in pickers / slots */
export function crewMeta(person) {
  return [person?.position, person?.employeeId].filter(Boolean).join(' · ')
}

/** "Name · EmployeeID" label that disambiguates same-name crew */
export function crewLabel(person) {
  const name = crewFullName(person)
  return person?.employeeId ? `${name} · ${person.employeeId}` : name
}

/** Picker search: name (either order) or employee ID */
export function crewMatchesQuery(person, query) {
  const q = crewNameKey(query)
  if (!q) return true
  const first = crewNameKey(person?.firstName)
  const last  = crewNameKey(person?.lastName)
  return `${first} ${last}`.includes(q) ||
         `${last} ${first}`.includes(q) ||
         crewNameKey(person?.employeeId).includes(q)
}

/**
 * Which flights count as "together" with `person`.
 *  - Flight has any nonempty crew ID (even unknown/deleted) → ID is authoritative.
 *  - Otherwise legacy crewNames fallback, only if the name uniquely identifies
 *    a member of the FULL crew list (active + inactive).
 *  - Ambiguous legacy matches are returned separately for manual review.
 * @returns {{ matched: object[], ambiguous: object[] }}
 */
export function matchCrewFlights(person, allCrew, flights) {
  const key = crewNameKey(crewFullName(person))
  const sameName = key
    ? (allCrew || []).filter(c => crewNameKey(crewFullName(c)) === key && c.id !== person.id)
    : []
  const unique = key && sameName.length === 0

  const matched = []
  const ambiguous = []
  for (const f of flights || []) {
    const ids = flightCrewIds(f)
    if (ids.length) {
      if (ids.includes(person.id)) matched.push(f)
      continue
    }
    if (!key) continue
    const names = Array.isArray(f?.crewNames) ? f.crewNames : []
    if (!names.some(n => crewNameKey(n) === key)) continue
    if (unique) matched.push(f)
    else ambiguous.push(f)
  }
  return { matched, ambiguous }
}

/**
 * Initial edit-slot model from a stored flight. Unresolved IDs are kept
 * (`unresolved: true`) so they survive a save.
 */
export function initialCrewSlots(f, allCrew, minSize = 0) {
  const byId = new Map((allCrew || []).map(c => [c.id, c]))
  const ids = Array.isArray(f?.crew) ? f.crew : []
  const names = Array.isArray(f?.crewNames) ? f.crewNames : []
  const size = Math.max(minSize, ids.length, names.length)
  return Array.from({ length: size }, (_, i) => {
    const id = ids[i] ? String(ids[i]).trim() : ''
    if (id && byId.has(id)) return byId.get(id)
    if (id || names[i]) {
      return {
        id,
        displayName: names[i] || id,
        unresolved: Boolean(id),
        legacyOnly: !id,
      }
    }
    return null
  })
}

/** crew / crewNames arrays to store from edit slots (keeps unresolved IDs) */
export function crewFieldsFromSlots(slots) {
  const filled = (slots || []).filter(Boolean)
  return {
    // Keep name-only slots aligned with the names array on the next edit.
    crew:      filled.some(c => c.id) ? filled.map(c => c.id || null) : [],
    crewNames: filled.map(crewFullName),
  }
}
