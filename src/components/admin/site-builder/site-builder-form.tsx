'use client'

/**
 * Unified Site Builder form. Drives admin's full website setup for a client.
 *
 * Architecture:
 *   - Reads + writes site_configs.draft_data via server actions
 *   - All sections auto-render from the vertical's Zod schema (no per-field UI)
 *   - Auto-saves on change, debounced 800ms
 *   - "Publish" button validates strictly + promotes draft → published
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Sparkles, ExternalLink, History, Monitor, Smartphone, RefreshCw, ChevronDown, ChevronRight, Circle } from 'lucide-react'
import { saveDraft, publishSite } from '@/lib/site-config/actions'
import { RestaurantSiteSchema } from '@/lib/site-schemas'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import { createClient } from '@/lib/supabase/client'
import { FieldRenderer } from './field-renderer'
import { UploadProvider, type UploadAssetFn } from './upload-context'
import { SECTIONS, GROUPS, readinessScore, type SectionKey } from './sections'
import BrandAssistPanel from './brand-assist-panel'
import HistoryDrawer from './history-drawer'
import AssetLibraryPicker from './asset-library-picker'
import DesignStudioPanel from './design-studio-panel'
import type { Brand } from '@/lib/site-schemas/shared'

interface SiteBuilderFormProps {
  clientId: string
  clientSlug: string
  initialData: RestaurantSite
  initialPublishedAt: string | null
  initialVersion: number
}

// SECTIONS, GROUPS, readinessScore now imported from ./sections so the
// catalogue is shared between the form and any future readiness widgets.

export default function SiteBuilderForm({
  clientId, clientSlug, initialData, initialPublishedAt, initialVersion,
}: SiteBuilderFormProps) {
  const [data, setData] = useState<RestaurantSite>(initialData)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishedAt, setPublishedAt] = useState<string | null>(initialPublishedAt)
  const [version, setVersion] = useState<number>(initialVersion)
  const [activeSection, setActiveSection] = useState<SectionKey>('identity')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['identity', 'content', 'trust', 'configuration']))
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [previewKey, setPreviewKey] = useState<number>(0)
  const [historyOpen, setHistoryOpen] = useState<boolean>(false)
  const [libraryOpen, setLibraryOpen] = useState<boolean>(false)
  const libraryPick = useRef<((url: string) => void) | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatch = useRef<Partial<RestaurantSite>>({})

  // Auto-save (debounced)
  const scheduleSave = useCallback((patch: Partial<RestaurantSite>) => {
    pendingPatch.current = { ...pendingPatch.current, ...patch }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const toSend = pendingPatch.current
      pendingPatch.current = {}
      setSaving(true)
      setSaveError(null)
      const res = await saveDraft(clientId, toSend)
      setSaving(false)
      if (res.success) {
        setSavedAt(new Date().toISOString())
        // Bump preview iframe key so it reloads with fresh draft
        setPreviewKey(k => k + 1)
      } else {
        setSaveError(res.error)
      }
    }, 800)
  }, [clientId])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  function handleSectionChange<K extends keyof RestaurantSite>(key: K, next: RestaurantSite[K]) {
    setData(prev => ({ ...prev, [key]: next }))
    scheduleSave({ [key]: next } as Partial<RestaurantSite>)
  }

  async function handlePublish() {
    setPublishing(true)
    setPublishError(null)

    // Flush any pending save first
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      const pending = pendingPatch.current
      pendingPatch.current = {}
      if (Object.keys(pending).length) await saveDraft(clientId, pending)
    }

    const res = await publishSite(clientId)
    setPublishing(false)
    if (res.success) {
      setPublishedAt(res.data!.published_at)
      setVersion(res.data!.version)
    } else {
      setPublishError(res.error)
    }
  }

  // Schema introspection for top-level shape
  const schemaShape = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = (RestaurantSiteSchema as any)._def
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape
    return shape as Record<string, import('zod').ZodTypeAny>
  }, [])

  const activeSchema = schemaShape[activeSection]

  // Readiness score + per-section completeness, computed from the validators
  // declared in sections.ts
  const readiness = useMemo(() => readinessScore(data), [data])

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /**
   * Jump to a section by parsing labels like "Hero → Headline".
   * Expands the section's group if collapsed and scrolls form to top.
   */
  function jumpToMissingItem(label: string) {
    const sectionTitle = label.split('→')[0]?.trim().toLowerCase()
    const target = SECTIONS.find(s => s.title.toLowerCase() === sectionTitle)
    if (!target) return
    setExpandedGroups(prev => new Set([...prev, target.group]))
    setActiveSection(target.key)
    // Scroll form panel into view
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  // Library opener — surfaces existing assets and resolves the picked URL
  // back to the field that triggered it.
  const openLibrary = useCallback((onPick: (url: string) => void) => {
    libraryPick.current = onPick
    setLibraryOpen(true)
  }, [])

  // Upload handler — pushes to client-assets bucket, returns public URL
  const uploadAsset = useCallback<UploadAssetFn>(async (file) => {
    try {
      const supabase = createClient()
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      const path = `${clientId}/site-builder/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage
        .from('client-assets')
        .upload(path, file, { upsert: false, contentType: file.type })
      if (error) return { error: error.message }
      const { data } = supabase.storage.from('client-assets').getPublicUrl(path)
      return { url: data.publicUrl }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Upload failed' }
    }
  }, [clientId])

  return (
    <UploadProvider upload={uploadAsset} openLibrary={openLibrary}>
    <div className="grid grid-cols-12 gap-4">
      {/* Left rail: readiness + grouped section nav */}
      <aside className="col-span-2 space-y-3 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pb-4">
        {/* Readiness score card */}
        <div className="bg-white border border-ink-6 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-4">Readiness</span>
            <span className={`text-[11px] font-semibold ${readiness.score >= 80 ? 'text-emerald-600' : readiness.score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {readiness.score}%
            </span>
          </div>
          <div className="h-1.5 bg-ink-6 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${readiness.score >= 80 ? 'bg-emerald-500' : readiness.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${readiness.score}%` }}
            />
          </div>
          {readiness.missing.length > 0 ? (
            <p className="text-[11px] text-ink-3 mt-2">
              {readiness.missing.length} item{readiness.missing.length === 1 ? '' : 's'} to fix before publish
            </p>
          ) : (
            <p className="text-[11px] text-emerald-600 mt-2 font-medium">Ready to publish</p>
          )}
        </div>

        {/* Grouped section nav */}
        <div className="space-y-1">
          {GROUPS.map(group => {
            const groupSections = SECTIONS.filter(s => s.group === group.key)
            const isExpanded = expandedGroups.has(group.key)
            const groupComplete = groupSections.filter(s => readiness.perSection[s.key]?.complete).length
            return (
              <div key={group.key}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3 hover:text-ink"
                >
                  <span className="flex items-center gap-1">
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {group.label}
                  </span>
                  <span className="text-ink-4 font-normal text-[10px]">{groupComplete}/{groupSections.length}</span>
                </button>
                {isExpanded && (
                  <div className="space-y-0.5 pl-1">
                    {groupSections.map(s => {
                      const isActive = activeSection === s.key
                      const meta = readiness.perSection[s.key]
                      const hasIssues = meta && meta.missing.length > 0
                      return (
                        <button
                          key={s.key}
                          onClick={() => setActiveSection(s.key)}
                          className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-start gap-2 ${
                            isActive
                              ? 'bg-brand text-white'
                              : 'hover:bg-bg-2 text-ink'
                          }`}
                        >
                          <span className={`shrink-0 mt-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ${
                            meta?.complete
                              ? isActive ? 'bg-white text-brand' : 'bg-emerald-500 text-white'
                              : hasIssues
                                ? isActive ? 'bg-amber-200 text-brand' : 'bg-amber-400 text-white'
                                : isActive ? 'border border-white/40' : 'border border-ink-5'
                          }`}>
                            {meta?.complete && <CheckCircle2 className="w-2.5 h-2.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium leading-tight">{s.title}</span>
                            <span className={`block text-[10px] truncate ${isActive ? 'text-white/80' : 'text-ink-3'}`}>{s.subtitle}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Status footer */}
        <div className="border-t border-ink-6 pt-3 px-1">
          <div className="flex items-center gap-1.5 text-[11px]">
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-ink-3" />
                <span className="text-ink-3">Saving…</span>
              </>
            ) : saveError ? (
              <>
                <AlertCircle className="w-3 h-3 text-red-600" />
                <span className="text-red-600 font-medium truncate" title={saveError}>{saveError}</span>
              </>
            ) : savedAt ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span className="text-ink-3">Saved {timeAgo(savedAt)}</span>
              </>
            ) : (
              <span className="text-ink-4">No changes</span>
            )}
          </div>
          <div className="text-[11px] text-ink-4 mt-2">
            {publishedAt ? `v${version} · ${timeAgo(publishedAt)}` : 'Unpublished'}
          </div>
        </div>
      </aside>

      {/* Center: form */}
      <div className="col-span-4">
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          {activeSection === 'brand' && (
            <>
              <DesignStudioPanel
                brand={data.brand}
                businessContext={{
                  displayName: data.identity.displayName,
                  tagline: data.identity.tagline ?? undefined,
                  vertical: data.identity.vertical,
                }}
                onApply={(patch) => handleSectionChange('brand', { ...data.brand, ...patch } as Brand)}
              />
              <BrandAssistPanel
                brand={data.brand}
                onApply={(patch) => handleSectionChange('brand', { ...data.brand, ...patch } as Brand)}
              />
            </>
          )}
          {activeSchema ? (
            <FieldRenderer
              key={activeSection}
              schema={activeSchema}
              fieldName={String(activeSection)}
              value={data[activeSection]}
              onChange={(next) => handleSectionChange(activeSection, next as RestaurantSite[typeof activeSection])}
              label=""
            />
          ) : (
            <p className="text-sm text-ink-3">Section not found.</p>
          )}
        </div>

        {/* Publish bar */}
        <div className="bg-white rounded-xl border border-ink-6 p-4 mt-4 space-y-3">
          {readiness.missing.length > 0 && (
            <details className="group">
              <summary className="text-xs cursor-pointer flex items-center gap-2 text-amber-700 hover:text-amber-800 list-none">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="font-medium">{readiness.missing.length} item{readiness.missing.length === 1 ? '' : 's'} to fix before publish</span>
                <ChevronDown className="w-3 h-3 ml-auto group-open:rotate-180 transition-transform" />
              </summary>
              <ul className="mt-2 ml-5 space-y-1 text-[11px]">
                {readiness.missing.map((m, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => jumpToMissingItem(m)}
                      className="text-ink-3 hover:text-brand hover:underline text-left"
                    >
                      · {m}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-ink-3">
            {publishError ? (
              <span className="text-red-600 font-medium">{publishError}</span>
            ) : publishedAt ? (
              <>Last published <strong className="text-ink">v{version}</strong> · {timeAgo(publishedAt)}</>
            ) : (
              <>Draft only — not yet live.</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/public/sites/${clientSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-3 hover:text-ink rounded-lg border border-ink-6"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Raw API
            </a>
            <button
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-3 hover:text-ink rounded-lg border border-ink-6"
            >
              <History className="w-3.5 h-3.5" /> History
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="bg-ink hover:bg-black text-white text-sm font-semibold rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Right: live preview iframe */}
      <div className="col-span-6 sticky top-4 self-start">
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-ink-6 bg-bg-2/50">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPreviewMode('desktop')}
                className={`p-1.5 rounded-md transition-colors ${previewMode === 'desktop' ? 'bg-white text-ink shadow-sm' : 'text-ink-4 hover:text-ink'}`}
                aria-label="Desktop preview"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPreviewMode('mobile')}
                className={`p-1.5 rounded-md transition-colors ${previewMode === 'mobile' ? 'bg-white text-ink shadow-sm' : 'text-ink-4 hover:text-ink'}`}
                aria-label="Mobile preview"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPreviewKey(k => k + 1)}
                className="ml-1 p-1.5 rounded-md text-ink-4 hover:text-ink transition-colors"
                aria-label="Refresh preview"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[11px] text-ink-4 uppercase tracking-wider font-semibold">Live preview · draft</span>
          </div>
          <div className={`bg-bg-2 flex justify-center ${previewMode === 'mobile' ? 'p-4' : ''}`} style={{ height: 'calc(100vh - 160px)' }}>
            <iframe
              key={previewKey}
              src={`/preview/sites/${clientSlug}?mode=draft&_=${previewKey}`}
              className={`bg-white ${previewMode === 'mobile' ? 'rounded-lg shadow-md' : 'w-full h-full'}`}
              style={previewMode === 'mobile' ? { width: 390, height: '100%', maxHeight: '100%' } : { border: 'none' }}
              title="Site preview"
            />
          </div>
        </div>
      </div>
    </div>
    <HistoryDrawer
      clientId={clientId}
      clientSlug={clientSlug}
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      onReverted={() => {
        // Trigger a reload — simplest approach: reload the page so server
        // component fetches the new draft. The drawer closes itself first.
        window.location.reload()
      }}
    />
    <AssetLibraryPicker
      clientId={clientId}
      open={libraryOpen}
      onClose={() => { setLibraryOpen(false); libraryPick.current = null }}
      onPick={(url) => {
        libraryPick.current?.(url)
        libraryPick.current = null
      }}
    />
    </UploadProvider>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return new Date(iso).toLocaleDateString()
}
