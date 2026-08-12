'use client'

/**
 * Self-serve creator signup — the ACCOUNT step only. Email + password creates the login, then we
 * hand straight off to /onboarding/creator (the guided wizard), which asks everything about the
 * person once: name, skills, home base + coverage, bio, first offer. No questions are duplicated
 * here; the wizard's completeCreatorOnboarding is the one write path that makes them a creator.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CreatorSignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true)

    try {
      const supabase = createClient()
      // Stamp the intent on the login. If they close the tab before finishing the wizard, this is
      // what tells the middleware to send them back to creator setup instead of restaurant onboarding.
      const { error: signErr } = await supabase.auth.signUp({ email, password, options: { data: { signup_intent: 'creator' } } })
      if (signErr) { setError(signErr.message); setLoading(false); return }
      router.push('/onboarding/creator')
      router.refresh()
    } catch {
      setError('That took too long. Try again — if your account was created, just sign in.')
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-8">
        <div className="text-center mb-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
            Apn<em className="text-brand-dark italic">osh</em> <span className="text-ink-3 text-lg">for creators</span>
          </h1>
          <p className="text-ink-4 text-xs mt-1">Set your own prices. Restaurants book you directly.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>
          )}
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
            {loading ? 'Creating your account…' : 'Join as a creator'}
          </button>
          <p className="text-[11px] text-ink-3 leading-relaxed text-center">
            Next, a quick setup asks what you do and where you work. By joining you agree to the{' '}
            <Link href="/creator-terms" target="_blank" className="text-brand-dark font-medium hover:underline">Creator Agreement</Link>
            {' '}and{' '}
            <Link href="/privacy" target="_blank" className="text-brand-dark font-medium hover:underline">Privacy Policy</Link>.
          </p>
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
