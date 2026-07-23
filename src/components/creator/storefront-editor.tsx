'use client'

/**
 * StorefrontEditor — a creator's own package manager. List on the left of the flow, a full
 * editor when adding or editing one. Everything a creator types is validated the same way the
 * server validates it (shared validatePackage), so the errors they see match what will actually
 * be refused, and nothing that would mislead a buyer can be published.
 *
 * Deliberately plain: no money moves from this screen. Publishing a package puts it on the
 * creator's public storefront, nothing more. That is stated on screen so a creator is never
 * surprised about what "publish" does.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Eye, EyeOff, ArrowLeft, Check, Loader2, X } from 'lucide-react'
import {
  PACKAGE_CATEGORIES, validatePackage, emptyPackage, formatCents, maxPriceCents, startingPriceCents,
  type CreatorPackage, type PackageCategory, type ListingType,
} from '@/lib/marketplace/package'
import { saveMyPackage, setPackagePublished, deleteMyPackage } from '@/lib/marketplace/creator-store-actions'
import type { MyStore } from '@/lib/marketplace/creator-store-actions'

const CATEGORY_LABEL: Record<PackageCategory, string> = {
  food_influencer: 'Food influencer', photographer: 'Photographer', videographer: 'Videographer',
  graphic_designer: 'Graphic designer', web_designer: 'Web designer', social_manager: 'Social manager',
  local_seo: 'Local SEO', email_marketer: 'Email marketer', pr_specialist: 'PR specialist',
  strategist: 'Strategist', full_service_agency: 'Full-service agency', other: 'Other',
}
const TYPE_LABEL: Record<ListingType, string> = {
  one_off: 'One-off', package: 'Package', subscription: 'Subscription', quote: 'By quote',
}

export default function StorefrontEditor({ initialVendor, initialPackages }: { initialVendor: MyStore['vendor']; initialPackages: CreatorPackage[] }) {
  const [packages, setPackages] = useState<CreatorPackage[]>(initialPackages)
  const [editing, setEditing] = useState<CreatorPackage | null>(null)

  if (!initialVendor) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center pt-24 px-6">
          <h1 className="text-lg font-semibold text-neutral-900">You are not set up as a creator yet</h1>
          <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
            Once Apnosh links your account, this is where you build and price the packages restaurants can book.
          </p>
        </div>
      </Shell>
    )
  }

  if (editing) {
    return (
      <Shell>
        <PackageForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setPackages((prev) => {
              const i = prev.findIndex((p) => p.id === saved.id)
              return i >= 0 ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved]
            })
            setEditing(null)
          }}
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-neutral-900">Your packages</h1>
          <Link href={`/marketplace/${initialVendor.slug}`} target="_blank" className="text-sm font-medium text-emerald-700 hover:underline">
            View your storefront
          </Link>
        </div>
        <p className="text-sm text-neutral-500 mb-6">
          What restaurants can book from you, at your price. Publishing puts a package on your storefront. No one is charged from here.
        </p>

        {packages.length === 0 && (
          <div className="border border-dashed border-neutral-200 rounded-2xl p-8 text-center text-sm text-neutral-500 mb-4">
            No packages yet. Add your first one so restaurants can book you.
          </div>
        )}

        <div className="space-y-2.5">
          {packages.map((p) => (
            <PackageRow
              key={p.id}
              pkg={p}
              onEdit={() => setEditing(p)}
              onToggle={async () => {
                const res = await setPackagePublished(p.id!, !p.active)
                if (res.ok) setPackages((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)))
              }}
              onDelete={async () => {
                const res = await deleteMyPackage(p.id!)
                if (res.ok) setPackages((prev) => prev.filter((x) => x.id !== p.id))
              }}
            />
          ))}
        </div>

        <button
          onClick={() => setEditing(emptyPackage((initialVendor.craft as PackageCategory) || 'videographer'))}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800"
        >
          <Plus className="w-4 h-4" /> Add a package
        </button>
      </div>
    </Shell>
  )
}

function PackageRow({ pkg, onEdit, onToggle, onDelete }: { pkg: CreatorPackage; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  const start = startingPriceCents(pkg)
  const max = maxPriceCents(pkg)
  const priceText = start == null ? 'By quote'
    : max != null && max > start ? `${formatCents(start)} to ${formatCents(max)}`
    : formatCents(start)
  return (
    <div className="border border-neutral-200 rounded-2xl p-4 flex items-start gap-3">
      <button onClick={onEdit} className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-900 truncate">{pkg.title || 'Untitled'}</span>
          {!pkg.active && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">Draft</span>}
        </div>
        <div className="text-xs text-neutral-500 mt-0.5">{CATEGORY_LABEL[pkg.category]} · {TYPE_LABEL[pkg.listingType]} · {priceText}</div>
      </button>
      <div className="flex items-center gap-1 flex-shrink-0">
        <IconBtn title={pkg.active ? 'Unpublish' : 'Publish'} onClick={onToggle}>
          {pkg.active ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-neutral-400" />}
        </IconBtn>
        <IconBtn title="Delete" onClick={onDelete}><Trash2 className="w-4 h-4 text-neutral-400" /></IconBtn>
      </div>
    </div>
  )
}

function PackageForm({ initial, onCancel, onSaved }: { initial: CreatorPackage; onCancel: () => void; onSaved: (p: CreatorPackage) => void }) {
  const [p, setP] = useState<CreatorPackage>(initial)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const set = (patch: Partial<CreatorPackage>) => setP((cur) => ({ ...cur, ...patch }))

  async function save(publish: boolean) {
    const next = { ...p, active: publish }
    const errs = validatePackage(next)
    if (errs.length) { setErrors(errs); return }
    setErrors([]); setSaving(true)
    const res = await saveMyPackage(next)
    setSaving(false)
    if (res.ok) onSaved(res.pkg)
    else setErrors(res.errors)
  }

  const priceDollars = p.priceCents == null ? '' : String(p.priceCents / 100)

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to your packages
      </button>

      <h1 className="text-xl font-bold text-neutral-900 mb-5">{initial.id ? 'Edit package' : 'New package'}</h1>

      <Field label="Name">
        <input value={p.title} onChange={(e) => set({ title: e.target.value })} placeholder="Signature reel pack" className={inputCls} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind of work">
          <select value={p.category} onChange={(e) => set({ category: e.target.value as PackageCategory })} className={inputCls}>
            {PACKAGE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="How it is sold">
          <select value={p.listingType} onChange={(e) => {
            const lt = e.target.value as ListingType
            set({ listingType: lt, billingPeriod: lt === 'subscription' ? 'monthly' : 'one_time', priceCents: lt === 'quote' ? null : p.priceCents })
          }} className={inputCls}>
            {(['one_off', 'package', 'subscription', 'quote'] as ListingType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
      </div>

      {p.listingType !== 'quote' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (USD)">
            <input type="number" min={0} value={priceDollars}
              onChange={(e) => set({ priceCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })}
              placeholder="450" className={inputCls} />
          </Field>
          {p.listingType === 'subscription' && (
            <Field label="Billed">
              <select value={p.billingPeriod ?? 'monthly'} onChange={(e) => set({ billingPeriod: e.target.value as 'monthly' | 'annual' })} className={inputCls}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </Field>
          )}
        </div>
      )}

      <Field label="What it is">
        <textarea value={p.description} onChange={(e) => set({ description: e.target.value })} rows={2}
          placeholder="Three short reels shot and edited at your restaurant." className={inputCls} />
      </Field>

      <ListEditor
        label="What the buyer gets"
        items={p.deliverables}
        onAdd={() => set({ deliverables: [...p.deliverables, ''] })}
        onChange={(i, v) => set({ deliverables: p.deliverables.map((d, n) => (n === i ? v : d)) })}
        onRemove={(i) => set({ deliverables: p.deliverables.filter((_, n) => n !== i) })}
        placeholder="3 vertical reels"
      />

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Add-ons the buyer can pick (optional)</div>
        {p.options.map((o, i) => (
          <div key={o.id} className="flex items-center gap-2 mb-2">
            <input value={o.label} onChange={(e) => set({ options: p.options.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)) })}
              placeholder="Extra reel" className={`${inputCls} flex-1`} />
            <div className="flex items-center gap-1">
              <span className="text-sm text-neutral-400">+$</span>
              <input type="number" min={0} value={o.priceDeltaCents === 0 ? '' : o.priceDeltaCents / 100}
                onChange={(e) => set({ options: p.options.map((x, n) => (n === i ? { ...x, priceDeltaCents: e.target.value === '' ? 0 : Math.round(Number(e.target.value) * 100) } : x)) })}
                placeholder="120" className={`${inputCls} w-24`} />
            </div>
            <IconBtn title="Remove" onClick={() => set({ options: p.options.filter((_, n) => n !== i) })}><X className="w-4 h-4 text-neutral-400" /></IconBtn>
          </div>
        ))}
        <button onClick={() => set({ options: [...p.options, { id: `opt-${Date.now()}-${p.options.length}`, label: '', priceDeltaCents: 0 }] })}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900">
          <Plus className="w-3.5 h-3.5" /> Add an add-on
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <Field label="Turnaround (days, optional)">
          <input type="number" min={0} value={p.turnaroundDays ?? ''} onChange={(e) => set({ turnaroundDays: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} placeholder="10" className={inputCls} />
        </Field>
        <Field label="Revisions included (optional)">
          <input type="number" min={0} value={p.revisions ?? ''} onChange={(e) => set({ revisions: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} placeholder="2" className={inputCls} />
        </Field>
      </div>

      {errors.length > 0 && (
        <div className="mt-5 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      <div className="flex items-center gap-2.5 mt-6">
        <button onClick={() => save(true)} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Publish
        </button>
        <button onClick={() => save(false)} disabled={saving} className="px-5 py-2.5 rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
          Save as draft
        </button>
      </div>
      <p className="text-xs text-neutral-400 mt-3">Publish makes it visible on your storefront. A draft is only yours. No one is charged either way.</p>
    </div>
  )
}

function ListEditor({ label, items, onAdd, onChange, onRemove, placeholder }: {
  label: string; items: string[]; onAdd: () => void; onChange: (i: number, v: string) => void; onRemove: (i: number) => void; placeholder: string
}) {
  return (
    <div className="mt-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">{label}</div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <input value={it} onChange={(e) => onChange(i, e.target.value)} placeholder={placeholder} className={`${inputCls} flex-1`} />
          <IconBtn title="Remove" onClick={() => onRemove(i)}><X className="w-4 h-4 text-neutral-400" /></IconBtn>
        </div>
      ))}
      <button onClick={onAdd} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900">
        <Plus className="w-3.5 h-3.5" /> Add a line
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="p-1.5 rounded-lg hover:bg-neutral-100">{children}</button>
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>{children}</div>
}

const inputCls = 'w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400'
