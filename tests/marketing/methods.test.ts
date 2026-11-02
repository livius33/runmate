// AC-6 (Phase 6): one page per methodology template, with its text, sources and a sample week from the real generator.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { methodCatalogue, sampleWeek } from '@/lib/marketing/methods'
import { parseBlocks, Markdown } from '@/lib/marketing/markdown'
import MethodPage, { generateStaticParams, generateMetadata } from '@/app/(marketing)/methoden/[slug]/page'

describe('Methoden-Seiten', () => {
  const valid = listMethodologies().valid

  it('genau die gültigen Vorlagen (kein README, keine eigenen Basen, keine Forschungsnotizen)', () => {
    expect(generateStaticParams().map((p) => p.slug)).toEqual(valid.map((m) => m.id))
    expect(generateStaticParams().map((p) => p.slug)).not.toContain('README')
    expect(generateStaticParams().some((p) => p.slug.startsWith('runmate-own'))).toBe(false)
  })

  it('Beispielwoche vom echten Generator: 7 Tage, Schlüsseleinheiten, Summe stimmt', () => {
    for (const m of methodCatalogue()) {
      const w = m.week!
      expect(w, m.id).not.toBeNull()
      expect(w.days).toHaveLength(7)
      expect(w.days.some((d) => d.key), m.id).toBe(true)
      expect(w.days.filter((d) => d.type === 'long')).toHaveLength(1)
      expect(Math.abs(w.km - w.days.reduce((a, d) => a + d.km, 0))).toBeLessThanOrEqual(0.5)
      expect(w.phase).toBe('Aufbau')
    }
    // deterministic: same template, same week
    expect(sampleWeek(valid[0])).toEqual(sampleWeek(valid[0]))
  })

  it('Seite zeigt Name, Zusammenfassung, Text, Quellen und Werte', async () => {
    for (const m of methodCatalogue()) {
      const html = renderToStaticMarkup(await MethodPage({ params: Promise.resolve({ slug: m.id }) }))
      expect(html).toContain(m.name.replace(/'/g, '&#x27;'))
      expect(html).toContain('Quellen')
      expect(html).toContain('Läufe pro Woche')
      for (const s of m.sources) expect(html).toContain(s.author.replace(/'/g, '&#x27;').replace(/&(?!#)/g, '&amp;'))
      expect(html).toContain('<h2')
      const meta = await generateMetadata({ params: Promise.resolve({ slug: m.id }) })
      expect(meta.alternates?.canonical).toMatch(new RegExp(`/methoden/${m.id}$`))
    }
  })

  it('Markdown: Überschriften, Absätze, Listen mit Folgezeilen, kein HTML aus der Vorlage', () => {
    const md = '## Idee\n\nEin **fetter** und *kursiver* Satz\nüber zwei Zeilen.\n\n- eins\n  weiter\n- zwei\n\n1. a\n2. b\n\n<script>alert(1)</script>'
    expect(parseBlocks(md)).toEqual([
      { kind: 'h2', text: 'Idee' },
      { kind: 'p', text: 'Ein **fetter** und *kursiver* Satz über zwei Zeilen.' },
      { kind: 'ul', items: ['eins weiter', 'zwei'] },
      { kind: 'ol', items: ['a', 'b'] },
      { kind: 'p', text: '<script>alert(1)</script>' },
    ])
    const html = renderToStaticMarkup(Markdown({ source: md }))
    expect(html).toContain('<strong')
    expect(html).toContain('<em>kursiver</em>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
