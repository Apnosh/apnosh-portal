'use client'

import { useState, useRef, useCallback } from 'react'
import html2canvas from 'html2canvas'
import {
  X, Loader2, Sparkles, Save, Check, Download, RefreshCw,
  Lightbulb, BarChart3, Zap, ArrowLeftRight, Award, Camera, Pencil,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { TemplateType, PostPlatform, PostSize } from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TEMPLATES: { value: TemplateType; label: string; icon: typeof Lightbulb; description: string }[] = [
  { value: 'insight', label: 'Insight', icon: Lightbulb, description: 'Founder perspective or industry observation' },
  { value: 'stat', label: 'Stat', icon: BarChart3, description: 'Big number highlight with context' },
  { value: 'tip', label: 'Tip', icon: Zap, description: 'Numbered tip with explanation' },
  { value: 'compare', label: 'Compare', icon: ArrowLeftRight, description: 'Before/after or this vs that' },
  { value: 'result', label: 'Result', icon: Award, description: 'Client success metric with attribution' },
  { value: 'photo', label: 'Photo', icon: Camera, description: 'Real photo with branded overlay' },
  { value: 'custom', label: 'Custom', icon: Pencil, description: 'Freeform description' },
]

const SIZES: { value: PostSize; label: string; w: number; h: number }[] = [
  { value: 'feed', label: 'Feed 1080x1350', w: 1080, h: 1350 },
  { value: 'square', label: 'Square 1080x1080', w: 1080, h: 1080 },
  { value: 'story', label: 'Story 1080x1920', w: 1080, h: 1920 },
]

const PLATFORMS: { value: PostPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PostGenerator({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string
  onClose: () => void
  onCreated: () => void
}) {
  const supabase = createClient()
  const previewRef = useRef<HTMLIFrameElement>(null)

  // Config
  const [templateType, setTemplateType] = useState<TemplateType>('insight')
  const [size, setSize] = useState<PostSize>('feed')
  const [platform, setPlatform] = useState<PostPlatform>('instagram')

  // Content fields (vary by template)
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [tag, setTag] = useState('')
  const [bigNumber, setBigNumber] = useState('')
  const [metricLabel, setMetricLabel] = useState('')
  const [context, setContext] = useState('')
  const [tipNumber, setTipNumber] = useState('')
  const [seriesName, setSeriesName] = useState('')
  const [beforeItems, setBeforeItems] = useState('')
  const [afterItems, setAfterItems] = useState('')
  const [quote, setQuote] = useState('')
  const [attribution, setAttribution] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')

  // Generation state
  const [generating, setGenerating] = useState(false)
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null)
  const [editingHtml, setEditingHtml] = useState(false)
  const [htmlEditor, setHtmlEditor] = useState('')
  const [saving, setSaving] = useState(false)

  const sizeConfig = SIZES.find(s => s.value === size)!

  /* ── Build content fields string ────────────────────────────────── */

  function buildContentFields(): string {
    switch (templateType) {
      case 'insight':
        return `Headline: ${headline}\nBody: ${body}\nTag/Kicker: ${tag}`
      case 'stat':
        return `Big Number: ${bigNumber}\nMetric Label: ${metricLabel}\nContext: ${context}\nTag/Kicker: ${tag}`
      case 'tip':
        return `Tip Number: ${tipNumber}\nHeadline: ${headline}\nExplanation: ${body}\nSeries: ${seriesName}\nTag/Kicker: ${tag}`
      case 'compare':
        return `Headline: ${headline}\nBefore Items (one per line):\n${beforeItems}\nAfter Items (one per line):\n${afterItems}\nTag/Kicker: ${tag}`
      case 'result':
        return `Key Metric: ${bigNumber}\nMetric Label: ${metricLabel}\nQuote: ${quote}\nAttribution: ${attribution}\nTag/Kicker: ${tag}`
      case 'photo':
        return `Headline: ${headline}\nCaption overlay: ${body}\nTag/Kicker: ${tag}`
      case 'custom':
        return `Description: ${customDescription}`
    }
  }

  /* ── Generate ───────────────────────────────────────────────────── */

  async function handleGenerate() {
    setGenerating(true)
    setGeneratedHtml(null)

    // Fetch brand + patterns + recent style notes
    const [brandRes, patternsRes, styleRes] = await Promise.all([
      supabase.from('client_brands').select('brand_md').eq('client_id', clientId).single(),
      supabase.from('client_patterns').select('patterns_md').eq('client_id', clientId).single(),
      supabase.from('style_library').select('post_code, template_type, platform, style_notes')
        .eq('client_id', clientId).eq('status', 'approved')
        .order('approved_at', { ascending: false }).limit(10),
    ])

    const brandMd = brandRes.data?.brand_md ?? ''
    const patternsMd = patternsRes.data?.patterns_md ?? ''
    const styleNotes = (styleRes.data ?? [])
      .filter((s: { style_notes: string | null }) => s.style_notes)
      .map((s: { post_code: string; template_type: string | null; platform: string | null; style_notes: string | null }) =>
        `[${s.post_code}] (${s.template_type}, ${s.platform}): ${s.style_notes}`
      )
      .join('\n')

    const contentFields = buildContentFields()
    const { w, h } = sizeConfig

    // Safe zone rules per platform
    const safeZones: Record<PostPlatform, string> = {
      instagram: 'Keep key content within center 900x900px area. Bottom 120px reserved for logo. Top 60px clear for IG UI overlay on stories.',
      tiktok: 'Keep key content within center 800x800px area. Bottom 200px reserved for TikTok UI. Right edge 80px clear for buttons.',
      linkedin: 'Full bleed is fine. Bottom 80px for logo. Ensure text is readable at feed thumbnail size.',
    }

    try {
      const response = await fetch('/api/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandMd,
          patternsMd,
          styleNotes,
          templateType,
          width: w,
          height: h,
          platform,
          contentFields,
          safeZoneRules: safeZones[platform],
        }),
      })

      const data = await response.json()
      if (data.html) {
        setGeneratedHtml(data.html)
        setHtmlEditor(data.html)
      }
    } catch (err) {
      console.error('Generation failed:', err)
    }

    setGenerating(false)
  }

  /* ── Save ────────────────────────────────────────────────────────── */

  async function handleSaveDraft() {
    if (!generatedHtml) return
    setSaving(true)

    const html = editingHtml ? htmlEditor : generatedHtml

    await supabase.from('content_queue').insert({
      client_id: clientId,
      input_text: buildContentFields(),
      template_type: templateType,
      platform,
      size,
      status: 'drafting',
      drafts: [{
        image_url: '',
        html_source: html,
        caption,
        hashtags,
      }],
    })

    setSaving(false)
    onCreated()
    onClose()
  }

  async function handleApproveAndSave() {
    if (!generatedHtml) return
    setSaving(true)

    const html = editingHtml ? htmlEditor : generatedHtml

    // Generate post_code
    const { data: lastPost } = await supabase
      .from('style_library')
      .select('post_code')
      .eq('client_id', clientId)
      .order('approved_at', { ascending: false })
      .limit(1)
      .single()

    const lastNum = lastPost?.post_code ? parseInt(lastPost.post_code.split('-').pop() ?? '0') : 0
    const prefix = 'POST'
    const postCode = `${prefix}-${String(lastNum + 1).padStart(3, '0')}`

    // Insert queue item as approved
    await supabase.from('content_queue').insert({
      client_id: clientId,
      input_text: buildContentFields(),
      template_type: templateType,
      platform,
      size,
      status: 'approved',
      drafts: [{
        image_url: '',
        html_source: html,
        caption,
        hashtags,
      }],
      selected_draft: 0,
    })

    // Insert into style library
    await supabase.from('style_library').insert({
      client_id: clientId,
      post_code: postCode,
      html_source: html,
      template_type: templateType,
      platform,
      size,
      caption: caption || null,
      hashtags: hashtags || null,
      status: 'approved',
    })

    setSaving(false)
    onCreated()
    onClose()
  }

  /* ── Preview iframe ─────────────────────────────────────────────── */

  function renderPreview() {
    const html = editingHtml ? htmlEditor : generatedHtml
    if (!html) return null

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    const aspect = sizeConfig.h / sizeConfig.w
    const maxWidth = 360
    const previewH = maxWidth * aspect

    return (
      <div className="relative mx-auto" style={{ width: maxWidth }}>
        <iframe
          ref={previewRef}
          src={url}
          className="border border-ink-6 rounded-lg"
          style={{ width: sizeConfig.w, height: sizeConfig.h, transform: `scale(${maxWidth / sizeConfig.w})`, transformOrigin: 'top left' }}
        />
        <div style={{ height: previewH }} />
      </div>
    )
  }

  /* ── PNG Export ──────────────────────────────────────────────────── */

  const [exporting, setExporting] = useState(false)

  async function handleDownloadPng() {
    const html = editingHtml ? htmlEditor : generatedHtml
    if (!html) return
    setExporting(true)

    try {
      // Render HTML in a hidden container at full resolution
      const container = document.createElement('div')
      container.style.cssText = `position:fixed;left:-9999px;top:0;width:${sizeConfig.w}px;height:${sizeConfig.h}px;overflow:hidden;`
      document.body.appendChild(container)

      // Create an iframe to render the HTML
      const iframe = document.createElement('iframe')
      iframe.style.cssText = `width:${sizeConfig.w}px;height:${sizeConfig.h}px;border:none;`
      container.appendChild(iframe)

      // Write HTML to iframe
      const doc = iframe.contentDocument
      if (doc) {
        doc.open()
        doc.write(html)
        doc.close()

        // Wait for fonts and images to load
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Use html2canvas on the iframe body
        const canvas = await html2canvas(doc.body, {
          width: sizeConfig.w,
          height: sizeConfig.h,
          scale: 1,
          useCORS: true,
          allowTaint: true,
          logging: false,
        })

        // Download
        const link = document.createElement('a')
        link.download = `post-${templateType}-${sizeConfig.w}x${sizeConfig.h}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }

      document.body.removeChild(container)
    } catch (err) {
      console.error('PNG export failed:', err)
    }

    setExporting(false)
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between flex-shrink-0">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Post Generator</h2>
          <button onClick={onClose} className="text-ink-4 hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ── Config section ────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Template picker */}
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2 block">Template</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TEMPLATES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTemplateType(t.value)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      templateType === t.value
                        ? 'border-brand bg-brand-tint/50'
                        : 'border-ink-6 hover:border-ink-4'
                    }`}
                  >
                    <t.icon className={`w-4 h-4 mb-1 ${templateType === t.value ? 'text-brand-dark' : 'text-ink-4'}`} />
                    <div className="text-xs font-medium text-ink">{t.label}</div>
                    <div className="text-[10px] text-ink-4 mt-0.5 line-clamp-1">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Size + Platform */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Size</label>
                <select value={size} onChange={e => setSize(e.target.value as PostSize)} className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white">
                  {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Platform</label>
                <select value={platform} onChange={e => setPlatform(e.target.value as PostPlatform)} className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white">
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Content fields (vary by template) ─────────────────── */}
          <div className="space-y-3">
            <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Content</label>

            {templateType === 'insight' && (
              <>
                <SmallField label="Headline" value={headline} onChange={setHeadline} />
                <SmallTextarea label="Body" value={body} onChange={setBody} rows={3} />
                <SmallField label="Tag/Kicker" value={tag} onChange={setTag} placeholder="e.g. Marketing Insight" />
              </>
            )}

            {templateType === 'stat' && (
              <>
                <SmallField label="Big Number" value={bigNumber} onChange={setBigNumber} placeholder="e.g. 312%" />
                <SmallField label="Metric Label" value={metricLabel} onChange={setMetricLabel} placeholder="e.g. increase in calls" />
                <SmallField label="Context" value={context} onChange={setContext} placeholder="Additional context" />
                <SmallField label="Tag/Kicker" value={tag} onChange={setTag} />
              </>
            )}

            {templateType === 'tip' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <SmallField label="Tip Number" value={tipNumber} onChange={setTipNumber} placeholder="e.g. 07" />
                  <SmallField label="Series Name" value={seriesName} onChange={setSeriesName} placeholder="e.g. Local SEO Tips" />
                </div>
                <SmallField label="Headline" value={headline} onChange={setHeadline} />
                <SmallTextarea label="Explanation" value={body} onChange={setBody} rows={3} />
                <SmallField label="Tag/Kicker" value={tag} onChange={setTag} />
              </>
            )}

            {templateType === 'compare' && (
              <>
                <SmallField label="Headline" value={headline} onChange={setHeadline} placeholder="e.g. Before Apnosh vs After" />
                <SmallTextarea label="Before Items (one per line)" value={beforeItems} onChange={setBeforeItems} rows={3} />
                <SmallTextarea label="After Items (one per line)" value={afterItems} onChange={setAfterItems} rows={3} />
                <SmallField label="Tag/Kicker" value={tag} onChange={setTag} />
              </>
            )}

            {templateType === 'result' && (
              <>
                <SmallField label="Key Metric" value={bigNumber} onChange={setBigNumber} placeholder="e.g. 4.2x" />
                <SmallField label="Metric Label" value={metricLabel} onChange={setMetricLabel} placeholder="e.g. return on ad spend" />
                <SmallTextarea label="Quote" value={quote} onChange={setQuote} rows={2} />
                <SmallField label="Attribution" value={attribution} onChange={setAttribution} placeholder="e.g. Sarah, Local Bistro" />
                <SmallField label="Tag/Kicker" value={tag} onChange={setTag} />
              </>
            )}

            {templateType === 'photo' && (
              <>
                <SmallField label="Headline" value={headline} onChange={setHeadline} />
                <SmallTextarea label="Caption Overlay" value={body} onChange={setBody} rows={2} />
                <SmallField label="Tag/Kicker" value={tag} onChange={setTag} />
              </>
            )}

            {templateType === 'custom' && (
              <SmallTextarea label="Description" value={customDescription} onChange={setCustomDescription} rows={4} placeholder="Describe what you want..." />
            )}

            <SmallTextarea label="Caption" value={caption} onChange={setCaption} rows={3} placeholder="Post caption text..." />
            <SmallField label="Hashtags" value={hashtags} onChange={setHashtags} placeholder="#SmallBusinessMarketing #LocalSEO" />
          </div>

          {/* ── Generate button ───────────────────────────────────── */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full bg-brand hover:bg-brand-dark text-white font-medium rounded-lg py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Post</>
            )}
          </button>

          {/* ── Preview section ───────────────────────────────────── */}
          {generatedHtml && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Preview</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="text-xs font-medium text-ink-3 hover:text-ink flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                  </button>
                  <button
                    onClick={() => { setEditingHtml(!editingHtml); setHtmlEditor(generatedHtml) }}
                    className="text-xs font-medium text-ink-3 hover:text-ink flex items-center gap-1 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> {editingHtml ? 'Preview' : 'Edit HTML'}
                  </button>
                </div>
              </div>

              {editingHtml ? (
                <textarea
                  value={htmlEditor}
                  onChange={e => setHtmlEditor(e.target.value)}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-xs font-mono text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
                  rows={15}
                  spellCheck={false}
                />
              ) : (
                <div className="bg-bg-2 rounded-xl p-4 flex justify-center">
                  {renderPreview()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer actions ──────────────────────────────────────── */}
        {generatedHtml && (
          <div className="px-5 py-3 border-t border-ink-6 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="text-sm font-medium text-ink-3 hover:text-ink flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save as Draft
              </button>
              <button
                onClick={handleDownloadPng}
                disabled={exporting}
                className="text-sm font-medium text-ink-3 hover:text-ink flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PNG
              </button>
            </div>
            <button
              onClick={handleApproveAndSave}
              disabled={saving}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Approve & Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Field helpers                                                      */
/* ------------------------------------------------------------------ */

function SmallField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
      />
    </div>
  )
}

function SmallTextarea({ label, value, onChange, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string
}) {
  return (
    <div>
      <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
      />
    </div>
  )
}
