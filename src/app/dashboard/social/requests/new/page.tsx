'use client'

import Link from 'next/link'
import { ArrowLeft, ImageIcon, Film, ChevronRight } from 'lucide-react'

const TYPES = [
  {
    id: 'graphic',
    label: 'Static / Graphic',
    description: 'A single image, carousel, story graphic, or banner. Posts, promos, events, testimonials.',
    icon: ImageIcon,
    href: '/dashboard/social/requests/new/graphic',
    available: true,
  },
  {
    id: 'video',
    label: 'Short-form Video',
    description: 'Reels, TikToks, and YouTube Shorts. 15–90 second vertical videos.',
    icon: Film,
    href: '/dashboard/social/requests/new/video',
    available: true,
  },
]

export default function NewSocialRequestPickerPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/social/requests" className="text-ink-4 hover:text-ink transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">New Social Request</h1>
          <p className="text-ink-3 text-sm mt-0.5">What kind of content are you looking for?</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TYPES.map(t => {
          const Icon = t.icon
          return (
            <Link
              key={t.id}
              href={t.href}
              className="group bg-white rounded-2xl border border-ink-6 hover:border-brand/40 hover:shadow-sm transition-all p-6 text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-tint flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Icon className="w-6 h-6 text-brand-dark" />
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-[family-name:var(--font-display)] text-xl text-ink">{t.label}</h3>
                <ChevronRight className="w-5 h-5 text-ink-4 group-hover:text-brand-dark transition-colors mt-1" />
              </div>
              <p className="text-sm text-ink-3 mt-2 leading-relaxed">{t.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
