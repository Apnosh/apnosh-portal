'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Save, ExternalLink, Plus, Trash2,
  Building2, Palette, Image, BookOpen, ListTodo,
  Globe, MapPin, Mail, Phone, User, X, Check,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import BrandTab from './tabs/brand-tab'
import AssetsTab from './tabs/assets-tab'
import StyleLibraryTab from './tabs/style-library-tab'
import QueueTab from './tabs/queue-tab'
import type {
  Client, ClientBrand, ClientPattern, ClientUser,
  ClientBillingStatus, ClientTier, ClientUserRole, ClientUserStatus,
} from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Tab = 'overview' | 'brand' | 'assets' | 'style_library' | 'queue'

const TABS: { key: Tab; label: string; icon: typeof Building2 }[] = [
  { key: 'overview', label: 'Overview', icon: Building2 },
  { key: 'brand', label: 'Brand System', icon: Palette },
  { key: 'assets', label: 'Assets', icon: Image },
  { key: 'style_library', label: 'Style Library', icon: BookOpen },
  { key: 'queue', label: 'Content Queue', icon: ListTodo },
]

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

const ROLE_STYLES: Record<ClientUserRole, string> = {
  owner: 'bg-purple-50 text-purple-700',
  manager: 'bg-blue-50 text-blue-700',
  contributor: 'bg-ink-6 text-ink-3',
}

const STATUS_STYLES: Record<ClientUserStatus, string> = {
  invited: 'bg-amber-50 text-amber-700',
  active: 'bg-emerald-50 text-emerald-700',
  disabled: 'bg-red-50 text-red-700',
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

function socialUrl(platform: string, handle: string): string {
  if (handle.startsWith('http')) return handle
  const map: Record<string, string> = {
    instagram: `https://instagram.com/${handle.replace('@', '')}`,
    tiktok: `https://tiktok.com/${handle.replace('@', '')}`,
    linkedin: handle.startsWith('linkedin.com') ? `https://${handle}` : `https://linkedin.com/company/${handle}`,
    facebook: handle.startsWith('facebook.com') ? `https://${handle}` : `https://facebook.com/${handle}`,
  }
  return map[platform] || handle
}

const SERVICE_OPTIONS = [
  'Social Media', 'Content', 'Brand', 'SEO', 'Paid Ads', 'Email',
  'Website', 'Photography', 'Video', 'Strategy', 'GBP Management',
]

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function DetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4 animate-pulse">
        <div className="w-5 h-5 bg-ink-6 rounded" />
        <div className="w-12 h-12 bg-ink-6 rounded-xl" />
        <div className="space-y-2">
          <div className="h-6 w-48 bg-ink-6 rounded" />
          <div className="h-4 w-32 bg-ink-6 rounded" />
        </div>
      </div>
      <div className="h-10 bg-ink-6 rounded animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-ink-6 p-5 h-64" />
          <div className="bg-white rounded-xl border border-ink-6 p-5 h-40" />
        </div>
        <div className="bg-white rounded-xl border border-ink-6 p-5 h-80" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ClientDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [client, setClient] = useState<Client | null>(null)
  const [brand, setBrand] = useState<ClientBrand | null>(null)
  const [pattern, setPattern] = useState<ClientPattern | null>(null)
  const [users, setUsers] = useState<ClientUser[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!clientData) {
      setLoading(false)
      return
    }

    const c = clientData as Client
    setClient(c)

    const [brandRes, patternRes, usersRes] = await Promise.all([
      supabase.from('client_brands').select('*').eq('client_id', c.id).single(),
      supabase.from('client_patterns').select('*').eq('client_id', c.id).single(),
      supabase.from('client_users').select('*').eq('client_id', c.id).order('invited_at', { ascending: false }),
    ])

    if (brandRes.data) setBrand(brandRes.data as ClientBrand)
    if (patternRes.data) setPattern(patternRes.data as ClientPattern)
    if (usersRes.data) setUsers(usersRes.data as ClientUser[])

    setLoading(false)
  }, [slug, supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  if (loading) return <DetailSkeleton />

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
      {/* ── Persistent Header ──────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Link href="/admin/clients" className="text-ink-4 hover:text-ink transition-colors mt-1.5">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3 flex-1">
          {brand?.logo_url ? (
            <img src={brand.logo_url} alt={client.name} className="w-12 h-12 rounded-xl object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-brand-tint flex items-center justify-center">
              <span className="text-brand-dark text-base font-bold">{initials(client.name)}</span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">{client.name}</h1>
              {client.tier && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TIER_STYLES[client.tier] ?? ''}`}>
                  {client.tier}
                </span>
              )}
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${BILLING_STYLES[client.billing_status]}`}>
                {client.billing_status}
              </span>
            </div>
            <p className="text-ink-3 text-sm">{[client.industry, client.location].filter(Boolean).join(' \u00b7 ') || 'No details'}</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-ink-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <OverviewTab
          client={client}
          setClient={setClient}
          brand={brand}
          users={users}
          setUsers={setUsers}
        />
      )}

      {activeTab === 'brand' && (
        <BrandTab
          clientId={client.id}
          clientName={client.name}
          brand={brand}
          onBrandUpdate={setBrand}
        />
      )}

      {activeTab === 'assets' && (
        <AssetsTab clientId={client.id} />
      )}

      {activeTab === 'style_library' && (
        <StyleLibraryTab clientId={client.id} />
      )}

      {activeTab === 'queue' && (
        <QueueTab clientId={client.id} clientSlug={client.slug} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Placeholder Tab                                                    */
/* ------------------------------------------------------------------ */

function PlaceholderTab({ label, description }: { label: string; description: string }) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
      <p className="text-sm font-medium text-ink-2">{label}</p>
      <p className="text-xs text-ink-4 mt-1">{description}</p>
    </div>
  )
}

