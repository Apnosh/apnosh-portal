'use client'

/**
 * Bespoke generation form. Brief + reference URLs + generate button.
 * Live preview iframe shows the generated site immediately after.
 */

import { useEffect, useState } from 'react'
import { Loader2, Sparkles, Plus, Trash2, Link2, RefreshCw, ExternalLink, AlertTriangle, Check, Wand2, Layers, Gauge, Pin, PinOff, Image as ImageIcon, GitBranch, UserPlus, Download } from 'lucide-react'
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
  const [sectionTarget, setSectionTarget] = useState<string>('hero')
  const [sectionInstruction, setSectionInstruction] = useState('')
  const [regenSection, setRegenSection] = useState(false)
  const [critiquing, setCritiquing] = useState(false)
  const [critique, setCritique] = useState<null | {
    overallScore: number
    brand: string
    summary: string
    sections: { section: string; score: number; issue: string; fix: string }[]
    rewriteQueue: string[]
  }>(null)
  const [critiqueApplied, setCritiqueApplied] = useState<string[]>([])

  // Moodboard state
  interface MoodItem {
    id: string
    url: string | null
    image_url: string | null
    title: string | null
    notes: string | null
    tags: string[] | null
    pinned: boolean
    added_at: string
  }
  const [moodboard, setMoodboard] = useState<MoodItem[]>([])
  const [moodboardLoading, setMoodboardLoading] = useState(false)
  const [newMoodUrl, setNewMoodUrl] = useState('')
  const [newMoodNotes, setNewMoodNotes] = useState('')
  const [moodAdding, setMoodAdding] = useState(false)

  useEffect(() => {
    loadMoodboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function loadMoodboard() {
    setMoodboardLoading(true)
    try {
      const res = await fetch(`/api/admin/moodboard?clientId=${encodeURIComponent(clientId)}`)
      const json = await res.json()
      if (res.ok) setMoodboard(json.items || [])
    } catch { /* silent */ }
    setMoodboardLoading(false)
  }

  async function addMoodItem() {
    if (!newMoodUrl.trim()) return
    setMoodAdding(true)
    try {
      const res = await fetch('/api/admin/moodboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          url: newMoodUrl.trim(),
          notes: newMoodNotes.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (res.ok && json.item) {
        setMoodboard(m => [json.item, ...m])
        setNewMoodUrl('')
        setNewMoodNotes('')
      }
    } catch { /* silent */ }
    setMoodAdding(false)
  }

  async function togglePin(id: string, pinned: boolean) {
    try {
      const res = await fetch('/api/admin/moodboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pinned: !pinned }),
      })
      if (res.ok) {
        setMoodboard(m => m.map(i => i.id === id ? { ...i, pinned: !pinned } : i)
          .sort((a, b) => Number(b.pinned) - Number(a.pinned)))
      }
    } catch { /* silent */ }
  }

  // Designer handoff state
  interface HandoffStatus {
    handedOff: boolean
    repoFullName?: string
    repoUrl?: string
    deploymentUrl?: string | null
    deploymentReadyState?: string | null
    designerEmail?: string
    designerGithubUsername?: string
    handedOffAt?: string
    syncedAt?: string | null
    latestCommit?: { sha: string; author: string; message: string; date: string } | null
  }
  const [handoff, setHandoff] = useState<HandoffStatus | null>(null)
  const [handoffLoading, setHandoffLoading] = useState(false)
  const [handoffRunning, setHandoffRunning] = useState(false)
  const [designerEmail, setDesignerEmail] = useState('')
  const [designerGithub, setDesignerGithub] = useState('')
  const [handoffSyncing, setHandoffSyncing] = useState(false)

  useEffect(() => {
    loadHandoff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function loadHandoff() {
    setHandoffLoading(true)
    try {
      const res = await fetch(`/api/admin/bespoke-handoff?clientId=${encodeURIComponent(clientId)}`)
      const json = await res.json()
      if (res.ok) setHandoff(json)
    } catch { /* silent */ }
    setHandoffLoading(false)
  }

  async function runHandoff() {
    if (!designerEmail.trim() || !designerGithub.trim()) return
    setHandoffRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bespoke-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          designerEmail: designerEmail.trim(),
          designerGithubUsername: designerGithub.trim().replace(/^@/, ''),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError([json.error, json.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`)
      } else {
        await loadHandoff()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setHandoffRunning(false)
  }

  async function syncHandoff() {
    setHandoffSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bespoke-handoff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError([json.error, json.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`)
      } else if (json.changed) {
        setVersion(json.version)
        setGeneratedAt(new Date().toISOString())
        setPreviewKey(k => k + 1)
        await loadHandoff()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setHandoffSyncing(false)
  }

  async function removeMoodItem(id: string) {
    try {
      const res = await fetch(`/api/admin/moodboard?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok) setMoodboard(m => m.filter(i => i.id !== id))
    } catch { /* silent */ }
  }

  async function critiqueAndRefine(apply: boolean) {
    setCritiquing(true)
    setError(null)
    setDone(false)
    setCritiqueApplied([])
    try {
      const res = await fetch('/api/admin/bespoke-critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, apply, maxRewrites: 2 }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError([json.error, json.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`)
      } else {
        setCritique(json.critique)
        if (json.applied && json.rewrites) {
          setCritiqueApplied(json.rewrites.map((r: { section: string }) => r.section))
          setVersion(json.version)
          setGeneratedAt(new Date().toISOString())
          setPreviewKey(k => k + 1)
          setDone(true)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setCritiquing(false)
  }

  async function regenerateSection() {
    if (!sectionTarget) return
    setRegenSection(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch('/api/admin/bespoke-regenerate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          section: sectionTarget,
          instruction: sectionInstruction.trim() || undefined,
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
        setSectionInstruction('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setRegenSection(false)
  }

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

        {/* Persistent moodboard */}
        <div className="bg-gradient-to-br from-pink-50 via-white to-pink-50 border border-pink-200 rounded-xl p-3 space-y-2">
          <div className="flex items-start gap-2">
            <ImageIcon className="w-4 h-4 text-pink-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-ink">Moodboard for {clientName}</p>
              <p className="text-[11px] text-ink-3 mt-0.5">
                Inspiration sites that compound — every brief composition + generation studies these. Pin the ones to weight most heavily.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <input
              type="url"
              value={newMoodUrl}
              onChange={e => setNewMoodUrl(e.target.value)}
              placeholder="https://inspiration-site.com"
              className="w-full text-[12px] border border-ink-6 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-pink-500/20 outline-none"
            />
            <input
              type="text"
              value={newMoodNotes}
              onChange={e => setNewMoodNotes(e.target.value)}
              placeholder="Notes (optional): why this is inspiring — what to study"
              className="w-full text-[12px] border border-ink-6 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-pink-500/20 outline-none"
            />
            <button
              onClick={addMoodItem}
              disabled={!newMoodUrl.trim() || moodAdding}
              className="w-full bg-pink-700 hover:bg-pink-800 text-white text-[11px] font-semibold rounded-md px-3 py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {moodAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {moodAdding ? 'Adding…' : 'Add to moodboard'}
            </button>
          </div>
          {moodboardLoading ? (
            <div className="text-[11px] text-ink-3 italic py-1">Loading…</div>
          ) : moodboard.length === 0 ? (
            <div className="text-[11px] text-ink-3 italic py-1">No items yet. Add reference sites you keep coming back to.</div>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {moodboard.map(item => (
                <li key={item.id} className="bg-white border border-pink-200 rounded-md px-2 py-1.5 flex items-start gap-1.5 text-[11px]">
                  <button
                    onClick={() => togglePin(item.id, item.pinned)}
                    className={`shrink-0 mt-0.5 ${item.pinned ? 'text-pink-700' : 'text-ink-4 hover:text-pink-700'}`}
                    title={item.pinned ? 'Unpin' : 'Pin (high priority)'}
                  >
                    {item.pinned ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink hover:text-pink-700 font-medium truncate block"
                      >
                        {item.title || item.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    )}
                    {item.notes && (
                      <p className="text-ink-3 italic truncate">{item.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeMoodItem(item.id)}
                    className="shrink-0 mt-0.5 text-ink-4 hover:text-red-600"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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

        {/* Per-section regeneration — only when a site exists */}
        {version != null && (
          <div className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Layers className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[12px] font-semibold text-ink">Regenerate one section</p>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  Surgically rewrite a single section without touching the rest. Faster than a full regen and preserves the parts you love.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={sectionTarget}
                onChange={e => setSectionTarget(e.target.value)}
                className="text-[12px] border border-ink-6 rounded-md px-2 py-1.5 bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
              >
                <option value="hero">Hero</option>
                <option value="intro">Intro</option>
                <option value="about">About</option>
                <option value="offerings">Offerings / Menu</option>
                <option value="locations">Locations</option>
                <option value="breaker">Image breaker</option>
                <option value="testimonials">Testimonials</option>
                <option value="faq">FAQ</option>
                <option value="nav">Nav</option>
                <option value="footer">Footer</option>
              </select>
              <input
                type="text"
                value={sectionInstruction}
                onChange={e => setSectionInstruction(e.target.value)}
                placeholder="Optional: how should it change? (e.g. 'tighter copy, less stock-feeling')"
                className="flex-1 text-[12px] border border-ink-6 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              />
            </div>
            <button
              onClick={regenerateSection}
              disabled={regenSection || running}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold rounded-md px-3 py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {regenSection ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
              {regenSection ? `Regenerating ${sectionTarget}…` : `Regenerate ${sectionTarget}`}
            </button>
          </div>
        )}

        {/* Designer handoff — only when a site exists */}
        {version != null && (
          <div className="bg-gradient-to-br from-slate-50 via-white to-slate-50 border border-slate-300 rounded-xl p-3 space-y-2">
            <div className="flex items-start gap-2">
              <GitBranch className="w-4 h-4 text-slate-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[12px] font-semibold text-ink">Hand off to a designer</p>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  {handoff?.handedOff
                    ? 'Designer has the keys. Vercel auto-deploys their commits. Sync changes back when ready.'
                    : 'Spin up a private GitHub repo + Vercel project for this site and invite a designer.'}
                </p>
              </div>
            </div>

            {handoffLoading ? (
              <div className="text-[11px] text-ink-3 italic py-1">Loading…</div>
            ) : handoff?.handedOff ? (
              <div className="space-y-2">
                <div className="bg-white border border-slate-200 rounded-md p-2.5 space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-3 h-3 text-ink-4 shrink-0" />
                    <a
                      href={handoff.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-ink hover:text-brand truncate"
                    >
                      {handoff.repoFullName}
                    </a>
                  </div>
                  {handoff.deploymentUrl && (
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-3 h-3 text-ink-4 shrink-0" />
                      <a
                        href={handoff.deploymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink hover:text-brand truncate"
                      >
                        {handoff.deploymentUrl.replace(/^https?:\/\//, '')}
                      </a>
                      {handoff.deploymentReadyState && (
                        <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
                          handoff.deploymentReadyState === 'READY' ? 'bg-emerald-50 text-emerald-700'
                          : handoff.deploymentReadyState === 'ERROR' ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700'
                        }`}>
                          {handoff.deploymentReadyState}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-3 h-3 text-ink-4 shrink-0" />
                    <span className="text-ink-3 truncate">
                      {handoff.designerEmail} (@{handoff.designerGithubUsername})
                    </span>
                  </div>
                  {handoff.latestCommit && (
                    <div className="text-ink-3 italic truncate pt-1 border-t border-ink-6">
                      Last commit by {handoff.latestCommit.author}: &ldquo;{handoff.latestCommit.message.split('\n')[0]}&rdquo;
                    </div>
                  )}
                </div>
                <button
                  onClick={syncHandoff}
                  disabled={handoffSyncing}
                  className="w-full bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-md px-3 py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {handoffSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  {handoffSyncing ? 'Syncing…' : 'Pull designer’s edits back'}
                </button>
                {handoff.syncedAt && (
                  <p className="text-[10px] text-ink-4 italic text-center">
                    Last synced {new Date(handoff.syncedAt).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="email"
                  value={designerEmail}
                  onChange={e => setDesignerEmail(e.target.value)}
                  placeholder="Designer email"
                  className="w-full text-[12px] border border-ink-6 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-slate-500/20 outline-none"
                />
                <input
                  type="text"
                  value={designerGithub}
                  onChange={e => setDesignerGithub(e.target.value)}
                  placeholder="Designer GitHub username (e.g. janedoe)"
                  className="w-full text-[12px] border border-ink-6 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-slate-500/20 outline-none font-mono"
                />
                <button
                  onClick={runHandoff}
                  disabled={!designerEmail.trim() || !designerGithub.trim() || handoffRunning}
                  className="w-full bg-slate-800 hover:bg-black text-white text-[11px] font-semibold rounded-md px-3 py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {handoffRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitBranch className="w-3 h-3" />}
                  {handoffRunning ? 'Setting up repo + Vercel + invite…' : 'Hand off to designer'}
                </button>
                <p className="text-[10px] text-ink-4 italic">
                  Creates a private repo, links Vercel, invites the designer. They get email invites.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Critique loop — only when a site exists */}
        {version != null && (
          <div className="bg-gradient-to-br from-violet-50 via-white to-violet-50 border border-violet-200 rounded-xl p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Gauge className="w-4 h-4 text-violet-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[12px] font-semibold text-ink">Critique &amp; refine</p>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  Claude grades the current site against the brief, names what&apos;s weak, and rewrites the bottom 2 sections.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => critiqueAndRefine(false)}
                disabled={critiquing}
                className="flex-1 bg-white hover:bg-violet-50 text-violet-800 border border-violet-300 text-[11px] font-semibold rounded-md px-3 py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {critiquing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gauge className="w-3 h-3" />}
                Critique only
              </button>
              <button
                onClick={() => critiqueAndRefine(true)}
                disabled={critiquing}
                className="flex-1 bg-violet-700 hover:bg-violet-800 text-white text-[11px] font-semibold rounded-md px-3 py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {critiquing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Critique + auto-fix
              </button>
            </div>

            {critique && (
              <div className="bg-white border border-violet-200 rounded-md p-2.5 space-y-2 mt-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-700">Overall</span>
                  <span className={`text-lg font-bold ${critique.overallScore >= 8 ? 'text-emerald-700' : critique.overallScore >= 6 ? 'text-amber-700' : 'text-rose-700'}`}>
                    {critique.overallScore}/10
                  </span>
                  <span className="text-[11px] text-ink-3 italic truncate">{critique.brand}</span>
                </div>
                <p className="text-[11px] text-ink-2 leading-relaxed">{critique.summary}</p>
                <div className="border-t border-ink-6 pt-2 space-y-1">
                  {critique.sections.sort((a, b) => a.score - b.score).map(s => {
                    const wasRewritten = critiqueApplied.includes(s.section)
                    return (
                      <div key={s.section} className="flex items-start gap-2 text-[11px]">
                        <span className={`shrink-0 w-7 text-right font-semibold ${s.score >= 8 ? 'text-emerald-700' : s.score >= 6 ? 'text-amber-700' : 'text-rose-700'}`}>
                          {s.score}
                        </span>
                        <span className="shrink-0 w-20 font-medium text-ink uppercase tracking-wider text-[10px] pt-0.5">
                          {s.section}
                        </span>
                        <span className="text-ink-3 flex-1">{s.issue}</span>
                        {wasRewritten && (
                          <span className="shrink-0 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 rounded">
                            ✓ rewrote
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

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
