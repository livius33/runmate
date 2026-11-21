// The token class names merge as what they are (lib/utils.ts): a size next to a colour stays, two sizes collapse.
import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn mit Design-Tokens', () => {
  it('Größe und Farbe bleiben nebeneinander', () => {
    expect(cn('text-caption', 'text-muted-foreground')).toBe('text-caption text-muted-foreground')
    expect(cn('text-body-sm text-warning', 'text-error')).toBe('text-body-sm text-error')
  })
  it('die spätere Größe, der spätere Radius, der spätere Schatten gewinnt', () => {
    expect(cn('text-caption', 'text-title')).toBe('text-title')
    expect(cn('rounded-control', 'rounded-card')).toBe('rounded-card')
    expect(cn('shadow-hairline', 'shadow-raised')).toBe('shadow-raised')
  })
})
