// Product panels for the landing page (Phase 6): the app's own primitives (Card, Pill, TypeTag, Stat from
// components/plan/ui) with the static sample data in ../_sample. Server components only — no client JS. Each panel
// mirrors one real card (TodayCard, TrainingSchedule, PlanChanges, PauseControl, ProgressSection, WeekReview,
// RaceWeekCard, RaceStrategy) without its data fetching.
import { Sun, Undo2, ArrowRight, Thermometer, Gauge } from 'lucide-react'
import { Card, Pill, Stat, TypeTag } from '@/components/plan/ui'
import { cn } from '@/lib/utils'
import type { SessionType } from '@/lib/plan/types'
import { BLOCK, CHANGES, FATIGUE, LONG_RUNS, PAUSE, RACE_WEEK, REVIEW, SPLITS, TODAY, WEEK, Z2_PACE } from '../_sample/fixture'

const de = (n: number) => String(n).replace('.', ',')   // German decimal comma

// A framed "screenshot": the card on a soft tinted ground, labelled as sample data.
export function Frame({ tone = 'brand', caption, className, children }: { tone?: 'brand' | 'teal' | 'plain'; caption?: string; className?: string; children: React.ReactNode }) {
  return (
    <figure className={cn('relative rounded-[1.25rem] p-2.5 sm:p-3', tone === 'brand' ? 'bg-brand-soft' : tone === 'teal' ? 'bg-teal-soft' : 'bg-secondary', className)}>
      {children}
      {caption && <figcaption className="px-1.5 pt-2 text-[11px] text-muted-foreground">{caption}</figcaption>}
    </figure>
  )
}

export function TodayPanel() {
  return (
    <section className="rounded-2xl border border-border border-l-4 border-l-brand bg-card p-4 sm:p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand"><Sun className="h-4 w-4" aria-hidden /> {TODAY.label}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <TypeTag type={TODAY.type} />
          <span className="font-medium">{TODAY.title}</span>
          <span className="text-sm tabular-nums text-muted-foreground">{TODAY.km} km</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{TODAY.targets.map((t) => <Pill key={t} className="tabular-nums text-foreground">{t}</Pill>)}</div>
      <p className="mt-3 text-[15px] font-semibold leading-snug">{TODAY.advice}</p>
      <div className="mt-2 text-sm"><span className="text-muted-foreground">Warum: </span>{TODAY.why.join(' · ')}</div>
      <p className="mt-2 text-sm text-muted-foreground">{TODAY.yesterday}</p>
    </section>
  )
}

type Day = { d: string; type: SessionType; plan: number; run: number | null }

// Plan (outline) vs. run (teal) per day; bars grow once on load (globals.css .mk-bar).
export function WeekBars({ days, max = 20, height = 112, animate = true, today }: { days: Day[]; max?: number; height?: number; animate?: boolean; today?: string }) {
  return (
    <div role="img" aria-label={days.map((x) => `${x.d}: Plan ${x.plan} km${x.run != null ? `, gelaufen ${x.run} km` : ''}`).join('; ')}
      className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((x, i) => {
        const planH = (x.plan / max) * height
        const runH = x.run != null ? (Math.min(x.run, max) / max) * height : 0
        return (
          <div key={x.d} className="grid gap-1.5">
            <div className="relative flex items-end justify-center" style={{ height }}>
              {x.plan > 0 ? (
                <div className={cn('absolute bottom-0 w-full max-w-11 rounded-t-[4px] border border-dashed border-foreground/25 bg-secondary/60', animate && 'mk-bar')}
                  style={{ height: planH, ['--i' as string]: i }} />
              ) : <div className="absolute bottom-0 h-1 w-full max-w-11 rounded bg-secondary" />}
              {runH > 0 && <div className={cn('absolute bottom-0 w-full max-w-11 rounded-t-[4px] bg-teal', animate && 'mk-bar mk-bar-run')} style={{ height: runH, ['--i' as string]: i }} />}
            </div>
            <div className={cn('text-center text-[11px] tabular-nums', x.d === today ? 'font-semibold text-brand' : 'text-muted-foreground')}>{x.d}</div>
            <div className="text-center text-[11px] font-medium tabular-nums">{x.plan ? de(x.run ?? x.plan) : '–'}</div>
          </div>
        )
      })}
    </div>
  )
}

