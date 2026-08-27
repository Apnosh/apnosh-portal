'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Store, Eye, EyeOff } from 'lucide-react'
import { AuthCard, AuthHero, Field, GoogleButton, OrDivider, ErrorNote, PillButton } from '../auth-ui'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Route admins to the admin portal
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authUser.id)
        .single()
      if (profile?.role === 'admin') {
        router.push('/admin')
        router.refresh()
        return
      }
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogleLogin() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <AuthCard>
      <AuthHero icon={<Store size={28} color="#2e9a78" />} title="Welcome back" subtitle="Sign in to your portal." />

      <GoogleButton label="Continue with Google" onClick={handleGoogleLogin} />
      <OrDivider />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email" value={email} onChange={setEmail} placeholder="you@business.com" type="email" autoComplete="email" />
        <div>
          <Field
            label="Password" value={password} onChange={setPassword} placeholder="Your password"
            type={showPw ? 'text' : 'password'} autoComplete="current-password"
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
          <div className="text-right mt-1.5">
            <Link href="/forgot-password" className="text-[13px] font-semibold" style={{ color: '#0f6e56' }}>
              Forgot password?
            </Link>
          </div>
        </div>
        <PillButton loading={loading}>{loading ? 'Signing in...' : 'Sign in'}</PillButton>
      </form>

      <p className="text-center text-[13px] mt-6" style={{ color: '#8e8e93' }}>
        New to Apnosh?{' '}
        <Link href="/signup" className="font-semibold" style={{ color: '#0f6e56' }}>Create an account</Link>
      </p>
      <p className="text-center text-[13px] mt-2" style={{ color: '#8e8e93' }}>
        Offer services to restaurants?{' '}
        <Link href="/creator-signup" className="font-semibold" style={{ color: '#0f6e56' }}>Join as a creator</Link>
      </p>
    </AuthCard>
  )
}
