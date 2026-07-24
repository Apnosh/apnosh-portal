'use client'

/**
 * StorefrontEditor — the creator's own OFFER designer. A creator designs each offer from a blank
 * canvas: its photos, what it is, its price and levels, its add-ons, how it's delivered (a shoot, a
 * remote deliverable, a monthly plan, or a custom quote), and their own questions for the buyer.
 * Apnosh's standard products are still here as OPTIONAL starting points ("Start from an example"),
 * never a required first step.
 *
 * Everything is validated the same way the server validates it (shared validatePackage), so the
 * errors a creator sees match what will actually be refused. Photos upload the moment they're
 * picked; the rest saves on Publish / Save draft. No money moves from this screen — publishing puts
 * an offer on the public storefront, nothing more, and that is stated on screen.
 */

import { useRef, useState, type ChangeEvent, type ReactNode, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Trash2, Eye, EyeOff, X, Camera, ImagePlus, Loader2, Layers, Sparkles, Check,
  Star, CalendarClock, Laptop, Repeat, MessageSquareText, ChevronRight,
} from 'lucide-react'
import {
  PACKAGE_CATEGORIES, validatePackage, emptyPackage, formatCents, maxPriceCents, startingPriceCents,
  type CreatorPackage, type PackageCategory, type PackageTier, type IntakeItem,
} from '@/lib/marketplace/package'
import { CREATIVE_CRAFTS, productsForCraft, packageFromProduct, isRecurring, bookingShapeForCategory, type CreativeProduct } from '@/lib/marketplace/creative-catalog'
import { saveMyPackage, setPackagePublished, deleteMyPackage, uploadMyImage, type MyStore } from '@/lib/marketplace/creator-store-actions'
import { fileToDownscaledDataUrl, PHOTO_PREP } from '@/lib/marketplace/creator-image'

const GREEN = '#4abd98', GREEN_DK = '#0f6e56', INK = '#1d1d1f', MUTE = '#6e6e73', FAINT = '#aeaeb2', LINE = '#e6e6ea'
const FONT = 'DM Sans, sans-serif'

const CATEGORY_LABEL: Record<PackageCategory, string> = {
  food_influencer: 'Food influencer', photographer: 'Photographer', videographer: 'Videographer',
  graphic_designer: 'Graphic designer', web_designer: 'Web designer', social_manager: 'Social manager',
  local_seo: 'Local SEO', email_marketer: 'Email marketer', pr_specialist: 'PR specialist',
  strategist: 'Strategist', full_service_agency: 'Full-service agency', other: 'Other',
}

/* ── delivery mode: the creator-facing choice that sets listingType + bookingShape together ─── */

type DeliveryMode = 'shoot' | 'remote' | 'monthly' | 'quote'

const MODES: { id: DeliveryMode; label: string; sub: string; Icon: typeof Camera }[] = [
  { id: 'shoot', label: 'On-site', sub: 'A shoot or visit. They pick a time from your hours.', Icon: CalendarClock },
  { id: 'remote', label: 'Remote', sub: 'You deliver by a date. No visit. Good for design and edits.', Icon: Laptop },
  { id: 'monthly', label: 'Monthly', sub: 'An ongoing plan that runs every month.', Icon: Repeat },
  { id: 'quote', label: 'Custom quote', sub: 'No set price. They send details, you reply with a number.', Icon: MessageSquareText },
]

function modeOf(p: CreatorPackage): DeliveryMode {
  if (p.listingType === 'quote') return 'quote'
  // Prefer the authored shape; fall back to the category guess for legacy offers that never set one.
  const shape = p.bookingShape ?? bookingShapeForCategory(p.category)
  if (p.listingType === 'subscription' || shape === 'recurring') return 'monthly'
  if (shape === 'async') return 'remote'
  return 'shoot'
}

