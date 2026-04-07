'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Lightbulb, Plus, Filter, Loader2, Archive, CheckCircle, Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ContentConcept, ContentPillar, ConceptStatus, ContentType } from '@/types/database'

// ── Helpers ──────────────────────────────────────────────────────────

const statusConfig: Record<ConceptStatus, { label: string; color: string }> = {
  idea: { label: 'Idea', color: 'bg-blue-50 text-blue-700' },
  selected: { label: 'Selected', color: 'bg-brand-tint text-brand-dark' },
  briefed: { label: 'Briefed', color: 'bg-purple-50 text-purple-700' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-500' },
}

const contentTypeLabels: Partial<Record<ContentType, string>> = {
  reel_storytelling: 'Reel (Storytelling)',
  reel_showcase: 'Reel (Showcase)',
  reel_promo: 'Reel (Promo)',
  reel_general_ad: 'Reel (General Ad)',
  carousel_premium: 'Carousel (Premium)',
  carousel_standard: 'Carousel (Standard)',
  carousel_basic: 'Carousel (Basic)',
  static_post: 'Static Post',
  story: 'Story',
  blog: 'Blog',
  email: 'Email',
  gbp_post: 'GBP Post',
}

const sourceIcons: Record<string, typeof Sparkles> = {
  ai: Sparkles,
  manual: Lightbulb,
  client: CheckCircle,
}

interface BusinessOption {
  id: string
  name: string
}

// ── Component ────────────────────────────────────────────────────────

export default function ConceptsPage() {
  const supabase = createClient()

  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [selectedBiz, setSelectedBiz] = useState('')
  const [concepts, setConcepts] = useState<ContentConcept[]>([])
  const [pillars, setPillars] = useState<ContentPillar[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ConceptStatus | 'all'>('all')

  // Add concept form
  const [showAdd, setShowAdd] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addType, setAddType] = useState<ContentType>('static_post')
  const [addPillar, setAddPillar] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    async function loadBusinesses() {
      const { data } = await supabase
        .from('businesses')
        .select('id, name')
        .eq('onboarding_completed', true)
        .order('name')
      if (data) {
        setBusinesses(data)
        if (data.length > 0) setSelectedBiz(data[0].id)
      }
      setLoading(false)
    }
    loadBusinesses()
  }, [supabase])

  const fetchData = useCallback(async () => {
    if (!selectedBiz) return
    setLoading(true)

    const [conceptsRes, pillarsRes] = await Promise.all([
      supabase
        .from('content_concepts')
        .select('*')
        .eq('business_id', selectedBiz)
        .order('created_at', { ascending: false }),
      supabase
        .from('content_pillars')
        .select('*')
        .eq('business_id', selectedBiz)
        .eq('is_active', true)
        .order('sort_order'),
    ])

    if (conceptsRes.data) setConcepts(conceptsRes.data as ContentConcept[])
    if (pillarsRes.data) setPillars(pillarsRes.data as ContentPillar[])
    setLoading(false)
  }, [selectedBiz, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleAddConcept() {
    if (!addTitle.trim() || !selectedBiz || adding) return
    setAdding(true)

    const { error } = await supabase
      .from('content_concepts')
      .insert({
        business_id: selectedBiz,
        title: addTitle.trim(),
        description: addDescription.trim() || null,
        content_type: addType,
        pillar_id: addPillar || null,
        status: 'idea',
        source: 'manual',
      })

    if (!error) {
      setShowAdd(false)
      setAddTitle('')
      setAddDescription('')
      await fetchData()
    }

    setAdding(false)
  }

  async function updateConceptStatus(conceptId: string, newStatus: ConceptStatus) {
    await supabase
      .from('content_concepts')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', conceptId)

    setConcepts(prev =>
      prev.map(c => c.id === conceptId ? { ...c, status: newStatus } : c)
    )
  }

  const filtered = concepts.filter(c =>
    statusFilter === 'all' || c.status === statusFilter
  )

  // Group by pillar
  const byPillar = new Map<string, ContentConcept[]>()
  const noPillar: ContentConcept[] = []
  for (const c of filtered) {
    if (c.pillar_id) {
      if (!byPillar.has(c.pillar_id)) byPillar.set(c.pillar_id, [])
      byPillar.get(c.pillar_id)!.push(c)
    } else {
      noPillar.push(c)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/pipeline" className="text-ink-4 hover:text-ink transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Content Concepts</h1>
            <p className="text-ink-3 text-sm mt-1">Ideation pool. Select concepts to turn into briefs.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Concept
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedBiz}
          onChange={(e) => setSelectedBiz(e.target.value)}
          className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        >
          {businesses.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <div className="flex gap-1 border border-ink-6 rounded-lg p-0.5">
          {(['all', 'idea', 'selected', 'briefed', 'archived'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-brand-tint text-brand-dark'
                  : 'text-ink-3 hover:text-ink'
              }`}
            >
              {s === 'all' ? 'All' : statusConfig[s].label}
              {s !== 'all' && (
                <span className="ml-1 text-ink-4">
                  ({concepts.filter(c => c.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Add concept form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-ink">New Concept</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Title</label>
              <input
                type="text"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Concept title..."
                className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Description</label>
              <textarea
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder="Brief description..."
                rows={2}
                className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Content Type</label>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as ContentType)}
                className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                {Object.entries(contentTypeLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Pillar</label>
              <select
                value={addPillar}
                onChange={(e) => setAddPillar(e.target.value)}
                className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                <option value="">No pillar</option>
                {pillars.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddConcept}
              disabled={!addTitle.trim() || adding}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-ink-3 hover:text-ink transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Concepts grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 animate-pulse space-y-2">
              <div className="h-4 w-3/4 bg-ink-6 rounded" />
              <div className="h-3 w-1/2 bg-ink-6 rounded" />
              <div className="h-3 w-full bg-ink-6 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
            <Lightbulb className="w-6 h-6 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">No concepts yet</p>
          <p className="text-xs text-ink-4 mt-1">Add concepts manually or generate them with AI.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Concepts by pillar */}
          {pillars.map(pillar => {
            const pillarConcepts = byPillar.get(pillar.id) || []
            if (pillarConcepts.length === 0) return null
            return (
              <div key={pillar.id}>
                <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">{pillar.name}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pillarConcepts.map(concept => (
                    <ConceptCard key={concept.id} concept={concept} onStatusChange={updateConceptStatus} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Concepts without pillar */}
          {noPillar.length > 0 && (
            <div>
              <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">Uncategorized</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {noPillar.map(concept => (
                  <ConceptCard key={concept.id} concept={concept} onStatusChange={updateConceptStatus} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Concept Card ─────────────────────────────────────────────────────

function ConceptCard({
  concept,
  onStatusChange,
}: {
  concept: ContentConcept
  onStatusChange: (id: string, status: ConceptStatus) => void
}) {
  const SourceIcon = sourceIcons[concept.source] || Lightbulb
  const status = statusConfig[concept.status]

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink truncate">{concept.title}</div>
          {concept.description && (
            <p className="text-xs text-ink-3 mt-1 line-clamp-2">{concept.description}</p>
          )}
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${status.color}`}>
          {status.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-ink-4">
        <span className="uppercase tracking-wide">{contentTypeLabels[concept.content_type] || concept.content_type}</span>
        <span className="text-ink-6">|</span>
        <SourceIcon className="w-3 h-3" />
        <span className="capitalize">{concept.source}</span>
        {concept.score != null && (
          <>
            <span className="text-ink-6">|</span>
            <span>Score: {concept.score}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 pt-2 border-t border-ink-6">
        {concept.status === 'idea' && (
          <button
            onClick={() => onStatusChange(concept.id, 'selected')}
            className="text-[10px] font-medium text-brand hover:text-brand-dark transition-colors"
          >
            Select
          </button>
        )}
        {concept.status === 'selected' && (
          <button
            onClick={() => onStatusChange(concept.id, 'briefed')}
            className="text-[10px] font-medium text-purple-600 hover:text-purple-700 transition-colors"
          >
            Create Brief
          </button>
        )}
        {concept.status !== 'archived' && (
          <button
            onClick={() => onStatusChange(concept.id, 'archived')}
            className="text-[10px] font-medium text-ink-4 hover:text-ink-2 transition-colors ml-auto"
          >
            Archive
          </button>
        )}
      </div>
    </div>
  )
}
