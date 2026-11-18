// PUT /api/running/plan-overrides took an edit for any date string: years away from the plan, or no calendar day at all
// ("2026-13-45", which the plan pages cannot even format). A save may write a day of the plan's weeks (past ones too: the
// editor edits every day of the plan) or a day within two weeks of today (that far the editor moves a session). Edits
// already stored pass unchanged, since every save sends the whole map. DB = the pg-proxy fake.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { planWeeks, weekDates } from '@/lib/plan/effective'
import { daysOutsidePlan } from '@/lib/plan/override-schema'
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
const edit = (date: string, km = 8) => ({ date, type: 'easy', km, title: 'Eigener Lauf' })

describe('Planänderungen speichern: nur an Tagen im Plan', () => {
  it('der Beispielblock deckt 28.9. bis 29.11.2026 (Voraussetzung)', () => {
    const days = planWeeks().flatMap(weekDates)
    expect(days).toContain('2026-09-29')
    expect(days).not.toContain('2031-01-01')
  })

  it('ein vergangener Tag im Plan wird gespeichert', async () => {
    const res = await put({ '2026-09-29': edit('2026-09-29') })
    expect(res.status).toBe(200)
    expect(saved()).toEqual({ '2026-09-29': edit('2026-09-29') })
  })

  it('ein Tag weit außerhalb des Plans: 400 mit dem Tag, nichts gespeichert', async () => {
    const res = await put({ '2026-10-07': edit('2026-10-07'), '2031-01-01': edit('2031-01-01') })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Kein Tag im Plan: Mi. 1.1.2031.')
    expect(saved()).toBeNull()
  })

  it('ein Datum, das es nicht gibt: 400', async () => {
    const res = await put({ '2026-13-45': edit('2026-13-45') })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Kein Tag im Plan: 2026-13-45.')
    expect(saved()).toBeNull()
  })

  it('eine früher gespeicherte Änderung außerhalb des Plans blockiert das Speichern nicht, solange sie unverändert bleibt', async () => {
    const old = { '2025-05-01': { title: 'Alter Lauf', km: 10, type: 'easy', date: '2025-05-01' } }   // key order as some writer left it
    store.set('plan_overrides', JSON.stringify(old))
    const ok = await put({ ...old, '2026-10-07': edit('2026-10-07') })
    expect(ok.status).toBe(200)
    expect(Object.keys(saved())).toEqual(['2025-05-01', '2026-10-07'])
    const changed = await put({ '2025-05-01': edit('2025-05-01', 12), '2026-10-07': edit('2026-10-07') })
    expect(changed.status).toBe(400)
    expect((await changed.json()).error).toBe('Kein Tag im Plan: Do. 1.5.2025.')
    // and it can be removed
    expect((await put({ '2026-10-07': edit('2026-10-07') })).status).toBe(200)
    expect(Object.keys(saved())).toEqual(['2026-10-07'])
  })
})

describe('Welche Tage eine Änderung tragen dürfen', () => {
  const some = (...days: string[]) => Object.fromEntries(days.map((d) => [d, { date: d, type: 'easy' as const, km: 8, title: 'Eigener Lauf' }]))

  it('jeder Tag der Planwochen, auch der erste und der letzte', () => {
    expect(daysOutsidePlan(some('2026-09-28', '2026-11-29'), {}, '2026-10-05')).toEqual([])
  })

  it('außerhalb der Planwochen nur so weit, wie der Editor verschiebt (zwei Wochen um heute)', () => {
    // A week before the plan starts: the editor offers today … today + 13 as targets, also the days before the first week.
    expect(planWeeks().flatMap(weekDates)).not.toContain('2026-09-25')
    expect(daysOutsidePlan(some('2026-09-25'), {}, '2026-09-21')).toEqual([])
    expect(daysOutsidePlan(some('2026-09-25'), {}, '2026-08-01')).toEqual(['2026-09-25'])
    expect(daysOutsidePlan(some('2026-09-06', '2026-09-07'), {}, '2026-09-21')).toEqual(['2026-09-06'])
  })

  it('kein Kalendertag: nie', () => {
    expect(daysOutsidePlan(some('2026-02-30', '2026-10-32', '2027-02-29'), {}, '2026-10-05')).toEqual(['2026-02-30', '2026-10-32', '2027-02-29'])
  })

  it('unverändert Gespeichertes geht durch, Geändertes nicht', () => {
    const stored = some('2025-05-01')
    expect(daysOutsidePlan({ ...stored }, stored, '2026-10-05')).toEqual([])
    expect(daysOutsidePlan({ '2025-05-01': { ...stored['2025-05-01'], km: 9 } }, stored, '2026-10-05')).toEqual(['2025-05-01'])
  })
})
