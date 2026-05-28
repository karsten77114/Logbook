// ══════════════════════════════════════════════
// 機場資料：台灣相關航點（含國內、國際）
// IATA code → { name, city, coords: [lat, lon] }
// 涵蓋所有從台灣出發的航點（無論台灣或外國航空）
// ══════════════════════════════════════════════

export const AIRPORTS = {
  // ── 台灣國內 ──────────────────────────────
  TPE: { name: '桃園國際機場',        city: '台北',     coords: [25.077,  121.233] },
  TSA: { name: '臺北松山機場',        city: '台北',     coords: [25.069,  121.552] },
  RMQ: { name: '臺中國際機場',        city: '台中',     coords: [24.264,  120.621] },
  KHH: { name: '高雄國際機場',        city: '高雄',     coords: [22.577,  120.350] },
  TNN: { name: '台南機場',            city: '台南',     coords: [22.950,  120.206] },
  CYI: { name: '嘉義水上機場',        city: '嘉義',     coords: [23.462,  120.393] },
  HUN: { name: '花蓮機場',            city: '花蓮',     coords: [23.879,  121.618] },
  TTT: { name: '台東機場',            city: '台東',     coords: [22.754,  121.101] },
  KNH: { name: '金門尚義機場',        city: '金門',     coords: [24.427,  118.359] },
  MZG: { name: '澎湖馬公機場',        city: '澎湖',     coords: [23.568,  119.628] },
  GNI: { name: '綠島機場',            city: '綠島',     coords: [23.605,  119.467] },
  LZN: { name: '馬祖南竿機場',        city: '馬祖南竿', coords: [26.160,  119.958] },
  MFK: { name: '馬祖北竿機場',        city: '馬祖北竿', coords: [26.224,  120.003] },
  WOT: { name: '蘭嶼機場',            city: '蘭嶼',     coords: [22.037,  121.535] },

  // ── 日本 ──────────────────────────────────
  NRT: { name: '東京成田國際機場',     city: '東京',     coords: [35.765,  140.386] },
  HND: { name: '東京羽田機場',         city: '東京',     coords: [35.553,  139.781] },
  KIX: { name: '大阪關西國際機場',     city: '大阪',     coords: [34.435,  135.244] },
  ITM: { name: '大阪伊丹機場',         city: '大阪',     coords: [34.785,  135.438] },
  UKB: { name: '神戶機場',             city: '神戶',     coords: [34.633,  135.224] },
  NGO: { name: '名古屋中部國際機場',   city: '名古屋',   coords: [34.858,  136.805] },
  FUK: { name: '福岡機場',             city: '福岡',     coords: [33.585,  130.451] },
  KMI: { name: '宮崎機場',             city: '宮崎',     coords: [31.877,  131.449] },
  KOJ: { name: '鹿兒島機場',           city: '鹿兒島',   coords: [31.803,  130.719] },
  KMJ: { name: '熊本機場',             city: '熊本',     coords: [32.837,  130.855] },
  OIT: { name: '大分機場',             city: '大分',     coords: [33.479,  131.737] },
  NGS: { name: '長崎機場',             city: '長崎',     coords: [32.917,  129.914] },
  KKJ: { name: '北九州機場',           city: '北九州',   coords: [33.846,  130.996] },
  HIJ: { name: '廣島機場',             city: '廣島',     coords: [34.436,  132.919] },
  OKJ: { name: '岡山桃太郎機場',       city: '岡山',     coords: [34.757,  133.855] },
  TAK: { name: '高松機場',             city: '高松',     coords: [34.214,  134.016] },
  MYJ: { name: '松山機場',             city: '松山/愛媛', coords: [33.827,  132.700] },
  CTS: { name: '札幌新千歲機場',       city: '札幌',     coords: [42.775,  141.692] },
  SDJ: { name: '仙台機場',             city: '仙台',     coords: [38.140,  140.917] },
  KIJ: { name: '新潟機場',             city: '新潟',     coords: [37.957,  139.121] },
  AOJ: { name: '青森機場',             city: '青森',     coords: [40.734,  140.691] },
  AXT: { name: '秋田機場',             city: '秋田',     coords: [39.616,  140.219] },
  OKA: { name: '那霸機場',             city: '沖繩',     coords: [26.196,  127.646] },
  ISG: { name: '石垣島機場',           city: '石垣島',   coords: [24.396,  124.187] },
  MMY: { name: '宮古島機場',           city: '宮古島',   coords: [24.782,  125.296] },
  IEJ: { name: '伊江島機場',           city: '伊江島',   coords: [26.722,  127.786] },

  // ── 韓國 ──────────────────────────────────
  ICN: { name: '首爾仁川國際機場',     city: '首爾',     coords: [37.469,  126.451] },
  GMP: { name: '首爾金浦機場',         city: '首爾',     coords: [37.559,  126.794] },
  PUS: { name: '釜山金海國際機場',     city: '釜山',     coords: [35.179,  128.938] },
  CJU: { name: '濟州國際機場',         city: '濟州',     coords: [33.511,  126.493] },

  // ── 香港 / 澳門 ──────────────────────────
  HKG: { name: '香港國際機場',         city: '香港',     coords: [22.308,  113.915] },
  MFM: { name: '澳門國際機場',         city: '澳門',     coords: [22.149,  113.592] },

  // ── 中國大陸 ──────────────────────────────
  PVG: { name: '上海浦東國際機場',     city: '上海',     coords: [31.143,  121.805] },
  SHA: { name: '上海虹橋國際機場',     city: '上海',     coords: [31.198,  121.336] },
  PEK: { name: '北京首都國際機場',     city: '北京',     coords: [40.080,  116.584] },
  PKX: { name: '北京大興國際機場',     city: '北京',     coords: [39.509,  116.411] },
  CAN: { name: '廣州白雲國際機場',     city: '廣州',     coords: [23.392,  113.299] },
  SZX: { name: '深圳寶安國際機場',     city: '深圳',     coords: [22.639,  113.811] },
  XMN: { name: '廈門高崎國際機場',     city: '廈門',     coords: [24.544,  118.127] },
  FOC: { name: '福州長樂國際機場',     city: '福州',     coords: [25.934,  119.663] },
  NKG: { name: '南京祿口國際機場',     city: '南京',     coords: [31.742,  118.862] },
  HGH: { name: '杭州蕭山國際機場',     city: '杭州',     coords: [30.229,  120.434] },
  NGB: { name: '寧波栎社國際機場',     city: '寧波',     coords: [29.827,  121.462] },
  WUH: { name: '武漢天河國際機場',     city: '武漢',     coords: [30.783,  114.208] },
  CSX: { name: '長沙黃花國際機場',     city: '長沙',     coords: [28.189,  113.220] },
  CTU: { name: '成都天府國際機場',     city: '成都',     coords: [30.578,  104.445] },
  CKG: { name: '重慶江北國際機場',     city: '重慶',     coords: [29.717,  106.642] },
  KMG: { name: '昆明長水國際機場',     city: '昆明',     coords: [24.992,  102.743] },
  XIY: { name: '西安咸陽國際機場',     city: '西安',     coords: [34.447,  108.752] },
  TAO: { name: '青島膠東國際機場',     city: '青島',     coords: [36.266,  120.374] },
  DLC: { name: '大連周水子國際機場',   city: '大連',     coords: [38.966,  121.539] },
  TSN: { name: '天津濱海國際機場',     city: '天津',     coords: [39.124,  117.347] },
  TNA: { name: '濟南遙牆國際機場',     city: '濟南',     coords: [36.857,  117.216] },
  HAK: { name: '海口美蘭國際機場',     city: '海口',     coords: [19.935,  110.459] },
  SYX: { name: '三亞鳳凰國際機場',     city: '三亞',     coords: [18.303,  109.412] },
  HRB: { name: '哈爾濱太平國際機場',   city: '哈爾濱',   coords: [45.623,  126.250] },

  // ── 東南亞 ────────────────────────────────
  BKK: { name: '曼谷素萬那普機場',     city: '曼谷',     coords: [13.681,  100.747] },
  DMK: { name: '曼谷廊曼機場',         city: '曼谷',     coords: [13.912,  100.607] },
  HKT: { name: '普吉國際機場',         city: '普吉',     coords: [ 8.113,   98.317] },
  CNX: { name: '清邁國際機場',         city: '清邁',     coords: [18.768,   98.963] },
  SGN: { name: '胡志明市新山一機場',   city: '胡志明市', coords: [10.819,  106.652] },
  HAN: { name: '河內內排國際機場',     city: '河內',     coords: [21.221,  105.807] },
  DAD: { name: '峴港國際機場',         city: '峴港',     coords: [16.044,  108.199] },
  KUL: { name: '吉隆坡國際機場',       city: '吉隆坡',   coords: [ 2.746,  101.710] },
  PEN: { name: '檳城國際機場',         city: '檳城',     coords: [ 5.297,  100.277] },
  BKI: { name: '亞庇國際機場',         city: '亞庇',     coords: [ 5.938,  116.051] },
  KCH: { name: '古晉國際機場',         city: '古晉',     coords: [ 1.485,  110.337] },
  SIN: { name: '新加坡樟宜機場',       city: '新加坡',   coords: [ 1.359,  103.989] },
  CGK: { name: '雅加達蘇加諾-哈達機場', city: '雅加達', coords: [-6.126,  106.656] },
  DPS: { name: '峇里島努拉萊機場',     city: '峇里島',   coords: [-8.748,  115.167] },
  SUB: { name: '泗水朱安達機場',       city: '泗水',     coords: [-7.380,  112.787] },
  MNL: { name: '馬尼拉尼諾伊機場',     city: '馬尼拉',   coords: [14.509,  121.020] },
  CEB: { name: '宿霧麥克坦機場',       city: '宿霧',     coords: [10.307,  123.979] },
  RGN: { name: '仰光國際機場',         city: '仰光',     coords: [16.907,   96.133] },
  REP: { name: '暹粒吳哥國際機場',     city: '暹粒',     coords: [13.411,  103.813] },
  PNH: { name: '金邊國際機場',         city: '金邊',     coords: [11.547,  104.844] },
  VTE: { name: '永珍瓦岱機場',         city: '永珍',     coords: [17.988,  102.563] },

  // ── 南亞 ──────────────────────────────────
  DEL: { name: '新德里英迪拉甘地機場', city: '新德里',   coords: [28.556,   77.100] },
  BOM: { name: '孟買賈特拉帕蒂機場',  city: '孟買',     coords: [19.089,   72.868] },

  // ── 中東 ──────────────────────────────────
  DXB: { name: '杜拜國際機場',         city: '杜拜',     coords: [25.253,   55.366] },
  AUH: { name: '阿布達比國際機場',     city: '阿布達比', coords: [24.433,   54.651] },
  DOH: { name: '多哈哈馬德國際機場',   city: '多哈',     coords: [25.273,   51.608] },
  MCT: { name: '馬斯喀特國際機場',     city: '馬斯喀特', coords: [23.594,   58.285] },
  IST: { name: '伊斯坦堡機場',         city: '伊斯坦堡', coords: [41.275,   28.752] },
  AMM: { name: '安曼皇后阿利婭機場',   city: '安曼',     coords: [31.723,   35.993] },

  // ── 美國 ──────────────────────────────────
  LAX: { name: '洛杉磯國際機場',       city: '洛杉磯',   coords: [33.943, -118.408] },
  SFO: { name: '舊金山國際機場',       city: '舊金山',   coords: [37.619, -122.375] },
  SJC: { name: '聖荷西機場',           city: '聖荷西',   coords: [37.362, -121.929] },
  SEA: { name: '西雅圖塔科馬機場',     city: '西雅圖',   coords: [47.450, -122.309] },
  JFK: { name: '紐約甘迺迪機場',       city: '紐約',     coords: [40.640,  -73.779] },
  EWR: { name: '紐瓦克自由機場',       city: '紐約',     coords: [40.693,  -74.177] },
  ORD: { name: '芝加哥歐哈爾機場',     city: '芝加哥',   coords: [41.978,  -87.905] },
  HNL: { name: '檀香山丹尼爾井野機場', city: '夏威夷',   coords: [21.320, -157.924] },
  DFW: { name: '達拉斯沃思堡機場',     city: '達拉斯',   coords: [32.897,  -97.038] },
  IAH: { name: '休士頓喬治布希機場',   city: '休士頓',   coords: [29.990,  -95.337] },
  ANC: { name: '安克拉治機場',         city: '安克拉治', coords: [61.175, -149.996] },

  // ── 加拿大 ────────────────────────────────
  YVR: { name: '溫哥華國際機場',       city: '溫哥華',   coords: [49.194, -123.184] },
  YYZ: { name: '多倫多皮爾遜機場',     city: '多倫多',   coords: [43.677,  -79.631] },

  // ── 澳洲 / 大洋洲 ──────────────────────────
  SYD: { name: '雪梨金斯福德史密斯機場', city: '雪梨',   coords: [-33.947,  151.177] },
  MEL: { name: '墨爾本圖拉馬林機場',   city: '墨爾本',   coords: [-37.673,  144.843] },
  BNE: { name: '布里斯本機場',         city: '布里斯本', coords: [-27.384,  153.118] },
  PER: { name: '柏斯機場',             city: '柏斯',     coords: [-31.940,  115.967] },
  AKL: { name: '奧克蘭國際機場',       city: '奧克蘭',   coords: [-37.008,  174.792] },
  GUM: { name: '關島安東尼奧旺派特機場', city: '關島',   coords: [13.484,   144.796] },
  SPN: { name: '塞班島機場',           city: '塞班',     coords: [15.119,   145.730] },

  // ── 歐洲 ──────────────────────────────────
  FRA: { name: '法蘭克福機場',         city: '法蘭克福', coords: [50.033,    8.571] },
  LHR: { name: '倫敦希斯洛機場',       city: '倫敦',     coords: [51.477,   -0.461] },
  CDG: { name: '巴黎戴高樂機場',       city: '巴黎',     coords: [49.013,    2.550] },
  AMS: { name: '阿姆斯特丹史基浦機場', city: '阿姆斯特丹', coords: [52.310,   4.768] },
  FCO: { name: '羅馬菲烏米奇諾機場',   city: '羅馬',     coords: [41.804,   12.251] },
  MXP: { name: '米蘭馬爾彭薩機場',     city: '米蘭',     coords: [45.630,    8.723] },
  MAD: { name: '馬德里巴拉哈斯機場',   city: '馬德里',   coords: [40.472,   -3.561] },
  ZRH: { name: '蘇黎世機場',           city: '蘇黎世',   coords: [47.464,    8.549] },
  VIE: { name: '維也納機場',           city: '維也納',   coords: [48.110,   16.571] },
  MUC: { name: '慕尼黑機場',           city: '慕尼黑',   coords: [48.354,   11.786] },
  PRG: { name: '布拉格瓦茨拉夫哈維爾機場', city: '布拉格', coords: [50.101,  14.260] },
  WAW: { name: '華沙蕭邦機場',         city: '華沙',     coords: [52.166,   20.967] },
}