/** Patch that switches an offer to a delivery mode, keeping listingType + bookingShape coherent. */
function applyMode(p: CreatorPackage, mode: DeliveryMode): Partial<CreatorPackage> {
  switch (mode) {
    case 'shoot': return { bookingShape: 'scheduled', listingType: 'one_off', billingPeriod: 'one_time' }
    case 'remote': return { bookingShape: 'async', listingType: 'one_off', billingPeriod: 'one_time' }
    case 'monthly': return { bookingShape: 'recurring', listingType: 'subscription', billingPeriod: p.billingPeriod === 'annual' ? 'annual' : 'monthly' }
    case 'quote': return { bookingShape: 'async', listingType: 'quote', priceCents: null, tiers: [] }
  }
}

/** A creator's primary craft (Video/Photo/Social/Design) → a sensible default offer category. */
function defaultCategory(craft: string | null): PackageCategory {
  switch (craft) {
    case 'Photo': return 'photographer'
    case 'Video': return 'videographer'
    case 'Social': return 'social_manager'
    case 'Design': return 'graphic_designer'
    default: return 'photographer'
  }
}

/* ── screen ─────────────────────────────────────────────────────────────────────────────── */

export default function StorefrontEditor({ initialVendor, initialPackages }: { initialVendor: MyStore['vendor']; initialPackages: CreatorPackage[] }) {
  const [packages, setPackages] = useState<CreatorPackage[]>(initialPackages)
  const [editing, setEditing] = useState<CreatorPackage | null>(null)

  if (!initialVendor) {
    return (
      <Shell>
        <div style={{ maxWidth: 460, margin: '0 auto', padding: '96px 24px 0', textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: INK }}>You are not set up as a creator yet</h1>
          <p style={{ fontSize: 14, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>Once Apnosh links your account, this is where you design the offers restaurants can book.</p>
        </div>
      </Shell>
    )
  }

  if (editing) {
    return (
      <Shell>
        <OfferForm
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
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 18px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: INK }}>Your offers</h1>
          {initialVendor.bookable && (
            <Link href={`/marketplace/${initialVendor.slug}`} target="_blank" style={{ fontSize: 14, fontWeight: 600, color: GREEN_DK, textDecoration: 'none' }}>View your shop</Link>
          )}
        </div>
        <p style={{ fontSize: 14, color: MUTE, marginBottom: 18, lineHeight: 1.5 }}>What restaurants can book from you, designed and priced by you. No one is charged from here.</p>

        {!initialVendor.bookable && (
          <div style={{ marginBottom: 18, borderRadius: 14, border: '1px solid #f0e0b8', background: '#fbf3e4', padding: 14 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: INK }}>Your shop is under review</p>
            <p style={{ fontSize: 13, color: '#8a5a0c', marginTop: 4, lineHeight: 1.5 }}>Build your offers and hours now. Apnosh reviews new creators before they go live. Once you are approved, restaurants can find and book you.</p>
          </div>
        )}

        {packages.length === 0 && (
          <div style={{ border: `1px dashed ${LINE}`, borderRadius: 16, padding: 28, textAlign: 'center', fontSize: 14, color: MUTE, marginBottom: 14 }}>
            No offers yet. Design your first one so restaurants can book you.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {packages.map((p) => (
            <OfferCard
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

        <button type="button" onClick={() => setEditing(emptyPackage(defaultCategory(initialVendor.craft)))}
          style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, background: GREEN, color: 'white', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={17} /> Add an offer
        </button>
      </div>
    </Shell>
  )
}

/* ── list card ──────────────────────────────────────────────────────────────────────────── */

function OfferCard({ pkg, onEdit, onToggle, onDelete }: { pkg: CreatorPackage; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  const start = startingPriceCents(pkg)
  const max = maxPriceCents(pkg)
  const per = pkg.listingType === 'subscription' ? '/mo' : ''
  const priceText = start == null ? 'By quote'
    : max != null && max > start ? `${formatCents(start)} to ${formatCents(max)}${per}`
    : `${formatCents(start)}${per}`
  const mode = MODES.find((m) => m.id === modeOf(pkg))!
  const cover = pkg.photos[0]
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 12, background: '#fff' }}>
      <button type="button" onClick={onEdit} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <div style={{ width: 54, height: 54, borderRadius: 12, flexShrink: 0, background: cover ? `center/cover no-repeat url("${cover}")` : '#f2f2f5', display: 'grid', placeItems: 'center' }}>
          {!cover && <ImagePlus size={18} color={FAINT} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pkg.title || 'Untitled offer'}</span>
            {!pkg.active && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: '#8a5a0c', background: '#fbf3e4', borderRadius: 5, padding: '1px 5px' }}>Draft</span>}
          </div>
          <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>{mode.label} · {priceText}{pkg.tiers.length ? ` · ${pkg.tiers.length} levels` : ''}</div>
        </div>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <IconBtn title={pkg.active ? 'Hide' : 'Publish'} onClick={onToggle}>{pkg.active ? <Eye size={17} color={GREEN} /> : <EyeOff size={17} color={FAINT} />}</IconBtn>
        <IconBtn title="Delete" onClick={onDelete}><Trash2 size={16} color={FAINT} /></IconBtn>
      </div>
    </div>
  )
}

/* ── the offer form ─────────────────────────────────────────────────────────────────────── */

function OfferForm({ initial, onCancel, onSaved }: { initial: CreatorPackage; onCancel: () => void; onSaved: (p: CreatorPackage) => void }) {
  const [p, setP] = useState<CreatorPackage>(initial)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const set = (patch: Partial<CreatorPackage>) => setP((cur) => ({ ...cur, ...patch }))
  const mode = modeOf(p)
  const isNew = !initial.id

  async function save(publish: boolean) {
    const next = { ...p, active: publish }
    const errs = validatePackage(next)
    if (errs.length) { setErrors(errs); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setErrors([]); setSaving(true)
    const res = await saveMyPackage(next)
    setSaving(false)
    if (res.ok) onSaved(res.pkg)
    else setErrors(res.errors)
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '14px 18px 44px' }}>
      <button type="button" onClick={onCancel} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600, color: GREEN_DK, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={17} /> Your offers
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: INK, marginBottom: 2 }}>{isNew ? 'New offer' : 'Edit offer'}</h1>
      <p style={{ fontSize: 14, color: MUTE, marginBottom: 14, lineHeight: 1.5 }}>Design it your way. This is what a restaurant books.</p>

      {isNew && (
        <button type="button" onClick={() => setShowTemplates(true)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, border: `1px solid ${GREEN}55`, background: '#eaf7f3', cursor: 'pointer', marginBottom: 18 }}>
          <Sparkles size={18} color={GREEN_DK} />
          <span style={{ textAlign: 'left', flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: GREEN_DK }}>Start from an example</span>
            <span style={{ display: 'block', fontSize: 12.5, color: '#3f7d6b' }}>Fill it with a ready offer, then change anything.</span>
          </span>
          <ChevronRight size={18} color={GREEN_DK} />
        </button>
      )}

      {errors.length > 0 && (
        <div style={{ marginBottom: 16, borderRadius: 12, background: '#fdeeee', border: '1px solid #f3c9c6', padding: 12 }}>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 13, color: '#b3403a' }}>{e}</div>)}
        </div>
      )}

      {/* 1 — Photos */}
      <Section title="Photos" hint="The first photo is your cover. Show your best work.">
        <PhotoStrip photos={p.photos} onChange={(photos) => set({ photos })} />
      </Section>

      {/* 2 — Basics */}
      <Section title="The basics">
        <Label>Name</Label>
        <TextInput value={p.title} onChange={(v) => set({ title: v })} placeholder="Signature reel pack" />
        <div style={{ height: 14 }} />
        <Label>What it is</Label>
        <TextArea value={p.description} onChange={(v) => set({ description: v })} rows={3} placeholder="Three short reels shot and edited at your restaurant, ready to post." />
        <div style={{ height: 14 }} />
        <Label>What kind of work is this?</Label>
        <Select value={p.category} onChange={(v) => set({ category: v as PackageCategory })}>
          {PACKAGE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </Select>
      </Section>

      {/* 3 — Delivery mode */}
      <Section title="How it's delivered" hint="This sets whether a buyer picks a time, or you deliver by a date.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {MODES.map((m) => {
            const on = m.id === mode
            return (
              <button key={m.id} type="button" onClick={() => set(applyMode(p, m.id))}
                style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: `1.5px solid ${on ? GREEN : LINE}`, background: on ? '#eaf7f3' : '#fff', cursor: 'pointer' }}>
                <m.Icon size={18} color={on ? GREEN_DK : MUTE} />
                <div style={{ fontSize: 13.5, fontWeight: 700, color: on ? GREEN_DK : INK, marginTop: 6 }}>{m.label}</div>
                <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2, lineHeight: 1.35 }}>{m.sub}</div>
              </button>
            )
          })}
        </div>
      </Section>

      {/* 4 — Price & what's included */}
      <Section title={mode === 'quote' ? 'Price' : 'Price and what they get'}>
        {mode === 'quote' ? (
          <div style={{ borderRadius: 12, background: '#f7f7f9', border: `1px solid ${LINE}`, padding: 14, fontSize: 13.5, color: MUTE, lineHeight: 1.5 }}>
            A custom quote has no set price. A restaurant sends what they need and you reply with a number before it books.
          </div>
        ) : p.tiers.length > 0 ? (
          <TierList tiers={p.tiers} recurring={mode === 'monthly'} onChange={(tiers) => set({ tiers })}
            onDropToSingle={() => set({ tiers: [], priceCents: p.tiers[0]?.priceCents ?? null, deliverables: p.tiers[0]?.deliverables?.length ? [...p.tiers[0].deliverables] : [''] })} />
        ) : (
          <>
            <Label>{mode === 'monthly' ? 'Price per month (USD)' : 'Price (USD)'}</Label>
            <NumberInput value={p.priceCents == null ? '' : String(p.priceCents / 100)} onChange={(v) => set({ priceCents: dollarsToCents(v) })} placeholder="450" prefix="$" />
            <div style={{ height: 14 }} />
            <ListEditor label="What the buyer gets" items={p.deliverables}
              onAdd={() => set({ deliverables: [...p.deliverables, ''] })}
              onChange={(i, v) => set({ deliverables: p.deliverables.map((d, n) => (n === i ? v : d)) })}
              onRemove={(i) => set({ deliverables: p.deliverables.filter((_, n) => n !== i) })}
              placeholder="3 vertical reels" />
            <button type="button" onClick={() => set({ tiers: seedTiers(p) })} style={linkBtn}>
              <Layers size={14} /> Offer Good / Better / Best levels instead
            </button>
          </>
        )}
      </Section>

      {/* 5 — Add-ons */}
      <Section title="Add-ons they can pick" hint="Optional extras, each with a price on top.">
        {p.options.map((o, i) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><TextInput value={o.label} onChange={(v) => set({ options: p.options.map((x, n) => (n === i ? { ...x, label: v } : x)) })} placeholder="Extra reel" /></div>
            <div style={{ width: 96 }}><NumberInput value={o.priceDeltaCents === 0 ? '' : String(o.priceDeltaCents / 100)} onChange={(v) => set({ options: p.options.map((x, n) => (n === i ? { ...x, priceDeltaCents: dollarsToCents(v) ?? 0 } : x)) })} placeholder="120" prefix="+$" /></div>
            <IconBtn title="Remove" onClick={() => set({ options: p.options.filter((_, n) => n !== i) })}><X size={16} color={FAINT} /></IconBtn>
          </div>
        ))}
        <button type="button" onClick={() => set({ options: [...p.options, { id: `opt-${Date.now()}-${p.options.length}`, label: '', priceDeltaCents: 0 }] })} style={linkBtn}>
          <Plus size={14} /> Add an add-on
        </button>
      </Section>

      {/* 6 — Intake: the creator's own questions */}
      <Section title="What you need from them" hint="Your own questions, asked when they book. So you start ready.">
        <IntakeEditor items={p.intake} onChange={(intake) => set({ intake })} />
      </Section>

      {/* 7 — Turnaround / revisions */}
      <Section title={mode === 'shoot' ? 'Delivery' : 'Turnaround'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>{mode === 'shoot' ? 'Delivered after (days)' : 'Turnaround (days)'}</Label>
            <NumberInput value={p.turnaroundDays == null ? '' : String(p.turnaroundDays)} onChange={(v) => set({ turnaroundDays: wholeOrNull(v) })} placeholder="10" />
          </div>
          <div>
            <Label>Revisions included</Label>
            <NumberInput value={p.revisions == null ? '' : String(p.revisions)} onChange={(v) => set({ revisions: wholeOrNull(v) })} placeholder="2" />
          </div>
        </div>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
        <button type="button" onClick={() => save(true)} disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12, background: GREEN, color: 'white', fontSize: 14, fontWeight: 700, border: 'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Publish
        </button>
        <button type="button" onClick={() => save(false)} disabled={saving}
          style={{ padding: '12px 20px', borderRadius: 12, border: `1px solid ${LINE}`, background: '#fff', fontSize: 14, fontWeight: 700, color: INK, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
          Save draft
        </button>
      </div>
      <p style={{ fontSize: 12, color: FAINT, marginTop: 12 }}>Publish puts it on your shop. A draft is only yours. No one is charged either way.</p>

      {showTemplates && (
        <TemplatesSheet
          onClose={() => setShowTemplates(false)}
          onPick={(prod) => { setP((cur) => ({ ...packageFromProduct(prod), photos: cur.photos, ...(cur.id ? { id: cur.id, slug: cur.slug } : {}) })); setShowTemplates(false) }}
        />
      )}
    </div>
  )
}

/* ── photos ─────────────────────────────────────────────────────────────────────────────── */

function PhotoStrip({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, PHOTO_PREP)
      const res = await uploadMyImage(dataUrl)
      if (!res.ok) { setErr(res.error); setBusy(false); return }
      onChange([...photos, res.url]); setBusy(false)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not add that photo.'); setBusy(false)
    }
  }

  return (
    <div>
      <input ref={input} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {photos.map((url, i) => (
          <div key={url} style={{ position: 'relative', width: 92, height: 92, borderRadius: 12, background: `center/cover no-repeat url("${url}")`, border: `1px solid ${LINE}` }}>
            {i === 0 && <span style={{ position: 'absolute', left: 4, top: 4, display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px' }}><Star size={9} fill="#fff" /> Cover</span>}
            {i !== 0 && (
              <button type="button" onClick={() => onChange([url, ...photos.filter((u) => u !== url)])} title="Make cover"
                style={{ position: 'absolute', left: 4, top: 4, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', border: 'none', cursor: 'pointer' }}>Make cover</button>
            )}
            <button type="button" onClick={() => onChange(photos.filter((u) => u !== url))} title="Remove"
              style={{ position: 'absolute', right: 4, top: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <X size={12} color="#fff" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          style={{ width: 92, height: 92, borderRadius: 12, border: `1.5px dashed ${busy ? GREEN : LINE}`, background: busy ? '#eaf7f3' : '#fafafa', display: 'grid', placeItems: 'center', cursor: busy ? 'default' : 'pointer' }}>
          {busy ? <Loader2 size={18} className="animate-spin" color={GREEN_DK} /> : <div style={{ textAlign: 'center' }}><Camera size={18} color={MUTE} /><div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>Add</div></div>}
        </button>
      </div>
      {err && <div style={{ fontSize: 12.5, color: '#b3403a', marginTop: 8 }}>{err}</div>}
    </div>
  )
}

/* ── intake editor ──────────────────────────────────────────────────────────────────────── */

function IntakeEditor({ items, onChange }: { items: IntakeItem[]; onChange: (i: IntakeItem[]) => void }) {
  const setAt = (i: number, patch: Partial<IntakeItem>) => onChange(items.map((q, n) => (n === i ? { ...q, ...patch } : q)))
  return (
    <div>
      {items.map((q, i) => (
        <div key={q.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}><TextInput value={q.label} onChange={(v) => setAt(i, { label: v })} placeholder="Which dishes should we feature?" /></div>
            <IconBtn title="Remove" onClick={() => onChange(items.filter((_, n) => n !== i))}><X size={16} color={FAINT} /></IconBtn>
          </div>
          <div style={{ marginTop: 8 }}><TextInput value={q.hint ?? ''} onChange={(v) => setAt(i, { hint: v })} placeholder="Hint (optional), like: your best sellers" small /></div>
          <button type="button" onClick={() => setAt(i, { required: !q.required })}
            style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: q.required ? GREEN_DK : MUTE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${q.required ? GREEN : LINE}`, background: q.required ? GREEN : '#fff', display: 'grid', placeItems: 'center' }}>{q.required && <Check size={11} color="#fff" />}</span>
            Must answer to book
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { id: `ask-${Date.now()}-${items.length}`, label: '' }])} style={linkBtn}>
        <Plus size={14} /> Add a question
      </button>
    </div>
  )
}

/* ── templates sheet (optional starting point) ──────────────────────────────────────────── */

function TemplatesSheet({ onPick, onClose }: { onPick: (p: CreativeProduct) => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fafafa', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '82vh', overflowY: 'auto', padding: '8px 18px 28px' }}>
        <div style={{ position: 'sticky', top: 0, background: '#fafafa', paddingTop: 8, paddingBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>Start from an example</div>
            <div style={{ fontSize: 13, color: MUTE }}>Pick the closest one. You can change everything after.</div>
          </div>
          <IconBtn title="Close" onClick={onClose}><X size={18} color={MUTE} /></IconBtn>
        </div>
        {CREATIVE_CRAFTS.map((craft) => {
          const products = productsForCraft(craft)
          if (!products.length) return null
          return (
            <div key={craft} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: FAINT, marginBottom: 8 }}>{CATEGORY_LABEL[craft]}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {products.map((prod) => (
                  <button key={prod.id} type="button" onClick={() => onPick(prod)}
                    style={{ textAlign: 'left', border: `1px solid ${LINE}`, borderRadius: 14, padding: 13, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{prod.name}</span>
                        {prod.tiers.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: GREEN_DK, background: '#eaf7f3', borderRadius: 5, padding: '1px 6px' }}>{prod.tiers.length} levels</span>}
                        {isRecurring(prod) && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: '#3a6ea5', background: '#eef3fb', borderRadius: 5, padding: '1px 6px' }}>Monthly</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: MUTE, marginTop: 3, lineHeight: 1.4 }}>{prod.summary}</div>
                    </div>
                    <ChevronRight size={16} color={FAINT} style={{ flexShrink: 0, marginTop: 2 }} />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── levels (tiers) ─────────────────────────────────────────────────────────────────────── */

function seedTiers(p: CreatorPackage): PackageTier[] {
  const base = p.priceCents ?? 0
  const scope = p.deliverables.filter((d) => d.trim()).length ? [...p.deliverables] : ['']
  const stamp = Date.now()
  return [
    { id: `tier-${stamp}-0`, name: 'Standard', priceCents: base, deliverables: [...scope] },
    { id: `tier-${stamp}-1`, name: 'Premium', priceCents: 0, deliverables: [...scope] },
  ]
}

function TierList({ tiers, recurring, onChange, onDropToSingle }: { tiers: PackageTier[]; recurring: boolean; onChange: (t: PackageTier[]) => void; onDropToSingle: () => void }) {
  const setTier = (i: number, patch: Partial<PackageTier>) => onChange(tiers.map((t, n) => (n === i ? { ...t, ...patch } : t)))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: MUTE }}>Levels</span>
        <span style={{ fontSize: 12, color: FAINT }}>Same you, more of the work</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tiers.map((t, i) => (
          <div key={t.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}><TextInput value={t.name} onChange={(v) => setTier(i, { name: v })} placeholder="Standard" /></div>
              <div style={{ width: 96 }}><NumberInput value={t.priceCents === 0 ? '' : String(t.priceCents / 100)} onChange={(v) => setTier(i, { priceCents: dollarsToCents(v) ?? 0 })} placeholder="450" prefix={recurring ? '$/mo' : '$'} /></div>
              {tiers.length > 1 && <IconBtn title="Remove level" onClick={() => onChange(tiers.filter((_, n) => n !== i))}><Trash2 size={15} color={FAINT} /></IconBtn>}
            </div>
            <ListEditor label="Included at this level" items={t.deliverables}
              onAdd={() => setTier(i, { deliverables: [...t.deliverables, ''] })}
              onChange={(k, v) => setTier(i, { deliverables: t.deliverables.map((d, m) => (m === k ? v : d)) })}
              onRemove={(k) => setTier(i, { deliverables: t.deliverables.filter((_, m) => m !== k) })}
              placeholder="3 vertical reels" tight />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
        {tiers.length < 3 && (
          <button type="button" onClick={() => onChange([...tiers, { id: `tier-${Date.now()}-${tiers.length}`, name: '', priceCents: 0, deliverables: [''] }])} style={linkBtn}>
            <Plus size={14} /> Add a level
          </button>
        )}
        <button type="button" onClick={onDropToSingle} style={{ ...linkBtn, color: FAINT }}>Use one price instead</button>
      </div>
    </div>
  )
}

function ListEditor({ label, items, onAdd, onChange, onRemove, placeholder, tight }: { label: string; items: string[]; onAdd: () => void; onChange: (i: number, v: string) => void; onRemove: (i: number) => void; placeholder: string; tight?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}><TextInput value={it} onChange={(v) => onChange(i, v)} placeholder={placeholder} small={tight} /></div>
          <IconBtn title="Remove" onClick={() => onRemove(i)}><X size={16} color={FAINT} /></IconBtn>
        </div>
      ))}
      <button type="button" onClick={onAdd} style={linkBtn}><Plus size={14} /> Add a line</button>
    </div>
  )
}

/* ── primitives ─────────────────────────────────────────────────────────────────────────── */

const linkBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600, color: GREEN_DK, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2, marginBottom: 10, lineHeight: 1.4 }}>{hint}</div>}
      {!hint && <div style={{ height: 10 }} />}
      {children}
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: FAINT, marginBottom: 6 }}>{children}</div>
}

const fieldStyle = (small?: boolean): CSSProperties => ({ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${LINE}`, padding: small ? '8px 11px' : '10px 12px', fontSize: 14, color: INK, fontFamily: FONT, outline: 'none', background: '#fff' })

function TextInput({ value, onChange, placeholder, small }: { value: string; onChange: (v: string) => void; placeholder?: string; small?: boolean }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={fieldStyle(small)} />
}

function TextArea({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? 3} style={{ ...fieldStyle(), resize: 'vertical', lineHeight: 1.5 }} />
}

function NumberInput({ value, onChange, placeholder, prefix }: { value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {prefix && <span style={{ position: 'absolute', left: 11, fontSize: 13, color: MUTE, pointerEvents: 'none' }}>{prefix}</span>}
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...fieldStyle(), paddingLeft: prefix ? 12 + prefix.length * 8 : 12 }} />
    </div>
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle(), appearance: 'none', cursor: 'pointer' }}>{children}</select>
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={title} onClick={onClick} style={{ padding: 7, borderRadius: 9, background: 'none', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>{children}</button>
}

function Shell({ children }: { children: ReactNode }) {
  return <div style={{ minHeight: '100%', background: '#fafafa', fontFamily: FONT }}>{children}</div>
}

/* ── number helpers ─────────────────────────────────────────────────────────────────────── */

function dollarsToCents(v: string): number | null {
  const n = Number(v)
  return v.trim() === '' || !isFinite(n) ? null : Math.round(n * 100)
}
function wholeOrNull(v: string): number | null {
  const n = Number(v)
  return v.trim() === '' || !isFinite(n) ? null : Math.max(0, Math.round(n))
}
