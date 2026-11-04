// Phase 7: Neon hosts keep the HTTP driver, every other Postgres (Docker Compose) uses node-postgres.
import { describe, expect, it } from 'vitest'
import { driverFor } from '@/lib/db'

describe('driverFor', () => {
  it('Neon host → neon-http', () => {
    expect(driverFor('postgresql://u:p@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/db?sslmode=require', '')).toBe('neon')
  })
  it('any other Postgres → node-postgres', () => {
    expect(driverFor('postgres://runmate:runmate@db:5432/runmate', '')).toBe('pg')
    expect(driverFor('postgres://u@localhost/runmate', undefined)).toBe('pg')
    expect(driverFor('not a url', '')).toBe('pg')
  })
  it('DATABASE_DRIVER overrides the guess', () => {
    expect(driverFor('postgres://u@db.example.com/x', 'neon')).toBe('neon')
    expect(driverFor('postgresql://u@ep-x.neon.tech/db', 'pg')).toBe('pg')
  })
})
