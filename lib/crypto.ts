// Secrets at rest (Phase 2): AES-256-GCM with the app key from ENCRYPTION_KEY (32 bytes, base64 or hex). Used for each
// user's Garmin credentials and session. Values are never logged; errors say what failed, never what was encrypted.
//   Generate a key:  openssl rand -base64 32
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const VERSION = 'v1'
const TAG_BYTES = 16                 // GCM tag length, pinned on decrypt so a shortened tag is refused

export function encryptionKey(raw = process.env.ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error('ENCRYPTION_KEY is not set (32 bytes, base64 or hex; see .env.example)')
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64 or hex)')
  return key
}

// 'v1.<iv>.<tag>.<ciphertext>', each part base64url. A fresh 12-byte IV per value.
export function encrypt(plain: string, key = encryptionKey()): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [VERSION, iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

export function decrypt(sealed: string, key = encryptionKey()): string {
  const [v, iv, tag, body] = sealed.split('.')
  if (v !== VERSION || !iv || !tag || body == null) throw new Error('Encrypted value has an unknown format')
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), { authTagLength: TAG_BYTES })
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8')
  } catch {
    throw new Error('Encrypted value could not be decrypted (wrong ENCRYPTION_KEY or tampered value)')
  }
}