export function WeekPanel({ days = WEEK.days, done = WEEK.doneKm, animate = true }: { days?: Day[]; done?: number; animate?: boolean }) {
  return (
    <Card title={WEEK.title} aside={<span className="text-sm tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{de(Math.round(done * 10) / 10)}</span> / {WEEK.planKm} km</span>}>
      <WeekBars days={days} animate={animate} today={days === WEEK.days ? 'Do' : undefined} />
      <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-teal" />gelaufen</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-foreground/30 bg-secondary" />geplant</span>
      </div>
    </Card>
  )
}

export function ChangesPanel() {
  return (
    <Card title="Plan-Anpassungen" aside={<span className="text-xs text-muted-foreground">automatisch, nach festen Regeln</span>}>
      <ol className="grid gap-3">
        {CHANGES.map((c) => (
          <li key={c.when} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs tabular-nums text-muted-foreground">{c.when}</span>
              <span className="font-medium">{c.title}</span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"><Undo2 className="h-3.5 w-3.5" aria-hidden />Rückgängig</span>
            </div>
            <div className="mt-2 flex items-center gap-2 overflow-hidden text-sm">
              <Pill className="line-through decoration-foreground/40">{c.from}</Pill>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="mk-slide inline-block" style={{ ['--shift' as string]: c.shift }}><Pill className="border-teal/40 bg-teal-soft text-teal">{c.to}</Pill></span>
            </div>
            <p className="mt-2 text-xs leading-snug text-muted-foreground">Regel: {c.rule}</p>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function PausePanel() {
  return (
    <Card title="Pause & Rückkehr" aside={<Pill>{PAUSE.title}</Pill>}>
      <ol className="grid gap-2">
        {PAUSE.steps.map((s, i) => (
          <li key={s.label} className="flex items-baseline gap-3 text-sm">
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
            <span className="w-28 shrink-0 text-muted-foreground">{s.label}</span>
            <span className="font-medium">{s.value}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function FatiguePanel() {
  return (
    <Card title="Ermüdungsschutz">
      <div className="flex gap-6">
        <Stat label="Form (TSB)" value={<span className="text-brand">{String(FATIGUE.tsb).replace('-', '−')}</span>} unit={`Grenze ${String(FATIGUE.limit).replace('-', '−')}`} />
        <Stat label="ACWR" value={String(FATIGUE.acwr).replace('.', ',')} unit="Grenze 1,4" />
      </div>
      <p className="mt-3 flex gap-2 text-sm leading-snug"><Gauge className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />{FATIGUE.text}</p>
    </Card>
  )
}

// Block progress: planned (outline) vs. run (teal) km per week; native SVG <title> as the hover text.
export function BlockPanel() {
  const W = 360, H = 120, max = 66, bw = W / BLOCK.length
  return (
    <Card title="Blockfortschritt" aside={<span className="text-xs tabular-nums text-muted-foreground">10 von 12 Wochen</span>}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Kilometer pro Woche, geplant und gelaufen">
        <line x1="0" x2={W} y1={H} y2={H} stroke="hsl(var(--border))" />
        {BLOCK.map((b, i) => {
          const x = i * bw + 3, w = bw - 6
          const ph = (b.plan / max) * H, rh = b.run != null ? (b.run / max) * H : 0
          return (
            <g key={b.w}>
              <title>{`Woche ${b.w}: Plan ${b.plan} km${b.run != null ? `, gelaufen ${b.run} km` : ''}`}</title>
              <rect x={x} y={H - ph} width={w} height={ph} rx="3" fill="hsl(var(--secondary))" stroke="hsl(var(--foreground) / 0.22)" strokeDasharray="3 2" />
              {rh > 0 && <rect x={x + 3} y={H - rh} width={w - 6} height={rh} rx="3" fill="hsl(var(--teal))" />}
              <text x={x + w / 2} y={H + 13} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">{b.w}</text>
            </g>
          )
        })}
        <text x={6 * bw + bw / 2} y={H - (21 / max) * H - 6} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">krank</text>
      </svg>
    </Card>
  )
}

// A small single-series line (one measure per chart; the title names it, no legend needed).
function Line({ values, invert = false, fmt, label }: { values: number[]; invert?: boolean; fmt: (v: number) => string; label: string }) {
  const W = 220, H = 70, pts = values.map((v, i) => ({ v, i })).filter((p) => p.v > 0)
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v))
  const x = (i: number) => (i / (values.length - 1)) * (W - 8) + 4
  const y = (v: number) => { const t = (v - lo) / (hi - lo || 1); return 6 + (invert ? t : 1 - t) * (H - 12) }
  // A gap where the week was missed (sick): two segments, not a line through zero.
  const segs: { v: number; i: number }[][] = []
  pts.forEach((p, k) => { if (!k || p.i - pts[k - 1].i > 1) segs.push([p]); else segs[segs.length - 1].push(p) })
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      {segs.map((s, k) => <polyline key={k} points={s.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke="hsl(var(--teal))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
      {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="6" fill="transparent"><title>{`Woche ${p.i + 1}: ${fmt(p.v)}`}</title></circle>)}
      <circle cx={x(last.i)} cy={y(last.v)} r="4" fill="hsl(var(--teal))" stroke="hsl(var(--card))" strokeWidth="2" />
    </svg>
  )
}

const pace = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function LongRunPanel() {
  return (
    <Card title="Longrun-Aufbau" aside={<span className="text-sm font-semibold tabular-nums">{LONG_RUNS[LONG_RUNS.length - 1]} km</span>}>
      <Line values={LONG_RUNS} fmt={(v) => `${v} km`} label="Längster Lauf pro Woche, von 14 auf 19 km" />
      <p className="mt-2 text-xs text-muted-foreground">Längster Lauf pro Woche, +5 km in 10 Wochen</p>
    </Card>
  )
}

export function ZonePanel() {
  return (
    <Card title="Tempo in Zone 2" aside={<span className="text-sm font-semibold tabular-nums">{pace(Z2_PACE[Z2_PACE.length - 1])} /km</span>}>
      <Line values={Z2_PACE} invert fmt={(v) => `${pace(v)} /km`} label="Durchschnittstempo in Zone 2, von 5:52 auf 5:38 pro km" />
      <p className="mt-2 text-xs text-muted-foreground">Gleicher Puls, 14 s/km schneller als in Woche 1</p>
    </Card>
  )
}

export function ReviewPanel() {
  return (
    <Card title={REVIEW.title}>
      <ul className="grid gap-1.5 text-sm">{REVIEW.lines.map((l) => <li key={l} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />{l}</li>)}</ul>
      <p className="mt-3 text-sm font-medium">{REVIEW.next}</p>
    </Card>
  )
}

export function RaceWeekPanel() {
  const max = Math.max(...RACE_WEEK.map((r) => r.g))
  return (
    <Card title="Rennwoche" aside={<span className="text-xs text-muted-foreground">Kohlenhydrate pro Tag, 68 kg</span>}>
      <div className="grid gap-2">
        {RACE_WEEK.map((r) => (
          <div key={r.d} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{r.d}</span>
            {r.g ? <div className="h-2.5 rounded-full bg-secondary"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${(r.g / max) * 100}%` }} /></div> : <span className="text-xs">{r.note}</span>}
            <span className="tabular-nums">{r.g ? <><span className="font-semibold">{r.g} g</span> <span className="text-xs text-muted-foreground">{r.note}</span></> : null}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function SplitsPanel() {
  return (
    <Card title="Rennstrategie" aside={<Pill className="tabular-nums">4:41 /km</Pill>}>
      <div className="grid grid-cols-2 gap-4">
        {[SPLITS.a, SPLITS.b].map((p, k) => (
          <div key={p.label}>
            <div className={cn('text-sm font-semibold', k === 0 ? 'text-foreground' : 'text-muted-foreground')}>{p.label}</div>
            <table className="mt-2 w-full text-sm tabular-nums">
              <tbody>{p.km.map(([d, t]) => <tr key={d} className="border-t border-border"><td className="py-1 text-muted-foreground">{d}</td><td className="py-1 text-right">{t}</td></tr>)}</tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="mt-3 flex gap-2 text-xs leading-snug text-muted-foreground"><Thermometer className="h-4 w-4 shrink-0" aria-hidden />{SPLITS.decide}</p>
    </Card>
  )
}
