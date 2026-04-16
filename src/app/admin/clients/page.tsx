'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Plus, MapPin, Globe, X, ChevronRight, Loader2,
  Building2, Palette, Users, Check,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Client, ClientBillingStatus } from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ClientCard extends Client {
  logo_url: string | null
  pending_queue: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const BILLING_STYLES: Record<ClientBillingStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-red-50 text-red-700',
  past_due: 'bg-red-50 text-red-700',
}

const TIER_STYLES: Record<string, string> = {
  Basic: 'bg-ink-6 text-ink-3',
  Standard: 'bg-blue-50 text-blue-700',
  Pro: 'bg-purple-50 text-purple-700',
  Internal: 'bg-brand-tint text-brand-dark',
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/* ------------------------------------------------------------------ */
/*  Add Client Modal                                                   */
/* ------------------------------------------------------------------ */

const FONT_OPTIONS = [
  'Inter', 'Playfair Display', 'DM Sans', 'Poppins', 'Manrope', 'Outfit',
  'Plus Jakarta Sans', 'Space Grotesk', 'Sora', 'Crimson Text', 'Lora',
  'Merriweather', 'Source Serif Pro', 'Roboto Slab',
]

interface AddClientForm {
  name: string
  industry: string
  location: string
  website: string
  primary_contact: string
  email: string
  phone: string
  instagram: string
  tiktok: string
  linkedin: string
  facebook: string
  gbp: string
  services: string[]
  tier: string
  monthly_rate: string
  primary_color: string
  secondary_color: string
  accent_color: string
  font_display: string
  font_body: string
  voice_notes: string
}

const INITIAL_FORM: AddClientForm = {
  name: '', industry: '', location: '', website: '',
  primary_contact: '', email: '', phone: '',
  instagram: '', tiktok: '', linkedin: '', facebook: '', gbp: '',
  services: [], tier: 'Standard', monthly_rate: '',
  primary_color: '#4abd98', secondary_color: '#2e9a78', accent_color: '#eaf7f3',
  font_display: 'Playfair Display', font_body: 'Inter', voice_notes: '',
}

const SERVICE_OPTIONS = [
  'Social Media', 'Content', 'Brand', 'SEO', 'Paid Ads', 'Email',
  'Website', 'Photography', 'Video', 'Strategy', 'GBP Management',
]

function AddClientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<AddClientForm>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(fields: Partial<AddClientForm>) {
    setForm(prev => ({ ...prev, ...fields }))
  }

  function toggleService(s: string) {
    setForm(prev => ({
      ...prev,
      services: prev.services.includes(s)
        ? prev.services.filter(x => x !== s)
        : [...prev.services, s],
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Client name is required'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()
    const slug = slugify(form.name)

    // 1. Create client
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .insert({
        name: form.name.trim(),
        slug,
        industry: form.industry || null,
        location: form.location || null,
        website: form.website || null,
        primary_contact: form.primary_contact || null,
        email: form.email || null,
        phone: form.phone || null,
        socials: {
          instagram: form.instagram || undefined,
          tiktok: form.tiktok || undefined,
          linkedin: form.linkedin || undefined,
          facebook: form.facebook || undefined,
          gbp: form.gbp || undefined,
        },
        services_active: form.services,
        tier: form.tier || null,
        monthly_rate: form.monthly_rate ? Number(form.monthly_rate) : null,
      })
      .select()
      .single()

    if (clientErr || !client) {
      setError(clientErr?.message || 'Failed to create client')
      setSaving(false)
      return
    }

    // 2. Create brand row
    await supabase.from('client_brands').insert({
      client_id: client.id,
      primary_color: form.primary_color || null,
      secondary_color: form.secondary_color || null,
      accent_color: form.accent_color || null,
      font_display: form.font_display || null,
      font_body: form.font_body || null,
      voice_notes: form.voice_notes || null,
    })

    // 3. Create patterns row (empty for now)
    await supabase.from('client_patterns').insert({ client_id: client.id })

    // 4. Create minimal client_profiles row (CRM canonical profile)
    const { ensureClientProfile } = await import('@/lib/crm-sync')
    await ensureClientProfile(client.id)

    setSaving(false)
    setForm(INITIAL_FORM)
    setStep(1)
    onCreated()
    onClose()
  }

  if (!open) return null

  const steps = [
    { num: 1, label: 'Basic Info', icon: Building2 },
    { num: 2, label: 'Socials', icon: Globe },
    { num: 3, label: 'Services', icon: Users },
    { num: 4, label: 'Brand', icon: Palette },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-ink-6 shadow-xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-ink-6 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Add Client</h2>
          <button onClick={onClose} className="text-ink-4 hover:text-ink transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-ink-6 flex gap-1">
          {steps.map(s => (
            <button
              key={s.num}
              onClick={() => setStep(s.num)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                step === s.num ? 'bg-brand-tint text-brand-dark' : 'text-ink-4 hover:text-ink-2'
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {step === 1 && (
            <>
              <Field label="Client Name *" value={form.name} onChange={v => update({ name: v })} placeholder="Acme Corp" />
              <Field label="Industry" value={form.industry} onChange={v => update({ industry: v })} placeholder="Restaurant, Dental, Fitness..." />
              <Field label="Location" value={form.location} onChange={v => update({ location: v })} placeholder="City, State" />
              <Field label="Website" value={form.website} onChange={v => update({ website: v })} placeholder="https://..." />
              <Field label="Primary Contact" value={form.primary_contact} onChange={v => update({ primary_contact: v })} placeholder="Name" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Email" value={form.email} onChange={v => update({ email: v })} placeholder="email@example.com" />
                <Field label="Phone" value={form.phone} onChange={v => update({ phone: v })} placeholder="(555) 123-4567" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Instagram" value={form.instagram} onChange={v => update({ instagram: v })} placeholder="@handle" />
              <Field label="TikTok" value={form.tiktok} onChange={v => update({ tiktok: v })} placeholder="@handle" />
              <Field label="LinkedIn" value={form.linkedin} onChange={v => update({ linkedin: v })} placeholder="linkedin.com/company/..." />
              <Field label="Facebook" value={form.facebook} onChange={v => update({ facebook: v })} placeholder="facebook.com/..." />
              <Field label="Google Business Profile" value={form.gbp} onChange={v => update({ gbp: v })} placeholder="URL or name" />
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2 block">Active Services</label>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => toggleService(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        form.services.includes(s)
                          ? 'bg-brand-tint text-brand-dark border-brand/30'
                          : 'bg-white text-ink-3 border-ink-6 hover:text-ink-2'
                      }`}
                    >
                      {form.services.includes(s) && <Check className="w-3 h-3 inline mr-1" />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Tier</label>
                  <select
                    value={form.tier}
                    onChange={e => update({ tier: e.target.value })}
                    className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  >
                    <option value="Basic">Basic</option>
                    <option value="Standard">Standard</option>
                    <option value="Pro">Pro</option>
                    <option value="Internal">Internal</option>
                  </select>
                </div>
                <Field label="Monthly Rate" value={form.monthly_rate} onChange={v => update({ monthly_rate: v })} placeholder="1500" type="number" />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <ColorField label="Primary" value={form.primary_color} onChange={v => update({ primary_color: v })} />
                <ColorField label="Secondary" value={form.secondary_color} onChange={v => update({ secondary_color: v })} />
                <ColorField label="Accent" value={form.accent_color} onChange={v => update({ accent_color: v })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Display Font</label>
                  <select
                    value={form.font_display}
                    onChange={e => update({ font_display: e.target.value })}
                    className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  >
                    {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Body Font</label>
                  <select
                    value={form.font_body}
                    onChange={e => update({ font_body: e.target.value })}
                    className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  >
                    {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Voice Notes</label>
                <textarea
                  value={form.voice_notes}
                  onChange={e => update({ voice_notes: e.target.value })}
                  placeholder="Tone, personality, writing style..."
                  rows={3}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ink-6 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="text-sm text-ink-3 hover:text-ink transition-colors">
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Create Client
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Field helpers                                                      */
/* ------------------------------------------------------------------ */

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
      />
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg border border-ink-6 cursor-pointer p-0"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-ink-6" />
        <div className="space-y-1.5">
          <div className="h-4 w-28 bg-ink-6 rounded" />
          <div className="h-3 w-20 bg-ink-6 rounded" />
        </div>
      </div>
      <div className="flex gap-1.5">
        <div className="h-5 w-16 bg-ink-6 rounded-full" />
        <div className="h-5 w-12 bg-ink-6 rounded-full" />
      </div>
      <div className="flex justify-between">
        <div className="h-3 w-24 bg-ink-6 rounded" />
        <div className="h-3 w-16 bg-ink-6 rounded" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientCard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [billingFilter, setBillingFilter] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)

  const supabase = createClient()

  const fetchClients = useCallback(async () => {
    setLoading(true)

    // Fetch clients with logo and queue counts
    const { data: clientRows } = await supabase
      .from('clients')
      .select('*')
      .order('name')

    if (!clientRows) {
      setClients([])
      setLoading(false)
      return
    }

    const clientIds = clientRows.map(c => c.id)

    // Get latest logo per client
    const { data: logos } = await supabase
      .from('client_assets')
      .select('client_id, file_url')
      .in('client_id', clientIds.length > 0 ? clientIds : ['__none__'])
      .eq('type', 'logo')
      .order('uploaded_at', { ascending: false })

    const logoMap = new Map<string, string>()
    for (const l of logos ?? []) {
      if (!logoMap.has(l.client_id)) logoMap.set(l.client_id, l.file_url)
    }

    // Count pending queue items per client
    const { data: queueCounts } = await supabase
      .from('content_queue')
      .select('client_id')
      .in('client_id', clientIds.length > 0 ? clientIds : ['__none__'])
      .in('status', ['new', 'drafting', 'in_review'])

    const queueMap = new Map<string, number>()
    for (const q of queueCounts ?? []) {
      queueMap.set(q.client_id, (queueMap.get(q.client_id) ?? 0) + 1)
    }

    const cards: ClientCard[] = clientRows.map(c => ({
      ...c,
      logo_url: logoMap.get(c.id) ?? null,
      pending_queue: queueMap.get(c.id) ?? 0,
    }))

    setClients(cards)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const filtered = useMemo(() => {
    let result = [...clients]

    if (billingFilter !== 'all') {
      result = result.filter(c => c.billing_status === billingFilter)
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.industry ?? '').toLowerCase().includes(q)
      )
    }

    return result
  }, [clients, billingFilter, search])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Clients</h1>
          <p className="text-ink-3 text-sm mt-1">{clients.length} total clients</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
          <input
            type="text"
            placeholder="Search by name or industry..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
        <select
          value={billingFilter}
          onChange={e => setBillingFilter(e.target.value)}
          className="text-sm border border-ink-6 rounded-lg px-3 py-2 text-ink-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        >
          <option value="all">All Billing</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
          <option value="past_due">Past Due</option>
        </select>
      </div>

      {/* Client Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-6 h-6 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">
            {search ? 'No clients match your search.' : 'No clients yet.'}
          </p>
          <p className="text-xs text-ink-4 mt-1">
            {search ? 'Try a different search term.' : 'Click "Add Client" to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => (
            <Link
              key={client.id}
              href={`/admin/clients/${client.slug}`}
              className="bg-white rounded-xl border border-ink-6 p-5 hover:border-brand/30 hover:shadow-sm transition-all group"
            >
              {/* Top row: Logo/initials + name + tier */}
              <div className="flex items-start gap-3">
                {client.logo_url ? (
                  <img
                    src={client.logo_url}
                    alt={client.name}
                    className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-brand-tint flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-dark text-sm font-bold">{initials(client.name)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink truncate group-hover:text-brand-dark transition-colors">
                      {client.name}
                    </h3>
                    {client.tier && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${TIER_STYLES[client.tier] ?? 'bg-ink-6 text-ink-3'}`}>
                        {client.tier}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {client.industry && (
                      <span className="text-xs text-ink-3 truncate">{client.industry}</span>
                    )}
                    {client.location && (
                      <>
                        <span className="text-ink-5 text-xs">|</span>
                        <span className="text-xs text-ink-4 truncate flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />
                          {client.location}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Services pills */}
              {client.services_active.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {client.services_active.slice(0, 4).map(s => (
                    <span key={s} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3">
                      {s}
                    </span>
                  ))}
                  {client.services_active.length > 4 && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-4">
                      +{client.services_active.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* Bottom row: billing + queue */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink-6">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${BILLING_STYLES[client.billing_status]}`}>
                    {client.billing_status}
                  </span>
                  {client.monthly_rate != null && client.monthly_rate > 0 && (
                    <span className="text-xs font-medium text-ink-2">
                      {formatCurrency(client.monthly_rate)}/mo
                    </span>
                  )}
                </div>
                {client.pending_queue > 0 && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {client.pending_queue} pending
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add Client Modal */}
      <AddClientModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={fetchClients}
      />
    </div>
  )
}
