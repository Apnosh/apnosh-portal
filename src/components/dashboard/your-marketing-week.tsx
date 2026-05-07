'use client'

/**
 * Your marketing this week — proof of momentum. Shows the operator
 * what they (with Apnosh's AI help) shipped in the last 7 days.
 *
 * Hits a server action through a thin wrapper (kept as a fetch to
 * /api/dashboard/weekly so the page stays purely client-side).
 */

import { useEffect, useState } from 'react'
import { CheckCircle2, MessageSquare, Image as ImageIcon, Star, Megaphone, Sparkles } from 'lucide-react'

interface WeeklyActivityItem {
  label: string
  detail?: string
  icon: 'check' | 'message' | 'image' | 'star' | 'megaphone' | 'sparkle'
}

const ICONS: Record<WeeklyActivityItem['icon'], React.ReactNode> = {
  check: <CheckCircle2 className="w-3.5 h-3.5" />,
  message: <MessageSquare className="w-3.5 h-3.5" />,
  image: <ImageIcon className="w-3.5 h-3.5" />,
  star: <Star className="w-3.5 h-3.5" />,
  megaphone: <Megaphone className="w-3.5 h-3.5" />,
  sparkle: <Sparkles className="w-3.5 h-3.5" />,
}

export default function YourMarketingWeek({
  clientId,
  initialItems,
}: {
  clientId: string
  initialItems?: WeeklyActivityItem[]
}) {
  const [items, setItems] = useState<WeeklyActivityItem[] | null>(initialItems ?? null)

  useEffect(() => {
    if (initialItems !== undefined) return // parent batch already loaded
    async function load() {
      try {
        const res = await fetch(`/api/dashboard/weekly?clientId=${encodeURIComponent(clientId)}`)
        if (res.ok) {
          const json = await res.json()
          setItems(json.items || [])
        }
      } catch {
        setItems([])
      }
    }
    load()
  }, [clientId, initialItems])

  if (items === null) {
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

  if (items.length === 0) return null

  return (
    <div className="rounded-xl p-5 mb-4 border bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
          Your marketing this week
        </h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px]">
            <span className="text-emerald-600 mt-0.5 shrink-0">{ICONS[item.icon]}</span>
            <span className="flex-1" style={{ color: 'var(--db-black, #111)' }}>
              {item.label}
              {item.detail && (
                <span className="ml-1.5 text-[11px] italic" style={{ color: 'var(--db-ink-3, #888)' }}>
                  · {item.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
