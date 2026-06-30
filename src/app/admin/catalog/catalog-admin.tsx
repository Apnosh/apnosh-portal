'use client'
/**
 * CatalogAdmin — the editable catalog. Reads the live catalog_services rows, lets an admin click a
 * service to edit its name / plain name / description / status / prices, saves via a server action
 * (RLS-gated), and Publishes to regenerate the snapshot the plan builder reads. preview mode (the
 * dev /preview/catalog route) disables the server calls so the UI can be reviewed without auth.
 */
import { useMemo, useState, useTransition } from 'react'
import { marginOf, MARGIN_FLOOR, type PricedService, type PricePoint } from '@/lib/campaigns/data/priced-catalog'
import type { CatalogRow } from '@/lib/campaigns/data/catalog-db-shape'
import { rowToService } from '@/lib/campaigns/data/catalog-db-shape'
import { updateService, publishCatalog, type ServicePatch } from './actions'

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
const priceLabel = (p: PricePoint) => p.kind === 'monthly' ? '/mo' : p.kind === 'per-unit' ? '/' + (p.unit || 'unit') : ' one-time'
const minMargin = (svc: PricedService) => Math.min(...svc.prices.map((p) => marginOf(p).pct))

export function CatalogAdmin({ rows: initial, preview = false, initialOpenId }: { rows: CatalogRow[]; preview?: boolean; initialOpenId?: string }) {
  const [rows, setRows] = useState<CatalogRow[]>(initial)
  const [editId, setEditId] = useState<string | null>(initialOpenId ?? null)
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

  const editing = editId ? byId[editId] : null

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-24 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">Service catalog</h1>
          <p className="text-[13px] text-ink-3 mt-1">{rows.length} services · click a row to edit{preview ? ' · preview (saving off)' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[12px] text-amber-600 font-medium">Unpublished changes</span>}
          <button
            disabled={pending || preview}
            onClick={() => start(async () => {
              if (preview) return flash('Preview mode: publishing is off')
              const r = await publishCatalog()
              if (r.ok) { setDirty(false); flash(`Published — ${r.count} services live in plans`) } else flash(r.error || 'Publish failed', true)
            })}
            className={'text-[13px] font-semibold rounded-lg px-3.5 py-2 ' + (dirty && !preview ? 'bg-brand text-white' : 'bg-bg-2 text-ink-3')}
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
                  <div className="text-[11px] text-ink-2 whitespace-nowrap text-right min-w-[92px]">{svc.prices.map((p) => '$' + p.amount.toLocaleString()).join(' + ')}</div>
                  <div className={'text-[10px] font-bold text-right min-w-[34px] ' + (low ? 'text-rose-600' : 'text-emerald-600')}>{Math.round(m * 100)}%</div>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {editing && <EditDrawer key={editing.id} row={editing} preview={preview} onClose={() => setEditId(null)} onSaved={onSaved} flash={flash} />}
      {toast && <div className={'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 text-[13px] font-medium text-white rounded-lg px-4 py-2.5 shadow-lg ' + (toast.bad ? 'bg-rose-600' : 'bg-ink')}>{toast.msg}</div>}
    </div>
  )
}

function EditDrawer({ row, preview, onClose, onSaved, flash }: { row: CatalogRow; preview: boolean; onClose: () => void; onSaved: (id: string, patch: ServicePatch) => void; flash: (m: string, bad?: boolean) => void }) {
  const [name, setName] = useState(row.name)
  const [plain, setPlain] = useState(row.plain_name ?? '')
  const [desc, setDesc] = useState(row.description)
  const [status, setStatus] = useState<CatalogRow['status']>(row.status)
  const [prices, setPrices] = useState<PricePoint[]>(() => row.prices.map((p) => ({ ...p })))
  const [delivSummary, setDelivSummary] = useState(row.deliverables?.summary ?? '')
  const [included, setIncluded] = useState<string[]>(() => [...(row.deliverables?.included ?? [])])
  const [saving, start] = useTransition()
  const setAmount = (i: number, v: number) => setPrices((ps) => ps.map((p, j) => (j === i ? { ...p, amount: v } : p)))
  const setItem = (i: number, v: string) => setIncluded((xs) => xs.map((x, j) => (j === i ? v : x)))

  function save() {
    const inc = included.map((x) => x.trim()).filter(Boolean)
    const deliverables = (delivSummary.trim() || inc.length) ? { summary: delivSummary.trim(), included: inc } : null
    const patch: ServicePatch = { name: name.trim(), plain_name: plain.trim() || null, description: desc.trim(), status, prices, deliverables }
    if (preview) { flash('Preview mode: saving is off'); return }
    start(async () => {
      const r = await updateService(row.id, patch)
      if (r.ok) { onSaved(row.id, patch); flash('Saved. Publish to make it live.') } else flash(r.error || 'Save failed', true)
    })
  }

  const field = 'w-full text-[13px] text-ink border border-ink-6 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand'
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30" />
      <div className="relative w-full max-w-[440px] h-full bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-ink-6 px-5 py-3 flex items-center justify-between">
          <div className="font-mono text-[11px] text-ink-3">{row.id}</div>
          <button onClick={onClose} className="text-ink-3 text-[13px]">Close</button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block"><span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Owner-facing name</span><input className={field} value={plain} onChange={(e) => setPlain(e.target.value)} placeholder={row.name} /></label>
          <label className="block"><span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Internal name</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">What you get</span><textarea className={field + ' h-20 resize-none'} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Status</span>
            <select className={field} value={status} onChange={(e) => setStatus(e.target.value as CatalogRow['status'])}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Prices</span>
            <div className="space-y-2 mt-1">
              {prices.map((p, i) => {
                const m = marginOf(p)
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-ink-3 text-[13px]">$</span>
                    <input type="number" className={field + ' w-28'} value={p.amount} onChange={(e) => setAmount(i, Number(e.target.value) || 0)} />
                    <span className="text-[12px] text-ink-4 flex-1">{priceLabel(p)}</span>
                    <span className={'text-[11px] font-bold ' + (m.pct < MARGIN_FLOOR ? 'text-rose-600' : 'text-emerald-600')}>{Math.round(m.pct * 100)}%</span>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-ink-4 mt-1.5">Margin updates live from the cost model. Red is under your {Math.round(MARGIN_FLOOR * 100)}% floor.</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">What&apos;s included</span>
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
            <p className="text-[11px] text-ink-4 mt-1.5">The concrete things the client is paying for. Shown on the service card.</p>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-ink-6 px-5 py-3 flex gap-2">
          <button onClick={save} disabled={saving} className="flex-1 bg-brand text-white text-[13px] font-semibold rounded-lg py-2">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={onClose} className="text-[13px] text-ink-3 px-3">Cancel</button>
        </div>
      </div>
    </div>
  )
}
