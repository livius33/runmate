// AC-6 (12-02): text contrast of at least 4.5 : 1 (WCAG AA, normal text) for every text/background pair of the token
// set, computed from the values in app/globals.css: the light set (the app) and the dark set (the marketing pages).
// Pairs that fail with today's brand colours wait for a decision (KNOWN_FAILURES, with the measured ratio); the test
// fails when a new pair fails, and when a listed pair passes (so the list cannot go stale).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8')

type Hsl = [number, number, number]
function tokens(selector: RegExp): Record<string, Hsl> {
  const block = css.match(selector)?.[1]
  if (!block) throw new Error(`no block for ${selector}`)
  const out: Record<string, Hsl> = {}
  for (const m of block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) out[m[1]] = [+m[2], +m[3], +m[4]]
  return out
}
const SETS = {
  light: tokens(/:root\s*\{([^}]*)\}/),
  dark: tokens(/\.dark\s*\{([^}]*)\}/),
  auto: tokens(/\.theme-auto, :root:has\(\.theme-auto\)\s*\{([^}]*)\}/),   // the marketing pages when the system is dark
}

function rgb([h, s, l]: Hsl) {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))
}
const lum = (c: Hsl) => {
  const [r, g, b] = rgb(c).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: Hsl, b: Hsl) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

// Text token on background token, as the components use them. 'white' is literal white text on a fill.
const PAIRS: [string, string][] = [
  ['foreground', 'background'], ['foreground', 'card'], ['foreground', 'secondary'], ['foreground', 'accent'],
  ['card-foreground', 'card'], ['popover-foreground', 'popover'], ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'], ['accent-foreground', 'accent'], ['destructive-foreground', 'destructive'],
  ['muted-foreground', 'background'], ['muted-foreground', 'card'], ['muted-foreground', 'muted'],
  ['error', 'background'], ['error', 'card'],
  ['warning', 'warning-soft'], ['warning', 'card'], ['warning', 'background'],
  ['brand', 'card'], ['brand', 'background'], ['brand', 'brand-soft'],
  ['teal', 'card'], ['teal', 'background'], ['teal', 'teal-soft'],
  ['white', 'brand'], ['white', 'teal'],
]

// Measured on 2026-11-21 with today's brand colours; reported to Livius, not changed silently (see 12-02 summary).
const KNOWN_FAILURES: Record<string, number> = {
  'light brand/card': 3.92, 'light brand/background': 3.57, 'light brand/brand-soft': 3.43,
  'light teal/card': 3.32, 'light teal/background': 3.02, 'light teal/teal-soft': 3.0,
  'light white/brand': 3.92, 'light white/teal': 3.32,
  'dark destructive-foreground/destructive': 4.27, 'dark brand/brand-soft': 4.17, 'dark teal/teal-soft': 4.43,
  'dark white/brand': 3.7, 'dark white/teal': 2.96,
}

function measure() {
  const out: { key: string; ratio: number }[] = []
  for (const [name, set] of Object.entries(SETS)) {
    if (name === 'auto') continue
    for (const [fg, bg] of PAIRS) {
      const a = fg === 'white' ? ([0, 0, 100] as Hsl) : set[fg], b = set[bg]
      expect(a, `${name}: --${fg} fehlt`).toBeDefined()
      expect(b, `${name}: --${bg} fehlt`).toBeDefined()
      out.push({ key: `${name} ${fg}/${bg}`, ratio: Math.round(contrast(a, b) * 100) / 100 })
    }
  }
  return out
}

describe('Kontrast der Tokens', () => {
  it('jedes Text/Hintergrund-Paar hat mindestens 4,5 : 1 (bis auf die offenen Markenfarben)', () => {
    const failing = measure().filter((p) => p.ratio < 4.5 && !(p.key in KNOWN_FAILURES))
    expect(failing.map((p) => `${p.key} ${p.ratio}`)).toEqual([])
  })

  it('die offenen Paare scheitern noch (sonst aus KNOWN_FAILURES streichen)', () => {
    const m = new Map(measure().map((p) => [p.key, p.ratio]))
    expect(Object.keys(KNOWN_FAILURES).filter((k) => !m.has(k) || m.get(k)! >= 4.5)).toEqual([])
  })

  it('der dunkle Satz der Marketing-Seiten ist derselbe wie .dark', () => {
    expect(SETS.auto).toEqual(SETS.dark)
  })

  it('rechnet wie WCAG (Selbsttest)', () => {
    expect(contrast([0, 0, 0], [0, 0, 100])).toBeCloseTo(21, 5)
    expect(contrast([0, 0, 100], [0, 0, 100])).toBeCloseTo(1, 5)
    expect(contrast([0, 0, 46.27], [0, 0, 100])).toBeCloseTo(4.54, 1)  // #767676 on white
  })
})
