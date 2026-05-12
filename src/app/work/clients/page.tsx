/**
 * /work/clients — strategist's client book.
 *
 * Lists the clients the strategist is assigned to (or every client if
 * the viewer is admin). Each card surfaces the live signals that drive
 * triage: pending tasks, open quotes, recent activity.
 *
 * Click into a card to drill into /admin/clients/[slug] — the full
 * detail view, which middleware now permits for strategists (RLS
 * keeps the data scoped to their book).
 */

import Link from 'next/link'
import { Users, ChevronRight, ListTodo, FileText, Building2 } from 'lucide-react'
import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getStrategistBook } from '@/lib/work/get-strategist-book'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'

export const dynamic = 'force-dynamic'

const TIER_TONE: Record<string, string> = {
  Basic:    'bg-ink-7 text-ink-3',
  Standard: 'bg-blue-50 text-blue-700',
  Pro:      'bg-purple-50 text-purple-700',
  Internal: 'bg-brand-tint text-brand-dark',
}

export default async function StrategistBookPage() {
  await requireAnyCapability(["strategist"])
  const { isAdmin } = await resolveCurrentClient()
  const clients = await getStrategistBook()

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
            {isAdmin ? 'Every client at Apnosh' : 'Clients you manage'}
          </h1>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
          {isAdmin
            ? 'You see every client because you’re admin. A non-admin strategist would see only their assigned book.'
            : 'Each card shows what needs attention. Click in to manage briefs, quotes, and content.'}
        </p>
      </header>

      {clients.length === 0 ? <EmptyState isAdmin={isAdmin} /> : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clients.map(c => <ClientCard key={c.id} c={c} />)}
        </ul>
      )}
    </div>
  )
}

function ClientCard({ c }: { c: Awaited<ReturnType<typeof getStrategistBook>>[number] }) {
  const tierTone = c.tier ? TIER_TONE[c.tier] ?? 'bg-ink-7 text-ink-3' : null
  const needs = c.pendingTasks + c.draftQuotes
  return (
    <li>
      <Link
        href={`/admin/clients/${c.slug}`}
        className="group block rounded-2xl border bg-white p-4 hover:shadow-sm hover:border-ink-4 transition-all"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 text-[12px] font-semibold">
            {c.logoUrl
              ? <span className="block w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${c.logoUrl})` }} />
              : initials(c.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {c.tier && (
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tierTone}`}>
                  {c.tier}
                </span>
              )}
              {needs > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                  {needs} need{needs === 1 ? 's' : ''} you
                </span>
              )}
            </div>
            <p className="text-[14px] font-semibold text-ink leading-snug truncate">
              {c.name}
            </p>
            <p className="text-[11px] text-ink-4 mt-0.5 font-mono leading-tight truncate">
              {c.slug}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4 group-hover:text-ink-2 flex-shrink-0 mt-1" />
        </div>

        <ModulesRow modules={c.serviceModules} />

        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-ink-7">
          <Stat icon={<ListTodo className="w-3 h-3" />} label="Tasks" value={c.pendingTasks} tone={c.pendingTasks > 0 ? 'amber' : 'muted'} />
          <Stat icon={<FileText className="w-3 h-3" />} label="Open quotes" value={c.draftQuotes} tone={c.draftQuotes > 0 ? 'amber' : 'muted'} />
        </div>
      </Link>
    </li>
  )
}

const MODULE_TONE: Record<string, string> = {
  lite:     'bg-ink-7 text-ink-3',
  standard: 'bg-sky-50 text-sky-700',
  pro:      'bg-violet-50 text-violet-700',
}

function ModulesRow({ modules }: { modules: { social: string | null; website: string | null; email: string | null; local: string | null } }) {
  const entries: Array<[string, string | null]> = [
    ['Social',   modules.social],
    ['Web',      modules.website],
    ['Email',    modules.email],
    ['Local',    modules.local],
  ]
  const active = entries.filter(([, tier]) => tier !== null)
  if (active.length === 0) {
    return (
      <p className="text-[10px] text-ink-4 mt-2 uppercase tracking-wider">
        No service modules
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {entries.map(([label, tier]) => (
        <span
          key={label}
          className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            tier ? MODULE_TONE[tier] : 'bg-ink-7 text-ink-4 opacity-50'
          }`}
          title={tier ? `${label} ${tier}` : `${label} — not subscribed`}
        >
          {label}
          {tier && <span className="ml-0.5 opacity-70 lowercase">{tier === 'standard' ? 'std' : tier}</span>}
        </span>
      ))}
    </div>
  )
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'amber' | 'muted' }) {
  const t = tone === 'amber'
    ? 'text-amber-700'
    : 'text-ink-4'
  return (
    <div className="flex items-center gap-1.5">
      <span className={t}>{icon}</span>
      <span className={`text-[11px] font-medium ${t}`}>
        <span className="tabular-nums font-semibold">{value}</span>{' '}
        <span className="text-ink-4">{label}</span>
      </span>
    </div>
  )
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 ring-1 ring-emerald-100">
        <Building2 className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">
        {isAdmin ? 'No clients yet' : 'No clients assigned'}
      </p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
        {isAdmin
          ? 'Create a client from /admin/clients to populate the book.'
          : 'An admin will assign clients to you. Once they do, this page lists everyone you manage.'}
      </p>
    </div>
  )
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}
