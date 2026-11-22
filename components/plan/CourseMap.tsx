'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { pointAtKm, type Course } from '@/lib/plan/course'
import type { RaceInfo } from '@/lib/plan/types'
import { Card } from '@/components/ui/card'

const MARKER_KM = [5, 10, 15, 20, 25, 30, 35, 40]

export function CourseMap({ course, status, race: RACE }: { course: Course | null; status: 'loading' | 'missing' | 'ready'; race: RaceInfo }) {
  return (
    <Card title="Strecke" aside={course && (
      <span className="tabular-nums">{RACE.courseLabel ? `${RACE.courseLabel} · ` : ''}{course.distanceKm.toFixed(1).replace('.', ',')} km</span>
    )}>
      {status === 'ready' && course ? <LeafletCourse course={course} /> : (
        <div className="grid h-[340px] place-items-center rounded-card border border-dashed border-border p-6 text-center">
          {status === 'loading' ? (
            <span className="text-body-sm text-muted-foreground">Strecke wird geladen…</span>
          ) : (
            <div className="max-w-sm space-y-2">
              <p className="text-body-sm font-medium">Noch keine Strecke hinterlegt</p>
              <p className="text-body-sm text-muted-foreground">
                Die GPX-Datei der Strecke (z. B. aus einer Strava-Route exportiert) als{' '}
                <code className="rounded-control bg-secondary px-1 py-0.5 font-mono text-caption">public{RACE.gpxPath ?? '/strecke.gpx'}</code> ins Repo legen.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function LeafletCourse({ course }: { course: Course }) {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let map: import('leaflet').Map | null = null
    let cancelled = false

    import('leaflet').then((L) => {
      if (cancelled || !el.current) return
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap-Mitwirkende',
        maxZoom: 19,
        className: 'course-tiles',
      }).addTo(map)

      const latlngs = course.points.map((p) => [p.lat, p.lon] as [number, number])
      L.polyline(latlngs, { color: 'hsl(358 75% 59%)', weight: 4, opacity: 0.9 }).addTo(map)

      for (const km of MARKER_KM) {
        if (km >= course.distanceKm) break
        const p = pointAtKm(course, km)
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: '',
            iconSize: [30, 20],
            iconAnchor: [15, 10],
            html: `<div style="height:20px;display:grid;place-items:center;background:hsl(var(--brand-soft));color:hsl(var(--brand-text));border:2px solid hsl(var(--brand));border-radius:999px;font:600 10px/1 system-ui;box-shadow:0 1px 3px rgba(0,0,0,.25)">${km}k</div>`,
          }),
          keyboard: false,
        }).addTo(map)
      }

      const start = course.points[0]
      const finish = course.points[course.points.length - 1]
      const samePlace = Math.abs(start.lat - finish.lat) < 0.0005 && Math.abs(start.lon - finish.lon) < 0.0005
      addEndpoint(L, map, start, samePlace ? 'Start / Ziel' : 'Start')
      if (!samePlace) addEndpoint(L, map, finish, 'Ziel', 'left')

      map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] })
    })

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [course])

  return <div ref={el} className="z-0 h-[340px] overflow-hidden rounded-card shadow-hairline sm:h-[400px]" />
}

function addEndpoint(L: typeof import('leaflet'), map: import('leaflet').Map, p: { lat: number; lon: number }, label: string, side: 'left' | 'right' = 'right') {
  const shift = side === 'right' ? 'translate(10px,-120%)' : 'translate(calc(-100% - 10px),-120%)'
  L.circleMarker([p.lat, p.lon], { radius: 6, color: '#fff', weight: 2, fillColor: 'hsl(174 72% 36%)', fillOpacity: 1 }).addTo(map)
  L.marker([p.lat, p.lon], {
    icon: L.divIcon({
      className: '',
      iconSize: [0, 0],
      html: `<div style="background:#fff;border-radius:8px;padding:4px 8px;font:500 11px/1.2 system-ui;color:#1c2130;box-shadow:0 2px 8px rgba(16,24,40,.15);transform:${shift};white-space:nowrap">${label}</div>`,
    }),
    keyboard: false,
  }).addTo(map)
}
