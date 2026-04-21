'use client'

/**
 * Docs tab on the client detail page.
 *
 * Shows every client_docs row (the markdown content imported from Notion
 * or created manually) organized by category. Click a doc to view/edit
 * in a side panel.
 *
 * This is the "knowledge" layer of the client record -- strategy,
 * competitor analysis, content pillars, meeting notes, SOPs, etc. Lives
 * alongside the structured data (contacts, interactions, billing) on
 * the rest of the client page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, ChevronRight, ChevronDown, Search, Loader2, Plus, X,
  Lightbulb, Target, Swords, Pencil, Calendar, StickyNote, Book, Package,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface DocRow {
  id: string
  title: string
  category: string | null
  parent_doc_id: string | null
  body_markdown: string | null
  source: string | null
  created_at: string
  updated_at: string
}

const CATEGORY_META: Record<string, { label: string; icon: typeof FileText; order: number }> = {
  summary:              { label: 'Summary',            icon: FileText,   order: 1 },
  strategy:             { label: 'Strategy',           icon: Target,     order: 2 },
  content_pillars:      { label: 'Content pillars',    icon: Package,    order: 3 },
  content_planning:     { label: 'Content planning',   icon: Calendar,   order: 4 },
  content_ideas:        { label: 'Content ideas',      icon: Lightbulb,  order: 5 },
  competitor_analysis:  { label: 'Competitor analysis', icon: Swords,    order: 6 },
  meeting_notes:        { label: 'Meeting notes',      icon: StickyNote, order: 7 },
  onboarding:           { label: 'Onboarding',         icon: Book,       order: 8 },
  playbook:             { label: 'Playbook',           icon: Book,       order: 9 },
  other:                { label: 'Other',              icon: FileText,   order: 10 },
}

export default function DocsTab({ clientId }: { clientId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DocRow | null>(null)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('client_docs')
      .select('id, title, category, parent_doc_id, body_markdown, source, created_at, updated_at')
      .eq('client_id', clientId)
      .order('category')
      .order('title')
    setDocs((data ?? []) as DocRow[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  // Group docs by category (top-level only — nested docs become their own rows for now)
  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim()
    const filtered = q
      ? docs.filter(d =>
          d.title.toLowerCase().includes(q) ||
          (d.body_markdown?.toLowerCase().includes(q) ?? false))
      : docs

    const map = new Map<string, DocRow[]>()
    for (const d of filtered) {
      const cat = d.category ?? 'other'
      const list = map.get(cat) ?? []
      list.push(d)
      map.set(cat, list)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99))
  }, [docs, search])

  function toggleCategory(cat: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-ink-4">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (docs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
        <FileText className="w-8 h-8 text-ink-4 mx-auto mb-3" />
        <p className="text-sm font-medium text-ink-2">No docs for this client yet</p>
        <p className="text-xs text-ink-4 mt-1">
          Strategy, competitor analysis, content plans, and meeting notes will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
      {/* Sidebar: categorized doc list */}
      <div className="bg-white rounded-xl border border-ink-6 p-3 h-fit md:sticky md:top-4">
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            type="text"
            placeholder="Search docs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 border border-ink-6 rounded-md text-[13px] bg-bg-2 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>

        {grouped.map(([cat, categoryDocs]) => {
          const meta = CATEGORY_META[cat] ?? CATEGORY_META.other
          const Icon = meta.icon
          const isCollapsed = collapsed.has(cat)
          return (
            <div key={cat} className="mb-2">
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center gap-1.5 text-[11px] font-semibold text-ink-3 uppercase tracking-wide hover:text-ink py-1"
              >
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <Icon className="w-3 h-3" />
                {meta.label}
                <span className="ml-auto text-ink-4 normal-case tracking-normal">
                  {categoryDocs.length}
                </span>
              </button>
              {!isCollapsed && (
                <ul className="space-y-0.5 mt-1 ml-4">
                  {categoryDocs.map(d => (
                    <li key={d.id}>
                      <button
                        onClick={() => setSelected(d)}
                        className={`w-full text-left text-[13px] px-2 py-1 rounded transition-colors ${
                          selected?.id === d.id
                            ? 'bg-brand-tint/50 text-brand-dark font-medium'
                            : 'text-ink-2 hover:bg-bg-2'
                        }`}
                      >
                        {d.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {/* Viewer */}
      <div className="bg-white rounded-xl border border-ink-6 min-h-[400px]">
        {selected ? (
          <div>
            <div className="flex items-start justify-between gap-3 p-4 border-b border-ink-6">
              <div>
                <h3 className="text-base font-semibold text-ink">{selected.title}</h3>
                <p className="text-[11px] text-ink-4 mt-0.5">
                  {CATEGORY_META[selected.category ?? 'other']?.label}
                  {selected.source === 'notion_import' && ' · imported from Notion'}
                  {' · updated '}
                  {new Date(selected.updated_at).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-ink-4 hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 prose prose-sm max-w-none prose-headings:text-ink prose-p:text-ink-2 prose-a:text-brand prose-strong:text-ink prose-code:text-ink-2 prose-code:bg-bg-2 prose-code:px-1 prose-code:rounded">
              {selected.body_markdown
                ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selected.body_markdown}
                  </ReactMarkdown>
                )
                : <p className="text-ink-4 italic">(Empty document)</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-ink-4">
            <FileText className="w-8 h-8 mb-2" />
            <p className="text-sm">Select a doc from the left</p>
          </div>
        )}
      </div>
    </div>
  )
}
