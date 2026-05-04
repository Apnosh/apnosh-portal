'use client'

/**
 * Generate from profile — one-click button that asks Claude to compose a
 * full RestaurantSite from the client's onboarding data, then drops the
 * result into draft_data. The page reloads to pick up the new draft.
 */

import { useState } from 'react'
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, X } from 'lucide-react'

interface Props {
  clientId: string
  /** "minimal" = compact pill button (top bar), "card" = expanded for empty states */
  variant?: 'minimal' | 'card'
  /** Called after a successful generation. Default = full page reload. */
  onGenerated?: () => void
  /** Hint text shown in the card variant */
  cardHint?: string
}

const STEPS = [
  'Reading client profile',
  'Composing brand voice',
  'Drafting hero copy',
  'Tailoring locations + offerings',
  'Generating about story + values',
  'Polishing FAQs + SEO',
]

export default function GenerateFromProfileButton({
  clientId, variant = 'minimal', onGenerated, cardHint,
}: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function run() {
    setOpen(true)
    setRunning(true)
    setError(null)
    setDone(false)
    setStep(0)

    // Step animation independent of network call
    const stepTimer = setInterval(() => {
      setStep(s => Math.min(s + 1, STEPS.length - 1))
    }, 1500)

    try {
      const res = await fetch('/api/admin/generate-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      clearInterval(stepTimer)
      const json = await res.json().catch(() => null) as { error?: string; detail?: string } | null
      if (!res.ok) {
        setError(json?.error || `HTTP ${res.status}`)
        setRunning(false)
        return
      }
      setStep(STEPS.length - 1)
      setDone(true)
      setRunning(false)

      // Trigger reload after a short victory pause
      setTimeout(() => {
        if (onGenerated) onGenerated()
        else window.location.reload()
      }, 1200)
    } catch (e) {
      clearInterval(stepTimer)
      setError(e instanceof Error ? e.message : 'Network error')
      setRunning(false)
    }
  }

  if (variant === 'card') {
    return (
      <>
        <div className="bg-gradient-to-br from-brand/5 via-white to-brand/5 border border-brand/30 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-ink">Generate site from profile</h4>
              <p className="text-[12px] text-ink-3 mt-0.5">{cardHint || 'We\'ll use everything you filled in during onboarding — goals, voice, customer types, locations — to draft a complete site tuned to this business.'}</p>
              <button
                onClick={run}
                disabled={running}
                className="mt-3 inline-flex items-center gap-1.5 bg-ink hover:bg-black text-white text-[12px] font-semibold rounded-md px-3.5 py-1.5 disabled:opacity-50"
              >
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {running ? 'Generating…' : 'Generate site'}
              </button>
            </div>
          </div>
        </div>
        <ProgressModal open={open} step={step} done={done} error={error} onClose={() => setOpen(false)} />
      </>
    )
  }

  return (
    <>
      <button
        onClick={run}
        disabled={running}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:opacity-90 disabled:opacity-50"
        title="Generate from client profile"
      >
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        Generate from profile
      </button>
      <ProgressModal open={open} step={step} done={done} error={error} onClose={() => setOpen(false)} />
    </>
  )
}

function ProgressModal({
  open, step, done, error, onClose,
}: {
  open: boolean
  step: number
  done: boolean
  error: string | null
  onClose: () => void
}) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={done || error ? onClose : undefined} />
      <div className="fixed top-[20vh] left-1/2 -translate-x-1/2 w-[480px] max-w-[92vw] bg-white rounded-2xl shadow-2xl z-50 p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className={`w-4 h-4 ${error ? 'text-red-600' : 'text-brand'}`} />
            <h3 className="text-sm font-semibold text-ink">
              {error ? 'Generation failed' : done ? 'Site generated' : 'Generating with Claude'}
            </h3>
          </div>
          {(done || error) && (
            <button onClick={onClose} className="text-ink-4 hover:text-ink p-1">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
            <div className="text-xs text-red-700">{error}</div>
          </div>
        ) : (
          <div className="space-y-2">
            {STEPS.map((label, i) => {
              const isDone = done || i < step
              const isActive = !done && i === step
              return (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isActive
                        ? 'bg-brand text-white'
                        : 'bg-ink-6'
                  }`}>
                    {isDone ? <CheckCircle2 className="w-3 h-3" /> : isActive ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
                  </span>
                  <span className={isDone || isActive ? 'text-ink' : 'text-ink-4'}>{label}</span>
                </div>
              )
            })}
            {done && (
              <p className="text-[11px] text-ink-3 mt-3 italic">
                Reloading the Site Builder with your new draft…
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
