// 08-02 follow-up: saveHealth writes the day, the day's workouts and the last-upload record one after the other, with
// no transaction. What is left when one of these writes fails, and what the next upload makes of it. The workouts
// table is held in memory and fed by the SQL the store sends.
import { afterEach, describe, expect, it } from 'vitest'
import { saveHealth } from '@/lib/health/store'
import type { HealthWorkoutInput } from '@/lib/health/parse'
import { runAsUser } from '@/lib/server/scope'
import { useFakeDb, type Query } from '../scope/fake-db'

interface Row { user: string; id: string; date: string; minutes: number }

// `before` sees every query first and may throw (a database error at that point).
function fakeWorkouts(rows: Row[], before: (q: Query) => void = () => {}) {
  return useFakeDb((q: Query) => {
    before(q)
    const param = (token: string) => q.params[Number(token.slice(1)) - 1]
    if (/^insert into "health_workouts"/.test(q.sql)) {
      const [head, conflict = ''] = q.sql.split(' on conflict ')
      const cols = head.match(/\(([^)]+)\) values/)![1].split(', ').map((c) => c.replace(/"/g, ''))
      const sent = [...head.split(' values ')[1].matchAll(/\(([^)]+)\)/g)].map((m) => Object.fromEntries(m[1].split(', ').map((t, i) => [cols[i], t.startsWith('$') ? param(t) : null])))
      const updated = [...conflict.matchAll(/"(\w+)" = excluded/g)].map((m) => m[1])
      // Postgres refuses a statement that would update the same row twice.
      if (updated.length && new Set(sent.map((v) => v.id)).size < sent.length) throw new Error('ON CONFLICT DO UPDATE command cannot affect row a second time')
      for (const v of sent) {
        const old = rows.find((r) => r.user === v.user_id && r.id === v.id)
        if (!old) rows.push({ user: String(v.user_id), id: String(v.id), date: String(v.date), minutes: Number(v.minutes) })
        else if (updated.includes('minutes')) old.minutes = Number(v.minutes)
      }
      return []
    }
    if (/^delete from "health_workouts"/.test(q.sql)) {
      const list = (re: RegExp) => q.sql.match(re)?.[1].split(', ').map(param)
      const user = param(q.sql.match(/"user_id" = (\$\d+)/)![1])
      const days = list(/"date" in \(([^)]+)\)/)!, keep = list(/"id" not in \(([^)]+)\)/) ?? []
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user === user && days.includes(rows[i].date) && !keep.includes(rows[i].id)) rows.splice(i, 1)
      return []
    }
    return []
  })
}

const DAY = { date: '2026-05-10', sleepMin: null, restingHr: null, hrvMs: null, steps: 8000, activeKcal: null, weightKg: null }
const w = (id: string, minutes: number, date = DAY.date): HealthWorkoutInput => ({ id, date, type: 'Yoga', start: `${date}T08:00:00+02:00`, minutes, kcal: null, avgHr: null })
const stored = (): Row[] => [
  { user: 'user-a', id: 'yoga', date: '2026-05-10', minutes: 30 },
  { user: 'user-a', id: 'kraft', date: '2026-05-10', minutes: 45 },
  { user: 'user-a', id: 'vortag', date: '2026-05-09', minutes: 20 },
  { user: 'user-b', id: 'yoga', date: '2026-05-10', minutes: 99 },
]
const asUser = <T>(fn: () => Promise<T>) => runAsUser('user-a', fn, { profile: null })
const mineOn = (rows: Row[], date: string) => rows.filter((r) => r.user === 'user-a' && r.date === date).map((r) => [r.id, r.minutes]).sort()
const failOn = (re: RegExp) => { let done = false; return (q: Query) => { if (!done && re.test(q.sql)) { done = true; throw new Error('connection lost') } } }

let fake: ReturnType<typeof useFakeDb>
afterEach(() => fake.restore())

