'use client'
/**
 * CatalogAdmin — the editable catalog. Reads the live catalog_services rows, lets an admin click a
 * service to edit its name / plain name / description / status / prices, saves via a server action
 * (RLS-gated), and Publishes to regenerate the snapshot the plan builder reads. preview mode (the
 * dev /preview/catalog route) disables the server calls so the UI can be reviewed without auth.
 */
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { marginOf, costOf, OVERHEAD_MULT, MARGIN_FLOOR, HANDLERS, type PricedService, type PricePoint, type GoalPlay, type SystemGoal, type Tier, type Handler, type CardLane, type LaneKind } from '@/lib/campaigns/data/priced-catalog'
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
    deliverables: null, lanes: null, status: 'draft', sort_order: 0,
  }
}
const LANE_KINDS: LaneKind[] = ['diy', 'ai', 'team', 'creator']
const LANE_KIND_LABEL: Record<LaneKind, string> = { diy: 'They do it (DIY)', ai: 'Apnosh AI', team: 'Apnosh does it', creator: 'Contractor does it' }
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
  const [saving, start] = useTransition()

  const onName = (v: string) => { setName(v); if (creating && !idTouched) setId(kebab(v)) }
  const setLane = (i: number, patch: Partial<CardLane>) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const addLane = () => setLanes((ls) => [...ls, { id: 'lane' + (ls.length + 1), label: '', kind: 'team', price: { amount: 0, kind: 'one-time' }, requirements: [], addOns: [] }])
  const removeLane = (i: number) => setLanes((ls) => ls.filter((_, j) => j !== i))
  const laneReqAdd = (i: number) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, requirements: [...(l.requirements ?? []), ''] } : l)))
  const laneReqSet = (i: number, k: number, v: string) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, requirements: (l.requirements ?? []).map((r, x) => (x === k ? v : r)) } : l)))
  const laneReqDel = (i: number, k: number) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, requirements: (l.requirements ?? []).filter((_, x) => x !== k) } : l)))
  const laneAddAdd = (i: number) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, addOns: [...(l.addOns ?? []), { label: '', amount: 0 }] } : l)))
  const laneAddSet = (i: number, k: number, patch: Partial<{ label: string; amount: number }>) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, addOns: (l.addOns ?? []).map((a, x) => (x === k ? { ...a, ...patch } : a)) } : l)))
  const laneAddDel = (i: number, k: number) => setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, addOns: (l.addOns ?? []).filter((_, x) => x !== k) } : l)))
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

    if (creating) {
      const newSvc: NewService = { id: finalId, section, name: name.trim(), plain_name: plain.trim() || null, description: desc.trim(), handler, handler_why: handlerWhy.trim(), essential, prices: pricePoints, deliverables, goal_plays, lanes: lanesOut, status }
      start(async () => {
        const r = await createService(newSvc)
        if (r.ok) {
          onCreated({ ...row, id: finalId, section, name: name.trim(), plain_name: plain.trim() || null, description: desc.trim(), handler, handler_why: handlerWhy.trim(), essential, prices: pricePoints, deliverables, goal_plays, lanes: lanesOut, status })
        } else flash(r.error || 'Create failed', true)
      })
      return
    }
    const patch: ServicePatch = { name: name.trim(), plain_name: plain.trim() || null, description: desc.trim(), status, section, handler, handler_why: handlerWhy.trim(), essential, prices: pricePoints, deliverables, goal_plays, lanes: lanesOut }
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
          {/* full-page preview — how the customer's product page reads, from the form data */}
          <div className="rounded-xl bg-bg-2/50 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-ink-4">How the customer sees it</div>
              <div className="text-[10px] text-ink-5">preview</div>
            </div>
            <div className="rounded-2xl bg-white border border-ink-6 overflow-hidden shadow-sm">
              {/* hero */}
              <div className="px-4 pt-4 pb-3">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-emerald-700">{SECTION_LABEL[section] ?? section}</div>
                <div className="text-[17px] font-semibold text-ink leading-tight mt-1">{plain || name || 'Untitled card'}</div>
                {desc.trim() && <div className="text-[12.5px] text-ink-3 mt-1 leading-snug">{desc.trim()}</div>}
              </div>
              {/* choose how it's done — the lanes */}
              <div className="px-4 py-3 border-t border-ink-6">
                <div className="text-[10px] font-bold uppercase tracking-wide text-ink-4 mb-1.5">Choose how it&apos;s done</div>
                {pvLanes.length > 0 ? (
                  <>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(pvLanes.length, 3)}, minmax(0,1fr))` }}>
                      {pvLanes.map((l, i) => {
                        const on = i === Math.min(pvLane, pvLanes.length - 1)
                        return (
                          <button key={i} onClick={() => setPvLane(i)} className={'rounded-lg border px-2 py-1.5 text-center ' + (on ? 'border-brand bg-brand/5' : 'border-ink-6')}>
                            <div className="text-[11px] font-semibold text-ink leading-tight">{l.label}</div>
                            <div className={'text-[10.5px] mt-0.5 ' + (on ? 'text-brand-dark font-semibold' : 'text-ink-4')}>{laneChip(l)}</div>
                          </button>
                        )
                      })}
                    </div>
                    {pvSel && (
                      <div className="mt-2 space-y-1.5">
                        {pvSel.note?.trim() && <div className="text-[11.5px] text-ink-3">{pvSel.note.trim()}</div>}
                        {(pvSel.requirements ?? []).filter((r) => r.trim()).length > 0 && (
                          <div><div className="text-[9.5px] font-bold uppercase tracking-wide text-ink-4">You provide</div>{(pvSel.requirements ?? []).filter((r) => r.trim()).map((r, x) => <div key={x} className="text-[11.5px] text-ink-2">• {r}</div>)}</div>
                        )}
                        {(pvSel.addOns ?? []).filter((a) => a.label.trim()).length > 0 && (
                          <div><div className="text-[9.5px] font-bold uppercase tracking-wide text-ink-4">Add-ons</div>{(pvSel.addOns ?? []).filter((a) => a.label.trim()).map((a, x) => <div key={x} className="text-[11.5px] text-ink-2 flex justify-between gap-2"><span>+ {a.label}</span><span className="text-ink-4">${(a.amount || 0).toLocaleString()}</span></div>)}</div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[{ t: "I'll do it", p: 'Free' }, { t: 'Apnosh AI', p: 'Pro' }, { t: 'Apnosh does it', p: previewPrice }].map((ln, i) => (
                        <div key={i} className={'rounded-lg border px-2 py-1.5 text-center ' + (i === 2 ? 'border-brand bg-brand/5' : 'border-ink-6')}>
                          <div className="text-[11px] font-semibold text-ink leading-tight">{ln.t}</div>
                          <div className={'text-[10.5px] mt-0.5 ' + (i === 2 ? 'text-brand-dark font-semibold' : 'text-ink-4')}>{ln.p}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-ink-5 mt-1.5">Default lanes. Add your own below to customize this per card.</div>
                  </>
                )}
              </div>
              {/* what you get */}
              {previewInc.length > 0 && (
                <div className="px-4 py-3 border-t border-ink-6">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-ink-4 mb-1.5">What you get</div>
                  <ul className="space-y-1">
                    {previewInc.map((it, i) => <li key={i} className="text-[12px] text-ink-2 flex gap-1.5"><span className="text-emerald-600">✓</span>{it}</li>)}
                    {included.filter((x) => x.trim()).length > previewInc.length && <li className="text-[11px] text-ink-4 pl-4">+ {included.filter((x) => x.trim()).length - previewInc.length} more</li>}
                  </ul>
                </div>
              )}
              {/* buy footer */}
              <div className="px-4 py-3 border-t border-ink-6 flex items-center gap-3 bg-bg-2/40">
                <div className="flex-1 min-w-0"><div className="text-[15px] font-bold text-ink">{previewPrice}</div></div>
                <div className="rounded-full bg-brand text-white text-[12.5px] font-semibold px-4 py-2">Add to plan</div>
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
        <div className="space-y-5 order-2 lg:order-1">
          <section className={panel}>
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

          {/* pricing */}
          <section className={panel}>
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
          <section className={panel}>
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

          {/* campaign recipe (goal_plays) */}
          <section className={panel}>
          <div>
            <span className={panelHead}>In these campaigns</span>
            <p className="text-[11px] text-ink-4 mt-0.5 mb-2">Which goals this card is part of, and how it ranks. This is what auto-builds a restaurant&apos;s plan — no AI needed. Optional.</p>
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

          </section>

          {/* who can do it — per-card lanes (Fiverr-style) */}
          <section className={panel}>
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
              {lanes.length === 0 && <p className="text-[12px] text-ink-4">No custom lanes — this card uses the default. Add lanes to offer DIY / Apnosh AI / done-for-you your own way, each with its own price.</p>}
            </div>
          </div>
          </section>
        </div>
      </div>
    </div>
  )
}
