'use client'

import { useEffect, useState } from 'react'
import { todayLocal } from './dates'

// Dev only: ?heute=YYYY-MM-DD simulates a day (e.g. race week). Ignored in production.
function devOverride(): string | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('heute')
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

// Today's date in the runner's time zone; re-checked every minute so an open page rolls over at midnight.
export function useToday() {
  const [today, setToday] = useState(() => todayLocal())
  useEffect(() => {
    const override = devOverride()
    if (override) { setToday(override); return }
    const id = setInterval(() => setToday((t) => (t === todayLocal() ? t : todayLocal())), 60_000)
    return () => clearInterval(id)
  }, [])
  return today
}
