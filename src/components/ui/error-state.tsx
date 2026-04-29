'use client'

/**
 * ErrorState — shown when a page-level data fetch fails.
 *
 * Pairs with EmptyState (no data) and LoadingState (data in flight).
 * Always include a retry path and a way to escalate (send a message).
 *
 * Anti-patterns this prevents:
 *   - Silent blank screens when an API call errors
 *   - Random console errors with no UI signal
 *   - "Something went wrong" with no retry
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCw, MessageSquare } from 'lucide-react'

interface ErrorStateProps {
  title?: string
  description?: string
  /** Optional details surfaced behind a small toggle (e.g. error message). */
  details?: string
  /** Called when the user clicks Retry. If omitted, button hidden. */
  onRetry?: () => void
  /** Override the default actions area. */
  action?: ReactNode
}

export default function ErrorState({
  title = 'Something went wrong',
  description = 'We hit an error loading this. Try again, or send us a message and we\'ll take a look.',
  details,
  onRetry,
  action,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6 text-red-600" />
      </div>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <p className="text-sm text-ink-4 mt-1 max-w-sm leading-relaxed">{description}</p>

      {action ?? (
        <div className="mt-4 flex items-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 rounded-md bg-ink text-white text-xs font-medium hover:bg-ink/90 inline-flex items-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5" /> Try again
            </button>
          )}
          <Link
            href="/dashboard/messages"
            className="px-3 py-1.5 rounded-md border border-ink-6 text-xs font-medium hover:bg-bg-2 inline-flex items-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Tell us
          </Link>
        </div>
      )}

      {details && (
        <details className="mt-4 max-w-md">
          <summary className="text-[11px] text-ink-4 cursor-pointer">Show details</summary>
          <pre className="mt-2 text-[11px] text-left text-ink-3 bg-bg-2 border border-ink-6 rounded p-2 whitespace-pre-wrap break-words">
            {details}
          </pre>
        </details>
      )}
    </div>
  )
}
