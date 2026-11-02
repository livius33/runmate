// The demo end to end (Phase 5): the generated athlete in an in-memory table store behind the pg-proxy fake, read
// through /demo/api by the real route handlers — so the seed's rows and JSON have exactly the shapes the dashboard
// pages read. The store understands the SQL the routes send: column lists, =, <, <=, >, >=, IN, ORDER BY, LIMIT.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTableColumns, getTableName, type Table } from 'drizzle-orm'
import { activities, activityStreams, settings, userProfile } from '@/lib/db/schema'
import { builtInBlocks, registerBuiltInBlocks } from '@/lib/plan/blocks'
import { DEMO_PROFILE, DEMO_USER_ID } from '@/lib/demo/athlete'
import { useFakeDb, type Query } from '../scope/fake-db'

type Row = Record<string, unknown>
const tables = new Map<string, Row[]>()
const put = (table: Table, rows: object[]) => {
  const cols = getTableColumns(table)
  tables.set(getTableName(table), rows.map((r) => Object.fromEntries(Object.entries({ userId: DEMO_USER_ID, ...r }).map(([k, v]) => [cols[k].name, v]))))
}

function answer(q: Query): unknown[][] {
  if (!q.sql.startsWith('select')) return []
  const m = q.sql.match(/^select ([\s\S]+?) from "(\w+)"([\s\S]*)$/)
  if (!m) return []
  const [, list, table, rest] = m
  const cols = list.split(', ').map((item) => item.trim().match(/^(?:"\w+"\.)?"(\w+)"$/)?.[1] ?? null)
  let rows = [...(tables.get(table) ?? [])]
  const p = (n: string) => q.params[Number(n) - 1]
  for (const [, col, op, n] of rest.matchAll(/"\w+"\."(\w+)" (=|>=|<=|<|>) \$(\d+)/g)) {
    const v = p(n) as never
    rows = rows.filter((r) => { const x = r[col] as never; return op === '=' ? x === v : op === '>=' ? x >= v : op === '<=' ? x <= v : op === '<' ? x < v : x > v })
  }
  for (const [, col, ns] of rest.matchAll(/"\w+"\."(\w+)" in \(([^)]*)\)/g)) {
    const vals = ns.split(',').map((s) => p(s.trim().slice(1)))
    rows = rows.filter((r) => vals.includes(r[col]))
  }
  const order = rest.match(/order by "\w+"\."(\w+)"( desc)?/)
  if (order) rows.sort((a, b) => String(a[order[1]]).localeCompare(String(b[order[1]])) * (order[2] ? -1 : 1))
  const limit = rest.match(/limit \$(\d+)/)
  if (limit) rows = rows.slice(0, Number(p(limit[1])))
  return rows.map((r) => cols.map((c) => (c ? r[c] ?? null : null)))
}

const fake = useFakeDb(answer)
const saved = builtInBlocks()
let today = ''
let story: { missedKey: string; overdoWeek: string } = { missedKey: '', overdoWeek: '' }
let runId = ''
beforeAll(async () => {
  registerBuiltInBlocks([])
  process.env.DEMO_MODE = '1'
  const { runAsUser } = await import('@/lib/server/scope')
  const { generateDemo } = await import('@/lib/demo/generate')
  const { todayLocal } = await import('@/lib/dates')
  const d = await runAsUser(DEMO_USER_ID, async () => { today = todayLocal(); return generateDemo(today) }, { profile: DEMO_PROFILE })
  story = d.story
  put(userProfile, [{ ...d.profile, updatedAt: 0 }])
  put(settings, Object.entries(d.settings).map(([key, v]) => ({ key, value: JSON.stringify(v) })))
  put(activities, d.activities)
  put(activityStreams, d.streams)
  runId = d.streams[d.streams.length - 1].activityId
})
afterAll(() => { registerBuiltInBlocks(saved); delete process.env.DEMO_MODE; fake.restore() })

const { GET } = await import('@/app/demo/api/[...path]/route')
const get = async (path: string) => {
  const [p, search = ''] = path.split('?')
  const res = await GET(new Request(`http://localhost/demo/api/${path}`), { params: Promise.resolve({ path: p.split('/') }) })
  expect(res.status, `${path}: ${res.status}`).toBe(200)
  void search
  return res.json()
}

describe('Demo über die echten Routen', () => {
  it('Läufe: Liste und ein Lauf mit Streams, Metriken und Feedback', async () => {
    const runs = await get('running/runs')
    const list = Array.isArray(runs) ? runs : runs.runs
    expect(list.length).toBeGreaterThan(40)
    const one = await get(`running/runs/${runId}`)
    expect(one.metrics.splits.length).toBeGreaterThan(3)
    expect(one.route.length).toBeGreaterThan(100)                  // the Alster loop on the map
    expect(one.series.filter((x: { hr: number | null; pace: number | null }) => x.hr && x.pace).length).toBeGreaterThan(100)
  })

  it('Plan: Block, Engine-Protokoll (verpasst, Ermüdungsschutz), Pause, Ist-Werte', async () => {
    const engine = await get('running/plan-engine')
    expect(engine.log.map((c: { rule: string }) => c.rule)).toEqual(expect.arrayContaining(['missed-key', 'fatigue']))
    const pauses = await get('running/plan-pauses')
    expect(JSON.stringify(pauses)).toContain('krank')
    const actuals = await get('running/plan-actuals')
    expect(actuals.length).toBeGreaterThan(40)
    const plan = await get('running/plan')
    expect(JSON.stringify(plan)).toContain('Hamburg HM')
  })

  it('Analyse, Form, Saison, Feedback, Kreuztraining', async () => {
    const stats = await get('running/stats')
    expect(stats.acwr).toBeGreaterThan(0)
    const fitness = await get('running/fitness')
    expect(fitness.length).toBeGreaterThan(60)
    await get('running/progress')
    await get('running/analytics')
    const season = await get('season')
    expect(season.goals.some((g: { name: string }) => g.name === 'Hamburg HM')).toBe(true)
    const week = await get('feedback/week')
    expect(JSON.stringify(week)).toContain('zu viel gewollt')
    const cross = await get('cross-training')
    expect(cross.length).toBeGreaterThanOrEqual(3)
    await get('running/feedback')
  })

  it('Plan anpassen und Entwürfe lesen ohne zu schreiben', async () => {
    fake.log.length = 0
    await get('running/workshop')
    await get('running/drafts')
    expect(fake.log.filter((q) => !q.sql.startsWith('select'))).toEqual([])
    expect(story.missedKey < today).toBe(true)
  })
})
