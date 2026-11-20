'use client'

import { useQuery } from '@tanstack/react-query'
import type { SourcesResponse } from '@/lib/sources/types'
import { CalendarCard } from '@/components/settings/CalendarCard'
import { HealthCard } from '@/components/settings/HealthCard'
import { ProfileCard } from '@/components/settings/ProfileCard'
import { GarminSource } from '@/components/settings/GarminSource'
import { ImportCard } from '@/components/settings/ImportCard'
import { BillingCard } from '@/components/settings/BillingCard'
import { HealthConsentCard } from '@/components/settings/HealthConsentCard'
import { MyDataCard } from '@/components/settings/MyDataCard'

export default function SettingsPage() {
  const { data, isLoading } = useQuery<SourcesResponse>({
    queryKey: ['sources'],
    queryFn: () => fetch('/api/sources').then((r) => r.json()),
  })

  const sources = data?.sources ?? []
  const pull = sources.filter((s) => s.available && s.capabilities.mode === 'pull')
  const planned = sources.filter((s) => !s.available)
  // Apple running workouts count only when no other connected source delivers runs (lib/sources/registry.ts).
  const otherRunSource = sources.some((s) => s.id !== 'apple-health' && s.available && s.capabilities.runs && s.capabilities.mode !== 'upload' && s.status.connected)

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-lg font-semibold">Einstellungen</h1>

      <BillingCard />
      <ProfileCard />
      <CalendarCard />

      <section id="datenquellen" className="scroll-mt-20 space-y-4">
        <div>
          <h2 className="text-sm font-medium">Datenquellen</h2>
          <p className="text-xs text-muted-foreground">Woher Runmate deine Läufe und Tageswerte bekommt. Mehrere Quellen gleichzeitig sind möglich; doppelte Aktivitäten werden erkannt.</p>
        </div>
        <HealthConsentCard />
        {isLoading ? <div className="h-32 animate-pulse rounded-2xl border border-border bg-card" /> : pull.map((s) => <GarminSource key={s.id} source={s} />)}
        <HealthCard otherRunSource={otherRunSource} />
        <ImportCard />
        {planned.map((s) => (
          <p key={s.id} className="rounded-2xl border border-dashed border-border px-5 py-3 text-xs text-muted-foreground">
            <b className="font-medium text-foreground">{s.label}</b> – in Vorbereitung. {s.description}
          </p>
        ))}
      </section>

      <MyDataCard />
    </div>
  )
}
