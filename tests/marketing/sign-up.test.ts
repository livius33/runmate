// AC-1 (12-04): /sign-up shows Clerk's sign-up once billing is live and leads to the waitlist before; the variable
// that tells Clerk where it lives is documented.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@clerk/nextjs', () => ({ SignUp: () => null }))
const nav = vi.hoisted(() => ({ to: null as string | null }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { nav.to = to; throw new Error('NEXT_REDIRECT') } }))

const { SignUp } = await import('@clerk/nextjs')
const { default: SignUpPage } = await import('@/app/sign-up/[[...sign-up]]/page')
const ROOT = join(__dirname, '..', '..')

// Every element type in a rendered tree (function components are not called, only collected).
function types(node: unknown, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== 'object') return out
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (el.type) out.push(el.type)
  const kids = el.props?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) types(k, out)
  return out
}

afterEach(() => { delete process.env.BILLING_ENABLED; nav.to = null })

describe('Registrierung /sign-up', () => {
  it('Billing aus: weiter zur Warteliste, kein Clerk-Formular', () => {
    expect(() => SignUpPage()).toThrow('NEXT_REDIRECT')
    expect(nav.to).toBe('/#warteliste')
  })

  it('Billing an: Clerks Registrierung', () => {
    process.env.BILLING_ENABLED = '1'
    const tree = SignUpPage()
    expect(nav.to).toBeNull()
    expect(types(tree)).toContain(SignUp)
  })

  it('NEXT_PUBLIC_CLERK_SIGN_UP_URL steht in .env.example und im Runbook', () => {
    for (const f of ['.env.example', 'docs/launch/DEPLOY.md']) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).toMatch(/NEXT_PUBLIC_CLERK_SIGN_UP_URL.*\/sign-up/)
    }
  })
})
