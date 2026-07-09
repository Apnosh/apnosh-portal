'use client'

/**
 * ActionSheet — mobile-first bottom sheet for quick actions.
 *
 * Triggered by the center "+" FAB in the bottom tab bar. Slides up
 * from below, blurs the backdrop, dismisses on backdrop tap or
 * swipe-down. Each action is a large touch target (56px+) with an
 * icon + label.
 *
 * Items can be Links (navigate on tap) or buttons (call a callback).
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  X, Sparkles, MessageCircle, Building2, Wand2, ArrowRight, CalendarDays, Star,
} from 'lucide-react'

interface ActionSheetProps {
  open: boolean
  onClose: () => void
  strategistId?: string | null
}

interface SheetAction {
  key: string
  icon: typeof Sparkles
  label: string
  description: string
  href: string
  tint: string
}

export default function ActionSheet({ open, onClose, strategistId }: ActionSheetProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /* Build a deep-link to the current page that PRESERVES existing query
     params (e.g. ?clientId for admins) and adds the action param. */
  const linkWith = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set(key, value)
    return `${pathname}?${params.toString()}`
  }

  /* Lock body scroll while sheet is open. */
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  /* Dismiss on Escape. */
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  /* Four broad, intuitive actions. An owner instantly knows which one
     they want without parsing granular sub-choices.

     Deep-link conventions:
       ?chat=open    → AgentChat opens blank
       ?request=open → QuickRequest (content) opens
     Plain paths navigate to a real page. */
  const actions: SheetAction[] = [
    {
      key: 'plan',
      icon: CalendarDays,
      label: 'Plan a moment',
      description: 'Promotions, events, and specials',
      href: '/dashboard/analytics?plan=new',
      tint: 'bg-emerald-50 text-emerald-700',
    },
    {
      key: 'create',
      icon: Wand2,
      label: 'Request content',
      description: 'Posts, photos, video, graphics',
      href: linkWith('request', 'open'),
      tint: 'bg-purple-50 text-purple-700',
    },
    {
      key: 'reviews',
      icon: Star,
      label: 'Reply to reviews',
      description: 'Respond to recent customer reviews',
      href: '/dashboard/insights/reviews',
      tint: 'bg-amber-50 text-amber-700',
    },
    {
      key: 'business',
      icon: Building2,
      label: 'Update business',
      description: 'Hours, menu, and info',
      href: '/dashboard/business-info',
      tint: 'bg-blue-50 text-blue-700',
    },
    {
      key: 'ai',
      icon: Sparkles,
      label: 'Ask Apnosh AI',
      description: 'Questions, ideas, instant help',
      href: linkWith('chat', 'open'),
      tint: 'bg-brand-tint text-brand-dark',
    },
    {
      key: 'message',
      icon: MessageCircle,
      label: 'Message your strategist',
      description: 'Talk to your human team',
      href: strategistId ? `/dashboard/messages?to=${strategistId}` : '/dashboard/messages',
      tint: 'bg-rose-50 text-rose-700',
    },
  ]

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close quick actions"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/40 sheet-backdrop lg:hidden"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick actions"
        className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl sheet-up safe-bottom lg:hidden max-h-[85vh] flex flex-col"
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-ink-6" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2">
          <h2 className="text-[17px] font-semibold text-ink">Quick actions</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-ink-7 text-ink-3 flex items-center justify-center active:bg-ink-6"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="px-3 pb-3 pt-1 overflow-y-auto touch-scroll">
          {actions.map(a => {
            const Icon = a.icon
            return (
              <li key={a.key}>
                <Link
                  href={a.href}
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl active:bg-ink-7 transition-colors min-h-[64px]"
                >
                  <span className={`inline-flex items-center justify-center w-11 h-11 rounded-2xl flex-shrink-0 ${a.tint}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-ink leading-tight">{a.label}</p>
                    <p className="text-[12.5px] text-ink-3 mt-0.5">{a.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
