// PUT /api/running/plan-overrides stored an entry whose own `date` named another day than its key
// ({ "2026-10-07": { date: "2026-10-09", … } }). The key names the day: every reader goes by it and effectiveSessions
// overwrites `date` with it, so the edit showed on the 7th while the stored map said the 9th. A save now writes the key
// as the entry's date. Not refused: the plan shows exactly what the editor showed, and an entry stored before must
// never block the saves after it. DB = the pg-proxy fake.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectiveSessions } from '@/lib/plan/effective'
import { SavedOverrides, daysOutsidePlan } from '@/lib/plan/override-schema'
import { useFakeDb, type Query } from '../scope/fake-db'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_r' }) }))
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-05T10:00:00Z'))            // Monday of the example block's second week

const store = new Map<string, string>()
const fake = useFakeDb((q: Query) => {
  if (/^insert into "settings"/.test(q.sql)) { store.set(String(q.params[1]), String(q.params[2])); return [] }
  if (/^select .* from "settings"/.test(q.sql)) {
    const keys = q.params.slice(1).map(String)
    return [...store].filter(([k]) => keys.includes(k)).map(([k, v]) => (/select "value"/.test(q.sql) ? [v] : [k, v]))
  }
  return []
})
afterAll(() => { fake.restore(); vi.useRealTimers() })
beforeEach(() => store.clear())

const { PUT } = await import('@/app/api/running/plan-overrides/route')
const put = (overrides: unknown) => PUT(new Request('http://localhost/api/running/plan-overrides', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides }) }))
const saved = () => JSON.parse(store.get('plan_overrides') ?? 'null')
const edit = (date: string, km = 8) => ({ date, type: 'easy' as const, km, title: 'Eigener Lauf' })

describe('Planänderungen speichern: der Schlüssel ist der Tag', () => {
  const WED = '2026-10-07', FRI = '2026-10-09'

  it('ein Eintrag mit anderem Datum wird unter seinem Schlüssel mit dessen Datum gespeichert', async () => {
    const res = await put({ [WED]: edit(FRI) })
    expect(res.status).toBe(200)
    expect(saved()).toEqual({ [WED]: edit(WED) })
    // what the plan shows is what is stored: the run on Wednesday, Friday still the plan's rest day
    const plan = effectiveSessions(saved())
    expect(plan.find((s) => s.date === WED)).toMatchObject({ km: 8, title: 'Eigener Lauf' })
    expect(plan.find((s) => s.date === FRI)).toMatchObject({ type: 'rest' })
  })

  it('ein Datum im Eintrag, das es nicht gibt, ebenso; ein kaputtes Format bleibt ungültig', async () => {
    expect((await put({ [WED]: edit('2026-13-45') })).status).toBe(200)
    expect(saved()[WED].date).toBe(WED)
    const res = await put({ [WED]: edit('morgen') })
    expect([res.status, (await res.json()).error]).toEqual([400, 'Die Änderung am Mi. 7.10.2026 ist ungültig.'])
  })

  it('die behaltene Tempo-Einheit eines Zone-2-Tags behält ihr Datum: ein verschobener Tag trägt sie von dort', () => {
    const z2 = { ...edit(WED), title: 'Locker (Z2)', was: { date: '2026-10-06', type: 'tempo' as const, km: 8, title: 'Schwelle', pace: '4:15' } }
    expect(SavedOverrides.parse({ [WED]: z2 })).toEqual({ [WED]: z2 })
  })

  it('früher mit anderem Datum Gespeichertes außerhalb des Plans blockiert das Speichern nicht', async () => {
    const old = { '2025-05-01': edit('2025-05-03', 10) }
    store.set('plan_overrides', JSON.stringify(old))
    expect(daysOutsidePlan(SavedOverrides.parse(old), old, '2026-10-05')).toEqual([])
    expect((await put({ ...old, [WED]: edit(WED) })).status).toBe(200)
    expect(saved()).toEqual({ '2025-05-01': edit('2025-05-01', 10), [WED]: edit(WED) })
    expect((await put(saved())).status).toBe(200)
  })
})
