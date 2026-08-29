'use client'

/**
 * /preview/onboarding — every onboarding screen, browsable with sample-free
 * local state. Nothing saves, no account needed: the owner can see and tap
 * through the whole redesigned wizard (and jump to any screen) without
 * signing up. Renders the REAL step components through the real StepRenderer
 * inside the REAL OnboardingFrame, so what you see here is exactly what a
 * new owner sees. The only extra is the preview strip above the top bar.
 */
import { useMemo, useState } from 'react'
import StepRenderer, { OnboardingFrame } from '../../(auth)/onboarding/full/step-renderer'
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
  // Review carries its own Complete-setup pill, so the frame's bar steps aside.
  const isReviewScreen = Array.isArray(screen) && screen.includes('review')

  /* Preview chrome: just the honest banner, as a slim strip ABOVE the
     frame's top bar so the frame itself stays pixel-true. Navigation is the
     flow's own Continue/back, exactly like a real owner. */
  const previewStrip = (
    <div style={{ flexShrink: 0, padding: '10px 16px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f6e56', background: '#f0faf6', border: '1px solid rgba(74,189,152,0.3)', borderRadius: 7, padding: '3px 8px' }}>Preview</span>
        <span style={{ fontSize: 12, color: '#6e6e73' }}>Sample walkthrough. Nothing saves.</span>
      </div>
    </div>
  )

  return (
    <OnboardingFrame
      step={idx + 1}
      totalSteps={screens.length}
      pct={pct}
      onBack={back}
      showBack={success || idx > 0}
      canSkip={false}
      onSkipForNow={() => { /* preview: nothing to save */ }}
      valid={screen === 'success' ? true : canContinueScreen(screen ?? [], data)}
      saving={false}
      onNext={next}
      isSuccess={success}
      hideAction={isReviewScreen}
      topSlot={previewStrip}
    >
      <StepRenderer
        screen={screen}
        data={data}
        update={update}
        saving={false}
        step={idx + 1}
        onGoToStep={(stepId: StepId) => {
          const at = screens.findIndex((s) => s.includes(stepId))
          if (at >= 0) { setSuccess(false); setIdx(at) }
        }}
        onComplete={() => setSuccess(true)}
        onLogoUpload={() => { /* preview: uploads are off */ }}
        onPhotosUpload={() => { /* preview: uploads are off */ }}
        businessId={null}
        onSaveBeforeRedirect={async () => { /* preview: nothing to save */ }}
        onAutoAdvance={next}
      />
    </OnboardingFrame>
  )
}
