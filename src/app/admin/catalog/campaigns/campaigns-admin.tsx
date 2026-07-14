'use client'
/**
 * CampaignsContentAdmin — the campaign CMS.
 *
 * Phase C1 (unchanged): the list shows all built-in store campaigns from the in-code
 * CAMPAIGN_CONTENT record with an "edited" badge where a DB override row exists;
 * clicking one opens the content-override form (every field, hero upload, per-field
 * reset, whole-campaign reset, Draft with AI). Saves via /api/admin/catalog-content/:id.
 *
 * Phase C2 (new): "New campaign" creates an entirely new, sellable, SERVICES-ONLY
 * campaign: the admin authors the words and PICKS real priced-catalog services; price,
 * what-you-get, requirements, and timeline all DERIVE from those services (the live
 * Preview shows the real derived page facts before publishing). Draft/live status,
 * edit, unpublish, and delete apply to DB campaigns only — built-ins can never be
 * deleted. Saves via /api/admin/catalog-campaigns.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CAMPAIGN_CONTENT, type CampaignContent } from '@/lib/campaigns/data/campaign-content'
import { contentFor, type ContentOverride, type ContentOverrideMap, type CampaignLane } from '@/lib/campaigns/data/content-overrides'
import {
  DB_CADENCES, DB_CARD_TYPES, DB_SHELVES, DB_STAGES,
  isBuiltinCampaignId, isValidCampaignSlug, slugFromTitle,
  priceLabelForServices,
  type DbCadence, type DbCampaign, type DbCardType, type DbShelf,
} from '@/lib/campaigns/data/db-campaigns'
import type { FunnelStage } from '@/lib/campaigns/data/create-catalog'
import { STAGE_TAG_LABEL, CREATE_CATALOG, FUNNEL_STAGES } from '@/lib/campaigns/data/create-catalog'
import { PRICED_CATALOG, type PricedService } from '@/lib/campaigns/data/priced-catalog'
import { cadenceOf, plainNameOf } from '@/lib/campaigns/catalog'
import { whatYouGetForServices, whatYouGet } from '@/lib/campaigns/builder/what-you-get'
import { requirementsForServices, requirementsFor } from '@/lib/campaigns/data/campaign-requirements'
import { shapeFor } from '@/lib/campaigns/builder/compose-plan'
import { analyticsForStages } from '@/lib/campaigns/data/stage-analytics'
import { campaignTimelineSteps } from '@/lib/campaigns/data/campaign-timeline'
import { ProductPagePreview } from '../product-page-preview'

/** A campaign's cadence chip, worded like the store, from its compose-plan duration. */
const DUR_CADENCE: Record<string, string> = { setup: 'Setup', once: 'One-time', ongoing: 'Recurring', short: 'Multi-week' }

type Faq = { q: string; a: string }
type FormState = {
  title: string; tagline: string; description: string; promise: string; why: string;
  expectation: string; heroImage: string; bestFor: string; faq: Faq[]; stages: FunnelStage[]; lanes: CampaignLane[]; requirements: string[]; whatYouGet: string[]
}

type TextKey = 'title' | 'tagline' | 'description' | 'promise' | 'why' | 'expectation' | 'bestFor'
const FIELDS: { key: TextKey; label: string; hint: string; rows?: number }[] = [
  { key: 'title', label: 'Title', hint: 'The card and product page title.' },
  { key: 'tagline', label: 'Tagline', hint: 'The one-line card subtitle.' },
  { key: 'promise', label: 'Promise', hint: 'The one-line headline under the title.' },
  { key: 'description', label: 'Description', hint: 'What this campaign is and does, 1-2 plain sentences.', rows: 3 },
  { key: 'why', label: 'Why it matters', hint: 'Why this matters for a local restaurant owner. No numbers.', rows: 3 },
  { key: 'expectation', label: 'Expectation', hint: 'One small, honest sentence about how results tend to land.', rows: 2 },
  { key: 'bestFor', label: 'Best for', hint: 'Optional: who this fits.' },
]

