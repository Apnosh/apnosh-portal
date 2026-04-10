'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Users, TrendingUp, Star, Globe, MapPin, Mail, ShoppingBag,
  Target, ArrowRight, Check, Loader2, Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'

const GOALS = [
  { id: 'more_customers', label: 'Get more customers', icon: Users, description: 'Drive foot traffic and new business' },
  { id: 'grow_social', label: 'Grow social media', icon: TrendingUp, description: 'More followers and engagement' },
  { id: 'more_reviews', label: 'Get more reviews', icon: Star, description: 'Build trust with 5-star reviews' },
  { id: 'increase_traffic', label: 'Increase website traffic', icon: Globe, description: 'Drive more visitors to your site' },
  { id: 'improve_local_seo', label: 'Improve local SEO', icon: MapPin, description: 'Rank higher in local searches' },
  { id: 'start_email', label: 'Start email marketing', icon: Mail, description: 'Build and engage your email list' },
  { id: 'launch_product', label: 'Launch a product or service', icon: ShoppingBag, description: 'Get the word out about something new' },
  { id: 'brand_awareness', label: 'Build brand awareness', icon: Target, description: 'Get your name in front of more people' },
]

export default function GoalsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { client, refresh } = useClient()

  const [selected, setSelected] = useState<Set<string>>(
    new Set((client?.goals as string[]) || [])
  )
  const [saving, setSaving] = useState(false)

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!client?.id || selected.size === 0) return
    setSaving(true)

    await supabase
      .from('clients')
      .update({ goals: Array.from(selected) })
      .eq('id', client.id)

    await refresh()
    setSaving(false)
    router.push('/dashboard')
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-tint flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-brand-dark" />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
          What are your goals?
        </h1>
        <p className="text-ink-3 text-sm mt-2 max-w-md mx-auto leading-relaxed">
          Pick 2-5 goals so we know what to focus on. You can change these anytime.
        </p>
      </div>

      {/* Goals grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GOALS.map(goal => {
          const active = selected.has(goal.id)
          const Icon = goal.icon
          return (
            <button
              key={goal.id}
              onClick={() => toggle(goal.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                active
                  ? 'bg-brand-tint border-brand/40 ring-2 ring-brand/20'
                  : 'bg-white border-ink-6 hover:border-brand/30 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  active ? 'bg-white' : 'bg-bg-2'
                }`}>
                  <Icon className={`w-4.5 h-4.5 ${active ? 'text-brand-dark' : 'text-ink-3'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{goal.label}</p>
                    {active && <Check className="w-4 h-4 text-brand-dark flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-ink-3 mt-0.5">{goal.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <Link href="/dashboard" className="text-sm text-ink-3 hover:text-ink transition-colors">
          Skip for now
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-4">
            {selected.size} selected
          </span>
          <button
            onClick={handleSave}
            disabled={saving || selected.size === 0}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-xl px-6 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Save and continue
          </button>
        </div>
      </div>
    </div>
  )
}
