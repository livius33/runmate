// Marketing dictionaries (Phase 6): path prefix decides the locale (/ = de, /en = en). No library for two pages.
import { de, type Dict } from './de'
import { en } from './en'

export type Locale = 'de' | 'en'
export type { Dict }
export const LOCALES: Locale[] = ['de', 'en']
export const DICTS: Record<Locale, Dict> = { de, en }
export const dict = (locale: Locale): Dict => DICTS[locale]

// Every key path of a dictionary, arrays by index ('faq.items.0.q'); the parity test compares de and en with it.
export function keyPaths(v: unknown, prefix = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => keyPaths(x, `${prefix}${i}.`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => keyPaths(x, `${prefix}${k}.`))
  return [prefix.replace(/\.$/, '')]
}
