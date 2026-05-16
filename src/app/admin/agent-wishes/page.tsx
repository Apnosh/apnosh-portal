/**
 * Admin: unmet-intent inbox.
 *
 * Every time an owner answers "what did you wish I could do?" the
 * answer lands here. Tag, triage, ship. This is the product-roadmap
 * feedback loop -- if 5 owners ask for the same thing, build it.
 */

import Link from 'next/link'
import { Sparkles, MessageCircle, AlertCircle } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { listWishes } from '@/lib/admin/agent-wishes'
import WishRows from './wish-rows'

export default async function AgentWishesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requireAdminUser()
  const params = await searchParams
  const status = params.status ?? 'new'
  const wishes = await listWishes({ status, limit: 200 })

  const filters = [
    { id: 'new', label: 'New' },
    { id: 'reviewed', label: 'Reviewed' },
    { id: 'in_roadmap', label: 'In roadmap' },
    { id: 'duplicate', label: 'Duplicate' },
    { id: 'wont_build', label: "Won't build" },
    { id: 'all', label: 'All' },
  ]

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Admin
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-brand" />
          Owner wishes
        </h1>
        <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
          Things owners wished the AI could do. Captured when the agent escalates OR when an owner
          cancels a preview with &quot;not what I asked&quot;. If 3+ owners ask for the same thing,
          build it next.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-ink-6">
        {filters.map(f => (
          <Link
            key={f.id}
            href={`/admin/agent-wishes?status=${f.id}`}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
              status === f.id ? 'text-ink border-brand' : 'text-ink-3 border-transparent hover:text-ink-2',
            ].join(' ')}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {wishes.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <MessageCircle className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">
            {status === 'new' ? 'Caught up — no new wishes' : 'No wishes in this view'}
          </p>
        </div>
      ) : (
        <WishRows initial={wishes} />
      )}

      <div className="text-[11px] text-ink-3 max-w-3xl">
        <AlertCircle className="w-3 h-3 inline mr-1 text-ink-4" />
        Tag with category + status as you triage. Wishes with the same category aggregate
        naturally when sorting by created date.
      </div>
    </div>
  )
}
