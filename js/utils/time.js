// ══════════════════════════════════════════════
// 時間工具函數
// ══════════════════════════════════════════════

/**
 * 將 HHMM 字串轉為分鐘數
 * @param {string} hhmm  e.g. "0143", "23:59"
 */
export function hmToMin(hhmm) {
  if (!hhmm) return 0
  const s = hhmm.replace(':', '')
  if (s.length < 3) return 0
  const h = parseInt(s.slice(0, -2), 10)
  const m = parseInt(s.slice(-2), 10)
  return h * 60 + m
}

/**
 * 將分鐘數轉為 HH:MM 字串
 */
export function minToHm(min) {
  if (min == null || isNaN(min)) return '--:--'
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 計算兩個 HHMM 之間的分鐘差（跨日自動處理）
 */
export function diffMin(startHm, endHm) {
  let s = hmToMin(startHm)
  let e = hmToMin(endHm)
  if (e < s) e += 24 * 60  // 跨日
  return e - s
}

/**
 * 格式化分鐘為 "X:XX" 或 "Xh XXm"
 */
export function fmtDuration(min, mode = 'hm') {
  if (!min || isNaN(min)) return mode === 'hm' ? '--:--' : '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (mode === 'verbose') return `${h}h ${String(m).padStart(2, '0')}m`
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * 格式化日期字串 YYYY-MM-DD → DD MMM YY
 */
export function fmtDate(dateStr) {
  if (!dateStr) return ''
  const months = ['JAN','FEB','MAR','APR','MAY','JUN',
                  'JUL','AUG','SEP','OCT','NOV','DEC']
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${String(d).padStart(2,'0')} ${months[m-1]} ${String(y).slice(-2)}`
}

/**
 * 格式化日期為短格式 YYYY-MM-DD → MM/DD
 */
export function fmtDateShort(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

/**
 * 取得今天的 UTC 日期字串 YYYY-MM-DD
 */
export function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * 驗證 HHMM 格式是否合法
 */
export function isValidHm(hhmm) {
  if (!hhmm) return false
  const s = hhmm.replace(':', '').replace(/\s/g, '')
  if (!/^\d{3,4}$/.test(s)) return false
  const h = parseInt(s.length === 4 ? s.slice(0, 2) : s.slice(0, 1), 10)
  const m = parseInt(s.slice(-2), 10)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

/**
 * 將 HHMM 輸入標準化為 "HH:MM"
 */
export function normalizeHm(hhmm) {
  if (!hhmm) return ''
  const s = hhmm.replace(':', '').replace(/\s/g, '').padStart(4, '0')
  return `${s.slice(0,2)}:${s.slice(2,4)}`
}
