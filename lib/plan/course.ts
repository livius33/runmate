export interface CoursePoint {
  lat: number
  lon: number
  ele: number | null
  km: number          // cumulative distance from the start
}

export interface Course {
  points: CoursePoint[]
  distanceKm: number
  gainM: number | null
}

function haversineKm(a: CoursePoint, b: { lat: number; lon: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Accepts track points (<trkpt>) or route points (<rtept>), as exported by Strava/Garmin.
export function parseGpx(xml: string): Course | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  let nodes = Array.from(doc.getElementsByTagName('trkpt'))
  if (!nodes.length) nodes = Array.from(doc.getElementsByTagName('rtept'))
  if (nodes.length < 2) return null

  const points: CoursePoint[] = []
  for (const n of nodes) {
    const lat = Number(n.getAttribute('lat'))
    const lon = Number(n.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const eleText = n.getElementsByTagName('ele')[0]?.textContent
    const ele = eleText ? Number(eleText) : null
    const prev = points[points.length - 1]
    points.push({ lat, lon, ele, km: prev ? prev.km + haversineKm(prev, { lat, lon }) : 0 })
  }

  return { points, distanceKm: points[points.length - 1].km, gainM: elevationGain(points) }
}

// Elevation is averaged over ±200 m of course and climbs under 3 m are ignored;
// raw GPX elevation is noisy enough to inflate the total several times over.
function elevationGain(points: CoursePoint[]) {
  const withEle = points.filter((p): p is CoursePoint & { ele: number } => p.ele != null && Number.isFinite(p.ele))
  if (withEle.length < 2) return null
  const eles = withEle.map((p) => {
    const near = withEle.filter((q) => Math.abs(q.km - p.km) <= 0.2)
    return near.reduce((t, q) => t + q.ele, 0) / near.length
  })
  let gain = 0
  let ref = eles[0]
  for (const e of eles) {
    if (e - ref >= 3) { gain += e - ref; ref = e }
    else if (ref - e >= 3) ref = e
  }
  return Math.round(gain)
}

// Point at a given distance along the course (nearest recorded point).
export function pointAtKm(course: Course, km: number) {
  return course.points.find((p) => p.km >= km) ?? course.points[course.points.length - 1]
}