/* ================================================================== */
/*  OVERVIEW TAB                                                       */
/* ================================================================== */

function OverviewTab({
  client,
  setClient,
  brand,
  users,
  setUsers,
}: {
  client: Client
  setClient: (c: Client) => void
  brand: ClientBrand | null
  users: ClientUser[]
  setUsers: (u: ClientUser[]) => void
}) {
  const supabase = createClient()

  // Inline editing state
  const [draft, setDraft] = useState<Client>(client)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Notes auto-save
  const [notesSaving, setNotesSaving] = useState(false)

  // Invite user
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<ClientUserRole>('contributor')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    setDraft(client)
    setDirty(false)
  }, [client])

  function updateDraft(fields: Partial<Client>) {
    setDraft(prev => ({ ...prev, ...fields }))
    setDirty(true)
  }

  function updateSocial(key: string, value: string) {
    setDraft(prev => ({
      ...prev,
      socials: { ...prev.socials, [key]: value || undefined },
    }))
    setDirty(true)
  }

  function toggleService(s: string) {
    setDraft(prev => ({
      ...prev,
      services_active: prev.services_active.includes(s)
        ? prev.services_active.filter(x => x !== s)
        : [...prev.services_active, s],
    }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)

    const { error } = await supabase
      .from('clients')
      .update({
        name: draft.name,
        industry: draft.industry,
        location: draft.location,
        website: draft.website,
        primary_contact: draft.primary_contact,
        email: draft.email,
        phone: draft.phone,
        socials: draft.socials,
        services_active: draft.services_active,
        tier: draft.tier,
        monthly_rate: draft.monthly_rate,
        billing_status: draft.billing_status,
        onboarding_date: draft.onboarding_date,
      })
      .eq('id', client.id)

    if (!error) {
      setClient(draft)
      setDirty(false)
    }

    setSaving(false)
  }

  async function handleNotesBlur() {
    if (draft.notes === client.notes) return
    setNotesSaving(true)

    await supabase
      .from('clients')
      .update({ notes: draft.notes })
      .eq('id', client.id)

    setClient({ ...client, notes: draft.notes })
    setNotesSaving(false)
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)

    const { inviteClientUser } = await import('@/lib/client-portal-actions')
    const result = await inviteClientUser(
      client.id,
      inviteEmail.trim(),
      inviteName.trim(),
      inviteRole,
    )

    if (result.success) {
      // Refetch users
      const { data } = await supabase
        .from('client_users')
        .select('*')
        .eq('client_id', client.id)
        .order('invited_at', { ascending: false })
      if (data) setUsers(data as ClientUser[])

      setShowInvite(false)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('contributor')
    } else {
      alert(`Failed to send invitation: ${result.error}`)
    }

    setInviting(false)
  }

  async function resendMagicLink(user: ClientUser) {
    const { inviteClientUser } = await import('@/lib/client-portal-actions')
    const result = await inviteClientUser(client.id, user.email, user.name || '', user.role)
    if (result.success) {
      alert(`Magic link sent to ${user.email}`)
    } else {
      alert(`Failed: ${result.error}`)
    }
  }

  async function removeUser(userId: string) {
    await supabase.from('client_users').delete().eq('id', userId)
    setUsers(users.filter(u => u.id !== userId))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Main column ──────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-6">
        {/* Client Info */}
        <Card title="Client Information">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InlineField label="Client Name" value={draft.name} onChange={v => updateDraft({ name: v })} />
            <InlineField label="Industry" value={draft.industry ?? ''} onChange={v => updateDraft({ industry: v || null })} />
            <InlineField label="Location" value={draft.location ?? ''} onChange={v => updateDraft({ location: v || null })} />
            <InlineField label="Website" value={draft.website ?? ''} onChange={v => updateDraft({ website: v || null })} />
            <InlineField label="Primary Contact" value={draft.primary_contact ?? ''} onChange={v => updateDraft({ primary_contact: v || null })} />
            <InlineField label="Email" value={draft.email ?? ''} onChange={v => updateDraft({ email: v || null })} />
            <InlineField label="Phone" value={draft.phone ?? ''} onChange={v => updateDraft({ phone: v || null })} />
            <InlineField label="Onboarding Date" value={draft.onboarding_date ?? ''} onChange={v => updateDraft({ onboarding_date: v || null })} type="date" />
          </div>

          {dirty && (
            <div className="flex justify-end mt-4 pt-4 border-t border-ink-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          )}
        </Card>

        {/* Social Accounts */}
        <Card title="Social Accounts">
          <div className="space-y-3">
            {(['instagram', 'tiktok', 'linkedin', 'facebook', 'gbp'] as const).map(platform => {
              const val = (draft.socials as Record<string, string | undefined>)[platform] ?? ''
              return (
                <div key={platform} className="flex items-center gap-3">
                  <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide w-20 flex-shrink-0">{platform === 'gbp' ? 'GBP' : platform}</span>
                  <input
                    type="text"
                    value={val}
                    onChange={e => updateSocial(platform, e.target.value)}
                    placeholder={platform === 'gbp' ? 'Google Business Profile URL' : `@handle or URL`}
                    className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  />
                  {val && (
                    <a
                      href={socialUrl(platform, val)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-4 hover:text-brand transition-colors flex-shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        {/* Services */}
        <Card title="Active Services">
          <div className="flex flex-wrap gap-2">
            {SERVICE_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => toggleService(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  draft.services_active.includes(s)
                    ? 'bg-brand-tint text-brand-dark border-brand/30'
                    : 'bg-white text-ink-4 border-ink-6 hover:text-ink-2'
                }`}
              >
                {draft.services_active.includes(s) && <Check className="w-3 h-3 inline mr-1" />}
                {s}
              </button>
            ))}
          </div>
        </Card>

        {/* Client Users */}
        <Card
          title="Client Users"
          action={
            <button
              onClick={() => setShowInvite(true)}
              className="text-xs font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Invite User
            </button>
          }
        >
          {/* Invite form */}
          {showInvite && (
            <div className="mb-4 p-4 bg-bg-2 rounded-lg space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="Email *"
                  className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
                <input
                  type="text"
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  placeholder="Name"
                  className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as ClientUserRole)}
                  className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                >
                  <option value="owner">Owner</option>
                  <option value="manager">Manager</option>
                  <option value="contributor">Contributor</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || inviting}
                  className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add
                </button>
                <button onClick={() => setShowInvite(false)} className="text-xs text-ink-4 hover:text-ink transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {users.length === 0 ? (
            <p className="text-sm text-ink-4">No users yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-6">
                    <th className="text-left py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Name</th>
                    <th className="text-left py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Email</th>
                    <th className="text-left py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Role</th>
                    <th className="text-left py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Status</th>
                    <th className="text-right py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-ink-6 last:border-0">
                      <td className="py-2.5 text-ink font-medium">{u.name || '--'}</td>
                      <td className="py-2.5 text-ink-2">{u.email}</td>
                      <td className="py-2.5">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ROLE_STYLES[u.role]}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[u.status]}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => resendMagicLink(u)}
                            className="text-[10px] font-medium text-brand hover:text-brand-dark transition-colors"
                            title="Send magic link"
                          >
                            Send Link
                          </button>
                          <button
                            onClick={() => removeUser(u.id)}
                            className="text-ink-4 hover:text-red-500 transition-colors p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* Billing */}
        <Card title="Billing">
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Tier</label>
              <select
                value={draft.tier ?? ''}
                onChange={e => updateDraft({ tier: (e.target.value || null) as ClientTier | null })}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                <option value="">No tier</option>
                <option value="Basic">Basic</option>
                <option value="Standard">Standard</option>
                <option value="Pro">Pro</option>
                <option value="Internal">Internal</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Monthly Rate</label>
              <input
                type="number"
                value={draft.monthly_rate ?? ''}
                onChange={e => updateDraft({ monthly_rate: e.target.value ? Number(e.target.value) : null })}
                placeholder="0"
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Billing Status</label>
              <select
                value={draft.billing_status}
                onChange={e => updateDraft({ billing_status: e.target.value as ClientBillingStatus })}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
                <option value="past_due">Past Due</option>
              </select>
            </div>
            {client.monthly_rate != null && client.monthly_rate > 0 && (
              <div className="pt-2 border-t border-ink-6">
                <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Current Rate</span>
                <p className="text-lg font-semibold text-ink mt-0.5">{formatCurrency(client.monthly_rate)}<span className="text-ink-4 text-sm font-normal">/mo</span></p>
              </div>
            )}
          </div>
        </Card>

        {/* Brand Quick View */}
        {brand && (
          <Card title="Brand Quick View">
            <div className="space-y-3">
              {/* Colors */}
              <div>
                <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Colors</span>
                <div className="flex gap-2 mt-1.5">
                  {[brand.primary_color, brand.secondary_color, brand.accent_color].filter(Boolean).map((c, i) => (
                    <div key={i} className="group relative">
                      <div
                        className="w-8 h-8 rounded-lg border border-ink-6 cursor-pointer"
                        style={{ backgroundColor: c! }}
                        title={c!}
                      />
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-ink-4 font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {c}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fonts */}
              {(brand.font_display || brand.font_body) && (
                <div className="pt-2">
                  <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Fonts</span>
                  <div className="mt-1 space-y-1">
                    {brand.font_display && <p className="text-sm text-ink">{brand.font_display} <span className="text-ink-4">(display)</span></p>}
                    {brand.font_body && <p className="text-sm text-ink">{brand.font_body} <span className="text-ink-4">(body)</span></p>}
                  </div>
                </div>
              )}

              {/* Style pills */}
              <div className="flex flex-wrap gap-1.5 pt-2">
                {brand.visual_style && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3">{brand.visual_style.replace(/_/g, ' ')}</span>
                )}
                {brand.depth_style && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3">{brand.depth_style.replace(/_/g, ' ')}</span>
                )}
                {brand.edge_treatment && brand.edge_treatment !== 'none' && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3">{brand.edge_treatment.replace(/_/g, ' ')}</span>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Notes */}
        <Card title="Notes">
          <div className="relative">
            <textarea
              value={draft.notes ?? ''}
              onChange={e => { updateDraft({ notes: e.target.value }); setDirty(false) }}
              onBlur={handleNotesBlur}
              placeholder="Internal notes about this client..."
              rows={5}
              className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
            />
            {notesSaving && (
              <span className="absolute bottom-3 right-3 text-[10px] text-ink-4 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
              </span>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-base text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function InlineField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
      />
    </div>
  )
}
