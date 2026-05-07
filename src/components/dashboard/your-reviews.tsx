'use client'

/**
 * Your reviews — last 5 reviews across all sources.
 * Restaurant owners' #1 anxiety is reviews; this card surfaces the
 * recent five with star, snippet, source, time, and a one-tap "Reply"
 * affordance for any unanswered ones (AI-drafted reply lives on the
 * /dashboard/social/reviews page).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Star, MessageSquareText } from 'lucide-react'

interface Review {
  id: string
  source: string
  rating: number
  author_name: string | null
  review_text: string | null
  posted_at: string
  responded_at: string | null
}

const SOURCE_LABEL: Record<string, string> = {
  google: 'Google',
  yelp: 'Yelp',
  facebook: 'Facebook',
  tripadvisor: 'Tripadvisor',
  other: 'Other',
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function YourReviews({ clientId }: { clientId: string }) {
  const [reviews, setReviews] = useState<Review[] | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('reviews')
        .select('id, source, rating, author_name, review_text, posted_at, responded_at')
        .eq('client_id', clientId)
        .order('posted_at', { ascending: false })
        .limit(5)
      setReviews((data ?? []) as Review[])
    }
    load().catch(() => setReviews([]))
  }, [clientId])

  if (reviews === null) {
    return (
      <div className="rounded-xl p-5 mb-4 border bg-white animate-pulse" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="h-3 bg-ink-6 rounded w-32 mb-3" />
        <div className="space-y-2">
          <div className="h-3 bg-ink-6 rounded w-full" />
          <div className="h-3 bg-ink-6 rounded w-5/6" />
        </div>
      </div>
    )
  }

  // Empty state — show the card but invite them to connect
  if (reviews.length === 0) {
    return (
      <div className="rounded-xl p-5 mb-4 border bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
            Your reviews
          </h3>
        </div>
        <p className="text-[13px]" style={{ color: 'var(--db-ink-3, #888)' }}>
          Once your Google or Yelp is connected, your latest reviews show up here so you can respond fast.
        </p>
        <Link
          href="/dashboard/connected-accounts"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold mt-3 text-emerald-700 hover:text-emerald-800"
        >
          Connect a review source →
        </Link>
      </div>
    )
  }

  const unrespondedCount = reviews.filter(r => !r.responded_at).length

  return (
    <div className="rounded-xl p-5 mb-4 border bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
          Your reviews
        </h3>
        {unrespondedCount > 0 && (
          <Link
            href="/dashboard/social/reviews"
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
          >
            {unrespondedCount} unanswered →
          </Link>
        )}
      </div>
      <ul className="space-y-3">
        {reviews.map((r) => {
          const lowStar = r.rating <= 3
          return (
            <li key={r.id} className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <span className={`inline-flex items-center gap-0.5 text-[12px] font-semibold ${lowStar ? 'text-rose-600' : 'text-amber-600'}`}>
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {r.rating.toFixed(1)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--db-ink-3, #888)' }}>
                  <span className="font-semibold" style={{ color: 'var(--db-ink-2, #555)' }}>{r.author_name || 'Anonymous'}</span>
                  <span>·</span>
                  <span>{SOURCE_LABEL[r.source] ?? r.source}</span>
                  <span>·</span>
                  <span>{timeAgo(r.posted_at)}</span>
                </div>
                {r.review_text && (
                  <p className="text-[13px] mt-0.5 line-clamp-2" style={{ color: 'var(--db-black, #111)' }}>
                    {r.review_text}
                  </p>
                )}
              </div>
              {!r.responded_at && (
                <Link
                  href="/dashboard/social/reviews"
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 mt-0.5"
                  title="Reply with AI-drafted response"
                >
                  <MessageSquareText className="w-3 h-3" />
                  Reply
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
