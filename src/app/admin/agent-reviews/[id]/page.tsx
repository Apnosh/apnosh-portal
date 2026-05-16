/**
 * Strategist deep-dive into a single agent conversation. Shows the
 * full transcript, every tool execution (with input + output), every
 * outcome we've measured against it, and every prior rating.
 *
 * The right column is the strategist's rating form -- 4 ordinal
 * scales + tags + free-text notes. Writes to agent_evaluations
 * (rater_type='strategist'), which removes the conversation from
 * the queue.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { getConversationDetail } from '@/lib/admin/agent-reviews'
import RatingForm from './rating-form'
import ConversationTranscript from './conversation-transcript'

export default async function AgentReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdminUser()
  const { id } = await params
  const detail = await getConversationDetail(id)
  if (!detail) notFound()

  const { conversation, turns, executions, evaluations, outcomes } = detail
  const strategistRating = evaluations.find(e => e.raterType === 'strategist')

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-20">
      <Link
        href="/admin/agent-reviews"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to queue
      </Link>

      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          {conversation.clientName} · {new Date(conversation.startedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
        <h1 className="text-[22px] font-semibold text-ink mt-1">
          {conversation.title ?? 'Untitled conversation'}
        </h1>
        {conversation.summary && (
          <p className="text-sm text-ink-3 mt-1 max-w-3xl">{conversation.summary}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Transcript + executions + outcomes */}
        <div className="space-y-4">
          <ConversationTranscript
            turns={turns}
            executions={executions}
            evaluations={evaluations}
          />

          {outcomes.length > 0 && (
            <div className="bg-white rounded-xl border border-ink-6 p-4">
              <h2 className="text-sm font-semibold text-ink mb-3">Measured outcomes</h2>
              <table className="w-full text-sm">
                <thead className="text-[11px] text-ink-3">
                  <tr>
                    <th className="text-left py-2 font-medium">Metric</th>
                    <th className="text-right py-2 font-medium">Before</th>
                    <th className="text-right py-2 font-medium">After</th>
                    <th className="text-right py-2 font-medium">Signal</th>
                    <th className="text-right py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map(o => (
                    <tr key={o.id} className="border-t border-ink-6">
                      <td className="py-2 text-[12px] font-mono text-ink-2">{o.metricName}</td>
                      <td className="py-2 text-right text-[12px] tabular-nums text-ink-3">{o.baselineValue ?? '—'}</td>
                      <td className="py-2 text-right text-[12px] tabular-nums text-ink-2">{o.observedValue ?? '—'}</td>
                      <td className="py-2 text-right text-[11px]">
                        {o.signalStrength === 'strong' && <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">strong</span>}
                        {o.signalStrength === 'weak' && <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">weak</span>}
                        {o.signalStrength === 'noisy' && <span className="px-1.5 py-0.5 rounded-full bg-ink-7 text-ink-4">noisy</span>}
                      </td>
                      <td className="py-2 text-right text-[11px] text-ink-3">{o.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sticky rating form */}
        <div>
          <div className="sticky top-6 space-y-4">
            <RatingForm
              conversationId={conversation.id}
              initial={strategistRating ? {
                overall: strategistRating.tags ? 0 : 0,  // strategist form lives in scale fields; defaults reset
                notes: strategistRating.notes ?? '',
                tags: strategistRating.tags ?? [],
              } : null}
              alreadyRated={!!strategistRating}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
