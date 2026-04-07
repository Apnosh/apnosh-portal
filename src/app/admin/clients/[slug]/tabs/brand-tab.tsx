'use client'

import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Pencil, Eye, Save, Loader2, Sparkles, Copy, Check, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ClientBrand, VisualStyle, DepthStyle, EdgeTreatment, TextureOverlay } from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BrandTabProps {
  clientId: string
  clientName: string
  brand: ClientBrand | null
  onBrandUpdate: (b: ClientBrand) => void
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function CopyHex({ hex }: { hex: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(hex)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button onClick={copy} className="group relative cursor-pointer">
      <div
        className="w-10 h-10 rounded-lg border border-ink-6 transition-transform hover:scale-105"
        style={{ backgroundColor: hex }}
      />
      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-ink-4 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
        {copied ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
        {hex}
      </span>
    </button>
  )
}

const VISUAL_STYLES: { value: VisualStyle; label: string }[] = [
  { value: 'glass_morphism', label: 'Glass Morphism' },
  { value: 'clean_minimal', label: 'Clean Minimal' },
  { value: 'bold_colorful', label: 'Bold & Colorful' },
  { value: 'photo_forward', label: 'Photo Forward' },
  { value: 'custom', label: 'Custom' },
]

const DEPTH_STYLES: { value: DepthStyle; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'glass_morphism', label: 'Glass Morphism' },
  { value: 'layered_shadows', label: 'Layered Shadows' },
  { value: '3d_inspired', label: '3D Inspired' },
]

const EDGE_TREATMENTS: { value: EdgeTreatment; label: string }[] = [
  { value: 'clean', label: 'Clean' },
  { value: 'iridescent', label: 'Iridescent' },
  { value: 'gradient_border', label: 'Gradient Border' },
  { value: 'none', label: 'None' },
]

const TEXTURE_OPTIONS: { value: TextureOverlay; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'grain', label: 'Grain' },
  { value: 'paper', label: 'Paper' },
  { value: 'noise', label: 'Noise' },
]

/* ------------------------------------------------------------------ */
/*  Auto-generate brand markdown                                       */
/* ------------------------------------------------------------------ */

