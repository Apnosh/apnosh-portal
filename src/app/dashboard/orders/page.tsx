'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShoppingCart, Search, Package, Clock, CheckCircle2,
  X, ChevronRight, ChevronDown, Zap, Plus, Minus,
  RotateCcw, Loader2, Trash2,
} from 'lucide-react'
import { categories, type ServiceCategory } from '@/lib/services-data'
import websiteData from '@/data/services-data.json'
import { useCart } from '@/lib/cart-context'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import CartSidebar from './cart'

// ── Types ────────────────────────────────────────────────────────────

interface Subscription { id: string; plan_name: string; plan_price: number; started_at: string }
interface DbOrder { id: string; type: string; service_id: string | null; service_name: string; quantity: number; unit_price: number; total_price: number; status: string; created_at: string }
type OrderStatus = 'active' | 'completed' | 'pending'
interface Order { id: string; date: string; serviceName: string; serviceId: string; status: OrderStatus; amount: string }

// Selected item in the plan builder
interface SelectedItem {
  name: string
  monthly: number
  setup: number
  qty: number
  billing?: 'monthly' | 'onetime'
  moPr?: number
  otPr?: number
}

// Tab definition matching the website
interface TabSection {
  label: string
  note?: string
  mode: 'radio' | 'qty' | 'toggle'
  svcId: string
  show: 'tiers' | 'items' | 'addons'
  filter?: string[]
  oneTimeOnly?: boolean
}
interface TabDef { name: string; icon: string; sections: TabSection[] }

// ── Helpers ──────────────────────────────────────────────────────────

function fmt(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) }
function mapOrderStatus(s: string): OrderStatus { if (s === 'active' || s === 'in_progress') return 'active'; if (s === 'completed' || s === 'delivered') return 'completed'; return 'pending' }

const statusStyles: Record<OrderStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  completed: { label: 'Completed', cls: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Package },
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
}

// ── Tab definitions (matching website's build.html exactly) ─────────

const TABS: TabDef[] = [
  { name: 'Social Media', icon: '📱', sections: [
    { label: 'Management plans', note: 'pick one', mode: 'radio', svcId: 'social-media', show: 'tiers' },
    { label: 'Static posts', note: 'add individually', mode: 'qty', svcId: 'social-media', show: 'items', filter: ['single-feed-post', 'story-graphic', 'carousel-post', 'infographic-post'] },
    { label: 'Short-form video', note: 'add individually', mode: 'qty', svcId: 'social-media', show: 'items', filter: ['basic-product-video', 'trend-video-no-people', 'trend-video-with-people', 'ad-creative-video', 'polished-reel', 'cinematic-reel'] },
  ]},
  { name: 'Websites', icon: '🌐', sections: [
    { label: 'Website design', note: 'pick one', mode: 'radio', svcId: 'websites', show: 'tiers' },
    { label: 'Hosting & care', note: 'keeps it running', mode: 'radio', svcId: 'hosting-care', show: 'tiers' },
    { label: 'Website extras', mode: 'toggle', svcId: 'websites', show: 'addons' },
  ]},
  { name: 'Local SEO', icon: '📍', sections: [
    { label: 'SEO plans', note: 'pick one', mode: 'radio', svcId: 'local-seo', show: 'tiers' },
    { label: 'SEO extras', mode: 'toggle', svcId: 'local-seo', show: 'addons' },
  ]},
  { name: 'Email & SMS', icon: '✉️', sections: [
    { label: 'Email plans', note: 'pick one', mode: 'radio', svcId: 'email-sms', show: 'tiers' },
    { label: 'Email extras', mode: 'toggle', svcId: 'email-sms', show: 'addons' },
  ]},
  { name: 'Automations', icon: '🤖', sections: [
    { label: 'Automation plans', note: 'pick one', mode: 'radio', svcId: 'ai-automations', show: 'tiers' },
  ]},
  { name: 'Branding', icon: '🎨', sections: [
    { label: 'Brand packages', note: 'pick one', mode: 'radio', svcId: 'branding', show: 'tiers' },
    { label: 'Brand items', note: 'add as needed', mode: 'qty', svcId: 'branding', show: 'items', oneTimeOnly: true },
  ]},
  { name: 'Photo & Video', icon: '📸', sections: [
    { label: 'Photography', note: 'add shoots', mode: 'qty', svcId: 'photography', show: 'items', oneTimeOnly: true },
    { label: 'Video production', note: 'add videos', mode: 'qty', svcId: 'video-production', show: 'items', oneTimeOnly: true },
  ]},
  { name: 'Design & Copy', icon: '✏️', sections: [
    { label: 'Graphic design', note: 'add as needed', mode: 'qty', svcId: 'graphic-design', show: 'items', oneTimeOnly: true },
    { label: 'Copywriting', note: 'add as needed', mode: 'qty', svcId: 'copywriting', show: 'items', oneTimeOnly: true },
  ]},
  { name: 'Strategy', icon: '💡', sections: [
    { label: 'Consulting', note: 'add sessions', mode: 'qty', svcId: 'consulting', show: 'items', oneTimeOnly: true },
  ]},
]

