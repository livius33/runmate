// AC-6 (12-04): /api/waitlist and /api/health/:token (and /api/import) stop reading a body at their byte limit and
// answer 413.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { HEALTH_BODY_BYTES, WAITLIST_BODY_BYTES, readBody, readJson } from '@/lib/server/body'
import { MAX_IMPORT_BODY_BYTES } from '@/lib/sources/file'
import { useFakeDb } from '../scope/fake-db'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user-b' }) }))
vi.mock('@/lib/links/tokens', async (orig) => ({ ...(await orig<typeof import('@/lib/links/tokens')>()), userForLinkToken: async () => 'user-b' }))
const fake = useFakeDb()
afterAll(() => fake.restore())

// A body that streams `chunks` pieces of `size` bytes without a Content-Length, counting what was pulled.
function streamed(chunks: number, size: number) {
  const pulled = { n: 0, cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    pull(c) { if (pulled.n++ < chunks) c.enqueue(new Uint8Array(size).fill(32)); else c.close() },
    cancel() { pulled.cancelled = true },
  })
  return { body, pulled }
}
const post = (url: string, body: BodyInit, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', body, headers, duplex: 'half' } as RequestInit)

describe('readBody', () => {
  it('innerhalb der Grenze: der ganze Body', async () => {
    expect(await readBody(post('http://x/', 'hallo'), 5)).toEqual(new TextEncoder().encode('hallo'))
    expect(await readJson(post('http://x/', '{"a":1}'), 100)).toEqual({ ok: true, value: { a: 1 } })
    expect(await readJson(post('http://x/', '{kaputt'), 100)).toEqual({ ok: true, value: null })
  })

  it('Content-Length über der Grenze: nichts gelesen', async () => {
    const { body, pulled } = streamed(100, 1024)
    expect(await readBody(post('http://x/', body, { 'content-length': String(100 * 1024) }), 1024)).toBeNull()
    expect(pulled.n).toBeLessThanOrEqual(1)                  // at most what the stream buffers on creation
  })

  it('ohne Content-Length: Lesen hört an der Grenze auf', async () => {
    const { body, pulled } = streamed(1000, 1024)
    expect(await readBody(post('http://x/', body), 4 * 1024)).toBeNull()
    expect(pulled.n).toBeLessThan(10)
    expect(pulled.cancelled).toBe(true)
  })
})

describe('Routen', () => {
  it('Warteliste: über 8 KB → 413; ein normales Formular wie bisher', async () => {
    const { POST } = await import('@/app/api/waitlist/route')
    const big = new URLSearchParams({ email: 'a@example.com', website: 'x'.repeat(WAITLIST_BODY_BYTES) }).toString()
    const form = { 'content-type': 'application/x-www-form-urlencoded' }
    expect((await POST(post('https://runmate.test/api/waitlist', big, form))).status).toBe(413)
    const { body } = streamed(100, 1024)
    expect((await POST(post('https://runmate.test/api/waitlist', body, form))).status).toBe(413)
    const ok = await POST(post('https://runmate.test/api/waitlist', 'email=a%40example.com&locale=de', form))
    expect(ok.status).toBe(303)                                 // no DATABASE_URL here: the status page "error"
  })

  it('Apple-Health-Link: über 1 MB → 413, nichts geschrieben; kleiner Body wird geprüft wie bisher', async () => {
    const { POST } = await import('@/app/api/health/[token]/route')
    const params = { params: Promise.resolve({ token: 'a'.repeat(32) }) }
    const { body } = streamed(HEALTH_BODY_BYTES / 1024 + 10, 1024)
    const res = await POST(post('http://x/api/health/t', body), params)
    expect(res.status).toBe(413)
    expect(fake.log.filter((q) => /^(insert|update|delete)/.test(q.sql))).toEqual([])
    expect((await POST(post('http://x/api/health/t', '{"date":"kein Datum"}'), params)).status).toBe(400)
  })

  it('Import: über der Grenze → 413', async () => {
    const { POST } = await import('@/app/api/import/route')
    const res = await POST(post('http://x/api/import', 'x', { 'content-length': String(MAX_IMPORT_BODY_BYTES + 1), 'content-type': 'multipart/form-data; boundary=b' }))
    expect(res.status).toBe(413)
  })
})
