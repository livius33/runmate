// The training plan as an iCalendar feed (RFC 5545): one all-day event per day, stable UIDs per date so
// Apple Calendar updates an event when the plan changes instead of adding a new one. Pure.
import { addDays, format, parseISO } from 'date-fns'
import { type PlanSession } from '@/lib/plan/types'
import { fmtKm } from '@/lib/plan/format'
import { timeZone } from '@/lib/dates'
import { TYPE_LABEL } from '@/components/plan/ui'
import { sessionTargets } from '@/lib/insights/today'
import { describeStructure, sessionStructure } from '@/lib/plan/structure'

const PRODID = '-//Runmate//Trainingsplan//DE'

// Escape text values and fold lines at 75 octets (continuation lines start with a space).
// Older plan history (stored in the DB) can carry session types the labels do not know.
const typeLabel = (t: string) => (TYPE_LABEL as Record<string, string>)[t] ?? 'Training'
// RFC 5545 §3.3.11: backslash, semicolon and comma escaped; every line break (CRLF, CR or LF) becomes a literal \n.
export const esc = (s: string | undefined | null) =>
  (s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
function fold(line: string) {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (out.length ? 74 : 75)) { out.push(cur); cur = '' }
    cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function eventTitle(s: PlanSession) {
  if (s.type === 'rest') return 'Ruhetag'
  if (!s.title) return typeLabel(s.type)
  const km = s.km ? ` · ${fmtKm(s.km)} km` : ''
  const pace = s.pace && s.type !== 'race' ? ` @ ${s.pace}` : ''
  return `${s.title}${km}${pace}`
}

export function eventDescription(s: PlanSession) {
  const lines: string[] = [typeLabel(s.type)]
  const targets = sessionTargets(s)
  if (targets.length) lines.push(`Ziel: ${targets.join(' · ')}`)
  const st = sessionStructure(s)
  if (st) lines.push('', ...describeStructure(st))
  if (s.notes) lines.push('', s.notes)
  lines.push('', 'Runmate: https://runmate.dev')
  return lines.join('\n')
}

export interface EventVersion { h: string; seq: number; at: string }   // content hash, SEQUENCE, LAST-MODIFIED (ISO)

// What the calendar shows of a day; a change here = a new event version.
export const eventContent = (s: PlanSession) => [eventTitle(s), eventDescription(s), typeLabel(s.type)].join('\u0001')

const icsTime = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function buildIcs(sessions: PlanSession[], now = new Date(), versions: Record<string, EventVersion> = {}, tz = timeZone()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Runmate Training', `X-WR-TIMEZONE:${tz}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ]
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const start = s.date.replace(/-/g, '')
    const end = format(addDays(parseISO(s.date), 1), 'yyyyMMdd')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.date}@runmate.dev`,
      `DTSTAMP:${stamp}`,
      // Version per day: clients see that an event changed (SEQUENCE up, new LAST-MODIFIED).
      ...(versions[s.date] ? [`SEQUENCE:${versions[s.date].seq}`, `LAST-MODIFIED:${icsTime(versions[s.date].at)}`] : []),
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${esc(eventTitle(s))}`,
      `DESCRIPTION:${esc(eventDescription(s))}`,
      'TRANSP:TRANSPARENT',                     // all-day plan, never blocks time
      `CATEGORIES:${esc(typeLabel(s.type))}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
