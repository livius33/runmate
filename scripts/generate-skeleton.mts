// Prints a generated week skeleton (07-02): KW, Monday, phase, km, share, recovery week, plus "Warum diese Spitze".
// No database.
//   npx tsx scripts/generate-skeleton.mts                    HM 02/2027 example (pfitzinger-half, 30.11.2026 → 21.2.2027, B 50, P 101)
//   npx tsx scripts/generate-skeleton.mts --template pfitzinger-marathon --distance marathon --race 2026-11-08 \
//     --start 2026-06-22 --current 64 --peak 126
// Options: --template --distance --race --start --current --proven --peak --tuneup (repeatable) --age --novice
//   --days [--pace m:ss] [--longest30 km] [--longest12m km]   day plan (07-03) with a sample profile (Fr Ruhe, Sa Longrun, Di/Do Qualität)
//   --workouts [--goal h:mm:ss]                                 the day plan with workouts and paces (07-13)
import { format, parseISO } from 'date-fns'
import { loadMethodology } from '../lib/plan/methodology/load'
import { buildSkeleton } from '../lib/plan/generator/skeleton'
import { buildDays } from '../lib/plan/generator/days'
import { trainingPaces } from '../lib/plan/generator/paces'
import { buildWorkouts } from '../lib/plan/generator/workouts'
import type { Distance } from '../lib/plan/methodology/schema'

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const all = (name: string) => process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]] : []))
const numArg = (name: string) => (arg(name) == null ? undefined : Number(arg(name)))
const example = !arg('--template')

const id = arg('--template') ?? 'pfitzinger-half'
const m = loadMethodology(id)
if (!m) { console.log(`✗ Vorlage „${id}“ fehlt oder ist ungültig`); process.exit(1) }
const r = buildSkeleton({
  template: m.params,
  distance: (arg('--distance') ?? m.params.distances[0]) as Distance,
  raceDate: arg('--race') ?? '2027-02-21',
  start: arg('--start') ?? '2026-11-30',
  currentKm: numArg('--current') ?? 50,
  currentKmSource: example ? 'recoveryBlock' : 'mean4',
  provenKm: numArg('--proven') ?? (example ? 101 : undefined),
  peakKm: numArg('--peak'),
  tuneUps: all('--tuneup'),
  age: numArg('--age'),
  experience: process.argv.includes('--novice') ? 'novice' : null,
})
if (!r.ok) { console.log(`✗ ${r.error}`); process.exit(1) }

const LABEL = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Taper' }
const KIND = { load: '', recovery: 'Erholung', tuneup: 'Testrennen', taper: '' }
console.log(`${m.meta.name} · ${r.weeks.length} Wochen · Spitze ${r.peakKm} km (Empfehlung ${r.peak.recommendedKm} km, ${r.peak.binding})\n`)
console.log('KW  Montag      Phase      km     Anteil  ')
for (const w of r.weeks) {
  const flag = [KIND[w.kind], w.hold ? 'gehalten' : ''].filter(Boolean).join(', ')
  console.log(`${String(w.kw).padStart(2)}  ${format(parseISO(w.start), 'dd.MM.yyyy')}  ${LABEL[w.phase].padEnd(9)}  ${String(w.km).padStart(5)}  ${String(Math.round(w.share * 100)).padStart(4)} %  ${flag}`)
}
console.log(`\nBelastungsphasen: ${r.runs.map((x) => `${x.weeks}${x.rising ? '↑' : ''}`).join(' · ')}`)
console.log('\nWarum diese Spitze')
for (const line of r.peak.why) console.log(`  ${line}`)
if (r.warnings.length) {
  console.log('\nHinweise')
  for (const w of r.warnings) console.log(`  • ${w}`)
}

if (process.argv.includes('--days') || process.argv.includes('--workouts')) {
  const goalArg = arg('--goal') ?? (example ? '1:25:00' : '3:05:00')
  const goalS = goalArg.split(':').map(Number).reduce((a, b) => a * 60 + b, 0)
  const pacesIn = { template: m.params, distance: (arg('--distance') ?? m.params.distances[0]) as Distance, goalS, profile: null }
  const racePaceS = arg('--pace') ? arg('--pace')!.split(':').map(Number).reduce((a, b) => a * 60 + b, 0) : trainingPaces(pacesIn).racePaceS
  const d = buildDays(r, {
    template: m.params, distance: (arg('--distance') ?? m.params.distances[0]) as Distance, raceDate: arg('--race') ?? '2027-02-21',
    racePaceS, longest30Km: numArg('--longest30') ?? 16, longest12mKm: numArg('--longest12m'),
    profile: { v: 1, age: numArg('--age') ?? null, weightKg: null, heightCm: null, experience: process.argv.includes('--novice') ? 'novice' : 'advanced',
      weeklyKm: null, availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
      maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: null, thresholdPaceS: null, fiveKS: null, savedAt: null },
  })
  if (!d.ok) { console.log(`✗ ${d.error}`); process.exit(1) }
  const SHORT: Record<string, string> = { rest: '–', easy: 'L', recovery: 'R', tempo: 'Q', long: 'LR', race: 'RENNEN' }
  console.log('\nTage (L locker · R Regeneration · Q Qualität · LR Longrun, * = Schlüsseleinheit)')
  console.log('KW   Mo        Di        Mi        Do        Fr        Sa        So        Woche')
  for (const w of d.weeks) {
    const cells = d.sessions.filter((s) => s.date >= w.start && s.date <= w.end)
      .map((s) => (s.type === 'rest' ? '–' : `${SHORT[s.type]}${s.key && s.type !== 'tempo' ? '*' : ''} ${s.km}`).padEnd(9))
    console.log(`${String(w.kw).padStart(2)}   ${cells.join(' ')} ${String(w.km).padStart(5)}  ${w.focus}`)
  }
  if (d.warnings.length) { console.log('\nHinweise (Tage)'); for (const x of d.warnings) console.log(`  • ${x}`) }
  if (process.argv.includes('--workouts')) {
    const wo = buildWorkouts(d, r, { ...pacesIn, raceDate: arg('--race') ?? '2027-02-21' })
    if (!wo.ok) { console.log(`✗ ${wo.error}`); process.exit(1) }
    console.log(`\nTempi (${wo.paces.source}): ` + Object.entries(wo.paces.fmt).map(([k, v]) => `${k} ${v}`).join(' · '))
    for (const w of d.weeks) {
      console.log(`\nKW ${w.kw} · ${w.focus} · ${w.km} km`)
      for (const s of wo.sessions.filter((x) => x.date >= w.start && x.date <= w.end && x.type !== 'rest')) {
        console.log(`  ${format(parseISO(s.date), 'EEE dd.MM.')}  ${String(s.km).padStart(4)} km  ${s.key ? '★' : ' '} ${s.test ? `[${s.test}] ` : ''}${s.notes ?? s.title}`)
      }
    }
    if (wo.warnings.length) { console.log('\nHinweise (Einheiten)'); for (const x of wo.warnings) console.log(`  • ${x}`) }
  }
}
