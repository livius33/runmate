// AC-5 (Phase 2): Garmin secrets are AES-256-GCM encrypted with ENCRYPTION_KEY.
import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { decrypt, encrypt, encryptionKey } from '@/lib/crypto'

const key = randomBytes(32)

describe('Verschlüsselung (AES-256-GCM)', () => {
  it('ver- und entschlüsselt, jedes Mal mit neuem IV', () => {
    const a = encrypt('läufer@example.com', key), b = encrypt('läufer@example.com', key)
    expect(a).not.toBe(b)
    expect(a).not.toContain('example')
    expect(decrypt(a, key)).toBe('läufer@example.com')
  })

  it('erkennt Manipulation und falschen Schlüssel', () => {
    const sealed = encrypt('geheim', key)
    const [v, iv, tag, body] = sealed.split('.')
    const flipped = Buffer.from(body, 'base64url'); flipped[0] ^= 1
    expect(() => decrypt([v, iv, tag, flipped.toString('base64url')].join('.'), key)).toThrow(/could not be decrypted/)
    expect(() => decrypt(sealed, randomBytes(32))).toThrow(/could not be decrypted/)
    expect(() => decrypt('kaputt', key)).toThrow(/unknown format/)
  })

  it('Schlüssel aus ENCRYPTION_KEY: 32 Byte als base64 oder hex', () => {
    expect(encryptionKey(key.toString('base64'))).toEqual(key)
    expect(encryptionKey(key.toString('hex'))).toEqual(key)
    expect(() => encryptionKey('')).toThrow(/not set/)
    expect(() => encryptionKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/)
  })
})
