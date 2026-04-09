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

  // ── Authenticated: check if user is a client_user first ──
  if (user && (isDashboard || isAdminRoute || isClientRoute)) {
    // Check client_user linkage by auth_user_id
    const { data: clientUser } = await supabase
      .from('client_users')
      .select('id, client_id, clients(slug)')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (clientUser) {
      // This user is a client portal user. They can ONLY access /client/[their-slug]
      const biz = Array.isArray(clientUser.clients) ? clientUser.clients[0] : clientUser.clients
      const mySlug = (biz as { slug?: string } | null)?.slug

      if (!mySlug) {
        // Data integrity issue - fall through to login
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }

      // Block /admin and /dashboard for client_users
      if (isAdminRoute || isDashboard) {
        const url = request.nextUrl.clone()
        url.pathname = `/client/${mySlug}`
        return NextResponse.redirect(url)
      }

      // Enforce slug match on /client/* routes
      if (isClientRoute) {
        const urlSlug = path.split('/')[2]
        if (!urlSlug || urlSlug !== mySlug) {
          const url = request.nextUrl.clone()
          url.pathname = `/client/${mySlug}`
          return NextResponse.redirect(url)
        }
        // Slug matches - allow through
        return supabaseResponse
      }
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
          .single()

        if (!business || !business.onboarding_completed) {
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
    // Check client_user first
    const { data: clientUser } = await supabase
      .from('client_users')
      .select('clients(slug)')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (clientUser) {
      const biz = Array.isArray(clientUser.clients) ? clientUser.clients[0] : clientUser.clients
      const mySlug = (biz as { slug?: string } | null)?.slug
      if (mySlug) {
        const url = request.nextUrl.clone()
        url.pathname = `/client/${mySlug}`
        url.search = ''
        return NextResponse.redirect(url)
      }
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
