'use client'
/**
 * CatalogAdmin — the editable catalog. Reads the live catalog_services rows, lets an admin click a
 * service to edit its name / plain name / description / status / prices, saves via a server action
 * (RLS-gated), and Publishes to regenerate the snapshot the plan builder reads. preview mode (the
 * dev /preview/catalog route) disables the server calls so the UI can be reviewed without auth.
 */
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { marginOf, costOf, OVERHEAD_MULT, MARGIN_FLOOR, HANDLERS, type PricedService, type PricePoint, type GoalPlay, type SystemGoal, type Tier, type Handler, type CardLane, type CardLaneAddOn, type LaneKind } from '@/lib/campaigns/data/priced-catalog'
import type { CatalogRow } from '@/lib/campaigns/data/catalog-db-shape'
import { rowToService } from '@/lib/campaigns/data/catalog-db-shape'
import { updateService, createService, deleteService, publishCatalog, type ServicePatch, type NewService } from './actions'

const SECTION_LABEL: Record<string, string> = {
  foundation: 'Foundations', awareness: 'Get discovered', capture: 'Capture guests', convert: 'Turn into visits',
  nurture: 'Nurture', retain: 'Keep them coming', anticipation: 'Events and moments', advocate: 'Reviews and referrals', winback: 'Win back',
}
const ORDER = ['foundation', 'awareness', 'capture', 'convert', 'nurture', 'retain', 'anticipation', 'advocate', 'winback']
const GOAL_CHIP: Record<string, { l: string; c: string }> = {
  firstvisit: { l: 'First visit', c: '#0f97a8' }, nights: { l: 'Slow nights', c: '#3b6fd4' },
  regulars: { l: 'Regulars', c: '#7b5bd6' }, reviews: { l: 'Rating', c: '#c98a1a' },
}
const STATUSES: CatalogRow['status'][] = ['active', 'draft', 'archived', 'coming_soon']
const HANDLER_OPTS = Object.keys(HANDLERS) as Handler[]
const PRICE_KINDS: PricePoint['kind'][] = ['one-time', 'monthly', 'per-unit']
const kebab = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
/** A blank card to author from scratch. */
function blankRow(): CatalogRow {
  return {
    id: '', section: 'awareness', name: '', plain_name: '', description: '', essential: false,
    handler: 'apnosh', handler_why: '', evidence: null, compliance: null, metric: null,
    prices: [{ kind: 'one-time', amount: 0, cost: {} }], goal_plays: null, fit: null, pieces: null,
    deliverables: null, lanes: null, analytics: null, add_ons: null, status: 'draft', sort_order: 0,
  }
}
const LANE_KINDS: LaneKind[] = ['diy', 'ai', 'team', 'creator']
const LANE_KIND_LABEL: Record<LaneKind, string> = { diy: 'They do it (DIY)', ai: 'Apnosh AI', team: 'Apnosh does it', creator: 'Contractor does it' }
// exact tokens from the real store product page (apnosh-campaign.jsx TOKENS) so the preview matches
const PV = {
  mint: '#4abd98', mintDark: '#2e9a78', mintTint: '#eaf7f3', ink: '#1c2620', sub: '#6b736d', faint: '#a6aca7', line: '#e7e9e6',
  heroGrad: 'linear-gradient(168deg,#fbfaf4 0%,#f2f8f4 54%,#e7f3ed 100%)',
  head: "'Cal Sans','Poppins',system-ui,sans-serif", body: "'Inter',system-ui,sans-serif",
}
const Check = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={PV.mintDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
// faithful replica of apnosh-campaign.jsx BlockLabel: a 16px Cal Sans section heading, optional hint
function PvLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
      <span style={{ fontFamily: PV.head, fontSize: 16, fontWeight: 600, color: PV.ink, letterSpacing: '-0.2px' }}>{children}</span>
      {hint && <span style={{ marginLeft: 'auto', fontFamily: PV.body, fontSize: 11.5, fontWeight: 600, color: PV.faint }}>{hint}</span>}
    </div>
  )
}
const GOAL_OPTS: SystemGoal[] = ['firstvisit', 'nights', 'regulars', 'reviews']
const TIER_OPTS: Tier[] = ['lean', 'standard', 'aggressive']
const TIER_LABEL: Record<Tier, string> = { lean: 'Lean+', standard: 'Standard+', aggressive: 'Aggressive only' }
const minMargin = (svc: PricedService) => Math.min(...svc.prices.map((p) => marginOf(p).pct))

/** Per-card usage counts: how many campaigns include the card, and how many are live (shipped). */
export type ServiceUsage = Record<string, { total: number; live: number }>

