export type ThemeId = 'spectre' | 'pure-dark' | 'pink' | 'green'

export const THEMES: {
  id: ThemeId
  label: string
  description: string
  swatch: string
  bg: string
}[] = [
  {
    id: 'spectre',
    label: 'Dark Purple',
    description: 'Default SPECTRE ops palette',
    swatch: '#7c3aed',
    bg: '#07070f',
  },
  {
    id: 'pure-dark',
    label: 'Pure Dark',
    description: 'Neutral blacks and grays, no accent tint',
    swatch: '#e5e5e5',
    bg: '#0a0a0a',
  },
  {
    id: 'pink',
    label: 'Dark Pink',
    description: 'Neon pink accent on void black',
    swatch: '#db2777',
    bg: '#0a070c',
  },
  {
    id: 'green',
    label: 'Dark Green',
    description: 'Terminal green brutalist variant',
    swatch: '#22c55e',
    bg: '#070f0a',
  },
]

export const THEME_STORAGE_KEY = 'spectre-theme'

const VALID_THEMES: ThemeId[] = ['spectre', 'pure-dark', 'pink', 'green']

export function resolveTheme(value?: string | null): ThemeId {
  if (VALID_THEMES.includes(value as ThemeId)) return value as ThemeId
  return 'spectre'
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id
  localStorage.setItem(THEME_STORAGE_KEY, id)
}

export function getStoredTheme(): ThemeId | null {
  const value = localStorage.getItem(THEME_STORAGE_KEY)
  return VALID_THEMES.includes(value as ThemeId) ? (value as ThemeId) : null
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function getXtermTheme() {
  const bg = cssVar('--bg-deep', '#07070f')
  return {
    background: bg,
    foreground: cssVar('--text-primary', '#e2e8f0'),
    cursor: cssVar('--purple-bright', '#a78bfa'),
    cursorAccent: bg,
    selectionBackground: cssVar('--selection-bg', 'rgba(124, 58, 237, 0.3)'),
    black: cssVar('--bg-surface', '#0d0d1a'),
    red: cssVar('--red-alert', '#ff2d55'),
    green: cssVar('--green-term', '#39ff14'),
    yellow: cssVar('--amber-warn', '#ffb700'),
    blue: cssVar('--blue-info', '#3b82f6'),
    magenta: cssVar('--purple-bright', '#a78bfa'),
    cyan: cssVar('--cyan-data', '#00ffff'),
    white: cssVar('--text-primary', '#e2e8f0'),
    brightBlack: cssVar('--text-muted', '#4a5568'),
    brightMagenta: cssVar('--purple-glow', '#c4b5fd'),
  }
}
