'use client'

import { useEffect, useMemo, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { fmtPace } from './format'

type RoutePoint = [number, number, number | null]   // lat, lon, pace s/km

// Light → dark = slow → fast, in the brand hue.
const SHADES = ['hsl(358 90% 84%)', 'hsl(358 80% 70%)', 'hsl(358 75% 59%)', 'hsl(358 70% 40%)']

export function RunMap({ route }: { route: RoutePoint[] }) {
  const el = useRef<HTMLDivElement>(null)

  // Quartiles of this run's pace, so the colours show where it was faster or slower.
  const bands = useMemo(() => {
    const p = route.map((r) => r[2]).filter((v): v is number => v != null && v < 900).sort((a, b) => a - b)
    if (p.length < 8) return null
    const q = (f: number) => p[Math.floor(p.length * f)]
    return [q(0.25), q(0.5), q(0.75)]   // boundaries, fastest first
  }, [route])

  const shadeFor = (pace: number | null) => {
    if (pace == null || !bands) return 'hsl(var(--muted-foreground))'
    if (pace <= bands[0]) return SHADES[3]
    if (pace <= bands[1]) return SHADES[2]
    if (pace <= bands[2]) return SHADES[1]
    return SHADES[0]
  }

  useEffect(() => {
    let map: import('leaflet').Map | null = null
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !el.current || route.length < 2) return
      map = L.map(el.current, { scrollWheelZoom: false })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap-Mitwirkende', maxZoom: 19, className: 'course-tiles',
      }).addTo(map)
      // One short polyline per segment, coloured by the pace at its end.
      for (let i = 1; i < route.length; i++) {
        L.polyline([[route[i - 1][0], route[i - 1][1]], [route[i][0], route[i][1]]], {
          color: shadeFor(route[i][2]), weight: 5, opacity: 0.95, lineCap: 'round',
        }).addTo(map)
      }
      L.circleMarker([route[0][0], route[0][1]], { radius: 6, color: '#fff', weight: 2, fillColor: 'hsl(174 72% 36%)', fillOpacity: 1 })
        .bindTooltip('Start').addTo(map)
      const end = route[route.length - 1]
      L.circleMarker([end[0], end[1]], { radius: 6, color: '#fff', weight: 2, fillColor: 'hsl(222 22% 12%)', fillOpacity: 1 })
        .bindTooltip('Ziel').addTo(map)
      map.fitBounds(L.latLngBounds(route.map((r) => [r[0], r[1]] as [number, number])), { padding: [20, 20] })
    })
    return () => { cancelled = true; map?.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, bands])

  return (
    <div className="flex flex-col gap-2">
      <div ref={el} className="z-0 h-[300px] overflow-hidden rounded-card shadow-hairline sm:h-[360px]" />
      {bands && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground tabular-nums">
          {[`schneller als ${fmtPace(bands[0])}`, `${fmtPace(bands[0])}–${fmtPace(bands[1])}`, `${fmtPace(bands[1])}–${fmtPace(bands[2])}`, `langsamer als ${fmtPace(bands[2])}`]
            .map((label, i) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SHADES[3 - i] }} />{label}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
