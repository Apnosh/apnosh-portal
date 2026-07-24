'use client'

/**
 * Add a creator — the one-step onboard form on the admin creators list. Name + email + craft, and the
 * creator gets a set-your-password invite (or, if they already have a login, gets linked). On success
 * they can sign in and land in their own creator workspace with a storefront to price.
 */

import { useState } from 'react'
import { UserPlus, Loader2, Check, AlertCircle } from 'lucide-react'
import { onboardCreator } from '@/app/admin/vendor-applications/actions'
import type { CreatorCraft } from '@/lib/marketplace/onboard-creator'

const CRAFTS: { value: CreatorCraft; label: string }[] = [
  { value: 'Photo', label: 'Photographer' },
  { value: 'Video', label: 'Videographer' },
  { value: 'Social', label: 'Social / influencer' },
  { value: 'Design', label: 'Designer' },
]

export default function AddCreator() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [craft, setCraft] = useState<CreatorCraft>('Photo')
  const [area, setArea] = useState('WA')
  const [invite, setInvite] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const canSubmit = !busy && name.trim().length > 0 && emailOk

  async function submit() {
    setBusy(true); setResult(null)
    const res = await onboardCreator({
      name: name.trim(),
      email: email.trim(),
      craft,
      serviceArea: area.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      invite,
    })
    setBusy(false)
    if (res.ok) {
      setResult({
        ok: true,
        msg: res.invited
          ? `Invite sent to ${email.trim()}. They set their own password, then land in their creator workspace. Storefront: /marketplace/${res.slug}`
          : `Linked ${email.trim()} to the creator — they can sign in and open their creator workspace. Storefront: /marketplace/${res.slug}`,
      })
      setName(''); setEmail('')
    } else {
      setResult({ ok: false, msg: res.error ?? 'Could not onboard the creator.' })
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-ink text-white px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition"
      >
        <UserPlus className="w-4 h-4" /> Add a creator
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-ink">Add a creator</h2>
        <button onClick={() => { setOpen(false); setResult(null) }} className="text-[12px] text-ink-3 hover:text-ink">Close</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maya Rivera"
            className="mt-1 w-full rounded-xl border border-ink-6 px-3 py-2 text-sm text-ink outline-none focus:border-ink-4" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="maya@example.com"
            className="mt-1 w-full rounded-xl border border-ink-6 px-3 py-2 text-sm text-ink outline-none focus:border-ink-4" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Craft</span>
          <select value={craft} onChange={(e) => setCraft(e.target.value as CreatorCraft)}
            className="mt-1 w-full rounded-xl border border-ink-6 px-3 py-2 text-sm text-ink outline-none focus:border-ink-4 bg-white">
            {CRAFTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Serves (state codes)</span>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="WA"
            className="mt-1 w-full rounded-xl border border-ink-6 px-3 py-2 text-sm text-ink outline-none focus:border-ink-4" />
        </label>
      </div>

      <label className="mt-3 flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} className="mt-0.5" />
        <span className="text-[12px] text-ink-2 leading-relaxed">
          Email them a set-your-password invite if they don&apos;t have a login yet. They set the password themselves.
          {' '}Turn off to link an existing login only.
        </span>
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={submit} disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-ink text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Onboard creator
        </button>
        {!emailOk && email.length > 0 && <span className="text-[12px] text-ink-3">Enter a valid email.</span>}
      </div>

      {result && (
        <div className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-[13px] ${result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
          {result.ok ? <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span className="leading-relaxed">{result.msg}</span>
        </div>
      )}
    </div>
  )
}
