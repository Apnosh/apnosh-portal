'use client'

import { CheckCircle2, AlertCircle, Clock, Circle } from 'lucide-react'
import type { GbpStatus } from '@/lib/gbp-status'

const STYLES: Record<GbpStatus, {
  bg: string; text: string; label: string; icon: React.ComponentType<{ className?: string }>
}> = {
  connected: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    label: 'GBP connected',
    icon: CheckCircle2,
  },
  pending: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    label: 'Manager invite pending',
    icon: Clock,
  },
  lost: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    label: 'GBP access lost',
    icon: AlertCircle,
  },
  never: {
    bg: 'bg-ink-6',
    text: 'text-ink-3',
    label: 'GBP not invited',
    icon: Circle,
  },
}

export default function GbpStatusBadge({
  status,
  size = 'sm',
  showLabel = true,
}: {
  status: GbpStatus
  size?: 'xs' | 'sm'
  showLabel?: boolean
}) {
  const s = STYLES[status]
  const Icon = s.icon
  const sizeClass = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-xs px-2 py-0.5'
  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${sizeClass} ${s.bg} ${s.text} font-medium`}>
      <Icon className={iconSize} />
      {showLabel && s.label}
    </span>
  )
}
