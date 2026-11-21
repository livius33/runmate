// AC-3 (12-02): components keep to the design tokens: the type scale (named steps, nothing under 12 px), weight up to
// 600, radius up to 12 px, the three elevation levels, colour tokens instead of Tailwind's palette or hex values.
// Two lists: permanent exceptions (each with its reason), and the files not yet moved over, which only shrinks: a
// file on it that is already clean fails the test, so the list cannot go stale.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { RULES, scanSource, type Rule } from './scan'

const ROOT = join(__dirname, '..', '..')

// Permanent: values that cannot be tokens where they live.
const EXCEPTIONS: { file: string; rules: Rule[]; why: string }[] = [
  { file: 'app/layout.tsx', rules: ['hex'], why: 'theme colour of the browser bar: the Viewport API takes a literal colour' },
  { file: 'app/manifest.ts', rules: ['hex'], why: 'web app manifest: theme and background colour must be literals' },
  { file: 'app/(marketing)/_components/og.tsx', rules: ['hex'], why: 'Open Graph image rendered by next/og: inline styles only, no CSS variables' },
  { file: 'components/Logo.tsx', rules: ['hex'], why: 'the logo drawing (same as app/icon.svg)' },
  { file: 'components/plan/CourseMap.tsx', rules: ['hex'], why: 'map internals: Leaflet marker HTML is rendered outside React' },
  { file: 'components/runs/RunMap.tsx', rules: ['hex'], why: 'map internals: Leaflet marker HTML is rendered outside React' },
  { file: 'components/analyse/charts.tsx', rules: ['px-font', 'hex'], why: 'chart internals: SVG axis labels scale with the viewBox; series colours' },
  { file: 'components/analyse/progress-charts.tsx', rules: ['px-font', 'hex'], why: 'chart internals: SVG axis labels scale with the viewBox; series colours' },
  { file: 'components/analyse/LoadBySport.tsx', rules: ['px-font', 'hex'], why: 'chart internals: SVG axis labels scale with the viewBox; series colours' },
]

