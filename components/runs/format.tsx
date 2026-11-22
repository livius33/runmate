// Number formatters for the run pages (German format). The run-type chip lives in ./tags.tsx, cards in components/ui.

// Value at a percentile of a sorted copy — for axis ranges that ignore glitchy outliers.
export function percentile(values: number[], p: number) {
  const v = [...values].sort((a, b) => a - b)
  return v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))] : 0
}

export const fmtPace = (s: number | null | undefined) =>
  s == null || !Number.isFinite(s) ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export const fmtClock = (s: number) => {
  const r = Math.round(s), h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60), sec = r % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null ? '–' : n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