// ── Component ────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [view, setView] = useState<'build' | 'orders'>('build')
  const [activeTab, setActiveTab] = useState(0)
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({})
  const [expandedInc, setExpandedInc] = useState<Set<string>>(new Set())
  const [showMobileCalc, setShowMobileCalc] = useState(false)

  // Orders data
  const [activeSubscriptions, setActiveSubscriptions] = useState<{ id: string; name: string; price: number; since: string }[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingSubs, setLoadingSubs] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [orderFilter, setOrderFilter] = useState<OrderStatus | 'all'>('all')

  const { addItem, cartCount, setIsCartOpen } = useCart()

  // Fetch real data
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) { setLoadingSubs(false); setLoadingOrders(false); return }
      const { data: business } = await supabase.from('businesses').select('id').eq('owner_id', user.id).single()
      if (!business || cancelled) { setLoadingSubs(false); setLoadingOrders(false); return }

      const { data: subs } = await supabase.from('subscriptions').select('*').eq('business_id', business.id).eq('status', 'active').order('started_at', { ascending: false })
      if (!cancelled) {
        setActiveSubscriptions((subs as Subscription[] || []).map(s => ({
          id: s.id, name: s.plan_name, price: s.plan_price,
          since: new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        })))
        setLoadingSubs(false)
      }

      const { data: dbOrders } = await supabase.from('orders').select('*').eq('business_id', business.id).order('created_at', { ascending: false })
      if (!cancelled) {
        setOrders((dbOrders as DbOrder[] || []).map(o => ({
          id: o.id, date: o.created_at, serviceName: o.service_name, serviceId: o.service_id || '',
          status: mapOrderStatus(o.status),
          amount: (o.type === 'subscription' || o.type === 'recurring') ? `${fmt(o.total_price)}/mo` : fmt(o.total_price),
        })))
        setLoadingOrders(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [])

  // ── Builder state actions ──────────────────────────────────────────

  const pickTier = useCallback((key: string, name: string, monthly: number, setup: number, radioGroup: string) => {
    setSelected(prev => {
      const next = { ...prev }
      // Deselect others in same radio group
      Object.keys(next).forEach(k => { if (k.startsWith(radioGroup + '_t')) delete next[k] })
      // Toggle this one
      if (prev[key]) { delete next[key] } else { next[key] = { name, monthly, setup, qty: 1 } }
      return next
    })
  }, [])

  const changeQty = useCallback((key: string, name: string, moPr: number, otPr: number, delta: number) => {
    setSelected(prev => {
      const next = { ...prev }
      const existing = next[key]
      const currentQty = existing?.qty || 0
      const newQty = Math.max(0, currentQty + delta)
      if (newQty === 0) { delete next[key]; return next }
      const billing = existing?.billing || 'monthly'
      next[key] = {
        name, qty: newQty, moPr, otPr,
        billing,
        monthly: billing === 'monthly' ? moPr : 0,
        setup: billing === 'onetime' ? otPr * newQty : 0,
      }
      return next
    })
  }, [])

  const setBilling = useCallback((key: string, billing: 'monthly' | 'onetime') => {
    setSelected(prev => {
      const next = { ...prev }
      const item = next[key]
      if (!item) return prev
      next[key] = {
        ...item, billing,
        monthly: billing === 'monthly' ? (item.moPr || 0) : 0,
        setup: billing === 'onetime' ? (item.otPr || 0) * item.qty : 0,
      }
      return next
    })
  }, [])

  const toggleAddon = useCallback((key: string, name: string, monthly: number, setup: number) => {
    setSelected(prev => {
      const next = { ...prev }
      if (next[key]) { delete next[key] } else { next[key] = { name, monthly, setup, qty: 1 } }
      return next
    })
  }, [])

  const removeItem = useCallback((key: string) => {
    setSelected(prev => { const next = { ...prev }; delete next[key]; return next })
  }, [])

  const toggleIncludes = useCallback((id: string) => {
    setExpandedInc(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }, [])

  // ── Totals ─────────────────────────────────────────────────────────

  const entries = Object.entries(selected)
  const totalMonthly = entries.reduce((s, [, x]) => s + (x.monthly || 0) * (x.qty || 1), 0)
  const totalSetup = entries.reduce((s, [, x]) => s + (x.setup || 0), 0)
  const itemCount = entries.length

  // ── Add plan to cart ───────────────────────────────────────────────

  const addPlanToCart = () => {
    entries.forEach(([, item]) => {
      const q = item.qty || 1
      if (item.monthly > 0) {
        addItem({ id: item.name.replace(/\W/g, '-').toLowerCase(), name: item.name + (q > 1 ? ` x${q}` : ''), price: item.monthly * q, priceUnit: 'per_month' })
      } else if (item.setup > 0) {
        addItem({ id: item.name.replace(/\W/g, '-').toLowerCase(), name: item.name + (q > 1 ? ` x${q}` : ''), price: item.setup, priceUnit: 'one_time' })
      }
    })
    setIsCartOpen(true)
  }

  // ── Render tab content ─────────────────────────────────────────────

  const currentTab = TABS[activeTab]

  const filteredOrders = orders.filter(o => orderFilter === 'all' || o.status === orderFilter)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Services &amp; Orders</h1>
          <p className="text-ink-3 text-sm mt-1">Pick what your business actually needs.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-bg-2 rounded-lg p-0.5">
            <button onClick={() => setView('build')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'build' ? 'bg-white text-ink shadow-sm' : 'text-ink-3'}`}>Build Plan</button>
            <button onClick={() => setView('orders')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'orders' ? 'bg-white text-ink shadow-sm' : 'text-ink-3'}`}>My Orders</button>
          </div>
          <button onClick={() => setIsCartOpen(true)} className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-dark text-white text-sm font-semibold hover:bg-brand-dark/90 transition-colors">
            <ShoppingCart className="w-4 h-4" /> Cart
            {cartCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white text-brand-dark text-[10px] font-bold flex items-center justify-center border-2 border-brand-dark">{cartCount}</span>}
          </button>
        </div>
      </div>

      {/* ── BUILD VIEW ────────────────────────────────────────────── */}
      {view === 'build' && (
        <>
          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {TABS.map((t, i) => (
              <button key={t.name} onClick={() => setActiveTab(i)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeTab === i ? 'bg-brand-tint text-brand-dark border border-brand/20 shadow-sm' : 'bg-white/60 border border-transparent text-ink-3 hover:text-ink hover:bg-white'}`}>
                <span>{t.icon}</span> {t.name}
              </button>
            ))}
          </div>

          {/* 2-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
            {/* LEFT: Service Panels */}
            <div className="space-y-6">
              {currentTab.sections.map((sec, si) => {
                const svc = websiteData.services.find((s: Record<string, unknown>) => s.id === sec.svcId)
                if (!svc) return null

                return (
                  <div key={si} className="space-y-3">
                    {/* Section Label */}
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">{sec.label}</span>
                      {sec.note && <span className="text-[11px] text-ink-5 ml-2">{sec.note}</span>}
                    </div>

                    {/* TIERS (radio) */}
                    {sec.show === 'tiers' && (svc as unknown as { tiers?: Record<string, unknown>[] }).tiers?.map((tier: Record<string, unknown>, ti: number) => {
                      if (tier.isCustom) return null
                      const key = `${svc.id}_t${ti}`
                      const mo = (tier.monthly as number) || 0
                      const su = ((tier.setupFee as number) || 0) + ((tier.oneTimePrice as number) || 0)
                      const isSelected = !!selected[key]
                      const includes = (tier.includes || tier.features || []) as string[]
                      const incId = `inc_${svc.id}_t${ti}`

                      return (
                        <button key={ti} onClick={() => pickTier(key, `${svc.name} (${tier.name})`, mo, su, svc.id)}
                          className={`w-full text-left p-4 rounded-2xl border backdrop-blur-sm transition-all ${isSelected ? 'border-brand bg-brand-tint/30 shadow-sm' : 'border-white/60 bg-white/45 hover:border-brand/20 hover:bg-white/65'}`}>
                          <div className="flex items-start gap-3">
                            {/* Radio dot */}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 transition-colors ${isSelected ? 'border-brand bg-brand' : 'border-ink-5'}`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-[family-name:var(--font-display)] text-base text-ink">{tier.name as string}</span>
                                {Boolean(tier.popular) && <span className="text-[9px] font-bold uppercase tracking-wider bg-brand text-white px-2 py-0.5 rounded-full">Popular</span>}
                              </div>
                              {includes.length > 0 && (
                                <p className="text-xs text-ink-4 mt-0.5 line-clamp-1">{includes.slice(0, 2).join(' · ')}</p>
                              )}
                              {includes.length > 2 && (
                                <>
                                  <button onClick={e => { e.stopPropagation(); toggleIncludes(incId) }}
                                    className="text-xs font-medium text-brand-dark mt-1 flex items-center gap-1 hover:opacity-70">
                                    <ChevronDown className={`w-3 h-3 transition-transform ${expandedInc.has(incId) ? 'rotate-180' : ''}`} />
                                    {expandedInc.has(incId) ? 'Hide details' : 'See all'}
                                  </button>
                                  {expandedInc.has(incId) && (
                                    <ul className="mt-2 space-y-1">
                                      {includes.map((inc: string, ii: number) => (
                                        <li key={ii} className="flex items-start gap-1.5 text-xs text-ink-3">
                                          <CheckCircle2 className="w-3 h-3 text-brand mt-0.5 flex-shrink-0" /> {inc}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </>
                              )}
                            </div>
                            <span className="font-[family-name:var(--font-display)] text-base text-brand-dark flex-shrink-0">
                              {mo > 0 ? `$${mo}/mo` : su > 0 ? `$${su.toLocaleString()}` : 'Custom'}
                            </span>
                          </div>
                        </button>
                      )
                    })}

                    {/* ITEMS (qty) */}
                    {sec.show === 'items' && (() => {
                      let items = ((svc as unknown as { items?: Record<string, unknown>[] }).items || [])
                      if (sec.filter) items = items.filter((it: Record<string, unknown>) => sec.filter!.includes(it.id as string))
                      return items.map((item: Record<string, unknown>, ii: number) => {
                        const key = `${svc.id}_i_${item.id}`
                        const pr = (item.pricePerUnit as number) || 0
                        const otPr = Math.round(pr * 1.35)
                        const qty = selected[key]?.qty || 0
                        const billing = sec.oneTimeOnly ? 'onetime' : (selected[key]?.billing || 'monthly')
                        const includes = (item.includes || []) as string[]
                        const incId = `inc_${key}`

                        return (
                          <div key={ii} className={`p-4 rounded-2xl border backdrop-blur-sm transition-all ${qty > 0 ? 'border-brand/20 bg-brand-tint/20' : 'border-white/60 bg-white/40'}`}>
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-[family-name:var(--font-display)] text-base text-ink">{item.name as string}</span>
                                  {Boolean((item as Record<string, unknown>).popular) && <span className="text-[9px] font-bold uppercase bg-brand text-white px-2 py-0.5 rounded-full">Popular</span>}
                                </div>
                                {/* Billing toggle */}
                                {!sec.oneTimeOnly && (
                                  <div className="flex mt-1.5 rounded-lg overflow-hidden border border-ink-6 w-fit">
                                    <button onClick={() => setBilling(key, 'monthly')}
                                      className={`px-3 py-1 text-[11px] font-medium transition-colors ${billing === 'monthly' ? 'bg-brand text-white' : 'text-ink-4'}`}>Monthly</button>
                                    <button onClick={() => setBilling(key, 'onetime')}
                                      className={`px-3 py-1 text-[11px] font-medium transition-colors ${billing === 'onetime' ? 'bg-brand text-white' : 'text-ink-4'}`}>One-time</button>
                                  </div>
                                )}
                                {includes.length > 0 && (
                                  <>
                                    <button onClick={() => toggleIncludes(incId)}
                                      className="text-xs font-medium text-brand-dark mt-1.5 flex items-center gap-1 hover:opacity-70">
                                      <ChevronDown className={`w-3 h-3 transition-transform ${expandedInc.has(incId) ? 'rotate-180' : ''}`} />
                                      What&apos;s included
                                    </button>
                                    {expandedInc.has(incId) && (
                                      <ul className="mt-2 space-y-1">
                                        {includes.map((inc: string, idx: number) => (
                                          <li key={idx} className="flex items-start gap-1.5 text-xs text-ink-3">
                                            <CheckCircle2 className="w-3 h-3 text-brand mt-0.5 flex-shrink-0" /> {inc}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </>
                                )}
                              </div>
                              {/* Price + Qty */}
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="font-[family-name:var(--font-display)] text-sm text-brand-dark text-right">
                                  {sec.oneTimeOnly
                                    ? <><strong>${pr}</strong><span className="text-xs text-ink-4">/{item.unit as string}</span></>
                                    : billing === 'monthly'
                                      ? <><strong>${pr}</strong><span className="text-xs text-ink-4">/{item.unit as string}/mo</span></>
                                      : <><strong>${otPr}</strong><span className="text-xs text-ink-4">/{item.unit as string}</span></>
                                  }
                                </span>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => changeQty(key, item.name as string, sec.oneTimeOnly ? 0 : pr, sec.oneTimeOnly ? pr : otPr, -1)}
                                    className="w-8 h-8 rounded-lg border border-ink-6 bg-white/50 flex items-center justify-center text-ink-3 hover:border-brand hover:text-brand-dark transition-colors">
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="text-base font-semibold text-ink w-5 text-center">{qty}</span>
                                  <button onClick={() => changeQty(key, item.name as string, sec.oneTimeOnly ? 0 : pr, sec.oneTimeOnly ? pr : otPr, 1)}
                                    className="w-8 h-8 rounded-lg border border-ink-6 bg-white/50 flex items-center justify-center text-ink-3 hover:border-brand hover:text-brand-dark transition-colors">
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    })()}

                    {/* ADDONS (toggle) */}
                    {sec.show === 'addons' && ((svc as unknown as { addOns?: Record<string, unknown>[] }).addOns || []).map((addon: Record<string, unknown>, ai: number) => {
                      const key = `${svc.id}_a${ai}`
                      const mo = (addon.monthly as number) || 0
                      const su = (addon.oneTimePrice as number) || 0
                      const isOn = !!selected[key]

                      return (
                        <button key={ai} onClick={() => toggleAddon(key, addon.name as string, mo, su)}
                          className={`w-full text-left p-3.5 rounded-xl border flex items-center gap-3 transition-all ${isOn ? 'border-brand bg-brand-tint/20' : 'border-ink-6 bg-white/35 hover:border-brand/20 hover:bg-white/50'}`}>
                          <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${isOn ? 'bg-brand border border-brand' : 'border border-ink-5'}`}>
                            {isOn && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="text-sm font-medium text-ink flex-1">{addon.name as string}</span>
                          <span className="text-sm font-semibold text-brand-dark">{mo > 0 ? `$${mo}/mo` : `$${su}`}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* RIGHT: Calculator (sticky) */}
            <div className="hidden lg:block sticky top-20">
              <div className="rounded-3xl bg-white/55 backdrop-blur-xl border border-white/70 shadow-lg p-6">
                <h3 className="font-[family-name:var(--font-display)] text-base text-ink mb-4">Your plan</h3>

                {entries.length === 0 ? (
                  <p className="text-sm text-ink-4 py-4">Pick services from the left to start building your plan.</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-80 overflow-y-auto mb-4">
                      {entries.map(([key, item]) => {
                        const q = item.qty || 1
                        const price = item.monthly > 0 ? `$${(item.monthly * q).toLocaleString()}/mo` : item.setup > 0 ? `$${item.setup.toLocaleString()}` : ''
                        return (
                          <div key={key} className="flex items-start justify-between gap-2 text-sm pb-2 border-b border-ink-6 last:border-0">
                            <div className="flex-1 min-w-0">
                              <span className="text-ink-2">{item.name}</span>
                              {q > 1 && <span className="text-ink-4 text-xs block">x{q}</span>}
                              {item.billing === 'onetime' && <span className="text-ink-4 text-xs block">one-time</span>}
                            </div>
                            <span className="text-brand-dark font-semibold whitespace-nowrap">{price}</span>
                            <button onClick={() => removeItem(key)} className="text-ink-4 hover:text-red-500 transition-colors p-0.5">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    <div className="h-px bg-ink-5 mb-3" />

                    {totalMonthly > 0 && (
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-ink-3">Monthly</span>
                        <span className="font-semibold text-ink">${totalMonthly.toLocaleString()}/mo</span>
                      </div>
                    )}
                    {totalSetup > 0 && (
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-ink-3">One-time</span>
                        <span className="font-semibold text-ink">${totalSetup.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-baseline mt-3 pt-3 border-t border-ink-5">
                      <span className="font-[family-name:var(--font-display)] text-base text-ink">Total</span>
                      <div className="text-right">
                        <span className="font-[family-name:var(--font-display)] text-2xl text-brand-dark">${totalMonthly.toLocaleString()}</span>
                        <span className="text-sm text-ink-4">/mo</span>
                      </div>
                    </div>

                    <button onClick={addPlanToCart}
                      className="w-full mt-4 py-3.5 rounded-full bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors shadow-md shadow-brand/20">
                      Add plan to cart →
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Mobile: Floating total bar */}
          {entries.length > 0 && (
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-ink-6 px-4 py-3 flex items-center justify-between safe-area-bottom">
              <div>
                <span className="text-xs text-ink-3">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                <div className="font-[family-name:var(--font-display)] text-lg text-brand-dark">${totalMonthly.toLocaleString()}<span className="text-xs text-ink-4">/mo</span></div>
              </div>
              <button onClick={addPlanToCart}
                className="px-6 py-2.5 rounded-full bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors">
                Add to cart →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── ORDERS VIEW ───────────────────────────────────────────── */}
      {view === 'orders' && (
        <div className="space-y-8">
          {/* Active Subscriptions */}
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Active Subscriptions</h2>
            {loadingSubs ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-ink-4 animate-spin" /><span className="ml-2 text-sm text-ink-4">Loading...</span></div>
            ) : activeSubscriptions.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-xl border border-ink-6">
                <Package className="w-10 h-10 text-ink-4 mx-auto mb-3" />
                <p className="text-ink-2 font-medium">No active subscriptions</p>
                <p className="text-sm text-ink-4 mt-1">Build a plan to get started.</p>
                <button onClick={() => setView('build')} className="mt-4 px-5 py-2 text-sm font-medium text-brand-dark border border-brand/30 rounded-lg hover:bg-brand-tint transition-colors">
                  Build Your Plan
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeSubscriptions.map(sub => (
                  <div key={sub.id} className="bg-white rounded-xl border border-ink-6 p-5">
                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Active</span>
                    <h3 className="font-[family-name:var(--font-display)] text-base text-ink mt-2">{sub.name}</h3>
                    <p className="text-lg font-semibold text-emerald-600 mt-1">{fmt(sub.price)}/mo</p>
                    <p className="text-[11px] text-ink-4 mt-1">Since {sub.since}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Order History */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Order History</h2>
              <div className="flex gap-1.5">
                {(['all', 'active', 'completed', 'pending'] as const).map(f => (
                  <button key={f} onClick={() => setOrderFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-colors ${orderFilter === f ? 'bg-ink text-white' : 'bg-white border border-ink-6 text-ink-4 hover:text-ink'}`}>
                    {f === 'all' ? 'All' : f}
                  </button>
                ))}
              </div>
            </div>
            {loadingOrders ? (
              <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-ink-6"><Loader2 className="w-5 h-5 text-ink-4 animate-spin" /><span className="ml-2 text-sm text-ink-4">Loading...</span></div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-ink-6">
                <Package className="w-10 h-10 text-ink-4 mx-auto mb-3" />
                <p className="text-ink-2 font-medium">No orders yet</p>
                <button onClick={() => setView('build')} className="mt-4 px-5 py-2 text-sm font-medium text-brand-dark border border-brand/30 rounded-lg hover:bg-brand-tint transition-colors">Build Your Plan</button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
                <div className="hidden md:grid md:grid-cols-[1fr_1.2fr_110px_100px_80px] gap-4 px-5 py-3 bg-bg-2 border-b border-ink-6 text-[11px] font-semibold uppercase tracking-wider text-ink-4">
                  <span>Date</span><span>Service</span><span>Status</span><span className="text-right">Amount</span><span></span>
                </div>
                <div className="divide-y divide-ink-6">
                  {filteredOrders.map(o => {
                    const st = statusStyles[o.status]
                    return (
                      <div key={o.id} className="px-5 py-4 md:grid md:grid-cols-[1fr_1.2fr_110px_100px_80px] md:items-center gap-4 space-y-2 md:space-y-0 hover:bg-bg-2/50 transition-colors">
                        <p className="text-sm text-ink">{new Date(o.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        <p className="text-sm text-ink-2">{o.serviceName}</p>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border ${st.cls}`}><st.Icon className="w-3 h-3" />{st.label}</span>
                        <p className="text-sm font-medium text-ink text-right">{o.amount}</p>
                        <div className="text-right">
                          {o.status === 'completed' && (
                            <button className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-dark hover:text-brand-dark/80 transition-colors">
                              <RotateCcw className="w-3 h-3" /> Reorder
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <CartSidebar />
    </div>
  )
}
