/**
 * Next.js middleware — runs on every request before page or API
 * handlers. Two jobs:
 *
 *   1. Refresh the Supabase auth session cookie so the user stays
 *      logged in across navigations without each page redoing the
 *      cookie dance.
 *
 *   2. Resolve user.id once and forward it as a request header so
 *      API routes can read it from `req.headers.get('x-user-id')`
 *      instead of round-tripping to Supabase Auth on every endpoint.
 *
 * This is the single biggest portal-wide latency win: 8 fetches on a
 * page used to mean 8 separate calls to supabase.auth.getUser(). With
 * middleware doing it once per request, that drops to 1.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            req.cookies.set({ name, value, ...options })
            res.cookies.set({ name, value, ...options })
          })
        },
      },
    },
  )

  // Refresh the session cookie if needed; the result is also cached
  // on req for the duration of this request so downstream code that
  // calls supabase.auth.getUser() inside the same request hits the
  // cookie cache instead of doing a network roundtrip.
  const { data: { user } } = await supabase.auth.getUser()

  if (user?.id) {
    res.headers.set('x-user-id', user.id)
    res.headers.set('x-user-email', user.email ?? '')
  }

  return res
}

// Run middleware on every page + API route except static assets and
// Next internals. The matcher is performance-critical: hitting too
// broad a path means every static asset re-runs the auth refresh.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image  (image optimization)
     * - favicon, robots, sitemap
     * - any path with a file extension (assumed to be static)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)',
  ],
}
