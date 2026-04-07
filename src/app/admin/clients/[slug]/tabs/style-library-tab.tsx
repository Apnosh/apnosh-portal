'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BookOpen, Search, Filter, ChevronDown, Archive, Copy, X, Eye,
  Loader2, ExternalLink, Code,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { StyleLibraryEntry, TemplateType, PostPlatform } from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TEMPLATE_STYLES: Record<TemplateType, { label: string; color: string }> = {
  insight: { label: 'Insight', color: 'bg-purple-50 text-purple-700' },
  stat: { label: 'Stat', color: 'bg-blue-50 text-blue-700' },
  tip: { label: 'Tip', color: 'bg-emerald-50 text-emerald-700' },
  compare: { label: 'Compare', color: 'bg-amber-50 text-amber-700' },
  result: { label: 'Result', color: 'bg-rose-50 text-rose-700' },
  photo: { label: 'Photo', color: 'bg-cyan-50 text-cyan-700' },
  custom: { label: 'Custom', color: 'bg-ink-6 text-ink-3' },
}

const PLATFORM_STYLES: Record<PostPlatform, { label: string; color: string }> = {
  instagram: { label: 'IG', color: 'bg-pink-50 text-pink-700' },
  tiktok: { label: 'TT', color: 'bg-slate-100 text-slate-700' },
  linkedin: { label: 'LI', color: 'bg-blue-50 text-blue-700' },
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StyleLibraryTab({ clientId }: { clientId: string }) {
  const supabase = createClient()

  const [entries, setEntries] = useState<StyleLibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [templateFilter, setTemplateFilter] = useState<string>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'date' | 'post_code'>('date')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('style_library')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'approved')

    if (sortBy === 'date') {
      query = query.order('approved_at', { ascending: false })
    } else {
      query = query.order('post_code', { ascending: false })
    }

    const { data } = await query
    if (data) setEntries(data as StyleLibraryEntry[])
    setLoading(false)
  }, [clientId, supabase, sortBy])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const filtered = entries.filter(e => {
    if (templateFilter !== 'all' && e.template_type !== templateFilter) return false
    if (platformFilter !== 'all' && e.platform !== platformFilter) return false
    return true
  })

  async function archiveEntry(id: string) {
    await supabase.from('style_library').update({ status: 'archived' }).eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setExpandedId(null)
  }

  async function toggleGolden(id: string, current: boolean) {
    await supabase.from('style_library').update({ is_golden: !current }).eq('id', id)
    setEntries(prev => prev.map(e => e.id === id ? { ...e, is_golden: !current } : e))
  }

  async function saveStyleNotes(id: string, notes: string) {
    await supabase.from('style_library').update({ style_notes: notes || null }).eq('id', id)
    setEntries(prev => prev.map(e => e.id === id ? { ...e, style_notes: notes || null } : e))
  }

  async function duplicateToQueue(entry: StyleLibraryEntry) {
    await supabase.from('content_queue').insert({
      client_id: clientId,
      input_text: `Duplicate of ${entry.post_code}: ${entry.caption ?? ''}`,
      template_type: entry.template_type,
      platform: entry.platform,
      size: entry.size ?? 'feed',
      status: 'drafting',
      drafts: entry.html_source ? [{
        image_url: entry.image_url ?? '',
        html_source: entry.html_source,
        caption: entry.caption ?? '',
        hashtags: entry.hashtags ?? '',
      }] : [],
    })
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={templateFilter} onChange={e => setTemplateFilter(e.target.value)} className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white">
          <option value="all">All Templates</option>
          {Object.entries(TEMPLATE_STYLES).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white">
          <option value="all">All Platforms</option>
          {Object.entries(PLATFORM_STYLES).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as 'date' | 'post_code')} className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white">
          <option value="date">Sort by Date</option>
          <option value="post_code">Sort by Code</option>
        </select>
        <span className="text-xs text-ink-4 ml-auto">{filtered.length} posts</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 animate-pulse">
              <div className="aspect-square bg-ink-6 rounded-t-xl" />
              <div className="p-3 space-y-2">
                <div className="h-3 w-16 bg-ink-6 rounded" />
                <div className="h-3 w-full bg-ink-6 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <BookOpen className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No approved posts yet.</p>
          <p className="text-xs text-ink-4 mt-1">Posts are added here when approved from the content queue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(entry => (
            <div key={entry.id} className={`bg-white rounded-xl border overflow-hidden group ${entry.is_golden ? 'border-amber-300 ring-1 ring-amber-200' : 'border-ink-6'}`}>
              {/* Thumbnail */}
              <button
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                className="w-full"
              >
                {entry.image_url ? (
                  <div className="aspect-square relative overflow-hidden">
                    <img src={entry.image_url} alt={entry.post_code} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ) : (
                  <div className="aspect-square bg-bg-2 flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-ink-5" />
                  </div>
                )}
              </button>

              {/* Card info */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-ink">{entry.post_code}</span>
                  <div className="flex gap-1">
                    {entry.template_type && (
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${TEMPLATE_STYLES[entry.template_type]?.color ?? 'bg-ink-6 text-ink-3'}`}>
                        {TEMPLATE_STYLES[entry.template_type]?.label ?? entry.template_type}
                      </span>
                    )}
                    {entry.platform && (
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${PLATFORM_STYLES[entry.platform]?.color ?? 'bg-ink-6 text-ink-3'}`}>
                        {PLATFORM_STYLES[entry.platform]?.label ?? entry.platform}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-ink-4">
                  {new Date(entry.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {entry.size && <> &middot; {entry.size}</>}
                </p>
              </div>

              {/* Expanded detail */}
              {expandedId === entry.id && (
                <div className="border-t border-ink-6 p-3 space-y-3">
                  {entry.caption && (
                    <div>
                      <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide">Caption</span>
                      <p className="text-xs text-ink-2 mt-0.5 whitespace-pre-line">{entry.caption}</p>
                    </div>
                  )}
                  {entry.hashtags && (
                    <div>
                      <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide">Hashtags</span>
                      <p className="text-xs text-ink-3 mt-0.5">{entry.hashtags}</p>
                    </div>
                  )}
                  {entry.performance_notes && (
                    <div>
                      <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide">Performance</span>
                      <p className="text-xs text-ink-2 mt-0.5">{entry.performance_notes}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide">Style Notes</span>
                    <textarea
                      defaultValue={entry.style_notes ?? ''}
                      onBlur={e => saveStyleNotes(entry.id, e.target.value)}
                      placeholder="Describe what works about this post's design..."
                      rows={2}
                      className="w-full mt-1 border border-ink-6 rounded-lg px-2.5 py-1.5 text-xs text-ink-2 placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
                    />
                  </div>
                  {entry.html_source && (
                    <details className="text-xs">
                      <summary className="text-ink-4 cursor-pointer flex items-center gap-1 hover:text-ink-2">
                        <Code className="w-3 h-3" /> HTML Source
                      </summary>
                      <pre className="mt-2 p-3 bg-bg-2 rounded-lg overflow-x-auto text-[10px] text-ink-3 font-mono leading-relaxed max-h-48">
                        {entry.html_source}
                      </pre>
                    </details>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-ink-6">
                    <button
                      onClick={() => toggleGolden(entry.id, entry.is_golden)}
                      className={`text-[10px] font-medium transition-colors flex items-center gap-1 ${
                        entry.is_golden ? 'text-amber-600 hover:text-amber-700' : 'text-ink-4 hover:text-amber-500'
                      }`}
                    >
                      {entry.is_golden ? '\u2605' : '\u2606'} {entry.is_golden ? 'Golden Example' : 'Mark Golden'}
                    </button>
                    <button
                      onClick={() => duplicateToQueue(entry)}
                      className="text-[10px] font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Duplicate as Draft
                    </button>
                    <button
                      onClick={() => archiveEntry(entry.id)}
                      className="text-[10px] font-medium text-ink-4 hover:text-red-500 transition-colors flex items-center gap-1 ml-auto"
                    >
                      <Archive className="w-3 h-3" /> Archive
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
