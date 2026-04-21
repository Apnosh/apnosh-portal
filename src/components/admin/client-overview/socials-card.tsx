'use client'

/**
 * Social accounts card for the client overview sidebar.
 *
 * Shows connected handles for each platform with a click-to-edit input
 * and an external-link icon that opens the profile. Replaces the socials
 * section that used to live inside the "Edit details" accordion.
 */

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'

// Brand-name icons from Lucide aren't available in this version, so each
// platform gets a short 2-letter badge instead -- readable and consistent.
function PlatformBadge({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded text-[8px] font-bold bg-ink-6 text-ink-3 ${className}`}
      aria-hidden="true"
    >
      {label}
    </span>
  )
}

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'gbp'

const PLATFORMS: Array<{
  key: Platform
  label: string
  badge: string
  placeholder: string
}> = [
  { key: 'instagram', label: 'Instagram', badge: 'IG', placeholder: '@handle' },
  { key: 'tiktok',    label: 'TikTok',    badge: 'TT', placeholder: '@handle' },
  { key: 'facebook',  label: 'Facebook',  badge: 'FB', placeholder: 'page or URL' },
  { key: 'linkedin',  label: 'LinkedIn',  badge: 'LI', placeholder: 'company slug' },
  { key: 'gbp',       label: 'Google',    badge: 'GB', placeholder: 'business profile URL' },
]

function externalUrl(platform: Platform, handle: string): string {
  if (handle.startsWith('http')) return handle
  const clean = handle.replace(/^@/, '')
  const map: Record<Platform, string> = {
    instagram: `https://instagram.com/${clean}`,
    tiktok: `https://tiktok.com/@${clean}`,
    facebook: handle.includes('facebook.com') ? `https://${handle}` : `https://facebook.com/${clean}`,
    linkedin: handle.includes('linkedin.com') ? `https://${handle}` : `https://linkedin.com/company/${clean}`,
    gbp: handle,
  }
  return map[platform]
}

interface Props {
  socials: Record<string, string | undefined> | null | undefined
  onSave: (socials: Record<string, string | undefined>) => Promise<void>
}

export default function SocialsCard({ socials, onSave }: Props) {
  const initial = (socials ?? {}) as Record<string, string | undefined>
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {}
    for (const p of PLATFORMS) seed[p.key] = initial[p.key] ?? ''
    return seed
  })
  const [saving, setSaving] = useState<Platform | null>(null)

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const p of PLATFORMS) next[p.key] = (socials as Record<string, string | undefined>)?.[p.key] ?? ''
    setDraft(next)
  }, [socials])

  async function commit(platform: Platform) {
    const current = (socials as Record<string, string | undefined>)?.[platform] ?? ''
    const next = draft[platform]?.trim() ?? ''
    if (next === current.trim()) return
    setSaving(platform)
    try {
      const merged = { ...(socials as Record<string, string | undefined>) }
      if (next) merged[platform] = next
      else delete merged[platform]
      await onSave(merged)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <h3 className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide mb-2">Socials</h3>
      <div className="space-y-1.5">
        {PLATFORMS.map(p => {
          const value = draft[p.key] ?? ''
          return (
            <div key={p.key} className="flex items-center gap-2">
              <PlatformBadge label={p.badge} />
              <input
                type="text"
                value={value}
                onChange={e => setDraft(d => ({ ...d, [p.key]: e.target.value }))}
                onBlur={() => commit(p.key)}
                placeholder={p.placeholder}
                className="flex-1 min-w-0 text-[12px] text-ink placeholder:text-ink-4 border-0 border-b border-transparent hover:border-ink-6 focus:border-brand focus:outline-none bg-transparent py-0.5"
              />
              {saving === p.key ? (
                <Loader2 className="w-3 h-3 animate-spin text-ink-4" />
              ) : value ? (
                <a
                  href={externalUrl(p.key, value)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-4 hover:text-brand-dark flex-shrink-0"
                  title={`Open ${p.label}`}
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
