'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSent(true)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-8">
        <div className="text-center mb-8">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
            Apn<em className="text-brand-dark italic">osh</em>
          </h1>
          <p className="text-ink-4 text-xs mt-1">Reset your password</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-ink font-medium mb-1">Check your email</p>
            <p className="text-xs text-ink-3 mb-6">
              We sent a password reset link to <span className="font-medium text-ink">{email}</span>
            </p>
            <Link
              href="/login"
              className="text-sm text-brand-dark font-medium hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-3 mb-4">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                  placeholder="you@business.com"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand text-ink font-semibold text-sm py-2.5 px-4 rounded-full hover:bg-brand-dark hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>

            <p className="text-center text-xs text-ink-4 mt-6">
              Remember your password?{' '}
              <Link href="/login" className="text-brand-dark font-medium hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
