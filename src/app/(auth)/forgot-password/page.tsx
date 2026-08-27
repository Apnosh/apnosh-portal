'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { KeyRound, Mail } from 'lucide-react'
import { AuthCard, AuthHero, Field, ErrorNote, PillButton } from '../auth-ui'

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

  if (sent) {
    return (
      <AuthCard center>
        <AuthHero
          icon={<Mail size={28} color="#2e9a78" />}
          title="Check your email"
          subtitle=""
        />
        <p className="text-[14px] leading-relaxed" style={{ color: '#6e6e73', marginTop: -16 }}>
          We sent a reset link to <span className="font-semibold" style={{ color: '#1d1d1f' }}>{email}</span>.
        </p>
        <Link href="/login" className="text-[14px] font-semibold mt-6 inline-block" style={{ color: '#0f6e56' }}>
          Back to sign in
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <AuthHero
        icon={<KeyRound size={28} color="#2e9a78" />}
        title="Reset your password"
        subtitle="We will email you a link to set a new one."
      />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email" value={email} onChange={setEmail} placeholder="you@business.com" type="email" autoComplete="email" />
        <PillButton loading={loading}>{loading ? 'Sending...' : 'Send reset link'}</PillButton>
      </form>
      <p className="text-center text-[13px] mt-6" style={{ color: '#8e8e93' }}>
        Remembered it?{' '}
        <Link href="/login" className="font-semibold" style={{ color: '#0f6e56' }}>Sign in</Link>
      </p>
    </AuthCard>
  )
}
