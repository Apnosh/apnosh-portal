'use client'

import { useState, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Pencil, Eye, Save, Loader2, Sparkles, Copy, Check, X,
  Upload, FileCode, Trash2, Image as ImageIcon, Plus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ClientBrand, VisualStyle, DepthStyle, EdgeTreatment, TextureOverlay, ReferenceImage, TemplateType } from '@/types/database'

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
/*  Hex color helpers                                                  */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const lr = Math.min(255, Math.round(r + (255 - r) * amount))
  const lg = Math.min(255, Math.round(g + (255 - g) * amount))
  const lb = Math.min(255, Math.round(b + (255 - b) * amount))
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const dr = Math.max(0, Math.round(r * (1 - amount)))
  const dg = Math.max(0, Math.round(g * (1 - amount)))
  const db = Math.max(0, Math.round(b * (1 - amount)))
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* ------------------------------------------------------------------ */
/*  Rich brand_md auto-generator                                       */
/* ------------------------------------------------------------------ */

function generateBrandMd(brand: ClientBrand, clientName: string): string {
  const p = brand.primary_color || '#4abd98'
  const s = brand.secondary_color || darken(p, 0.2)
  const a = brand.accent_color || lighten(p, 0.85)
  const tint = lighten(p, 0.9)
  const [pr, pg, pb] = hexToRgb(p)
  const [sr, sg, sb] = hexToRgb(s)

  let md = `# ${clientName} Brand System

## Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| primary | ${p} | Main brand color, buttons, accents |
| secondary | ${s} | Dark variant, headlines, CTAs |
| accent | ${a} | Tint backgrounds, hover states |
| tint | ${tint} | Very light background fills |
| gradient | linear-gradient(135deg, ${p}, ${s}) | Gradient fills, decorative elements |
| ink | #1d1d1f | Primary text |
| ink-2 | #424245 | Secondary text |
| ink-3 | #6e6e73 | Tertiary text, labels |
| ink-4 | #aeaeb2 | Placeholder, disabled |
| bg | #ffffff | Primary background |
| bg-2 | #f5f5f7 | Card/section background |

## Typography

### Display Font: ${brand.font_display || 'Inter'}
- Headlines: 48-72px, font-weight 700
- Sub-headlines: 32-40px, font-weight 600
- Use italic style in ${s} for emphasis on key phrases
- Google Fonts: <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.font_display || 'Inter')}:ital,wght@0,400;0,600;0,700;1,400;1,700&display=swap" rel="stylesheet">

### Body Font: ${brand.font_body || 'Inter'}
- Body text: 20-26px for social, font-weight 400
- Tags/kickers: 13-15px uppercase, letter-spacing 0.12em, font-weight 600, color ${s}
- Google Fonts: <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.font_body || 'Inter')}:wght@400;500;600;700&display=swap" rel="stylesheet">

## Text Scale (for social posts)
- Hero headline: 64px
- Headline: 48px
- Sub-headline: 32px
- Body: 24px
- Small body: 20px
- Tag/kicker: 14px uppercase, letter-spacing 0.12em
- Fine print: 12px
`

  // Visual style CSS
  if (brand.visual_style === 'glass_morphism') {
    md += `
## Card Style: Glass Morphism

### Primary Glass Card
\`\`\`css
.glass-card {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
  border-radius: 24px;
  padding: 48px;
}
\`\`\`

### Dark Glass Card
\`\`\`css
.dark-glass {
  background: rgba(29, 29, 31, 0.65);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  color: white;
}
\`\`\`

### Aurora Gradient Blobs (decorative background)
\`\`\`css
.aurora-1 { position:absolute; width:60%; height:60%; background: radial-gradient(circle, ${hexToRgba(p, 0.25)}, transparent 60%); filter:blur(60px); top:10%; left:15%; }
.aurora-2 { position:absolute; width:50%; height:50%; background: radial-gradient(circle, ${hexToRgba(s, 0.2)}, transparent 60%); filter:blur(60px); bottom:10%; right:10%; }
.aurora-3 { position:absolute; width:40%; height:40%; background: radial-gradient(circle, rgba(147,51,234,0.12), transparent 50%); filter:blur(60px); top:5%; right:20%; }
\`\`\`
`
  } else if (brand.visual_style === 'clean_minimal') {
    md += `
## Card Style: Clean Minimal

\`\`\`css
.card {
  background: #ffffff;
  border: 1px solid #e5e5ea;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  padding: 48px;
}
\`\`\`
No blur effects, no gradients. Clean lines, generous whitespace.
`
  } else if (brand.visual_style === 'bold_colorful') {
    md += `
## Card Style: Bold & Colorful

\`\`\`css
.card {
  background: ${p};
  border: 3px solid ${s};
  border-radius: 20px;
  padding: 48px;
  color: white;
}
.card-alt {
  background: ${s};
  border: 3px solid ${p};
  color: white;
}
\`\`\`
High contrast, solid color blocks, bold typography.
`
  } else if (brand.visual_style === 'photo_forward') {
    md += `
## Card Style: Photo Forward

\`\`\`css
.photo-overlay {
  position: relative;
  border-radius: 20px;
  overflow: hidden;
}
.photo-overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%);
}
.photo-text {
  position: absolute;
  bottom: 48px;
  left: 48px;
  right: 48px;
  color: white;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
  z-index: 1;
}
\`\`\`
`
  }

  // Edge treatment
  if (brand.edge_treatment === 'iridescent') {
    md += `
## Edge Treatment: Iridescent Border
\`\`\`css
.card::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(236,72,153,0.15), rgba(59,130,246,0.15), ${hexToRgba(p, 0.15)}, rgba(251,146,60,0.1));
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  padding: 1px;
  pointer-events: none;
}
\`\`\`
`
  } else if (brand.edge_treatment === 'gradient_border') {
    md += `
## Edge Treatment: Gradient Border
\`\`\`css
.card {
  border: 2px solid transparent;
  background-clip: padding-box;
  position: relative;
}
.card::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: linear-gradient(135deg, ${p}, ${s});
  z-index: -1;
}
\`\`\`
`
  }

  // Texture
  if (brand.texture_overlay === 'grain') {
    md += `
## Texture: Film Grain
Add a subtle noise overlay using an SVG filter:
\`\`\`css
.grain::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  pointer-events: none;
}
\`\`\`
`
  }

  // Background
  md += `
## Post Background
\`\`\`css
body {
  width: {WIDTH}px;
  height: {HEIGHT}px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: linear-gradient(135deg, ${lighten(p, 0.92)} 0%, #f5f5f7 35%, ${lighten(p, 0.88)} 65%, #f5f5f7 100%);
  font-family: '${brand.font_body || 'Inter'}', sans-serif;
  position: relative;
}
\`\`\`

## Button System
\`\`\`css
.btn-primary {
  background: ${p};
  color: white;
  border: none;
  border-radius: 12px;
  padding: 14px 32px;
  font-weight: 600;
  font-size: 15px;
}
.btn-secondary {
  background: rgba(255,255,255,0.55);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.3);
  color: #1d1d1f;
  border-radius: 12px;
  padding: 14px 32px;
}
\`\`\`
`

  // Logo
  if (brand.logo_url) {
    md += `
## Logo
- URL: ${brand.logo_url}
- Place at bottom center of every post
- Minimum 24px padding from edges
- Max height: 32px
`
  }

  // Voice
  if (brand.voice_notes) {
    md += `
## Voice & Tone
${brand.voice_notes}
`
  }

  // Photo style
  if (brand.photo_style) {
    md += `
## Photo Style
${brand.photo_style}
`
  }

  // Template layouts
  md += `
## Template Layouts

### Insight Post
Glass card centered vertically. Tag/kicker at top in uppercase. Large headline in display font. Body text below. Logo at bottom.

### Stat Post
Big number (64-80px, bold, brand color) centered. Metric label below (24px). Context line below that. Tag at top. Logo at bottom.

### Tip Post
"Tip #XX" in tag style at top. Headline in display font. Explanation in body text. Series name as small label. Logo at bottom.

### Compare Post
Two-column layout. "Before" column on left, "After" column on right. Items as bullet points. Headline spanning full width at top. Tag at top.

### Result Post
Key metric as big number. Metric label. Pull quote in italics. Attribution below quote. Tag at top. Logo at bottom.

### Photo Post
Full-bleed or framed photo. Gradient overlay for text readability. Headline and caption overlaid on photo. Logo at bottom.
`

  return md
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
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
      <div className="w-10 h-10 rounded-lg border border-ink-6 transition-transform hover:scale-105" style={{ backgroundColor: hex }} />
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

const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: 'insight', label: 'Insight' },
  { value: 'stat', label: 'Stat' },
  { value: 'tip', label: 'Tip' },
  { value: 'compare', label: 'Compare' },
  { value: 'result', label: 'Result' },
  { value: 'photo', label: 'Photo' },
  { value: 'custom', label: 'Custom' },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BrandTab({ clientId, clientName, brand, onBrandUpdate }: BrandTabProps) {
  const supabase = createClient()
  const styleGuideInputRef = useRef<HTMLInputElement>(null)
  const refImageInputRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [markdownText, setMarkdownText] = useState(brand?.brand_md ?? '')
  const [draft, setDraft] = useState<ClientBrand | null>(brand)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Style guide upload
  const [uploadingGuide, setUploadingGuide] = useState(false)

  // Reference image upload
  const [uploadingRef, setUploadingRef] = useState(false)
  const [refDescription, setRefDescription] = useState('')
  const [refTemplateType, setRefTemplateType] = useState<TemplateType | ''>('')

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
        style_guide_html: draft.style_guide_html,
        reference_images: draft.reference_images,
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

  /* ── Style guide HTML upload ────────────────────────────────────── */

  async function handleStyleGuideUpload(files: FileList | null) {
    if (!files || files.length === 0 || !draft) return
    setUploadingGuide(true)

    const file = files[0]
    const text = await file.text()

    // Store the raw HTML
    updateDraft({ style_guide_html: text })

    // Also extract CSS from the HTML and append to brand_md
    const cssMatch = text.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)
    if (cssMatch) {
      const extractedCss = cssMatch.map(m => m.replace(/<\/?style[^>]*>/gi, '').trim()).join('\n\n')
      const appendix = `\n\n## Uploaded Style Guide CSS\n\nThe following CSS was extracted from the client's style guide HTML file. Use these exact values.\n\n\`\`\`css\n${extractedCss}\n\`\`\`\n`
      setMarkdownText(prev => prev + appendix)
    }

    setUploadingGuide(false)
  }

  /* ── Reference image upload ─────────────────────────────────────── */

  async function handleRefImageUpload(files: FileList | null) {
    if (!files || files.length === 0 || !draft) return
    setUploadingRef(true)

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()
      const path = `${clientId}/ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('client-graphics')
        .upload(path, file, { upsert: false })

      if (uploadError) continue

      const { data: urlData } = supabase.storage.from('client-graphics').getPublicUrl(path)

      const newRef: ReferenceImage = {
        url: urlData.publicUrl,
        description: refDescription || file.name,
        template_type: refTemplateType || null,
      }

      updateDraft({
        reference_images: [...(draft.reference_images || []), newRef],
      })
    }

    setRefDescription('')
    setRefTemplateType('')
    setUploadingRef(false)
  }

  function removeRefImage(index: number) {
    if (!draft) return
    const updated = [...(draft.reference_images || [])]
    updated.splice(index, 1)
    updateDraft({ reference_images: updated })
  }

  /* ── Empty state ────────────────────────────────────────────────── */

  if (!brand && !editing) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
        <Sparkles className="w-6 h-6 text-ink-4 mx-auto mb-3" />
        <p className="text-sm font-medium text-ink-2">No brand system yet</p>
        <p className="text-xs text-ink-4 mt-1 mb-4">Create a brand document for this client.</p>
        <button onClick={startEdit} className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
          Create Brand System
        </button>
      </div>
    )
  }

  /* ── Edit mode ──────────────────────────────────────────────────── */
  if (editing && draft) {
    return (
      <div className="space-y-5">
        {/* Structured fields */}
        <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-ink">Brand Properties</h3>

          <div className="grid grid-cols-3 gap-4">
            <ColorInput label="Primary" value={draft.primary_color ?? ''} onChange={v => updateDraft({ primary_color: v || null })} />
            <ColorInput label="Secondary" value={draft.secondary_color ?? ''} onChange={v => updateDraft({ secondary_color: v || null })} />
            <ColorInput label="Accent" value={draft.accent_color ?? ''} onChange={v => updateDraft({ accent_color: v || null })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Display Font</label>
              <input type="text" value={draft.font_display ?? ''} onChange={e => updateDraft({ font_display: e.target.value || null })} placeholder="Playfair Display"
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Body Font</label>
              <input type="text" value={draft.font_body ?? ''} onChange={e => updateDraft({ font_body: e.target.value || null })} placeholder="Inter"
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SelectField label="Visual Style" value={draft.visual_style ?? ''} options={VISUAL_STYLES} onChange={v => updateDraft({ visual_style: (v || null) as VisualStyle | null })} />
            <SelectField label="Depth" value={draft.depth_style ?? ''} options={DEPTH_STYLES} onChange={v => updateDraft({ depth_style: (v || null) as DepthStyle | null })} />
            <SelectField label="Edge Treatment" value={draft.edge_treatment ?? ''} options={EDGE_TREATMENTS} onChange={v => updateDraft({ edge_treatment: (v || null) as EdgeTreatment | null })} />
            <SelectField label="Texture" value={draft.texture_overlay} options={TEXTURE_OPTIONS} onChange={v => updateDraft({ texture_overlay: v as TextureOverlay })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Voice Notes</label>
              <textarea value={draft.voice_notes ?? ''} onChange={e => updateDraft({ voice_notes: e.target.value || null })} rows={3}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none" />
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Photo Style</label>
              <textarea value={draft.photo_style ?? ''} onChange={e => updateDraft({ photo_style: e.target.value || null })} rows={3}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none" />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Logo URL</label>
            <input type="text" value={draft.logo_url ?? ''} onChange={e => updateDraft({ logo_url: e.target.value || null })} placeholder="https://..."
              className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
          </div>
        </div>

        {/* Style Guide Upload */}
        <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <FileCode className="w-4 h-4 text-ink-4" />
              Style Guide (HTML)
            </h3>
            <button
              onClick={() => styleGuideInputRef.current?.click()}
              disabled={uploadingGuide}
              className="text-xs font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1"
            >
              {uploadingGuide ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload HTML
            </button>
          </div>
          <input ref={styleGuideInputRef} type="file" accept=".html,.htm" className="hidden" onChange={e => handleStyleGuideUpload(e.target.files)} />

          {draft.style_guide_html ? (
            <div className="bg-bg-2 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Style guide loaded ({Math.round(draft.style_guide_html.length / 1024)}KB)
                </span>
                <button onClick={() => updateDraft({ style_guide_html: null })} className="text-xs text-ink-4 hover:text-red-500">Remove</button>
              </div>
              <p className="text-[10px] text-ink-4">CSS extracted and appended to brand document. The full HTML is sent to the generator as reference.</p>
            </div>
          ) : (
            <p className="text-xs text-ink-4">Upload your client's style guide HTML file. CSS will be extracted and included in every post generation.</p>
          )}
        </div>

        {/* Reference Images */}
        <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-ink-4" />
              Reference Designs
            </h3>
          </div>
          <p className="text-xs text-ink-4">Upload previous post designs. These images are sent to Claude via vision so it can match the style.</p>

          {/* Existing refs */}
          {(draft.reference_images || []).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(draft.reference_images || []).map((ref, i) => (
                <div key={i} className="relative group rounded-lg border border-ink-6 overflow-hidden">
                  <img src={ref.url} alt={ref.description} className="w-full aspect-square object-cover" />
                  <div className="p-2 space-y-0.5">
                    <p className="text-xs text-ink truncate">{ref.description}</p>
                    {ref.template_type && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-bg-2 text-ink-3">{ref.template_type}</span>
                    )}
                  </div>
                  <button
                    onClick={() => removeRefImage(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload new ref */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[150px]">
              <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Description</label>
              <input type="text" value={refDescription} onChange={e => setRefDescription(e.target.value)} placeholder="e.g. Instagram stat post example"
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20" />
            </div>
            <div className="w-32">
              <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Template Type</label>
              <select value={refTemplateType} onChange={e => setRefTemplateType(e.target.value as TemplateType | '')}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white">
                <option value="">Any</option>
                {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <button
              onClick={() => refImageInputRef.current?.click()}
              disabled={uploadingRef}
              className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {uploadingRef ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add Image
            </button>
          </div>
          <input ref={refImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleRefImageUpload(e.target.files)} />
        </div>

        {/* Split pane: editor + preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-ink-6 flex flex-col" style={{ minHeight: '500px' }}>
            <div className="px-4 py-2.5 border-b border-ink-6 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-3 flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Markdown Editor</span>
              <button onClick={handleAutoGenerate} disabled={generating} className="text-xs font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Auto-generate
              </button>
            </div>
            <textarea value={markdownText} onChange={e => setMarkdownText(e.target.value)}
              className="flex-1 px-4 py-3 text-sm text-ink font-mono leading-relaxed focus:outline-none resize-none" spellCheck={false} />
          </div>

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
          <button onClick={handleSave} disabled={saving}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50">
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

          {(brand!.font_display || brand!.font_body) && (
            <div>
              <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Fonts</span>
              <div className="mt-2 space-y-1.5">
                {brand!.font_display && <p className="text-sm text-ink"><span className="font-semibold">{brand!.font_display}</span> <span className="text-ink-4 text-xs">display</span></p>}
                {brand!.font_body && <p className="text-sm text-ink"><span className="font-medium">{brand!.font_body}</span> <span className="text-ink-4 text-xs">body</span></p>}
              </div>
            </div>
          )}

          {brand!.logo_url && (
            <div>
              <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Logo</span>
              <img src={brand!.logo_url} alt="Logo" className="mt-2 h-10 object-contain" />
            </div>
          )}

          <div>
            <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Style</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {brand!.visual_style && <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700">{brand!.visual_style.replace(/_/g, ' ')}</span>}
              {brand!.depth_style && <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">{brand!.depth_style.replace(/_/g, ' ')}</span>}
              {brand!.edge_treatment && brand!.edge_treatment !== 'none' && <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">{brand!.edge_treatment.replace(/_/g, ' ')}</span>}
              {brand!.texture_overlay !== 'none' && <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-ink-6 text-ink-3">{brand!.texture_overlay}</span>}
            </div>
          </div>

          {/* Indicators */}
          <div>
            <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Inputs</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {brand!.style_guide_html && <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">Style Guide</span>}
              {(brand!.reference_images || []).length > 0 && <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">{(brand!.reference_images || []).length} references</span>}
              {!brand!.style_guide_html && (brand!.reference_images || []).length === 0 && <span className="text-[10px] text-ink-4">None uploaded</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Reference images preview */}
      {(brand!.reference_images || []).length > 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <h3 className="text-sm font-semibold text-ink mb-3">Reference Designs</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {(brand!.reference_images || []).map((ref, i) => (
              <div key={i} className="flex-shrink-0 w-32">
                <img src={ref.url} alt={ref.description} className="w-32 h-32 object-cover rounded-lg border border-ink-6" />
                <p className="text-[10px] text-ink-3 mt-1 truncate">{ref.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brand markdown rendered */}
      <div className="bg-white rounded-xl border border-ink-6">
        <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Brand Document</h3>
          <button onClick={startEdit} className="text-xs font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit Brand
          </button>
        </div>
        <div className="px-6 py-5 prose prose-sm prose-slate max-w-none">
          {brand!.brand_md ? <ReactMarkdown>{brand!.brand_md}</ReactMarkdown> : <p className="text-ink-4 italic">No brand document yet. Click &ldquo;Edit Brand&rdquo; to create one.</p>}
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
        <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded-lg border border-ink-6 cursor-pointer p-0" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="#000000"
          className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
      </div>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
