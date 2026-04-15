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
  const isClientRoute = path.startsWith('/client')

  // ── Unauthenticated: redirect to login ──
  if (!user && (isDashboard || isAdminRoute || isOnboarding || isClientRoute)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  // ── Authenticated user on /onboarding: redirect to dashboard if already completed ──
  if (user && isOnboarding) {
    const { data: business } = await supabase
      .from('businesses')
      .select('onboarding_completed')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (business?.onboarding_completed) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    // Not completed (or no record) — allow access to onboarding
    return supabaseResponse
  }

  // ── Authenticated: check if user is a client_user first ──
  if (user && (isDashboard || isAdminRoute || isClientRoute)) {
    // Check client_user linkage by auth_user_id
    const { data: clientUser } = await supabase
      .from('client_users')
      .select('id, client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (clientUser) {
      // Client portal users use the full /dashboard experience.
      // The legacy /client/[slug] simplified portal is deprecated — redirect
      // any access there back to /dashboard.
      if (isClientRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }

      // Block /admin for client portal users (admin-only area).
      if (isAdminRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }

      // /dashboard is allowed — fall through to supabaseResponse below.
      return supabaseResponse
    }

    // Not a client_user: follow existing admin/dashboard logic
    if (isDashboard || isAdminRoute) {
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
          .maybeSingle()

        // If no businesses row exists at all, redirect to onboarding
        // (new signup that hasn't started onboarding yet)
        if (!business) {
          const url = request.nextUrl.clone()
          url.pathname = '/onboarding'
          return NextResponse.redirect(url)
        }

        // If businesses row exists but onboarding not complete, redirect
        if (!business.onboarding_completed) {
          const url = request.nextUrl.clone()
          url.pathname = '/onboarding'
          return NextResponse.redirect(url)
        }
      }
    }

    // For /client/* without a client_user row: allow admins (preview mode)
    if (isClientRoute) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        // Not admin, not client_user - redirect to login
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }
      // Admin preview - allow through
    }
  }

  // ── Authenticated on auth pages: redirect to portal ──
  if (user && isAuthPage) {
    // Client portal users go to /dashboard (legacy /client/[slug] is deprecated).
    const { data: clientUser } = await supabase
      .from('client_users')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (clientUser) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return NextResponse.redirect(url)
    }

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
