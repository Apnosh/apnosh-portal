import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // Allow loading social post thumbnails from Meta's CDNs. We use
  // unoptimized={true} on <Image> for these so Next.js doesn't proxy them
  // (Meta URLs are signed + short-lived; proxying would cache stale URLs),
  // but remotePatterns is still required as a domain allow-list.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: 'instagram.com' },
      { protocol: 'https', hostname: 'www.instagram.com' },
    ],
  },
}

// withSentryConfig wires Sentry's webpack plugin so we get readable stack
// traces in production (uploads source maps when SENTRY_AUTH_TOKEN is set)
// and forwards client-side errors via a tunnel route to bypass ad blockers.
// All of these are no-ops when env vars are missing -- builds keep working
// in dev / preview without any Sentry credentials.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: '/monitoring',
  // Don't expose source maps publicly.
  sourcemaps: { disable: false },
  disableLogger: true,
})
