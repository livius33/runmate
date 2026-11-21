// Request bodies read with a byte limit (12-04). Vercel caps a body at 4.5 MB; a self-hosted server (standalone output)
// caps nothing, so an anonymous client could push any size into memory. Reading stops at the limit: a declared
// Content-Length over it is refused before anything is read, a stream that runs past it is cancelled.
import { NextResponse } from 'next/server'

export const WAITLIST_BODY_BYTES = 8 * 1024                // email, locale, honeypot
export const HEALTH_BODY_BYTES = 1024 * 1024               // one day of Apple Health values and up to 200 workouts

// The body, or null when it is larger than `maxBytes`.
export async function readBody(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (!req.body) return new Uint8Array(0)
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.byteLength }
  return out
}

export type Limited<T> = { ok: true; value: T } | { ok: false }

// JSON within the limit; `value` is null when the body is no JSON (as `req.json().catch(() => null)` was).
export async function readJson(req: Request, maxBytes: number): Promise<Limited<unknown>> {
  const bytes = await readBody(req, maxBytes)
  if (!bytes) return { ok: false }
  try { return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) } } catch { return { ok: true, value: null } }
}

// multipart/form-data or urlencoded within the limit; `value` is null when the body is no form.
export async function readForm(req: Request, maxBytes: number): Promise<Limited<FormData | null>> {
  const bytes = await readBody(req, maxBytes)
  if (!bytes) return { ok: false }
  const parsed = new Response(bytes as BodyInit, { headers: { 'content-type': req.headers.get('content-type') ?? '' } })
  return { ok: true, value: await parsed.formData().catch(() => null) }
}

export function tooLargeResponse(maxBytes: number) {
  const size = maxBytes >= 1024 * 1024 ? `${Math.round(maxBytes / 1024 / 1024)} MB` : `${Math.round(maxBytes / 1024)} KB`
  return NextResponse.json({ error: `Anfrage zu groß (höchstens ${size}).` }, { status: 413 })
}
