'use client'

import { useState, Fragment } from 'react'
import {
  ShoppingCart,
  Sparkles,
  Search,
  Package,
  Clock,
  CheckCircle2,
  Eye,
  XCircle,
  X,
  ChevronRight,
  Zap,
  ArrowRight,
  Star,
  Plus,
  RotateCcw,
  Filter,
} from 'lucide-react'
import { services, categories, type Service, type ServiceCategory } from '@/lib/services-data'
import { useCart } from '@/lib/cart-context'
import Link from 'next/link'
import CartSidebar from './cart'

// ── Helpers ──────────────────────────────────────────────────────────

function fmt(price: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price)
}

function priceLabel(price: number, unit: string) {
  switch (unit) {
    case 'per_month': return `${fmt(price)}/mo`
    case 'per_hour': return `${fmt(price)}/hr`
    default: return fmt(price)
  }
}

function unitLabel(unit: string) {
  switch (unit) { case 'per_month': return 'per month'; case 'per_item': return 'per item'; case 'per_hour': return 'per hour'; case 'one_time': return 'one-time'; default: return '' }
}

function priceColor(unit: string) {
  switch (unit) { case 'per_month': return 'text-emerald-600'; case 'one_time': return 'text-blue-600'; default: return 'text-amber-600' }
}

// ── Mock data ────────────────────────────────────────────────────────

const activeSubscriptions = [
  { id: 'social-media-growth', name: 'Social Media Growth', price: 449, since: 'Jan 15, 2026' },
  { id: 'local-seo-starter', name: 'Local SEO Starter', price: 149, since: 'Feb 1, 2026' },
  { id: 'hosting-basic', name: 'Hosting Basic', price: 49, since: 'Dec 15, 2025' },
]

const recommendations = [
  { id: 'email-sms-growth', reason: 'Your email list has potential. Email marketing delivers $42 ROI per $1 spent.' },
  { id: 'polished-reel', reason: 'Video content gets 3x more reach. Your competitors post 2 videos/week.' },
  { id: 'brand-guidelines', reason: 'Consistent branding increases revenue by 23%. You don\'t have guidelines yet.' },
  { id: 'product-photography', reason: 'Professional photos get 2x more engagement than phone shots.' },
]

const smTiers = ['social-media-essentials', 'social-media-starter', 'social-media-growth'] as const
const smRows: { label: string; values: [string, string, string, string] }[] = [
  { label: 'Platforms', values: ['2', '3', '4+', 'Unlimited'] },
  { label: 'Feed posts/mo', values: ['8', '12', '20', 'Custom'] },
  { label: 'AI Captions', values: ['\u2713', '\u2713', '\u2713', '\u2713'] },
  { label: 'Stories', values: ['Basic', 'Regular', 'Daily', 'Daily'] },
  { label: 'Strategy', values: ['\u2014', 'Basic', 'Full', 'Enterprise'] },
  { label: 'Dedicated contact', values: ['\u2014', '\u2014', '\u2713', '\u2713'] },
]

const quickAddIds = ['single-feed-posts', 'story-graphics', 'carousel-posts', 'polished-reel']

type OrderStatus = 'active' | 'completed' | 'pending'
interface Order { id: string; date: string; serviceName: string; serviceId: string; status: OrderStatus; amount: string }
const mockOrders: Order[] = [
  { id: 'ORD-001', date: '2026-03-15', serviceName: 'Social Media Growth', serviceId: 'social-media-growth', status: 'active', amount: '$449/mo' },
  { id: 'ORD-002', date: '2026-03-10', serviceName: '4x Instagram Feed Posts', serviceId: 'single-feed-posts', status: 'completed', amount: '$140' },
  { id: 'ORD-003', date: '2026-02-20', serviceName: 'Standard Website', serviceId: 'standard-website', status: 'completed', amount: '$1,299' },
  { id: 'ORD-004', date: '2026-02-01', serviceName: 'Local SEO Starter', serviceId: 'local-seo-starter', status: 'active', amount: '$149/mo' },
  { id: 'ORD-005', date: '2026-01-08', serviceName: 'Logo & Visual Identity', serviceId: 'logo-visual-identity', status: 'completed', amount: '$499' },
  { id: 'ORD-006', date: '2025-12-15', serviceName: 'Hosting Basic', serviceId: 'hosting-basic', status: 'active', amount: '$49/mo' },
]

