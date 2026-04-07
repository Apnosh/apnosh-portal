'use client'

import { useState, useEffect } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Calendar, DollarSign, Building2,
  FileText, Clock, ChevronDown, Package, CheckCircle2,
  AlertCircle, Loader2, Mail, User
} from 'lucide-react'

type DBStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
type OrderType = 'subscription' | 'one_time' | 'a_la_carte'

interface Business {
  id: string
  name: string
  industry: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
}

interface Order {
  id: string
  business_id: string
  type: OrderType
  service_name: string
  quantity: number
  unit_price: number
  total_price: number
  status: DBStatus
  special_instructions: string | null
  deadline: string | null
  created_at: string
  updated_at: string
  businesses: Business | null
}

interface WorkBrief {
  id: string
  order_id: string
  brief_content: Record<string, unknown> | null
  created_at: string
}

interface Deliverable {
  id: string
  work_brief_id: string
  title: string | null
  description: string | null
  status: string
  file_url: string | null
  created_at: string
}

const STATUS_OPTIONS: DBStatus[] = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']

const STATUS_LABEL: Record<DBStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_BADGE: Record<DBStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-indigo-50 text-indigo-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
}

const TYPE_LABEL: Record<OrderType, string> = {
  subscription: 'Subscription',
  one_time: 'One-Time',
  a_la_carte: 'A La Carte',
}

const TYPE_BADGE: Record<OrderType, string> = {
  subscription: 'bg-brand-tint text-brand-dark',
  one_time: 'bg-gray-100 text-ink-3',
  a_la_carte: 'bg-violet-50 text-violet-700',
}

