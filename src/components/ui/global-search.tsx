'use client'

/**
 * Global command palette (⌘K / Ctrl+K).
 *
 * Searches across clients, tasks, invoices, and surfaces page shortcuts.
 * Keyboard-driven: ↑↓ to move, Enter to open, Esc to close. When the
 * query is empty we show the user's most recent picks so switching
 * between two or three active clients is effectively zero-latency.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Users, FileText, X, CheckSquare, CreditCard, Clock,
  LayoutDashboard, ListTodo, Calendar, BarChart3, Settings, Kanban,
  ArrowRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ResultType = 'client' | 'task' | 'invoice' | 'page'

interface SearchResult {
  type: ResultType
  id: string          // unique within a search (used as React key + recents)
  title: string
  subtitle: string
  href: string
}

const TYPE_ICONS: Record<ResultType, React.ComponentType<{ className?: string }>> = {
  client: Users,
  task: CheckSquare,
  invoice: CreditCard,
  page: ArrowRight,
}

const TYPE_TONE: Record<ResultType, string> = {
  client:  'bg-blue-50 text-blue-600',
  task:    'bg-emerald-50 text-emerald-600',
  invoice: 'bg-amber-50 text-amber-600',
  page:    'bg-ink-6 text-ink-3',
}

const TYPE_LABEL: Record<ResultType, string> = {
  client: 'Client', task: 'Task', invoice: 'Invoice', page: 'Go to',
}

// Static page shortcuts — always included if the query matches their
// label or keyword. Keeps the palette useful for fast navigation even
// before the user has typed a client name.
const PAGES: Array<{ label: string; href: string; keywords: string[]; icon: React.ComponentType<{ className?: string }> }> = [
  { label: 'Overview',       href: '/admin',                keywords: ['home', 'dashboard'], icon: LayoutDashboard },
  { label: 'Today',          href: '/admin/today',          keywords: ['tasks', 'todo'],     icon: CheckSquare },
  { label: 'Clients',        href: '/admin/clients',        keywords: [],                    icon: Users },
  { label: 'Billing',        href: '/admin/billing',        keywords: ['stripe', 'invoices', 'money'], icon: CreditCard },
  { label: 'Queue',          href: '/admin/queue',          keywords: ['content'],           icon: ListTodo },
  { label: 'Pipeline',       href: '/admin/pipeline',       keywords: ['content', 'kanban'], icon: Kanban },
  { label: 'Calendar',       href: '/admin/calendar',       keywords: ['content'],           icon: Calendar },
  { label: 'Analytics',      href: '/admin/analytics',      keywords: ['metrics'],           icon: BarChart3 },
  { label: 'Settings',       href: '/admin/settings',       keywords: [],                    icon: Settings },
]

const RECENTS_KEY = 'apnosh:cmdk:recents'
const MAX_RECENTS = 8

function loadRecents(): SearchResult[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveRecent(r: SearchResult) {
  if (typeof window === 'undefined') return
  const current = loadRecents()
  const deduped = [r, ...current.filter(x => x.id !== r.id || x.type !== r.type)]
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(deduped.slice(0, MAX_RECENTS)))
  } catch { /* storage full, ignore */ }
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [recents, setRecents] = useState<SearchResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const router = useRouter()

  // ⌘K / Ctrl+K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
        setRecents(loadRecents())
      }
      if (e.key === 'Escape' && open) {
        setOpen(false); setQuery(''); setResults([])
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery(''); setResults([])
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Query execution
  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 1) { setResults([]); return }
    setLoading(true)
    const supabase = createClient()
    const term = `%${trimmed}%`
    const items: SearchResult[] = []

    // Pages: match by label or keyword (instant, no DB hit)
    const pageMatches = PAGES.filter(p => {
      const haystack = `${p.label} ${p.keywords.join(' ')}`.toLowerCase()
      return haystack.includes(trimmed.toLowerCase())
    })
    pageMatches.slice(0, 4).forEach(p => items.push({
      type: 'page', id: p.href, title: p.label, subtitle: p.href, href: p.href,
    }))

    const [clientsRes, tasksRes, invoicesRes] = await Promise.all([
      supabase.from('clients').select('id, name, slug, industry').ilike('name', term).limit(6),
      supabase.from('client_tasks')
        .select('id, title, due_at, status, client:clients(name, slug)')
        .in('status', ['todo', 'doing'])
        .ilike('title', term)
        .limit(6),
      supabase.from('invoices')
        .select('id, invoice_number, status, total_cents, client:clients(name, slug)')
        .ilike('invoice_number', term)
        .limit(5),
    ])

    for (const c of (clientsRes.data ?? []) as Array<{ id: string; name: string; slug: string; industry: string | null }>) {
      items.push({
        type: 'client', id: c.id, title: c.name,
        subtitle: c.industry ?? 'Client',
        href: `/admin/clients/${c.slug}`,
      })
    }

    // Supabase returns embedded relations as arrays even when it's a
    // single FK — normalize to one object here.
    type Embed<T> = T | T[] | null | undefined
    const pick = <T,>(v: Embed<T>): T | null => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    for (const t of (tasksRes.data ?? []) as Array<{ id: string; title: string; due_at: string | null; client: Embed<{ name: string; slug: string }> }>) {
      const c = pick(t.client)
      const due = t.due_at ? ` · due ${new Date(t.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''
      items.push({
        type: 'task', id: t.id, title: t.title,
        subtitle: `${c?.name ?? 'Client'}${due}`,
        href: c ? `/admin/clients/${c.slug}` : '/admin/today',
      })
    }

    for (const inv of (invoicesRes.data ?? []) as Array<{ id: string; invoice_number: string; status: string; total_cents: number; client: Embed<{ name: string; slug: string }> }>) {
      const c = pick(inv.client)
      items.push({
        type: 'invoice', id: inv.id,
        title: inv.invoice_number,
        subtitle: `${c?.name ?? ''} · ${inv.status} · $${(inv.total_cents / 100).toFixed(0)}`,
        href: c ? `/admin/clients/${c.slug}` : '/admin/billing',
      })
    }

    setResults(items)
    setLoading(false)
    setActiveIdx(0)
  }, [])

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => search(query), 180)
    return () => clearTimeout(timeout)
  }, [query, search])

  const visible = useMemo<SearchResult[]>(() => {
    if (query.trim().length === 0) return recents
    return results
  }, [query, results, recents])

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0) }, [visible.length])

  // Scroll active row into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelectorAll('[data-result-row]')[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const handleSelect = useCallback((r: SearchResult) => {
    setOpen(false); setQuery(''); setResults([])
    saveRecent(r)
    router.push(r.href)
  }, [router])

  // Keyboard nav inside the palette
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(i + 1, visible.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const picked = visible[activeIdx]
        if (picked) {
          e.preventDefault()
          handleSelect(picked)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, visible, activeIdx, handleSelect])

  return (
    <>
      <button
        onClick={() => { setOpen(true); setRecents(loadRecents()) }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ink-6 bg-bg-2 text-sm text-ink-4 hover:border-ink-5 transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline text-[10px] font-medium text-ink-5 bg-white border border-ink-6 rounded px-1.5 py-0.5 ml-2">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4">
          <div className="absolute inset-0 bg-black/30" />
          <div ref={containerRef} className="relative bg-white rounded-2xl border border-ink-6 shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 border-b border-ink-6">
              <Search className="w-4 h-4 text-ink-4 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients, tasks, invoices..."
                className="flex-1 py-3.5 text-sm text-ink bg-transparent outline-none placeholder:text-ink-4"
              />
              {query && (
                <button onClick={() => { setQuery(''); setResults([]) }} className="text-ink-4 hover:text-ink">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Content: results OR recents OR empty hint */}
            {visible.length === 0 ? (
              query.trim().length > 0 ? (
                <div className="p-6 text-sm text-ink-4 text-center">
                  {loading
                    ? <span className="inline-flex items-center gap-2"><Clock className="w-3.5 h-3.5 animate-pulse" /> Searching...</span>
                    : <>No results for &ldquo;{query}&rdquo;</>}
                </div>
              ) : (
                <div className="p-6 text-[13px] text-ink-4 text-center">
                  Search clients, tasks, invoices.
                  <div className="text-[11px] mt-1">↑↓ to move · Enter to open · Esc to close</div>
                </div>
              )
            ) : (
              <>
                {query.trim().length === 0 && recents.length > 0 && (
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-ink-4 uppercase tracking-wide bg-bg-2 border-b border-ink-6">
                    Recent
                  </div>
                )}
                <ul ref={listRef} className="max-h-[360px] overflow-y-auto py-1">
                  {visible.map((r, idx) => {
                    const Icon = TYPE_ICONS[r.type]
                    const tone = TYPE_TONE[r.type]
                    const active = idx === activeIdx
                    return (
                      <li key={`${r.type}-${r.id}`}>
                        <button
                          data-result-row
                          onClick={() => handleSelect(r)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            active ? 'bg-brand-tint/40' : 'hover:bg-bg-2'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg ${tone} flex items-center justify-center flex-shrink-0`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{r.title}</p>
                            <p className="text-xs text-ink-4 truncate">{r.subtitle}</p>
                          </div>
                          <span className="text-[10px] text-ink-4 uppercase font-medium">{TYPE_LABEL[r.type]}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
