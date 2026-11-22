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
import { SectionHeader } from '@/components/ui'
import { cn } from '@/lib/utils'

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

  // Layout (12-02): two independent columns from lg up (7 / 5), every card at its natural height. Left: profile and the
  // data sources; right: plan, calendar and my data. On phones the column wrappers dissolve (`contents`) and `order`
  // keeps today's reading order: Abo, Profil, Kalender, Datenquellen, Meine Daten. Cards that render nothing (Abo on a
  // self-hosted install) leave an empty wrapper, hidden so it adds no gap.
  const col = 'contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4'
  const slot = 'min-w-0 empty:hidden'
  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="text-title">Einstellungen</h1>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className={cn(col, 'lg:col-span-7')}>
          <div className={cn(slot, 'max-lg:order-2')}><ProfileCard /></div>

          <section id="datenquellen" className="flex min-w-0 scroll-mt-20 flex-col gap-4 pt-4 max-lg:order-4">
            <div>
              <SectionHeader level="section" title="Datenquellen" />
              <p className="mt-1 text-body-sm text-muted-foreground">Woher Runmate deine Läufe und Tageswerte bekommt. Mehrere Quellen gleichzeitig sind möglich; doppelte Aktivitäten werden erkannt.</p>
            </div>
            <HealthConsentCard />
            {isLoading ? <div className="h-32 animate-pulse rounded-card bg-card shadow-raised" /> : pull.map((s) => <GarminSource key={s.id} source={s} />)}
            <HealthCard otherRunSource={otherRunSource} />
            <ImportCard />
            {planned.map((s) => (
              <p key={s.id} className="rounded-card border border-dashed border-border px-4 py-3 text-caption text-muted-foreground sm:px-5">
                <b className="font-medium text-foreground">{s.label}</b> – in Vorbereitung. {s.description}
              </p>
            ))}
          </section>
        </div>

        <div className={cn(col, 'lg:col-span-5')}>
          <div className={cn(slot, 'max-lg:order-1')}><BillingCard /></div>
          <div className={cn(slot, 'max-lg:order-3')}><CalendarCard /></div>
          <div className={cn(slot, 'max-lg:order-5')}><MyDataCard /></div>
        </div>
      </div>
    </div>
  )
}
