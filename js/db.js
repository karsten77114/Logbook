// ══════════════════════════════════════════════
// Firestore 資料操作
// ══════════════════════════════════════════════
import { getFirestore, collection, doc, setDoc, getDoc,
         getDocs, addDoc, updateDoc, deleteDoc,
         query, orderBy, where, limit, startAfter,
         serverTimestamp, writeBatch, Timestamp }  from 'firebase/firestore'
import { getFirebaseApp }                           from './auth.js'

let _db

export function initDb() {
  _db = getFirestore(getFirebaseApp())
  return _db
}

function db() { return _db }

// ── User profile ───────────────────────────────

export async function getProfile(uid) {
  const snap = await getDoc(doc(db(), 'users', uid))
  return snap.exists() ? snap.data() : null
}

export async function saveProfile(uid, data) {
  await setDoc(doc(db(), 'users', uid), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

// ── Career ────────────────────────────────────

export async function getCareer(uid) {
  const snap = await getDoc(doc(db(), 'users', uid, 'meta', 'career'))
  return snap.exists() ? (snap.data().records || []) : []
}

export async function saveCareer(uid, records) {
  await setDoc(doc(db(), 'users', uid, 'meta', 'career'), { records })
}

// ── Flights ───────────────────────────────────

const PAGE_SIZE = 50

/**
 * 取得飛行記錄（分頁）
 * @param {string} uid
 * @param {number} page  0-based
 * @param {object} filters { year, aircraftType, pfTakeoff, pfLanding, goAround, autoland }
 * @param {string} search  搜尋字串
 */
export async function getFlights(uid, page = 0, filters = {}, search = '') {
  const col = collection(db(), 'users', uid, 'flights')
  let q = query(col, orderBy('date', 'desc'))

  if (filters.year)         q = query(q, where('date', '>=', `${filters.year}-01-01`),
                                          where('date', '<=', `${filters.year}-12-31`))
  if (filters.aircraftType) q = query(q, where('aircraftType', '==', filters.aircraftType))
  if (filters.pfTakeoff)    q = query(q, where('pfTakeoff', '==', true))
  if (filters.pfLanding)    q = query(q, where('pfLanding', '==', true))
  if (filters.goAround)     q = query(q, where('goAround', '==', true))
  if (filters.autoland)     q = query(q, where('autoland', '==', true))

  const snap = await getDocs(q)
  let flights = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Client-side search（Firestore 不支援全文搜尋）
  if (search.trim()) {
    const s = search.trim().toUpperCase()
    flights = flights.filter(f =>
      f.flightNumber?.toUpperCase().includes(s) ||
      f.from?.toUpperCase().includes(s) ||
      f.to?.toUpperCase().includes(s) ||
      f.registration?.toUpperCase().includes(s) ||
      f.crewNames?.some(n => n.toUpperCase().includes(s))
    )
  }

  const total  = flights.length
  const paged  = flights.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return { flights: paged, total, pages: Math.ceil(total / PAGE_SIZE) }
}

/**
 * 取得所有飛行記錄（用於統計）
 */
export async function getAllFlights(uid) {
  const col  = collection(db(), 'users', uid, 'flights')
  const q    = query(col, orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * 取得單筆飛行記錄
 */
export async function getFlight(uid, flightId) {
  const snap = await getDoc(doc(db(), 'users', uid, 'flights', flightId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * 新增飛行記錄
 */
export async function addFlight(uid, flight) {
  const col  = collection(db(), 'users', uid, 'flights')
  const data = { ...flight, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
  const ref  = await addDoc(col, data)
  return ref.id
}

/**
 * 更新飛行記錄
 */
export async function updateFlight(uid, flightId, data) {
  await updateDoc(doc(db(), 'users', uid, 'flights', flightId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

/**
 * 刪除飛行記錄
 */
export async function deleteFlight(uid, flightId) {
  await deleteDoc(doc(db(), 'users', uid, 'flights', flightId))
}

/**
 * 批次匯入飛行記錄（每批 500 筆）
 * @param {string} uid
 * @param {object[]} flights  logbook.json 格式
 * @param {function} onProgress (done, total) => void
 */
export async function importFlights(uid, flights, onProgress) {
  const col  = collection(db(), 'users', uid, 'flights')
  const total = flights.length
  let done = 0

  for (let i = 0; i < total; i += 500) {
    const batch = writeBatch(db())
    const chunk = flights.slice(i, i + 500)

    for (const f of chunk) {
      // 用 objectId 當文件 ID，避免重複匯入
      const ref = doc(col, f.objectId)
      batch.set(ref, {
        date:               f.date || '',
        flightNumber:       f.flightNumber || '',
        aircraftType:       f.aircraftType || '',
        registration:       f.registration || '',
        from:               f.from || '',
        to:                 f.to || '',
        outTime:            f.outTime || '',
        offTime:            f.offTime || '',
        onTime:             f.onTime || '',
        inTime:             f.inTime || '',
        blockTime:          f.blockTime || 0,
        flightTime:         f.flightTime || 0,
        nightTime:          f.nightTime || 0,
        pfTakeoff:          f.pfTakeoff ?? false,
        pfLanding:          f.pfLanding ?? false,
        pic:                f.pic ?? false,
        autoland:           f.autoland ?? false,
        goAround:           f.goAround ?? false,
        diverted:           f.diverted ?? false,
        approachType:       f.approachType || '',
        runway:             f.runway || f.runwayFromNumbers || '',
        totalPax:           f.totalPax || 0,
        totalPayload:       f.totalPayload || 0,
        flightPlanDistance: f.flightPlanDistance || 0,
        crew:               f.crew || [],
        crewNames:          f.crewNames || [],
        createdAt:          serverTimestamp(),
        updatedAt:          serverTimestamp(),
      }, { merge: true })
    }

    await batch.commit()
    done += chunk.length
    onProgress?.(done, total)
  }
}

// ── Crew ──────────────────────────────────────

export async function getCrew(uid) {
  const col  = collection(db(), 'users', uid, 'crew')
  const snap = await getDocs(col)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function saveCrew(uid, crewId, data) {
  await setDoc(doc(db(), 'users', uid, 'crew', crewId), data, { merge: true })
}

export async function deleteCrew(uid, crewId) {
  await deleteDoc(doc(db(), 'users', uid, 'crew', crewId))
}

// ── Aircraft Settings ─────────────────────────
// 儲存使用者自訂的飛機 active/inactive 狀態

export async function getAircraftSettings(uid) {
  const snap = await getDoc(doc(db(), 'users', uid, 'meta', 'aircraft'))
  return snap.exists() ? (snap.data().settings || {}) : {}
}

export async function saveAircraftSettings(uid, settings) {
  await setDoc(doc(db(), 'users', uid, 'meta', 'aircraft'), { settings })
}

// ── Custom Aircraft ───────────────────────────

export async function getCustomAircraft(uid) {
  const snap = await getDoc(doc(db(), 'users', uid, 'meta', 'customAircraft'))
  return snap.exists() ? (snap.data().records || []) : []
}

export async function saveCustomAircraft(uid, records) {
  await setDoc(doc(db(), 'users', uid, 'meta', 'customAircraft'), { records })
}