export function CatalogAdmin({ rows: initial, preview = false, initialOpenId, usage = {} }: { rows: CatalogRow[]; preview?: boolean; initialOpenId?: string; usage?: ServiceUsage }) {
  const [rows, setRows] = useState<CatalogRow[]>(initial)
  const [editId, setEditId] = useState<string | null>(initialOpenId ?? null)
  const [creating, setCreating] = useState(false)
  const [createSeed, setCreateSeed] = useState<CatalogRow | null>(null)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const [pending, start] = useTransition()

  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r])), [rows])
  const grouped = useMemo(() => ORDER.map((sec) => ({ sec, items: rows.filter((r) => r.section === sec) })).filter((g) => g.items.length), [rows])
  const flash = (msg: string, bad = false) => { setToast({ msg, bad }); setTimeout(() => setToast(null), 3200) }

  function onSaved(id: string, patch: ServicePatch) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } as CatalogRow : r)))
    setDirty(true); setEditId(null)
  }
  function onCreated(row: CatalogRow) {
    setRows((rs) => [row, ...rs])
    setDirty(true); setCreating(false); setCreateSeed(null)
    flash(`Created "${row.plain_name || row.name}". Publish to make it live.`)
  }
  function onDeleted(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id))
    setDirty(true); setEditId(null); flash('Card deleted.')
  }
  // Duplicate = open the create builder pre-filled from a card, with a fresh id.
  const startNew = () => { setCreateSeed(null); setCreating(true) }
  const startDuplicate = (r: CatalogRow) => {
    setEditId(null)
    setCreateSeed({ ...r, id: '', name: r.name + ' copy', plain_name: r.plain_name ? r.plain_name + ' copy' : '', status: 'draft' })
    setCreating(true)
  }

  const editing = editId ? byId[editId] : null

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-24 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">Catalog</h1>
          <p className="text-[13px] text-ink-3 mt-1">{rows.length} cards · click one to edit, or make a new card. Publish when you&apos;re ready{preview ? ' · preview (saving off)' : ''}.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-bg-2 p-1 mr-1">
            <span className="text-[12.5px] font-semibold rounded-md px-3 py-1.5 bg-white text-ink shadow-sm">Services</span>
            <Link href="/admin/catalog/campaigns" className="text-[12.5px] font-medium rounded-md px-3 py-1.5 text-ink-3 hover:text-ink">Campaigns</Link>
            <Link href="/admin/catalog/availability" className="text-[12.5px] font-medium rounded-md px-3 py-1.5 text-ink-3 hover:text-ink">Availability</Link>
          </div>
          <button onClick={startNew} disabled={preview} className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-lg px-3.5 py-2 bg-brand text-white disabled:opacity-50">＋ New card</button>
          {dirty && <span className="text-[12px] text-amber-600 font-medium">Unpublished changes</span>}
          <button
            disabled={pending || preview}
            onClick={() => start(async () => {
              if (preview) return flash('Preview mode: publishing is off')
              const r = await publishCatalog()
              if (r.ok) { setDirty(false); flash(`Published — ${r.count} services live in plans`) } else flash(r.error || 'Publish failed', true)
            })}
            className={'text-[13px] font-semibold rounded-lg px-3.5 py-2 border border-ink-6 ' + (dirty && !preview ? 'bg-ink text-white border-ink' : 'bg-white text-ink-3')}
          >{pending ? 'Working…' : 'Publish to live'}</button>
        </div>
      </div>

      {grouped.map(({ sec, items }) => (
        <section key={sec}>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3 mb-2">{SECTION_LABEL[sec] ?? sec} <span className="text-ink-4 font-medium">({items.length})</span></h2>
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            {items.map((r) => {
              const svc = rowToService(r); const m = minMargin(svc); const low = m < MARGIN_FLOOR
              const goals = [...new Set((svc.goalPlays ?? []).map((g) => g.goal))]
              return (
                <button key={r.id} onClick={() => setEditId(r.id)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium text-ink truncate">{r.plain_name || r.name}{r.status !== 'active' && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">{r.status}</span>}</div>
                    <div className="text-[11px] text-ink-4 truncate"><span className="font-mono">{r.id}</span> · {r.name}</div>
                  </div>
                  <div className="hidden sm:flex gap-1 flex-wrap justify-end max-w-[160px]">
                    {goals.map((g) => <span key={g} className="text-[9.5px] font-semibold text-white rounded-full px-1.5 py-px" style={{ background: GOAL_CHIP[g]?.c ?? '#888' }}>{GOAL_CHIP[g]?.l ?? g}</span>)}
                  </div>
                  <div className="hidden md:block text-right min-w-[70px] whitespace-nowrap">
                    {usage[r.id]?.live ? <span className="text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">{usage[r.id].live} live</span>
                      : usage[r.id]?.total ? <span className="text-[10.5px] text-ink-4">{usage[r.id].total} sold</span>
                      : <span className="text-[10.5px] text-ink-5">—</span>}
                  </div>
                  <div className="text-[11px] text-ink-2 whitespace-nowrap text-right min-w-[92px]">{svc.prices.map((p) => '$' + p.amount.toLocaleString()).join(' + ')}</div>
                  <div className={'text-[10px] font-bold text-right min-w-[34px] ' + (low ? 'text-rose-600' : 'text-emerald-600')}>{Math.round(m * 100)}%</div>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {editing && <EditDrawer key={editing.id} mode="edit" row={editing} existingIds={rows.map((r) => r.id)} usage={usage[editing.id]} preview={preview} onClose={() => setEditId(null)} onSaved={onSaved} onCreated={onCreated} onDeleted={onDeleted} onDuplicate={startDuplicate} flash={flash} />}
      {creating && <EditDrawer key={createSeed?.id ?? '__new'} mode="create" row={createSeed ?? blankRow()} existingIds={rows.map((r) => r.id)} preview={preview} onClose={() => { setCreating(false); setCreateSeed(null) }} onSaved={onSaved} onCreated={onCreated} onDeleted={onDeleted} onDuplicate={startDuplicate} flash={flash} />}
      {toast && <div className={'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 text-[13px] font-medium text-white rounded-lg px-4 py-2.5 shadow-lg ' + (toast.bad ? 'bg-rose-600' : 'bg-ink')}>{toast.msg}</div>}
    </div>
  )
}

// A price the admin is editing. We keep the original PricePoint so note/market/etc.
// survive, and only override kind/amount/unit/cost. Cost is a plain "our cost $"
// the admin types; we store it back so costOf() reproduces it exactly (÷ overhead).
type EPrice = { kind: PricePoint['kind']; amount: number; unit: string; costDollars: number; costTouched: boolean; orig: PricePoint }
function toEPrice(p: PricePoint): EPrice {
  return { kind: p.kind, amount: p.amount, unit: p.unit ?? '', costDollars: Math.round(costOf(p.cost)), costTouched: false, orig: p }
}
function toPricePoint(e: EPrice): PricePoint {
  const cost = e.costTouched ? { tools: Math.round((e.costDollars / OVERHEAD_MULT) * 100) / 100 } : e.orig.cost
  return { ...e.orig, kind: e.kind, amount: e.amount, unit: e.kind === 'per-unit' ? (e.unit.trim() || 'unit') : undefined, cost }
}

function EditDrawer({ mode, row, existingIds, usage, preview, onClose, onSaved, onCreated, onDeleted, onDuplicate, flash }: { mode: 'create' | 'edit'; row: CatalogRow; existingIds: string[]; usage?: { total: number; live: number }; preview: boolean; onClose: () => void; onSaved: (id: string, patch: ServicePatch) => void; onCreated: (row: CatalogRow) => void; onDeleted: (id: string) => void; onDuplicate: (row: CatalogRow) => void; flash: (m: string, bad?: boolean) => void }) {
  const creating = mode === 'create'
  const [id, setId] = useState(row.id)
  const [idTouched, setIdTouched] = useState(!creating)
  const [section, setSection] = useState<string>(row.section)
  const [name, setName] = useState(row.name)
  const [plain, setPlain] = useState(row.plain_name ?? '')
  const [desc, setDesc] = useState(row.description)
  const [status, setStatus] = useState<CatalogRow['status']>(row.status)
  const [handler, setHandler] = useState<string>(row.handler)
  const [handlerWhy, setHandlerWhy] = useState(row.handler_why)
  const [essential, setEssential] = useState(row.essential)
  const [prices, setPrices] = useState<EPrice[]>(() => row.prices.map(toEPrice))
  const [delivSummary, setDelivSummary] = useState(row.deliverables?.summary ?? '')
  const [included, setIncluded] = useState<string[]>(() => [...(row.deliverables?.included ?? [])])
  const [plays, setPlays] = useState<GoalPlay[]>(() => (row.goal_plays ?? []).map((p) => ({ ...p })))
  const [lanes, setLanes] = useState<CardLane[]>(() => (row.lanes ?? []).map((l) => ({ ...l, requirements: [...(l.requirements ?? [])], addOns: (l.addOns ?? []).map((a) => ({ ...a })) })))
  const [pvLane, setPvLane] = useState(0)
  const [hl, setHl] = useState<string | null>(null) // which preview region the hovered panel edits
  const [analytics, setAnalytics] = useState<string[]>(() => [...(row.analytics ?? [])])
  const [cardAddOns, setCardAddOns] = useState<CardLaneAddOn[]>(() => (row.add_ons ?? []).map((a) => ({ ...a })))
  const [advOpen, setAdvOpen] = useState(false)
  const [saving, start] = useTransition()

  const onName = (v: string) => { setName(v); if (creating && !idTouched) setId(kebab(v)) }
  const setLane = (i: number, patch: Partial<CardLane>) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const addLane = () => setLanes((ls) => [...ls, { id: 'lane' + (ls.length + 1), label: '', kind: 'team', price: { amount: 0, kind: 'one-time' }, requirements: [], addOns: [] }])
  const removeLane = (i: number) => setLanes((ls) => ls.filter((_, j) => j !== i))
  // seed the three standard lanes as EDITABLE rows so the owner can rename / reprice / remove them
  const seedStandardLanes = () => setLanes([
    { id: 'diy', label: "I'll do it myself", kind: 'diy', price: null, requirements: [], addOns: [] },
    { id: 'ai', label: 'Apnosh AI', kind: 'ai', price: null, proOnly: true, requirements: [], addOns: [] },
    { id: 'team', label: 'Apnosh does it', kind: 'team', price: prices[0] ? { amount: prices[0].amount, kind: prices[0].kind } : { amount: 0, kind: 'one-time' }, requirements: [], addOns: [] },
  ])
  const laneReqAdd = (i: number) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, requirements: [...(l.requirements ?? []), ''] } : l)))
  const laneReqSet = (i: number, k: number, v: string) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, requirements: (l.requirements ?? []).map((r, x) => (x === k ? v : r)) } : l)))
  const laneReqDel = (i: number, k: number) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, requirements: (l.requirements ?? []).filter((_, x) => x !== k) } : l)))
  const laneAddAdd = (i: number) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, addOns: [...(l.addOns ?? []), { label: '', amount: 0 }] } : l)))
  const laneAddSet = (i: number, k: number, patch: Partial<{ label: string; amount: number }>) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, addOns: (l.addOns ?? []).map((a, x) => (x === k ? { ...a, ...patch } : a)) } : l)))
  const laneAddDel = (i: number, k: number) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, addOns: (l.addOns ?? []).filter((_, x) => x !== k) } : l)))
  const anSet = (i: number, v: string) => setAnalytics((xs) => xs.map((x, j) => (j === i ? v : x)))
  const anAdd = () => setAnalytics((xs) => [...xs, ''])
  const anDel = (i: number) => setAnalytics((xs) => xs.filter((_, j) => j !== i))
  const caSet = (i: number, patch: Partial<CardLaneAddOn>) => setCardAddOns((xs) => xs.map((a, j) => (j === i ? { ...a, ...patch } : a)))
  const caAdd = () => setCardAddOns((xs) => [...xs, { label: '', amount: 0 }])
  const caDel = (i: number) => setCardAddOns((xs) => xs.filter((_, j) => j !== i))
  const setPrice = (i: number, patch: Partial<EPrice>) => setPrices((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const addPrice = () => setPrices((ps) => [...ps, toEPrice({ kind: 'one-time', amount: 0, cost: {} })])
  const removePrice = (i: number) => setPrices((ps) => ps.filter((_, j) => j !== i))
  const setItem = (i: number, v: string) => setIncluded((xs) => xs.map((x, j) => (j === i ? v : x)))
  const setPlay = (i: number, patch: Partial<GoalPlay>) => setPlays((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const addPlay = () => setPlays((ps) => [...ps, { goal: 'firstvisit', stage: '', minTier: 'lean', role: '' }])
  const removePlay = (i: number) => setPlays((ps) => ps.filter((_, j) => j !== i))

  function save() {
    if (preview) { flash('Preview mode: saving is off'); return }
    const finalId = id.trim().toLowerCase()
    if (creating) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(finalId)) return flash('Give it an ID: lowercase words joined by dashes.', true)
      if (existingIds.includes(finalId)) return flash(`ID "${finalId}" is taken. Pick another.`, true)
    }
    if (!name.trim()) return flash('A name is required.', true)
    const pricePoints = prices.map(toPricePoint)
    if (pricePoints.length === 0) return flash('Add at least one price.', true)
    const inc = included.map((x) => x.trim()).filter(Boolean)
    const deliverables = (delivSummary.trim() || inc.length) ? { summary: delivSummary.trim(), included: inc } : null
    const cleanPlays = plays
      .map((p) => ({ goal: p.goal, stage: p.stage.trim(), minTier: p.minTier, weight: p.weight, role: p.role.trim(), because: p.because?.trim() || undefined }))
      .filter((p) => p.stage && p.role)
    const goal_plays = cleanPlays.length ? cleanPlays : null
    const cleanLanes: CardLane[] = lanes
      .map((l) => ({
        id: (l.id || '').trim() || l.kind,
        label: l.label.trim(),
        kind: l.kind,
        price: l.price && l.price.amount > 0 ? { amount: l.price.amount, kind: l.price.kind } : null,
        proOnly: l.proOnly || undefined,
        requirements: (l.requirements ?? []).map((r) => r.trim()).filter(Boolean),
        addOns: (l.addOns ?? []).map((a) => ({ label: (a.label || '').trim(), amount: a.amount || 0, kind: a.kind })).filter((a) => a.label),
        note: l.note?.trim() || undefined,
      }))
      .filter((l) => l.label)
    const lanesOut = cleanLanes.length ? cleanLanes : null
    const cleanAnalytics = analytics.map((a) => a.trim()).filter(Boolean)
    const analyticsOut = cleanAnalytics.length ? cleanAnalytics : null
    const cleanAddOns: CardLaneAddOn[] = cardAddOns.map((a) => ({ label: (a.label || '').trim(), amount: a.amount || 0, kind: a.kind })).filter((a) => a.label)
    const addOnsOut = cleanAddOns.length ? cleanAddOns : null

    if (creating) {
      const newSvc: NewService = { id: finalId, section, name: name.trim(), plain_name: plain.trim() || null, description: desc.trim(), handler, handler_why: handlerWhy.trim(), essential, prices: pricePoints, deliverables, goal_plays, lanes: lanesOut, analytics: analyticsOut, add_ons: addOnsOut, status }
      start(async () => {
        const r = await createService(newSvc)
        if (r.ok) {
          onCreated({ ...row, id: finalId, section, name: name.trim(), plain_name: plain.trim() || null, description: desc.trim(), handler, handler_why: handlerWhy.trim(), essential, prices: pricePoints, deliverables, goal_plays, lanes: lanesOut, analytics: analyticsOut, add_ons: addOnsOut, status })
        } else flash(r.error || 'Create failed', true)
      })
      return
    }
    const patch: ServicePatch = { name: name.trim(), plain_name: plain.trim() || null, description: desc.trim(), status, section, handler, handler_why: handlerWhy.trim(), essential, prices: pricePoints, deliverables, goal_plays, lanes: lanesOut, analytics: analyticsOut, add_ons: addOnsOut }
    start(async () => {
      const r = await updateService(row.id, patch)
      if (r.ok) { onSaved(row.id, patch); flash('Saved. Publish to make it live.') } else flash(r.error || 'Save failed', true)
    })
  }

  function del() {
    if (preview) { flash('Preview mode: deleting is off'); return }
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${plain || name || row.id}"? This can't be undone.`)) return
    start(async () => {
      const r = await deleteService(row.id)
      if (r.ok) onDeleted(row.id); else flash(r.error || 'Delete failed', true)
    })
  }

  const field = 'w-full text-[13.5px] text-ink bg-white border border-ink-6 rounded-xl px-3 py-2.5 placeholder:text-ink-4 focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition'
  const lbl = 'block text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3 mb-1'
  const panel = 'bg-white rounded-2xl border border-ink-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5 space-y-4'
  const panelHead = 'text-[14.5px] font-semibold text-ink'
  // a customer-facing snapshot of the card, straight from the form state
  const previewPrice = prices.length
    ? prices.map((e) => '$' + (e.amount || 0).toLocaleString() + (e.kind === 'monthly' ? '/mo' : e.kind === 'per-unit' ? '/' + (e.unit.trim() || 'unit') : '')).join(' + ')
    : 'No price'
  const previewInc = included.map((x) => x.trim()).filter(Boolean).slice(0, 4)
  const pvLanes = lanes.filter((l) => l.label.trim())
  const pvSel = pvLanes[Math.min(pvLane, Math.max(0, pvLanes.length - 1))]
  const laneChip = (l: CardLane) => (!l.price ? (l.kind === 'ai' && l.proOnly ? 'Pro' : 'Free') : '$' + l.price.amount.toLocaleString() + (l.price.kind === 'monthly' ? '/mo' : ''))
  const shownLanes = pvLanes.length > 0
    ? pvLanes.map((l) => ({ label: l.label, price: laneChip(l), pro: l.kind === 'ai' && !!l.proOnly }))
    : [{ label: "I'll do it", price: 'Free', pro: false }, { label: 'Apnosh AI', price: 'Included', pro: true }, { label: 'Apnosh does it', price: previewPrice, pro: false }]
  const pvIdx = Math.min(pvLane, Math.max(0, shownLanes.length - 1))
  // a highlight ring on the preview region the hovered form panel edits
  const ringOf = (k: string) => (hl === k ? { outline: `2px solid ${PV.mint}`, outlineOffset: '-2px' } : {})
  return (
    <div className="fixed inset-0 z-[60] bg-bg-2 overflow-y-auto">
      {/* top bar with the actions — full-screen takeover above the admin sidebar (z-50) */}
      <div className="sticky top-0 z-10 bg-white/85 backdrop-blur-md border-b border-ink-6 px-5 lg:px-8 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink shrink-0"><span className="text-[15px] leading-none">&larr;</span> Catalog</button>
          <div className="w-px h-5 bg-ink-6 hidden sm:block" />
          <div className="text-[15px] font-semibold text-ink truncate hidden sm:block">{creating ? 'New card' : (plain || name || row.id)}</div>
          {!creating && <span className={'text-[9.5px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ' + (status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-7 text-ink-3')}>{status}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!creating && <button onClick={() => onDuplicate(row)} className="text-[12.5px] font-medium text-ink-3 hover:text-ink rounded-lg px-3 py-2 hover:bg-bg-2">Duplicate</button>}
          {!creating && <button onClick={del} disabled={saving} className="text-[12.5px] font-medium text-rose-600 hover:text-rose-700 rounded-lg px-3 py-2 hover:bg-rose-50">Delete</button>}
          <button onClick={save} disabled={saving} className="ml-1 bg-brand text-white text-[13px] font-semibold rounded-xl px-5 py-2 shadow-sm hover:brightness-105 disabled:opacity-60 transition">{saving ? (creating ? 'Creating…' : 'Saving…') : (creating ? 'Create card' : 'Save')}</button>
        </div>
      </div>
      {/* two columns: the form on the left, a sticky live preview on the right */}
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8 py-6 grid lg:grid-cols-[minmax(0,1fr)_400px] gap-6 lg:gap-10 items-start">
        <aside className="space-y-4 order-1 lg:order-2 lg:sticky lg:top-[70px]">
          {/* live preview — a faithful replica of the customer product page (apnosh-campaign.jsx) */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-4 mb-2">Live preview · how the customer sees it</div>
            <div style={{ borderRadius: 22, overflow: 'hidden', background: '#fff', border: `1px solid ${PV.line}`, boxShadow: '0 10px 34px rgba(20,45,33,0.10)', fontFamily: PV.body }}>
              {/* HERO — mirrors ProductPage: chip row, product-name eyebrow, big headline, product tile */}
              <div style={{ background: PV.heroGrad, padding: '14px 20px 26px', position: 'relative', overflow: 'hidden', ...ringOf('hero') }}>
                <div aria-hidden style={{ position: 'absolute', top: -80, right: -60, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(74,189,152,0.22), rgba(74,189,152,0))', pointerEvents: 'none' }} />
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span style={{ fontFamily: PV.body, fontSize: 11, fontWeight: 700, color: PV.mintDark, background: 'rgba(74,189,152,0.14)', borderRadius: 8, padding: '4px 9px' }}>{SECTION_LABEL[section] ?? section}</span>
                    {essential && <span style={{ fontFamily: PV.body, fontSize: 11, fontWeight: 600, color: '#7c837e', background: 'rgba(20,30,26,0.05)', borderRadius: 8, padding: '4px 9px' }}>Essential</span>}
                  </div>
                  <div style={{ fontFamily: PV.body, fontSize: 13, fontWeight: 700, color: PV.mintDark, marginBottom: 6 }}>{name || 'Untitled'}</div>
                  <div style={{ fontFamily: PV.head, fontSize: 26, fontWeight: 700, color: PV.ink, lineHeight: 1.16, letterSpacing: '-0.5px' }}>{plain || name || 'Untitled card'}</div>
                  <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: 112, height: 112, borderRadius: 28, background: 'linear-gradient(150deg,#4abd98,#2e9a78)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 34px rgba(46,154,120,0.34), 0 3px 8px rgba(20,40,30,0.12)' }}>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.4 6.9L21.6 9l-5.8 4.4 2.2 7-6-4.3-6 4.3 2.2-7L2.4 9l7.2-.1z" /></svg>
                    </div>
                  </div>
                </div>
              </div>
              {/* SELL — the description is its own block below the hero, exactly like the store */}
              {desc.trim() && (
                <div style={{ padding: '16px 20px 0' }}>
                  <p style={{ margin: 0, fontFamily: PV.body, fontSize: 14.5, color: '#4c554f', lineHeight: 1.55 }}>{desc.trim()}</p>
                </div>
              )}
              {/* CHOOSE HOW IT'S DONE */}
              <div style={{ padding: '22px 20px 0', ...ringOf('lanes') }}>
                <PvLabel>{shownLanes.length > 1 ? "Choose how it's done" : "How it's done"}</PvLabel>
                <div style={{ display: 'flex', gap: 7 }}>
                  {shownLanes.map((l, i) => {
                    const on = i === pvIdx
                    return (
                      <button key={i} onClick={() => setPvLane(i)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textAlign: 'center', background: on ? PV.mint : '#fff', border: `1.5px solid ${on ? PV.mint : PV.line}`, borderRadius: 14, padding: '11px 6px', cursor: 'pointer', boxShadow: on ? '0 4px 14px rgba(74,189,152,0.30)' : '0 1px 2px rgba(20,40,30,0.03)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                          <span style={{ fontFamily: PV.head, fontSize: 13, fontWeight: 600, color: on ? '#fff' : PV.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</span>
                          {l.pro && <span style={{ background: on ? 'rgba(255,255,255,0.24)' : '#eaf7f3', color: on ? '#fff' : '#2e9a78', fontSize: 8.5, fontWeight: 800, letterSpacing: '0.4px', borderRadius: 5, padding: '1.5px 4px' }}>PRO</span>}
                        </span>
                        <span style={{ fontFamily: PV.body, fontSize: 12, fontWeight: 700, color: on ? 'rgba(255,255,255,0.92)' : PV.mintDark }}>{l.price || 'Free'}</span>
                      </button>
                    )
                  })}
                </div>
                {(() => {
                  const detail = pvLanes.length ? (pvSel?.note?.trim() || '') : 'The Apnosh team does this for you.'
                  return detail ? <div style={{ fontFamily: PV.body, fontSize: 12.5, color: PV.sub, lineHeight: 1.45, marginTop: 10 }}>{detail}</div> : null
                })()}
              </div>
              {/* WHAT WE'LL NEED FROM YOU — its own section in a soft box, like the store */}
              {pvSel && (pvSel.requirements ?? []).filter((r) => r.trim()).length > 0 && (
                <div style={{ padding: '20px 20px 0' }}>
                  <PvLabel>What we&apos;ll need from you</PvLabel>
                  <div style={{ background: '#f7f9f8', borderRadius: 14, padding: '13px 15px' }}>
                    {(pvSel.requirements ?? []).filter((r) => r.trim()).map((r, x) => (
                      <div key={x} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: x ? 10 : 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 4, background: PV.mint, flexShrink: 0, marginTop: 6 }} />
                        <span style={{ fontFamily: PV.body, fontSize: 13.5, color: PV.ink, lineHeight: 1.4 }}>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* WHAT YOU GET */}
              {previewInc.length > 0 && (
                <div style={{ padding: '18px 20px 0', ...ringOf('get') }}>
                  <PvLabel>What you get</PvLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {previewInc.map((it, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 11, background: PV.mintTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><Check /></span>
                        <span style={{ fontFamily: PV.body, fontSize: 14, color: PV.ink, lineHeight: 1.45 }}>{it}</span>
                      </div>
                    ))}
                    {included.filter((x) => x.trim()).length > previewInc.length && <div style={{ fontFamily: PV.body, fontSize: 12, color: PV.faint, paddingLeft: 33 }}>+ {included.filter((x) => x.trim()).length - previewInc.length} more</div>}
                  </div>
                </div>
              )}
              {/* ANALYTICS TO TRACK — matches the store exactly: chart icon, bordered rows, hint, caption */}
              {analytics.filter((a) => a.trim()).length > 0 && (
                <div style={{ padding: '28px 20px 0', ...ringOf('analytics') }}>
                  <PvLabel hint="Watch these grow">Analytics to track</PvLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {analytics.filter((a) => a.trim()).map((a, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, border: `1.5px solid ${PV.line}`, borderRadius: 14, background: '#fff', padding: '12px 14px' }}>
                        <span style={{ width: 26, height: 26, borderRadius: 8, background: PV.mintTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PV.mintDark} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
                        </span>
                        <span style={{ flex: 1, fontFamily: PV.body, fontSize: 14, color: PV.ink }}>{a}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: PV.body, fontSize: 12, color: PV.faint, marginTop: 10, lineHeight: 1.45 }}>The numbers this campaign is built to lift. Watch them grow in your Insights.</div>
                </div>
              )}
              {/* BUY FOOTER — real product-page footer: total label + big price, then full-width pill */}
              <div style={{ marginTop: 24, background: '#fff', borderTop: `1px solid ${PV.line}`, boxShadow: '0 -10px 28px rgba(20,40,30,0.10)', padding: '11px 18px 14px', ...ringOf('footer') }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
                  <span style={{ fontFamily: PV.body, fontSize: 12.5, fontWeight: 600, color: PV.sub }}>Your total</span>
                  <span style={{ fontFamily: PV.head, fontSize: 21, fontWeight: 700, color: PV.ink, letterSpacing: '-0.4px' }}>{previewPrice}</span>
                </div>
                <div style={{ width: '100%', height: 52, borderRadius: 26, background: PV.mint, color: '#fff', fontFamily: PV.head, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 22px rgba(74,189,152,0.42)' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>Add to plan
                </div>
              </div>
            </div>
          </div>

          {/* sales / usage */}
          {!creating && (
            <div className="flex items-center gap-4 rounded-xl border border-ink-6 px-3.5 py-2.5">
              <div><div className="text-[18px] font-semibold text-emerald-700 leading-none">{usage?.live ?? 0}</div><div className="text-[10.5px] text-ink-4 mt-0.5">in live campaigns</div></div>
              <div className="w-px h-7 bg-ink-6" />
              <div><div className="text-[18px] font-semibold text-ink leading-none">{usage?.total ?? 0}</div><div className="text-[10.5px] text-ink-4 mt-0.5">sold all-time</div></div>
              <div className="w-px h-7 bg-ink-6" />
              <div title="Units sold × today's price. Gross list value, not collected revenue."><div className="text-[18px] font-semibold text-ink leading-none">${((usage?.total ?? 0) * prices.reduce((s, e) => s + (e.amount || 0), 0)).toLocaleString()}</div><div className="text-[10.5px] text-ink-4 mt-0.5">gross value</div></div>
            </div>
          )}

        </aside>
        <div className="flex flex-col gap-5 order-2 lg:order-1">
          <section className={panel + ' order-1'} onMouseEnter={() => setHl('hero')} onMouseLeave={() => setHl(null)}>
          <div className={panelHead}>The basics</div>
          {/* identity */}
          <label className="block"><span className={lbl}>Card name</span><input className={field} value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Menu photo refresh" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={lbl}>Section</span>
              <select className={field} value={section} onChange={(e) => setSection(e.target.value)}>{ORDER.map((s) => <option key={s} value={s}>{SECTION_LABEL[s] ?? s}</option>)}</select>
            </label>
            <label className="block"><span className={lbl}>Status</span>
              <select className={field} value={status} onChange={(e) => setStatus(e.target.value as CatalogRow['status'])}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </label>
          </div>
          <label className="block"><span className={lbl}>ID {creating ? '' : '(fixed)'}</span>
            <input className={field + ' font-mono ' + (creating ? '' : 'bg-bg-2 text-ink-3')} value={id} disabled={!creating} onChange={(e) => { setIdTouched(true); setId(e.target.value) }} placeholder="menu-photo-refresh" />
          </label>
          <label className="block"><span className={lbl}>Owner-facing name (optional)</span><input className={field} value={plain} onChange={(e) => setPlain(e.target.value)} placeholder={name || 'Shown to restaurants'} /></label>
          <label className="block"><span className={lbl}>What it is</span><textarea className={field + ' h-20 resize-none'} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="One or two plain sentences." /></label>

          {/* who does it */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={lbl}>Who does it</span>
              <select className={field} value={handler} onChange={(e) => setHandler(e.target.value)}>{HANDLER_OPTS.map((h) => <option key={h} value={h}>{HANDLERS[h].label}</option>)}</select>
            </label>
            <label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={essential} onChange={(e) => setEssential(e.target.checked)} /><span className="text-[12.5px] text-ink-2">Essential</span></label>
          </div>
          <label className="block"><span className={lbl}>Why they do it (optional)</span><input className={field} value={handlerWhy} onChange={(e) => setHandlerWhy(e.target.value)} placeholder="e.g. Needs a pro camera and editing." /></label>

          </section>

          {/* pricing — sits right under 'Who can do it' since each lane carries a price */}
          <section className={panel + ' order-3'} onMouseEnter={() => setHl('footer')} onMouseLeave={() => setHl(null)}>
          <div>
            <div className="flex items-center justify-between"><span className={panelHead}>Price</span><button onClick={addPrice} className="text-[12.5px] text-brand font-semibold">+ Add a price</button></div>
            <div className="space-y-2 mt-1.5">
              {prices.map((e, i) => {
                const m = marginOf(toPricePoint(e))
                return (
                  <div key={i} className="rounded-lg border border-ink-6 p-2.5 space-y-2 bg-bg-2/40">
                    <div className="flex items-center gap-2">
                      <span className="text-ink-3 text-[13px]">$</span>
                      <input type="number" className={field + ' w-24'} value={e.amount} onChange={(ev) => setPrice(i, { amount: Number(ev.target.value) || 0 })} placeholder="Price" />
                      <select className={field + ' w-28'} value={e.kind} onChange={(ev) => setPrice(i, { kind: ev.target.value as PricePoint['kind'] })}>{PRICE_KINDS.map((k) => <option key={k} value={k}>{k === 'monthly' ? 'per month' : k === 'per-unit' ? 'per unit' : 'one-time'}</option>)}</select>
                      {e.kind === 'per-unit' && <input className={field + ' w-20'} value={e.unit} onChange={(ev) => setPrice(i, { unit: ev.target.value })} placeholder="unit" />}
                      {prices.length > 1 && <button onClick={() => removePrice(i)} className="text-ink-4 text-[14px] px-1 shrink-0" title="Remove price">✕</button>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-4 shrink-0">Our cost $</span>
                      <input type="number" className={field + ' w-24'} value={e.costDollars} onChange={(ev) => setPrice(i, { costDollars: Number(ev.target.value) || 0, costTouched: true })} />
                      <span className="flex-1" />
                      <span className={'text-[11px] font-bold ' + (m.pct < MARGIN_FLOOR ? 'text-rose-600' : 'text-emerald-600')}>{Math.round(m.pct * 100)}% margin</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-ink-4 mt-1.5">Set your price and your cost. Margin updates live; red is under your {Math.round(MARGIN_FLOOR * 100)}% floor.</p>
          </div>

          </section>

          {/* what's included */}
          <section className={panel + ' order-4'} onMouseEnter={() => setHl('get')} onMouseLeave={() => setHl(null)}>
          <div>
            <span className={panelHead}>What&apos;s included</span>
            <input className={field + ' mt-1'} value={delivSummary} onChange={(e) => setDelivSummary(e.target.value)} placeholder="One-line summary of what this is" />
            <div className="space-y-1.5 mt-2">
              {included.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-ink-4 text-[12px]">•</span>
                  <input className={field} value={item} onChange={(e) => setItem(i, e.target.value)} />
                  <button onClick={() => setIncluded((xs) => xs.filter((_, j) => j !== i))} className="text-ink-4 text-[13px] px-1" title="Remove">✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => setIncluded((xs) => [...xs, ''])} className="text-[12px] text-brand font-medium mt-2">+ Add an item</button>
            <p className="text-[11px] text-ink-4 mt-1.5">The concrete things the client is paying for. Shown on the card.</p>
          </div>

          </section>

          {/* analytics to track (customer-facing) */}
          <section className={panel + ' order-5'} onMouseEnter={() => setHl('analytics')} onMouseLeave={() => setHl(null)}>
            <div className="flex items-center justify-between"><span className={panelHead}>Analytics to track</span><button onClick={anAdd} className="text-[12.5px] text-brand font-semibold">+ Add a metric</button></div>
            <p className="text-[11px] text-ink-4 mt-0.5">The numbers this card is built to lift. Shown on the product page under &ldquo;Analytics to track.&rdquo;</p>
            <div className="space-y-1.5 mt-2">
              {analytics.map((a, i) => (
                <div key={i} className="flex items-center gap-2"><span className="text-emerald-600 text-[12px]">↗</span><input className={field} value={a} onChange={(e) => anSet(i, e.target.value)} placeholder="e.g. Google search views" /><button onClick={() => anDel(i)} className="text-ink-4 text-[13px] px-1" title="Remove">✕</button></div>
              ))}
              {analytics.length === 0 && <p className="text-[12px] text-ink-4">No metrics yet. Add the ones this card moves so customers see what to watch.</p>}
            </div>
          </section>

          {/* add-ons (card-level, customer-facing) */}
          <section className={panel + ' order-6'} onMouseEnter={() => setHl('addons')} onMouseLeave={() => setHl(null)}>
            <div className="flex items-center justify-between"><span className={panelHead}>Add-ons</span><button onClick={caAdd} className="text-[12.5px] text-brand font-semibold">+ Add an add-on</button></div>
            <p className="text-[11px] text-ink-4 mt-0.5">Optional extras a customer can tack on, each with its own price.</p>
            <div className="space-y-2 mt-2">
              {cardAddOns.map((a, i) => (
                <div key={i} className="flex items-center gap-2"><input className={field} value={a.label} onChange={(e) => caSet(i, { label: e.target.value })} placeholder="Extra (e.g. Extra photo set)" /><span className="text-ink-3 text-[12px]">$</span><input type="number" className={field + ' w-24'} value={a.amount} onChange={(e) => caSet(i, { amount: Number(e.target.value) || 0 })} /><button onClick={() => caDel(i)} className="text-ink-4 text-[13px] px-1" title="Remove">✕</button></div>
              ))}
              {cardAddOns.length === 0 && <p className="text-[12px] text-ink-4">No add-ons yet.</p>}
            </div>
          </section>

          {/* campaign recipe (goal_plays) — internal, collapsed by default */}
          <section className={panel + ' order-7'}>
          <button onClick={() => setAdvOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
            <span className={panelHead}>Advanced · in these campaigns <span className="text-[10px] font-medium text-ink-4 normal-case tracking-normal">internal, not shown to customers</span></span>
            <span className="text-[12px] font-medium text-ink-3">{advOpen ? 'Hide' : 'Show'}</span>
          </button>
          {advOpen && (
          <div className="mt-3">
            <p className="text-[11px] text-ink-4 mb-2">Which goals this card is part of, and how it ranks. This is what auto-builds a restaurant&apos;s plan — no AI needed. Optional.</p>
            <div className="space-y-2">
              {plays.map((p, i) => (
                <div key={i} className="rounded-lg border border-ink-6 p-2.5 space-y-2 bg-bg-2/40">
                  <div className="flex items-center gap-2">
                    <select className={field} value={p.goal} onChange={(e) => setPlay(i, { goal: e.target.value as SystemGoal })}>
                      {GOAL_OPTS.map((g) => <option key={g} value={g}>{GOAL_CHIP[g]?.l ?? g}</option>)}
                    </select>
                    <select className={field} value={p.minTier} onChange={(e) => setPlay(i, { minTier: e.target.value as Tier })} title="Cheapest budget tier that includes this">
                      {TIER_OPTS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
                    </select>
                    <button onClick={() => removePlay(i)} className="text-ink-4 text-[14px] px-1 shrink-0" title="Remove from this campaign">✕</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input className={field} value={p.stage} onChange={(e) => setPlay(i, { stage: e.target.value })} placeholder="Stage label (e.g. Be findable)" />
                    <input type="number" className={field + ' w-20 shrink-0'} value={p.weight ?? ''} onChange={(e) => setPlay(i, { weight: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Order" title="Higher sorts first within its stage" />
                  </div>
                  <input className={field} value={p.role} onChange={(e) => setPlay(i, { role: e.target.value })} placeholder="Its job in this campaign (owner-facing)" />
                  <input className={field} value={p.because ?? ''} onChange={(e) => setPlay(i, { because: e.target.value })} placeholder="Why it matters (optional)" />
                </div>
              ))}
              {plays.length === 0 && <p className="text-[12px] text-ink-4">Not in any campaign yet.</p>}
            </div>
            <button onClick={addPlay} className="text-[12px] text-brand font-medium mt-2">+ Add to a campaign</button>
          </div>
          )}
          </section>

          {/* who can do it — per-card lanes (Fiverr-style) */}
          <section className={panel + ' order-2'} onMouseEnter={() => setHl('lanes')} onMouseLeave={() => setHl(null)}>
          <div>
            <div className="flex items-center justify-between">
              <span className={panelHead}>Who can do it</span>
              <button onClick={addLane} className="text-[12.5px] text-brand font-semibold">+ Add a lane</button>
            </div>
            <p className="text-[11px] text-ink-4 mt-0.5 mb-2">The options the customer picks between. Each lane has its own price, requirements, and add-ons. Leave empty to use the default.</p>
            <div className="space-y-3">
              {lanes.map((l, i) => (
                <div key={i} className="rounded-xl border border-ink-6 p-3 space-y-2 bg-bg-2/40">
                  <div className="flex items-center gap-2">
                    <input className={field} value={l.label} onChange={(e) => setLane(i, { label: e.target.value })} placeholder="Lane name (e.g. I'll do it myself)" />
                    <button onClick={() => removeLane(i)} className="text-ink-4 text-[14px] px-1 shrink-0" title="Remove lane">✕</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select className={field} value={l.kind} onChange={(e) => setLane(i, { kind: e.target.value as LaneKind })}>{LANE_KINDS.map((k) => <option key={k} value={k}>{LANE_KIND_LABEL[k]}</option>)}</select>
                    <label className="flex items-center gap-1.5 text-[12px] text-ink-2 shrink-0"><input type="checkbox" checked={!l.price} onChange={(e) => setLane(i, { price: e.target.checked ? null : { amount: 0, kind: 'one-time' } })} />Free</label>
                  </div>
                  {l.price && (
                    <div className="flex items-center gap-2">
                      <span className="text-ink-3 text-[13px]">$</span>
                      <input type="number" className={field + ' w-24'} value={l.price.amount} onChange={(e) => setLane(i, { price: { amount: Number(e.target.value) || 0, kind: l.price!.kind } })} />
                      <select className={field + ' w-28'} value={l.price.kind} onChange={(e) => setLane(i, { price: { amount: l.price!.amount, kind: e.target.value as PricePoint['kind'] } })}>{PRICE_KINDS.map((k) => <option key={k} value={k}>{k === 'monthly' ? 'per month' : k === 'per-unit' ? 'per unit' : 'one-time'}</option>)}</select>
                    </div>
                  )}
                  {l.kind === 'ai' && <label className="flex items-center gap-1.5 text-[12px] text-ink-2"><input type="checkbox" checked={!!l.proOnly} onChange={(e) => setLane(i, { proOnly: e.target.checked })} />Included for Pro members</label>}
                  <div>
                    <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">What you need from them</div>
                    {(l.requirements ?? []).map((r, k) => (
                      <div key={k} className="flex items-center gap-2 mt-1"><span className="text-ink-4 text-[12px]">•</span><input className={field} value={r} onChange={(e) => laneReqSet(i, k, e.target.value)} placeholder="e.g. Connect your Google profile" /><button onClick={() => laneReqDel(i, k)} className="text-ink-4 text-[13px] px-1">✕</button></div>
                    ))}
                    <button onClick={() => laneReqAdd(i)} className="text-[11.5px] text-brand font-medium mt-1">+ Requirement</button>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">Add-ons</div>
                    {(l.addOns ?? []).map((a, k) => (
                      <div key={k} className="flex items-center gap-2 mt-1"><input className={field} value={a.label} onChange={(e) => laneAddSet(i, k, { label: e.target.value })} placeholder="Extra" /><span className="text-ink-3 text-[12px]">$</span><input type="number" className={field + ' w-20'} value={a.amount} onChange={(e) => laneAddSet(i, k, { amount: Number(e.target.value) || 0 })} /><button onClick={() => laneAddDel(i, k)} className="text-ink-4 text-[13px] px-1">✕</button></div>
                    ))}
                    <button onClick={() => laneAddAdd(i)} className="text-[11.5px] text-brand font-medium mt-1">+ Add-on</button>
                  </div>
                  <input className={field} value={l.note ?? ''} onChange={(e) => setLane(i, { note: e.target.value })} placeholder="Short note shown under the lane (optional)" />
                </div>
              ))}
              {lanes.length === 0 && (
                <div className="rounded-xl border border-dashed border-ink-6 bg-bg-2/40 p-4 text-center">
                  <div className="text-[12.5px] text-ink-3 mb-2">This card shows the default 3 lanes (I&apos;ll do it · Apnosh AI · Apnosh does it). To rename them, set your own prices, or change how many there are:</div>
                  <button onClick={seedStandardLanes} className="text-[12.5px] font-semibold rounded-lg px-3.5 py-2 bg-brand text-white">Start from the 3 standard lanes</button>
                  <div className="text-[11px] text-ink-4 mt-2">…then edit each one, remove any you don&apos;t offer, or use &ldquo;+ Add a lane&rdquo; for more.</div>
                </div>
              )}
            </div>
          </div>
          </section>
        </div>
      </div>
    </div>
  )
}
