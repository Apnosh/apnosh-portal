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
import { Loader2, CheckCircle2, AlertCircle, Sparkles, ExternalLink, History, Monitor, Smartphone, RefreshCw } from 'lucide-react'
import { saveDraft, publishSite } from '@/lib/site-config/actions'
import { RestaurantSiteSchema } from '@/lib/site-schemas'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import { createClient } from '@/lib/supabase/client'
import { FieldRenderer } from './field-renderer'
import { UploadProvider, type UploadAssetFn } from './upload-context'

interface SiteBuilderFormProps {
  clientId: string
  clientSlug: string
  initialData: RestaurantSite
  initialPublishedAt: string | null
  initialVersion: number
}

const SECTIONS: { key: keyof RestaurantSite; title: string; subtitle: string }[] = [
  { key: 'identity',   title: 'Identity',     subtitle: 'Brand name, vertical, template' },
  { key: 'brand',      title: 'Brand',        subtitle: 'Colors, fonts, logo, voice' },
  { key: 'hero',       title: 'Hero',         subtitle: 'Top of the home page' },
  { key: 'locations',  title: 'Locations',    subtitle: 'One card per physical place' },
  { key: 'offerings',  title: 'Offerings',    subtitle: 'AYCE programs and menu categories' },
  { key: 'about',      title: 'About',        subtitle: 'Story + values + photo' },
  { key: 'contact',    title: 'Contact + FAQ',subtitle: 'Lead text and common questions' },
  { key: 'reservation',title: 'Reservation',  subtitle: 'Where guests book' },
  { key: 'social',     title: 'Social',       subtitle: 'Public profile links' },
  { key: 'seo',        title: 'SEO',          subtitle: 'Title, description, share image' },
  { key: 'statBand',   title: 'Stat Band',    subtitle: 'Big number strip on home (optional)' },
  { key: 'footer',     title: 'Footer',       subtitle: 'Tagline + copyright' },
]

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
  const [activeSection, setActiveSection] = useState<keyof RestaurantSite>('identity')
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [previewKey, setPreviewKey] = useState<number>(0)
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

  // Section completeness — check if section's data has any non-empty fields
  const sectionFilled = useMemo(() => {
    const out: Partial<Record<keyof RestaurantSite, boolean>> = {}
    for (const sec of SECTIONS) {
      out[sec.key] = isFilled(data[sec.key])
    }
    return out
  }, [data])

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
    <UploadProvider upload={uploadAsset}>
    <div className="grid grid-cols-12 gap-4">
      {/* Left rail: section nav */}
      <aside className="col-span-2 space-y-1 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pb-4">
        {SECTIONS.map(s => {
          const filled = sectionFilled[s.key]
          return (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-2 ${
                activeSection === s.key
                  ? 'bg-brand text-white'
                  : 'hover:bg-bg-2 text-ink'
              }`}
            >
              <span
                className={`shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                  filled
                    ? activeSection === s.key ? 'bg-white' : 'bg-emerald-500'
                    : activeSection === s.key ? 'bg-white/40' : 'bg-ink-5'
                }`}
                title={filled ? 'Has content' : 'Empty'}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{s.title}</span>
                <span className={`block text-[11px] truncate ${activeSection === s.key ? 'text-white/80' : 'text-ink-3'}`}>{s.subtitle}</span>
              </span>
            </button>
          )
        })}

        {/* Status footer */}
        <div className="border-t border-ink-6 pt-3 mt-4 px-1">
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
        <div className="bg-white rounded-xl border border-ink-6 p-4 mt-4 flex items-center justify-between gap-3 flex-wrap">
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
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-4 rounded-lg border border-ink-6 cursor-not-allowed"
              title="History UI coming next"
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
    </UploadProvider>
  )
}

/** Detect whether a section's data has any user-entered content. */
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.length > 0 && value.some(isFilled)
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(isFilled)
  }
  return false
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
