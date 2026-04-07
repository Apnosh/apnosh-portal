'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Placeholder — will be replaced with full tabbed detail view        */
/* ------------------------------------------------------------------ */

export default function ClientDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('slug', slug)
        .single()

      if (data) setClient(data as Client)
      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-20 flex justify-center">
        <Loader2 className="w-6 h-6 text-ink-4 animate-spin" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink mb-2">Client not found</h2>
        <p className="text-ink-3 text-sm mb-4">No client with slug &ldquo;{slug}&rdquo;.</p>
        <Link href="/admin/clients" className="text-brand text-sm font-medium hover:underline">Back to clients</Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/clients" className="text-ink-4 hover:text-ink transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">{client.name}</h1>
      </div>
      <div className="bg-white rounded-xl border border-ink-6 p-8 text-center text-ink-3 text-sm">
        Client detail tabs coming next.
      </div>
    </div>
  )
}
