import logger from 'electron-log/renderer'

export type Locale = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh' | 'ru'

const SUPPORTED: Locale[] = ['fr', 'en', 'es', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru']

let currentLocale: Locale = 'en'
let messages: Record<string, string> = {}
let fallback: Record<string, string> = {}

function normalizeLocale(tag: string | null | undefined): Locale {
  if (!tag) return 'en'
  const base = tag.toLowerCase().split(/[-_]/)[0]
  return (SUPPORTED.includes(base as Locale) ? base : 'en') as Locale
}

async function loadLocale(locale: Locale): Promise<Record<string, string>> {
  try {
    const res = await fetch(`/locales/${locale}.json`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    logger.warn(`Failed to load locale ${locale}:`, err)
    return {}
  }
}

export async function initI18n(preferred?: string): Promise<Locale> {
  let tag = preferred
  if (!tag) {
    try {
      tag = navigator.language
    } catch {
      tag = 'en'
    }
    // Try to get OS locale from main process if available
    try {
      const { system } = await import('./ipc')
      const info = await system.getInfo()
      if (info?.locale) tag = info.locale
    } catch {
      // ignore
    }
  }
  currentLocale = normalizeLocale(tag)
  fallback = await loadLocale('en')
  if (currentLocale !== 'en') {
    messages = await loadLocale(currentLocale)
  } else {
    messages = fallback
    fallback = {}
  }
  document.documentElement.lang = currentLocale
  return currentLocale
}

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

export function t(key: string, params?: Record<string, string | number>): string {
  let str = messages[key] ?? fallback[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}

export function isLocaleSupported(tag: string): boolean {
  return SUPPORTED.includes(normalizeLocale(tag))
}