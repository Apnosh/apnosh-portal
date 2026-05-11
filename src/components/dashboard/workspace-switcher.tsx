/**
 * Workspace switcher chip — top of the dashboard top bar.
 *
 * Reads the signed-in user's roles from /api/me/capabilities and
 * shows the current "viewing as" lens. If the user has only one
 * role, it's a static badge. With two or more it opens a dropdown
 * to swap lenses — selecting one navigates to that role's landing.
 *
 * Phase 0: pure context cue + navigation. Phase 1+ will hang
 * per-role contextual menus and an active-client picker off this.
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Check } from 'lucide-react'
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

interface ApiPayload {
  all: RoleSummary[]
  active: RoleSummary | null
}

export default function WorkspaceSwitcher() {
  const router = useRouter()
  const params = useSearchParams()
  const roleParam = params.get('role')

  const [data, setData] = useState<ApiPayload | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Fetch capabilities. Re-fetch when ?role= changes so the active
  // pill matches the URL.
  useEffect(() => {
    let alive = true
    const qs = roleParam ? `?role=${encodeURIComponent(roleParam)}` : ''
    fetch('/api/me/capabilities' + qs, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { all: [], active: null }))
      .then((j: ApiPayload) => { if (alive) setData(j) })
      .catch(() => { if (alive) setData({ all: [], active: null }) })
    return () => { alive = false }
  }, [roleParam])

  // Click-outside close.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!data || !data.active) return null

  const active = data.active
  const all = data.all
  const hasMultiple = all.length > 1
  const a = ACCENT_CLASSES[active.accent]

  const chip = (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ring-1 ${a.bg} ${a.text} ${a.ring} text-[12px] font-semibold transition-colors`}>
      <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} aria-hidden />
      {active.label}
      {hasMultiple && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
    </span>
  )

  if (!hasMultiple) return <div className="select-none">{chip}</div>

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-3 rounded-full"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {chip}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-1.5 w-64 bg-white rounded-2xl border border-ink-6 shadow-lg overflow-hidden z-50"
        >
          <div className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-[0.18em] text-ink-4 font-semibold">
            Viewing as
          </div>
          <ul>
            {all.map(r => {
              const isActive = r.role === active.role
              const ac = ACCENT_CLASSES[r.accent]
              return (
                <li key={r.role}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      if (!isActive) router.push(r.landingPath + '?role=' + r.role)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-2 transition-colors ${isActive ? 'bg-bg-2' : ''}`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 ${ac.bg} ${ac.ring}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${ac.dot}`} aria-hidden />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[13px] font-semibold ${ac.text} leading-tight`}>{r.label}</span>
                      <span className="block text-[11px] text-ink-4 leading-tight">{r.landingPath}</span>
                    </span>
                    {isActive && <Check className="w-4 h-4 text-ink-3" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
