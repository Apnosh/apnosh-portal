import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Skip auth checks if Supabase is not configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_supabase')) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isAuthPage = path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/forgot-password') || path.startsWith('/reset-password')
  const isDashboard = path.startsWith('/dashboard')
  const isAdminRoute = path.startsWith('/admin')
  const isOnboarding = path.startsWith('/onboarding')

  // ── Unauthenticated: redirect to login ──
  if (!user && (isDashboard || isAdminRoute || isOnboarding)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  // ── Authenticated: enforce role-based routing ──
  if (user && (isDashboard || isAdminRoute)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role || 'client'

    // Admin trying to access /dashboard -> redirect to /admin
    if (isDashboard && role === 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      return NextResponse.redirect(url)
    }

    // Non-admin trying to access /admin -> redirect to /dashboard
    if (isAdminRoute && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    // ── Onboarding enforcement for client/team_member on /dashboard ──
    if (isDashboard && (role === 'client' || role === 'team_member')) {
      const { data: business } = await supabase
        .from('businesses')
        .select('onboarding_completed')
        .eq('owner_id', user.id)
        .single()

      if (!business || !business.onboarding_completed) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    }
  }

  // ── Authenticated on auth pages: redirect to portal ──
  if (user && isAuthPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const url = request.nextUrl.clone()
    const redirect = request.nextUrl.searchParams.get('redirect')
    if (redirect) {
      url.pathname = redirect
    } else {
      url.pathname = profile?.role === 'admin' ? '/admin' : '/dashboard'
    }
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
