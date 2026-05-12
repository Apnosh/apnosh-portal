/**
 * Editorial themes UI. Grouped by client, sorted by month. Each card
 * is a theme with name + blurb + pillar count + draft count + a
 * "Generate ideas" CTA (which will dispatch to AI in E3).
 */

'use client'

import { useState, useMemo } from 'react'
import {
  BookOpen, Plus, Loader2, X, Sparkles, ArrowRight, ListTodo, Pencil,
} from 'lucide-react'
import type { ThemeRow } from '@/lib/work/get-themes'

interface ClientLite { id: string; name: string; slug: string }
interface Props {
  initialThemes: ThemeRow[]
  clients: ClientLite[]
}

export default function ThemesView({ initialThemes, clients }: Props) {
  const [themes, setThemes] = useState<ThemeRow[]>(initialThemes)
  const [creating, setCreating] = useState(false)

  const grouped = useMemo(() => {
    const map = new Map<string, ThemeRow[]>()
    for (const t of themes) {
      const k = t.clientId
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(t)
    }
    return map
  }, [themes])

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-7 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100 flex-shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
              What each client should post about
            </h1>
          </div>
          <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
            Set the monthly editorial direction. AI grounds every post idea in the theme + pillars + facts.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[13px] font-semibold rounded-xl px-4 py-2.5"
        >
          <Plus className="w-4 h-4" />
          New theme
        </button>
      </header>

      {themes.length === 0 ? <EmptyState onCreate={() => setCreating(true)} /> : (
        <div className="space-y-7">
          {(Array.from(grouped.entries())).map(([clientId, list]) => (
            <ClientGroup
              key={clientId}
              clientId={clientId}
              clientName={list[0]?.clientName ?? 'Client'}
              clientSlug={list[0]?.clientSlug ?? ''}
              themes={list}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateModal
          clients={clients}
          onClose={() => setCreating(false)}
          onCreated={(newTheme) => {
            setThemes(prev => [newTheme, ...prev])
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

function ClientGroup({
  clientName, clientSlug, themes,
}: {
  clientId: string
  clientName: string
  clientSlug: string
  themes: ThemeRow[]
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-3 inline-flex items-center gap-2">
          {clientName}
          <span className="text-ink-5">·</span>
          <span className="text-ink-4 font-normal lowercase tracking-normal">{themes.length} theme{themes.length === 1 ? '' : 's'}</span>
        </h2>
        {clientSlug && (
          <a
            href={`/admin/clients/${clientSlug}`}
            className="text-[11px] text-ink-3 hover:text-ink inline-flex items-center gap-1"
          >
            Client → <ArrowRight className="w-3 h-3" />
          </a>
        )}
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {themes.map(t => <ThemeCard key={t.id} t={t} />)}
      </ul>
    </section>
  )
}

function ThemeCard({ t }: { t: ThemeRow }) {
  const [current, setCurrent] = useState(t)
  const monthLabel = current.month
    ? new Date(current.month).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : '(no month)'
  const pillarCount = Array.isArray(current.pillars) ? (current.pillars as unknown[]).length : 0
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(current.themeName ?? '')
  const [editBlurb, setEditBlurb] = useState(current.themeBlurb ?? '')
  const [editPillars, setEditPillars] = useState(
    Array.isArray(current.pillars) ? (current.pillars as string[]).join('\n') : '',
  )
  const [saving, setSaving] = useState(false)

  async function saveEdit() {
    setSaving(true); setError(null)
    const pillars = editPillars.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
    const res = await fetch(`/api/work/themes/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeName: editName, themeBlurb: editBlurb, pillars }),
    })
    setSaving(false)
    if (!res.ok) {
      setError((await res.json()).error ?? 'failed')
      return
    }
    const { theme } = await res.json()
    setCurrent({
      ...current,
      themeName: theme.theme_name,
      themeBlurb: theme.theme_blurb,
      pillars: theme.pillars,
      version: theme.version,
    })
    setEditing(false)
  }

  async function generate() {
    setGenerating(true)
    setError(null)
    const res = await fetch(`/api/work/themes/${current.id}/generate-ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 10 }),
    })
    setGenerating(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: 'failed' }))
      setError(j.error ?? 'failed')
      return
    }
    // Navigate to the drafts ledger so strategist can judge each.
    window.location.href = '/work/drafts'
  }

  return (
    <li
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      {!editing ? (
        <>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              {monthLabel}
            </span>
            {current.status && current.status !== 'active' && (
              <span className="text-[10px] uppercase tracking-wider text-ink-4">· {current.status}</span>
            )}
            <span className="text-[10px] text-ink-5 ml-auto">v{current.version}</span>
          </div>
          <p className="text-[15px] font-semibold text-ink leading-snug">
            {current.themeName || '(untitled)'}
          </p>
          {current.themeBlurb && (
            <p className="text-[12px] text-ink-3 mt-1 leading-snug line-clamp-3">
              {current.themeBlurb}
            </p>
          )}
          <div className="flex items-center gap-3 mt-3 text-[11px] text-ink-4">
            {pillarCount > 0 && <span>{pillarCount} pillar{pillarCount === 1 ? '' : 's'}</span>}
            {current.draftCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <ListTodo className="w-3 h-3" /> {current.draftCount} draft{current.draftCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ink-7">
            <button
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-60"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generating ? 'Generating…' : 'Generate ideas'}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink px-2 py-1"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <a
              href={`/work/drafts`}
              className="text-[11px] text-ink-3 hover:text-ink inline-flex items-center gap-1 ml-auto"
            >
              See drafts <ArrowRight className="w-3 h-3" />
            </a>
            {error && (
              <span className="text-[11px] text-red-600">{error}</span>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 mb-2">
            Editing theme · {monthLabel}
          </p>
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Theme name"
            className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 mb-2"
          />
          <textarea
            value={editBlurb}
            onChange={e => setEditBlurb(e.target.value)}
            rows={2}
            placeholder="Blurb"
            className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 mb-2 resize-none"
          />
          <textarea
            value={editPillars}
            onChange={e => setEditPillars(e.target.value)}
            rows={3}
            placeholder="Pillars (one per line)"
            className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 mb-2 resize-none"
          />
          {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setEditing(false); setError(null) }} className="text-[12px] text-ink-3 hover:text-ink px-2 py-1">
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={saving || !editName.trim()}
              className="inline-flex items-center gap-1 text-[12px] font-semibold bg-ink hover:bg-ink-2 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
              Save (v{current.version + 1})
            </button>
          </div>
        </>
      )}
    </li>
  )
}

function CreateModal({
  clients, onClose, onCreated,
}: {
  clients: ClientLite[]
  onClose: () => void
  onCreated: (theme: ThemeRow) => void
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [month, setMonth] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [themeName, setThemeName] = useState('')
  const [themeBlurb, setThemeBlurb] = useState('')
  const [pillarsText, setPillarsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!clientId || !themeName.trim()) {
      setErr('Pick a client and give the theme a name.')
      return
    }
    setSaving(true); setErr(null)
    const pillars = pillarsText.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
    const res = await fetch('/api/work/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId, month, themeName, themeBlurb, pillars,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setErr((await res.json()).error ?? 'failed')
      return
    }
    const { id } = await res.json()
    const c = clients.find(c => c.id === clientId)
    onCreated({
      id, clientId, clientName: c?.name ?? null, clientSlug: c?.slug ?? null,
      month, themeName, themeBlurb, pillars, keyDates: [], strategistNotes: null,
      status: 'planning', version: 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      draftCount: 0,
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full my-8 overflow-hidden">
        <div className="p-5 border-b border-ink-6 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">New editorial theme</h2>
            <p className="text-[11px] text-ink-4 mt-0.5">Sets the direction for a client&rsquo;s month.</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-2 mb-1.5">Client</span>
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 bg-white"
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-2 mb-1.5">Month</span>
              <input
                type="date"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-2 mb-1.5">Theme name</span>
            <input
              type="text"
              autoFocus
              value={themeName}
              onChange={e => setThemeName(e.target.value)}
              placeholder="e.g. Slow-cooked April"
              className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-2 mb-1.5">Blurb (1-2 sentences)</span>
            <textarea
              value={themeBlurb}
              onChange={e => setThemeBlurb(e.target.value)}
              rows={3}
              placeholder="What's the angle this month? What story are we telling?"
              className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 resize-none"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-2 mb-1.5">Content pillars (one per line)</span>
            <textarea
              value={pillarsText}
              onChange={e => setPillarsText(e.target.value)}
              rows={3}
              placeholder={'Behind the kitchen\nNew menu items\nLocal community'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 resize-none"
            />
            <p className="text-[10px] text-ink-4 mt-1">Each pillar becomes a recurring content lens for AI to mix.</p>
          </label>

          {err && <p className="text-[12px] text-red-600">{err}</p>}
        </div>

        <div className="p-4 border-t border-ink-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[13px] text-ink-3 hover:text-ink px-3 py-2">Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !themeName.trim()}
            className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 disabled:opacity-50 text-white text-[13px] font-semibold rounded-xl px-4 py-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create theme
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3 ring-1 ring-amber-100">
        <BookOpen className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">No themes yet</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed mb-4">
        Create your first editorial theme. AI uses it as the WHY behind every post idea this month.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[13px] font-semibold rounded-xl px-4 py-2.5"
      >
        <Plus className="w-4 h-4" />
        Create first theme
      </button>
    </div>
  )
}
