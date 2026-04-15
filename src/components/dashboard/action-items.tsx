'use client'

import Link from 'next/link'
import { Inbox, AlertTriangle, MessageSquare, CheckCircle, ArrowRight } from 'lucide-react'
import type { ActionItem } from '@/types/dashboard'

const ICONS = {
  inbox: Inbox,
  alert: AlertTriangle,
  message: MessageSquare,
  check: CheckCircle,
}

const ICON_COLORS = {
  inbox: { bg: 'rgba(74, 189, 152, 0.1)', fg: '#4abd98' },
  alert: { bg: 'rgba(245, 158, 11, 0.1)', fg: '#f59e0b' },
  message: { bg: 'rgba(59, 130, 246, 0.1)', fg: '#3b82f6' },
  check: { bg: 'rgba(74, 189, 152, 0.1)', fg: '#4abd98' },
}

interface Props {
  items: ActionItem[]
}

export default function ActionItems({ items }: Props) {
  if (items.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl px-5 py-4"
        style={{ background: 'rgba(74, 189, 152, 0.06)', border: '1px solid rgba(74, 189, 152, 0.15)' }}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(74, 189, 152, 0.15)' }}>
          <CheckCircle className="w-4 h-4" style={{ color: '#4abd98' }} />
        </div>
        <p className="text-sm font-medium" style={{ color: '#2e9a78' }}>
          Nothing needs your attention right now
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--db-ink-3, #888)' }}>
        Needs your attention
      </h3>
      {items.map((item, i) => {
        const Icon = ICONS[item.icon]
        const colors = ICON_COLORS[item.icon]
        return (
          <Link
            key={i}
            href={item.href}
            className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-[var(--db-bg-hover,#fafafa)]"
            style={{ background: 'white', border: '1px solid var(--db-border, #f0f0f0)' }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: colors.bg }}
            >
              <Icon className="w-4 h-4" style={{ color: colors.fg }} />
            </div>
            <span className="text-sm font-medium flex-1" style={{ color: 'var(--db-black, #111)' }}>
              {item.title}
            </span>
            <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--db-ink-4, #aaa)' }} />
          </Link>
        )
      })}
    </div>
  )
}
