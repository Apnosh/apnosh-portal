'use client'

/**
 * Refine + Import drawer — the "AI tools" panel.
 *
 * Two tabs:
 *   - Refine with prompt: natural language ("more upscale") → partial diff
 *     applied to the current draft. Includes scope picker (whole site vs
 *     specific section) and prompt-suggestion chips.
 *   - Pull from sources: paste a URL (existing site / menu / GBP / social)
 *     → Claude fetches + extracts → applies as a partial diff. Auto-detects
 *     source type or pick manually.
 */

import { useState } from 'react'
import {
  X, Loader2, Sparkles, Globe, Wand2, Check, AlertTriangle, ChevronDown, Link2, Plus, Trash2, Compass, Zap, Award,
} from 'lucide-react'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import GenerationProgressModal, { PROGRESS_STEPS } from './generation-progress-modal'
import { SECTIONS } from './sections'
import type { SectionKey } from './sections'

interface Props {
  clientId: string
  open: boolean
  onClose: () => void
  /** Optional default — open the refine tab pre-scoped to this section. */
  initialSection?: SectionKey
}

const REFINE_QUICK = [
  'Make the hero more energetic',
  'Switch the whole vibe to upscale + editorial',
  'Tighten and shorten all copy',
  'Make the voice warmer + more inviting',
  'Add more personality + character throughout',
  'Make it minimal and modern — less ornament',
  'Optimize all copy for SEO',
  'Make the whole site feel like a Michelin guide entry',
]

const SOURCE_KINDS = [
  { id: 'auto',    label: 'Auto-detect',    hint: 'Detects website / menu / GBP / social' },
  { id: 'website', label: 'Existing site',  hint: 'Pull tagline, about, FAQs, hours' },
  { id: 'menu',    label: 'Menu page',      hint: 'Pull menu categories + AYCE programs' },
  { id: 'gbp',     label: 'Google profile', hint: 'Pull address, hours, recent reviews' },
  { id: 'social',  label: 'Social profile', hint: 'Pull voice cues + tagline ideas' },
  { id: 'press',   label: 'Press article',  hint: 'Pull testimonials from press feature' },
] as const

type SourceKind = typeof SOURCE_KINDS[number]['id']

interface SourceRow {
  id: string
  url: string
  kind: SourceKind
}

