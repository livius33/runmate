import { NextResponse } from 'next/server'
import { addDays, format, parseISO } from 'date-fns'
import { todayLocal } from '@/lib/dates'
import { BASELINE_DAYS } from '@/lib/analytics/recovery-data'
import { loadRecoveryNights } from '@/lib/wellness/store'
import { hasWellnessSource } from '@/lib/sources/registry'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

// Nights for the Heute-Karte and the readiness / Erholung line: the last `days` mornings plus the 28 before them
// (baselines). { available: false } without a source that delivers nights and without stored nights, or before the
// wellness_days migration: the cards then show nothing about sleep.
export const GET = withUser(async (req: Request) => {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 7))
  const from = format(addDays(parseISO(todayLocal()), -(days + BASELINE_DAYS)), 'yyyy-MM-dd')
  try {
    const { table, nights } = await loadRecoveryNights(from)
    const available = table && (nights.length > 0 || await hasWellnessSource())
    return NextResponse.json({ available, nights: available ? nights : [] })
  } catch (err: any) {
    console.error('[running/wellness]', err?.message)
    return NextResponse.json({ available: false, nights: [] })
  }
})
