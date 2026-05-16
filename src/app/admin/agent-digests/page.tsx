/**
 * Admin: weekly digest preview.
 *
 * Renders the "what Apnosh AI did for you this week" summary for each
 * active client with activity. Copy/paste into your email tool until
 * SendGrid/Resend/Mailgun is wired up.
 */

import { Mail, Sparkles, Send } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { buildWeeklyDigests } from '@/lib/admin/weekly-digest'
import DigestCard from './digest-card'

export default async function AgentDigestsPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>
}) {
  await requireAdminUser()
  const params = await searchParams
  const weeksBack = Math.max(1, Math.min(4, parseInt(params.weeks ?? '1', 10) || 1))
  const digests = await buildWeeklyDigests({ weeksBack })

  const weekOptions = [1, 2, 4]

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Admin
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Mail className="w-6 h-6 text-brand" />
          Weekly digests
        </h1>
        <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
          One short summary per active client of what Apnosh AI did for them this week.
          Copy the text or HTML body and send from your email tool. Only clients with
          at least one conversation or open suggestion are shown.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-ink-6">
        {weekOptions.map(w => (
          <a
            key={w}
            href={`/admin/agent-digests?weeks=${w}`}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
              weeksBack === w ? 'text-ink border-brand' : 'text-ink-3 border-transparent hover:text-ink-2',
            ].join(' ')}
          >
            Last {w} week{w === 1 ? '' : 's'}
          </a>
        ))}
        <div className="ml-auto text-[11px] text-ink-3 pr-1">
          {digests.length} client{digests.length === 1 ? '' : 's'} with activity
        </div>
      </div>

      {digests.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Sparkles className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">
            No client activity in the selected window.
          </p>
          <p className="text-[12px] text-ink-3 mt-1">
            Digests appear here once an owner has at least one conversation or unread suggestion.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {digests.map(d => <DigestCard key={d.clientId} digest={d} />)}
        </div>
      )}

      <div className="text-[11px] text-ink-3 max-w-3xl flex items-start gap-1.5">
        <Send className="w-3 h-3 mt-0.5 text-ink-4 flex-shrink-0" />
        <span>
          v1 is copy/paste. v2 will wire SendGrid (or Resend) and send these on a Monday
          morning cron automatically.
        </span>
      </div>
    </div>
  )
}