export default function RefineDrawer({ clientId, open, onClose, initialSection }: Props) {
  const [tab, setTab] = useState<'refine' | 'source' | 'recreate'>('refine')

  // Refine state
  const [prompt, setPrompt] = useState('')
  const [scope, setScope] = useState<'site' | 'section'>(initialSection ? 'section' : 'site')
  const [section, setSection] = useState<SectionKey | null>(initialSection ?? null)
  const [quality, setQuality] = useState<'best' | 'fast'>('best')
  const [variantCount, setVariantCount] = useState<1 | 2 | 3>(3)

  // Variants picker state
  type Variant = { strategy: string; patch?: Record<string, unknown>; site: RestaurantSite }
  const [variants, setVariants] = useState<Variant[]>([])
  const [activeVariantIdx, setActiveVariantIdx] = useState<number>(0)
  const [applyingVariant, setApplyingVariant] = useState(false)

  // Re-create state
  const [recreatePrompt, setRecreatePrompt] = useState('')
  const [recreateVariantCount, setRecreateVariantCount] = useState<1 | 2 | 3>(3)
  const PRESERVE_OPTIONS: { key: SectionKey; label: string; hint: string }[] = [
    { key: 'identity',   label: 'Identity',     hint: 'Display name, vertical, template' },
    { key: 'brand',      label: 'Brand',        hint: 'Colors, fonts, design system' },
    { key: 'locations',  label: 'Locations',    hint: 'Addresses, hours, phone' },
    { key: 'social',     label: 'Social',       hint: 'IG / TikTok / FB profile URLs' },
    { key: 'reservation',label: 'Reservation',  hint: 'Booking URL + label' },
  ]
  const [preserve, setPreserve] = useState<Set<SectionKey>>(new Set(['identity', 'locations', 'social', 'reservation']))

  // Source state — multiple URL rows, each with its own kind
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([
    { id: rid(), url: '', kind: 'auto' },
  ])

  function addSourceRow() {
    setSourceRows(rows => [...rows, { id: rid(), url: '', kind: 'auto' }])
  }
  function updateSourceRow(id: string, patch: Partial<SourceRow>) {
    setSourceRows(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  function removeSourceRow(id: string) {
    setSourceRows(rows => rows.length > 1 ? rows.filter(r => r.id !== id) : rows)
  }

  // Auto-research state
  const [discovering, setDiscovering] = useState(false)
  const [discoverNote, setDiscoverNote] = useState<string | null>(null)

  async function autoResearch() {
    setDiscovering(true)
    setError(null)
    setDiscoverNote(null)
    try {
      const res = await fetch('/api/admin/discover-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || `HTTP ${res.status}`)
      } else {
        type Discovered = { url: string; kind: SourceKind; verified: boolean; note?: string }
        const discovered = (json.sources as Discovered[] | undefined) ?? []
        if (discovered.length === 0) {
          setDiscoverNote('No sources discovered. Make sure clients.website and clients.socials are filled in.')
        } else {
          // Replace the rows entirely with discovered URLs (capped at 6)
          const newRows: SourceRow[] = discovered.slice(0, 6).map(d => ({
            id: rid(),
            url: d.url,
            kind: d.kind,
          }))
          setSourceRows(newRows)
          setDiscoverNote(`Found ${discovered.length} candidate${discovered.length === 1 ? '' : 's'}. ${json.summary?.verified ?? 0} verified online. Review + adjust, then pull.`)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setDiscovering(false)
  }

  // Shared state
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [patchPreview, setPatchPreview] = useState<unknown>(null)

  // Progress modal state — track which kind of generation is in flight
  type ProgressKind = 'refine' | 'recreate' | 'source' | null
  const [progressKind, setProgressKind] = useState<ProgressKind>(null)
  const [progressDone, setProgressDone] = useState(false)
  const progressOpen = progressKind !== null
  const progressSteps =
    progressKind === 'recreate' ? PROGRESS_STEPS.recreate :
    progressKind === 'refine'   ? PROGRESS_STEPS.refine :
    progressKind === 'source'   ? PROGRESS_STEPS.source :
    PROGRESS_STEPS.refine
  const progressTitle =
    progressKind === 'recreate' ? 'Re-creating site with Claude' :
    progressKind === 'source'   ? 'Pulling content from sources' :
    'Refining with Claude'
  const progressSuccess =
    progressKind === 'recreate'
      ? (variants.length > 1 ? 'Options ready — pick one in the drawer.' : 'Site recreated. Reloading…')
      : progressKind === 'source'
        ? 'Sources merged into draft. Reloading…'
        : (variants.length > 1 ? 'Options ready — pick one in the drawer.' : 'Refinement applied. Reloading…')

  if (!open) return null

  async function runRefine() {
    if (!prompt.trim()) return
    setRunning(true); setError(null); setSuccess(null); setPatchPreview(null); setVariants([])
    setProgressKind('refine'); setProgressDone(false)
    try {
      const res = await fetch('/api/admin/refine-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          prompt: prompt.trim(),
          scope: scope === 'section' && section ? 'section' : 'site',
          sections: scope === 'section' && section ? [section] : undefined,
          variants: variantCount,
          quality,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || `HTTP ${res.status}`)
      } else if (json.mode === 'variants' && Array.isArray(json.variants)) {
        setVariants(json.variants as Variant[])
        setActiveVariantIdx(0)
        setSuccess(`${json.variants.length} variants ready — pick one below`)
        setProgressDone(true)
        setTimeout(() => setProgressKind(null), 1500)
      } else {
        setPatchPreview(json.patch)
        setSuccess(`Updated. ${describePatch(json.patch)}`)
        setProgressDone(true)
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      setProgressKind(null)
    }
    setRunning(false)
  }

  async function runRecreate() {
    if (!recreatePrompt.trim()) return
    setRunning(true); setError(null); setSuccess(null); setVariants([])
    setProgressKind('recreate'); setProgressDone(false)
    try {
      const res = await fetch('/api/admin/recreate-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          prompt: recreatePrompt.trim(),
          preserve: Array.from(preserve),
          variants: recreateVariantCount,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || `HTTP ${res.status}`)
      } else if (json.mode === 'variants' && Array.isArray(json.variants)) {
        setVariants(json.variants as Variant[])
        setActiveVariantIdx(0)
        setSuccess(`${json.variants.length} fresh directions ready — pick one below`)
        setProgressDone(true)
        setTimeout(() => setProgressKind(null), 1500)
      } else {
        setSuccess('Site recreated. Reloading…')
        setProgressDone(true)
        setTimeout(() => window.location.reload(), 1000)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      setProgressKind(null)
    }
    setRunning(false)
  }

  async function applyVariant(idx: number) {
    const v = variants[idx]
    if (!v) return
    setApplyingVariant(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/apply-variant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, site: v.site }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || `HTTP ${res.status}`)
      } else {
        setSuccess('Variant applied. Reloading…')
        setTimeout(() => window.location.reload(), 800)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setApplyingVariant(false)
  }

  async function runSource() {
    const validSources = sourceRows
      .map(r => ({ url: r.url.trim(), kind: r.kind }))
      .filter(r => r.url.length > 0)
    if (validSources.length === 0) return

    setRunning(true); setError(null); setSuccess(null); setPatchPreview(null)
    setProgressKind('source'); setProgressDone(false)
    try {
      const res = await fetch('/api/admin/extract-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          sources: validSources,
          apply: true,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || `HTTP ${res.status}`)
      } else {
        setPatchPreview(json.patch)
        const okCount = (json.sources as Array<{ error: string | null }> | undefined)?.filter(s => !s.error).length ?? validSources.length
        const failCount = validSources.length - okCount
        const failNote = failCount > 0 ? ` (${failCount} source${failCount === 1 ? '' : 's'} failed to fetch)` : ''
        setSuccess(`Pulled from ${okCount} source${okCount === 1 ? '' : 's'}${failNote}. ${describePatch(json.patch)}`)
        setProgressDone(true)
        setTimeout(() => window.location.reload(), 1800)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      setProgressKind(null)
    }
    setRunning(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 w-[480px] max-w-[92vw] bg-white border-l border-ink-6 shadow-2xl z-50 flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-ink-6">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold text-ink">AI Tools</h3>
              <p className="text-[11px] text-ink-3 mt-0.5">Refine the draft or pull content from a source.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Tabs */}
        <div className="flex border-b border-ink-6 bg-bg-2/50">
          <button
            onClick={() => setTab('refine')}
            className={`flex-1 py-2.5 text-[11px] font-semibold flex items-center justify-center gap-1.5 ${
              tab === 'refine' ? 'bg-white text-ink border-b-2 border-brand -mb-[2px]' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Refine
          </button>
          <button
            onClick={() => setTab('recreate')}
            className={`flex-1 py-2.5 text-[11px] font-semibold flex items-center justify-center gap-1.5 ${
              tab === 'recreate' ? 'bg-white text-ink border-b-2 border-brand -mb-[2px]' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" /> Re-create
          </button>
          <button
            onClick={() => setTab('source')}
            className={`flex-1 py-2.5 text-[11px] font-semibold flex items-center justify-center gap-1.5 ${
              tab === 'source' ? 'bg-white text-ink border-b-2 border-brand -mb-[2px]' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Pull sources
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'refine' && (
            <>
              {/* Scope picker */}
              <div className="bg-bg-2/50 border border-ink-6 rounded-lg p-3">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-2">Scope</label>
                <div className="flex gap-1 mb-2">
                  <button
                    onClick={() => { setScope('site'); setSection(null) }}
                    className={`flex-1 text-[11px] font-medium px-2.5 py-1.5 rounded ${scope === 'site' ? 'bg-ink text-white' : 'bg-white border border-ink-6 text-ink-3'}`}
                  >Whole site</button>
                  <button
                    onClick={() => setScope('section')}
                    className={`flex-1 text-[11px] font-medium px-2.5 py-1.5 rounded ${scope === 'section' ? 'bg-ink text-white' : 'bg-white border border-ink-6 text-ink-3'}`}
                  >One section</button>
                </div>
                {scope === 'section' && (
                  <select
                    value={section ?? ''}
                    onChange={e => setSection(e.target.value as SectionKey)}
                    className="w-full text-[12px] border border-ink-6 rounded px-2 py-1.5 bg-white"
                  >
                    <option value="">Pick a section…</option>
                    {SECTIONS.map(s => (
                      <option key={s.key} value={s.key}>{s.title}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Prompt input */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Instruction</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g. Make the whole site feel more upscale and editorial. Tighten the hero. Refine the about story to lead with the founder."
                  className="w-full min-h-[100px] border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none resize-y"
                />
              </div>

              {/* Quick prompts */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Quick prompts</label>
                <div className="flex flex-wrap gap-1.5">
                  {REFINE_QUICK.map(q => (
                    <button
                      key={q}
                      onClick={() => setPrompt(q)}
                      className="text-[11px] px-2 py-1 rounded-full bg-bg-2 hover:bg-ink-6 text-ink-3 hover:text-ink"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality + variants */}
              <div className="bg-bg-2/50 border border-ink-6 rounded-lg p-3 space-y-2.5">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Design quality</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setQuality('best')}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded ${quality === 'best' ? 'bg-ink text-white' : 'bg-white border border-ink-6 text-ink-3'}`}
                    >
                      <Award className="w-3 h-3" /> Best (Opus, slower)
                    </button>
                    <button
                      onClick={() => setQuality('fast')}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded ${quality === 'fast' ? 'bg-ink text-white' : 'bg-white border border-ink-6 text-ink-3'}`}
                    >
                      <Zap className="w-3 h-3" /> Fast (Sonnet)
                    </button>
                  </div>
                  <p className="text-[10px] text-ink-3 mt-1.5 italic">
                    {quality === 'best'
                      ? 'Strategic design pass with Opus — better headlines, voice, hierarchy.'
                      : 'One-shot Sonnet — quick iterations, lower fidelity.'}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Variants</label>
                  <div className="flex gap-1">
                    {([1, 2, 3] as const).map(n => (
                      <button
                        key={n}
                        onClick={() => setVariantCount(n)}
                        className={`flex-1 text-[11px] font-medium px-2.5 py-1.5 rounded ${variantCount === n ? 'bg-ink text-white' : 'bg-white border border-ink-6 text-ink-3'}`}
                      >
                        {n === 1 ? 'Apply directly' : `${n} options`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-ink-3 mt-1.5 italic">
                    {variantCount === 1
                      ? 'Direct apply — the only result is saved as your new draft.'
                      : `Claude generates ${variantCount} distinct directions and you pick the best one.`}
                  </p>
                </div>
              </div>

              <button
                onClick={runRefine}
                disabled={!prompt.trim() || running || (scope === 'section' && !section)}
                className="w-full bg-ink hover:bg-black text-white text-sm font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {running
                  ? (variantCount > 1 ? 'Generating options…' : 'Refining…')
                  : (variantCount > 1 ? `Generate ${variantCount} options` : 'Refine draft')}
              </button>

              {/* Variants picker */}
              {variants.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-ink-4 font-semibold">Pick a direction</p>
                  <div className="space-y-2">
                    {variants.map((v, i) => {
                      const isActive = activeVariantIdx === i
                      return (
                        <article
                          key={i}
                          className={`border rounded-lg p-3 cursor-pointer transition ${
                            isActive ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-ink-6 hover:border-ink-5 bg-white'
                          }`}
                          onClick={() => setActiveVariantIdx(i)}
                        >
                          <div className="flex items-start gap-2">
                            <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isActive ? 'bg-brand text-white' : 'bg-bg-2 text-ink-3'
                            }`}>{String.fromCharCode(65 + i)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-ink-3 leading-snug line-clamp-3">{v.strategy}</p>
                              {/* Quick swatches if brand patched */}
                              {(v.patch as { brand?: { primaryColor?: string; secondaryColor?: string; accentColor?: string } })?.brand && (
                                <div className="flex gap-1 mt-1.5">
                                  {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map(k => {
                                    const c = (v.patch as { brand?: Record<string, string> })?.brand?.[k]
                                    return c ? <span key={k} className="w-3 h-3 rounded-sm border border-ink-6" style={{ backgroundColor: c }} /> : null
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => applyVariant(activeVariantIdx)}
                    disabled={applyingVariant}
                    className="w-full bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg px-4 py-2 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {applyingVariant ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Apply option {String.fromCharCode(65 + activeVariantIdx)}
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'recreate' && (
            <>
              <div className="bg-gradient-to-br from-amber-50 via-white to-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Wand2 className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-ink">Re-create from scratch</p>
                    <p className="text-[11px] text-ink-3 mt-0.5">
                      Fully regenerates every section — hero, about, FAQs, voice, design system. Use when Refine isn&apos;t aggressive enough.
                    </p>
                  </div>
                </div>
              </div>

              {/* Direction prompt */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Design direction</label>
                <textarea
                  value={recreatePrompt}
                  onChange={e => setRecreatePrompt(e.target.value)}
                  placeholder='e.g. "An upscale Korean steakhouse experience that leads with the Alki waterfront. Think wood, leather, low-light. Editorial copy, sparing words. Sunset is the hero."'
                  className="w-full min-h-[120px] border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none resize-y"
                />
              </div>

              {/* Quick prompts */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Big direction starters</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Upscale Michelin-guide editorial',
                    'Late-night cocktail bar / speakeasy mood',
                    'Bold neon Tokyo street energy',
                    'Warm artisan bakery / farm-to-table',
                    'Minimal modernist boutique',
                    'Sports bar / late-night high-energy',
                    'Beachfront luxe / occasion destination',
                    'Playful pop / boba shop / college casual',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => setRecreatePrompt(q)}
                      className="text-[11px] px-2 py-1 rounded-full bg-bg-2 hover:bg-ink-6 text-ink-3 hover:text-ink"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preserve list */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Preserve verbatim</label>
                <p className="text-[10px] text-ink-3 mb-2">Anything checked is kept as-is. Anything unchecked gets fully rewritten by Claude.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESERVE_OPTIONS.map(o => {
                    const checked = preserve.has(o.key)
                    return (
                      <label
                        key={o.key}
                        className={`flex items-start gap-2 p-2 rounded border cursor-pointer ${
                          checked ? 'border-brand bg-brand/5' : 'border-ink-6 hover:border-ink-5 bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const next = new Set(preserve)
                            if (e.target.checked) next.add(o.key)
                            else next.delete(o.key)
                            setPreserve(next)
                          }}
                          className="mt-0.5 accent-current"
                        />
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-ink">{o.label}</div>
                          <div className="text-[10px] text-ink-3 truncate">{o.hint}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Variants */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Directions</label>
                <div className="flex gap-1">
                  {([1, 2, 3] as const).map(n => (
                    <button
                      key={n}
                      onClick={() => setRecreateVariantCount(n)}
                      className={`flex-1 text-[11px] font-medium px-2.5 py-1.5 rounded ${recreateVariantCount === n ? 'bg-ink text-white' : 'bg-white border border-ink-6 text-ink-3'}`}
                    >
                      {n === 1 ? 'Apply directly' : `${n} options`}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-ink-3 mt-1.5 italic">
                  {recreateVariantCount === 1
                    ? 'Direct replacement — only result is saved as your draft.'
                    : `Claude generates ${recreateVariantCount} fundamentally different directions (different mood, design, voice, hierarchy).`}
                </p>
              </div>

              <button
                onClick={runRecreate}
                disabled={!recreatePrompt.trim() || running}
                className="w-full bg-gradient-to-r from-amber-700 to-orange-700 hover:opacity-90 text-white text-sm font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {running
                  ? (recreateVariantCount > 1 ? 'Generating fresh directions…' : 'Re-creating site…')
                  : (recreateVariantCount > 1 ? `Re-create — ${recreateVariantCount} options` : 'Re-create site')}
              </button>

              {/* Variants picker (shared with refine tab) */}
              {variants.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-ink-6">
                  <p className="text-[11px] uppercase tracking-wider text-ink-4 font-semibold">Pick a direction</p>
                  <div className="space-y-2">
                    {variants.map((v, i) => {
                      const isActive = activeVariantIdx === i
                      const ds = (v.site?.brand as { designSystem?: { radius?: string; surface?: string; typeWeight?: string } })?.designSystem
                      return (
                        <article
                          key={i}
                          className={`border rounded-lg p-3 cursor-pointer transition ${
                            isActive ? 'border-amber-600 bg-amber-50/40 ring-1 ring-amber-600' : 'border-ink-6 hover:border-ink-5 bg-white'
                          }`}
                          onClick={() => setActiveVariantIdx(i)}
                        >
                          <div className="flex items-start gap-2">
                            <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isActive ? 'bg-amber-600 text-white' : 'bg-bg-2 text-ink-3'
                            }`}>{String.fromCharCode(65 + i)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-ink leading-snug">
                                {(v.site?.hero as { headline?: string })?.headline || 'Untitled direction'}
                              </p>
                              <p className="text-[11px] text-ink-3 leading-snug mt-0.5 line-clamp-2">{v.strategy}</p>
                              <div className="flex items-center gap-2 mt-1.5">
                                {/* Color swatches */}
                                <div className="flex gap-0.5">
                                  {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map(k => {
                                    const c = (v.site?.brand as unknown as Record<string, unknown>)?.[k] as string | undefined
                                    return c ? <span key={k} className="w-3 h-3 rounded-sm border border-ink-6" style={{ backgroundColor: c }} /> : null
                                  })}
                                </div>
                                {ds && (
                                  <span className="text-[10px] text-ink-4 uppercase tracking-wider">
                                    {[ds.radius, ds.surface, ds.typeWeight].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => applyVariant(activeVariantIdx)}
                    disabled={applyingVariant}
                    className="w-full bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold rounded-lg px-4 py-2 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {applyingVariant ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Apply option {String.fromCharCode(65 + activeVariantIdx)}
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'source' && (
            <>
              {/* Auto-research */}
              <div className="bg-gradient-to-br from-brand/5 via-white to-brand/5 border border-brand/30 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Compass className="w-4 h-4 text-brand mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-ink">Auto-research from profile</p>
                    <p className="text-[11px] text-ink-3 mt-0.5">We&apos;ll find their website, menu page, social profiles, and Google listing automatically — no copy-pasting URLs.</p>
                  </div>
                </div>
                <button
                  onClick={autoResearch}
                  disabled={discovering}
                  className="w-full mt-2 bg-ink hover:bg-black text-white text-[11px] font-semibold rounded-md px-3 py-1.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {discovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Compass className="w-3 h-3" />}
                  {discovering ? 'Researching…' : 'Auto-research sources'}
                </button>
                {discoverNote && (
                  <p className="text-[11px] text-ink-3 mt-2 italic">{discoverNote}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">Sources ({sourceRows.length}/6)</label>
                  <button
                    onClick={addSourceRow}
                    disabled={sourceRows.length >= 6}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:text-brand-dark disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" /> Add another
                  </button>
                </div>
                <div className="space-y-2">
                  {sourceRows.map((row, idx) => (
                    <div key={row.id} className="border border-ink-6 rounded-lg p-2.5 space-y-2 bg-white">
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-bg-2 text-ink-3 flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">
                          {idx + 1}
                        </div>
                        <div className="flex-1 flex gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-ink-4 mt-2 shrink-0" />
                          <input
                            type="url"
                            value={row.url}
                            onChange={e => updateSourceRow(row.id, { url: e.target.value })}
                            placeholder={examplePlaceholder(idx)}
                            className="flex-1 border border-ink-6 rounded px-2 py-1.5 text-[12px] focus:ring-2 focus:ring-brand/20 outline-none"
                          />
                        </div>
                        {sourceRows.length > 1 && (
                          <button
                            onClick={() => removeSourceRow(row.id)}
                            className="text-ink-4 hover:text-red-600 mt-1 shrink-0"
                            aria-label="Remove source"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 ml-7">
                        {SOURCE_KINDS.map(k => (
                          <button
                            key={k.id}
                            onClick={() => updateSourceRow(row.id, { kind: k.id })}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                              row.kind === k.id
                                ? 'bg-ink text-white'
                                : 'bg-bg-2 text-ink-3 hover:text-ink hover:bg-ink-6'
                            }`}
                            title={k.hint}
                          >
                            {k.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[11px] text-ink-3 bg-bg-2/40 border border-ink-6 rounded-lg p-3">
                <strong className="text-ink">Add as many as you have:</strong>
                <ul className="mt-1.5 ml-4 list-disc space-y-0.5">
                  <li>The current website (homepage)</li>
                  <li>The menu page or PDF</li>
                  <li>Google Maps / Business Profile listing</li>
                  <li>Instagram / TikTok / Facebook profile</li>
                  <li>Press features (Eater, Seattle Times, etc.)</li>
                </ul>
                <p className="mt-2 italic">All sources are sent to Claude in one pass so it can reconcile across them. We never invent content — fields not visible are left alone.</p>
              </div>

              <button
                onClick={runSource}
                disabled={running || sourceRows.every(r => !r.url.trim())}
                className="w-full bg-ink hover:bg-black text-white text-sm font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                {running
                  ? `Pulling from ${sourceRows.filter(r => r.url.trim()).length}…`
                  : `Pull from ${sourceRows.filter(r => r.url.trim()).length || 0} source${sourceRows.filter(r => r.url.trim()).length === 1 ? '' : 's'} + apply`}
              </button>
            </>
          )}

          {/* Status */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
              <div className="text-[11px] text-red-700">{error}</div>
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-[11px] text-emerald-700">{success}</div>
            </div>
          )}
          {patchPreview ? (
            <details className="border border-ink-6 rounded-lg">
              <summary className="px-3 py-2 cursor-pointer text-[11px] text-ink-3 flex items-center gap-1.5 list-none">
                <ChevronDown className="w-3 h-3" />
                See what changed
              </summary>
              <pre className="px-3 py-2 text-[10px] text-ink-3 bg-bg-2/30 overflow-x-auto max-h-[200px]">
                {JSON.stringify(patchPreview, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </aside>

      <GenerationProgressModal
        open={progressOpen}
        steps={progressSteps}
        running={running}
        done={progressDone}
        error={error}
        title={progressTitle}
        successMessage={progressSuccess}
        onClose={() => { setProgressKind(null); setProgressDone(false) }}
      />
    </>
  )
}

function describePatch(patch: unknown): string {
  if (typeof patch !== 'object' || !patch) return 'Reloading'
  const keys = Object.keys(patch as Record<string, unknown>)
  if (!keys.length) return 'No changes'
  if (keys.length === 1) return `Updated ${keys[0]}.`
  if (keys.length <= 3) return `Updated ${keys.join(', ')}.`
  return `Updated ${keys.length} sections.`
}

function rid(): string {
  return Math.random().toString(36).slice(2, 9)
}

const PLACEHOLDERS = [
  'dosikbbq.com',
  'dosikbbq.com/menu/',
  'maps.google.com/...',
  'instagram.com/dosikbbq',
  'eater.com/seattle/...',
  'yelp.com/biz/...',
]
function examplePlaceholder(idx: number): string {
  return PLACEHOLDERS[idx] ?? 'https://...'
}
