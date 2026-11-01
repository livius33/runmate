'use client'

import { useEffect, useState } from 'react'
import { todayInHamburg } from './dates'

// Dev only: ?heute=YYYY-MM-DD simulates a day (e.g. race week). Ignored in production.
function devOverride(): string | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('heute')
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

// Today's Hamburg date; re-checked every minute so an open page rolls over at midnight.
export function useToday() {
  const [today, setToday] = useState(() => todayInHamburg())
  useEffect(() => {
    const override = devOverride()
    if (override) { setToday(override); return }
    const id = setInterval(() => setToday((t) => (t === todayInHamburg() ? t : todayInHamburg())), 60_000)
    return () => clearInterval(id)
  }, [])
  return today
}
