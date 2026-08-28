'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { KeyRound, Eye, EyeOff, Check } from 'lucide-react'
import { AuthCard, AuthHero, Field, ErrorNote, PillButton, StrengthMeter, pwStrength } from '../auth-ui'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const strength = pwStrength(password)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!strength.ok) { setError(strength.need || 'Use 8 characters or more'); return }
    if (password !== confirmPw) { setError('Passwords do not match'); return }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }
    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  if (success) {
    return (
      <AuthCard center>
        <AuthHero icon={<Check size={28} color="#2e9a78" />} title="Password updated" subtitle="Taking you to your portal..." />
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <AuthHero
        icon={<KeyRound size={28} color="#2e9a78" />}
        title="Set a new password"
        subtitle="8 characters or more, with a letter and a number."
      />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field
          label="New password" value={password} onChange={setPassword} placeholder="8 characters or more"
          type={showPw ? 'text' : 'password'} autoComplete="new-password"
          trailing={
            <button
              type="button" onClick={() => setShowPw(!showPw)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{ width: 28, height: 28, border: 'none', background: 'none', color: '#8e8e93', cursor: 'pointer' }}
            >
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          }
        />
        <StrengthMeter strength={strength} password={password} />
        <Field
          label="Repeat password" value={confirmPw} onChange={setConfirmPw} placeholder="Type it again"
          type={showPw ? 'text' : 'password'} autoComplete="new-password"
          hint={confirmPw.length > 0 && confirmPw !== password ? 'These do not match yet' : undefined}
        />
        <PillButton loading={loading}>{loading ? 'Saving...' : 'Save new password'}</PillButton>
      </form>
    </AuthCard>
  )
}
