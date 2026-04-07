'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Send, Receipt, MessageSquare, Clock,
  Building2, Plus, Filter, ChevronRight, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { addClientNote, adminCreateManualInvoice, sendMessage } from '@/lib/actions'
import type {
  Business, Agreement, Subscription, ClientNote, ClientActivityEntry,
  MessageThread, Message, Deliverable, EnhancedInvoice,
} from '@/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'overview' | 'deliverables' | 'agreements' | 'billing' | 'messages' | 'activity' | 'profile'

const tabItems: Array<{ label: string; value: Tab }> = [
  { label: 'Overview', value: 'overview' },
  { label: 'Deliverables', value: 'deliverables' },
  { label: 'Agreements', value: 'agreements' },
  { label: 'Billing', value: 'billing' },
  { label: 'Messages', value: 'messages' },
  { label: 'Activity', value: 'activity' },
  { label: 'Profile', value: 'profile' },
]

const statusBadge: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-red-50 text-red-700',
  past_due: 'bg-red-50 text-red-700',
  trialing: 'bg-blue-50 text-blue-700',
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-50 text-blue-700',
  viewed: 'bg-indigo-50 text-indigo-700',
  signed: 'bg-green-50 text-green-700',
  expired: 'bg-red-50 text-red-700',
  paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
  void: 'bg-gray-100 text-gray-500',
  pending_agreement: 'bg-amber-50 text-amber-700',
  agreement_sent: 'bg-blue-50 text-blue-700',
  agreement_signed: 'bg-green-50 text-green-700',
  offboarded: 'bg-gray-100 text-gray-500',
  // deliverable statuses
  internal_review: 'bg-purple-50 text-purple-700',
  client_review: 'bg-blue-50 text-blue-700',
  revision_requested: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  scheduled: 'bg-indigo-50 text-indigo-700',
  published: 'bg-green-50 text-green-700',
  in_progress: 'bg-blue-50 text-blue-700',
  pending: 'bg-amber-50 text-amber-700',
  completed: 'bg-green-50 text-green-700',
}

