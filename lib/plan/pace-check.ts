// Plan vs. actual pace for one session. Pure, so the Plan page and later the plan engine
// can share it.
import { hrZones } from '@/lib/analytics/hr'
import { type PlanSession } from './types'
import { paceToS, qualityKm } from './format'
import { blockFor, blockPaces } from './blocks'
import { athlete } from '@/lib/athlete'

// splitPacesS / splitHrs: per full km split, same order and length.
export interface PaceRun {
  km: number; paceS: number | null; avgHr: number | null; splitPacesS: number[]; splitHrs?: (number | null)[]
  zonesS?: number[] | null       // seconds in Z1..Z5
}

export type PaceVerdict = 'im Ziel' | 'zu langsam' | 'zu schnell' | 'kein Lauf'

export interface PaceCheck {
  kind: 'quality' | 'whole' | 'easy'
  targetS: number
  actualS: number | null
  deltaS: number | null          // actual − target; negative = faster
  verdict: PaceVerdict
  hr?: { avg: number | null; cap: number }
  blockHr?: number | null        // quality: mean HR of the block km
}

const ON_TARGET_S = 5      // ± s/km counts as on target
const EASY_FAST_S = 15     // easy runs are only "too fast" beyond this

// The quality block of a run: its N fastest full km (N = quality km of the session), without
// warm-up and cool-down. Null when the run has fewer full km splits than that.
export function qualityBlock(session: PlanSession, run: PaceRun): { paceS: number; hr: number | null; km: number } | null {
  const q = session.pace ? qualityKm(session) : 0
  const n = Math.floor(q)                    // full km splits (a 21,1 km block = 21 splits)
  if (n <= 0 || run.splitPacesS.length < n) return null
  const idx = run.splitPacesS.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, i]) => i)
  const paceS = idx.reduce((t, i) => t + run.splitPacesS[i], 0) / n
  const hrs = idx.map((i) => run.splitHrs?.[i]).filter((h): h is number => h != null)
  return { paceS, hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null, km: q }
}

export function checkPace(session: PlanSession, run: PaceRun | null): PaceCheck {
  const easy = !session.pace
  // An easy day is measured against the pace the plan shows for it ("ca. 5:21/km", the block's easy pace). Only
  // outside every block the profile's easy pace is left to go by.
  const targetS = paceToS(session.pace ?? (blockFor(session.date) ? blockPaces(session.date).easy : athlete().easyPace))
  const q = easy ? 0 : qualityKm(session)
  let kind: PaceCheck['kind'] = easy ? 'easy' : q > 0 ? 'quality' : 'whole'
  const hr = easy ? { avg: run?.avgHr ?? null, cap: hrZones()[1].max } : undefined

  if (!run) return { kind, targetS, actualS: null, deltaS: null, verdict: 'kein Lauf', hr }

  let actualS = run.paceS
  let blockHr: number | null | undefined
  if (kind === 'quality') {
    const block = qualityBlock(session, run)
    if (block) { actualS = block.paceS; blockHr = block.hr }
    else kind = 'whole'
  }
  if (actualS == null) return { kind, targetS, actualS: null, deltaS: null, verdict: 'kein Lauf', hr }

  const deltaS = Math.round(actualS - targetS)
  const verdict: PaceVerdict = easy
    ? deltaS < -EASY_FAST_S ? 'zu schnell' : 'im Ziel'   // slower is fine for easy runs
    : Math.abs(deltaS) <= ON_TARGET_S ? 'im Ziel' : deltaS > 0 ? 'zu langsam' : 'zu schnell'
  return { kind, targetS, actualS: Math.round(actualS), deltaS, verdict, hr, blockHr }
}

// ─── Pairing sessions with runs ───────────────────────────────────────────────

export interface DatedRun extends PaceRun { id: string; date: string }

const SWAP_MARGIN_S = 15   // a neighbouring run must fit a quality target this much better
const SWAP_FIT_S = 15      // … and fit it at all: within ±15 s/km, real evidence the session was run that day

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000)
}

// Same day first. Sessions are often swapped with the day before or after, so a quality session
// takes a run from ±1 day when that run fits its target pace clearly better; the session whose
// run was taken then gets the run left over on the neighbouring day.
export function matchSessionRuns(sessions: PlanSession[], runs: DatedRun[]): Map<string, DatedRun | null> {
  const out = new Map<string, DatedRun | null>()
  const claimed = new Set<string>()
  const near = (s: PlanSession) => runs.filter((r) => !claimed.has(r.id) && Math.abs(dayDiff(r.date, s.date)) <= 1)
  const longest = (rs: DatedRun[]) => [...rs].sort((a, b) => b.km - a.km)[0] ?? null
  const isQuality = (s: PlanSession) => !!s.pace && s.type !== 'race'

  for (const s of sessions.filter(isQuality)) {
    const score = (r: DatedRun) => Math.abs(checkPace(s, r).deltaS ?? Infinity)
    const cands = near(s)
    const same = cands.filter((r) => r.date === s.date).sort((a, b) => score(a) - score(b))[0]
    const other = cands.filter((r) => r.date !== s.date).sort((a, b) => score(a) - score(b))[0]
    const swapped = other && score(other) <= SWAP_FIT_S && (!same || score(other) + SWAP_MARGIN_S < score(same))
    const pick = swapped ? other : same ?? null
    if (pick) claimed.add(pick.id)
    out.set(s.date, pick)
  }

  for (const s of sessions.filter((x) => !isQuality(x))) {
    const cands = near(s)
    const same = longest(cands.filter((r) => r.date === s.date))
    // A neighbouring run only when its own day's session was paired with another run.
    const other = longest(cands.filter((r) => r.date !== s.date && out.has(r.date) && out.get(r.date)?.id !== r.id))
    const pick = same ?? other
    if (pick) claimed.add(pick.id)
    out.set(s.date, pick)
  }
  return out
}

// A race-pace block run this much slower than its target was not attempted (an easy day instead of the test),
// so it must not count as evidence for or against the goal pace.
export const NOT_ATTEMPTED_S = 30

export function blockAttempted(targetPace: string | undefined, blockPaceS: number) {
  if (!targetPace) return true
  const [m, sec] = targetPace.split(':').map(Number)
  return blockPaceS - (m * 60 + (sec || 0)) <= NOT_ATTEMPTED_S
}
