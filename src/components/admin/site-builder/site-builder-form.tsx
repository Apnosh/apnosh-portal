'use client'

/**
 * Unified Site Builder workspace.
 *
 * Layout (Figma-style three-pane workspace):
 *   - Top bar: breadcrumb · readiness · Design Studio · History · Publish
 *   - Left rail: grouped section nav with progress dots
 *   - Form pane: sticky section header + auto-rendered Zod form
 *   - Preview pane: device-framed iframe + zoom + refresh + draft/published toggle
 *
 * Cmd-K opens a command palette for fuzzy section-jumping.
 *
 * Design Studio (Claude prompt + presets + tokens) lives in a slide-over
 * drawer, accessible from the top bar — not buried in the Brand section.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2, CheckCircle2, AlertCircle, Sparkles, ExternalLink, History,
  Monitor, Smartphone, Tablet, RefreshCw, ChevronDown, ChevronRight,
  Wand2, ArrowLeft, Command, RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
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
import DesignStudioDrawer from './design-studio-drawer'
import CommandPalette from './command-palette'
import type { Brand } from '@/lib/site-schemas/shared'

interface SiteBuilderFormProps {
  clientId: string
  clientSlug: string
  clientName: string
  initialData: RestaurantSite
  initialPublishedAt: string | null
  initialVersion: number
}

type PreviewDevice = 'desktop' | 'tablet' | 'mobile'

const DEVICE_PRESETS: Record<PreviewDevice, { width: number; label: string; height?: number }> = {
  desktop: { width: 0,    label: 'Desktop' },           // 0 = fluid full-width
  tablet:  { width: 820,  label: 'Tablet',  height: 1180 },
  mobile:  { width: 390,  label: 'Mobile',  height: 844 },
}

export default function SiteBuilderForm({
  clientId, clientSlug, clientName, initialData, initialPublishedAt, initialVersion,
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
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [previewMode, setPreviewMode] = useState<'draft' | 'published'>('draft')
  const [previewKey, setPreviewKey] = useState<number>(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const libraryPick = useRef<((url: string) => void) | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatch = useRef<Partial<RestaurantSite>>({})
  const formScrollRef = useRef<HTMLDivElement | null>(null)

  // ----- Auto-save (debounced) -----
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

  // ----- Publish -----
  async function handlePublish() {
    setPublishing(true)
    setPublishError(null)
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

  // ----- Schema introspection for form rendering -----
  const schemaShape = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = (RestaurantSiteSchema as any)._def
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape
    return shape as Record<string, import('zod').ZodTypeAny>
  }, [])

  const activeSchema = schemaShape[activeSection]
  const activeSectionDef = SECTIONS.find(s => s.key === activeSection)
  const readiness = useMemo(() => readinessScore(data), [data])

  // ----- Helpers -----
  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function jumpToSection(key: SectionKey) {
    const target = SECTIONS.find(s => s.key === key)
    if (target) setExpandedGroups(prev => new Set([...prev, target.group]))
    setActiveSection(key)
    requestAnimationFrame(() => formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function jumpToMissingItem(label: string) {
    const sectionTitle = label.split('→')[0]?.trim().toLowerCase()
    const target = SECTIONS.find(s => s.title.toLowerCase() === sectionTitle)
    if (!target) return
    jumpToSection(target.key)
  }

  // ----- Asset library + upload -----
  const openLibrary = useCallback((onPick: (url: string) => void) => {
    libraryPick.current = onPick
    setLibraryOpen(true)
  }, [])

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

  // ----- Keyboard shortcuts -----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey
      // ⌘K — palette
      if (cmd && e.key === 'k') { e.preventDefault(); setPaletteOpen(true) }
      // ⌘D — design studio
      else if (cmd && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); setStudioOpen(true) }
      // ⌘↵ — publish
      else if (cmd && e.key === 'Enter') { e.preventDefault(); handlePublish() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- Derived values -----
  const readinessTone =
    readiness.score >= 80 ? 'emerald' :
    readiness.score >= 50 ? 'amber'   : 'red'

  const device = DEVICE_PRESETS[previewDevice]

  return (
    <UploadProvider upload={uploadAsset} openLibrary={openLibrary}>
      <div className="flex flex-col h-[calc(100vh-1rem)] bg-bg-2/30">
        {/* ============ TOP BAR ============ */}
        <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-ink-6 shrink-0">
          <Link
            href={`/admin/clients/${clientSlug}`}
            className="text-ink-4 hover:text-ink p-1 -ml-1"
            aria-label="Back to client"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] uppercase tracking-widest text-ink-4 font-semibold">Site Builder</span>
            <span className="text-ink-5">·</span>
            <span className="text-sm font-semibold text-ink truncate">{clientName}</span>
          </div>

          {/* Save status */}
          <div className="flex items-center gap-1.5 text-[11px] ml-3 min-w-0">
            {saving ? (
              <><Loader2 className="w-3 h-3 animate-spin text-ink-4" /><span className="text-ink-4">Saving</span></>
            ) : saveError ? (
              <><AlertCircle className="w-3 h-3 text-red-600" /><span className="text-red-600 truncate">{saveError}</span></>
            ) : savedAt ? (
              <><CheckCircle2 className="w-3 h-3 text-emerald-600" /><span className="text-ink-3">Saved {timeAgo(savedAt)}</span></>
            ) : null}
          </div>

          <div className="flex-1" />

          {/* Readiness pill */}
          <div className={`hidden md:flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-md border ${
            readinessTone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
            readinessTone === 'amber'   ? 'border-amber-200 bg-amber-50 text-amber-700' :
                                          'border-red-200 bg-red-50 text-red-700'
          }`}>
            <span className="font-semibold">{readiness.score}%</span>
            <span className="opacity-80">{readiness.missing.length === 0 ? 'ready' : `${readiness.missing.length} to fix`}</span>
          </div>

          {/* ⌘K palette */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-ink-3 hover:text-ink hover:bg-bg-2 rounded-md border border-ink-6"
            title="Open command palette"
          >
            <Command className="w-3 h-3" />
            <kbd className="font-mono">K</kbd>
          </button>

          {/* Design Studio */}
          <button
            onClick={() => setStudioOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md text-white bg-gradient-to-r from-brand to-brand-dark hover:opacity-90 transition-opacity"
            title="Open Design Studio (⌘D)"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Design Studio
          </button>

          <button
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-ink-3 hover:text-ink hover:bg-bg-2 rounded-md border border-ink-6"
          >
            <History className="w-3.5 h-3.5" />
            History
          </button>

          {/* Publish */}
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="inline-flex items-center gap-1.5 bg-ink hover:bg-black text-white text-[12px] font-semibold rounded-md px-3.5 py-1.5 disabled:opacity-50"
            title="Publish (⌘↵)"
          >
            {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {publishing ? 'Publishing' : 'Publish'}
          </button>
        </header>

        {publishError && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> {publishError}
          </div>
        )}

        {/* ============ MAIN WORKSPACE ============ */}
        <div className="flex-1 grid grid-cols-12 min-h-0">
          {/* ---- Left rail: section nav ---- */}
          <aside className="col-span-2 border-r border-ink-6 bg-white overflow-y-auto py-3 px-2">
            {/* Readiness card */}
            <div className="bg-bg-2/50 border border-ink-6 rounded-lg p-2.5 mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-4">Readiness</span>
                <span className={`text-[11px] font-semibold ${
                  readinessTone === 'emerald' ? 'text-emerald-600' :
                  readinessTone === 'amber'   ? 'text-amber-600'   : 'text-red-600'
                }`}>{readiness.score}%</span>
              </div>
              <div className="h-1 bg-ink-6 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    readinessTone === 'emerald' ? 'bg-emerald-500' :
                    readinessTone === 'amber'   ? 'bg-amber-500'   : 'bg-red-500'
                  }`}
                  style={{ width: `${readiness.score}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              {GROUPS.map(group => {
                const groupSections = SECTIONS.filter(s => s.group === group.key)
                const isExpanded = expandedGroups.has(group.key)
                const groupComplete = groupSections.filter(s => readiness.perSection[s.key]?.complete).length
                return (
                  <div key={group.key}>
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center justify-between gap-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3 hover:text-ink"
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
                              onClick={() => jumpToSection(s.key)}
                              className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-start gap-2 ${
                                isActive ? 'bg-brand text-white' : 'hover:bg-bg-2 text-ink'
                              }`}
                            >
                              <span className={`shrink-0 mt-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ${
                                meta?.complete
                                  ? isActive ? 'bg-white text-brand' : 'bg-emerald-500 text-white'
                                  : hasIssues
                                    ? isActive ? 'bg-amber-200' : 'bg-amber-400 text-white'
                                    : isActive ? 'border border-white/40' : 'border border-ink-5'
                              }`}>
                                {meta?.complete && <CheckCircle2 className="w-2.5 h-2.5" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[12px] font-medium leading-tight">{s.title}</span>
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
          </aside>

          {/* ---- Form pane ---- */}
          <section className="col-span-4 border-r border-ink-6 bg-white flex flex-col min-h-0">
            {/* Sticky section header */}
            <div className="px-5 py-3 border-b border-ink-6 bg-white flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-ink-4 font-semibold mb-0.5">
                  {GROUPS.find(g => g.key === activeSectionDef?.group)?.label ?? 'Section'}
                </div>
                <h2 className="text-base font-bold text-ink leading-tight">{activeSectionDef?.title ?? ''}</h2>
                <p className="text-[12px] text-ink-3 mt-0.5">{activeSectionDef?.subtitle ?? ''}</p>
              </div>
              {activeSection === 'brand' && (
                <button
                  onClick={() => setStudioOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-md text-white bg-brand hover:bg-brand-dark shrink-0"
                >
                  <Wand2 className="w-3 h-3" /> Design
                </button>
              )}
            </div>

            {/* Missing-items inline alert */}
            {readiness.perSection[activeSection]?.missing.length ? (
              <div className="mx-5 mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800">
                <div className="font-semibold mb-1 flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3" /> Needs:
                </div>
                <ul className="ml-4 space-y-0.5">
                  {readiness.perSection[activeSection].missing.map((m, i) => (
                    <li key={i}>· {m.split('→').slice(1).join('→').trim() || m}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Form scroll area */}
            <div ref={formScrollRef} className="flex-1 overflow-y-auto px-5 py-4">
              {activeSection === 'brand' && (
                <BrandAssistPanel
                  brand={data.brand}
                  onApply={(patch) => handleSectionChange('brand', { ...data.brand, ...patch } as Brand)}
                />
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

            {/* Bottom: missing-items with click-to-jump */}
            {readiness.missing.length > 0 && (
              <div className="border-t border-ink-6 px-5 py-2.5 bg-bg-2/40 shrink-0">
                <details className="group">
                  <summary className="text-[11px] cursor-pointer flex items-center gap-1.5 text-amber-700 hover:text-amber-800 list-none">
                    <AlertCircle className="w-3 h-3" />
                    <span className="font-medium">{readiness.missing.length} thing{readiness.missing.length === 1 ? '' : 's'} to fix sitewide</span>
                    <ChevronDown className="w-3 h-3 ml-auto group-open:rotate-180 transition-transform" />
                  </summary>
                  <ul className="mt-2 space-y-0.5">
                    {readiness.missing.map((m, i) => (
                      <li key={i}>
                        <button
                          onClick={() => jumpToMissingItem(m)}
                          className="text-[11px] text-ink-3 hover:text-brand hover:underline text-left"
                        >
                          · {m}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </section>

          {/* ---- Preview pane ---- */}
          <section className="col-span-6 bg-bg-2 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-3 px-4 py-2 bg-white border-b border-ink-6 shrink-0">
              {/* Mode toggle */}
              <div className="flex items-center gap-1 bg-bg-2 rounded-md p-0.5">
                <button
                  onClick={() => setPreviewMode('draft')}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded transition ${previewMode === 'draft' ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}
                >Draft</button>
                <button
                  onClick={() => setPreviewMode('published')}
                  disabled={!publishedAt}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded transition disabled:opacity-40 disabled:cursor-not-allowed ${previewMode === 'published' ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}
                  title={publishedAt ? 'View latest published version' : 'Publish first'}
                >Published</button>
              </div>

              {/* Device frames */}
              <div className="flex items-center gap-1 bg-bg-2 rounded-md p-0.5 mx-auto">
                <DeviceButton kind="desktop" active={previewDevice} setActive={setPreviewDevice} />
                <DeviceButton kind="tablet"  active={previewDevice} setActive={setPreviewDevice} />
                <DeviceButton kind="mobile"  active={previewDevice} setActive={setPreviewDevice} />
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPreviewKey(k => k + 1)}
                  className="p-1.5 rounded-md text-ink-4 hover:text-ink hover:bg-bg-2"
                  aria-label="Refresh preview"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <a
                  href={`/preview/sites/${clientSlug}?mode=${previewMode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-ink-4 hover:text-ink hover:bg-bg-2"
                  aria-label="Open preview in new tab"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Iframe canvas */}
            <div className="flex-1 overflow-auto flex items-start justify-center p-4">
              {device.width === 0 ? (
                <iframe
                  key={previewKey}
                  src={`/preview/sites/${clientSlug}?mode=${previewMode}&_=${previewKey}`}
                  className="w-full h-full bg-white rounded-md border border-ink-6 shadow-sm"
                  title="Site preview"
                />
              ) : (
                <div
                  className="bg-white rounded-[28px] border-[10px] border-ink shadow-2xl overflow-hidden"
                  style={{ width: device.width, height: device.height ?? 'min(100%, 1100px)' }}
                >
                  <iframe
                    key={previewKey}
                    src={`/preview/sites/${clientSlug}?mode=${previewMode}&_=${previewKey}`}
                    className="w-full h-full bg-white border-0"
                    title="Site preview"
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ============ Drawers + overlays ============ */}
      <DesignStudioDrawer
        brand={data.brand}
        businessContext={{
          displayName: data.identity.displayName,
          tagline: data.identity.tagline ?? undefined,
          vertical: data.identity.vertical,
        }}
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onApply={(patch) => handleSectionChange('brand', { ...data.brand, ...patch } as Brand)}
      />
      <HistoryDrawer
        clientId={clientId}
        clientSlug={clientSlug}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onReverted={() => window.location.reload()}
      />
      <AssetLibraryPicker
        clientId={clientId}
        open={libraryOpen}
        onClose={() => { setLibraryOpen(false); libraryPick.current = null }}
        onPick={(url) => { libraryPick.current?.(url); libraryPick.current = null }}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onJump={jumpToSection}
        onOpenDesignStudio={() => setStudioOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onPreview={() => window.open(`/preview/sites/${clientSlug}?mode=${previewMode}`, '_blank')}
        onPublish={handlePublish}
      />
    </UploadProvider>
  )
}

function DeviceButton({
  kind, active, setActive,
}: {
  kind: PreviewDevice
  active: PreviewDevice
  setActive: (k: PreviewDevice) => void
}) {
  const Icon = kind === 'desktop' ? Monitor : kind === 'tablet' ? Tablet : Smartphone
  return (
    <button
      onClick={() => setActive(kind)}
      className={`p-1.5 rounded transition ${active === kind ? 'bg-white text-ink shadow-sm' : 'text-ink-4 hover:text-ink'}`}
      aria-label={DEVICE_PRESETS[kind].label}
      title={DEVICE_PRESETS[kind].label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
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

// Suppress unused-import warning for RotateCcw (was used in older revision)
void RotateCcw
