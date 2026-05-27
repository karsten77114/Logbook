// ══════════════════════════════════════════════
// 機隊資料：Registration → 機型對應
// ══════════════════════════════════════════════

export const FLEET = {
  // 華信航空 ATR72-600
  'B-16852': { type: 'ATR72-600', airline: '華信航空', icao24: null },
  'B-16853': { type: 'ATR72-600', airline: '華信航空', icao24: null },
  'B-16854': { type: 'ATR72-600', airline: '華信航空', icao24: null },
  'B-16855': { type: 'ATR72-600', airline: '華信航空', icao24: null },
  'B-16856': { type: 'ATR72-600', airline: '華信航空', icao24: null },
  'B-16857': { type: 'ATR72-600', airline: '華信航空', icao24: null },
  'B-16858': { type: 'ATR72-600', airline: '華信航空', icao24: null },

  // 星宇航空 A321-252NX
  'B-58201': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58202': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58203': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58204': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58205': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58206': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58207': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58208': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58209': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58210': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58211': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58212': { type: 'A321-252NX', airline: '星宇航空', icao24: null },
  'B-58213': { type: 'A321-252NX', airline: '星宇航空', icao24: null },

  // APEX 訓練中心 DA40-NG（單發）
  'B-88001': { type: 'DA40-NG', airline: 'APEX', icao24: null },
  'B-88002': { type: 'DA40-NG', airline: 'APEX', icao24: null },
  'B-88003': { type: 'DA40-NG', airline: 'APEX', icao24: null },
  'B-88005': { type: 'DA40-NG', airline: 'APEX', icao24: null },
  'B-88006': { type: 'DA40-NG', airline: 'APEX', icao24: null },
  'B-88123': { type: 'DA40-NG', airline: 'APEX', icao24: null },

  // APEX 訓練中心 DA42-NG（雙發）
  'B-89001': { type: 'DA42-NG', airline: 'APEX', icao24: null },

  // APEX 飛行模擬機
  'T12-FTD-01': { type: 'DA40-NG-FTD', airline: 'APEX', icao24: null },
  'T12-FTD-02': { type: 'DA42-NG-FTD', airline: 'APEX', icao24: null },
}

// 依機型取得所有 registration
export function getRegistrationsByType(type) {
  return Object.entries(FLEET)
    .filter(([, v]) => v.type === type)
    .map(([reg]) => reg)
    .sort()
}

// 依 registration 取得機型
export function getTypeByReg(reg) {
  return FLEET[reg]?.type ?? ''
}

// 所有 registrations 清單（排序）
export const ALL_REGISTRATIONS = Object.keys(FLEET).sort()

// Approach types
export const APPROACH_TYPES = [
  'ILS', 'RNP', 'LOC', 'LDA', 'VOR',
  'NDB', 'PAR', 'Visual', 'Contact', 'Circling',
]
