// One "today" for the whole app: the calendar date in Hamburg (Europe/Berlin), on the server
// (Vercel runs in UTC) and in the browser alike.
import { parseISO } from 'date-fns'

export const TIME_ZONE = 'Europe/Berlin'

// 'YYYY-MM-DD' in Hamburg.
export function todayInHamburg(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE }).format(now)
}

// Hamburg's date as a Date at local midnight, for date-fns arithmetic (weeks, 7/28-day windows).
export function hamburgDate(now = new Date()) {
  return parseISO(todayInHamburg(now))
}