// Not yet on the tokens (12-02 rollout). Remove a file once it is migrated; never add one.
const NOT_YET_MIGRATED = [
  'app/(dashboard)/plan/anpassen/page.tsx',
  'app/(dashboard)/plan/neu/page.tsx',
  'app/(dashboard)/plan/page.tsx',
  'app/(dashboard)/race/page.tsx',
  'app/(dashboard)/running/activities/[id]/page.tsx',
  'app/(dashboard)/running/activities/page.tsx',
  'app/(dashboard)/season/page.tsx',
  'app/(dashboard)/settings/page.tsx',
  'app/(legal)/agb/page.tsx',
  'app/(legal)/datenschutz/page.tsx',
  'app/(legal)/kuendigen/page.tsx',
  'app/(marketing)/_components/Landing.tsx',
  'app/(marketing)/_components/WaitlistStatus.tsx',
  'app/(marketing)/_components/chrome.tsx',
  'app/(marketing)/_components/panels.tsx',
  'app/(marketing)/_components/sections.tsx',
  'app/(marketing)/methoden/[slug]/page.tsx',
  'app/(marketing)/methoden/page.tsx',
  'app/demo/layout.tsx',
  'app/onboarding/page.tsx',
  'components/HeaderSync.tsx',
  'components/Offline.tsx',
  'components/billing/BillingNotice.tsx',
  'components/billing/Entitlements.tsx',
  'components/legal/CancelForm.tsx',
  'components/legal/Disclaimer.tsx',
  'components/legal/LegalFooter.tsx',
  'components/legal/Template.tsx',
  'components/plan/CourseMap.tsx',
  'components/plan/CrossTrainingLog.tsx',
  'components/plan/EngineSuggestions.tsx',
  'components/plan/NextPlan.tsx',
  'components/plan/PaceCard.tsx',
  'components/plan/PauseControl.tsx',
  'components/plan/PlanChanges.tsx',
  'components/plan/PlanHeader.tsx',
  'components/plan/PredictionCard.tsx',
  'components/plan/RaceStrategy.tsx',
  'components/plan/RaceWeekCard.tsx',
  'components/plan/ReadinessCard.tsx',
  'components/plan/Rebuild.tsx',
  'components/plan/RulesCard.tsx',
  'components/plan/SessionDetails.tsx',
  'components/plan/SessionEditor.tsx',
  'components/plan/TodayCard.tsx',
  'components/plan/TodayFeedback.tsx',
  'components/plan/TrainingSchedule.tsx',
  'components/plan/VolumeCard.tsx',
  'components/plan/WeekEditor.tsx',
  'components/plan/WeekFeedbackOverlay.tsx',
  'components/plan/WeekReview.tsx',
  'components/plan/ui.tsx',
  'components/plan/workshop/Onboarding.tsx',
  'components/runs/Comparison.tsx',
  'components/runs/CrossTrainingList.tsx',
  'components/runs/RaceAnalysis.tsx',
  'components/runs/RunFeedback.tsx',
  'components/runs/RunInsights.tsx',
  'components/runs/RunMap.tsx',
  'components/runs/SplitsChart.tsx',
  'components/runs/StreamCharts.tsx',
  'components/runs/ZonesBar.tsx',
  'components/runs/format.tsx',
  'components/settings/BillingCard.tsx',
  'components/settings/CalendarCard.tsx',
  'components/settings/GarminSource.tsx',
  'components/settings/HealthCard.tsx',
  'components/settings/HealthConsentCard.tsx',
  'components/settings/ImportCard.tsx',
  'components/settings/MyDataCard.tsx',
  'components/settings/ProfileCard.tsx',
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' || f.startsWith('.') ? [] : files(p)
    return /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

const findings = ['app', 'components'].flatMap((d) => files(join(ROOT, d)))
  .flatMap((p) => scanSource(relative(ROOT, p), readFileSync(p, 'utf8')))
const excused = (file: string, rule: Rule) => EXCEPTIONS.some((e) => e.file === file && e.rules.includes(rule))
const open = findings.filter((f) => !excused(f.file, f.rule))

describe('Design-Tokens', () => {
  it('migrierte Dateien halten sich an die Tokens', () => {
    const pending = new Set(NOT_YET_MIGRATED)
    expect(open.filter((f) => !pending.has(f.file)).map((f) => `${f.file}:${f.line} ${f.text} (${RULES[f.rule].why})`)).toEqual([])
  })

  it('die Liste der offenen Dateien ist aktuell (eine saubere Datei wird gestrichen)', () => {
    const dirty = new Set(open.map((f) => f.file))
    expect(NOT_YET_MIGRATED.filter((f) => !dirty.has(f)).map((f) => `${f} ist sauber: aus NOT_YET_MIGRATED streichen`)).toEqual([])
    expect(new Set(NOT_YET_MIGRATED).size).toBe(NOT_YET_MIGRATED.length)
  })

  it('jede Ausnahme wird noch gebraucht', () => {
    const stale = EXCEPTIONS.flatMap((e) => e.rules
      .filter((r) => !existsSync(join(ROOT, e.file)) || !findings.some((f) => f.file === e.file && f.rule === r))
      .map((r) => `${e.file} braucht die Ausnahme ${r} nicht mehr`))
    expect(stale).toEqual([])
  })

  it('der Scanner erkennt Werte außerhalb der Tokens (Selbsttest)', () => {
    const src = [
      '<p className="text-[11px] text-amber-700">',
      '<div className="rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,.1)]">',
      "const c = '#E5484D'",
      '<b className="font-bold text-sm">',
      '// PR #119, see https://example.com/#abc',
      '<p className="text-caption text-body-sm rounded-card shadow-raised bg-teal-soft text-warning rounded-lg">',
      '<a href="#datenquellen" className="sm:text-title lg:rounded-dialog">',
      "fetch('https://example.com/a') // #fff in a comment",
    ].join('\n')
    expect(scanSource('x.tsx', src).map((f) => [f.line, f.rule])).toEqual([
      [1, 'px-font'], [1, 'palette'], [2, 'radius'], [2, 'shadow'], [3, 'hex'], [4, 'type-scale'], [4, 'weight'],
    ])
  })
})
