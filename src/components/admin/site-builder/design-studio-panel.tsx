'use client'

/**
 * Design Studio panel — top of the Brand section. Three rows:
 *   1. "Design with Claude" — natural language → full brand spec
 *   2. Style preset gallery — 8 curated one-click looks
 *   3. Design system token controls — radius/density/motion/etc.
 */

import { useState } from 'react'
import { Sparkles, Loader2, Check, Wand2 } from 'lucide-react'
import { DESIGN_PRESETS, findPreset } from '@/lib/design-presets'
import { DEFAULT_DESIGN_SYSTEM } from '@/lib/site-schemas/shared'
import type { Brand, DesignSystem } from '@/lib/site-schemas/shared'

interface Props {
  brand: Brand
  /** Used as context for the Claude design generator. */
  businessContext: { displayName: string; tagline?: string; vertical: string }
  onApply: (patch: Partial<Brand>) => void
}

interface ClaudeDesign {
  brand: {
    primaryColor: string
    secondaryColor: string
    accentColor?: string
    fontDisplay: string
    fontBody: string
    voiceNotes?: string
  }
  designSystem: DesignSystem
  rationale: string
}

export default function DesignStudioPanel({ brand, businessContext, onApply }: Props) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<ClaudeDesign | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const ds = brand.designSystem ?? DEFAULT_DESIGN_SYSTEM

  // Determine if a known preset matches the current brand
  const activePresetId = DESIGN_PRESETS.find(p => {
    const applied = p.apply(brand)
    return applied.primaryColor === brand.primaryColor
      && applied.fontDisplay === brand.fontDisplay
      && applied.designSystem?.radius === ds.radius
      && applied.designSystem?.density === ds.density
  })?.id

  async function generateWithClaude() {
    setGenerating(true)
    setGenError(null)
    setGenerated(null)
    try {
      const res = await fetch('/api/admin/design-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          context: businessContext,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setGenError(json.error || 'Failed to generate')
      } else {
        setGenerated(json as ClaudeDesign)
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Network error')
    }
    setGenerating(false)
  }

  function applyClaudeDesign() {
    if (!generated) return
    onApply({
      primaryColor: generated.brand.primaryColor,
      secondaryColor: generated.brand.secondaryColor,
      accentColor: generated.brand.accentColor,
      fontDisplay: generated.brand.fontDisplay,
      fontBody: generated.brand.fontBody,
      voiceNotes: generated.brand.voiceNotes ?? brand.voiceNotes,
      designSystem: generated.designSystem,
    })
    setGenerated(null)
    setPrompt('')
  }

  function applyPreset(id: string) {
    const p = findPreset(id)
    if (!p) return
    const next = p.apply(brand)
    onApply({
      primaryColor: next.primaryColor,
      secondaryColor: next.secondaryColor,
      accentColor: next.accentColor,
      fontDisplay: next.fontDisplay,
      fontBody: next.fontBody,
      designSystem: next.designSystem,
    })
  }

  function setDsField<K extends keyof DesignSystem>(key: K, value: DesignSystem[K]) {
    onApply({ designSystem: { ...ds, [key]: value } })
  }

  return (
    <div className="bg-gradient-to-br from-bg-2 via-white to-bg-2 border border-ink-6 rounded-xl p-4 mb-4 space-y-5">
      <div className="flex items-center gap-2">
        <Wand2 className="w-4 h-4 text-brand" />
        <h4 className="text-sm font-semibold text-ink">Design Studio</h4>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-ink-4 font-semibold">World-class · One click</span>
      </div>

      {/* ---------- Design with Claude ---------- */}
      <section className="bg-white border border-ink-6 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span className="text-[12px] font-semibold text-ink">Design with Claude</span>
        </div>
        <p className="text-[11px] text-ink-3">
          Describe the vibe in plain English. Claude returns a full design spec — palette, fonts, density, motion — tuned for {businessContext.vertical}.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder='e.g. "upscale steakhouse, dark and moody"'
            className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none"
            onKeyDown={e => { if (e.key === 'Enter' && prompt.trim()) generateWithClaude() }}
          />
          <button
            type="button"
            onClick={generateWithClaude}
            disabled={!prompt.trim() || generating}
            className="bg-ink hover:bg-black text-white text-sm font-semibold rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate
          </button>
        </div>
        {genError && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{genError}</div>
        )}
        {generated && (
          <div className="border border-brand/30 bg-brand/5 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map(k =>
                generated.brand[k] && (
                  <span
                    key={k}
                    className="w-6 h-6 rounded-md border border-ink-6 shrink-0"
                    style={{ backgroundColor: generated.brand[k] }}
                    title={`${k}: ${generated.brand[k]}`}
                  />
                ),
              )}
              <span className="text-[12px] font-semibold text-ink">
                {generated.brand.fontDisplay} / {generated.brand.fontBody}
              </span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-4">
                {generated.designSystem.radius} · {generated.designSystem.density} · {generated.designSystem.motion}
              </span>
            </div>
            <p className="text-[11px] text-ink-3 italic">{generated.rationale}</p>
            <div className="flex gap-2">
              <button
                onClick={applyClaudeDesign}
                className="flex-1 bg-brand hover:bg-brand-dark text-white text-[11px] font-semibold rounded-md px-3 py-1.5 flex items-center justify-center gap-1"
              >
                <Check className="w-3 h-3" /> Apply this design
              </button>
              <button
                onClick={() => setGenerated(null)}
                className="text-[11px] text-ink-3 hover:text-ink px-3"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---------- Preset gallery ---------- */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-ink-4 font-semibold">Style presets</span>
          <span className="text-[10px] text-ink-4">Click to apply</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {DESIGN_PRESETS.map(p => {
            const isActive = activePresetId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`text-left border rounded-lg overflow-hidden transition ${
                  isActive ? 'border-brand ring-1 ring-brand' : 'border-ink-6 hover:border-ink-5'
                }`}
              >
                {/* Swatch strip */}
                <div className="flex h-8">
                  <div className="flex-1" style={{ backgroundColor: p.swatches.primary }} />
                  <div className="flex-1" style={{ backgroundColor: p.swatches.secondary }} />
                  <div className="flex-1" style={{ backgroundColor: p.swatches.accent }} />
                </div>
                <div className="p-2.5 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ink">{p.name}</span>
                    {isActive && <Check className="w-3 h-3 text-brand" />}
                  </div>
                  <p className="text-[10px] text-ink-3 mt-0.5 line-clamp-1">{p.mood}</p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------- Design system tokens ---------- */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-ink-4 font-semibold">Fine-tune tokens</span>
          <span className="text-[10px] text-ink-4">Live preview updates instantly</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TokenSelect
            label="Corner radius"
            value={ds.radius}
            options={[
              { v: 'sharp',   label: 'Sharp' },
              { v: 'subtle',  label: 'Subtle' },
              { v: 'soft',    label: 'Soft' },
              { v: 'pillowy', label: 'Pillowy' },
            ]}
            onChange={v => setDsField('radius', v as DesignSystem['radius'])}
          />
          <TokenSelect
            label="Spacing density"
            value={ds.density}
            options={[
              { v: 'airy',     label: 'Airy' },
              { v: 'balanced', label: 'Balanced' },
              { v: 'dense',    label: 'Dense' },
            ]}
            onChange={v => setDsField('density', v as DesignSystem['density'])}
          />
          <TokenSelect
            label="Motion"
            value={ds.motion}
            options={[
              { v: 'none',    label: 'None' },
              { v: 'subtle',  label: 'Subtle' },
              { v: 'lively',  label: 'Lively' },
            ]}
            onChange={v => setDsField('motion', v as DesignSystem['motion'])}
          />
          <TokenSelect
            label="Surface"
            value={ds.surface}
            options={[
              { v: 'light',  label: 'Light' },
              { v: 'cream',  label: 'Cream' },
              { v: 'dark',   label: 'Dark' },
            ]}
            onChange={v => setDsField('surface', v as DesignSystem['surface'])}
          />
          <TokenSelect
            label="Photo treatment"
            value={ds.photoTreatment}
            options={[
              { v: 'natural', label: 'Natural' },
              { v: 'duotone', label: 'Duotone' },
              { v: 'tinted',  label: 'Tinted' },
            ]}
            onChange={v => setDsField('photoTreatment', v as DesignSystem['photoTreatment'])}
          />
          <TokenSelect
            label="Display weight"
            value={ds.typeWeight}
            options={[
              { v: 'regular', label: 'Regular' },
              { v: 'medium',  label: 'Medium' },
              { v: 'bold',    label: 'Bold' },
              { v: 'black',   label: 'Black' },
            ]}
            onChange={v => setDsField('typeWeight', v as DesignSystem['typeWeight'])}
          />
        </div>
      </section>
    </div>
  )
}

function TokenSelect<T extends string>({
  label, value, options, onChange,
}: {
  label: string
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">{label}</label>
      <div className="flex bg-white border border-ink-6 rounded-md p-0.5 gap-0.5">
        {options.map(o => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`flex-1 text-[11px] font-medium px-1.5 py-1 rounded transition ${
              value === o.v
                ? 'bg-ink text-white'
                : 'text-ink-3 hover:text-ink hover:bg-bg-2'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
