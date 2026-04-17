'use client'

/**
 * Request-type chooser.
 *
 * Previously this page offered three ad-hoc quick-forms (Quick/Template/
 * Detailed) that wrote generic text-only rows to content_queue, while
 * /requests/new/graphic and /requests/new/video wrote to the richer
 * graphic_requests / video_requests tables. Admin got two different
 * shapes for the same concept.
 *
 * This version routes straight to the dedicated graphic or video builders
 * so every request lands in a consistent structured format.
 */

import Link from 'next/link'
import { Image as ImageIcon, Film, ArrowLeft, ArrowRight } from 'lucide-react'

export default function NewRequestPage() {
  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <Link
        href="/dashboard/social/requests"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to requests
      </Link>

      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold mb-1" style={{ color: 'var(--ink, #111)' }}>
        What do you need?
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--ink-3, #888)' }}>
        Pick the format you want. We&apos;ll ask a few quick questions so our team has what they need.
      </p>

      <div className="space-y-3">
        <RequestTypeCard
          href="/dashboard/social/requests/new/graphic"
          icon={<ImageIcon className="w-5 h-5" style={{ color: '#4abd98' }} />}
          title="A graphic"
          description="A photo, carousel, or designed post. Good for announcements, promos, or visual menu highlights."
        />

        <RequestTypeCard
          href="/dashboard/social/requests/new/video"
          icon={<Film className="w-5 h-5" style={{ color: '#4abd98' }} />}
          title="A video or reel"
          description="Short-form video for Reels or TikTok. Best for reaching new people and showing food in action."
        />
      </div>

      <p className="text-[11px] text-ink-4 mt-8 text-center">
        Not sure which to pick? Reels reach the most new people. Graphics are perfect for specific announcements.
      </p>
    </div>
  )
}

function RequestTypeCard({
  href, icon, title, description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group w-full text-left rounded-xl border border-ink-6 p-5 hover:border-brand hover:bg-brand-tint/30 transition-all flex items-start gap-4 block"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(74, 189, 152, 0.1)' }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold mb-0.5" style={{ color: 'var(--ink, #111)' }}>
          {title}
        </div>
        <div className="text-sm" style={{ color: 'var(--ink-3, #888)' }}>
          {description}
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-ink-4 group-hover:text-brand-dark transition-colors flex-shrink-0 mt-1" />
    </Link>
  )
}