const statusStyles: Record<OrderStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  completed: { label: 'Completed', cls: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Package },
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
}

type PriceType = 'All' | 'Monthly' | 'One-Time' | 'Per Item'

// ── Component ────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [tab, setTab] = useState<'recommended' | 'all' | 'orders'>('recommended')
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<ServiceCategory | 'All'>('All')
  const [priceType, setPriceType] = useState<PriceType>('All')
  const [modal, setModal] = useState<Service | null>(null)
  const [orderFilter, setOrderFilter] = useState<OrderStatus | 'all'>('all')
  const { addItem, cartCount, setIsCartOpen } = useCart()

  const svcMap = Object.fromEntries(services.map(s => [s.id, s]))

  const addToCart = (s: Service) => addItem({ id: s.id, name: s.name, price: s.price, priceUnit: s.priceUnit })

  const filtered = services.filter(s => {
    if (catFilter !== 'All' && s.category !== catFilter) return false
    if (priceType === 'Monthly' && s.priceUnit !== 'per_month') return false
    if (priceType === 'One-Time' && s.priceUnit !== 'one_time') return false
    if (priceType === 'Per Item' && s.priceUnit !== 'per_item' && s.priceUnit !== 'per_hour') return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.shortDescription.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const filteredOrders = mockOrders.filter(o => orderFilter === 'all' || o.status === orderFilter)

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'recommended', label: 'Recommended' },
    { key: 'all', label: 'All Services' },
    { key: 'orders', label: 'My Orders' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Services &amp; Orders</h1>
          <p className="text-ink-3 text-sm mt-1">Build your marketing stack</p>
        </div>
        <button onClick={() => setIsCartOpen(true)} className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-dark text-white text-sm font-semibold hover:bg-brand-dark/90 transition-colors">
          <ShoppingCart className="w-4 h-4" />
          Cart
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white text-brand-dark text-[10px] font-bold flex items-center justify-center border-2 border-brand-dark">{cartCount}</span>
          )}
        </button>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-1 bg-bg-2 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: RECOMMENDED ────────────────────────────────────── */}
      {tab === 'recommended' && (
        <div className="space-y-8">
          {/* Section A: Current Plan */}
          <section className="bg-white rounded-2xl border border-ink-6 p-6">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-brand" />
              Your Active Services
            </h2>
            <div className="space-y-3">
              {activeSubscriptions.map(sub => (
                <div key={sub.id} className="flex items-center justify-between py-2 border-b border-ink-6 last:border-0">
                  <span className="text-sm text-ink-2">{sub.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-ink">{fmt(sub.price)}/mo</span>
                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-ink-6 flex items-center justify-between">
              <span className="text-sm text-ink-3">Monthly total: <span className="font-semibold text-ink">{fmt(activeSubscriptions.reduce((s, x) => s + x.price, 0))}/mo</span></span>
              <button onClick={() => setTab('orders')} className="text-sm font-medium text-brand-dark hover:text-brand-dark/80 flex items-center gap-1 transition-colors">
                Manage Plans <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </section>

          {/* Section B: Recommended For You */}
          <section>
            <div className="mb-4">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Recommended for You
              </h2>
              <p className="text-sm text-ink-3 mt-1">Based on your restaurant business and current growth, we recommend:</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map(rec => {
                const svc = svcMap[rec.id]
                if (!svc) return null
                return (
                  <div key={rec.id} className="bg-white rounded-xl border border-ink-6 p-5 hover:shadow-md hover:border-ink-5 transition-all flex flex-col">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 bg-bg-2 px-2 py-0.5 rounded">{svc.category}</span>
                    </div>
                    <h3 className="font-[family-name:var(--font-display)] text-base text-ink">{svc.name}</h3>
                    <p className="text-xs text-ink-3 mt-1.5 leading-relaxed flex-1">{rec.reason}</p>
                    <div className="mt-4 pt-3 border-t border-ink-6 flex items-end justify-between">
                      <span className={`font-[family-name:var(--font-display)] text-lg ${priceColor(svc.priceUnit)}`}>{priceLabel(svc.price, svc.priceUnit)}</span>
                      <div className="flex gap-2">
                        <button onClick={() => setModal(svc)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-3 border border-ink-6 hover:border-ink-5 hover:text-ink transition-colors">Learn More</button>
                        <button onClick={() => addToCart(svc)} className="px-3 py-1.5 rounded-lg bg-brand-dark text-white text-xs font-semibold hover:bg-brand-dark/90 transition-colors">Add to Cart</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Section C: Upgrade Comparison */}
          <section className="bg-white rounded-2xl border border-ink-6 p-6 overflow-x-auto">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-1">Upgrade Your Social Media</h2>
            <p className="text-sm text-ink-3 mb-5">Compare plans and find the right fit for your brand.</p>
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-ink-6">
                  <th className="text-left py-3 pr-4 text-ink-4 font-medium text-xs"></th>
                  {(['Essentials', 'Starter', 'Growth', 'Enterprise'] as const).map((tier, i) => (
                    <th key={tier} className="text-center py-3 px-3">
                      <div className="font-[family-name:var(--font-display)] text-ink text-base flex items-center justify-center gap-1">
                        {tier}
                        {tier === 'Growth' && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                      </div>
                      <div className={`text-xs mt-0.5 ${i === 2 ? 'text-brand-dark font-semibold' : 'text-ink-3'}`}>
                        {i < 3 ? `${fmt([199, 299, 449][i])}/mo` : 'Custom'}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {smRows.map(row => (
                  <tr key={row.label} className="border-b border-ink-6 last:border-0">
                    <td className="py-2.5 pr-4 text-ink-3 text-xs font-medium">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td key={i} className={`text-center py-2.5 px-3 text-xs ${v === '\u2713' ? 'text-brand-dark font-bold text-sm' : v === '\u2014' ? 'text-ink-5' : 'text-ink-2'}`}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  {smTiers.map((id, i) => {
                    const s = svcMap[id]
                    const isCurrent = id === 'social-media-growth'
                    return (
                      <td key={id} className="text-center py-4 px-3">
                        {isCurrent ? (
                          <span className="inline-block px-4 py-1.5 rounded-lg text-xs font-semibold text-brand-dark bg-brand-tint border border-brand/20">Current Plan</span>
                        ) : (
                          <button onClick={() => s && addToCart(s)} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-brand-dark border border-brand/30 hover:bg-brand-tint transition-colors">Select</button>
                        )}
                      </td>
                    )
                  })}
                  <td className="text-center py-4 px-3">
                    <Link href="/dashboard/contact" className="px-4 py-1.5 rounded-lg text-xs font-semibold text-ink-3 border border-ink-6 hover:border-ink-5 hover:text-ink transition-colors inline-block">Contact Us</Link>
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* Section D: Quick Add */}
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Quick Add — A La Carte
            </h2>
            <p className="text-sm text-ink-3 mb-4">Popular add-ons you can order anytime.</p>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {quickAddIds.map(id => {
                const s = svcMap[id]
                if (!s) return null
                return (
                  <div key={id} className="flex-shrink-0 w-44 bg-white rounded-xl border border-ink-6 p-4 hover:shadow-md hover:border-ink-5 transition-all">
                    <h4 className="font-[family-name:var(--font-display)] text-sm text-ink leading-snug">{s.name}</h4>
                    <p className={`text-lg font-semibold mt-1 ${priceColor(s.priceUnit)}`}>{priceLabel(s.price, s.priceUnit)}</p>
                    <p className="text-[10px] text-ink-4 mb-3">{unitLabel(s.priceUnit)}</p>
                    <button onClick={() => addToCart(s)} className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-brand-tint text-brand-dark text-xs font-semibold border border-brand/15 hover:bg-brand/15 transition-colors">
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {/* ── TAB 2: ALL SERVICES ───────────────────────────────────── */}
      {tab === 'all' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
            <input type="text" placeholder="Search all services..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-ink-6 bg-white text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors" />
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Category */}
            <div className="flex flex-wrap gap-1.5">
              {(['All', ...categories] as const).map(c => (
                <button key={c} onClick={() => setCatFilter(c as ServiceCategory | 'All')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${catFilter === c ? 'bg-brand-dark text-white' : 'bg-white border border-ink-6 text-ink-3 hover:text-ink hover:border-ink-5'}`}>{c}</button>
              ))}
            </div>
            {/* Price type */}
            <div className="flex gap-1.5 ml-auto">
              {(['All', 'Monthly', 'One-Time', 'Per Item'] as PriceType[]).map(p => (
                <button key={p} onClick={() => setPriceType(p)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${priceType === p ? 'bg-ink text-white' : 'bg-white border border-ink-6 text-ink-4 hover:text-ink hover:border-ink-5'}`}>{p}</button>
              ))}
            </div>
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <Filter className="w-10 h-10 text-ink-4 mx-auto mb-3" />
              <p className="text-ink-2 font-medium">No services found</p>
              <p className="text-sm text-ink-4 mt-1">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map(s => (
                <button key={s.id} onClick={() => setModal(s)} className="text-left bg-white rounded-xl border border-ink-6 p-5 hover:shadow-md hover:border-ink-5 transition-all flex flex-col group">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 bg-bg-2 px-2 py-0.5 rounded">{s.category}</span>
                    {s.popular && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5" /> Most Popular
                      </span>
                    )}
                  </div>
                  <h3 className="font-[family-name:var(--font-display)] text-base text-ink leading-snug group-hover:text-brand-dark transition-colors">{s.name}</h3>
                  <p className="text-xs text-ink-3 mt-1.5 leading-relaxed flex-1">{s.shortDescription}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {s.features.slice(0, 3).map(f => <span key={f} className="text-[10px] text-ink-4 bg-bg-2 px-1.5 py-0.5 rounded">{f}</span>)}
                    {s.features.length > 3 && <span className="text-[10px] text-ink-4 px-1.5 py-0.5">+{s.features.length - 3} more</span>}
                  </div>
                  <div className="mt-4 pt-3 border-t border-ink-6 flex items-end justify-between">
                    <div>
                      <span className={`font-[family-name:var(--font-display)] text-xl ${priceColor(s.priceUnit)}`}>{priceLabel(s.price, s.priceUnit)}</span>
                      <span className="block text-[10px] text-ink-4 mt-0.5">{unitLabel(s.priceUnit)}</span>
                    </div>
                    <span onClick={e => { e.stopPropagation(); addToCart(s) }}
                      className="px-3.5 py-2 rounded-lg bg-brand-tint text-brand-dark text-xs font-semibold border border-brand/15 hover:bg-brand/15 transition-colors cursor-pointer">
                      Add to Cart
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: MY ORDERS ──────────────────────────────────────── */}
      {tab === 'orders' && (
        <div className="space-y-8">
          {/* Active Subscriptions */}
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Active Subscriptions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activeSubscriptions.map(sub => (
                <div key={sub.id} className="bg-white rounded-xl border border-ink-6 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Active</span>
                  </div>
                  <h3 className="font-[family-name:var(--font-display)] text-base text-ink">{sub.name}</h3>
                  <p className="text-lg font-semibold text-emerald-600 mt-1">{fmt(sub.price)}/mo</p>
                  <p className="text-[11px] text-ink-4 mt-1">Active since {sub.since}</p>
                  <button className="mt-4 w-full py-1.5 rounded-lg text-xs font-medium text-ink-3 border border-ink-6 hover:border-ink-5 hover:text-ink transition-colors">Manage</button>
                </div>
              ))}
            </div>
          </section>

          {/* Order History */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Order History</h2>
              <div className="flex gap-1.5">
                {(['all', 'active', 'completed', 'pending'] as const).map(f => (
                  <button key={f} onClick={() => setOrderFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors capitalize ${orderFilter === f ? 'bg-ink text-white' : 'bg-white border border-ink-6 text-ink-4 hover:text-ink'}`}>
                    {f === 'all' ? 'All' : f}
                  </button>
                ))}
              </div>
            </div>
            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-ink-6">
                <Package className="w-10 h-10 text-ink-4 mx-auto mb-3" />
                <p className="text-ink-2 font-medium">No orders yet</p>
                <p className="text-sm text-ink-4 mt-1">Browse services to get started.</p>
                <button onClick={() => setTab('recommended')} className="mt-4 px-5 py-2 text-sm font-medium text-brand-dark border border-brand/30 rounded-lg hover:bg-brand-tint transition-colors">
                  View Recommendations
                </button>
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
                        <div>
                          <p className="text-sm text-ink">{new Date(o.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          <p className="text-[11px] text-ink-4 md:hidden">{o.serviceName}</p>
                        </div>
                        <p className="text-sm text-ink-2 hidden md:block">{o.serviceName}</p>
                        <div>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border ${st.cls}`}>
                            <st.Icon className="w-3 h-3" />{st.label}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-ink text-right">{o.amount}</p>
                        <div className="text-right">
                          {o.status === 'completed' && (
                            <button onClick={() => { const s = svcMap[o.serviceId]; if (s) addToCart(s) }}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-dark hover:text-brand-dark/80 transition-colors">
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

      {/* ── SERVICE DETAIL MODAL ──────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div onClick={e => e.stopPropagation()} className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6">
            <button onClick={() => setModal(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg-2 flex items-center justify-center text-ink-3 hover:text-ink hover:bg-ink-6 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 bg-bg-2 px-2 py-0.5 rounded">{modal.category}</span>
              {modal.popular && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> Most Popular
                </span>
              )}
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-xl text-ink">{modal.name}</h2>
            <p className="text-sm text-ink-3 mt-2 leading-relaxed">{modal.description}</p>

            <div className="mt-5 p-4 bg-bg-2 rounded-xl">
              <div className="flex items-baseline gap-2">
                <span className={`font-[family-name:var(--font-display)] text-2xl ${priceColor(modal.priceUnit)}`}>{priceLabel(modal.price, modal.priceUnit)}</span>
                <span className="text-xs text-ink-4">{unitLabel(modal.priceUnit)}</span>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-ink mb-2">What&apos;s included</h3>
              <ul className="space-y-2">
                {modal.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-2">
                    <CheckCircle2 className="w-4 h-4 text-brand mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-ink mb-1">Perfect for</h3>
              <p className="text-sm text-ink-3">
                {modal.isSubscription
                  ? 'Businesses looking for ongoing, consistent results with a dedicated service partner.'
                  : 'Brands needing a high-quality, one-time deliverable to elevate their presence.'}
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => { addToCart(modal); setModal(null) }}
                className="flex-1 py-2.5 rounded-xl bg-brand-dark text-white text-sm font-semibold hover:bg-brand-dark/90 transition-colors flex items-center justify-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Add to Cart
              </button>
              {modal.price > 500 && (
                <Link href="/dashboard/contact" onClick={() => setModal(null)}
                  className="py-2.5 px-4 rounded-xl text-sm font-medium text-ink-3 border border-ink-6 hover:border-ink-5 hover:text-ink transition-colors text-center">
                  Request Quote
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <CartSidebar />
    </div>
  )
}
