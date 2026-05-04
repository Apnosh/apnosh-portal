'use client'

/**
 * Brand assist panel — surfaces color suggestions, contrast checks, and
 * font pairings inline above the Brand section's auto-rendered form.
 *
 * The panel is read/recommend-only — clicking "Apply" patches the parent's
 * brand object via onApply.
 */

import { useMemo } from 'react'
import { Sparkles, Check, AlertTriangle } from 'lucide-react'
import {
  suggestBrandColors, evaluateContrast, FONT_PAIRINGS,
} from '@/lib/brand-assist'
import type { Brand } from '@/lib/site-schemas/shared'

interface Props {
  brand: Brand
  onApply: (patch: Partial<Brand>) => void
}

export default function BrandAssistPanel({ brand, onApply }: Props) {
  const suggestions = useMemo(
    () => brand.primaryColor ? suggestBrandColors(brand.primaryColor) : null,
    [brand.primaryColor],
  )

  const contrastWhite = useMemo(
    () => brand.primaryColor ? evaluateContrast('#FFFFFF', brand.primaryColor) : null,
    [brand.primaryColor],
  )
  const contrastBlack = useMemo(
    () => brand.primaryColor ? evaluateContrast('#0B0B0B', brand.primaryColor) : null,
    [brand.primaryColor],
  )
  const primaryVsSecondary = useMemo(
    () => brand.primaryColor && brand.secondaryColor
      ? evaluateContrast(brand.primaryColor, brand.secondaryColor)
      : null,
    [brand.primaryColor, brand.secondaryColor],
  )

  const currentPairing = useMemo(
    () => FONT_PAIRINGS.find(
      p => p.display === brand.fontDisplay && p.body === brand.fontBody,
    ),
    [brand.fontDisplay, brand.fontBody],
  )

  if (!brand.primaryColor) return null

  return (
    <div className="bg-bg-2/50 border border-ink-6 rounded-xl p-4 mb-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand" />
        <h4 className="text-sm font-semibold text-ink">Brand assist</h4>
      </div>

      {/* Suggested companion colors */}
      {suggestions && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-4 font-semibold mb-2">Suggested palette</p>
          <div className="grid grid-cols-4 gap-2">
            <SwatchButton
              label="Secondary"
              color={suggestions.secondary}
              current={brand.secondaryColor}
              onApply={() => onApply({ secondaryColor: suggestions.secondary })}
            />
            <SwatchButton
              label="Tint"
              color={suggestions.tint}
              onApply={() => onApply({ accentColor: suggestions.tint })}
              current={brand.accentColor ?? null}
            />
            <SwatchButton
              label="Accent"
              color={suggestions.accent}
              onApply={() => onApply({ accentColor: suggestions.accent })}
              current={brand.accentColor ?? null}
            />
            <SwatchButton
              label="Text on primary"
              color={suggestions.textOnPrimary}
              info={`Use ${suggestions.textOnPrimary === '#FFFFFF' ? 'white' : 'near-black'} text on primary buttons`}
            />
          </div>
        </div>
      )}

      {/* Contrast checks */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-ink-4 font-semibold mb-2">Contrast check</p>
        <div className="grid grid-cols-3 gap-2">
          <ContrastBadge label="White on primary" verdict={contrastWhite} />
          <ContrastBadge label="Black on primary" verdict={contrastBlack} />
          <ContrastBadge label="Primary on secondary" verdict={primaryVsSecondary} />
        </div>
      </div>

      {/* Font pairings */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-ink-4 font-semibold mb-2">Font pairings</p>
        <div className="grid grid-cols-2 gap-2">
          {FONT_PAIRINGS.map(p => {
            const isActive = p.display === brand.fontDisplay && p.body === brand.fontBody
            return (
              <button
                key={`${p.display}/${p.body}`}
                type="button"
                onClick={() => onApply({ fontDisplay: p.display, fontBody: p.body })}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-white border-brand ring-1 ring-brand'
                    : 'bg-white border-ink-6 hover:border-ink-5'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-semibold text-ink">{p.display} / {p.body}</span>
                  {isActive && <Check className="w-3.5 h-3.5 text-brand" />}
                </div>
                <p className="text-[11px] text-ink-3 mb-1">{p.mood}</p>
                <p className="text-[10px] text-ink-4">{p.description}</p>
              </button>
            )
          })}
        </div>
        {currentPairing && (
          <p className="text-[11px] text-ink-4 italic mt-2">Currently using {currentPairing.display} + {currentPairing.body}</p>
        )}
      </div>
    </div>
  )
}

function SwatchButton({
  label, color, current, onApply, info,
}: {
  label: string
  color: string
  current?: string | null
  onApply?: () => void
  info?: string
}) {
  const isActive = current === color
  return (
    <button
      type="button"
      onClick={onApply}
      disabled={!onApply}
      className={`group relative bg-white border rounded-lg p-2 text-left transition ${
        onApply
          ? isActive
            ? 'border-brand ring-1 ring-brand cursor-default'
            : 'border-ink-6 hover:border-ink-5'
          : 'border-ink-6 cursor-default'
      }`}
      title={info}
    >
      <div
        className="w-full h-8 rounded-md mb-1 border border-ink-6"
        style={{ backgroundColor: color }}
      />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">{label}</div>
      <div className="text-[10px] font-mono text-ink-3 mt-0.5">{color}</div>
      {isActive && (
        <span className="absolute top-1.5 right-1.5 bg-brand text-white rounded-full p-0.5">
          <Check className="w-2.5 h-2.5" />
        </span>
      )}
      {!onApply && info && (
        <span className="absolute -top-1.5 -right-1.5 bg-amber-100 text-amber-800 text-[9px] font-medium rounded-full px-1.5 py-0.5">info</span>
      )}
    </button>
  )
}

function ContrastBadge({
  label,
  verdict,
}: {
  label: string
  verdict: ReturnType<typeof evaluateContrast>
}) {
  if (!verdict) {
    return (
      <div className="bg-white border border-ink-6 rounded-lg p-2">
        <div className="text-[10px] uppercase tracking-wider text-ink-4 font-semibold mb-1">{label}</div>
        <div className="text-[11px] text-ink-3">—</div>
      </div>
    )
  }
  const tone =
    verdict.rating === 'AAA' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
    verdict.rating === 'AA'  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
    verdict.rating === 'AA-large' ? 'bg-amber-50 border-amber-200 text-amber-700' :
    'bg-red-50 border-red-200 text-red-700'

  return (
    <div className={`border rounded-lg p-2 ${tone}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80 font-semibold mb-1">{label}</div>
      <div className="flex items-center gap-1 text-[11px] font-medium">
        {verdict.rating === 'FAIL' ? <AlertTriangle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
        {verdict.ratio}:1 · {verdict.rating}
      </div>
    </div>
  )
}
