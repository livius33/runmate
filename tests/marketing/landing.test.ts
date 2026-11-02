// AC-2/3/4/9/10 (Phase 6): the landing page renders every section with honest copy, without Clerk or React Query, is
// static, and its routes are public.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { de } from '@/lib/i18n/de'
import { en } from '@/lib/i18n/en'
import { Landing } from '@/app/(marketing)/_components/Landing'
import { DISCLAIMER_TEXT } from '@/components/legal/Disclaimer'

const ROOT = join(__dirname, '..', '..')
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const files = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const p = join(dir, f)
  return statSync(join(ROOT, p)).isDirectory() ? files(p) : [p]
})
const render = (t = de) => renderToStaticMarkup(createElement(Landing, { t }))
const text = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

afterEach(() => vi.unstubAllEnvs())

describe('Landing page', () => {
  it('alle Abschnitte des Plans, auf Deutsch', () => {
    const html = render()
    for (const s of [de.hero.line1, de.hero.line2, de.open.title, de.how.title, de.methods.title, de.engine.title, de.insights.title, de.race.title, de.pricing.title, de.faq.title, de.final.title]) expect(html).toContain(text(s))
    for (const id of ['id="methoden"', 'id="anpassung"', 'id="preise"', 'id="faq"', 'id="warteliste"']) expect(html).toContain(id)
    expect(html).toContain(text(DISCLAIMER_TEXT))
    expect(html).toContain('Beispieldaten')
    for (const p of ['/impressum', '/datenschutz', '/agb', '/kuendigen']) expect(html).toContain(`href="${p}"`)
  })

  it('englisch: eigenes Wörterbuch, Sprachwechsel zurück', () => {
    const html = render(en)
    expect(html).toContain(text(en.hero.line1))
    expect(html).toContain(text(en.faq.items[1].a))
    expect(html).toMatch(/<a[^>]*hreflang="de"[^>]*href="\/"|<a[^>]*href="\/"[^>]*hreflang="de"/i)
    expect(src('app/(marketing)/en/page.tsx')).toContain('lang="en"')
  })

  it('JSON-LD SoftwareApplication mit drei Angeboten in EUR', () => {
    const json = render().match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]
    const data = JSON.parse(json)
    expect(data['@type']).toBe('SoftwareApplication')
    expect(data.offers.map((o: { price: string; priceCurrency: string }) => `${o.price} ${o.priceCurrency}`)).toEqual(['0 EUR', '6 EUR', '10 EUR'])
  })

  it('ohne Abrechnung: Warteliste als Formular; mit BILLING_ENABLED: Link zur Anmeldung, kein Formular', () => {
    const off = render()
    expect(off).toContain('action="/api/waitlist"')
    expect(off).toContain('name="website"')
    expect(off).not.toContain('href="/sign-up"')
    vi.stubEnv('BILLING_ENABLED', '1')
    const on = render()
    expect(on).toContain('href="/sign-up"')
    expect(on).not.toContain('action="/api/waitlist"')
    expect(on).toContain(text(de.cta.trial))
  })

  it('keine GitHub-Links und keine Sterne, solange kein Repo gesetzt ist; mit Repo der Link', () => {
    expect(render()).not.toMatch(/github\.com|★/)
    vi.stubEnv('NEXT_PUBLIC_REPO_URL', 'https://github.com/example/runmate')
    expect(render()).toContain('href="https://github.com/example/runmate"')
  })

  it('Analytics nur mit NEXT_PUBLIC_VERCEL_ANALYTICS, cookielos über das Vercel-Skript', () => {
    expect(render()).not.toContain('/_vercel/insights/script.js')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ANALYTICS', '1')
    const html = render()
    expect(html).toContain('/_vercel/insights/script.js')
    expect(html).toContain('data-track="cta_waitlist"')
  })

  it('Marketing-Code lädt weder Clerk noch React Query und ist statisch', () => {
    for (const f of files('app/(marketing)')) {
      const s = src(f)
      expect(s, f).not.toMatch(/@clerk|@tanstack|'use client'/)
      if (f.endsWith('page.tsx') || f.endsWith('opengraph-image.tsx')) expect(s, f).toContain("dynamic = 'force-static'")
    }
    expect(src('app/layout.tsx')).not.toMatch(/Providers|@tanstack/)
    expect(src('app/(dashboard)/layout.tsx')).toContain('<Providers>')
  })

  it('öffentlich in der Middleware; angemeldet geht / zu /plan', () => {
    const mw = src('middleware.ts')
    for (const p of ['/', '/en(.*)', '/preise', '/methoden(.*)', '/warteliste(.*)', '/api/waitlist(.*)', '/sitemap.xml', '/robots.txt', '/opengraph-image(.*)', '/demo(.*)', '/sign-up(.*)']) expect(mw).toContain(`'${p}'`)
    expect(mw).toMatch(/pathname === '\/'[\s\S]{0,200}new URL\('\/plan'/)
  })

  it('Dashboard-Startseite unter /plan; Navigation, Manifest und Service Worker zeigen dorthin', () => {
    expect(() => statSync(join(ROOT, 'app/(dashboard)/page.tsx'))).toThrow()
    expect(statSync(join(ROOT, 'app/(dashboard)/plan/page.tsx')).isFile()).toBe(true)
    expect(src('components/AppHeader.tsx')).not.toMatch(/href: '\/'[,\s]/)
    expect(src('app/manifest.ts')).toContain("start_url: '/plan'")
    expect(src('public/sw.js')).not.toMatch(/c\.add\('\/'\)|fromCache\(request, '\/'\)/)
  })

  it('Dunkle Tokens nur unter .dark bzw. .theme-auto, :root bleibt hell', () => {
    const css = src('app/globals.css')
    const root = css.match(/:root \{([\s\S]*?)\}/)![1]
    expect(root).toContain('--background: 220 14% 96%')
    expect(css).toMatch(/\.dark \{[\s\S]*--background: 222 22% 8%/)
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*\.theme-auto, :root:has\(\.theme-auto\)/)
    expect(src('app/(marketing)/layout.tsx')).toContain('theme-auto')
  })
})