function Badge({ status }: { status: string }) {
  const colors = statusBadge[status] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">{children}</div>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-ink-6 p-5 ${className}`}>{children}</div>
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-ink-6 rounded ${className}`} />
}

function LoadingCard() {
  return (
    <Card>
      <Skeleton className="h-5 w-40 mb-4" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </Card>
  )
}

function formatDate(d: string | null | undefined) {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return '--'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Data state
  const [business, setBusiness] = useState<Business | null>(null)
  const [notes, setNotes] = useState<ClientNote[]>([])
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [invoices, setInvoices] = useState<EnhancedInvoice[]>([])
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [activity, setActivity] = useState<ClientActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch core data
  useEffect(() => {
    const supabase = createClient()

    async function load() {
      setLoading(true)
      const [biz, notesRes, delRes, agrRes, subRes, invRes, thrRes, actRes] = await Promise.all([
        supabase.from('businesses').select('*').eq('id', id).single(),
        supabase.from('client_notes').select('*').eq('business_id', id).order('created_at', { ascending: false }),
        supabase.from('deliverables').select('*').eq('business_id', id).order('created_at', { ascending: false }),
        supabase.from('agreements').select('*').eq('business_id', id).order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*').eq('business_id', id).order('started_at', { ascending: false }),
        supabase.from('invoices').select('*').eq('business_id', id).order('created_at', { ascending: false }),
        supabase.from('message_threads').select('*').eq('business_id', id).order('last_message_at', { ascending: false }),
        supabase.from('client_activity_log').select('*').eq('business_id', id).order('created_at', { ascending: false }),
      ])

      if (biz.data) setBusiness(biz.data as Business)
      if (notesRes.data) setNotes(notesRes.data as ClientNote[])
      if (delRes.data) setDeliverables(delRes.data as Deliverable[])
      if (agrRes.data) setAgreements(agrRes.data as Agreement[])
      if (subRes.data) setSubscriptions(subRes.data as Subscription[])
      if (invRes.data) setInvoices(invRes.data as EnhancedInvoice[])
      if (thrRes.data) setThreads(thrRes.data as MessageThread[])
      if (actRes.data) setActivity(actRes.data as ClientActivityEntry[])
      setLoading(false)
    }

    load()
  }, [id])

  // ---------- Loading skeleton ----------
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <LoadingCard />
            <LoadingCard />
          </div>
          <LoadingCard />
        </div>
      </div>
    )
  }

  if (!business) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink mb-2">Client not found</h2>
        <p className="text-ink-3 text-sm mb-4">This business ID does not exist.</p>
        <Link href="/admin/clients" className="text-brand text-sm font-medium hover:underline">Back to clients</Link>
      </div>
    )
  }

  const initials = business.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const mrr = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + (s.plan_price || 0), 0)

  const latestAgreement = agreements[0]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-start gap-4">
        <Link href="/admin/clients" className="text-ink-4 hover:text-ink transition-colors mt-1.5">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-brand-tint flex items-center justify-center">
              <span className="text-brand-dark text-base font-bold">{initials}</span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">{business.name}</h1>
                {business.client_status && <Badge status={business.client_status} />}
              </div>
              <p className="text-ink-3 text-sm">{business.industry || 'No industry set'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Tabs ---------- */}
      <div className="flex gap-1 border-b border-ink-6 px-5 -mx-5 overflow-x-auto">
        {tabItems.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === tab.value
                ? 'border-brand text-ink font-medium'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ---------- Tab content ---------- */}

      {activeTab === 'overview' && (
        <OverviewTab
          business={business}
          notes={notes}
          setNotes={setNotes}
          mrr={mrr}
          latestAgreement={latestAgreement}
          activity={activity}
          id={id}
        />
      )}

      {activeTab === 'deliverables' && (
        <DeliverablesTab deliverables={deliverables} />
      )}

      {activeTab === 'agreements' && (
        <AgreementsTab agreements={agreements} businessId={id} />
      )}

      {activeTab === 'billing' && (
        <BillingTab subscriptions={subscriptions} invoices={invoices} businessId={id} setInvoices={setInvoices} />
      )}

      {activeTab === 'messages' && (
        <MessagesTab threads={threads} businessId={id} />
      )}

      {activeTab === 'activity' && (
        <ActivityTab activity={activity} />
      )}

      {activeTab === 'profile' && (
        <ProfileTab business={business} />
      )}
    </div>
  )
}

// ===========================================================================
// OVERVIEW TAB
// ===========================================================================

function OverviewTab({
  business,
  notes,
  setNotes,
  mrr,
  latestAgreement,
  activity,
  id,
}: {
  business: Business
  notes: ClientNote[]
  setNotes: React.Dispatch<React.SetStateAction<ClientNote[]>>
  mrr: number
  latestAgreement: Agreement | undefined
  activity: ClientActivityEntry[]
  id: string
}) {
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  async function handleAddNote() {
    if (!noteText.trim()) return
    setAddingNote(true)
    const result = await addClientNote(id, noteText.trim())
    if (result.success) {
      // Refetch notes
      const supabase = createClient()
      const { data } = await supabase
        .from('client_notes')
        .select('*')
        .eq('business_id', id)
        .order('created_at', { ascending: false })
      if (data) setNotes(data as ClientNote[])
      setNoteText('')
    }
    setAddingNote(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Client Snapshot */}
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Client Snapshot</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <Label>Business Name</Label>
              <div className="text-ink font-medium">{business.name}</div>
            </div>
            <div>
              <Label>Industry</Label>
              <div className="text-ink">{business.industry || '--'}</div>
            </div>
            <div>
              <Label>Client Status</Label>
              <div>{business.client_status ? <Badge status={business.client_status} /> : '--'}</div>
            </div>
            <div>
              <Label>MRR</Label>
              <div className="text-ink font-medium">{formatCurrency(mrr)}</div>
            </div>
            <div>
              <Label>Agreement</Label>
              <div>{latestAgreement ? <Badge status={latestAgreement.status} /> : '--'}</div>
            </div>
            <div>
              <Label>Last Activity</Label>
              <div className="text-ink text-xs">{activity.length > 0 ? formatDateTime(activity[0].created_at) : '--'}</div>
            </div>
          </div>
        </Card>

        {/* Internal Notes */}
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Internal Notes</h2>

          {/* Add note form */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              placeholder="Add a note..."
              className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
            <button
              onClick={handleAddNote}
              disabled={addingNote || !noteText.trim()}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 flex items-center gap-1.5"
            >
              {addingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>

          {notes.length === 0 ? (
            <p className="text-ink-4 text-sm">No notes yet.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {notes.map((note) => (
                <div key={note.id} className="bg-bg-2 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink">{note.author_name}</span>
                    <span className="text-[10px] text-ink-4">{formatDateTime(note.created_at)}</span>
                  </div>
                  <p className="text-sm text-ink-2">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Quick Actions */}
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link
              href={`/admin/messages?client=${id}`}
              className="flex items-center gap-2 w-full text-left bg-bg-2 hover:bg-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-ink-4" />
              Send Message
            </Link>
            <Link
              href={`/admin/agreements/send?client=${id}`}
              className="flex items-center gap-2 w-full text-left bg-bg-2 hover:bg-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink transition-colors"
            >
              <FileText className="w-4 h-4 text-ink-4" />
              Send Agreement
            </Link>
            <Link
              href={`/admin/invoices/new?client=${id}`}
              className="flex items-center gap-2 w-full text-left bg-bg-2 hover:bg-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink transition-colors"
            >
              <Receipt className="w-4 h-4 text-ink-4" />
              Create Invoice
            </Link>
          </div>
        </Card>

        {/* Quick Info */}
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Quick Info</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-4">Primary Contact</span>
              <span className="font-medium text-ink">{business.primary_contact_name || '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-4">Email</span>
              <span className="font-medium text-ink text-xs">{business.primary_contact_email || '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-4">Phone</span>
              <span className="font-medium text-ink">{business.primary_contact_phone || business.phone || '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-4">Website</span>
              <span className="font-medium text-ink text-xs">{business.website_url || '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-4">Member Since</span>
              <span className="font-medium text-ink">{formatDate(business.created_at)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ===========================================================================
// DELIVERABLES TAB
// ===========================================================================

function DeliverablesTab({ deliverables }: { deliverables: Deliverable[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const statuses = ['all', ...new Set(deliverables.map((d) => d.status))]
  const filtered = statusFilter === 'all' ? deliverables : deliverables.filter((d) => d.status === statusFilter)

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-ink-4" />
        <div className="flex gap-1 flex-wrap">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                statusFilter === s
                  ? 'bg-brand text-white'
                  : 'bg-bg-2 text-ink-3 hover:text-ink'
              }`}
            >
              {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-ink-4 text-sm">No deliverables found.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <Card key={d.id} className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-ink truncate">{d.title}</span>
                  <Badge status={d.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-4">
                  <span className="capitalize">{d.type.replace(/_/g, ' ')}</span>
                  <span>Created {formatDate(d.created_at)}</span>
                  {d.updated_at !== d.created_at && <span>Updated {formatDate(d.updated_at)}</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// AGREEMENTS TAB
// ===========================================================================

function AgreementsTab({ agreements, businessId }: { agreements: Agreement[]; businessId: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Agreements</h2>
        <Link
          href={`/admin/agreements/send?client=${businessId}`}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-1.5"
        >
          <Send className="w-4 h-4" /> Send Agreement
        </Link>
      </div>

      {agreements.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-ink-4 text-sm">No agreements yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {agreements.map((a) => (
            <Card key={a.id} className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-ink capitalize">{a.agreement_type.replace(/_/g, ' ')}</span>
                  <Badge status={a.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-4">
                  {a.sent_at && <span>Sent {formatDate(a.sent_at)}</span>}
                  {a.signed_at && <span>Signed {formatDate(a.signed_at)}</span>}
                  {!a.sent_at && !a.signed_at && <span>Created {formatDate(a.created_at)}</span>}
                </div>
              </div>
              <Link
                href={`/admin/agreements/${a.id}`}
                className="text-ink-4 hover:text-ink transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// BILLING TAB
// ===========================================================================

function BillingTab({
  subscriptions,
  invoices,
  businessId,
  setInvoices,
}: {
  subscriptions: Subscription[]
  invoices: EnhancedInvoice[]
  businessId: string
  setInvoices: React.Dispatch<React.SetStateAction<EnhancedInvoice[]>>
}) {
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceDesc, setInvoiceDesc] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceDue, setInvoiceDue] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreateInvoice() {
    if (!invoiceDesc.trim() || !invoiceAmount || !invoiceDue) return
    setCreating(true)

    const amount = parseFloat(invoiceAmount)
    const result = await adminCreateManualInvoice(
      businessId,
      [{ description: invoiceDesc, quantity: 1, unit_price: amount }],
      invoiceDue,
      invoiceNotes || undefined
    )

    if (result.success) {
      // Refetch invoices
      const supabase = createClient()
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
      if (data) setInvoices(data as EnhancedInvoice[])
      setShowInvoiceForm(false)
      setInvoiceDesc('')
      setInvoiceAmount('')
      setInvoiceDue('')
      setInvoiceNotes('')
    }

    setCreating(false)
  }

  return (
    <div className="space-y-6">
      {/* Active Subscriptions */}
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Active Subscriptions</h2>
        {subscriptions.length === 0 ? (
          <p className="text-ink-4 text-sm">No subscriptions.</p>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-bg-2 rounded-lg p-3">
                <div>
                  <div className="text-sm font-medium text-ink">{s.plan_name}</div>
                  <div className="text-xs text-ink-4">{s.billing_interval} &middot; {formatCurrency(s.plan_price)}/mo</div>
                </div>
                <Badge status={s.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Invoice History */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Invoices</h2>
          <button
            onClick={() => setShowInvoiceForm(!showInvoiceForm)}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Create Invoice
          </button>
        </div>

        {/* Inline create invoice form */}
        {showInvoiceForm && (
          <div className="bg-bg-2 rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Description</Label>
                <input
                  type="text"
                  value={invoiceDesc}
                  onChange={(e) => setInvoiceDesc(e.target.value)}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  placeholder="Service description"
                />
              </div>
              <div>
                <Label>Amount ($)</Label>
                <input
                  type="number"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <Label>Due Date</Label>
                <input
                  type="date"
                  value={invoiceDue}
                  onChange={(e) => setInvoiceDue(e.target.value)}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <input
                  type="text"
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  placeholder="Optional notes"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowInvoiceForm(false)} className="text-sm text-ink-3 hover:text-ink px-3 py-2">
                Cancel
              </button>
              <button
                onClick={handleCreateInvoice}
                disabled={creating || !invoiceDesc || !invoiceAmount || !invoiceDue}
                className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 flex items-center gap-1.5"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        )}

        {invoices.length === 0 ? (
          <p className="text-ink-4 text-sm">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-6">
                  <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Invoice #</th>
                  <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Description</th>
                  <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Status</th>
                  <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Amount</th>
                  <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Due</th>
                  <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Paid</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-ink-3">{inv.invoice_number || inv.id.slice(0, 8)}</td>
                    <td className="px-5 py-3 text-ink">{inv.description || '--'}</td>
                    <td className="px-5 py-3"><Badge status={inv.status} /></td>
                    <td className="px-5 py-3 text-right font-medium text-ink">{formatCurrency(inv.amount)}</td>
                    <td className="px-5 py-3 text-right text-ink-4 text-xs">{formatDate(inv.due_date)}</td>
                    <td className="px-5 py-3 text-right text-ink-4 text-xs">{formatDate(inv.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ===========================================================================
// MESSAGES TAB
// ===========================================================================

function MessagesTab({ threads, businessId }: { threads: MessageThread[]; businessId: string }) {
  const [selectedThread, setSelectedThread] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)

  async function loadMessages(threadId: string) {
    setSelectedThread(threadId)
    setLoadingMessages(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as Message[])
    setLoadingMessages(false)
  }

  async function handleSend() {
    if (!selectedThread || !messageText.trim()) return
    setSending(true)
    const result = await sendMessage(selectedThread, messageText.trim())
    if (result.success) {
      await loadMessages(selectedThread)
      setMessageText('')
    }
    setSending(false)
  }

  if (selectedThread) {
    const thread = threads.find((t) => t.id === selectedThread)
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setSelectedThread(null); setMessages([]) }}
          className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to threads
        </button>

        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-1">{thread?.subject || 'Thread'}</h2>
          <p className="text-xs text-ink-4 mb-4">Last message {formatDateTime(thread?.last_message_at)}</p>

          {loadingMessages ? (
            <div className="py-8 text-center text-ink-4 text-sm">Loading messages...</div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto mb-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 ${
                    m.sender_role === 'admin' ? 'bg-brand-tint ml-8' : 'bg-bg-2 mr-8'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink">{m.sender_name}</span>
                    <span className="text-[10px] text-ink-4">{formatDateTime(m.created_at)}</span>
                  </div>
                  <p className="text-sm text-ink-2 whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Reply input */}
          <div className="flex gap-2 pt-3 border-t border-ink-6">
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
              className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
            <button
              onClick={handleSend}
              disabled={sending || !messageText.trim()}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 flex items-center gap-1.5"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Message Threads</h2>
      </div>

      {threads.length === 0 ? (
        <Card className="text-center py-12">
          <MessageSquare className="w-8 h-8 text-ink-4 mx-auto mb-2" />
          <p className="text-ink-4 text-sm">No message threads yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => loadMessages(t.id)}
              className="w-full text-left"
            >
              <Card className="hover:border-brand/30 transition-colors flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-ink">{t.subject}</div>
                  <div className="text-xs text-ink-4">Last message {formatDateTime(t.last_message_at)}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-4" />
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// ACTIVITY LOG TAB
// ===========================================================================

function ActivityTab({ activity }: { activity: ClientActivityEntry[] }) {
  return (
    <div className="space-y-4">
      <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Activity Log</h2>

      {activity.length === 0 ? (
        <Card className="text-center py-12">
          <Clock className="w-8 h-8 text-ink-4 mx-auto mb-2" />
          <p className="text-ink-4 text-sm">No activity recorded yet.</p>
        </Card>
      ) : (
        <Card className="!p-0">
          <div className="divide-y divide-ink-6">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-bg-2 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Clock className="w-4 h-4 text-ink-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge status={a.action_type} />
                    <span className="text-[10px] text-ink-4">{formatDateTime(a.created_at)}</span>
                  </div>
                  <p className="text-sm text-ink-2">{a.description}</p>
                  {a.performed_by && (
                    <p className="text-[10px] text-ink-4 mt-0.5">by {a.performed_by}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ===========================================================================
// BUSINESS PROFILE TAB
// ===========================================================================

function ProfileTab({ business }: { business: Business }) {
  const b = business

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-ink-4" /> Business Information
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div><Label>Legal Business Name</Label><div className="text-ink">{b.legal_business_name || '--'}</div></div>
          <div><Label>DBA Name</Label><div className="text-ink">{b.dba_name || '--'}</div></div>
          <div><Label>Entity Type</Label><div className="text-ink capitalize">{b.entity_type?.replace(/_/g, ' ') || '--'}</div></div>
          <div><Label>Industry</Label><div className="text-ink">{b.industry || '--'}</div></div>
          <div><Label>Website</Label><div className="text-ink text-xs break-all">{b.website_url || '--'}</div></div>
          <div><Label>Phone</Label><div className="text-ink">{b.phone || '--'}</div></div>
        </div>
      </Card>

      {/* Contact */}
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Primary Contact</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div><Label>Name</Label><div className="text-ink">{b.primary_contact_name || '--'}</div></div>
          <div><Label>Email</Label><div className="text-ink text-xs break-all">{b.primary_contact_email || '--'}</div></div>
          <div><Label>Phone</Label><div className="text-ink">{b.primary_contact_phone || '--'}</div></div>
        </div>
      </Card>

      {/* Address */}
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Address</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="col-span-2"><Label>Street</Label><div className="text-ink">{b.address || '--'}</div></div>
          <div><Label>City</Label><div className="text-ink">{b.city || '--'}</div></div>
          <div><Label>State</Label><div className="text-ink">{b.state || '--'}</div></div>
          <div><Label>ZIP</Label><div className="text-ink">{b.zip || '--'}</div></div>
        </div>
      </Card>

      {/* Brand Identity */}
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Brand Identity</h2>
        <div className="space-y-4 text-sm">
          <div>
            <Label>Brand Voice Words</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(b.brand_voice_words || []).length > 0
                ? b.brand_voice_words.map((w) => (
                    <span key={w} className="bg-brand-tint text-brand-dark text-xs font-medium px-3 py-1 rounded-full">{w}</span>
                  ))
                : <span className="text-ink-4">--</span>
              }
            </div>
          </div>
          <div><Label>Brand Tone</Label><div className="text-ink">{b.brand_tone || '--'}</div></div>
          <div><Label>Brand Do-Nots</Label><div className="text-ink">{b.brand_do_nots || '--'}</div></div>
          <div>
            <Label>Brand Colors</Label>
            {b.brand_colors && Object.keys(b.brand_colors).length > 0 ? (
              <div className="flex gap-3 mt-1">
                {Object.entries(b.brand_colors).map(([key, val]) =>
                  val ? (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded border border-ink-6" style={{ backgroundColor: val }} />
                      <span className="text-xs text-ink-3 capitalize">{key}: {val}</span>
                    </div>
                  ) : null
                )}
              </div>
            ) : (
              <div className="text-ink-4">--</div>
            )}
          </div>
          <div><Label>Fonts</Label><div className="text-ink">{b.fonts || '--'}</div></div>
          <div><Label>Style Notes</Label><div className="text-ink">{b.style_notes || '--'}</div></div>
        </div>
      </Card>

      {/* Target Audience */}
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Target Audience</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="col-span-2"><Label>Description</Label><div className="text-ink">{b.target_audience || '--'}</div></div>
          <div><Label>Age Range</Label><div className="text-ink">{b.target_age_range || '--'}</div></div>
          <div><Label>Location</Label><div className="text-ink">{b.target_location || '--'}</div></div>
          <div className="col-span-2"><Label>Problem They Solve</Label><div className="text-ink">{b.target_problem || '--'}</div></div>
        </div>
      </Card>

      {/* Marketing Context */}
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Marketing Context</h2>
        <div className="space-y-4 text-sm">
          <div>
            <Label>Current Platforms</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(b.current_platforms || []).length > 0
                ? b.current_platforms.map((p) => (
                    <span key={p} className="bg-bg-2 text-ink-2 text-xs font-medium px-3 py-1 rounded-full border border-ink-6">{p}</span>
                  ))
                : <span className="text-ink-4">--</span>
              }
            </div>
          </div>
          <div><Label>Posting Frequency</Label><div className="text-ink">{b.posting_frequency || '--'}</div></div>
          <div><Label>Monthly Budget</Label><div className="text-ink">{b.monthly_budget ? formatCurrency(b.monthly_budget) : '--'}</div></div>
          <div>
            <Label>Marketing Goals</Label>
            {(b.marketing_goals || []).length > 0 ? (
              <ul className="list-disc ml-4 text-ink space-y-0.5 mt-1">
                {b.marketing_goals.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            ) : (
              <div className="text-ink-4">--</div>
            )}
          </div>
          <div><Label>Content Topics</Label><div className="text-ink">{b.content_topics || '--'}</div></div>
          <div><Label>Topics to Avoid</Label><div className="text-ink">{b.content_avoid_topics || '--'}</div></div>
          <div><Label>Google Business Profile</Label><div className="text-ink">{b.has_google_business ? 'Yes' : b.has_google_business === false ? 'No' : '--'}</div></div>
          <div><Label>Past Wins</Label><div className="text-ink">{b.past_marketing_wins || '--'}</div></div>
          <div><Label>Past Fails</Label><div className="text-ink">{b.past_marketing_fails || '--'}</div></div>
          <div><Label>Differentiator</Label><div className="text-ink">{b.differentiator || '--'}</div></div>
          <div><Label>Additional Notes</Label><div className="text-ink">{b.additional_notes || '--'}</div></div>
        </div>
      </Card>

      {/* Competitors */}
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Competitors</h2>
        {(b.competitors || []).length > 0 ? (
          <div className="space-y-2">
            {b.competitors.map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-bg-2 rounded-lg px-4 py-3">
                <span className="text-sm font-medium text-ink">{c.name}</span>
                {c.website_url && <span className="text-xs text-ink-3 break-all">{c.website_url}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ink-4 text-sm">No competitors listed.</p>
        )}
        {b.competitor_strengths && (
          <div className="mt-3 text-sm">
            <Label>Competitor Strengths</Label>
            <div className="text-ink">{b.competitor_strengths}</div>
          </div>
        )}
      </Card>
    </div>
  )
}
