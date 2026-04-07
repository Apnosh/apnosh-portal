'use client'

import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: typeof Inbox
  title: string
  description: string
  action?: ReactNode
}

export default function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-bg-2 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-ink-4" />
      </div>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <p className="text-sm text-ink-4 mt-1 max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
