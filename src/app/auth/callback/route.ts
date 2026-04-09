import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Password recovery flow
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // 1. First check: is this user a client_user (magic link portal user)?
        // Match by email case-insensitively
        const { data: clientUser } = await supabase
          .from('client_users')
          .select('id, client_id, auth_user_id, clients(slug)')
          .ilike('email', user.email ?? '')
          .maybeSingle()

        if (clientUser) {
          // Link auth_user_id if not already linked
          if (!clientUser.auth_user_id) {
            await supabase
              .from('client_users')
              .update({
                auth_user_id: user.id,
                status: 'active',
                last_login: new Date().toISOString(),
              })
              .eq('id', clientUser.id)
          } else {
            // Just update last_login
            await supabase
              .from('client_users')
              .update({ last_login: new Date().toISOString() })
              .eq('id', clientUser.id)
          }

          const biz = Array.isArray(clientUser.clients) ? clientUser.clients[0] : clientUser.clients
          const slug = (biz as { slug?: string } | null)?.slug
          if (slug) {
            return NextResponse.redirect(`${origin}/client/${slug}`)
          }
        }

        // 2. Regular admin/dashboard user
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'admin') {
          return NextResponse.redirect(`${origin}/admin`)
        }
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
