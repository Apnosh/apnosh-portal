/**
 * Capability chip group — top of every authenticated page.
 *
 * Roles in Apnosh are additive permissions on one account, NOT
 * separate workspaces you switch between. So this component shows
 * the SET of capabilities you hold side-by-side, no dropdown, no
 * "viewing as" mode.
 *
 * One capability: a single chip ("Strategist").
 * Multiple: a row of chips ("Strategist · Copywriter").
 * Zero: render nothing.
 *
 * Click a chip → navigate to that role's landing path (still useful
 * as a quick "go to my home for this hat" shortcut), but it's not a
 * lens switch.
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RoleSummary } from '@/lib/auth/capabilities'

const ACCENT_CLASSES: Record<RoleSummary['accent'], { bg: string; text: string; ring: string; dot: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100', dot: 'bg-emerald-500' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  ring: 'ring-violet-100',  dot: 'bg-violet-500' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-100',   dot: 'bg-amber-500' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-100',    dot: 'bg-rose-500' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  ring: 'ring-indigo-100',  dot: 'bg-indigo-500' },
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-100',     dot: 'bg-sky-500' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    ring: 'ring-teal-100',    dot: 'bg-teal-500' },
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-700',    ring: 'ring-pink-100',    dot: 'bg-pink-500' },
  ink:     { bg: 'bg-ink-7',      text: 'text-ink',         ring: 'ring-ink-6',       dot: 'bg-ink' },
  brand:   { bg: 'bg-brand-tint', text: 'text-brand-dark',  ring: 'ring-brand/20',    dot: 'bg-brand' },
}

export default function WorkspaceSwitcher() {
  const router = useRouter()
  const [caps, setCaps] = useState<RoleSummary[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/me/capabilities', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { all: [] })
      .then((j: { all?: RoleSummary[] }) => { if (alive) setCaps(j.all ?? []) })
      .catch(() => { if (alive) setCaps([]) })
    return () => { alive = false }
  }, [])

  if (!caps || caps.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto lg:flex-wrap lg:overflow-visible -mx-1 px-1 scrollbar-thin">
      {caps.map(role => {
        const a = ACCENT_CLASSES[role.accent]
        return (
          <button
            key={role.role}
            type="button"
            onClick={() => router.push(role.landingPath)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ${a.bg} ${a.text} ${a.ring} text-[12px] font-semibold transition-colors hover:brightness-95 flex-shrink-0`}
            title={`Go to ${role.label} home`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} aria-hidden />
            {role.label}
          </button>
        )
      })}
    </div>
  )
}
