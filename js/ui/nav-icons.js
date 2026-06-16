// Shared bottom navigation icons.
// Keep icons stroke-only so active/inactive state follows currentColor.

const ICONS = {
  dashboard: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5"></rect>
      <rect x="14" y="4" width="6" height="6" rx="1.5"></rect>
      <rect x="4" y="14" width="6" height="6" rx="1.5"></rect>
      <rect x="14" y="14" width="6" height="6" rx="1.5"></rect>
    </svg>`,
  list: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.8 19.2 16 11l3.5-3.5c1-1 1.3-2.4.6-3.1-.7-.7-2.1-.4-3.1.6L13.5 8.5 5.3 6.7 4 8l6.5 3.5L7 15l-3-.5-1 1 3 2 2 3 1-1-.5-3 3.5-3.5 3.5 6.5z"></path>
    </svg>`,
  roster: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2"></rect>
      <path d="M8 3v4M16 3v4M4 10h16"></path>
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"></path>
    </svg>`,
  settings: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"></path>
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 0 1-2.83 2.83l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2 2 0 0 1-4 0v-.06a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.1H3a2 2 0 0 1 0-4h.06A1.8 1.8 0 0 0 4.7 8.8a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04A1.8 1.8 0 0 0 9.15 4.3a1.8 1.8 0 0 0 1.1-1.65V3a2 2 0 0 1 4 0v.06a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1H21a2 2 0 0 1 0 4h-.06A1.8 1.8 0 0 0 19.4 15z"></path>
    </svg>`,
}

export function navIcon(id) {
  return ICONS[id] || ''
}
