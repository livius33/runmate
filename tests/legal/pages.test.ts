// AC-9 (Phase 4): the legal pages render without a session or Clerk, carry the review banner and visible
// placeholders, and are public in the middleware.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REVIEW_NOTE } from '@/components/legal/Template'
import { DISCLAIMER_TEXT } from '@/components/legal/Disclaimer'

const ROOT = join(__dirname, '..', '..')

const pages = {
  impressum: (await import('@/app/(legal)/impressum/page')).default,
  datenschutz: (await import('@/app/(legal)/datenschutz/page')).default,
  agb: (await import('@/app/(legal)/agb/page')).default,
}

describe('Rechtstexte', () => {
  for (const [name, Page] of Object.entries(pages)) {
    it(`${name}: Prüfhinweis und Platzhalter statt erfundener Angaben`, () => {
      const html = renderToStaticMarkup(createElement(Page))
      expect(html).toContain(REVIEW_NOTE)
      expect(html).toContain('[PLATZHALTER: ')
      expect(html).not.toMatch(/liviusdegraaf|Livius|Hamburg/i)
    })
  }

  it('Datenschutz nennt die Auftragsverarbeiter, Art. 9 und die Rechte', () => {
    const html = renderToStaticMarkup(createElement(pages.datenschutz))
    for (const s of ['Vercel', 'Neon', 'Frankfurt', 'Clerk', 'Paddle', 'Garmin', 'Art. 9', 'Art. 20', 'Art. 77', 'widerrufen']) expect(html).toContain(s)
  })

  it('AGB: Testphase, Widerrufsbelehrung mit Muster-Formular, Kündigungsbutton, kein Medizinprodukt', () => {
    const html = renderToStaticMarkup(createElement(pages.agb))
    for (const s of ['30 Tagen', 'Widerrufsrecht', 'Muster-Widerrufsformular', 'Verträge hier kündigen', 'vierzehn Tage', DISCLAIMER_TEXT.slice(0, 60)]) expect(html).toContain(s)
  })

  it('öffentlich: Middleware lässt die Seiten, die Kündigung und die Webhooks ohne Anmeldung durch', () => {
    const mw = readFileSync(join(ROOT, 'middleware.ts'), 'utf8')
    for (const p of ['/impressum', '/datenschutz', '/agb', '/kuendigen', '/api/billing/webhook', '/api/billing/cancel-request', '/api/webhooks/(.*)']) expect(mw).toContain(`'${p}'`)
  })

  it('kein Clerk auf den öffentlichen Seiten: ClerkProvider nur im Dashboard- und Anmelde-Layout', () => {
    const src = (p: string) => readFileSync(join(ROOT, p), 'utf8')
    expect(src('app/layout.tsx')).not.toMatch(/import .*ClerkProvider/)
    expect(src('app/(legal)/layout.tsx')).not.toMatch(/@clerk/)
    expect(src('app/(dashboard)/layout.tsx')).toMatch(/<ClerkProvider>/)
    expect(src('app/sign-in/layout.tsx')).toMatch(/<ClerkProvider>/)
  })
})
