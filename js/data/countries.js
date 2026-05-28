// ══════════════════════════════════════════════
// Country list — ISO 3166-1 alpha-2 + name
// ══════════════════════════════════════════════

export const COUNTRIES = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' },
  { code: 'BN', name: 'Brunei' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CA', name: 'Canada' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EG', name: 'Egypt' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KR', name: 'South Korea' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'LA', name: 'Laos' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MM', name: 'Myanmar' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Turkey' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VN', name: 'Vietnam' },
]

const _BY_CODE = Object.fromEntries(COUNTRIES.map(c => [c.code, c]))

export function getCountryName(code) {
  return _BY_CODE[code?.toUpperCase()]?.name || code || ''
}

function _flagEmoji(code) {
  if (!code || code.length !== 2) return ''
  const c = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(c)) return ''
  return [...c].map(x => String.fromCodePoint(0x1F1E6 + x.charCodeAt(0) - 65)).join('')
}

/**
 * Show a searchable country picker.
 * @param {string} currentCode  Currently selected ISO-2 code
 * @param {function} onSelect   Callback(code, name)
 */
export function showCountryPicker(currentCode, onSelect) {
  let filtered = COUNTRIES

  const overlay = document.createElement('div')
  overlay.className = 'airline-picker-overlay'
  overlay.style.zIndex = '10010'
  overlay.innerHTML = `
    <div class="airline-picker-topbar">
      <button class="airline-picker-cancel" id="cp-cancel">Cancel</button>
      <div class="airline-picker-title">Select Nationality</div>
      <div style="width:64px"></div>
    </div>
    <div class="airline-picker-search-bar" style="border-top:none;border-bottom:1px solid var(--border)">
      <input class="airline-picker-search" id="cp-search"
             type="text" placeholder="Search country…"
             autocomplete="off" autocorrect="off" autocapitalize="off">
    </div>
    <div class="country-picker-list" id="cp-list">
      ${_countryListHtml(COUNTRIES, currentCode)}
    </div>`
  document.body.appendChild(overlay)

  overlay.querySelector('#cp-cancel').addEventListener('click', () => overlay.remove())

  overlay.querySelector('#cp-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim()
    filtered = q
      ? COUNTRIES.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q)
        )
      : COUNTRIES
    overlay.querySelector('#cp-list').innerHTML = _countryListHtml(filtered, currentCode)
    attachClicks()
  })

  function attachClicks() {
    overlay.querySelectorAll('.country-row').forEach(row => {
      row.addEventListener('click', () => {
        const code = row.dataset.code
        const name = row.dataset.name
        overlay.remove()
        onSelect(code, name)
      })
    })
  }

  attachClicks()
}

function _countryListHtml(countries, currentCode) {
  if (!countries.length) {
    return `<div style="padding:40px 0;text-align:center;color:var(--text-dim)">No countries found</div>`
  }
  return countries.map(c => `
    <div class="country-row ${c.code === currentCode ? 'country-row-selected' : ''}"
         data-code="${c.code}" data-name="${c.name}">
      <span class="country-flag">${_flagEmoji(c.code)}</span>
      <span class="country-name">${c.name}</span>
      <span class="country-code">${c.code}</span>
      ${c.code === currentCode ? '<span class="country-check">✓</span>' : ''}
    </div>`).join('')
}
