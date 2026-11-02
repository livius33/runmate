// The Porto course as an SVG motif (Phase 6): the example GPX (examples/porto-2026) reduced to a path, at build time.
// Server only. Equirectangular projection around the course centre, fitted into a box; ~160 points are plenty.
import { readFileSync } from 'node:fs'
import path from 'node:path'

export interface CoursePath { d: string; width: number; height: number; start: [number, number]; finish: [number, number] }

export function courseFromGpx(xml: string, width = 600, points = 160): CoursePath | null {
  const pts = [...xml.matchAll(/<(?:trkpt|rtept)\s+lat="(-?[\d.]+)"\s+lon="(-?[\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
  if (pts.length < 2) return null
  const step = Math.max(1, Math.floor(pts.length / points))
  const sample = pts.filter((_, i) => i % step === 0)
  if (sample[sample.length - 1] !== pts[pts.length - 1]) sample.push(pts[pts.length - 1])
  const lat0 = (Math.min(...sample.map((p) => p[0])) + Math.max(...sample.map((p) => p[0]))) / 2
  const k = Math.cos((lat0 * Math.PI) / 180)
  const xy = sample.map(([lat, lon]) => [lon * k, -lat] as const)
  const minX = Math.min(...xy.map((p) => p[0])), maxX = Math.max(...xy.map((p) => p[0]))
  const minY = Math.min(...xy.map((p) => p[1])), maxY = Math.max(...xy.map((p) => p[1]))
  const scale = width / (maxX - minX)
  const height = Math.round((maxY - minY) * scale)
  const proj = xy.map(([x, y]) => [Math.round((x - minX) * scale * 10) / 10, Math.round((y - minY) * scale * 10) / 10] as [number, number])
  const d = proj.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')
  return { d, width, height, start: proj[0], finish: proj[proj.length - 1] }
}

let cache: CoursePath | null | undefined
export function portoCourse(): CoursePath | null {
  if (cache !== undefined) return cache
  try {
    cache = courseFromGpx(readFileSync(path.join(process.cwd(), 'examples', 'porto-2026', 'porto-marathon.gpx'), 'utf8'))
  } catch {
    cache = null
  }
  return cache
}