/**
 * 取得所有機場的 IATA 清單（排序）
 */
export const ALL_AIRPORT_CODES = Object.keys(AIRPORTS).sort()

/**
 * 依 IATA 取得顯示名稱（供 datalist 使用）
 */
export function getAirportLabel(iata) {
  const a = AIRPORTS[iata]
  if (!a) return iata
  return `${iata} — ${a.city} ${a.name}`
}

// ── localStorage 緩存（存放透過 Worker 查到的機場）────────────────────
const _LS_KEY = 'logbook_airport_cache_v1'

function _lsRead() {
  try { return JSON.parse(localStorage.getItem(_LS_KEY) || '{}') } catch { return {} }
}
function _lsWrite(cache) {
  try { localStorage.setItem(_LS_KEY, JSON.stringify(cache)) } catch {}
}

/**
 * 同步取得機場座標（[lat, lon]）
 * 查詢順序：內建表 → localStorage cache
 */
export function getAirportCoords(iata) {
  if (!iata) return null
  const code = iata.toUpperCase()
  // 1. Built-in
  if (AIRPORTS[code]) return AIRPORTS[code].coords
  // 2. localStorage cache (from previous async lookup)
  const cache = _lsRead()
  const entry = cache[code]
  if (entry?.lat != null) return [entry.lat, entry.lon]
  return null
}

