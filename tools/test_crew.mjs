// node tools/test_crew.mjs — pure crew helper tests (synthetic data only)
import assert from 'node:assert/strict'
import {
  crewFullName, crewNameKey, flightCrewIds, crewMeta, crewLabel,
  crewMatchesQuery, matchCrewFlights, initialCrewSlots, crewFieldsFromSlots,
  CREW_NICKNAME_MAX, normalizeCrewNickname, crewNickname, flightCrewLabels,
} from '../js/utils/crew.js'

const A  = { id: 'c1', firstName: 'Alex', lastName: 'Lee', employeeId: '1001', position: 'FO' }
const A2 = { id: 'c2', firstName: 'Alex', lastName: 'Lee', employeeId: '2002', position: 'CA', active: false }
const B  = { id: 'c3', firstName: 'Bo',   lastName: 'Chen', employeeId: '3003' }
const all = [A, A2, B]

// basics
assert.equal(crewFullName(A), 'Alex Lee')
assert.equal(crewNameKey('  Alex   LEE '), 'alex lee')
assert.deepEqual(flightCrewIds({ crew: ['c1', '', '  ', null, ' c9 '] }), ['c1', 'c9'])
assert.deepEqual(flightCrewIds({}), [])
assert.equal(crewMeta(A), 'FO · 1001')
assert.equal(crewMeta(B), '3003')
assert.equal(crewLabel(A), 'Alex Lee · 1001')
assert.equal(crewLabel({ firstName: 'X', lastName: 'Y' }), 'X Y')

// search by name / reversed / employee ID
assert.ok(crewMatchesQuery(A, 'alex'))
assert.ok(crewMatchesQuery(A, 'lee alex'))
assert.ok(crewMatchesQuery(A, '1001'))
assert.ok(!crewMatchesQuery(A, '2002'))
assert.ok(crewMatchesQuery(A, ''))

// matching
const flights = [
  { id: 'f1', crew: ['c1'], crewNames: ['Alex Lee'] },
  { id: 'f2', crew: ['c2'], crewNames: ['Alex Lee'] },
  { id: 'f3', crew: [],     crewNames: ['Alex Lee'] },          // legacy, ambiguous
  { id: 'f4', crew: ['gone'], crewNames: ['Bo Chen'] },          // unknown ID authoritative
  { id: 'f5', crew: [],     crewNames: ['bo  chen'] },           // legacy, unique
  { id: 'f6', crew: ['', ' '], crewNames: ['Bo Chen'] },         // empty IDs → legacy
  { id: 'f7', crew: ['c3', 'c2'], crewNames: ['Alex Lee'] },
]
let r = matchCrewFlights(A, all, flights)
assert.deepEqual(r.matched.map(f => f.id), ['f1'])
assert.deepEqual(r.ambiguous.map(f => f.id), ['f3'])

r = matchCrewFlights(A2, all, flights)
assert.deepEqual(r.matched.map(f => f.id), ['f2', 'f7'])
assert.deepEqual(r.ambiguous.map(f => f.id), ['f3'])

r = matchCrewFlights(B, all, flights)
assert.deepEqual(r.matched.map(f => f.id), ['f5', 'f6', 'f7'])
assert.deepEqual(r.ambiguous, [])

// inactive same-name crew still makes the name ambiguous for the active one
r = matchCrewFlights(A, [A, A2], [{ id: 'x', crew: [], crewNames: ['Alex Lee'] }])
assert.equal(r.matched.length, 0)
assert.deepEqual(r.ambiguous.map(f => f.id), ['x'])

// unique legacy name matches even when person is inactive
r = matchCrewFlights(A2, [A2, B], [{ id: 'x', crew: [], crewNames: ['Alex Lee'] }])
assert.equal(r.matched.length, 1)

// slots keep unresolved IDs
const slots = initialCrewSlots({ crew: ['c1', 'gone'], crewNames: ['Alex Lee', 'Old Name', 'Legacy Only'] }, all, 4)
assert.equal(slots.length, 4)
assert.equal(slots[0].id, 'c1')
assert.equal(slots[1].unresolved, true)
assert.equal(slots[2].legacyOnly, true)
assert.equal(slots[3], null)
assert.deepEqual(crewFieldsFromSlots(slots), {
  crew: ['c1', 'gone', null],
  crewNames: ['Alex Lee', 'Old Name', 'Legacy Only'],
})
const mixed = [slots[2], slots[0], slots[1]]
assert.deepEqual(initialCrewSlots(crewFieldsFromSlots(mixed), all), mixed)

// nickname: normalize / display / search
const N1 = { id: 'n1', firstName: 'Alex', lastName: 'Lee', employeeId: '1001', nickname: '  Ace ' }
const N2 = { id: 'n2', firstName: 'Alex', lastName: 'Lee', employeeId: '2002', nickname: 'Bear' }
assert.equal(normalizeCrewNickname('  Ace  '), 'Ace')
assert.equal(normalizeCrewNickname('   '), '')
assert.equal(normalizeCrewNickname('x'.repeat(40)).length, CREW_NICKNAME_MAX)
assert.equal(crewNickname(N1), 'Ace')
assert.equal(crewNickname(A), '')
assert.equal(crewLabel(N1), 'Alex Lee (Ace) · 1001')
assert.ok(crewMatchesQuery(N1, 'ace'))
assert.ok(crewMatchesQuery(N1, ' ACE '))
assert.ok(!crewMatchesQuery(N2, 'ace'))
assert.ok(crewMatchesQuery(N2, 'alex'))
assert.ok(!crewMatchesQuery(A, 'ace'))

// saved-flight rows: nickname resolved strictly by crew ID
const nAll = [N1, N2, B]
assert.deepEqual(flightCrewLabels({ crew: ['n2', 'n1'], crewNames: ['Alex Lee', 'Alex Lee'] }, nAll), ['Alex Lee (Bear)', 'Alex Lee (Ace)'])
assert.deepEqual(flightCrewLabels({ crew: ['n1'] }, nAll), ['Alex Lee (Ace)'])
// legacy name-only rows keep names, no nickname
assert.deepEqual(flightCrewLabels({ crew: [], crewNames: ['Alex Lee', 'Bo Chen'] }, nAll), ['Alex Lee', 'Bo Chen'])
// null ids / unresolved ids keep saved names
assert.deepEqual(flightCrewLabels({ crew: [null, 'gone'], crewNames: ['Legacy', 'Old Name'] }, nAll), ['Legacy', 'Old Name'])
// snapshot name is preserved even if crew was renamed later
assert.deepEqual(flightCrewLabels({ crew: ['n1'], crewNames: ['Old Alex'] }, nAll), ['Old Alex (Ace)'])
// Old unaligned arrays: keep the original names without guessing which row owns the ID.
assert.deepEqual(flightCrewLabels({ crew: ['n1', 'x', 'y'], crewNames: ['Alex Lee', 'Zed'] }, nAll), ['Alex Lee', 'Zed'])
assert.deepEqual(flightCrewLabels({ crew: ['n1'], crewNames: ['Alex Lee', 'Alex Lee'] }, nAll), ['Alex Lee', 'Alex Lee'])
// nickname never alters matching / slot snapshots
assert.equal(matchCrewFlights(N1, nAll, [{ id: 'q', crew: ['n1'] }]).matched.length, 1)
assert.deepEqual(crewFieldsFromSlots([N1]), { crew: ['n1'], crewNames: ['Alex Lee'] })

console.log('test_crew: all passed')
