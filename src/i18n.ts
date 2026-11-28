import logger from 'electron-log/renderer'
import enLocale from '../public/locales/en.json'
import frLocale from '../public/locales/fr.json'

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

const BUNDLED: Record<string, Record<string, string>> = {
  en: enLocale as Record<string, string>,
  fr: frLocale as Record<string, string>
}

async function loadLocale(locale: Locale): Promise<Record<string, string>> {
  const paths = [`./locales/${locale}.json`, `/locales/${locale}.json`]
  for (const p of paths) {
    try {
      const res = await fetch(p)
      if (!res.ok) continue
      const data = await res.json()
      if (data && typeof data === 'object' && Object.keys(data).length > 0) return data
    } catch (err) {
      logger.warn(`Failed to load locale ${locale} from ${p}:`, err)
    }
  }
  if (BUNDLED[locale]) return BUNDLED[locale]
  return {}
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