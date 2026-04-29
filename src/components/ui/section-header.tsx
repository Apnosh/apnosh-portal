'use client'

/**
 * SectionHeader — consistent title + subtitle + optional CTA across pages.
 *
 * Use this at the top of any page or major section. Standardizes spacing,
 * typography, and the right-side action slot so every page feels the same.
 *
 * Replaces bespoke `<h1>...</h1>` patterns in 30+ pages.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface SectionHeaderProps {
  /** Main title (h1 by default; pass `as="h2"` for sub-sections). */
  title: string
  /** Subtitle below the title. */
  subtitle?: string
  /** Optional back link. Renders an arrow + label above the title. */
  backHref?: string
  backLabel?: string
  /** Right-aligned action area (button, badge, etc.). */
  action?: ReactNode
  /** "h1" (default, page-level) or "h2" (section-level). */
  as?: 'h1' | 'h2'
  /** Tighten/widen the bottom margin. */
  size?: 'lg' | 'md' | 'sm'
  className?: string
}

export default function SectionHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  action,
  as = 'h1',
  size = 'lg',
  className = '',
}: SectionHeaderProps) {
  const Heading = as
  const titleClass = as === 'h1'
    ? 'text-2xl font-bold text-ink'
    : 'text-[15px] font-bold text-ink'
  const subtitleClass = as === 'h1' ? 'text-sm text-ink-3' : 'text-xs text-ink-3'
  const marginClass = size === 'lg' ? 'mb-6' : size === 'md' ? 'mb-4' : 'mb-3'

  return (
    <header className={`${marginClass} ${className}`}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Heading className={`${titleClass} mb-1`}>{title}</Heading>
          {subtitle && <p className={subtitleClass}>{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  )
}
