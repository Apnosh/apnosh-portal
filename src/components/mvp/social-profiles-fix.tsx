'use client'

/**
 * The "Set up your social profiles" walkthrough — the free lane of the socialprofiles card, in
 * the same shape as the listings fix: one platform at a time, the exact lines to paste, a link
 * straight to that platform's edit screen, and a tick when the owner has done it.
 *
 * HONESTY RULE (same as listings): we cannot read a bio off any of these platforms, so nothing
 * here claims to have checked one. Ticks are the owner's word; through the campaign door they
 * persist on the campaign (socialProfilesFixed / socialProfilesSelfDoneAt), through the plain
 * door they live in this tab only.
 */

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useMvpTheme } from './mvp-theme'

interface Kit {
  business: { name: string; address: string; phone: string; website: string; cuisine: string; city: string; description: string }
  linked: Record<string, boolean>
}

interface Platform {
  key: string
  label: string
  editUrl: string
  editLabel: string
  /** max bio length the pasted line must fit */
  bioMax: number
  steps: string[]
}

const PLATFORMS: Platform[] = [
  {
    key: 'instagram', label: 'Instagram', bioMax: 150,
    editUrl: 'https://www.instagram.com/accounts/edit/', editLabel: 'Open Instagram settings',
    steps: ['Switch to a business account if you have not', 'Paste the bio', 'Set the website link', 'Add your address and hours under contact options', 'Use your logo or storefront as the photo'],
  },
  {
    key: 'facebook', label: 'Facebook', bioMax: 255,
    editUrl: 'https://www.facebook.com/pages/?category=your_pages', editLabel: 'Open your Facebook page',
    steps: ['Fill the About section with the bio', 'Set hours, address and phone', 'Set the website link', 'Add an action button (Order, Reserve or Call)', 'Match the profile photo to your other pages'],
  },
  {
    key: 'tiktok', label: 'TikTok', bioMax: 80,
    editUrl: 'https://www.tiktok.com/setting', editLabel: 'Open TikTok settings',
    steps: ['Switch to a business account (free) to unlock the website link', 'Paste the short bio', 'Set the website link', 'Match the photo and handle to your other pages'],
  },
  {
    key: 'linkedin', label: 'LinkedIn', bioMax: 250,
    editUrl: 'https://www.linkedin.com/company/setup/new/', editLabel: 'Open LinkedIn pages',
    steps: ['Create or claim your company page', 'Paste the bio into the tagline and About', 'Set the website link and location', 'Use your logo as the page photo'],
  },
  {
    key: 'youtube', label: 'YouTube', bioMax: 1000,
    editUrl: 'https://studio.youtube.com/', editLabel: 'Open YouTube Studio',
    steps: ['Name the channel after your business, not a person', 'Paste the bio into the channel description', 'Add the website link under channel links', 'Use your logo as the channel picture'],
  },
]

/** Plain-words bio lines built from real business facts. No invention: a missing fact just
 *  drops its line rather than guessing. */
function buildBio(b: Kit['business'], max: number): string {
  const what = [b.cuisine, b.city ? `in ${b.city}` : ''].filter(Boolean).join(' ')
  const parts = [
    b.name && what ? `${b.name} · ${what}` : b.name,
    b.address,
    b.website,
  ].filter(Boolean)
  let out = ''
  for (const p of parts) {
    const next = out ? `${out}\n${p}` : p
    if (next.length > max) break
    out = next
  }
  return out || b.name
}

export default function SocialProfilesFix({ campaignId, initialFixed }: { campaignId?: string; initialFixed: string[] }) {
  const { C } = useMvpTheme()
  const [kit, setKit] = useState<Kit | null>(null)
  const [done, setDone] = useState<string[]>(initialFixed)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let live = true
    fetch('/api/dashboard/social-profile-kit')
      .then((r) => r.json())
      .then((j) => { if (live && j?.business) setKit(j) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const allDone = done.length >= PLATFORMS.length

  async function toggle(key: string) {
    const next = done.includes(key) ? done.filter((k) => k !== key) : [...done, key]
    setDone(next)
    if (!campaignId) return
    const finished = next.length >= PLATFORMS.length
    // Same write the listings fix makes: the tick list always, the all-done stamp once true.
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ execution: { socialProfilesFixed: next, ...(finished ? { socialProfilesSelfDoneAt: new Date().toISOString() } : {}) } }),
    }).catch(() => {})
  }

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(''), 1600)
  }

  const facts = useMemo(() => kit ? [
    { label: 'Name', value: kit.business.name },
    { label: 'Address', value: kit.business.address },
    { label: 'Phone', value: kit.business.phone },
    { label: 'Website', value: kit.business.website },
  ].filter((f) => f.value) : [], [kit])

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px 48px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 18 }}>Set up your social profiles</div>
      <div style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5, marginTop: 6 }}>
        One platform at a time. Paste the same lines everywhere so every page tells the same story.
      </div>

      {/* the shared facts, once — every platform below pastes from these */}
      {facts.length > 0 && (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 16, marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.mute, marginBottom: 10 }}>Your info, the same everywhere</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {facts.map((f) => (
              <button key={f.label} onClick={() => copy(f.value, f.label)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.bg, border: 'none', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 11.5, color: C.faint, width: 58, flexShrink: 0 }}>{f.label}</span>
                <span style={{ fontSize: 13, color: C.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</span>
                {copied === f.label ? <Check size={14} color={C.greenDk} /> : <Copy size={14} color={C.faint} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* one card per platform */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {PLATFORMS.map((p) => {
          const isDone = done.includes(p.key)
          const linked = kit?.linked?.[p.key]
          const bio = kit ? buildBio(kit.business, p.bioMax) : ''
          return (
            <div key={p.key} style={{ background: '#fff', border: `0.5px solid ${isDone ? C.green : C.line}`, borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, flex: 1 }}>{p.label}</div>
                {linked && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '3px 9px' }}>On your dashboard</span>}
                <button onClick={() => toggle(p.key)} aria-label={`Mark ${p.label} done`}
                  style={{ width: 26, height: 26, borderRadius: 8, border: `1.5px solid ${isDone ? C.green : C.line}`, background: isDone ? C.green : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {isDone && <Check size={15} color="#fff" strokeWidth={3} />}
                </button>
              </div>

              {bio && (
                <button onClick={() => copy(bio, p.key)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', background: C.bg, border: 'none', borderRadius: 10, padding: '10px 12px', marginTop: 12, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.mute, marginBottom: 4 }}>Bio to paste ({p.bioMax} letters max)</div>
                    <div style={{ fontSize: 12.5, color: C.ink, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{bio}</div>
                  </div>
                  {copied === p.key ? <Check size={14} color={C.greenDk} style={{ marginTop: 2 }} /> : <Copy size={14} color={C.faint} style={{ marginTop: 2 }} />}
                </button>
              )}

              <ol style={{ margin: '12px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {p.steps.map((st) => <li key={st} style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}>{st}</li>)}
              </ol>

              <a href={p.editUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12.5, fontWeight: 700, color: C.greenDk, textDecoration: 'none' }}>
                {p.editLabel} <ExternalLink size={13} />
              </a>
            </div>
          )
        })}
      </div>

      <div style={{ textAlign: 'center', fontSize: 12.5, color: allDone ? C.greenDk : C.faint, fontWeight: allDone ? 700 : 500, marginTop: 20 }}>
        {allDone ? 'All five done. Every page tells the same story now.' : `${done.length} of ${PLATFORMS.length} platforms done`}
      </div>
    </div>
  )
}
