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
  X, Loader2, Sparkles, Globe, Wand2, Check, AlertTriangle, ChevronDown, Link2,
} from 'lucide-react'
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
] as const

export default function RefineDrawer({ clientId, open, onClose, initialSection }: Props) {
  const [tab, setTab] = useState<'refine' | 'source'>('refine')

  // Refine state
  const [prompt, setPrompt] = useState('')
  const [scope, setScope] = useState<'site' | 'section'>(initialSection ? 'section' : 'site')
  const [section, setSection] = useState<SectionKey | null>(initialSection ?? null)

  // Source state
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<typeof SOURCE_KINDS[number]['id']>('auto')

  // Shared state
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [patchPreview, setPatchPreview] = useState<unknown>(null)

  if (!open) return null

  async function runRefine() {
    if (!prompt.trim()) return
    setRunning(true); setError(null); setSuccess(null); setPatchPreview(null)
    try {
      const res = await fetch('/api/admin/refine-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          prompt: prompt.trim(),
          scope: scope === 'section' && section ? 'section' : 'site',
          sections: scope === 'section' && section ? [section] : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || `HTTP ${res.status}`)
      } else {
        setPatchPreview(json.patch)
        setSuccess(`Updated. ${describePatch(json.patch)}`)
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setRunning(false)
  }

  async function runSource() {
    if (!url.trim()) return
    setRunning(true); setError(null); setSuccess(null); setPatchPreview(null)
    try {
      const res = await fetch('/api/admin/extract-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          url: url.trim(),
          kind,
          apply: true,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || `HTTP ${res.status}`)
      } else {
        setPatchPreview(json.patch)
        setSuccess(`Pulled ${json.kind ?? 'content'}. ${describePatch(json.patch)}`)
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
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
            className={`flex-1 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 ${
              tab === 'refine' ? 'bg-white text-ink border-b-2 border-brand -mb-[2px]' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Refine with prompt
          </button>
          <button
            onClick={() => setTab('source')}
            className={`flex-1 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 ${
              tab === 'source' ? 'bg-white text-ink border-b-2 border-brand -mb-[2px]' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Pull from sources
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

              <button
                onClick={runRefine}
                disabled={!prompt.trim() || running || (scope === 'section' && !section)}
                className="w-full bg-ink hover:bg-black text-white text-sm font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {running ? 'Refining…' : 'Refine draft'}
              </button>
            </>
          )}

          {tab === 'source' && (
            <>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Source URL</label>
                <div className="flex gap-2">
                  <Link2 className="w-3.5 h-3.5 text-ink-4 mt-2.5 ml-1" />
                  <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="dosikbbq.com / menu URL / Google Maps link / Instagram profile…"
                    className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Source type</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {SOURCE_KINDS.map(k => (
                    <button
                      key={k.id}
                      onClick={() => setKind(k.id)}
                      className={`text-left p-2 rounded border ${
                        kind === k.id
                          ? 'border-brand bg-brand/5 ring-1 ring-brand'
                          : 'border-ink-6 hover:border-ink-5 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-ink">{k.label}</span>
                        {kind === k.id && <Check className="w-3 h-3 text-brand" />}
                      </div>
                      <p className="text-[10px] text-ink-3 mt-0.5">{k.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[11px] text-ink-3 bg-bg-2/40 border border-ink-6 rounded-lg p-3">
                <strong className="text-ink">What we&apos;ll pull:</strong>
                <ul className="mt-1.5 ml-4 list-disc space-y-0.5">
                  <li>Tagline + about story (existing site)</li>
                  <li>Menu categories + AYCE programs (menu page)</li>
                  <li>Address, hours, reviews (Google profile)</li>
                  <li>Voice cues + tagline ideas (social bio)</li>
                </ul>
                <p className="mt-2 italic">We never invent content. If a field isn&apos;t visible, it&apos;s left alone.</p>
              </div>

              <button
                onClick={runSource}
                disabled={!url.trim() || running}
                className="w-full bg-ink hover:bg-black text-white text-sm font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                {running ? 'Pulling…' : 'Pull + apply'}
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
