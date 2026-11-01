// Race analysis: a marathon run against the pacing plan, section by section. Pure and rule-based.
// GPS reads long in cities, so the distance is scaled to 42,195 km before sections are cut;
// time is elapsed time from the timestamps (stops count in a race).
import type { RaceInfo } from '@/lib/plan/types'
import { fmtClock, fmtPace } from '@/lib/plan/format'
import { type PlanKind, type Section } from '@/lib/plan/race-day'

export interface RaceStream { distance: (number | null)[]; time: (number | null)[]; hr: (number | null)[] | null }

export interface SectionResult {
  from: number; to: number
  plannedPaceS: number; paceS: number; deltaS: number      // s/km, + = slower than planned
  timeS: number; lostS: number                             // section time; + = time lost vs. plan
  hr: number | null; hrCap: number | null; overShare: number | null
}

export type Tone = 'ok' | 'warn' | 'bad'
export interface RaceLine { tone: Tone; label: string; text: string }

export interface RaceAnalysisResult {
  finishS: number; goalS: number
  firstHalfS: number; secondHalfS: number
  sections: SectionResult[]
  lines: RaceLine[]
}

const START_OK_S = 3        // up to 3 s/km faster than planned at the start is still disciplined
const START_SLOW_S = 10     // more than 10 s/km slower than planned: a cautious start
const SECTION_LOSS_S = 60   // a section that cost a minute or more is named
const HR_OVER_SHARE = 0.25  // more than a quarter of a section above its HR cap
const NEG_SPLIT_S = 30      // halves within ±30 s count as even
const BAD_SPLIT_S = 300