// ── Worker 端點 ───────────────────────────────────────────────────────
const _WORKER = 'https://jx-briefing.karsten77114.workers.dev'

/**
 * 非同步查詢機場資料（含自動 cache）
 * 查詢順序：內建表 → localStorage → Worker API（AeroDataBox）
 * @param {string} iata  3-letter IATA code
 * @returns {Promise<{iata, name, city, lat, lon} | null>}
 */
export async function lookupAirport(iata) {
  if (!iata || iata.length < 3) return null
  const code = iata.toUpperCase().slice(0, 3)

  // 1. Built-in table
  const builtin = AIRPORTS[code]
  if (builtin) {
    return { iata: code, name: builtin.name, city: builtin.city,
             lat: builtin.coords[0], lon: builtin.coords[1] }
  }

  // 2. localStorage cache
  const cache = _lsRead()
  if (cache[code]?.lat != null) return cache[code]

  // 3. Worker API
  try {
    const res = await fetch(`${_WORKER}/api/airport?iata=${code}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.lat == null) return null

    const entry = {
      iata: code,
      name: data.name    || code,
      city: data.city    || '',
      country: data.country || '',
      lat:  data.lat,
      lon:  data.lon,
    }

    // Save to localStorage for future sync access
    cache[code] = entry
    _lsWrite(cache)

    return entry
  } catch {
    return null
  }
}
