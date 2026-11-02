// AC-7 (Phase 6): the sitemap lists every public page (incl. each methodology) and nothing of the app; robots and
// hreflang alternates point at the same canonical origin.
import { describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { alternates, siteUrl } from '@/lib/marketing/site'

describe('Sitemap und robots', () => {
  const entries = sitemap()
  const urls = entries.map((e) => e.url)
  const base = siteUrl()

  it('Landing- und Preisseite in de und en, Methoden-Übersicht, Rechtstexte', () => {
    for (const p of ['/', '/en', '/preise', '/en/pricing', '/methoden', '/impressum', '/datenschutz', '/agb']) expect(urls).toContain(`${base}${p}`)
  })

  it('jede Methoden-Vorlage hat einen Eintrag', () => {
    const ids = listMethodologies().valid.map((m) => m.id)
    expect(ids.length).toBeGreaterThanOrEqual(8)
    for (const id of ids) expect(urls).toContain(`${base}/methoden/${id}`)
    expect(urls.some((u) => /\/methoden\/(README|research|own)/i.test(u))).toBe(false)
  })

  it('nichts aus der App, der API oder der Warteliste; keine Dubletten', () => {
    expect(urls.filter((u) => /\/(plan|running|season|race|settings|api|sign-in|sign-up|warteliste|demo)(\/|$)/.test(u.slice(base.length)))).toEqual([])
    expect(new Set(urls).size).toBe(urls.length)
    for (const e of entries) expect(e.priority!).toBeLessThanOrEqual(1)
  })

  it('de/en-Seiten tragen beide Sprachversionen', () => {
    const home = entries.find((e) => e.url === `${base}/en`)!
    expect(home.alternates?.languages).toEqual({ de: `${base}/`, en: `${base}/en` })
  })

  it('hreflang: de, en und x-default (de); kanonisch je Sprache', () => {
    expect(alternates('home', 'en')).toEqual({ canonical: `${base}/en`, languages: { de: `${base}/`, en: `${base}/en`, 'x-default': `${base}/` } })
    expect(alternates('pricing', 'de')?.canonical).toBe(`${base}/preise`)
  })

  it('robots: Marketing offen, App und API gesperrt, Sitemap verlinkt', () => {
    const r = robots()
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules
    expect(rule.allow).toContain('/')
    for (const p of ['/api/', '/plan', '/settings', '/sign-in']) expect(rule.disallow).toContain(p)
    expect(r.sitemap).toBe(`${base}/sitemap.xml`)
  })
})
