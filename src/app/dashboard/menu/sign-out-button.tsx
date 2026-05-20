'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    })
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="w-full bg-white border border-ink-6 rounded-2xl py-3.5 text-[14px] font-semibold text-rose-600 active:bg-rose-50 transition-colors min-h-[52px] inline-flex items-center justify-center gap-2 disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Signing out...
        </>
      ) : (
        <>
          <LogOut className="w-4 h-4" />
          Sign out
        </>
      )}
    </button>
  )
}
