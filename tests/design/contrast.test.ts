// AC-6 (12-02): text contrast of at least 4.5 : 1 (WCAG AA, normal text) for every text/background pair of the token
// set, computed from the values in app/globals.css: the light set (the app) and the dark set (the marketing pages).
// Large text and graphic marks on the brand fills are held to 3 : 1 (LARGE_PAIRS). KNOWN_FAILURES would list pairs
// allowed under 4.5 : 1 with their reason; a listed pair that passes fails the test, so the list cannot go stale.
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
  // Brand red and teal as text use their text tokens; --brand / --teal are fills and marks only.
  ['brand-text', 'card'], ['brand-text', 'background'], ['brand-text', 'brand-soft'],
  ['teal-text', 'card'], ['teal-text', 'background'], ['teal-text', 'teal-soft'],
]

// Large text (at least 24 px, or 18.66 px semibold) and graphic marks need 3 : 1 (WCAG 1.4.3 / 1.4.11). White on the
// brand and teal fills occurs only there: the 56 px block badges in components/plan/PlanHeader.tsx (20 px semibold
// race code, "GL") and the tick in the checked race-week checklist box (RaceWeekCard). Both are dashboard-only, and
// the dashboard has no dark set, so these pairs are checked in the light set.
const LARGE_PAIRS: { fg: string; bg: string; sets: (keyof typeof SETS)[] }[] = [
  { fg: 'white', bg: 'brand', sets: ['light'] },
  { fg: 'white', bg: 'teal', sets: ['light'] },
]

// Pairs that may stay under 4.5 : 1, each with its reason. Empty since the text tokens (12-02).
const KNOWN_FAILURES: Record<string, number> = {}

const color = (set: Record<string, Hsl>, name: string) => (name === 'white' ? ([0, 0, 100] as Hsl) : set[name])

function measure() {
  const out: { key: string; ratio: number }[] = []
  for (const [name, set] of Object.entries(SETS)) {
    if (name === 'auto') continue
    for (const [fg, bg] of PAIRS) {
      const a = color(set, fg), b = color(set, bg)
      expect(a, `${name}: --${fg} fehlt`).toBeDefined()
      expect(b, `${name}: --${bg} fehlt`).toBeDefined()
      out.push({ key: `${name} ${fg}/${bg}`, ratio: Math.round(contrast(a, b) * 100) / 100 })
    }
  }
  return out
}

describe('Kontrast der Tokens', () => {
  it('jedes Text/Hintergrund-Paar hat mindestens 4,5 : 1', () => {
    const failing = measure().filter((p) => p.ratio < 4.5 && !(p.key in KNOWN_FAILURES))
    expect(failing.map((p) => `${p.key} ${p.ratio}`)).toEqual([])
  })

  it('die offenen Paare scheitern noch (sonst aus KNOWN_FAILURES streichen)', () => {
    const m = new Map(measure().map((p) => [p.key, p.ratio]))
    expect(Object.keys(KNOWN_FAILURES).filter((k) => !m.has(k) || m.get(k)! >= 4.5)).toEqual([])
  })

  it('große Schrift und Zeichen auf den Markenflächen haben mindestens 3 : 1', () => {
    const failing = LARGE_PAIRS.flatMap(({ fg, bg, sets }) => sets.map((n) => ({ key: `${n} ${fg}/${bg}`, ratio: contrast(color(SETS[n], fg), color(SETS[n], bg)) })))
      .filter((p) => p.ratio < 3)
    expect(failing.map((p) => `${p.key} ${p.ratio.toFixed(2)}`)).toEqual([])
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
