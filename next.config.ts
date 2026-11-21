import type { NextConfig } from 'next'

// Security headers on every response (12-04). No page may be framed (clickjacking); no MIME sniffing; the referrer
// leaves the site as its origin only; no camera, microphone or location. A script-src CSP comes later: it needs a
// walkthrough with Clerk and Paddle on the deployed instance.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=()' },
]

// The calendar feed and the Apple Health link carry a secret token in their path: never send it on as a referrer.
const TOKEN_ROUTES = ['/api/calendar/:path*', '/api/health/:path*']

const nextConfig: NextConfig = {
  // The Docker image builds a standalone server (Dockerfile sets NEXT_OUTPUT); Vercel uses the default output.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  // Methodology templates are read from disk on the server (lib/plan/methodology/load.ts).
  outputFileTracingIncludes: { '/**': ['./methodologies/**'] },
  poweredByHeader: false,
  // A later entry overrides an earlier one for the same header, so the token routes come last.
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      ...TOKEN_ROUTES.map((source) => ({ source, headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] })),
    ]
  },
}

export default nextConfig
