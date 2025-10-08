const KEY = 'korekushon.theme'
const AVATAR_KEY = 'korekushon.avatarUrl'

export type Theme = 'light' | 'dark' | 'system'

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null

export function getSavedTheme(): Theme {
  const saved = (localStorage.getItem(KEY) || '').toLowerCase() as Theme
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

function computeAppliedTheme(saved: Theme): Exclude<Theme, 'system'> {
  if (saved !== 'system') return saved
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

function attachMediaListener() {
  if (mediaListener) return
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mediaListener = (e: MediaQueryListEvent) => {
    const saved = getSavedTheme()
    if (saved === 'system') {
      const applied = e.matches ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', applied)
    }
  }
  mq.addEventListener('change', mediaListener)
}

function detachMediaListener() {
  if (!mediaListener) return
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.removeEventListener('change', mediaListener)
  mediaListener = null
}

export function setTheme(saved: Theme) {
  localStorage.setItem(KEY, saved)
  const applied = computeAppliedTheme(saved)
  document.documentElement.setAttribute('data-theme', applied)
  if (saved === 'system') attachMediaListener()
  else detachMediaListener()
  // notify consumers
  try { document.dispatchEvent(new CustomEvent('app:theme-changed', { detail: { saved, applied } })) } catch { void 0 }
}

export function getTheme(): Exclude<Theme, 'system'> {
  return computeAppliedTheme(getSavedTheme())
}

export function applyTheme(theme: Exclude<Theme, 'system'>) {
  // backward compatible API: explicitly apply light/dark and persist
  localStorage.setItem(KEY, theme)
  document.documentElement.setAttribute('data-theme', theme)
  detachMediaListener()
  try { document.dispatchEvent(new CustomEvent('app:theme-changed', { detail: { saved: theme, applied: theme } })) } catch { void 0 }
}

export function toggleTheme() {
  const next: Exclude<Theme, 'system'> = getTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

export function initTheme() {
  setTheme(getSavedTheme())
}

export function setAvatarUrl(url: string) {
  try { localStorage.setItem(AVATAR_KEY, url) } catch { /* ignore storage errors */ }
}

export function getAvatarUrl(): string | null {
  try { return localStorage.getItem(AVATAR_KEY) } catch { return null }
}

export function clearAvatarUrl() {
  try { localStorage.removeItem(AVATAR_KEY) } catch { /* ignore */ }
  try { document.dispatchEvent(new CustomEvent('app:avatar-updated', { detail: { url: null } })) } catch { /* ignore */ }
}