function generateBrandMd(brand: ClientBrand, clientName: string): string {
  const lines: string[] = []
  lines.push(`# ${clientName} Brand System\n`)

  lines.push('## Color Tokens\n')
  lines.push('| Token | Hex | Usage |')
  lines.push('|-------|-----|-------|')
  if (brand.primary_color) lines.push(`| Primary | \`${brand.primary_color}\` | Main brand color |`)
  if (brand.secondary_color) lines.push(`| Secondary | \`${brand.secondary_color}\` | Dark variant, headlines |`)
  if (brand.accent_color) lines.push(`| Accent | \`${brand.accent_color}\` | Tint backgrounds, hover states |`)
  lines.push('')

  if (brand.font_display || brand.font_body) {
    lines.push('## Typography\n')
    if (brand.font_display) lines.push(`- **Display Font:** ${brand.font_display}`)
    if (brand.font_body) lines.push(`- **Body Font:** ${brand.font_body}`)
    lines.push('')
  }

  if (brand.visual_style || brand.depth_style || brand.edge_treatment) {
    lines.push('## Visual Style\n')
    if (brand.visual_style) lines.push(`- **Style:** ${brand.visual_style.replace(/_/g, ' ')}`)
    if (brand.depth_style) lines.push(`- **Depth:** ${brand.depth_style.replace(/_/g, ' ')}`)
    if (brand.edge_treatment && brand.edge_treatment !== 'none') lines.push(`- **Edge Treatment:** ${brand.edge_treatment.replace(/_/g, ' ')}`)
    if (brand.texture_overlay !== 'none') lines.push(`- **Texture:** ${brand.texture_overlay}`)
    lines.push('')
  }

  if (brand.voice_notes) {
    lines.push('## Voice & Tone\n')
    lines.push(brand.voice_notes)
    lines.push('')
  }

  if (brand.photo_style) {
    lines.push('## Photo Style\n')
    lines.push(brand.photo_style)
    lines.push('')
  }

  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BrandTab({ clientId, clientName, brand, onBrandUpdate }: BrandTabProps) {
  const supabase = createClient()

  const [editing, setEditing] = useState(false)
  const [markdownText, setMarkdownText] = useState(brand?.brand_md ?? '')
  const [draft, setDraft] = useState<ClientBrand | null>(brand)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  function startEdit() {
    setMarkdownText(brand?.brand_md ?? '')
    setDraft(brand ? { ...brand } : null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft(brand)
  }

  function updateDraft(fields: Partial<ClientBrand>) {
    setDraft(prev => prev ? { ...prev, ...fields } : null)
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)

    const { data, error } = await supabase
      .from('client_brands')
      .update({
        brand_md: markdownText,
        primary_color: draft.primary_color,
        secondary_color: draft.secondary_color,
        accent_color: draft.accent_color,
        font_display: draft.font_display,
        font_body: draft.font_body,
        voice_notes: draft.voice_notes,
        photo_style: draft.photo_style,
        visual_style: draft.visual_style,
        depth_style: draft.depth_style,
        edge_treatment: draft.edge_treatment,
        texture_overlay: draft.texture_overlay,
        logo_url: draft.logo_url,
      })
      .eq('client_id', clientId)
      .select()
      .single()

    if (!error && data) {
      onBrandUpdate(data as ClientBrand)
      setEditing(false)
    }

    setSaving(false)
  }

  function handleAutoGenerate() {
    if (!draft) return
    setGenerating(true)
    const md = generateBrandMd(draft, clientName)
    setMarkdownText(md)
    setGenerating(false)
  }

  if (!brand && !editing) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
        <Sparkles className="w-6 h-6 text-ink-4 mx-auto mb-3" />
        <p className="text-sm font-medium text-ink-2">No brand system yet</p>
        <p className="text-xs text-ink-4 mt-1 mb-4">Create a brand document for this client.</p>
        <button
          onClick={startEdit}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          Create Brand System
        </button>
      </div>
    )
  }

  /* ── Edit mode: split pane ──────────────────────────────────────── */
  if (editing && draft) {
    return (
      <div className="space-y-5">
        {/* Structured fields */}
        <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-ink">Brand Properties</h3>

          {/* Colors */}
          <div className="grid grid-cols-3 gap-4">
            <ColorInput label="Primary" value={draft.primary_color ?? ''} onChange={v => updateDraft({ primary_color: v || null })} />
            <ColorInput label="Secondary" value={draft.secondary_color ?? ''} onChange={v => updateDraft({ secondary_color: v || null })} />
            <ColorInput label="Accent" value={draft.accent_color ?? ''} onChange={v => updateDraft({ accent_color: v || null })} />
          </div>

          {/* Fonts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Display Font</label>
              <input
                type="text"
                value={draft.font_display ?? ''}
                onChange={e => updateDraft({ font_display: e.target.value || null })}
                placeholder="Playfair Display"
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Body Font</label>
              <input
                type="text"
                value={draft.font_body ?? ''}
                onChange={e => updateDraft({ font_body: e.target.value || null })}
                placeholder="Inter"
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
            </div>
          </div>

          {/* Style options */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SelectField label="Visual Style" value={draft.visual_style ?? ''} options={VISUAL_STYLES} onChange={v => updateDraft({ visual_style: (v || null) as VisualStyle | null })} />
            <SelectField label="Depth" value={draft.depth_style ?? ''} options={DEPTH_STYLES} onChange={v => updateDraft({ depth_style: (v || null) as DepthStyle | null })} />
            <SelectField label="Edge Treatment" value={draft.edge_treatment ?? ''} options={EDGE_TREATMENTS} onChange={v => updateDraft({ edge_treatment: (v || null) as EdgeTreatment | null })} />
            <SelectField label="Texture" value={draft.texture_overlay} options={TEXTURE_OPTIONS} onChange={v => updateDraft({ texture_overlay: v as TextureOverlay })} />
          </div>

          {/* Voice + Photo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Voice Notes</label>
              <textarea
                value={draft.voice_notes ?? ''}
                onChange={e => updateDraft({ voice_notes: e.target.value || null })}
                rows={3}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Photo Style</label>
              <textarea
                value={draft.photo_style ?? ''}
                onChange={e => updateDraft({ photo_style: e.target.value || null })}
                rows={3}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
              />
            </div>
          </div>
        </div>

        {/* Split pane: editor + preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Editor */}
          <div className="bg-white rounded-xl border border-ink-6 flex flex-col" style={{ minHeight: '500px' }}>
            <div className="px-4 py-2.5 border-b border-ink-6 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-3 flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                Markdown Editor
              </span>
              <button
                onClick={handleAutoGenerate}
                disabled={generating}
                className="text-xs font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Auto-generate
              </button>
            </div>
            <textarea
              value={markdownText}
              onChange={e => setMarkdownText(e.target.value)}
              className="flex-1 px-4 py-3 text-sm text-ink font-mono leading-relaxed focus:outline-none resize-none"
              spellCheck={false}
            />
          </div>

          {/* Preview */}
          <div className="bg-white rounded-xl border border-ink-6 flex flex-col" style={{ minHeight: '500px' }}>
            <div className="px-4 py-2.5 border-b border-ink-6 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-ink-4" />
              <span className="text-xs font-medium text-ink-3">Preview</span>
            </div>
            <div className="flex-1 px-5 py-4 overflow-y-auto prose prose-sm prose-slate max-w-none">
              <ReactMarkdown>{markdownText}</ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between">
          <button onClick={cancelEdit} className="text-sm text-ink-3 hover:text-ink transition-colors flex items-center gap-1.5">
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Brand System
          </button>
        </div>
      </div>
    )
  }

  /* ── View mode ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      {/* Visual summary row */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex flex-wrap items-start gap-8">
          {/* Colors */}
          <div>
            <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Colors</span>
            <div className="flex gap-3 mt-2">
              {[
                { hex: brand!.primary_color, label: 'Primary' },
                { hex: brand!.secondary_color, label: 'Secondary' },
                { hex: brand!.accent_color, label: 'Accent' },
              ].filter(c => c.hex).map((c, i) => (
                <div key={i} className="text-center">
                  <CopyHex hex={c.hex!} />
                  <span className="text-[9px] text-ink-4 mt-1.5 block">{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fonts */}
          {(brand!.font_display || brand!.font_body) && (
            <div>
              <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Fonts</span>
              <div className="mt-2 space-y-1.5">
                {brand!.font_display && (
                  <p className="text-sm text-ink">
                    <span className="font-semibold">{brand!.font_display}</span>
                    <span className="text-ink-4 text-xs ml-1.5">display</span>
                  </p>
                )}
                {brand!.font_body && (
                  <p className="text-sm text-ink">
                    <span className="font-medium">{brand!.font_body}</span>
                    <span className="text-ink-4 text-xs ml-1.5">body</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Logo */}
          {brand!.logo_url && (
            <div>
              <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Logo</span>
              <img src={brand!.logo_url} alt="Logo" className="mt-2 h-10 object-contain" />
            </div>
          )}

          {/* Style pills */}
          <div>
            <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Style</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {brand!.visual_style && (
                <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700">
                  {brand!.visual_style.replace(/_/g, ' ')}
                </span>
              )}
              {brand!.depth_style && (
                <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                  {brand!.depth_style.replace(/_/g, ' ')}
                </span>
              )}
              {brand!.edge_treatment && brand!.edge_treatment !== 'none' && (
                <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                  {brand!.edge_treatment.replace(/_/g, ' ')}
                </span>
              )}
              {brand!.texture_overlay !== 'none' && (
                <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-ink-6 text-ink-3">
                  {brand!.texture_overlay}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Brand markdown rendered */}
      <div className="bg-white rounded-xl border border-ink-6">
        <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Brand Document</h3>
          <button
            onClick={startEdit}
            className="text-xs font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Brand
          </button>
        </div>
        <div className="px-6 py-5 prose prose-sm prose-slate max-w-none">
          {brand!.brand_md ? (
            <ReactMarkdown>{brand!.brand_md}</ReactMarkdown>
          ) : (
            <p className="text-ink-4 italic">No brand document yet. Click &ldquo;Edit Brand&rdquo; to create one.</p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#ffffff'}
          onChange={e => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg border border-ink-6 cursor-pointer p-0"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        />
      </div>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
