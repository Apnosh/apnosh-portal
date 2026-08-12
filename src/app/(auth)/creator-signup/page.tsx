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
import { CREATOR_SKILLS, dispatchForSkills, hasOnSiteSkill, buildServiceArea, namesAState, splitPlaces } from '@/lib/marketplace/creator-skills'
import { CREATOR_AGREEMENT_VERSION } from '@/lib/marketplace/creator-agreement'

export default function CreatorSignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [base, setBase] = useState('')
  const [coverage, setCoverage] = useState('')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // True once the login exists. If the creator-setup step then fails, a retry skips the signUp (which
  // would now error "already registered") and just re-runs setup — so a hiccup isn't a dead-end.
  const [accountReady, setAccountReady] = useState(false)
  const router = useRouter()

  const onSite = hasOnSiteSkill(skills)

  function toggleSkill(id: string) {
    setSkills((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) { setError('Enter your name'); return }
    if (skills.length === 0) { setError('Pick at least one thing you do'); return }

    // The store matches creators to restaurants by state, so the home base must name one
    // ("Seattle, WA" or just "WA") — otherwise the creator would be invisible to every restaurant.
    if (!namesAState(base)) { setError('Add your city and state, like Seattle, WA'); return }
    const coverageTokens = onSite ? splitPlaces(coverage) : []
    const areas = buildServiceArea(base, coverageTokens)

    setLoading(true)

    // Wrapped so a thrown/timed-out call surfaces an error you can retry, never a spinner that hangs.
    try {
      // Step 1 — create the login (skip if a prior attempt already made it).
      if (!accountReady) {
        if (password.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return }
        if (password !== confirmPassword) { setError('Passwords do not match'); setLoading(false); return }
        if (!agree) { setError('Please agree to the Creator Agreement to continue'); setLoading(false); return }
        const supabase = createClient()
        const { error: signErr } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
        if (signErr) { setError(signErr.message); setLoading(false); return }
        setAccountReady(true)
      }

      // Step 2 — turn the login into a creator. Idempotent, so a retry after a failure is safe.
      const res = await becomeCreator({
        name: fullName.trim(),
        craft: dispatchForSkills(skills),
        crafts: skills,
        serviceArea: areas,
        agreementVersion: CREATOR_AGREEMENT_VERSION,
      })
      if (!res.ok) { setError(res.error ?? 'Your account is ready but setup did not finish. Tap Finish setup to retry.'); setLoading(false); return }

      router.push('/creator/storefront')
      router.refresh()
    } catch {
      setError('That took too long. Your account may be ready — tap the button to try again.')
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
            <label className="block text-xs font-medium text-ink-2 mb-1">What you do <span className="font-normal text-ink-4">(pick all that apply)</span></label>
            <div className="grid grid-cols-2 gap-1.5">
              {CREATOR_SKILLS.map((c) => (
                <button key={c.id} type="button" onClick={() => toggleSkill(c.id)}
                  className={`text-left text-xs font-medium rounded-lg px-2.5 py-2 border transition-colors ${skills.includes(c.id) ? 'border-brand bg-brand/10 text-ink' : 'border-ink-5 text-ink-2 hover:bg-bg-2'}`}>
                  <span className="mr-1">{c.emoji}</span>{c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Your home base</label>
            <input type="text" value={base} onChange={(e) => setBase(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              placeholder="Seattle, WA" />
            <p className="text-[10px] text-ink-4 mt-1">City and state. The state is how restaurants find you.</p>
          </div>
          {onSite && (
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Areas you can travel to <span className="font-normal text-ink-4">(optional)</span></label>
              <input type="text" value={coverage} onChange={(e) => setCoverage(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                placeholder="Tacoma, WA, Portland, OR" />
              <p className="text-[10px] text-ink-4 mt-1">For shoots and visits. Separate places with commas.</p>
            </div>
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
          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            <span className="text-[11px] text-ink-3 leading-relaxed">
              I agree to the{' '}
              <Link href="/creator-terms" target="_blank" className="text-brand-dark font-medium hover:underline">Creator Agreement</Link>
              {' '}and{' '}
              <Link href="/privacy" target="_blank" className="text-brand-dark font-medium hover:underline">Privacy Policy</Link>.
            </span>
          </label>
          <button type="submit" disabled={loading || !agree}
            className="w-full bg-brand text-ink font-semibold text-sm py-2.5 px-4 rounded-full hover:bg-brand-dark hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2">
            {loading ? 'Setting up your studio…' : accountReady ? 'Finish setup' : 'Join as a creator'}
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
