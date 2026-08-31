'use client'

/**
 * /preview/onboarding — every onboarding screen, browsable with sample-free
 * local state. Nothing saves, no account needed: the owner can see and tap
 * through the whole redesigned wizard (and jump to any screen) without
 * signing up. Renders the REAL step components through the real StepRenderer
 * inside the REAL OnboardingFrame, so what you see here is exactly what a
 * new owner sees. The only extra is the preview strip above the top bar.
 */
import { useEffect, useMemo, useState } from 'react'
import StepRenderer, { OnboardingFrame } from '../../(auth)/onboarding/full/step-renderer'
import { INITIAL_DATA, getScreens, canContinueScreen, type OnboardingData, type StepId } from '../../(auth)/onboarding/full/data'

export default function OnboardingPreviewPage() {
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [idx, setIdx] = useState(0)
  const [success, setSuccess] = useState(false)

  /* Hidden dev aid: ?screen=N (1-based) or ?screen=done jumps the preview
   * straight to a screen. No visible UI; used for design screenshots. */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const q = sp.get('screen')
    if (q === 'done') setSuccess(true)
    else if (q && /^\d+$/.test(q)) setIdx(Math.max(0, Number(q) - 1))
    const biz = sp.get('biz')
    if (biz) setData((prev) => ({ ...prev, biz_name: biz }))
  }, [])

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
