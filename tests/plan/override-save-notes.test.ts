// One note over 1000 characters fails the whole save (every save sends all edits). The answer was "Invalid overrides":
// no day, not German, and the editor showed only "konnte nicht gespeichert werden". The save still fails as a whole
// (nothing is cut on the server), but the answer names the day. DB = the pg-proxy fake.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTES_MAX, SavedOverrides, saveError } from '@/lib/plan/override-schema'
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
const put = (body: unknown) => PUT(new Request('http://localhost/api/running/plan-overrides', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify({ overrides: body }) }))
const saved = () => JSON.parse(store.get('plan_overrides') ?? 'null')
const TUE = '2026-10-06', WED = '2026-10-07'
const edit = (date: string, notes?: string) => ({ date, type: 'easy', km: 8, title: 'Eigener Lauf', ...(notes == null ? {} : { notes }) })

describe('Planänderungen speichern: zu lange Notiz', () => {
  it('genau 1000 Zeichen werden gespeichert', async () => {
    expect(NOTES_MAX).toBe(1000)
    const res = await put({ [TUE]: edit(TUE, 'x'.repeat(1000)) })
    expect(res.status).toBe(200)
    expect(saved()[TUE].notes).toHaveLength(1000)
  })

  it('1001 Zeichen: 400, die Antwort nennt den Tag, nichts wird gespeichert oder gekürzt', async () => {
    const res = await put({ [TUE]: edit(TUE), [WED]: edit(WED, 'x'.repeat(1001)) })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Die Notiz am Mi. 7.10.2026 ist zu lang (höchstens 1000 Zeichen).')
    expect(saved()).toBeNull()
  })

  it('auch die Notiz der Tempoeinheit hinter einem Zone-2-Tag', async () => {
    const res = await put({ [TUE]: { ...edit(TUE), was: { date: TUE, type: 'tempo', km: 17, title: 'Schwelle', notes: 'x'.repeat(1001) } } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Die Notiz am Di. 6.10.2026 ist zu lang (höchstens 1000 Zeichen).')
  })

  it('andere ungültige Änderungen: deutsch, mit dem Tag, wenn er bekannt ist', async () => {
    const day = await put({ [TUE]: { ...edit(TUE), km: 500 } })
    expect(day.status).toBe(400)
    expect((await day.json()).error).toBe('Die Änderung am Di. 6.10.2026 ist ungültig.')
    const body = await put('kein JSON')
    expect(body.status).toBe(400)
    expect((await body.json()).error).toBe('Die Änderung ist ungültig.')
    expect(saved()).toBeNull()
  })

  it('der Text zur Meldung (rein)', () => {
    const bad = SavedOverrides.safeParse({ [TUE]: edit(TUE, 'x'.repeat(1500)), [WED]: { ...edit(WED), km: -1 } })
    expect(bad.success).toBe(false)
    // the note comes first, wherever it stands in the list
    if (!bad.success) expect(saveError(bad.error.issues)).toBe('Die Notiz am Di. 6.10.2026 ist zu lang (höchstens 1000 Zeichen).')
  })
})
