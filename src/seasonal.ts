import { Snowfall } from 'falling-snow'

const STORAGE_KEY = 'seasonal_override_date'

let snow: Snowfall | null = null

function getOverrideDate(): Date | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (!v) return null
    const d = new Date(v)
    if (isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

export function setOverrideDate(date: string | null): void {
  try {
    if (date) localStorage.setItem(STORAGE_KEY, date)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function getEffectiveDate(): Date {
  return getOverrideDate() ?? new Date()
}

export function isSeasonalActive(date: Date = getEffectiveDate()): boolean {
  const m = date.getMonth() // 0-based
  const day = date.getDate()
  // Dec 1 -> Jan 1 (inclusive)
  if (m === 11 && day >= 1) return true // December
  if (m === 0 && day <= 1) return true // January 1
  return false
}

export function startSnow(container?: HTMLElement | string): void {
  if (snow) return
  try {
    snow = new Snowfall({
      container,
      count: 120,
      speed: 0.8,
      wind: 0.3,
      size: [2, 12],
      opacity: [0.3, 0.9],
      depth: 0.8,
      zIndex: 9998,
      autoStart: true
    })
    // Ne pas bloquer les clics
    if (snow && (snow as any).canvas) {
      (snow as any).canvas.style.pointerEvents = 'none'
    }
  } catch (err) {
    console.warn('Snowfall init failed:', err)
  }
}

export function stopSnow(): void {
  try {
    snow?.destroy()
  } catch {
    // ignore
  }
  snow = null
}

export function isDevMode(): boolean {
  return import.meta.env.DEV === true
}