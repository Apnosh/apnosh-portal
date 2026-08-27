'use client'

/**
 * /preview/onboarding — every onboarding screen, browsable with sample-free
 * local state. Nothing saves, no account needed: the owner can see and tap
 * through the whole redesigned wizard (and jump to any screen) without
 * signing up. Renders the REAL step components through the real StepRenderer,
 * so what you see here is exactly what a new owner sees.
 */
import { useMemo, useState } from 'react'
import StepRenderer from '../../(auth)/onboarding/full/step-renderer'
import { INITIAL_DATA, getScreens, canContinueScreen, type OnboardingData, type StepId } from '../../(auth)/onboarding/full/data'

export default function OnboardingPreviewPage() {
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [idx, setIdx] = useState(0)
  const [success, setSuccess] = useState(false)

  const screens = useMemo(
    () => getScreens(data.biz_type || 'Restaurant / café / bar', data),
    [data],
  )
  const screen = success ? ('success' as const) : screens[Math.min(idx, screens.length - 1)]
  const update = <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) =>
    setData((prev) => ({ ...prev, [field]: value }))
  const next = () => { if (idx >= screens.length - 1) setSuccess(true); else setIdx(idx + 1) }
  const back = () => { if (success) setSuccess(false); else setIdx(Math.max(0, idx - 1)) }

  const pct = success ? 100 : Math.round(((idx + 1) / screens.length) * 100)

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '18px 16px 60px' }}>
        {/* preview chrome: honest banner + jump strip + the thin progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f6e56', background: '#f0faf6', border: '1px solid rgba(74,189,152,0.3)', borderRadius: 7, padding: '3px 8px' }}>Preview</span>
          <span style={{ fontSize: 12, color: '#6e6e73' }}>Sample walkthrough. Nothing saves.</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
          {screens.map((_, i) => (
            <button
              key={i} type="button" onClick={() => { setSuccess(false); setIdx(i) }}
              style={{
                width: 30, height: 30, borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                border: `1.5px solid ${i === idx && !success ? '#4abd98' : '#e6e6ea'}`,
                background: i === idx && !success ? '#f0faf6' : '#fff',
                color: i === idx && !success ? '#0f6e56' : '#6e6e73',
              }}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button" onClick={() => setSuccess(true)}
            style={{ height: 30, padding: '0 10px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: `1.5px solid ${success ? '#4abd98' : '#e6e6ea'}`, background: success ? '#f0faf6' : '#fff', color: success ? '#0f6e56' : '#6e6e73' }}
          >
            Done screen
          </button>
        </div>
        <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 3, borderRadius: 2, background: '#e6e6ea', marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: 'linear-gradient(90deg,#4abd98,#2e9a78)', transition: 'width .35s ease' }} />
        </div>

        <StepRenderer
          screen={screen}
          data={data}
          update={update}
          valid={screen === 'success' ? true : canContinueScreen(screen ?? [], data)}
          saving={false}
          step={idx}
          totalSteps={screens.length}
          onNext={next}
          onBack={back}
          onGoToStep={(stepId: StepId) => {
            const at = screens.findIndex((s) => s.includes(stepId))
            if (at >= 0) { setSuccess(false); setIdx(at) }
          }}
          onComplete={() => setSuccess(true)}
          onSkipForNow={() => { /* preview: nothing to save */ }}
          canSkip={false}
          onLogoUpload={() => { /* preview: uploads are off */ }}
          onPhotosUpload={() => { /* preview: uploads are off */ }}
          businessId={null}
          onSaveBeforeRedirect={async () => { /* preview: nothing to save */ }}
          onAutoAdvance={next}
        />
      </div>
    </div>
  )
}
