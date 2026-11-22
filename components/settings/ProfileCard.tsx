'use client'

// Mein Profil (Phase 2): the numbers zones, race HR caps, TRIMP and "today" derive from. Empty = example default,
// marked as such. Saving refreshes the page so every card follows the new profile.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserRound } from 'lucide-react'
import type { HrZone } from '@/lib/analytics/hr'
import { LTHR_ZONES_ENABLED, type ProfileField, type ResolvedProfile, type UserProfile } from '@/lib/profile'
import { Button, Card, Field, Input, fieldDescribedBy } from '@/components/ui'
import { Select } from './controls'

type View = { stored: UserProfile | null; resolved: ResolvedProfile; zones: HrZone[]; raceHr: Record<'marathon' | 'half' | 'tenK', { cap: number; hard: number }> }

// The LTHR field and the zone-model choice stay hidden until the LTHR model is researched (LTHR_ZONES_ENABLED).
const ALL_FIELDS: { key: ProfileField; label: string; hint?: string; type?: 'number' | 'text' }[] = [
  { key: 'hrMax', label: 'HFmax', type: 'number' },
  { key: 'hrRest', label: 'Ruhepuls', type: 'number' },
  { key: 'lthr', label: 'LTHR (Schwellenpuls)', type: 'number', hint: 'optional, für das LTHR-Zonenmodell' },
  { key: 'pbTime', label: 'Marathon-Bestzeit', hint: 'h:mm oder h:mm:ss' },
  { key: 'pbRace', label: 'Bestzeit-Rennen' },
  { key: 'pbHr', label: 'Ø Puls der Bestzeit', type: 'number' },
  { key: 'vo2max', label: 'VO2max', type: 'number' },
  { key: 'weightKg', label: 'Gewicht (kg)', type: 'number', hint: 'für die Kohlenhydrat-Mengen' },
  { key: 'easyPace', label: 'Lockeres Tempo', hint: 'm:ss pro km' },
  { key: 'timezone', label: 'Zeitzone', hint: 'z. B. Europe/Berlin' },
]
const FIELDS = ALL_FIELDS.filter((f) => LTHR_ZONES_ENABLED || f.key !== 'lthr')

export function ProfileCard() {
  const qc = useQueryClient()
  const router = useRouter()
  const { data } = useQuery<View>({ queryKey: ['user-profile'], queryFn: () => fetch('/api/profile').then((r) => r.json()) })
  const [form, setForm] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!data) return
    const s = data.stored
    // A hidden LTHR is kept as stored; the zone model falls back to HFmax while LTHR is off.
    const zoneModel = LTHR_ZONES_ENABLED ? s?.zoneModel ?? 'hrmax' : 'hrmax'
    setForm(Object.fromEntries([...ALL_FIELDS.map((f) => [f.key, s?.[f.key] == null ? '' : String(s[f.key])]), ['zoneModel', zoneModel]]))
  }, [data])
  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Speichern fehlgeschlagen')
      return d as View
    },
    onSuccess: (d) => { qc.setQueryData(['user-profile'], d); qc.invalidateQueries(); router.refresh() },
  })
  if (!data) return null
  const isDefault = (k: ProfileField) => data.resolved.defaults.includes(k)
  return (
    <Card title={<span className="flex items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-brand" /> Mein Profil</span>}>
      <p className="text-body-sm text-muted-foreground">
        Pulszonen, Renn-Pulsgrenzen, Belastung (TRIMP) und „heute“ richten sich nach diesen Werten. Leere Felder nutzen
        Beispielwerte (markiert) – bitte durch die eigenen ersetzen.
      </p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        {FIELDS.map((f) => {
          const id = `profile-${f.key}`
          // An empty field stays empty in the form state: the example value is only the input's (muted) placeholder.
          return (
            <Field key={f.key} id={id} label={f.label} hint={f.hint} className="content-start">
              <Input id={id} aria-describedby={fieldDescribedBy(id, undefined, f.hint)}
                className="tabular-nums"
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                value={form[f.key] ?? ''}
                placeholder={isDefault(f.key) ? `Beispielwert: ${data.resolved[f.key] ?? ''}` : undefined}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </Field>
          )
        })}
        {LTHR_ZONES_ENABLED && <Field id="profile-zoneModel" label="Zonenmodell" className="content-start">
          <Select id="profile-zoneModel" value={form.zoneModel ?? 'hrmax'}
            onChange={(e) => setForm({ ...form, zoneModel: e.target.value })}>
            <option value="hrmax">Anteile der HFmax</option>
            <option value="lthr">Anteile der LTHR (Friel)</option>
          </Select>
        </Field>}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
          {save.isError && <span role="alert" className="text-caption text-error">{(save.error as Error).message}</span>}
          {save.isSuccess && !save.isPending && <span className="text-caption text-muted-foreground">Gespeichert</span>}
        </div>
      </form>
      <p className="mt-4 text-caption tabular-nums text-muted-foreground">
        Zonen{data.resolved.zoneModelUsed === 'lthr' ? ' (LTHR)' : ' (HFmax)'}:{' '}
        {data.zones.map((z) => `${z.name} ${z.min}–${z.max === 999 ? '…' : z.max}`).join(' · ')}
        {' · '}Marathon-Block unter {data.raceHr.marathon.cap}
        {data.resolved.defaults.length > 0 && <span className="block">Noch Beispielwerte, bis du sie einträgst: {ALL_FIELDS.filter((f) => data.resolved.defaults.includes(f.key)).map((f) => f.label).join(', ')}</span>}
      </p>
    </Card>
  )
}