describe('saveHealth: ein Schreibfehler mittendrin', () => {
  const UPLOAD = [w('yoga', 35), w('schwimmen', 40)]             // yoga corrected, swim new, strength no longer sent
  const lastUploads = () => fake.log.filter((q) => /^insert into "settings"/.test(q.sql))

  it('ein erneutes Senden ersetzt den Tag: geändert, neu, entfernt; andere Tage und Nutzer bleiben', async () => {
    const rows = stored()
    fake = fakeWorkouts(rows)
    expect(await asUser(() => saveHealth(DAY, UPLOAD))).toBe(3)
    expect(mineOn(rows, '2026-05-10')).toEqual([['schwimmen', 40], ['yoga', 35]])
    expect(mineOn(rows, '2026-05-09')).toEqual([['vortag', 20]])
    expect(rows.filter((r) => r.user === 'user-b')).toEqual([{ user: 'user-b', id: 'yoga', date: '2026-05-10', minutes: 99 }])
    expect(lastUploads()).toHaveLength(1)
    // Nothing is removed before its replacement is stored; the last-upload record comes last.
    expect(fake.log.map((q) => q.sql.match(/^(?:insert into|delete from) "\w+"/)?.[0])).toEqual(['insert into "health_days"', 'insert into "health_workouts"', 'delete from "health_workouts"', 'insert into "settings"'])
    expect(fake.log[2].sql).toContain('"health_workouts"."user_id" = $1 and "health_workouts"."date" in ($2) and "health_workouts"."id" not in ($3, $4)')
  })

  it('die neuen Workouts lassen sich nicht schreiben: die gespeicherten des Tages bleiben, kein „letzter Upload“', async () => {
    const rows = stored()
    fake = fakeWorkouts(rows, failOn(/^insert into "health_workouts"/))
    await expect(asUser(() => saveHealth(DAY, UPLOAD))).rejects.toThrow('connection lost')
    expect(mineOn(rows, '2026-05-10')).toEqual([['kraft', 45], ['yoga', 30]])       // before: the day was left empty
    expect(lastUploads()).toEqual([])
    // The Shortcut sends again: the day is as sent.
    await asUser(() => saveHealth(DAY, UPLOAD))
    expect(mineOn(rows, '2026-05-10')).toEqual([['schwimmen', 40], ['yoga', 35]])
    expect(lastUploads()).toHaveLength(1)
  })

  it('das Aufräumen scheitert: nichts fehlt, das Überzählige räumt der nächste Upload weg', async () => {
    const rows = stored()
    fake = fakeWorkouts(rows, failOn(/^delete from "health_workouts"/))
    await expect(asUser(() => saveHealth(DAY, UPLOAD))).rejects.toThrow('connection lost')
    for (const sent of [['schwimmen', 40], ['yoga', 35]]) expect(mineOn(rows, '2026-05-10')).toContainEqual(sent)
    expect(lastUploads()).toEqual([])
    await asUser(() => saveHealth(DAY, UPLOAD))
    expect(mineOn(rows, '2026-05-10')).toEqual([['schwimmen', 40], ['yoga', 35]])
  })

  it('leere Liste leert den Tag, keine Liste lässt die Workouts stehen; doppelte Einträge: der erste zählt', async () => {
    const rows = stored()
    fake = fakeWorkouts(rows)
    await asUser(() => saveHealth(DAY, null))
    expect(mineOn(rows, '2026-05-10')).toEqual([['kraft', 45], ['yoga', 30]])
    // Counted once as well: steps + one workout, in the answer and in the last-upload record.
    expect(await asUser(() => saveHealth(DAY, [w('yoga', 35), w('yoga', 50), w('yoga', 50)]))).toBe(2)
    expect(JSON.parse(String(lastUploads().at(-1)!.params.find((p) => /"values"/.test(String(p)))))).toMatchObject({ date: DAY.date, values: 2 })
    expect(mineOn(rows, '2026-05-10')).toEqual([['yoga', 35]])
    await asUser(() => saveHealth(DAY, []))
    expect(mineOn(rows, '2026-05-10')).toEqual([])
    expect(mineOn(rows, '2026-05-09')).toEqual([['vortag', 20]])
  })
})
