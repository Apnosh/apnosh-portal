'use client'
/**
 * Interactive view of the atomic catalog: each atom is rendered as ONE configurable
 * service (pick a type, set an amount) that produces a single order line. This is the
 * model — atom = service, {type, amount} = its config — the same shape the storefront
 * recipes use (atom + type + qty per line). Read-only, dev preview, no persistence.
 */
import { useMemo, useState } from 'react'
import type { AtomicAction, AtomFamily, AtomFit } from '@/lib/campaigns/data/atomic-catalog'
import { FAMILY_LABEL } from '@/lib/campaigns/data/atomic-catalog'

const FIT: Record<AtomFit, { bg: string; fg: string; label: string }> = {
  ai: { bg: '#e1f5ee', fg: '#0f6e56', label: 'AI drafts it' },
  hybrid: { bg: '#faeeda', fg: '#854f0b', label: 'Hybrid' },
  human: { bg: '#f0f0f5', fg: '#424245', label: 'Hands-on' },
}
const FAMILY_ORDER: AtomFamily[] = ['create', 'publish', 'build', 'money', 'measure', 'people']

export interface RecipeView {
  id: string
  name: string
  kind: string
  lines: { atomName: string; typeLabel?: string; qty: number; fit: AtomFit }[]
}
export interface Cov {
  atoms: number
  actionTypes: number
  distinctSourceStrings: number
  recipes: number
  fitTally: Record<AtomFit, number>
  lossless: boolean
}

function FitDot({ fit }: { fit: AtomFit }) {
  return <span style={{ background: FIT[fit].fg }} className="inline-block h-2 w-2 shrink-0 rounded-full" aria-hidden />
}
function FitBadge({ fit }: { fit: AtomFit }) {
  const f = FIT[fit]
  return (
    <span style={{ background: f.bg, color: f.fg }} className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium">
      {f.label}
    </span>
  )
}