const DELIVERABLE_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`bg-bg-2 rounded animate-pulse ${className ?? 'h-4 w-32'}`} />
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-4">
      <SkeletonBlock className="h-5 w-40" />
      <div className="space-y-3">
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
    </div>
  )
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = use(params)

  const [order, setOrder] = useState<Order | null>(null)
  const [workBrief, setWorkBrief] = useState<WorkBrief | null>(null)
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newStatus, setNewStatus] = useState<DBStatus>('pending')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    async function fetchOrder() {
      setLoading(true)
      setError(null)

      const supabase = createClient()

      // Fetch order with business join
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, business_id, type, service_name, quantity, unit_price, total_price, status, special_instructions, deadline, created_at, updated_at, businesses(id, name, industry, primary_contact_name, primary_contact_email)')
        .eq('id', orderId)
        .single()

      if (orderError) {
        setError(orderError.message)
        setLoading(false)
        return
      }

      const typedOrder = orderData as unknown as Order
      setOrder(typedOrder)
      setNewStatus(typedOrder.status)

      // Fetch work brief
      const { data: briefData } = await supabase
        .from('work_briefs')
        .select('id, order_id, brief_content, created_at')
        .eq('order_id', orderId)
        .maybeSingle()

      if (briefData) {
        const typedBrief = briefData as unknown as WorkBrief
        setWorkBrief(typedBrief)

        // Fetch deliverables for this work brief
        const { data: delData } = await supabase
          .from('deliverables')
          .select('id, work_brief_id, title, description, status, file_url, created_at')
          .eq('work_brief_id', typedBrief.id)
          .order('created_at', { ascending: true })

        if (delData) {
          setDeliverables(delData as unknown as Deliverable[])
        }
      }

      setLoading(false)
    }

    fetchOrder()
  }, [orderId])

  async function handleStatusUpdate() {
    if (!order) return
    setSaving(true)
    setSaveMsg(null)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', order.id)

    if (updateError) {
      setSaveMsg(`Error: ${updateError.message}`)
    } else {
      setOrder({ ...order, status: newStatus })
      setSaveMsg('Status updated.')
      setTimeout(() => setSaveMsg(null), 3000)
    }

    setSaving(false)
  }

  // Render brief_content as key/value pairs
  function renderBriefContent(content: Record<string, unknown>) {
    return Object.entries(content).map(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      const display = typeof value === 'string' ? value
        : Array.isArray(value) ? value.join(', ')
        : JSON.stringify(value, null, 2)

      return (
        <div key={key}>
          <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">{label}</div>
          <div className="text-sm text-ink whitespace-pre-wrap">{display}</div>
        </div>
      )
    })
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-5 w-5 rounded" />
          <SkeletonBlock className="h-7 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="space-y-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Back to Orders
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error ?? 'Order not found.'}
        </div>
      </div>
    )
  }

  const biz = order.businesses

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="w-4 h-4" /> Back to Orders
      </Link>

      {/* Order header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">{order.service_name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[order.type] ?? 'bg-gray-100 text-ink-3'}`}>
              {TYPE_LABEL[order.type] ?? order.type}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-ink-3">
            <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />{formatCurrency(order.total_price)}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(order.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Client info card */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-ink-4" /> Client
            </h2>
            {biz ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Business</div>
                  <Link href={`/admin/clients/${biz.id}`} className="text-sm font-medium text-brand-dark hover:underline">
                    {biz.name}
                  </Link>
                </div>
                <div>
                  <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Industry</div>
                  <div className="text-sm text-ink">{biz.industry ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Contact</div>
                  <div className="text-sm text-ink flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-ink-4" />
                    {biz.primary_contact_name ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Email</div>
                  <div className="text-sm text-ink flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-ink-4" />
                    {biz.primary_contact_email ?? '-'}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-4">No client data found.</p>
            )}
          </div>

          {/* Order details card */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-ink-4" /> Order Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Service</div>
                <div className="text-sm text-ink">{order.service_name}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Quantity</div>
                <div className="text-sm text-ink">{order.quantity}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Unit Price</div>
                <div className="text-sm text-ink">{formatCurrency(order.unit_price)}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Total Price</div>
                <div className="text-sm text-ink font-medium">{formatCurrency(order.total_price)}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Deadline</div>
                <div className="text-sm text-ink flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-ink-4" />
                  {order.deadline ? formatDate(order.deadline) : '-'}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Special Instructions</div>
                <div className="text-sm text-ink whitespace-pre-wrap">{order.special_instructions || '-'}</div>
              </div>
            </div>
          </div>

          {/* Work Brief */}
          {workBrief && workBrief.brief_content && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-ink-4" /> Work Brief
              </h2>
              <div className="bg-bg-2 rounded-lg p-4 space-y-4">
                {renderBriefContent(workBrief.brief_content as Record<string, unknown>)}
              </div>
              <div className="text-[11px] text-ink-4 mt-3">
                Created {formatDateTime(workBrief.created_at)}
              </div>
            </div>
          )}

          {/* Deliverables */}
          {deliverables.length > 0 && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-ink-4" /> Deliverables
              </h2>
              <div className="space-y-3">
                {deliverables.map((d) => (
                  <div key={d.id} className="bg-bg-2 rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink">{d.title || 'Untitled'}</div>
                      {d.description && (
                        <div className="text-xs text-ink-3 mt-0.5">{d.description}</div>
                      )}
                      <div className="text-[11px] text-ink-4 mt-1">{formatDate(d.created_at)}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0 ${DELIVERABLE_STATUS_BADGE[d.status] ?? 'bg-gray-100 text-ink-3'}`}>
                      {d.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-ink-4" /> Timeline
            </h2>
            <div className="space-y-0">
              <div className="flex items-start gap-3 relative">
                {order.updated_at !== order.created_at && (
                  <div className="absolute left-[11px] top-7 bottom-0 w-px bg-ink-6" />
                )}
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-bg-2">
                  <FileText className="w-3 h-3 text-ink-3" />
                </div>
                <div className="flex-1 pb-5">
                  <div className="text-sm text-ink">Order created</div>
                  <div className="text-[11px] text-ink-4 mt-0.5">{formatDateTime(order.created_at)}</div>
                </div>
              </div>
              {order.updated_at !== order.created_at && (
                <div className="flex items-start gap-3 relative">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-bg-2">
                    <Clock className="w-3 h-3 text-blue-600" />
                  </div>
                  <div className="flex-1 pb-5">
                    <div className="text-sm text-ink">Last updated</div>
                    <div className="text-[11px] text-ink-4 mt-0.5">{formatDateTime(order.updated_at)}</div>
                  </div>
                </div>
              )}
              {workBrief && (
                <div className="flex items-start gap-3 relative">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-brand-tint">
                    <FileText className="w-3 h-3 text-brand-dark" />
                  </div>
                  <div className="flex-1 pb-5">
                    <div className="text-sm text-ink">Work brief created</div>
                    <div className="text-[11px] text-ink-4 mt-0.5">{formatDateTime(workBrief.created_at)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">

          {/* Status management */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Update Status</h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide block mb-1.5">Status</label>
                <div className="relative">
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as DBStatus)}
                    className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 pr-8 appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4 pointer-events-none" />
                </div>
              </div>
              <button
                onClick={handleStatusUpdate}
                disabled={saving || newStatus === order.status}
                className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Saving...' : 'Save Status'}
              </button>
              {saveMsg && (
                <div className={`text-xs text-center ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
                  {saveMsg}
                </div>
              )}
            </div>
          </div>

          {/* Order meta */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Info</h2>
            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Order ID</div>
                <div className="text-sm text-ink font-mono">{order.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Type</div>
                <div className="text-sm text-ink">{TYPE_LABEL[order.type] ?? order.type}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Created</div>
                <div className="text-sm text-ink">{formatDateTime(order.created_at)}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Last Updated</div>
                <div className="text-sm text-ink">{formatDateTime(order.updated_at)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
