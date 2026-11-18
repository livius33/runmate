// AC-5 (Phase 6): de and en have the same keys at every depth, no empty texts, and honest copy.
import { describe, expect, it } from 'vitest'
import { de } from '@/lib/i18n/de'
import { en } from '@/lib/i18n/en'
import { keyPaths } from '@/lib/i18n'

const leaves = (v: unknown, p = ''): [string, unknown][] =>
  Array.isArray(v) ? v.flatMap((x, i) => leaves(x, `${p}${i}.`))
    : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => leaves(x, `${p}${k}.`)) : [[p.slice(0, -1), v]]

describe('Wörterbücher de/en', () => {
  it('gleiche Schlüssel in gleicher Reihenfolge, auch in Listen', () => {
    expect(keyPaths(en)).toEqual(keyPaths(de))
    expect(keyPaths(de).length).toBeGreaterThan(100)
  })

  it('jeder Text ist ein nicht leerer String (Ausnahme: der Hinweis zur App-Sprache auf Deutsch)', () => {
    for (const [dict, name] of [[de, 'de'], [en, 'en']] as const) {
      for (const [k, v] of leaves(dict)) {
        expect(typeof v, `${name}.${k}`).toBe('string')
        if (!(name === 'de' && k === 'hero.appLanguage')) expect((v as string).trim(), `${name}.${k}`).not.toBe('')
      }
    }
    expect(de.locale).toBe('de')
    expect(en.locale).toBe('en')
  })

  it('ehrlich: Garmin-Login inoffiziell und experimentell, EU, Export/Löschen, kein Medizinprodukt', () => {
    const faqDe = de.faq.items.map((f) => f.a).join(' ')
    const faqEn = en.faq.items.map((f) => f.a).join(' ')
    for (const s of ['experimentell', 'kein offizieller Zugang', 'EU', 'exportieren', 'löschen', 'kein Medizinprodukt']) expect(faqDe).toContain(s)
    for (const s of ['experimental', 'not an official API', 'EU', 'export', 'delete', 'not a medical device']) expect(faqEn).toContain(s)
  })

  it('keine erfundenen Nutzerzahlen, Bewertungen oder Sterne', () => {
    for (const dict of [de, en]) {
      const all = leaves(dict).map(([, v]) => String(v)).join(' ')
      expect(all).not.toMatch(/\d[\d.,]*\s*(\+\s*)?(Nutzer|Läufer|users|runners|Sterne|stars|Bewertungen|reviews)\b/i)
      expect(all).not.toMatch(/★/)
    }
  })

  // Phase 9, AC-6
  it('Preise wie beschlossen: Kostenlos 0 €, Plus 9 €/79 €, Selbst hosten 0 €, 30 Tage Plus ohne Karte, danach kostenlos', () => {
    expect([de.pricing.free.price, de.pricing.plus.month, de.pricing.plus.year, de.pricing.selfHost.price]).toEqual(['0 €', '9 €', '79 €', '0 €'])
    expect([en.pricing.free.price, en.pricing.plus.month, en.pricing.plus.year, en.pricing.selfHost.price]).toEqual(['€0', '€9', '€79', '€0'])
    expect([de.pricing.free.name, en.pricing.free.name]).toEqual(['Kostenlos', 'Free'])
    expect(de.pricing.trial).toContain('30 Tage')
    expect(de.pricing.trial).toContain('ohne Karte')
    expect(de.pricing.trial).toContain('kostenlos weiter')
    expect(en.pricing.trial).toContain('for free')
  })

  it('kein früherer Tarif oder Preis mehr in den Texten', () => {
    for (const dict of [de, en]) {
      const all = leaves(dict).map(([, v]) => String(v)).join(' ')
      expect(all).not.toMatch(/\bBasic\b/)
      expect(all).not.toMatch(/(^|[^\d])(6|59|10|99)\s€|€(6|59|10|99)(?!\d)/)
    }
  })
})