/** One atom rendered as a configurable service. */
function ServiceCard({ atom }: { atom: AtomicAction }) {
  const [typeId, setTypeId] = useState(atom.types[0].id)
  const [amount, setAmount] = useState(1)
  const [showAll, setShowAll] = useState(false)
  const type = atom.types.find((t) => t.id === typeId) ?? atom.types[0]
  const eff: AtomFit = type.fit ?? atom.fit
  const single = atom.types.length === 1

  return (
    <div className="rounded-2xl bg-bg p-4 ring-1 ring-ink-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold leading-snug">{atom.name}</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{atom.fitWhy}</p>
        </div>
        <FitBadge fit={eff} />
      </div>

      {/* config row */}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-4">Type</span>
          {single ? (
            <span className="inline-flex h-8 items-center rounded-lg bg-bg-2 px-2.5 text-[13px] text-ink-2">{type.label}</span>
          ) : (
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="h-8 rounded-lg bg-bg-2 px-2 text-[13px] text-ink ring-1 ring-ink-6 focus:outline-none focus:ring-brand"
            >
              {atom.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-4">Amount</span>
          <span className="inline-flex h-8 items-center overflow-hidden rounded-lg ring-1 ring-ink-6">
            <button
              type="button"
              onClick={() => setAmount((n) => Math.max(1, n - 1))}
              className="grid h-8 w-8 place-items-center text-ink-3 hover:bg-bg-2"
              aria-label="decrease"
            >
              −
            </button>
            <span className="w-8 text-center text-[13px] font-medium tabular-nums">{amount}</span>
            <button
              type="button"
              onClick={() => setAmount((n) => Math.min(99, n + 1))}
              className="grid h-8 w-8 place-items-center text-ink-3 hover:bg-bg-2"
              aria-label="increase"
            >
              +
            </button>
          </span>
        </label>
      </div>

      {/* resulting line */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-tint/60 px-3 py-2 text-[13px] text-ink-2">
        <FitDot fit={eff} />
        <span className="font-medium tabular-nums">{amount}×</span>
        <span>{atom.name}</span>
        {!single && <span className="text-ink-4">· {type.label}</span>}
      </div>

      {/* what this covers (provenance) */}
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="mt-2.5 text-[12px] font-medium text-ink-3 hover:text-ink"
      >
        {showAll ? 'Hide' : `What it covers · ${atom.types.length} ${atom.types.length === 1 ? 'type' : 'types'}`} {showAll ? '▴' : '▾'}
      </button>
      {showAll && (
        <ul className="mt-2 space-y-1.5 border-t border-ink-6 pt-2.5">
          {atom.types.map((t) => {
            const tf = t.fit ?? atom.fit
            return (
              <li key={t.id} className="flex items-start gap-2 text-[12px]">
                <span className="mt-1"><FitDot fit={tf} /></span>
                <span className="min-w-0">
                  <span className="text-ink">{t.label}</span>
                  <span className="ml-1 text-ink-4">· {t.from.join(', ')}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function AtomicCatalogView({ atoms, recipes, cov }: { atoms: AtomicAction[]; recipes: RecipeView[]; cov: Cov }) {
  const byFamily = useMemo(
    () => FAMILY_ORDER.map((fam) => ({ fam, items: atoms.filter((a) => a.family === fam) })).filter((g) => g.items.length),
    [atoms],
  )
  const stats: { label: string; value: string }[] = [
    { label: 'Services (atoms)', value: String(cov.atoms) },
    { label: 'Configurable types', value: String(cov.actionTypes) },
    { label: 'Original actions folded in', value: `${cov.distinctSourceStrings} / 178` },
    { label: 'Storefront recipes', value: String(cov.recipes) },
    { label: 'AI · hybrid · hands-on', value: `${cov.fitTally.ai} · ${cov.fitTally.hybrid} · ${cov.fitTally.human}` },
  ]

  return (
    <div className="min-h-screen bg-bg-2 text-ink">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Internal · AI builder palette</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">The atomic service catalog</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            Each atom is one service. You customize it by type and amount, and it becomes a single order line. The AI
            builder mixes these to compose a plan for each business. The familiar campaigns owners shop are recipes
            built from these same services (at the bottom).
          </p>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-bg p-3 ring-1 ring-ink-6">
              <div className="text-[11px] leading-tight text-ink-3">{s.label}</div>
              <div className="mt-1 text-lg font-semibold">{s.value}</div>
            </div>
          ))}
        </section>

        <div className="mb-8 flex flex-wrap items-center gap-3">
          {(['ai', 'hybrid', 'human'] as AtomFit[]).map((f) => (
            <div key={f} className="flex items-center gap-1.5">
              <FitDot fit={f} />
              <span className="text-[13px] text-ink-2">{FIT[f].label}</span>
            </div>
          ))}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand-dark">
            {cov.lossless ? '✓ Verified lossless · nothing dropped' : '⚠ Coverage check failed'}
          </span>
        </div>

        {byFamily.map(({ fam, items }) => (
          <section key={fam} className="mb-9">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-lg font-semibold">{FAMILY_LABEL[fam]}</h2>
              <span className="text-sm text-ink-3">{items.length}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((a) => (
                <ServiceCard key={a.id} atom={a} />
              ))}
            </div>
          </section>
        ))}

        <section className="mt-12 border-t border-ink-6 pt-8">
          <div className="mb-1 flex items-baseline gap-2">
            <h2 className="text-xl font-semibold">Storefront recipes</h2>
            <span className="text-sm text-ink-3">{recipes.length}</span>
          </div>
          <p className="mb-5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
            Each campaign or program owners shop, expressed as configured service lines (service · type × amount). Same
            model as the cards above, just pre-filled. Proof every product you sell today is accounted for.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {recipes.map((r) => (
              <div key={r.id} className="rounded-2xl bg-bg p-4 ring-1 ring-ink-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold">{r.name}</h3>
                  <span className="rounded-full bg-bg-2 px-2 py-0.5 text-[11px] font-medium text-ink-3">{r.kind}</span>
                </div>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {r.lines.map((l, i) => (
                    <li key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-bg-2 px-2 py-1 text-[12px] text-ink-2">
                      <FitDot fit={l.fit} />
                      <span>
                        {l.qty > 1 ? <span className="font-medium tabular-nums">{l.qty}× </span> : null}
                        {l.atomName}
                        {l.typeLabel ? <span className="text-ink-4"> · {l.typeLabel}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-12 text-[12px] text-ink-4">
          Source: src/lib/campaigns/data/atomic-catalog.ts · dev preview, not in production
        </footer>
      </div>
    </div>
  )
}
