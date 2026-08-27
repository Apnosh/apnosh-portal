'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Store, Eye, EyeOff } from 'lucide-react'

/* Sign-up in the onboarding design language: light ground, soft depth,
 * filled inputs, one gradient pill. Collects the owner's name and phone up
 * front (both land on profiles via the auth trigger + migration 246). */

const FIELD_BG = '#f1f1f4'
const FOCUS_SHADOW = '0 0 0 3px rgba(74,189,152,0.15), 0 8px 20px rgba(0,0,0,0.05)'

function Field({
  label, value, onChange, placeholder, type = 'text', autoComplete, hint, trailing,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
  autoComplete?: string
  hint?: string
  trailing?: React.ReactNode
}) {
  const [focus, setFocus] = useState(false)
  return (
    <div>
      <div className="text-[13px] font-semibold mb-1.5" style={{ color: '#48484a' }}>{label}</div>
      <div className="relative">
        <input
          type={type} value={value} required autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          placeholder={placeholder}
          className="w-full text-[15px] outline-none transition-all"
          style={{
            padding: trailing ? '13px 44px 13px 14px' : '13px 14px',
            borderRadius: 12, border: '1px solid transparent',
            background: focus ? '#fff' : FIELD_BG,
            boxShadow: focus ? FOCUS_SHADOW : 'none',
            color: '#1d1d1f',
          }}
        />
        {trailing}
      </div>
      {hint ? <div className="text-[12px] mt-1" style={{ color: '#8e8e93' }}>{hint}</div> : null}
    </div>
  )
}

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (fullName.trim().length < 2) { setError('Tell us your name'); return }
    if (phone.replace(/\D/g, '').length < 10) { setError('That phone number looks short'); return }
    if (password.length < 8) { setError('Password needs 8 characters or more'); return }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.trim() } },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/onboarding/full')
    router.refresh()
  }

  async function handleGoogleSignup() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="w-full" style={{ maxWidth: 420 }}>
      <div
        className="rounded-[24px] px-6 py-8 sm:px-8"
        style={{
          background: 'radial-gradient(120% 30% at 50% 0%, rgba(74,189,152,0.08), rgba(255,255,255,0) 60%), #fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 24px 60px rgba(0,0,0,0.10)',
        }}
      >
        <div className="flex flex-col items-center text-center mb-7">
          <div
            className="flex items-center justify-center mb-4"
            style={{
              width: 64, height: 64, borderRadius: 20,
              background: 'linear-gradient(180deg, #eafaf3, #dff5ec)',
              boxShadow: '0 10px 30px rgba(74,189,152,0.22), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <Store size={28} color="#2e9a78" />
          </div>
          <h1 className="text-[28px] font-bold" style={{ color: '#1d1d1f', letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            Create your account
          </h1>
          <p className="text-[14px] mt-1.5" style={{ color: '#6e6e73' }}>
            Your marketing, run from one place.
          </p>
        </div>

        <button
          onClick={handleGoogleSignup}
          className="w-full flex items-center justify-center gap-2.5 text-[14px] font-semibold transition-all"
          style={{
            minHeight: 48, borderRadius: 24, border: 'none', background: '#fff', color: '#1d1d1f',
            boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.07)', cursor: 'pointer',
          }}
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ background: '#ececef' }} />
          <span className="text-[12px]" style={{ color: '#aeaeb2' }}>or</span>
          <div className="flex-1 h-px" style={{ background: '#ececef' }} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div
              className="text-[13px] px-3.5 py-2.5 rounded-[12px]"
              style={{ background: '#fdf1f0', color: '#b3261e' }}
            >
              {error}
            </div>
          )}
          <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Alex Rivera" autoComplete="name" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@business.com" type="email" autoComplete="email" />
          <Field
            label="Phone" value={phone} onChange={setPhone} placeholder="(555) 123-4567" type="tel" autoComplete="tel"
            hint="So your team can reach you about your work."
          />
          <Field
            label="Password" value={password} onChange={setPassword} placeholder="8 characters or more"
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
          <button
            type="submit" disabled={loading}
            className="w-full text-[15px] font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            style={{
              minHeight: 52, borderRadius: 26,
              background: 'linear-gradient(135deg, #4abd98, #2e9a78)',
              boxShadow: '0 10px 30px rgba(74,189,152,0.38)',
              border: 'none', cursor: 'pointer',
            }}
          >
            {loading ? 'Creating your account...' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-[13px] mt-6" style={{ color: '#8e8e93' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold" style={{ color: '#0f6e56' }}>Sign in</Link>
        </p>
        <p className="text-center text-[13px] mt-2" style={{ color: '#8e8e93' }}>
          Offer services to restaurants?{' '}
          <Link href="/creator-signup" className="font-semibold" style={{ color: '#0f6e56' }}>Join as a creator</Link>
        </p>
      </div>
    </div>
  )
}
