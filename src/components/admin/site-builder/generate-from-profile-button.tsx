'use client'

/**
 * Generate from profile — one-click button that asks Claude to compose a
 * full RestaurantSite from the client's onboarding data, then drops the
 * result into draft_data. The page reloads to pick up the new draft.
 */

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import GenerationProgressModal, { PROGRESS_STEPS } from './generation-progress-modal'

interface Props {
  clientId: string
  /** "minimal" = compact pill button (top bar), "card" = expanded for empty states */
  variant?: 'minimal' | 'card'
  /** Called after a successful generation. Default = full page reload. */
  onGenerated?: () => void
  /** Hint text shown in the card variant */
  cardHint?: string
}

export default function GenerateFromProfileButton({
  clientId, variant = 'minimal', onGenerated, cardHint,
}: Props) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function run() {
    setOpen(true)
    setRunning(true)
    setError(null)
    setDone(false)

    try {
      const res = await fetch('/api/admin/generate-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = await res.json().catch(() => null) as { error?: string; detail?: string } | null
      if (!res.ok) {
        setError(json?.error || `HTTP ${res.status}`)
        setRunning(false)
        return
      }
      setDone(true)
      setRunning(false)
      setTimeout(() => {
        if (onGenerated) onGenerated()
        else window.location.reload()
      }, 1200)
    } catch (e) {
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
        <GenerationProgressModal
          open={open}
          steps={PROGRESS_STEPS.generate}
          running={running}
          done={done}
          error={error}
          title="Generating site from profile"
          successMessage="Reloading the Site Builder with your new draft…"
          onClose={() => setOpen(false)}
        />
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
      <GenerationProgressModal
        open={open}
        steps={PROGRESS_STEPS.generate}
        running={running}
        done={done}
        error={error}
        title="Generating site from profile"
        successMessage="Reloading the Site Builder with your new draft…"
        onClose={() => setOpen(false)}
      />
    </>
  )
}

