/**
 * /dashboard/social/quotes/[id] — single quote view.
 *
 * Client lands here from the hub QuotesCard. Sees the full
 * line-item breakdown, strategist's pitch, and three actions:
 * approve, ask for changes, decline. Decision routes through
 * POST /api/social/quote/[id]/respond.
 */

import { notFound, redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getQuote } from '@/lib/dashboard/get-quotes'
import QuoteView from './quote-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ clientId?: string }>
}

export default async function QuotePage({ params, searchParams }: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const { user, clientId } = await resolveCurrentClient(sp.clientId ?? null)
  if (!user) redirect('/login')
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
