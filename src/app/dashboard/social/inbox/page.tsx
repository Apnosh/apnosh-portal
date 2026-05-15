/**
 * /dashboard/social/inbox — unified inbox for everything that needs
 * the client's attention or eyeballs on social.
 *
 * Three sub-tabs, controlled by ?tab=:
 *   - approvals (default) → content drafts waiting for review
 *   - quotes              → quotes the strategist has sent
 *   - engage              → comments + DMs + mentions
 *
 * Old standalone routes redirect here:
 *   /social/action-needed → /social/inbox?tab=approvals
 *   /social/quotes        → /social/inbox?tab=quotes
 *   /social/engage        → /social/inbox?tab=engage
 *
 * Quote detail pages at /social/quotes/[id] are unaffected.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Inbox as InboxIcon, MessageSquare, FileText, Eye } from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPendingQuotes, getRecentQuotes } from '@/lib/dashboard/get-quotes'
import { ApprovalsView } from './approvals-view'
import { QuotesView } from './quotes-view'
import EngageView from '../engage/engage-view'

export const dynamic = 'force-dynamic'

type Tab = 'approvals' | 'quotes' | 'engage'

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { id: 'approvals', label: 'Approvals', icon: Eye,          description: 'Content waiting for your review' },
  { id: 'quotes',    label: 'Quotes',    icon: FileText,     description: 'Estimates from your strategist' },
  { id: 'engage',    label: 'Messages',  icon: MessageSquare, description: 'Comments, DMs, and mentions' },
]

interface PageProps {
  searchParams: Promise<{ clientId?: string; tab?: string }>
}

export default async function InboxPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { user, isAdmin, clientId } = await resolveCurrentClient(sp.clientId ?? null)
  if (!user) redirect('/login')

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        {isAdmin
          ? 'Pick a client from /dashboard to see their inbox.'
          : 'Sign in as a client to see your inbox.'}
      </div>
    )
  }

  const tab: Tab = (sp.tab === 'quotes' || sp.tab === 'engage') ? sp.tab : 'approvals'

  // Pre-fetch only the data the active tab needs. Each sub-section is
  // independent so this stays fast even if quotes balloon later.
  let quotesPayload: { pending: Awaited<ReturnType<typeof getPendingQuotes>>; history: Awaited<ReturnType<typeof getRecentQuotes>> } | null = null
  let engagePlatforms: string[] = []

  if (tab === 'quotes') {
    const [pending, recent] = await Promise.all([
      getPendingQuotes(clientId),
      getRecentQuotes(clientId, 20),
    ])
    const pendingIds = new Set(pending.map(p => p.id))
    quotesPayload = { pending, history: recent.filter(r => !pendingIds.has(r.id)) }
  }

  if (tab === 'engage') {
    const admin = createAdminClient()
    const { data: conns } = await admin
      .from('platform_connections')
      .select('platform')
      .eq('client_id', clientId)
      .not('access_token', 'is', null)
    engagePlatforms = (conns ?? []).map(c => c.platform as string)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      {/* Page title */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Social
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <InboxIcon className="w-6 h-6 text-ink-4" />
          Inbox
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          {TABS.find(t => t.id === tab)?.description}
        </p>
      </div>

      {/* Tab strip */}
      <div role="tablist" aria-label="Inbox section" className="flex items-center gap-1 border-b border-ink-6">
        {TABS.map(t => {
          const Icon = t.icon
          const active = t.id === tab
          const href = t.id === 'approvals'
            ? '/dashboard/social/inbox'
            : `/dashboard/social/inbox?tab=${t.id}`
          return (
            <Link
              key={t.id}
              href={href}
              role="tab"
              aria-selected={active}
              className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand rounded-full" />
              )}
            </Link>
          )
        })}
      </div>

      {/* Active section */}
      {tab === 'approvals' && <ApprovalsView />}
      {tab === 'quotes' && quotesPayload && (
        <QuotesView pending={quotesPayload.pending} history={quotesPayload.history} />
      )}
      {tab === 'engage' && (
        <EngageView clientId={clientId} connectedPlatforms={engagePlatforms} />
      )}
    </div>
  )
}
