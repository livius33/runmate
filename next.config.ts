import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The Docker image builds a standalone server (Dockerfile sets NEXT_OUTPUT); Vercel uses the default output.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  // Methodology templates are read from disk on the server (lib/plan/methodology/load.ts).
  outputFileTracingIncludes: { '/**': ['./methodologies/**'] },
}

export default nextConfig
