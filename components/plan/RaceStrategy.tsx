import { Route, Mountain, Flag, Timer } from 'lucide-react'
import { fmtPace, fmtClock } from '@/lib/plan/format'
import { athlete } from '@/lib/athlete'
import { elapsedAt, racePlan } from '@/lib/plan/race-day'
import type { Course } from '@/lib/plan/course'
import type { RaceInfo } from '@/lib/plan/types'
import { Card } from '@/components/ui/card'

function fmtKm(km: number) {
  return km % 1 === 0 ? String(km) : km.toFixed(1).replace('.', ',')
}

export function RaceStrategy({ course, race: RACE }: { course: Course | null; race: RaceInfo }) {
  const plan = racePlan('A', RACE)
  const rows = plan.map((s) => ({ ...s, at: elapsedAt(plan, s.to) }))

  return (
    <Card title="Rennstrategie">
      <div className="grid grid-cols-2 gap-3 rounded-card bg-secondary p-3 sm:p-4">
        <Fact icon={Route} label="Distanz" value={`${fmtKm(Math.round(RACE.distanceKm * 10) / 10)} km`} />
        <Fact icon={Mountain} label="Höhenmeter" value={course?.gainM != null ? `ca. ${course.gainM} m` : '–'} />
        <Fact icon={Flag} label="Zielzeit" value={fmtClock(RACE.goalS)} />
        <Fact icon={Timer} label="Zieltempo" value={`${fmtPace(RACE.goalPaceS)}/km`} />
      </div>

      <h3 className="mb-2 mt-4 text-body-sm font-semibold">Split-Strategie</h3>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[420px] text-body-sm">
          <thead>
            <tr className="text-left text-caption text-muted-foreground">
              <th className="px-1 py-2 font-normal">Abschnitt</th>
              <th className="px-1 py-2 font-normal">Tempo</th>
              <th className="px-1 py-2 font-normal">Zeit bei km</th>
              <th className="px-1 py-2 font-normal">HF bis</th>
              <th className="px-1 py-2 font-normal">Fokus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.from} className="border-t border-border">
                <td className="px-1 py-2.5 tabular-nums whitespace-nowrap">{fmtKm(s.from)}–{fmtKm(s.to)} km</td>
                <td className="px-1 py-2.5 tabular-nums font-semibold text-brand-text whitespace-nowrap">{fmtPace(s.paceS)}/km</td>
                <td className="px-1 py-2.5 tabular-nums text-muted-foreground">{fmtClock(s.at, true)}</td>
                <td className="px-1 py-2.5 tabular-nums">{s.hrCap ?? '—'}</td>
                <td className="px-1 py-2.5 text-muted-foreground">{s.focus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-caption text-muted-foreground">
        Fallback: {fmtPace(RACE.fallbackPaceS)}/km gleichmäßig → {fmtClock(RACE.fallbackS)}. Bestzeit {athlete().pb.time} ({athlete().pb.race}).
      </p>
    </Card>
  )
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-brand" />{label}
      </div>
      <div className="mt-1 text-title-sm tabular-nums">{value}</div>
    </div>
  )
}
