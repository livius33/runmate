// Lauf-Analyse: a short, rated verdict per run — plan fit, intensity, HR drift, comparison.
// Pure and rule-based; thresholds for HR come from the one HR model.
import { HR_ZONES, blockHrCap } from '@/lib/analytics/hr'
import type { RunMetrics, RunType } from '@/lib/analytics/run-metrics'
import { raceOf } from '@/lib/plan/blocks'
import { type PlanSession } from '@/lib/plan/types'
import { fmtPace, paceToS } from '@/lib/plan/format'
import { ATHLETE } from '@/lib/athlete'
import { dayLabel } from '@/lib/plan/effective'
import { checkPace, type PaceRun } from '@/lib/plan/pace-check'

const EASY_OK = 0.10          // share of time above Z2 that still counts as easy
const EASY_WARN = 0.25
const DRIFT_OK = 5            // % HR drift (2nd vs. 1st half)
const DRIFT_BAD = 10
const DRIFT_MIN_S = 45 * 60   // drift says little about shorter runs
const WARM_C = 20
const EFF_DELTA = 3           // % efficiency change that counts
const SIMILAR_DAYS = 90
const SIMILAR_MIN = 3
const MIN_ZONE_S = 10 * 60

export type InsightTone = 'ok' | 'warn' | 'bad'
export interface InsightLine { tone: InsightTone; label: string; text: string }

interface RunInput {
  id: string; date: string; km: number; movingS: number; paceS: number | null; hr: number | null
  runType: RunType; effMpb: number | null
}
interface Similar { id: string; date: string; effMpb: number | null }

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')
const pctDe = (n: number) => (Math.round(n * 10) / 10).toLocaleString('de-DE').replace('-', '−')
const daysBetween = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86_400_000

export function runInsights({ run, metrics, planned, plannedDate, temperature, similar }: {
  run: RunInput
  metrics: RunMetrics | null
  planned: PlanSession | null
  plannedDate: string | null
  temperature: number | null
  similar: Similar[]
}): InsightLine[] {
  const lines: InsightLine[] = []
  const full = (metrics?.splits ?? []).filter((s) => s.distM >= 950)
  const paceRun: PaceRun = { km: run.km, paceS: run.paceS, avgHr: run.hr, splitPacesS: full.map((s) => s.paceS), splitHrs: full.map((s) => s.hr) }
  const easyRun = planned ? !planned.pace : run.runType === 'Locker' || run.runType === 'Regeneration'
  const race = raceOf(plannedDate ?? run.date)
  const hrCap = (pace: string) => blockHrCap(paceToS(pace), race)

  // 1. Plan
  const check = planned ? checkPace(planned, paceRun) : null
  if (planned && check && check.actualS != null) {
    const when = plannedDate && plannedDate !== run.date ? ` (geplant ${dayLabel(plannedDate)})` : ''
    if (check.kind === 'easy') {
      lines.push({ tone: check.verdict === 'zu schnell' ? 'warn' : 'ok', label: 'Plan',
        text: `${planned.title}${when}: ${fmtPace(check.actualS)}/km, Ziel ca. ${fmtPace(check.targetS)} – ${check.verdict}.` })
    } else {
      const controlled = check.blockHr != null && check.blockHr < hrCap(planned.pace!)
      const fastButControlled = check.verdict === 'zu schnell' && controlled
      const tone: InsightTone = check.verdict === 'im Ziel' || fastButControlled ? 'ok' : 'warn'
      lines.push({ tone, label: 'Plan',
        text: `${planned.title}${when}: ${check.kind === 'quality' ? 'Block ' : ''}${fmtPace(check.actualS)} (${signed(check.deltaS!)} s zu ${planned.pace})` +
          `${check.blockHr != null ? `, Block-HF ${check.blockHr}` : ''} – ${fastButControlled ? 'schneller als geplant, HF kontrolliert' : check.verdict}.` })
    }
  } else if (!planned) {
    lines.push({ tone: 'ok', label: 'Plan', text: 'Kein geplanter Lauf – Zusatzlauf.' })
  }

  // 2. Intensity
  const zones = metrics?.zonesS ?? []
  const total = zones.reduce((a, b) => a + b, 0)
  if (easyRun && total >= MIN_ZONE_S) {
    const above = (total - (zones[0] ?? 0) - (zones[1] ?? 0)) / total
    const pct = Math.round(above * 100)
    const hr = run.hr != null ? ` (Ø HF ${run.hr})` : ''
    lines.push(above <= EASY_OK
      ? { tone: 'ok', label: 'Intensität', text: `Wirklich locker: ${100 - pct} % in Z1+Z2${hr}.` }
      : above <= EASY_WARN
        ? { tone: 'warn', label: 'Intensität', text: `Etwas zu flott: ${pct} % über Z2${hr}. Grenze ${HR_ZONES[1].max}.` }
        : { tone: 'bad', label: 'Intensität', text: `Zu hart für locker: ${pct} % über Z2${hr}. Grenze ${HR_ZONES[1].max}.` })
  } else if (!easyRun && planned?.pace && check?.blockHr != null) {
    const cap = hrCap(planned.pace)
    lines.push(check.blockHr <= cap
      ? { tone: 'ok', label: 'Intensität', text: `Block-HF ${check.blockHr} unter ${cap}: kontrolliert.` }
      : { tone: check.blockHr > cap + 5 ? 'bad' : 'warn', label: 'Intensität', text: `Block-HF ${check.blockHr} über ${cap}: zu viel für dieses Tempo.` })
  }

  // 3. Drift — only for continuous easy or long runs of at least 45 minutes
  const d = metrics?.decouplingPct
  if (d != null && run.movingS >= DRIFT_MIN_S && (easyRun || run.runType === 'Longrun')) {
    const pct = pctDe(d)
    const warm = temperature != null && temperature >= WARM_C ? `, bei ${temperature} °C auch Hitze` : ''
    lines.push(d < DRIFT_OK
      ? { tone: 'ok', label: 'Drift', text: `HF stabil (Drift ${pct} %): die Grundlage trägt.` }
      : d <= DRIFT_BAD
        ? { tone: 'warn', label: 'Drift', text: `Leichte Drift (${pct} %)${warm}.` }
        : { tone: 'bad', label: 'Drift', text: `Starke Drift (${pct} %): zu schnell angegangen${warm || ', Hitze'} oder müde.` })
  }

  // 4. Comparison with previous similar runs
  const prev = similar.filter((s) => s.id !== run.id && s.effMpb != null && s.date < run.date && daysBetween(run.date, s.date) <= SIMILAR_DAYS)
  if (run.effMpb != null && prev.length >= SIMILAR_MIN) {
    const sorted = prev.map((s) => s.effMpb!).sort((a, b) => a - b)
    const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    const delta = Math.round((run.effMpb / median - 1) * 100)
    const n = `deine letzten ${prev.length} ${run.runType}-Läufe`
    lines.push(delta >= EFF_DELTA
      ? { tone: 'ok', label: 'Vergleich', text: `Effizienter als ${n} (${signed(delta)} % Meter pro Herzschlag): die Form steigt.` }
      : delta <= -EFF_DELTA
        ? { tone: 'warn', label: 'Vergleich', text: `Weniger effizient als ${n} (${signed(delta)} %): müde, warm oder zu schnell?` }
        : { tone: 'ok', label: 'Vergleich', text: `Effizienz wie bei ${n}.` })
  }
  return lines
}
