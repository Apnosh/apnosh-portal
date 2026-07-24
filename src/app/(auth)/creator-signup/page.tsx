'use client'

/**
 * Self-serve creator signup. A creator makes their own account (their own password, on the client),
 * then it's turned into a creator with a storefront to price. No admin, no waiting for approval.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { becomeCreator } from './actions'
import type { CreatorCraft } from '@/lib/marketplace/onboard-creator'

const CRAFTS: { value: CreatorCraft; label: string }[] = [
  { value: 'Photo', label: 'Photographer' },
  { value: 'Video', label: 'Videographer' },
  { value: 'Social', label: 'Social / influencer' },
  { value: 'Design', label: 'Designer' },
]

export default function CreatorSignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [craft, setCraft] = useState<CreatorCraft>('Photo')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) { setError('Enter your name'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }

    setLoading(true)
    const supabase = createClient()
    const { error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (signErr) { setError(signErr.message); setLoading(false); return }

    // Now signed in — turn this fresh login into a creator with a storefront.
    const res = await becomeCreator({ name: fullName.trim(), craft })
    if (!res.ok) { setError(res.error ?? 'Could not finish setting up your creator account.'); setLoading(false); return }

    router.push('/creator/storefront')
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-8">
        <div className="text-center mb-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
            Apn<em className="text-brand-dark italic">osh</em> <span className="text-ink-3 text-lg">for creators</span>
          </h1>
          <p className="text-ink-4 text-xs mt-1">Join and set your own prices. Restaurants book you directly.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Your name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              placeholder="Your name or studio" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">What you do</label>
            <div className="grid grid-cols-2 gap-2">
              {CRAFTS.map((c) => (
                <button key={c.value} type="button" onClick={() => setCraft(c.value)}
                  className={`text-xs font-medium rounded-lg px-3 py-2 border transition-colors ${craft === c.value ? 'border-brand bg-brand/10 text-ink' : 'border-ink-5 text-ink-2 hover:bg-bg-2'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              placeholder="you@email.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              placeholder="Min. 8 characters" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Confirm password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              placeholder="Re-enter your password" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-brand text-ink font-semibold text-sm py-2.5 px-4 rounded-full hover:bg-brand-dark hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2">
            {loading ? 'Setting up your studio…' : 'Join as a creator'}
          </button>
        </form>

        <p className="text-center text-xs text-ink-4 mt-6">
          Have a creator account?{' '}
          <Link href="/login" className="text-brand-dark font-medium hover:underline">Sign in</Link>
        </p>
        <p className="text-center text-xs text-ink-4 mt-2">
          Are you a restaurant?{' '}
          <Link href="/signup" className="text-brand-dark font-medium hover:underline">Sign up here</Link>
        </p>
      </div>
    </div>
  )
}
