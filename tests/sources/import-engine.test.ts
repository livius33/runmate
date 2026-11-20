// 08-02 follow-up: the file import adapts the plan after the last batch whenever a stored run changed, not only when
// a row was new. Through the real route handler against the fake database; the importer and the engine are stand-ins
// (the report decides, the engine records for whom it ran).
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentScope } from '@/lib/scope'
import { runAsUser } from '@/lib/server/scope'
import type { ImportReport } from '@/lib/sources/file/import'
import { useFakeDb } from '../scope/fake-db'

const engine = vi.hoisted(() => ({ runs: [] as string[], fail: false }))
vi.mock('@/lib/plan/engine-store', () => ({
  runAndSaveEngine: async () => {
    engine.runs.push(String(currentScope().userId))
    if (engine.fail) throw new Error('engine down')
    return { log: [] }
  },
}))
vi.mock('@/lib/plan/live-blocks', () => ({ ensureLiveBlocks: async () => {} }))
const report = vi.hoisted(() => ({ next: null as unknown }))
vi.mock('@/lib/sources/file/import', () => ({ importFiles: async () => report.next }))

const { POST } = await import('@/app/api/import/route')

const fake = useFakeDb(() => [])
afterAll(() => fake.restore())
beforeEach(() => { fake.log.length = 0; engine.runs.length = 0; engine.fail = false })

const counts = (o: Partial<ImportReport>): ImportReport => ({ files: 1, inserted: 0, replaced: 0, duplicates: 0, repaired: 0, skipped: 0, errors: [], ...o })
const upload = (query = '?final=1') => {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array([1, 2, 3])]), 'run.fit')
  return runAsUser('user-a', () => POST(new Request(`http://localhost/api/import${query}`, { method: 'POST', body: form })), { profile: null })
}

describe('Datei-Import: der Plan wird nach dem letzten Teil angepasst', () => {
  it.each([
    ['neu', { inserted: 1 }],
    ['ersetzt (die reichere Datei statt des vorhandenen Eintrags)', { replaced: 1 }],
    ['vervollständigt', { repaired: 1 }],
  ])('%s: die Engine läuft', async (_name, o) => {
    report.next = counts(o)
    const res = await upload()
    expect(await res.json()).toMatchObject({ ok: true, ...o })
    expect(engine.runs).toEqual(['user-a'])
  })

  it('nur Dubletten, übersprungene Sportarten oder Fehler: nichts hat sich geändert, keine Engine', async () => {
    report.next = counts({ duplicates: 2, skipped: 1, errors: [{ name: 'x.fit', message: 'x.fit: Datei konnte nicht importiert werden.' }] })
    expect((await upload()).status).toBe(200)
    expect(engine.runs).toEqual([])
  })

  it('nicht der letzte Teil: noch keine Engine; scheitert sie am Ende, bleibt der Import ein Erfolg', async () => {
    report.next = counts({ replaced: 3 })
    await upload('')
    expect(engine.runs).toEqual([])
    engine.fail = true
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await upload()
      expect([res.status, (await res.json()).replaced]).toEqual([200, 3])
    } finally { errors.mockRestore() }
    expect(engine.runs).toEqual(['user-a'])
  })
})