function formFromOverride(o: ContentOverride | undefined): FormState {
  return {
    title: o?.title ?? '', tagline: o?.tagline ?? '', description: o?.description ?? '',
    promise: o?.promise ?? '', why: o?.why ?? '', expectation: o?.expectation ?? '',
    heroImage: o?.heroImage ?? '', bestFor: o?.bestFor ?? '',
    faq: (o?.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
    stages: [...(o?.stages ?? [])],
    lanes: (o?.lanes ?? []).map((l) => ({ ...l })),
    requirements: [...(o?.requirements ?? [])],
    whatYouGet: [...(o?.whatYouGet ?? [])],
  }
}

/* ── Phase C2: the DB-campaign form ─────────────────────────────────────── */

type DbForm = FormState & {
  id: string
  type: DbCardType
  cad: DbCadence
  shelf: DbShelf
  stages: FunnelStage[]
  serviceIds: string[]
  addonServiceIds: string[]
  status: 'draft' | 'live'
}

function emptyDbForm(): DbForm {
  return {
    id: '', title: '', tagline: '', description: '', promise: '', why: '',
    expectation: '', heroImage: '', bestFor: '', faq: [], lanes: [], requirements: [], whatYouGet: [],
    type: 'task', cad: 'once', shelf: 'aware', stages: [],
    serviceIds: [], addonServiceIds: [], status: 'draft',
  }
}

function dbFormFrom(c: DbCampaign): DbForm {
  return {
    id: c.id, title: c.title, tagline: c.tagline, description: c.description,
    promise: c.promise, why: c.why, expectation: c.expectation,
    heroImage: c.heroImage ?? '', bestFor: c.bestFor ?? '',
    faq: (c.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
    lanes: [], requirements: [], whatYouGet: [],
    type: c.type, cad: c.cad, shelf: c.shelf, stages: [...c.stages],
    serviceIds: [...c.serviceIds], addonServiceIds: [...c.addonServiceIds],
    status: c.status,
  }
}

/** Plain labels for the closed vocab sets (owner-store words, not internal ids). */
const TYPE_LABEL: Record<DbCardType, string> = { plan: 'Plan', content: 'Content', email: 'Email', task: 'Task', automation: 'Automation' }
const CAD_LABEL: Record<DbCadence, string> = { once: 'One-time', recurring: 'Recurring', auto: 'Automatic', setup: 'Setup', group: 'Multi-step' }
const SHELF_LABEL: Record<DbShelf, string> = {
  aware: 'Get discovered', interest: 'Create interest', actions: 'Make it easy to order',
  orders: 'Fill your seats', back: 'Bring guests back', programs: 'Full campaigns', content: 'Just need content',
}
const SECTION_LABEL: Record<string, string> = {
  foundation: 'Foundations', awareness: 'Get discovered', capture: 'Capture guests',
  convert: 'Convert', nurture: 'Nurture', retain: 'Bring guests back',
  winback: 'Win back', advocate: 'Advocates', anticipation: 'Anticipation',
}

/** Built-in campaigns grouped by their primary funnel stage — the same order the owner sees
 *  everywhere (the home funnel), so the list reads like the customer journey. */
const STAGE_GROUPS: { stage: FunnelStage; label: string }[] = [
  { stage: 'aware', label: 'Get discovered' },
  { stage: 'interest', label: 'Create interest' },
  { stage: 'actions', label: 'Make it easy to order' },
  { stage: 'orders', label: 'Fill your seats' },
  { stage: 'back', label: 'Bring guests back' },
]
const primaryStage = (id: string): FunnelStage => CREATE_CATALOG.find((c) => c.id === id)?.stages[0] ?? 'aware'

/** One service's real price, worded like the store ("$195 + $115/mo", "$85/mo", "$70 each"). */
function servicePriceLabel(s: PricedService): string {
  const parts: string[] = []
  for (const p of s.prices) {
    if (p.kind === 'monthly') parts.push(`$${p.amount.toLocaleString()}/mo`)
    else if (p.kind === 'per-unit') parts.push(`$${p.amount.toLocaleString()} per ${p.unit ?? 'unit'}`)
    else parts.push(`$${p.amount.toLocaleString()}`)
  }
  return parts.join(' + ')
}

const isRecurringCapable = (s: PricedService): boolean => cadenceOf(s).cadence.kind === 'recurring'

export function CampaignsContentAdmin({ initialOverrides, initialCampaigns }: { initialOverrides: ContentOverrideMap; initialCampaigns: DbCampaign[] }) {
  const [overrides, setOverrides] = useState<ContentOverrideMap>(initialOverrides)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  // page-builder: which preview section the owner clicked, so its editor panel highlights + scrolls
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [laneTab, setLaneTab] = useState(0)
  const [q, setQ] = useState('') // search filter for the campaign lists
  const [busy, setBusy] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)

  // Phase C2 state: the admin-created campaigns + the create/edit form.
  const [campaigns, setCampaigns] = useState<DbCampaign[]>(initialCampaigns)
  const [dbForm, setDbForm] = useState<DbForm | null>(null)
  const [dbMode, setDbMode] = useState<'create' | 'edit'>('create')
  const [slugTouched, setSlugTouched] = useState(false)

  const ids = useMemo(() => Object.keys(CAMPAIGN_CONTENT), [])
  const flash = (msg: string, bad = false) => { setToast({ msg, bad }); setTimeout(() => setToast(null), 3600) }

  const open = (id: string) => { setDbForm(null); setEditId(id); setForm(formFromOverride(overrides[id])) }
  const close = () => { setEditId(null); setForm(null) }
  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))

  const openDbCreate = () => { close(); setDbMode('create'); setSlugTouched(false); setDbForm(emptyDbForm()) }
  const openDbEdit = (c: DbCampaign) => { close(); setDbMode('edit'); setSlugTouched(true); setDbForm(dbFormFrom(c)) }
  const closeDb = () => setDbForm(null)
  const setDb = (patch: Partial<DbForm>) => setDbForm((f) => (f ? { ...f, ...patch } : f))

  async function save() {
    if (!editId || !form) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/catalog-content/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { flash(j?.error || 'Save failed', true); return }
      setOverrides((m) => {
        const next = { ...m }
        const o = (j?.override ?? {}) as ContentOverride
        if (Object.keys(o).length) next[editId] = o; else delete next[editId]
        return next
      })
      flash('Saved. The store picks this up within about 30 minutes.')
      close()
    } finally { setBusy(false) }
  }

  async function resetAll() {
    if (!editId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/catalog-content/${editId}`, { method: 'DELETE' })
      const j = await res.json().catch(() => null)
      if (!res.ok) { flash(j?.error || 'Reset failed', true); return }
      setOverrides((m) => { const next = { ...m }; delete next[editId]; return next })
      flash('Back to the code defaults.')
      close()
    } finally { setBusy(false) }
  }

  async function draftWithAi() {
    // Built-in override form: ground in the campaign's own composed services.
    // DB-campaign form: ground in the admin's CHOSEN services (title + serviceIds).
    const forDb = !!dbForm
    if (!forDb && !editId) return
    if (forDb && (!dbForm?.title.trim() || !dbForm.serviceIds.length)) {
      flash('Give it a title and pick at least one service first, so the draft is grounded.', true)
      return
    }
    setDrafting(true)
    try {
      const body = forDb
        ? { itemId: dbForm!.id || 'new-campaign', title: dbForm!.title, tagline: dbForm!.tagline, serviceIds: dbForm!.serviceIds }
        : { itemId: editId }
      const res = await fetch('/api/admin/catalog-content/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.draft) { flash(j?.error || 'Could not write a draft right now.', true); return }
      if (forDb) setDb({ description: j.draft.description, why: j.draft.why, expectation: j.draft.expectation })
      else set({ description: j.draft.description, why: j.draft.why, expectation: j.draft.expectation })
      flash('Draft filled in. Review it, edit it, then save.')
    } finally { setDrafting(false) }
  }

  async function uploadHero(file: File) {
    const forDb = !!dbForm
    const uploadId = forDb ? (dbForm!.id || slugFromTitle(dbForm!.title) || 'new-campaign') : editId
    if (!uploadId) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/admin/catalog-content/upload?itemId=${uploadId}`, { method: 'POST', body: fd })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.url) { flash(j?.error || 'Upload failed', true); return }
      if (forDb) setDb({ heroImage: j.url as string })
      else set({ heroImage: j.url as string })
      flash('Image uploaded. Save to put it on the page.')
    } finally { setUploading(false) }
  }

  /* ── Phase C2 actions ── */

  const dbSlugError = (() => {
    if (!dbForm || dbMode !== 'create') return null
    const id = dbForm.id
    if (!id) return null
    if (!isValidCampaignSlug(id)) return 'Lowercase letters, numbers, and dashes only (2 to 60 characters).'
    if (isBuiltinCampaignId(id)) return 'That id belongs to a built-in campaign. Pick another.'
    if (campaigns.some((c) => c.id === id)) return 'You already have a campaign with that id.'
    return null
  })()

  async function saveDbCampaign(statusOverride?: 'draft' | 'live') {
    if (!dbForm) return
    const status = statusOverride ?? dbForm.status
    const body = { ...dbForm, status, heroImage: dbForm.heroImage, bestFor: dbForm.bestFor }
    setBusy(true)
    try {
      const res = dbMode === 'create'
        ? await fetch('/api/admin/catalog-campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(`/api/admin/catalog-campaigns/${dbForm.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.campaign) { flash(j?.error || 'Save failed', true); return }
      const saved = j.campaign as DbCampaign
      setCampaigns((list) => {
        const rest = list.filter((c) => c.id !== saved.id)
        return [saved, ...rest]
      })
      flash(saved.status === 'live'
        ? 'Saved and live. Owners see it within about 30 minutes.'
        : 'Saved as a draft. Owners will not see it until you publish.')
      closeDb()
    } finally { setBusy(false) }
  }

  async function deleteDbCampaign() {
    if (!dbForm || dbMode !== 'edit') return
    if (!window.confirm(`Delete "${dbForm.title || dbForm.id}"? Owners will stop seeing it. Campaigns they already bought are untouched.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/catalog-campaigns/${dbForm.id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => null)
      if (!res.ok) { flash(j?.error || 'Delete failed', true); return }
      setCampaigns((list) => list.filter((c) => c.id !== dbForm.id))
      flash('Deleted.')
      closeDb()
    } finally { setBusy(false) }
  }

  const base: CampaignContent | null = editId ? CAMPAIGN_CONTENT[editId as keyof typeof CAMPAIGN_CONTENT] ?? null : null

  // The priced catalog grouped for the service picker, by section, in catalog order.
  const serviceGroups = useMemo(() => {
    const map = new Map<string, PricedService[]>()
    for (const s of PRICED_CATALOG) {
      const arr = map.get(s.section) ?? []
      arr.push(s)
      map.set(s.section, arr)
    }
    return [...map.entries()]
  }, [])
  const recurringServices = useMemo(() => PRICED_CATALOG.filter(isRecurringCapable), [])

  // Live derived preview for the current service picks — the REAL page facts (same
  // derivations the store renders from), so the admin sees them before publishing.
  const preview = useMemo(() => {
    if (!dbForm) return null
    return {
      price: priceLabelForServices(dbForm.serviceIds),
      rows: whatYouGetForServices(dbForm.serviceIds),
      requirements: requirementsForServices(dbForm.serviceIds),
    }
  }, [dbForm])

  // Analytics the new campaign is built to lift — derived from its stages, same rule as the store.
  const dbAnalytics = useMemo(() => (dbForm ? analyticsForStages(dbForm.id || null, dbForm.stages) : []), [dbForm])

  // A built-in campaign's REAL derived page facts (stages, price, what-you-get, requirements,
  // analytics, cadence) — the same derivations the store renders, so the faithful preview of a
  // built-in like "gbp" matches its live product page. Words come from the edit form (below).
  const builtinFacts = useMemo(() => {
    if (!editId) return null
    const stages = CREATE_CATALOG.find((c) => c.id === editId)?.stages ?? []
    const shape = shapeFor(editId)
    const price = priceLabelForServices(shape?.services ?? []) ?? ''
    // gbp is the one card with the 3-lane "how it's done" picker + a Google-listing product shot.
    const isGbp = editId === 'gbp'
    return {
      stages,
      price,
      rows: whatYouGet(editId)[0]?.rows ?? [],
      requirements: requirementsFor(editId),
      analytics: analyticsForStages(editId, stages),
      cadence: shape ? DUR_CADENCE[shape.dur] : undefined,
      googleTile: isGbp,
      lanes: isGbp
        ? [{ label: "I'll do it", price: 'Free' }, { label: 'Apnosh AI', price: 'Included', pro: true }, { label: 'Apnosh', price: price || '$100' }]
        : undefined,
      laneDetail: isGbp ? 'We fix it all for you.' : undefined,
      timeline: campaignTimelineSteps(editId, shape?.services ?? []),
    }
  }, [editId])

  const inputCls = 'w-full text-[13.5px] text-ink rounded-lg border border-ink-6 bg-white px-3 py-2 placeholder:text-ink-4 focus:outline-none focus:border-brand'
  const chipCls = (on: boolean) => 'text-[12px] font-medium rounded-full px-3 py-1.5 border ' + (on ? 'bg-brand text-white border-brand' : 'bg-white text-ink-2 border-ink-6 hover:border-ink-4')

  // ── the lanes being edited: the saved override, else seeded from the card's built-in lanes ──
  const laneList: CampaignLane[] = form
    ? (form.lanes.length ? form.lanes : (builtinFacts?.lanes ?? []).map((l) => ({ label: l.label, price: l.price, pro: !!l.pro, detail: '' })))
    : []
  const laneIdx = Math.min(laneTab, Math.max(0, laneList.length - 1))
  const setLane = (i: number, patch: Partial<CampaignLane>) => set({ lanes: laneList.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const addLane = () => { const arr = [...laneList, { label: 'New way', price: 'Free', pro: false, detail: '' }]; set({ lanes: arr }); setLaneTab(arr.length - 1) }
  const deleteLane = (i: number) => { const arr = laneList.filter((_, j) => j !== i); set({ lanes: arr }); setLaneTab(Math.max(0, i - 1)) }

  // ── "what we'll need from you": the saved override, else seeded from the derived list ──
  const reqList: string[] = form ? (form.requirements.length ? form.requirements : (builtinFacts?.requirements ?? [])) : []
  const setReq = (i: number, v: string) => set({ requirements: reqList.map((r, j) => (j === i ? v : r)) })
  const addReq = () => set({ requirements: [...reqList, ''] })
  const delReq = (i: number) => set({ requirements: reqList.filter((_, j) => j !== i) })

  // ── "what you get": the saved override, else seeded from the derived list ──
  const getList: string[] = form ? (form.whatYouGet.length ? form.whatYouGet : (builtinFacts?.rows ?? [])) : []
  const setGet = (i: number, v: string) => set({ whatYouGet: getList.map((r, j) => (j === i ? v : r)) })
  const addGet = () => set({ whatYouGet: [...getList, ''] })
  const delGet = (i: number) => set({ whatYouGet: getList.filter((_, j) => j !== i) })

  // ── page-builder: map a clicked preview section to its left-hand editor panel + scroll to it ──
  const EDITABLE_PANELS = ['hero', 'description', 'why', 'lanes', 'requirements', 'get']
  const panelOf = (section: string | null) => (section && EDITABLE_PANELS.includes(section) ? section : section ? 'derived' : null)
  const activePanel = panelOf(activeSection)
  const gotoSection = (key: string) => {
    setActiveSection(key)
    if (typeof document !== 'undefined') document.getElementById('sec-' + panelOf(key))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const panelCls = (id: string) => 'rounded-xl border p-4 lg:p-5 scroll-mt-24 transition ' + (activePanel === id ? 'border-brand ring-4 ring-brand/10 bg-white' : 'border-ink-6 bg-white')
  const DERIVED_NOTE: Record<string, string> = {
    timeline: 'The delivery dates come from how long this campaign’s services take. Change the services to change the dates.',
    analytics: 'The tracked metrics come from the funnel stages this campaign moves.',
    footer: 'The price is the total of the services this campaign includes.',
  }
  // one content-field editor (label, reset-to-default, ghost default), reused across panels
  const renderField = (key: TextKey) => {
    if (!form || !base) return null
    const meta = FIELDS.find((f) => f.key === key)!
    const defaultVal = (base[key] ?? '') as string
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[12px] font-semibold text-ink">{meta.label}</label>
          {form[key] !== '' && <button onClick={() => set({ [key]: '' } as Partial<FormState>)} className="text-[11px] text-ink-3 hover:text-ink">Use default</button>}
        </div>
        {meta.rows ? (
          <textarea rows={meta.rows} value={form[key]} placeholder={defaultVal || meta.hint} onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)} className={inputCls} />
        ) : (
          <input type="text" value={form[key]} placeholder={defaultVal || meta.hint} onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)} className={inputCls} />
        )}
        <p className="text-[11px] text-ink-4 mt-1">{meta.hint}</p>
      </div>
    )
  }

  const norm = q.trim().toLowerCase()
  const matchText = (...parts: (string | undefined)[]) => !norm || parts.some((p) => (p ?? '').toLowerCase().includes(norm))

  return (
    <div className="max-w-[980px] mx-auto px-4 lg:px-6 pt-6 pb-24 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">Campaign content</h1>
          <p className="text-[13px] text-ink-3 mt-1">
            {ids.length} built-in campaigns{campaigns.length ? ` + ${campaigns.length} of yours` : ''}. Edit the words a campaign sells with, or create a new one from real services.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-bg-2 p-1">
          <Link href="/admin/catalog" className="text-[12.5px] font-medium rounded-md px-3 py-1.5 text-ink-3 hover:text-ink">Services</Link>
          <span className="text-[12.5px] font-semibold rounded-md px-3 py-1.5 bg-white text-ink shadow-sm">Campaigns</span>
        </div>
      </div>

      {!editId && !dbForm && (() => {
        const filteredDb = campaigns.filter((c) => matchText(c.title, c.id))
        const editedCount = ids.filter((id) => !!overrides[id] && Object.keys(overrides[id]).length > 0).length
        return (
        <>
          {/* Search across both lists */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns by name…" className="w-full text-[13.5px] text-ink rounded-lg border border-ink-6 bg-white pl-9 pr-8 py-2.5 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
            {q && <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink text-[15px]">✕</button>}
          </div>

          {/* Phase C2: admin-created campaigns — create, edit, publish state at a glance. */}
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-ink-6 bg-bg-2/40">
              <div>
                <div className="text-[13px] font-semibold text-ink">Your campaigns{filteredDb.length ? ` · ${filteredDb.length}` : ''}</div>
                <div className="text-[11px] text-ink-4">Built from real services. Price, deliverables, and timeline derive from what you pick.</div>
              </div>
              <button onClick={openDbCreate} className="text-[12.5px] font-semibold rounded-lg px-3 py-2 bg-brand text-white shrink-0">New campaign</button>
            </div>
            {campaigns.length === 0 && (
              <p className="text-[12.5px] text-ink-4 px-3 py-3">None yet. Create one and it appears on the owner store when you publish it.</p>
            )}
            {campaigns.length > 0 && filteredDb.length === 0 && (
              <p className="text-[12.5px] text-ink-4 px-3 py-3">No matches in your campaigns.</p>
            )}
            {filteredDb.map((c) => (
              <button key={c.id} onClick={() => openDbEdit(c)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                {c.heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.heroImage} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-bg-2 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium text-ink truncate">{c.title}</div>
                  <div className="text-[11px] text-ink-4 truncate">
                    <span className="font-mono">{c.id}</span> · {SHELF_LABEL[c.shelf]} · {c.serviceIds.length} {c.serviceIds.length === 1 ? 'service' : 'services'} · {priceLabelForServices(c.serviceIds) ?? 'no price'}
                  </div>
                </div>
                {c.status === 'live' ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5 shrink-0">Live</span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-ink-3 bg-bg-2 rounded px-1.5 py-0.5 shrink-0">Draft</span>
                )}
              </button>
            ))}
          </div>

          {/* Phase C1: built-in campaigns, grouped by funnel stage (the customer journey). */}
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-ink-6 bg-bg-2/40">
              <div className="text-[13px] font-semibold text-ink">Built-in campaigns{editedCount ? ` · ${editedCount} edited` : ''}</div>
              <div className="text-[11px] text-ink-4">Grouped by the stage of the funnel they move. Edit the words and photo; empty fields keep the default.</div>
            </div>
            {(() => {
              const rendered = STAGE_GROUPS.map((g) => {
                const groupIds = ids.filter((id) => primaryStage(id) === g.stage && matchText(contentFor(id, overrides)!.title, contentFor(id, overrides)!.tagline, id))
                if (!groupIds.length) return null
                return (
                  <div key={g.stage}>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-bg-2/40 border-b border-ink-6">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-3">{g.label}</span>
                      <span className="text-[10.5px] font-medium text-ink-4">{groupIds.length}</span>
                    </div>
                    {groupIds.map((id) => {
                      const merged = contentFor(id, overrides)!
                      const edited = !!overrides[id] && Object.keys(overrides[id]).length > 0
                      return (
                        <button key={id} onClick={() => open(id)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-ink-6 hover:bg-bg-2/50">
                          {merged.heroImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={merged.heroImage} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-bg-2 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[13.5px] font-medium text-ink truncate">{merged.title}</div>
                            <div className="text-[11px] text-ink-4 truncate"><span className="font-mono">{id}</span> · {merged.tagline}</div>
                          </div>
                          {edited && <span className="text-[10px] font-bold uppercase tracking-wide text-brand-dark bg-brand/10 rounded px-1.5 py-0.5 shrink-0">Edited</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              }).filter(Boolean)
              return rendered.length ? rendered : <p className="text-[12.5px] text-ink-4 px-3 py-3">No campaigns match &ldquo;{q}&rdquo;.</p>
            })()}
          </div>
        </>
        )
      })()}

      {/* ── Phase C2: create / edit an admin campaign ── */}
      {dbForm && (
        <div className="bg-white rounded-xl border border-ink-6 p-4 lg:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <button onClick={closeDb} className="text-[12px] font-medium text-ink-3 hover:text-ink">&larr; All campaigns</button>
              <h2 className="text-[19px] font-semibold text-ink mt-1">{dbMode === 'create' ? 'New campaign' : (dbForm.title || dbForm.id)}</h2>
              {dbMode === 'edit' && <p className="text-[12px] text-ink-4 font-mono">{dbForm.id}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={draftWithAi} disabled={drafting || busy} className="text-[12.5px] font-semibold rounded-lg px-3 py-2 bg-bg-2 text-ink hover:bg-ink-7">
                {drafting ? 'Writing…' : 'Draft with AI'}
              </button>
              {dbMode === 'edit' && (
                <button onClick={deleteDbCampaign} disabled={busy} className="text-[12.5px] font-medium rounded-lg px-3 py-2 text-red-700 hover:bg-red-50">
                  Delete
                </button>
              )}
              {dbMode === 'edit' && dbForm.status === 'live' && (
                <button onClick={() => saveDbCampaign('draft')} disabled={busy} className="text-[12.5px] font-semibold rounded-lg px-3 py-2 bg-bg-2 text-ink hover:bg-ink-7">
                  Unpublish
                </button>
              )}
              <button onClick={() => saveDbCampaign('draft')} disabled={busy} className="text-[12.5px] font-semibold rounded-lg px-3 py-2 bg-bg-2 text-ink hover:bg-ink-7">
                {busy ? 'Working…' : 'Save draft'}
              </button>
              <button onClick={() => saveDbCampaign('live')} disabled={busy} className="text-[13px] font-semibold rounded-lg px-4 py-2 bg-brand text-white">
                {busy ? 'Working…' : dbForm.status === 'live' ? 'Save (stays live)' : 'Publish live'}
              </button>
            </div>
          </div>
          <p className="text-[12px] text-ink-3 -mt-2">
            The campaign is its services. Pick real ones below; price, what you get, what we need, and timing all come from them. Going live needs every core field filled and at least one service.
          </p>

          {/* Title + slug */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[12px] font-semibold text-ink block mb-1.5">Title</label>
              <input type="text" value={dbForm.title}
                onChange={(e) => {
                  const title = e.target.value
                  setDb(slugTouched ? { title } : { title, id: slugFromTitle(title) })
                }}
                placeholder="Like: Get on the food blogs" className={inputCls} />
              <p className="text-[11px] text-ink-4 mt-1">The card and product page title.</p>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-ink block mb-1.5">Id (slug)</label>
              <input type="text" value={dbForm.id} disabled={dbMode === 'edit'}
                onChange={(e) => { setSlugTouched(true); setDb({ id: e.target.value.toLowerCase() }) }}
                placeholder="get-on-the-food-blogs" className={inputCls + (dbMode === 'edit' ? ' opacity-60' : '')} />
              <p className={'text-[11px] mt-1 ' + (dbSlugError ? 'text-red-700' : 'text-ink-4')}>
                {dbSlugError ?? (dbMode === 'edit' ? 'Ids never change once created.' : 'Auto-made from the title. Must not match a built-in campaign.')}
              </p>
            </div>
          </div>

          {/* Card pickers: type / cadence / shelf / stages */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-[12px] font-semibold text-ink block mb-1.5">Card type</label>
              <select value={dbForm.type} onChange={(e) => setDb({ type: e.target.value as DbCardType })} className={inputCls}>
                {DB_CARD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              <p className="text-[11px] text-ink-4 mt-1">Sets the card color and art style.</p>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-ink block mb-1.5">Cadence</label>
              <select value={dbForm.cad} onChange={(e) => setDb({ cad: e.target.value as DbCadence })} className={inputCls}>
                {DB_CADENCES.map((c) => <option key={c} value={c}>{CAD_LABEL[c]}</option>)}
              </select>
              <p className="text-[11px] text-ink-4 mt-1">The cadence chip on the card.</p>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-ink block mb-1.5">Store shelf</label>
              <select value={dbForm.shelf} onChange={(e) => setDb({ shelf: e.target.value as DbShelf })} className={inputCls}>
                {DB_SHELVES.map((s) => <option key={s} value={s}>{SHELF_LABEL[s]}</option>)}
              </select>
              <p className="text-[11px] text-ink-4 mt-1">The row it appears on in the store.</p>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-ink block mb-1.5">Funnel stages it moves</label>
            <div className="flex flex-wrap gap-2">
              {DB_STAGES.map((s) => {
                const on = dbForm.stages.includes(s)
                return (
                  <button key={s} type="button" onClick={() => setDb({ stages: on ? dbForm.stages.filter((x) => x !== s) : [...dbForm.stages, s] })} className={chipCls(on)}>
                    {STAGE_TAG_LABEL[s]}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-ink-4 mt-1">Shown as tags so owners see which of their numbers this moves.</p>
          </div>

          {/* Service picker — the campaign's real composition */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-[12px] font-semibold text-ink">Services included</label>
              <span className="text-[11px] text-ink-4">{dbForm.serviceIds.length} picked</span>
            </div>
            <div className="rounded-lg border border-ink-6 max-h-[340px] overflow-y-auto divide-y divide-ink-6">
              {serviceGroups.map(([section, services]) => (
                <div key={section}>
                  <div className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-3 bg-bg-2/60 sticky top-0">{SECTION_LABEL[section] ?? section}</div>
                  {services.map((s) => {
                    const on = dbForm.serviceIds.includes(s.id)
                    return (
                      <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-bg-2/40 cursor-pointer">
                        <input type="checkbox" checked={on}
                          onChange={() => setDb({
                            serviceIds: on ? dbForm.serviceIds.filter((x) => x !== s.id) : [...dbForm.serviceIds, s.id],
                            // A service can be included OR an add-on, never both.
                            addonServiceIds: dbForm.addonServiceIds.filter((x) => x !== s.id),
                          })} />
                        <span className="flex-1 min-w-0">
                          <span className="text-[13px] text-ink">{plainNameOf(s)}</span>
                          <span className="text-[11px] text-ink-4 block truncate">{s.name}</span>
                        </span>
                        <span className="text-[12px] font-medium text-ink-2 shrink-0">{servicePriceLabel(s)}</span>
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-ink-4 mt-1">Every price is the real catalog price. There is no way to type a price by hand.</p>
          </div>

          {/* Add-on picker — recurring-capable services offered as PDP extras */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-[12px] font-semibold text-ink">Optional add-ons</label>
              <span className="text-[11px] text-ink-4">{dbForm.addonServiceIds.length} picked</span>
            </div>
            <div className="rounded-lg border border-ink-6 max-h-[200px] overflow-y-auto">
              {recurringServices.filter((s) => !dbForm.serviceIds.includes(s.id)).map((s) => {
                const on = dbForm.addonServiceIds.includes(s.id)
                return (
                  <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-bg-2/40 cursor-pointer border-b border-ink-6 last:border-0">
                    <input type="checkbox" checked={on}
                      onChange={() => setDb({ addonServiceIds: on ? dbForm.addonServiceIds.filter((x) => x !== s.id) : [...dbForm.addonServiceIds, s.id] })} />
                    <span className="flex-1 min-w-0">
                      <span className="text-[13px] text-ink">{plainNameOf(s)}</span>
                      <span className="text-[11px] text-ink-4 block truncate">{s.name}</span>
                    </span>
                    <span className="text-[12px] font-medium text-ink-2 shrink-0">{servicePriceLabel(s)}</span>
                  </label>
                )
              })}
            </div>
            <p className="text-[11px] text-ink-4 mt-1">Owners can toggle these on the product page. Recurring services only, like the built-in add-ons.</p>
          </div>

          {/* PREVIEW — the faithful product page, exactly how the owner will see it. Words come from
              the fields; price / what you get / what we need / analytics all derive from the picks. */}
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-[12px] font-bold uppercase tracking-wide text-brand-dark">Live preview · how the customer sees it</div>
              <div className="text-[13px] font-medium text-ink-3">Updates as you edit</div>
            </div>
            <div className="max-w-[420px] mx-auto">
              <ProductPagePreview
                eyebrow={dbForm.title}
                headline={dbForm.promise}
                description={dbForm.description}
                why={dbForm.why}
                stages={dbForm.stages}
                cadenceLabel={CAD_LABEL[dbForm.cad]}
                priceLabel={preview?.price ?? ''}
                whatYouGet={preview?.rows ?? []}
                requirements={preview?.requirements ?? []}
                analytics={dbAnalytics}
                heroImage={dbForm.heroImage || null}
                timeline={campaignTimelineSteps(dbForm.id || null, dbForm.serviceIds)}
              />
            </div>
            <p className="text-[11px] text-ink-4 mt-3 text-center">This is exactly what the store page shows. Pick services to fill price, what you get, and what we need.</p>
          </div>

          {/* Hero image */}
          <div>
            <div className="text-[12px] font-semibold text-ink mb-1.5">Hero image</div>
            <div className="flex items-center gap-3">
              {dbForm.heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dbForm.heroImage} alt="Hero" className="w-24 h-24 rounded-2xl object-cover border border-ink-6" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-bg-2 border border-ink-6 flex items-center justify-center text-[11px] text-ink-4 text-center px-2">
                  No photo (drawn art shows)
                </div>
              )}
              <div className="space-y-1.5">
                <label className={'inline-block text-[12.5px] font-semibold rounded-lg px-3 py-2 cursor-pointer ' + (uploading ? 'bg-bg-2 text-ink-3' : 'bg-bg-2 text-ink hover:bg-ink-7')}>
                  {uploading ? 'Uploading…' : 'Upload photo'}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadHero(f); e.target.value = '' }} />
                </label>
                {dbForm.heroImage && (
                  <button onClick={() => setDb({ heroImage: '' })} className="block text-[12px] text-ink-3 hover:text-ink">Remove</button>
                )}
                <p className="text-[11px] text-ink-4">JPG, PNG or WebP, up to 8MB.</p>
              </div>
            </div>
          </div>

          {/* Content fields (title handled above) */}
          {FIELDS.filter((f) => f.key !== 'title').map(({ key, label, hint, rows }) => (
            <div key={key}>
              <label className="text-[12px] font-semibold text-ink block mb-1.5">{label}</label>
              {rows ? (
                <textarea rows={rows} value={dbForm[key]} placeholder={hint}
                  onChange={(e) => setDb({ [key]: e.target.value } as Partial<DbForm>)} className={inputCls} />
              ) : (
                <input type="text" value={dbForm[key]} placeholder={hint}
                  onChange={(e) => setDb({ [key]: e.target.value } as Partial<DbForm>)} className={inputCls} />
              )}
              <p className="text-[11px] text-ink-4 mt-1">{hint}</p>
            </div>
          ))}

          {/* FAQ */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] font-semibold text-ink">FAQ</label>
              <button onClick={() => setDb({ faq: [...dbForm.faq, { q: '', a: '' }] })} className="text-[11px] font-medium text-brand-dark hover:underline">Add a question</button>
            </div>
            {dbForm.faq.length === 0 && <p className="text-[12px] text-ink-4">No questions yet.</p>}
            <div className="space-y-2">
              {dbForm.faq.map((f, i) => (
                <div key={i} className="rounded-lg border border-ink-6 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input type="text" value={f.q} placeholder="Question"
                      onChange={(e) => setDb({ faq: dbForm.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })}
                      className="flex-1 text-[13px] text-ink rounded-md border border-ink-6 px-2.5 py-1.5 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
                    <button onClick={() => setDb({ faq: dbForm.faq.filter((_, j) => j !== i) })} className="text-[11px] text-red-700 hover:underline shrink-0">Remove</button>
                  </div>
                  <textarea rows={2} value={f.a} placeholder="Answer"
                    onChange={(e) => setDb({ faq: dbForm.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
                    className="w-full text-[13px] text-ink rounded-md border border-ink-6 px-2.5 py-1.5 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Phase C1: the built-in override editor — a two-pane page builder ── */}
      {editId && form && base && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <button onClick={() => { close(); setActiveSection(null) }} className="text-[12px] font-medium text-ink-3 hover:text-ink">&larr; All campaigns</button>
              <h2 className="text-[19px] font-semibold text-ink mt-1">{base.title}</h2>
              <p className="text-[12px] text-ink-4 font-mono">{editId}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={draftWithAi} disabled={drafting || busy} className="text-[12.5px] font-semibold rounded-lg px-3 py-2 bg-bg-2 text-ink hover:bg-ink-7">
                {drafting ? 'Writing…' : 'Draft with AI'}
              </button>
              <button onClick={resetAll} disabled={busy} className="text-[12.5px] font-medium rounded-lg px-3 py-2 text-red-700 hover:bg-red-50">
                Reset campaign
              </button>
              <button onClick={save} disabled={busy} className="text-[13px] font-semibold rounded-lg px-4 py-2 bg-brand text-white">
                {busy ? 'Working…' : 'Save'}
              </button>
            </div>
          </div>
          <p className="text-[12px] text-ink-3 -mt-1">
            Click any part of the page on the right to edit it here. Empty fields keep the code default.
          </p>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
            {/* LEFT — the section editors */}
            <div className="space-y-4 order-2 lg:order-1">
              {/* Hero: eyebrow (name), headline (promise), photo */}
              <div id="sec-hero" className={panelCls('hero')}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[13.5px] font-semibold text-ink">Hero</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-brand-dark bg-brand/10 rounded px-1.5 py-0.5">Top of the page</span>
                </div>
                <div className="space-y-3.5">
                  {/* Tags — the funnel chips at the top of the page */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[12px] font-semibold text-ink">Tags</label>
                      {form.stages.length > 0 && <button onClick={() => set({ stages: [] })} className="text-[11px] text-ink-3 hover:text-ink">Use default</button>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {FUNNEL_STAGES.map((s) => {
                        const cur = form.stages.length ? form.stages : (builtinFacts?.stages ?? [])
                        const on = cur.includes(s)
                        return (
                          <button key={s} type="button"
                            onClick={() => { const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]; set({ stages: FUNNEL_STAGES.filter((x) => next.includes(x)) }) }}
                            className={chipCls(on)}>
                            {STAGE_TAG_LABEL[s]}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-ink-4 mt-1">Click to add or remove. Empty keeps the campaign&apos;s built-in tags.</p>
                  </div>
                  {renderField('title')}
                  {renderField('promise')}
                  {/* Photo */}
                  <div>
                    <div className="text-[12px] font-semibold text-ink mb-1.5">Photo</div>
                    <div className="flex items-center gap-3">
                      {form.heroImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={form.heroImage} alt="Hero" className="w-20 h-20 rounded-2xl object-cover border border-ink-6" />
                      ) : (
                        <div className="w-20 h-20 rounded-2xl bg-bg-2 border border-ink-6 flex items-center justify-center text-[10px] text-ink-4 text-center px-2">
                          {base.heroImage ? 'Default photo' : 'Drawn art'}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className={'inline-block text-[12.5px] font-semibold rounded-lg px-3 py-2 cursor-pointer ' + (uploading ? 'bg-bg-2 text-ink-3' : 'bg-bg-2 text-ink hover:bg-ink-7')}>
                          {uploading ? 'Uploading…' : 'Upload photo'}
                          <input type="file" accept="image/*" className="hidden" disabled={uploading}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadHero(f); e.target.value = '' }} />
                        </label>
                        {form.heroImage && <button onClick={() => set({ heroImage: '' })} className="block text-[12px] text-ink-3 hover:text-ink">Use default</button>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div id="sec-description" className={panelCls('description')}>
                {renderField('description')}
              </div>

              {/* Why it matters */}
              <div id="sec-why" className={panelCls('why')}>
                {renderField('why')}
              </div>

              {/* How it's done — a tabbed lane editor (edit each tab, switch, add, delete) */}
              <div id="sec-lanes" className={panelCls('lanes')}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[13.5px] font-semibold text-ink">How it&apos;s done</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">Draft · not on the store yet</span>
                </div>
                {/* the lane tabs */}
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {laneList.map((l, i) => (
                    <button key={i} type="button" onClick={() => setLaneTab(i)}
                      className={'text-[12.5px] font-medium rounded-lg px-3 py-1.5 border transition ' + (i === laneIdx ? 'bg-brand text-white border-brand' : 'bg-white text-ink-2 border-ink-6 hover:border-ink-4')}>
                      {l.label || 'Untitled'}
                    </button>
                  ))}
                  <button type="button" onClick={addLane} className="text-[12.5px] font-semibold rounded-lg px-2.5 py-1.5 text-brand-dark border border-dashed border-brand/40 hover:bg-brand/5">+ Add</button>
                </div>
                {/* the selected lane's fields */}
                {laneList[laneIdx] ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[12px] font-semibold text-ink block mb-1.5">Tab label</label>
                      <input type="text" value={laneList[laneIdx].label} onChange={(e) => setLane(laneIdx, { label: e.target.value })} placeholder="e.g. Apnosh does it" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[12px] font-semibold text-ink block mb-1.5">Price</label>
                        <input type="text" value={laneList[laneIdx].price} onChange={(e) => setLane(laneIdx, { price: e.target.value })} placeholder="$100 · Free · Included" className={inputCls} />
                      </div>
                      <label className="flex items-end gap-2 pb-2.5 cursor-pointer">
                        <input type="checkbox" checked={!!laneList[laneIdx].pro} onChange={(e) => setLane(laneIdx, { pro: e.target.checked })} />
                        <span className="text-[12.5px] text-ink">Show PRO badge</span>
                      </label>
                    </div>
                    <div>
                      <label className="text-[12px] font-semibold text-ink block mb-1.5">Description</label>
                      <textarea rows={2} value={laneList[laneIdx].detail ?? ''} onChange={(e) => setLane(laneIdx, { detail: e.target.value })} placeholder="The line shown under the tabs when this one is picked." className={inputCls} />
                    </div>
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={() => deleteLane(laneIdx)} disabled={laneList.length <= 1} className="text-[12px] font-medium text-red-700 hover:underline disabled:opacity-40 disabled:no-underline">Delete this tab</button>
                      {form.lanes.length > 0 && <button type="button" onClick={() => { set({ lanes: [] }); setLaneTab(0) }} className="text-[12px] text-ink-3 hover:text-ink">Reset to built-in</button>}
                    </div>
                  </div>
                ) : <p className="text-[12.5px] text-ink-4">No lanes. Add one to offer a way to get it done.</p>}
                <p className="text-[11px] text-ink-4 mt-3">Saved with the campaign. These don&apos;t change what the store charges yet.</p>
              </div>

              {/* What we'll need from you — an editable list */}
              <div id="sec-requirements" className={panelCls('requirements')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13.5px] font-semibold text-ink">What we&apos;ll need from you</span>
                  <button type="button" onClick={addReq} className="text-[12.5px] text-brand-dark font-semibold hover:underline">+ Add</button>
                </div>
                <div className="space-y-1.5">
                  {reqList.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                      <input type="text" value={r} onChange={(e) => setReq(i, e.target.value)} placeholder="e.g. Connect your Google profile" className={inputCls} />
                      <button type="button" onClick={() => delReq(i)} className="text-ink-4 text-[13px] px-1 shrink-0" title="Remove">✕</button>
                    </div>
                  ))}
                  {reqList.length === 0 && <p className="text-[12.5px] text-ink-4">Nothing needed from the owner. Add a line if there is.</p>}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {form.requirements.length > 0 && <button type="button" onClick={() => set({ requirements: [] })} className="text-[12px] text-ink-3 hover:text-ink">Reset to built-in</button>}
                  <span className="text-[11px] text-ink-4">Empty keeps the list derived from the services.</span>
                </div>
              </div>

              {/* What you get — an editable list */}
              <div id="sec-get" className={panelCls('get')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13.5px] font-semibold text-ink">What you get</span>
                  <button type="button" onClick={addGet} className="text-[12.5px] text-brand-dark font-semibold hover:underline">+ Add</button>
                </div>
                <div className="space-y-1.5">
                  {getList.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2e9a78" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 6L9 17l-5-5" /></svg>
                      <input type="text" value={r} onChange={(e) => setGet(i, e.target.value)} placeholder="e.g. We fix all 6 parts of your profile" className={inputCls} />
                      <button type="button" onClick={() => delGet(i)} className="text-ink-4 text-[13px] px-1 shrink-0" title="Remove">✕</button>
                    </div>
                  ))}
                  {getList.length === 0 && <p className="text-[12.5px] text-ink-4">Nothing listed. Add what the customer gets.</p>}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {form.whatYouGet.length > 0 && <button type="button" onClick={() => set({ whatYouGet: [] })} className="text-[12px] text-ink-3 hover:text-ink">Reset to built-in</button>}
                  <span className="text-[11px] text-ink-4">Empty keeps the list derived from the services. Add-ons still show below it.</span>
                </div>
              </div>

              {/* Derived sections — what each non-editable part comes from */}
              <div id="sec-derived" className={panelCls('derived')}>
                <div className="text-[13.5px] font-semibold text-ink mb-1">Set by the campaign&apos;s services</div>
                {activeSection && DERIVED_NOTE[activeSection]
                  ? <p className="text-[12.5px] text-ink-3 leading-relaxed">{DERIVED_NOTE[activeSection]}</p>
                  : <p className="text-[12.5px] text-ink-4 leading-relaxed">Click the timeline, analytics, or the price on the page to see where each one comes from.</p>}
              </div>

              {/* More details: tagline, expectation, best for, FAQ */}
              <div className="rounded-xl border border-ink-6 bg-white p-4 lg:p-5 space-y-3.5">
                <div className="text-[13.5px] font-semibold text-ink">More details</div>
                {renderField('tagline')}
                {renderField('expectation')}
                {renderField('bestFor')}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-semibold text-ink">FAQ</label>
                    <button onClick={() => set({ faq: [...form.faq, { q: '', a: '' }] })} className="text-[11px] font-medium text-brand-dark hover:underline">Add a question</button>
                  </div>
                  {form.faq.length === 0 && (
                    <p className="text-[12px] text-ink-4">
                      {base.faq?.length ? `Using the ${base.faq.length} code-default question${base.faq.length === 1 ? '' : 's'}.` : 'No questions yet.'}
                    </p>
                  )}
                  <div className="space-y-2">
                    {form.faq.map((f, i) => (
                      <div key={i} className="rounded-lg border border-ink-6 p-2.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input type="text" value={f.q} placeholder="Question"
                            onChange={(e) => set({ faq: form.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })}
                            className="flex-1 text-[13px] text-ink rounded-md border border-ink-6 px-2.5 py-1.5 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
                          <button onClick={() => set({ faq: form.faq.filter((_, j) => j !== i) })} className="text-[11px] text-red-700 hover:underline shrink-0">Remove</button>
                        </div>
                        <textarea rows={2} value={f.a} placeholder="Answer"
                          onChange={(e) => set({ faq: form.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
                          className="w-full text-[13px] text-ink rounded-md border border-ink-6 px-2.5 py-1.5 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT — the live, clickable page */}
            <aside className="order-1 lg:order-2 lg:sticky lg:top-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-4 mb-2">Live preview · click a section to edit it</div>
              {builtinFacts && (
                <ProductPagePreview
                  eyebrow={form.title || base.title}
                  headline={form.promise || base.promise}
                  description={form.description || base.description}
                  why={form.why || base.why}
                  stages={form.stages.length ? form.stages : builtinFacts.stages}
                  cadenceLabel={builtinFacts.cadence}
                  priceLabel={builtinFacts.price}
                  whatYouGet={form.whatYouGet.length ? form.whatYouGet : builtinFacts.rows}
                  requirements={form.requirements.length ? form.requirements : builtinFacts.requirements}
                  analytics={builtinFacts.analytics}
                  heroImage={(form.heroImage || base.heroImage) || null}
                  googleTile={builtinFacts.googleTile}
                  lanes={form.lanes.length ? form.lanes.map((l) => ({ label: l.label || 'Untitled', price: l.price, pro: l.pro })) : builtinFacts.lanes}
                  selectedLane={form.lanes.length ? laneIdx : undefined}
                  laneDetail={form.lanes.length ? (form.lanes[laneIdx]?.detail || undefined) : builtinFacts.laneDetail}
                  timeline={builtinFacts.timeline}
                  interactive
                  active={activeSection}
                  onSection={gotoSection}
                />
              )}
            </aside>
          </div>
        </div>
      )}

      {toast && (
        <div className={'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-[13px] font-medium rounded-lg px-4 py-2.5 shadow-lg ' + (toast.bad ? 'bg-red-600 text-white' : 'bg-ink text-white')}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
