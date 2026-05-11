'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Save } from 'lucide-react'

const TIERS = [
  { value: 'Basic',    label: 'Basic',    blurb: 'Entry retainer' },
  { value: 'Standard', label: 'Standard', blurb: 'Core retainer' },
  { value: 'Pro',      label: 'Pro',      blurb: 'Full-service' },
  { value: 'Internal', label: 'Internal', blurb: 'Apnosh-owned account' },
]

const ALLOTMENT_FIELDS = [
  { key: 'social_posts_per_month',    label: 'Social posts',     sub: 'feed, reels, carousels, stories combined' },
  { key: 'website_changes_per_month', label: 'Website changes',  sub: 'menu updates, content edits, small redesigns' },
  { key: 'seo_updates_per_month',     label: 'SEO updates',      sub: 'GBP posts, optimizations, citations' },
  { key: 'email_campaigns_per_month', label: 'Email campaigns',  sub: 'newsletters, promos, SMS blasts' },
]

interface Props {
  clientId: string
  initialTier: string | null
  initialMonthlyRate: number | null
  initialAllotments: Record<string, number>
  currentSocialUsage: number
}

export default function PlanForm({
  clientId, initialTier, initialMonthlyRate, initialAllotments, currentSocialUsage,
}: Props) {
  const router = useRouter()
  const [tier, setTier] = useState<string>(initialTier ?? 'Standard')
  const [monthlyRate, setMonthlyRate] = useState<string>(
    initialMonthlyRate != null ? String(initialMonthlyRate) : '',
  )
  const [allotments, setAllotments] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const f of ALLOTMENT_FIELDS) {
      const v = initialAllotments[f.key]
      out[f.key] = v != null ? String(v) : ''
    }
    return out
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const allotPayload: Record<string, number> = {}
      for (const [k, v] of Object.entries(allotments)) {
        const n = parseInt(v, 10)
        if (Number.isFinite(n) && n > 0) allotPayload[k] = n
      }
      const res = await fetch(`/api/admin/clients/${clientId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          monthlyRate: monthlyRate ? Number(monthlyRate) : null,
          allotments: allotPayload,
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `Server returned ${res.status}`)
      }
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-7">
      {/* Tier */}
      <Field label="Tier" hint="Determines the default monthly allotment and rate.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TIERS.map(t => {
            const selected = tier === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTier(t.value)}
                className={`rounded-xl border bg-white px-3 py-2.5 text-left transition-all ${
                  selected ? 'border-ink shadow-sm' : 'border-ink-6 hover:border-ink-4'
                }`}
              >
                <p className="text-[13px] font-semibold text-ink leading-tight">{t.label}</p>
                <p className="text-[10px] text-ink-3 leading-tight mt-0.5">{t.blurb}</p>
              </button>
            )
          })}
        </div>
      </Field>

      {/* Monthly rate */}
      <Field label="Monthly rate" hint="Charged via Stripe (when wired).">
        <div className="relative max-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-[14px]">$</span>
          <input
            type="number"
            value={monthlyRate}
            onChange={(e) => setMonthlyRate(e.target.value)}
            placeholder="1200"
            className="w-full rounded-xl border bg-white pl-7 pr-3 py-2.5 text-[14px] text-ink tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 text-[11px]">/mo</span>
        </div>
      </Field>

      {/* Allotments */}
      <Field
        label="Monthly allotments"
        hint="What the client gets each month at this tier. Anything beyond is quoted."
      >
        <div className="space-y-2">
          {ALLOTMENT_FIELDS.map(f => {
            const value = allotments[f.key]
            const isSocial = f.key === 'social_posts_per_month'
            const limit = value ? parseInt(value, 10) : 0
            const percent = limit > 0 ? Math.min(100, Math.round((currentSocialUsage / limit) * 100)) : null
            return (
              <div
                key={f.key}
                className="flex items-center gap-3 rounded-xl border bg-white p-3"
                style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink leading-tight">{f.label}</p>
                  <p className="text-[11px] text-ink-3 leading-tight mt-0.5">{f.sub}</p>
                </div>
                {isSocial && limit > 0 && (
                  <p className="text-[11px] text-ink-4 tabular-nums">
                    {currentSocialUsage} used{percent !== null ? ` · ${percent}%` : ''}
                  </p>
                )}
                <input
                  type="number"
                  min={0}
                  value={value}
                  onChange={(e) => setAllotments({ ...allotments, [f.key]: e.target.value })}
                  placeholder="—"
                  className="w-20 text-right rounded-lg border bg-white px-2 py-1.5 text-[14px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                  style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
                />
                <span className="text-[11px] text-ink-4 w-10">/ mo</span>
              </div>
            )
          })}
        </div>
      </Field>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 text-[13px] font-semibold bg-ink hover:bg-ink/90 disabled:opacity-50 text-white rounded-full px-4 py-2.5 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save plan'}
        </button>
        <p className="text-[11px] text-ink-4">
          Client sees the Plan card on /dashboard/social once allotments are set.
        </p>
      </div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <label className="text-[13px] font-semibold text-ink">{label}</label>
        {hint && <p className="text-[11px] text-ink-4 text-right max-w-md">{hint}</p>}
      </div>
      {children}
    </div>
  )
}
