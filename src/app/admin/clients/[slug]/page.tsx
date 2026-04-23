'use client'

import { useState, useEffect, useCallback, use, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  ArrowLeft, Loader2, Save, ExternalLink, Plus, Trash2,
  Building2, Palette, Image, BookOpen, ListTodo,
  Globe, MapPin, Mail, Phone, User, X, Check,
  BarChart3, Star, MessageSquare, RefreshCw, FileText, UserCircle,
  Activity,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import BrandTab from './tabs/brand-tab'
import AssetsTab from './tabs/assets-tab'
import StyleLibraryTab from './tabs/style-library-tab'
import QueueTab from './tabs/queue-tab'
import MetricsTab from './tabs/metrics-tab'
import ReviewsTab from './tabs/reviews-tab'
import NotesTab from './tabs/notes-tab'
import ConnectionsTab from './tabs/connections-tab'
import DashboardNotesTab from './tabs/dashboard-notes-tab'
import SyncControls from './tabs/sync-controls'
import ProfileTab from './tabs/profile-tab'
import DocsTab from './tabs/docs-tab'
import TimelineTab from './tabs/timeline-tab'
import ClientOverview from '@/components/admin/client-overview'
import WebsiteTab from './tabs/website-tab'
import { StripeBillingCard } from '@/components/admin/stripe-billing-card'
import type {
  Client, ClientBrand, ClientPattern, ClientUser, ClientAllotments,
  ClientBillingStatus, ClientTier, ClientUserRole, ClientUserStatus,
} from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

// Grouped tabs. Each group maps to one top-level nav item; within the
// group, sub-tabs show up as a secondary navigation inside the tab
// content. Reduces the top-level tab count from 14 to 8 while keeping
// every existing panel accessible.
type Tab =
  | 'overview'
  | 'profile'
  | 'timeline'       // NEW — every call, email, meeting, note
  | 'docs'
  | 'brand'          // Brand System + Assets + Style Library
  | 'content'        // Content Queue (future: calendar, pipeline)
  | 'performance'    // Social Metrics + Reviews + Website
  | 'notes'          // AM Notes + Dashboard Notes
  | 'settings'       // Connections + Data Sync

const TABS: { key: Tab; label: string; icon: typeof Building2 }[] = [
  { key: 'overview',    label: 'Overview',    icon: Building2 },
  { key: 'profile',     label: 'Profile',     icon: UserCircle },
  { key: 'timeline',    label: 'Timeline',    icon: Activity },
  { key: 'docs',        label: 'Docs',        icon: FileText },
  { key: 'brand',       label: 'Brand',       icon: Palette },
  { key: 'content',     label: 'Content',     icon: ListTodo },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
  { key: 'notes',       label: 'Notes',       icon: MessageSquare },
  { key: 'settings',    label: 'Settings',    icon: RefreshCw },
]

// Sub-tab definitions within grouped tabs. Rendered as a pill row at the
// top of the tab content area when the top-level tab has sub-sections.
type SubTab = { key: string; label: string }

const SUB_TABS: Partial<Record<Tab, SubTab[]>> = {
  brand: [
    { key: 'brand_system', label: 'Brand System' },
    { key: 'assets',       label: 'Assets' },
    { key: 'style',        label: 'Style Library' },
  ],
  performance: [
    { key: 'social',  label: 'Social Metrics' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'website', label: 'Website' },
  ],
  notes: [
    { key: 'am_notes',        label: 'AM Notes' },
    { key: 'dashboard_notes', label: 'Dashboard Notes' },
  ],
  settings: [
    { key: 'connections', label: 'Connections' },
    { key: 'data_sync',   label: 'Data Sync' },
  ],
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

// The first four are CORE service areas — each one unlocks the matching tab
// in the client dashboard sidebar (Social Media, Website, Local SEO, Email & SMS).
// The remaining options are add-ons that don't have their own dashboard tab.
const SERVICE_OPTIONS = [
  'Social Media', 'Website', 'Local SEO', 'Email & SMS',
  'Content', 'Brand', 'Paid Ads', 'Photography', 'Video', 'Strategy', 'GBP Management',
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

  // Tab state is backed by the URL (?tab=X&sub=Y) so any view is shareable
  // and the back button navigates between tabs rather than away from the
  // client page.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlTab = searchParams.get('tab') as Tab | null
  const urlSub = searchParams.get('sub')
  const activeTab: Tab = urlTab && TABS.some(t => t.key === urlTab) ? urlTab : 'overview'

  // Per-group sub-tab default if none in URL
  const DEFAULT_SUB: Record<string, string> = useMemo(() => ({
    brand: 'brand_system',
    performance: 'social',
    notes: 'am_notes',
    settings: 'connections',
  }), [])

  const activeSub = useMemo(() => {
    const subs = SUB_TABS[activeTab]
    if (!subs) return ''
    if (urlSub && subs.some(s => s.key === urlSub)) return urlSub
    return DEFAULT_SUB[activeTab] ?? subs[0].key
  }, [activeTab, urlSub, DEFAULT_SUB])

  const setTab = useCallback((tab: Tab, sub?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'overview') params.delete('tab')
    else params.set('tab', tab)
    if (sub) params.set('sub', sub)
    else params.delete('sub')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  const setSub = useCallback((sub: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sub', sub)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])
  const [client, setClient] = useState<Client | null>(null)
  const [brand, setBrand] = useState<ClientBrand | null>(null)
  const [pattern, setPattern] = useState<ClientPattern | null>(null)
  const [users, setUsers] = useState<ClientUser[]>([])
  const [loading, setLoading] = useState(true)
  // Whether this client has an active Stripe subscription -- when true,
  // the old Billing card's Monthly Rate + Billing Status become read-only
  // because they're auto-synced from the subscription via webhook.
  const [hasActiveStripeSub, setHasActiveStripeSub] = useState(false)

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

    const [brandRes, patternRes, usersRes, subRes] = await Promise.all([
      supabase.from('client_brands').select('*').eq('client_id', c.id).single(),
      supabase.from('client_patterns').select('*').eq('client_id', c.id).single(),
      supabase.from('client_users').select('*').eq('client_id', c.id).order('invited_at', { ascending: false }),
      // Detect active/past_due/trialing/paused subscription. If one exists,
      // the CRM monthly_rate + billing_status are locked because the webhook
      // auto-syncs them from Stripe.
      supabase.from('subscriptions')
        .select('id')
        .eq('client_id', c.id)
        .in('status', ['active', 'trialing', 'past_due', 'paused'])
        .limit(1)
        .maybeSingle(),
    ])

    if (brandRes.data) setBrand(brandRes.data as ClientBrand)
    if (patternRes.data) setPattern(patternRes.data as ClientPattern)
    if (usersRes.data) setUsers(usersRes.data as ClientUser[])
    setHasActiveStripeSub(subRes.data !== null)

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
      {/* Breadcrumb — kept minimal since the Overview Hero shows identity.
          On non-overview tabs we show the client name inline with the back
          link so admins know where they are without a second hero. */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-1.5 text-ink-4 hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Clients
        </Link>
        <span className="text-ink-5">/</span>
        <span className="text-ink-2 font-medium truncate">{client.name}</span>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-ink-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
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
          hasActiveStripeSub={hasActiveStripeSub}
        />
      )}

      {activeTab === 'profile' && (
        <ProfileTab clientId={client.id} />
      )}

      {activeTab === 'timeline' && (
        <TimelineTab clientId={client.id} />
      )}

      {activeTab === 'docs' && (
        <DocsTab clientId={client.id} />
      )}

      {/* Grouped tabs -- sub-nav + content */}
      {activeTab === 'brand' && (
        <div className="space-y-4">
          <SubNav
            tabs={SUB_TABS.brand!}
            active={activeSub}
            onChange={setSub}
          />
          {activeSub === 'brand_system' && (
            <BrandTab
              clientId={client.id}
              clientName={client.name}
              brand={brand}
              onBrandUpdate={setBrand}
            />
          )}
          {activeSub === 'assets' && <AssetsTab clientId={client.id} />}
          {activeSub === 'style' && <StyleLibraryTab clientId={client.id} />}
        </div>
      )}

      {activeTab === 'content' && (
        <QueueTab clientId={client.id} clientSlug={client.slug} />
      )}

      {activeTab === 'performance' && (
        <div className="space-y-4">
          <SubNav
            tabs={SUB_TABS.performance!}
            active={activeSub}
            onChange={setSub}
          />
          {activeSub === 'social' && <MetricsTab clientId={client.id} />}
          {activeSub === 'reviews' && <ReviewsTab clientId={client.id} />}
          {activeSub === 'website' && <WebsiteTab clientId={client.id} />}
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="space-y-4">
          <SubNav
            tabs={SUB_TABS.notes!}
            active={activeSub}
            onChange={setSub}
          />
          {activeSub === 'am_notes' && <NotesTab clientId={client.id} />}
          {activeSub === 'dashboard_notes' && <DashboardNotesTab clientId={client.id} />}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-4">
          <SubNav
            tabs={SUB_TABS.settings!}
            active={activeSub}
            onChange={setSub}
          />
          {activeSub === 'connections' && <ConnectionsTab clientId={client.id} />}
          {activeSub === 'data_sync' && (
            <div className="space-y-8">
              <SyncControls clientId={client.id} />
              <div>
                <h3 className="text-sm font-bold text-ink mb-2">GBP Data Import</h3>
                <Link
                  href={`/admin/clients/${client.slug}/import-gbp`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-ink-5 hover:bg-bg-2 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Import GBP CSV
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-tab nav used inside grouped tabs                               */
/* ------------------------------------------------------------------ */

function SubNav({
  tabs, active, onChange,
}: {
  tabs: SubTab[]
  active: string
  onChange: (key: string) => void
}) {
  return (
    <div className="inline-flex bg-bg-2 rounded-lg p-0.5 text-[12px]">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
            active === t.key ? 'bg-white text-ink shadow-sm' : 'text-ink-4 hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
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
  hasActiveStripeSub,
}: {
  client: Client
  setClient: (c: Client) => void
  brand: ClientBrand | null
  users: ClientUser[]
  setUsers: (u: ClientUser[]) => void
  hasActiveStripeSub: boolean
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
        // Acquisition & lifecycle (migration 064)
        lead_source: draft.lead_source,
        lead_source_detail: draft.lead_source_detail,
        acquisition_cost_cents: draft.acquisition_cost_cents,
        contract_term: draft.contract_term,
        contract_renewal_date: draft.contract_renewal_date,
        contract_auto_renew: draft.contract_auto_renew,
        churn_date: draft.churn_date,
        churn_reason: draft.churn_reason,
        churn_notes: draft.churn_notes,
      })
      .eq('id', client.id)

    if (!error) {
      setClient(draft)
      setDirty(false)
    }

    setSaving(false)
  }

  async function handleClientUpdate(changes: Partial<Client>) {
    const { error } = await supabase
      .from('clients')
      .update(changes)
      .eq('id', client.id)
    if (error) throw error
    setClient({ ...client, ...changes } as Client)
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

  const editPanelContent = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Main column ──────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-6">
        {dirty && (
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>
        )}

        {/* Services */}
        <Card title="Active Services">
          <p className="text-[11px] text-ink-4 mb-3">
            The first four control which tabs the client sees in their portal sidebar. Add-ons below don&apos;t unlock tabs.
          </p>
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
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block flex items-center gap-1.5">
                Monthly Rate
                {hasActiveStripeSub && (
                  <span className="text-[9px] normal-case tracking-normal text-ink-4 italic">· managed by Stripe</span>
                )}
              </label>
              {hasActiveStripeSub ? (
                <div className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink-3 bg-bg-2">
                  {client.monthly_rate != null && client.monthly_rate > 0
                    ? formatCurrency(client.monthly_rate) + '/mo'
                    : '—'}
                </div>
              ) : (
                <input
                  type="number"
                  value={draft.monthly_rate ?? ''}
                  onChange={e => updateDraft({ monthly_rate: e.target.value ? Number(e.target.value) : null })}
                  placeholder="0"
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              )}
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block flex items-center gap-1.5">
                Billing Status
                {hasActiveStripeSub && (
                  <span className="text-[9px] normal-case tracking-normal text-ink-4 italic">· managed by Stripe</span>
                )}
              </label>
              {hasActiveStripeSub ? (
                <div className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink-3 bg-bg-2 capitalize">
                  {(draft.billing_status ?? 'active').replace('_', ' ')}
                </div>
              ) : (
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
              )}
            </div>
            {hasActiveStripeSub && (
              <p className="text-[11px] text-ink-4 leading-snug pt-1">
                Monthly Rate + Billing Status auto-sync from the active Stripe subscription below.
                To change them, update the subscription in the Stripe Billing card.
              </p>
            )}
          </div>
        </Card>

        {/* Stripe Billing is rendered in the new overview sidebar (above).
            Kept out of the edit panel to avoid duplication. */}

        {/* Acquisition & Lifecycle (migration 064) */}
        <Card title="Acquisition & Lifecycle">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Lead Source</label>
                <select
                  value={draft.lead_source ?? ''}
                  onChange={e => updateDraft({ lead_source: (e.target.value || null) as typeof draft.lead_source })}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                >
                  <option value="">—</option>
                  <option value="referral">Referral</option>
                  <option value="inbound_web">Inbound (web)</option>
                  <option value="outbound">Outbound</option>
                  <option value="event">Event</option>
                  <option value="partnership">Partnership</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Source Detail</label>
                <input
                  type="text"
                  value={draft.lead_source_detail ?? ''}
                  onChange={e => updateDraft({ lead_source_detail: e.target.value || null })}
                  placeholder="e.g. Referred by Hong Kong Market"
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              </div>
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Acquisition Cost ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.acquisition_cost_cents != null ? draft.acquisition_cost_cents / 100 : ''}
                  onChange={e => updateDraft({
                    acquisition_cost_cents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100),
                  })}
                  placeholder="0"
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              </div>
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Contract Term</label>
                <select
                  value={draft.contract_term ?? ''}
                  onChange={e => updateDraft({ contract_term: (e.target.value || null) as typeof draft.contract_term })}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                >
                  <option value="">—</option>
                  <option value="month_to_month">Month-to-month</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Renewal / Review Date</label>
                <input
                  type="date"
                  value={draft.contract_renewal_date ?? ''}
                  onChange={e => updateDraft({ contract_renewal_date: e.target.value || null })}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.contract_auto_renew ?? true}
                    onChange={e => updateDraft({ contract_auto_renew: e.target.checked })}
                    className="w-4 h-4 rounded border-ink-6 text-brand focus:ring-brand/30"
                  />
                  Auto-renew
                </label>
              </div>
            </div>

            {/* Churn — only shown when they've actually left */}
            <details className="pt-3 border-t border-ink-6">
              <summary className="text-[11px] text-ink-4 font-medium uppercase tracking-wide cursor-pointer hover:text-ink-3">
                Churn details (if client has left)
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Churn Date</label>
                  <input
                    type="date"
                    value={draft.churn_date ?? ''}
                    onChange={e => updateDraft({ churn_date: e.target.value || null })}
                    className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Churn Reason</label>
                  <select
                    value={draft.churn_reason ?? ''}
                    onChange={e => updateDraft({ churn_reason: (e.target.value || null) as typeof draft.churn_reason })}
                    className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  >
                    <option value="">—</option>
                    <option value="price">Price</option>
                    <option value="outcome">Outcome / results</option>
                    <option value="consolidation">Consolidation</option>
                    <option value="closed_business">Closed business</option>
                    <option value="paused">Paused</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Churn Notes</label>
                  <textarea
                    value={draft.churn_notes ?? ''}
                    onChange={e => updateDraft({ churn_notes: e.target.value || null })}
                    rows={3}
                    placeholder="Context for why they left..."
                    className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
                  />
                </div>
              </div>
            </details>
          </div>
        </Card>

        {/* Service Allotments */}
        <ServiceAllotmentsCard
          clientId={client.id}
          initialAllotments={draft.allotments ?? {}}
        />

      </div>
    </div>
  )

  return <ClientOverview client={client} brand={brand} editContent={editPanelContent} onClientUpdate={handleClientUpdate} />
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

/* ------------------------------------------------------------------ */
/*  Service Allotments Card                                            */
/* ------------------------------------------------------------------ */

function ServiceAllotmentsCard({
  clientId,
  initialAllotments,
}: {
  clientId: string
  initialAllotments: ClientAllotments
}) {
  const [draft, setDraft] = useState<ClientAllotments>(initialAllotments)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function update(key: keyof ClientAllotments, value: string) {
    const num = value === '' ? undefined : parseInt(value, 10)
    setDraft(prev => ({ ...prev, [key]: Number.isNaN(num) ? undefined : num }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    const { updateClientAllotments } = await import('@/lib/client-portal-actions')
    const result = await updateClientAllotments(clientId, draft)
    setSaving(false)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const fields: { key: keyof ClientAllotments; label: string; unit: string }[] = [
    { key: 'social_posts_per_month', label: 'Social Posts', unit: 'posts/mo' },
    { key: 'website_changes_per_month', label: 'Website Changes', unit: 'changes/mo' },
    { key: 'seo_updates_per_month', label: 'SEO Updates', unit: 'updates/mo' },
    { key: 'email_campaigns_per_month', label: 'Email Campaigns', unit: 'campaigns/mo' },
  ]

  return (
    <Card title="Service Allotments">
      <div className="space-y-3">
        <p className="text-[11px] text-ink-4">Monthly limits shown to the client as usage bars.</p>
        {fields.map(f => (
          <div key={f.key} className="flex items-center gap-2">
            <label className="text-xs text-ink-2 flex-1">{f.label}</label>
            <input
              type="number"
              min="0"
              value={draft[f.key] ?? ''}
              onChange={e => update(f.key, e.target.value)}
              placeholder="0"
              className="w-16 border border-ink-6 rounded-lg px-2 py-1 text-sm text-ink text-right focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <span className="text-[10px] text-ink-4 w-20">{f.unit}</span>
          </div>
        ))}
        <div className="pt-2 border-t border-ink-6 flex items-center justify-end gap-2">
          {saved && <span className="text-[10px] text-emerald-600 font-medium">Saved</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </Card>
  )
}