const mmss = (s: number) => { const a = Math.round(Math.abs(s)); return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}` }
const de = (km: number) => km.toLocaleString('de-DE', { maximumFractionDigits: 1 })

export function analyzeRace(stream: RaceStream, plan: Section[], kind: PlanKind, race: Pick<RaceInfo, 'goalS' | 'fallbackS'>): RaceAnalysisResult | null {
  const MARATHON_KM = plan[plan.length - 1].to             // the race distance (name kept from the marathon-only version)
  // Clean samples: scaled km and elapsed seconds (timestamps may be in ms).
  const pts: { km: number; t: number; hr: number | null }[] = []
  const raw = stream.distance.map((d, i) => ({ d, t: stream.time[i], hr: stream.hr?.[i] ?? null }))
    .filter((p): p is { d: number; t: number; hr: number | null } => p.d != null && p.t != null)
  if (raw.length < 100) return null
  const maxD = Math.max(...raw.map((p) => p.d))
  if (maxD < 40_000) return null
  const ms = raw[0].t > 1e11
  const t0 = raw[0].t
  for (const p of raw) pts.push({ km: (p.d / maxD) * MARATHON_KM, t: (p.t - t0) / (ms ? 1000 : 1), hr: p.hr })

  const tAt = (km: number) => {
    const i = pts.findIndex((p) => p.km >= km)
    if (i <= 0) return i === 0 ? pts[0].t : pts[pts.length - 1].t
    const a = pts[i - 1], b = pts[i]
    return a.t + ((km - a.km) / Math.max(1e-9, b.km - a.km)) * (b.t - a.t)
  }

  const sections: SectionResult[] = plan.map((s) => {
    const timeS = tAt(s.to) - tAt(s.from)
    const len = s.to - s.from
    const hrs = pts.filter((p) => p.km >= s.from && p.km < s.to && p.hr != null).map((p) => p.hr!)
    const hr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null
    const overShare = hrs.length && s.hrCap ? hrs.filter((h) => h > s.hrCap!).length / hrs.length : null
    return {
      from: s.from, to: s.to, plannedPaceS: s.paceS, paceS: Math.round(timeS / len),
      deltaS: Math.round(timeS / len - s.paceS), timeS: Math.round(timeS), lostS: Math.round(timeS - len * s.paceS),
      hr, hrCap: s.hrCap, overShare,
    }
  })

  const finishS = Math.round(tAt(MARATHON_KM))
  const firstHalfS = Math.round(tAt(MARATHON_KM / 2))
  const secondHalfS = finishS - firstHalfS
  const goalS = kind === 'A' ? race.goalS : Math.round(plan.reduce((t, s) => t + (s.to - s.from) * s.paceS, 0))

  const lines: RaceLine[] = []
  // 1. Finish vs. goal
  const diff = finishS - goalS
  lines.push({
    tone: finishS <= goalS ? 'ok' : finishS <= race.fallbackS ? 'warn' : 'bad', label: 'Ziel',
    text: `${fmtClock(finishS, true)}: ${diff > 0 ? `${mmss(diff)} hinter` : diff < 0 ? `${mmss(diff)} vor` : 'genau auf'} Plan ${kind} (${fmtClock(goalS, true)}).`,
  })
  // 2. Start discipline
  const start = sections[0]
  lines.push(start.deltaS < -START_OK_S
    ? { tone: 'warn', label: 'Start', text: `Zu schnell angegangen: die ersten ${de(start.to)} km in ${fmtPace(start.paceS)} (Plan ${fmtPace(start.plannedPaceS)}). Das kostet hinten raus.` }
    : start.deltaS > START_SLOW_S
      ? { tone: 'ok', label: 'Start', text: `Vorsichtig gestartet: die ersten ${de(start.to)} km in ${fmtPace(start.paceS)}, ${start.deltaS} s/km langsamer als geplant (${fmtPace(start.plannedPaceS)}).` }
      : { tone: 'ok', label: 'Start', text: `Diszipliniert: die ersten ${de(start.to)} km in ${fmtPace(start.paceS)} (Plan ${fmtPace(start.plannedPaceS)}).` })
  // 3. Halves
  const split = secondHalfS - firstHalfS
  lines.push(split <= -NEG_SPLIT_S
    ? { tone: 'ok', label: 'Hälften', text: `Negativer Split: zweite Hälfte ${mmss(split)} schneller (${fmtClock(firstHalfS, true)} / ${fmtClock(secondHalfS, true)}).` }
    : Math.abs(split) < NEG_SPLIT_S
      ? { tone: 'ok', label: 'Hälften', text: `Gleichmäßig: ${fmtClock(firstHalfS, true)} / ${fmtClock(secondHalfS, true)}.` }
      : { tone: split > BAD_SPLIT_S ? 'bad' : 'warn', label: 'Hälften', text: `Zweite Hälfte ${mmss(split)} langsamer (${fmtClock(firstHalfS, true)} / ${fmtClock(secondHalfS, true)}).` })
  // 4. Where the time went
  const worst = [...sections].sort((a, b) => b.lostS - a.lostS)[0]
  if (worst.lostS >= SECTION_LOSS_S) {
    lines.push({ tone: worst.lostS >= 3 * SECTION_LOSS_S ? 'bad' : 'warn', label: 'Zeitverlust',
      text: `Am meisten km ${de(worst.from)}–${de(worst.to)}: ${worst.deltaS > 0 ? '+' : ''}${worst.deltaS} s/km, ${mmss(worst.lostS)} Min. verloren.` })
  }
  // 5. Heart rate vs. caps
  const over = sections.find((s) => s.overShare != null && s.overShare > HR_OVER_SHARE)
  lines.push(over
    ? { tone: 'warn', label: 'Puls', text: `km ${de(over.from)}–${de(over.to)} zu hoch: Ø ${over.hr} bei Grenze ${over.hrCap} (${Math.round(over.overShare! * 100)} % der Zeit drüber).` }
    : { tone: 'ok', label: 'Puls', text: 'In allen Abschnitten im Rahmen der HF-Grenzen.' })

  return { finishS, goalS, firstHalfS, secondHalfS, sections, lines }
}
