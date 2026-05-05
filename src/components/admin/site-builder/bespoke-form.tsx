'use client'

/**
 * Bespoke generation form. Brief + reference URLs + generate button.
 * Live preview iframe shows the generated site immediately after.
 */

import { useState } from 'react'
import { Loader2, Sparkles, Plus, Trash2, Link2, RefreshCw, ExternalLink, AlertTriangle, Check, Wand2 } from 'lucide-react'
import GenerationProgressModal from './generation-progress-modal'

interface Props {
  clientId: string
  clientSlug: string
  clientName: string
  initialBrief: string
  initialRefs: string[]
  currentVersion: number | null
  currentGeneratedAt: string | null
  currentModel: string | null
}

const BESPOKE_STEPS = [
  'Reading client profile + onboarding context',
  'Studying reference sites for inspiration',
  'Designing visual identity + layout',
  'Composing custom HTML + CSS',
  'Polishing typography + micro-interactions',
  'Finalizing the build',
]

export default function BespokeForm({
  clientId, clientSlug, clientName, initialBrief, initialRefs,
  currentVersion, currentGeneratedAt, currentModel,
}: Props) {
  const [brief, setBrief] = useState(initialBrief)
  const [refUrls, setRefUrls] = useState<string[]>(initialRefs.length > 0 ? initialRefs : [''])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progressOpen, setProgressOpen] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const [version, setVersion] = useState<number | null>(currentVersion)
  const [generatedAt, setGeneratedAt] = useState<string | null>(currentGeneratedAt)
  const [composing, setComposing] = useState(false)
  const [composerDirection, setComposerDirection] = useState('')

  async function composeBriefFromProfile() {
    setComposing(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bespoke-compose-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          direction: composerDirection.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError([json.error, json.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`)
      } else {
        setBrief(json.brief)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setComposing(false)
  }

  function addRef() {
    if (refUrls.length >= 4) return
    setRefUrls(rs => [...rs, ''])
  }
  function updateRef(i: number, v: string) {
    setRefUrls(rs => rs.map((r, idx) => idx === i ? v : r))
  }
  function removeRef(i: number) {
    setRefUrls(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : [''])
  }

  async function generate() {
    if (!brief.trim()) return
    setRunning(true)
    setDone(false)
    setError(null)
    setProgressOpen(true)
    try {
      const refs = refUrls.map(r => r.trim()).filter(Boolean)
      const res = await fetch('/api/admin/bespoke-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          brief: brief.trim(),
          referenceUrls: refs,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError([json.error, json.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`)
      } else {
        setDone(true)
        setVersion(json.version)
        setGeneratedAt(new Date().toISOString())
        setPreviewKey(k => k + 1)
        setTimeout(() => setProgressOpen(false), 1500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setRunning(false)
  }

  return (
    <div className="flex-1 grid grid-cols-12 min-h-0">
      {/* Left: brief + refs + generate */}
      <section className="col-span-4 border-r border-ink-6 bg-white overflow-y-auto p-5 space-y-5">
        {/* Tier explainer */}
        <div className="bg-gradient-to-br from-amber-50 via-white to-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-semibold text-ink">Bespoke Premium</p>
              <p className="text-[11px] text-ink-3 mt-1 leading-snug">
                Claude designs a complete custom-coded HTML + CSS site from scratch. Maximum design freedom — no template, no schema. Slower to generate (~60-120s) but produces a site that doesn&apos;t look like any other Apnosh client.
              </p>
            </div>
          </div>
        </div>

        {/* Current state */}
        {version != null && generatedAt && (
          <div className="bg-bg-2/50 border border-ink-6 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-4">Current version</span>
              <span className="text-[12px] font-semibold text-ink">v{version}</span>
            </div>
            <p className="text-[11px] text-ink-3">
              Generated {new Date(generatedAt).toLocaleString()}{currentModel ? ` · ${currentModel}` : ''}
            </p>
          </div>
        )}

        {/* Brief composer card */}
        <div className="bg-gradient-to-br from-brand/5 via-white to-brand/5 border border-brand/30 rounded-xl p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Wand2 className="w-4 h-4 text-brand mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-ink">Compose brief from profile</p>
              <p className="text-[11px] text-ink-3 mt-0.5">
                Generate a deeply-tailored brief from {clientName}&apos;s onboarding data + existing website. Uses their actual goals, voice, customer types, brand colors, and offerings.
              </p>
            </div>
          </div>
          <input
            type="text"
            value={composerDirection}
            onChange={e => setComposerDirection(e.target.value)}
            placeholder="Optional: bias the brief (e.g. 'lean editorial', 'more playful', 'cocktail bar mood')"
            className="w-full text-[12px] border border-ink-6 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-brand/20 outline-none"
          />
          <button
            onClick={composeBriefFromProfile}
            disabled={composing}
            className="w-full bg-ink hover:bg-black text-white text-[11px] font-semibold rounded-md px-3 py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {composing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            {composing ? 'Composing brief…' : brief ? 'Recompose brief' : 'Compose brief from profile'}
          </button>
        </div>

        {/* Brief */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1.5">Design brief</label>
          <textarea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder='Click "Compose brief from profile" above to auto-generate a brief tuned to this client, or write your own. Be specific: name the mood, the typography family, the color story, the photographic feel.'
            className="w-full min-h-[280px] border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none resize-y font-mono leading-relaxed"
          />
          <p className="text-[10px] text-ink-3 italic mt-1.5">
            Claude reads the client&apos;s profile + existing website automatically — your brief biases the design direction on top of that ground truth.
          </p>
        </div>

        {/* Reference URLs */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">Reference sites (optional, up to 4)</label>
            <button
              onClick={addRef}
              disabled={refUrls.length >= 4}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:text-brand-dark disabled:opacity-40"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          <div className="space-y-2">
            {refUrls.map((url, i) => (
              <div key={i} className="flex items-start gap-2">
                <Link2 className="w-3.5 h-3.5 text-ink-4 mt-2.5 shrink-0" />
                <input
                  type="url"
                  value={url}
                  onChange={e => updateRef(i, e.target.value)}
                  placeholder={i === 0 ? 'https://aviary.fineagain.com' : 'https://...'}
                  className="flex-1 border border-ink-6 rounded px-2.5 py-1.5 text-[12px] focus:ring-2 focus:ring-brand/20 outline-none"
                />
                {refUrls.length > 1 && (
                  <button onClick={() => removeRef(i)} className="text-ink-4 hover:text-red-600 mt-2 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-ink-3 italic mt-1.5">
            Sites Claude should study for inspiration on layout, voice, density. We extract their text content; Claude reasons about it as design reference.
          </p>
        </div>

        <button
          onClick={generate}
          disabled={!brief.trim() || running}
          className="w-full bg-gradient-to-r from-amber-700 to-orange-700 hover:opacity-90 text-white text-sm font-semibold rounded-lg px-4 py-3 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {running ? 'Generating…' : version != null ? 'Regenerate site' : 'Generate bespoke site'}
        </button>

        {error && !progressOpen && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
            <div className="text-[11px] text-red-700">{error}</div>
          </div>
        )}
        {done && !progressOpen && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <div className="text-[11px] text-emerald-700">Bespoke site v{version} ready.</div>
          </div>
        )}
      </section>

      {/* Right: preview iframe */}
      <section className="col-span-8 bg-bg-2 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-2 p-3 border-b border-ink-6 bg-white shrink-0">
          <div className="text-[11px] text-ink-3">
            {version != null
              ? <>Live bespoke site · v{version}</>
              : <>No bespoke site generated yet — generate one to preview</>}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPreviewKey(k => k + 1)}
              className="p-1.5 rounded-md text-ink-4 hover:text-ink hover:bg-bg-2"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <a
              href={`/bespoke/sites/${clientSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md text-ink-4 hover:text-ink hover:bg-bg-2"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {version != null ? (
            <iframe
              key={previewKey}
              src={`/bespoke/sites/${clientSlug}?_=${previewKey}`}
              className="w-full h-full border-0 bg-white"
              title={`Bespoke site for ${clientName}`}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-ink-4 text-sm">
              The preview shows up here once you generate.
            </div>
          )}
        </div>
      </section>

      <GenerationProgressModal
        open={progressOpen}
        steps={BESPOKE_STEPS}
        running={running}
        done={done}
        error={error}
        title="Generating bespoke site with Claude"
        successMessage={`Site v${version ?? '?'} ready — preview is live in the right pane.`}
        onClose={() => setProgressOpen(false)}
      />
    </div>
  )
}
