// Runmate service worker (09-01): last-known data on weak or no signal. Only GET requests of this origin are handled:
// pages network-first (fallback: the cached page, else the cached start page), build files cache-first, the plan APIs
// network-first with a 4-s timeout (fallback: cache). Writes, sign-in and other hosts are never touched.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `runmate-${VERSION}`
const API = [/^\/api\/running\//, /^\/api\/season(\/|$)/, /^\/api\/garmin\/status$/]
const TIMEOUT_MS = 4000

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/plan').catch(() => {})).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('runmate-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// A copy of a good response, stamped with the time it was fetched (the banner shows it when it is served offline).
async function store(request, response) {
  if (!response || !response.ok || response.redirected || response.type !== 'basic') return
  const headers = new Headers(response.headers)
  headers.set('x-runmate-cached-at', new Date().toISOString())
  const body = await response.clone().blob()
  const cache = await caches.open(CACHE)
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }))
}

async function fromCache(request, fallbackUrl) {
  const cache = await caches.open(CACHE)
  const hit = (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined)
  if (hit) tell({ type: 'cached', at: hit.headers.get('x-runmate-cached-at') })
  return hit
}

async function tell(message) {
  for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage(message)
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then((r) => { clearTimeout(t); resolve(r) }, (e) => { clearTimeout(t); reject(e) })
  })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then((r) => { store(request, r.clone()); return r })
      .catch(async () => (await fromCache(request, '/plan')) || new Response('Offline – diese Seite wurde noch nicht geladen.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })))
    return
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((r) => { store(request, r.clone()); return r })))
    return
  }

  if (API.some((re) => re.test(url.pathname))) {
    const network = fetch(request).then((r) => { store(request, r.clone()); if (r.ok) tell({ type: 'fresh' }); return r })
    event.respondWith(withTimeout(network, TIMEOUT_MS).catch(async () => (await fromCache(request)) || network))
  }
})
