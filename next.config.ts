import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // Rewrite barrel imports (lucide-react is a ~1700-icon re-export) to per-icon
  // modules so each route ships only the icons it uses. Big first-load win
  // across the ~400 lucide import sites.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
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
  // The campaign "Needs you" intake consolidated onto /ready; keep old /setup links working.
  // Plus a safety net for legacy links stored in prod notification rows: the old
  // /dashboard/{website,social,local-seo,email-sms}/... channel hubs were folded into
  // /dashboard/insights (one page, no subroutes), and the requests concept folded
  // into /dashboard/messages.
  async redirects() {
    return [
      { source: '/dashboard/campaigns/:id/setup', destination: '/dashboard/campaigns/:id/ready', permanent: false },
      { source: '/dashboard/website/:path*', destination: '/dashboard/insights', permanent: false },
      { source: '/dashboard/social/:path*', destination: '/dashboard/insights', permanent: false },
      { source: '/dashboard/local-seo/:path*', destination: '/dashboard/insights', permanent: false },
      { source: '/dashboard/email-sms/:path*', destination: '/dashboard/insights', permanent: false },
      // :path+ requires at least one segment, so /dashboard/insights itself never
      // matches and this cannot loop.
      //
      // The negative lookahead is load-bearing. This rule was written when insights
      // really was one page with no subroutes, so a catch-all was safe. /insights/analyst
      // was added later and this silently ate it: the AI Analyst button appeared to do
      // nothing because every tap redirected straight back to the page it came from,
      // and the page was unreachable by direct URL too. Any real subroute added here in
      // future must be exempted the same way, or it will vanish the same silent way.
      // Explicit FIRST, because the catch-all below would otherwise eat it and send it to
      // /dashboard/insights (exactly the silent-vanish the comment above warns about). The
      // old half-built /insights/setup wizard route moved to the real surface at /measure.
      { source: '/dashboard/insights/setup', destination: '/dashboard/measure', permanent: false },
      { source: '/dashboard/insights/:path((?!analyst$).+)', destination: '/dashboard/insights', permanent: false },
      { source: '/dashboard/requests/:path*', destination: '/dashboard/messages', permanent: false },
    ]
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
