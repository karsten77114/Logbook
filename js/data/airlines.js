// ══════════════════════════════════════════════
// Airline Database — IATA codes + tail logo helper
// ══════════════════════════════════════════════

export const AIRLINES = [
  // Taiwan
  { iata: 'JX', name: 'Starlux Airlines',       country: 'TW' },
  { iata: 'CI', name: 'China Airlines',          country: 'TW' },
  { iata: 'BR', name: 'EVA Air',                 country: 'TW' },
  { iata: 'AE', name: 'Mandarin Airlines',       country: 'TW' },
  { iata: 'IT', name: 'Tigerair Taiwan',         country: 'TW' },
  { iata: 'B7', name: 'Uni Air',                 country: 'TW' },
  // Greater China
  { iata: 'CX', name: 'Cathay Pacific',          country: 'HK' },
  { iata: 'KA', name: 'Cathay Dragon',           country: 'HK' },
  { iata: 'HX', name: 'Hong Kong Airlines',      country: 'HK' },
  { iata: 'NX', name: 'Air Macau',               country: 'MO' },
  { iata: 'CA', name: 'Air China',               country: 'CN' },
  { iata: 'MU', name: 'China Eastern',           country: 'CN' },
  { iata: 'CZ', name: 'China Southern',          country: 'CN' },
  { iata: 'HU', name: 'Hainan Airlines',         country: 'CN' },
  { iata: 'MF', name: 'Xiamen Air',              country: 'CN' },
  { iata: 'FM', name: 'Shanghai Airlines',       country: 'CN' },
  { iata: '9C', name: 'Spring Airlines',         country: 'CN' },
  // Japan
  { iata: 'NH', name: 'ANA',                     country: 'JP' },
  { iata: 'JL', name: 'Japan Airlines',          country: 'JP' },
  { iata: 'MM', name: 'Peach Aviation',          country: 'JP' },
  { iata: 'GK', name: 'Jetstar Japan',           country: 'JP' },
  { iata: 'BC', name: 'Skymark Airlines',        country: 'JP' },
  // Korea
  { iata: 'KE', name: 'Korean Air',              country: 'KR' },
  { iata: 'OZ', name: 'Asiana Airlines',         country: 'KR' },
  { iata: '7C', name: 'Jeju Air',                country: 'KR' },
  { iata: 'TW', name: 'T\'way Air',              country: 'KR' },
  { iata: 'RS', name: 'Air Seoul',               country: 'KR' },
  // Southeast Asia
  { iata: 'SQ', name: 'Singapore Airlines',      country: 'SG' },
  { iata: 'TR', name: 'Scoot',                   country: 'SG' },
  { iata: '3K', name: 'Jetstar Asia',            country: 'SG' },
  { iata: 'MH', name: 'Malaysia Airlines',       country: 'MY' },
  { iata: 'AK', name: 'AirAsia',                 country: 'MY' },
  { iata: 'D7', name: 'AirAsia X',               country: 'MY' },
  { iata: 'TG', name: 'Thai Airways',            country: 'TH' },
  { iata: 'FD', name: 'Thai AirAsia',            country: 'TH' },
  { iata: 'WE', name: 'Thai Smile',              country: 'TH' },
  { iata: 'VN', name: 'Vietnam Airlines',        country: 'VN' },
  { iata: 'VJ', name: 'Vietjet Air',             country: 'VN' },
  { iata: 'BL', name: 'Pacific Airlines',        country: 'VN' },
  { iata: 'GA', name: 'Garuda Indonesia',        country: 'ID' },
  { iata: 'JT', name: 'Lion Air',               country: 'ID' },
  { iata: 'ID', name: 'Batik Air',               country: 'ID' },
  { iata: 'PR', name: 'Philippine Airlines',     country: 'PH' },
  { iata: 'Z2', name: 'AirAsia Philippines',     country: 'PH' },
  { iata: 'MI', name: 'SilkAir',                 country: 'SG' },
  // South Asia
  { iata: 'AI', name: 'Air India',               country: 'IN' },
  { iata: 'UK', name: 'Vistara',                 country: 'IN' },
  { iata: 'UL', name: 'SriLankan Airlines',      country: 'LK' },
  // Middle East
  { iata: 'EK', name: 'Emirates',                country: 'AE' },
  { iata: 'EY', name: 'Etihad Airways',          country: 'AE' },
  { iata: 'QR', name: 'Qatar Airways',           country: 'QA' },
  { iata: 'GF', name: 'Gulf Air',                country: 'BH' },
  { iata: 'SV', name: 'Saudia',                  country: 'SA' },
  // Oceania
  { iata: 'QF', name: 'Qantas',                  country: 'AU' },
  { iata: 'VA', name: 'Virgin Australia',        country: 'AU' },
  { iata: 'JQ', name: 'Jetstar Airways',         country: 'AU' },
  { iata: 'NZ', name: 'Air New Zealand',         country: 'NZ' },
  { iata: 'FJ', name: 'Fiji Airways',            country: 'FJ' },
  // North America
  { iata: 'AA', name: 'American Airlines',       country: 'US' },
  { iata: 'DL', name: 'Delta Air Lines',         country: 'US' },
  { iata: 'UA', name: 'United Airlines',         country: 'US' },
  { iata: 'WN', name: 'Southwest Airlines',      country: 'US' },
  { iata: 'B6', name: 'JetBlue',                 country: 'US' },
  { iata: 'AS', name: 'Alaska Airlines',         country: 'US' },
  { iata: 'AC', name: 'Air Canada',              country: 'CA' },
  // Europe
  { iata: 'LH', name: 'Lufthansa',               country: 'DE' },
  { iata: 'BA', name: 'British Airways',         country: 'GB' },
  { iata: 'AF', name: 'Air France',              country: 'FR' },
  { iata: 'KL', name: 'KLM',                     country: 'NL' },
  { iata: 'IB', name: 'Iberia',                  country: 'ES' },
  { iata: 'AZ', name: 'ITA Airways',             country: 'IT' },
  { iata: 'OS', name: 'Austrian Airlines',       country: 'AT' },
  { iata: 'LX', name: 'Swiss',                   country: 'CH' },
  { iata: 'SK', name: 'SAS',                     country: 'SE' },
  { iata: 'TK', name: 'Turkish Airlines',        country: 'TR' },
  { iata: 'FR', name: 'Ryanair',                 country: 'IE' },
  { iata: 'U2', name: 'easyJet',                 country: 'GB' },
  { iata: 'VY', name: 'Vueling',                 country: 'ES' },
  { iata: 'AY', name: 'Finnair',                 country: 'FI' },
  { iata: 'TP', name: 'TAP Air Portugal',        country: 'PT' },
  { iata: 'SU', name: 'Aeroflot',                country: 'RU' },
]

/**
 * Get tail logo image URL — tries avs.io (free, wide coverage)
 */
export function getAirlineLogoUrl(iata) {
  return `https://pics.avs.io/100/100/${iata}.png`
}

/**
 * Get airline record by IATA code
 */
export function getAirlineByIata(iata) {
  return AIRLINES.find(a => a.iata === iata) || null
}
