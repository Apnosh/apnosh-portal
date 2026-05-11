/**
 * /dashboard/social/quotes/[id] — single quote view.
 *
 * Client lands here from the hub QuotesCard. Sees the full
 * line-item breakdown, strategist's pitch, and three actions:
 * approve, ask for changes, decline. Decision routes through
 * POST /api/social/quote/[id]/respond.
 */

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getQuote } from '@/lib/dashboard/get-quotes'
import QuoteView from './quote-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ clientId?: string }>
}

export default async function QuotePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'

  let clientId: string | null = null
  if (isAdmin) {
    clientId = sp.clientId ?? null
  } else {
    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()
    clientId = (business?.client_id as string | null) ?? null
    if (!clientId) {
      const { data: cu } = await supabase
        .from('client_users')
        .select('client_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      clientId = (cu?.client_id as string | null) ?? null
    }
  }

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to see this quote.
      </div>
    )
  }

  const quote = await getQuote(id, clientId)
  if (!quote) notFound()

  return <QuoteView quote={quote} />
}
