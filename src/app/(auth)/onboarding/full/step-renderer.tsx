'use client'

import { type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { type OnboardingData, type StepId } from './data'
import { PrimaryPill } from './ui'
import StepRole from './steps/step-role'
import StepBizName from './steps/step-biz-name'
import StepConfirm from './steps/step-confirm'
import StepBizType from './steps/step-biz-type'
import StepServe from './steps/step-serve'
import StepMenuDetails from './steps/step-menu-details'
import StepOrdering from './steps/step-ordering'
import StepMenu from './steps/step-menu'
import StepSpecials from './steps/step-specials'
import StepDiscovery from './steps/step-discovery'
import StepLocation from './steps/step-location'
import StepLocationDetails from './steps/step-location-details'
import StepRhythm from './steps/step-rhythm'
import StepStory from './steps/step-story'
import StepAudience from './steps/step-audience'
import StepGoals from './steps/step-goals'
import StepPromote from './steps/step-promote'
import StepBrandVoice from './steps/step-brand-voice'
import StepApproval from './steps/step-approval'
import StepConnect from './steps/step-connect'
import StepAssets from './steps/step-assets'
import StepReview from './steps/step-review'
import StepDone from './steps/step-done'

/* ============================================================
 * THE APP FRAME (iOS-setup grammar), shared by the real wizard
 * and /preview/onboarding so both always look identical.
 *
 * Three fixed zones in a 100dvh column, nothing else scrolls:
 *   1. Top bar: circular back + thin progress + quiet exit lane
 *   2. Content: the ONLY scroll region. Short screens center
 *      vertically; long screens start at the top and scroll
 *      under the bars.
 *   3. Bottom bar: the pinned Continue pill on frosted glass,
 *      always visible, never scrolls away.
 * ============================================================ */

export interface OnboardingFrameProps {
  /** 1-based current screen number (used for the progress aria label). */
  step: number
  totalSteps: number
  /** 0-100 progress fill. */
  pct: number
  onBack: () => void
  /** When false the back circle keeps its space but turns invisible,
   * so the progress bar never jumps between screens. */
  showBack: boolean
  /** Real wizard only: shows the compact "Finish later" lane top-right. */
  canSkip: boolean
  onSkipForNow: () => void
  /** Real wizard only: quiet Exit lane shown when canSkip is not yet true
   * (leave setup, draft saved, no client records minted). */
  onExit?: () => void
  valid: boolean
  saving: boolean
  onNext: () => void
  children: ReactNode
  /** Success screen: progress full, back hidden, bottom bar hidden
   * (the done screen's own centered CTA is the completion action). */
  isSuccess?: boolean
  continueLabel?: string
  /** Hide the bottom bar without success semantics (loading state, and the
   * review screen whose Complete-setup pill lives next to the terms box). */
  hideAction?: boolean
  /** Optional slim strip rendered ABOVE the top bar (preview chrome). */
  topSlot?: ReactNode
}

const quietTextButton: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: '#98989d',
  fontSize: 13,
  fontWeight: 500,
  padding: '6px 2px',
  cursor: 'pointer',
  flexShrink: 0,
  minHeight: 34,
  fontFamily: "'Inter', system-ui, sans-serif",
}

export function OnboardingFrame({
  step,
  totalSteps,
  pct,
  onBack,
  showBack,
  canSkip,
  onSkipForNow,
  onExit,
  valid,
  saving,
  onNext,
  children,
  isSuccess,
  continueLabel,
  hideAction,
  topSlot,
}: OnboardingFrameProps) {
  const barHidden = !!isSuccess || !!hideAction

  return (
    <div
      className="ob-frame"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#ececef',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: '#1d1d1f',
      }}
    >
      {/* dvh with a vh fallback for older engines; on anything wider than a
          phone, the whole frame (bars included) presents as the portal's
          standard 480px app column, never a stretched web page */}
      <style>{`
.ob-frame{height:100vh;height:100dvh}
.ob-phone{width:100%;max-width:480px;min-width:0;overflow-x:hidden;height:100%;display:flex;flex-direction:column;background:radial-gradient(120% 34% at 50% 0%, rgba(74,189,152,0.10), rgba(255,255,255,0) 62%), #fbfbfd}
@media (min-width: 521px){.ob-phone{border-left:1px solid rgba(0,0,0,0.06);border-right:1px solid rgba(0,0,0,0.06);box-shadow:0 0 60px rgba(0,0,0,0.08)}}`}</style>
      <div className="ob-phone">

      {topSlot}

      {/* Zone 1: top bar. */}
      <div style={{ flexShrink: 0, height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          aria-hidden={!showBack}
          tabIndex={showBack ? 0 : -1}
          disabled={saving}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            background: '#fff',
            border: '1px solid #e6e6ea',
            cursor: 'pointer',
            visibility: showBack ? 'visible' : 'hidden',
          }}
        >
          <ChevronLeft size={18} color="#1d1d1f" strokeWidth={2.25} />
        </button>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`Setup progress: screen ${step} of ${totalSteps}`}
          style={{ flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', background: '#ececef' }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 2,
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #4abd98, #2e9a78)',
              transition: 'width .5s cubic-bezier(.32,.72,.35,1)',
            }}
          />
        </div>

        {canSkip ? (
          <button
            type="button"
            onClick={onSkipForNow}
            disabled={saving}
            style={quietTextButton}
            title="Save your answers and finish setup later from the dashboard."
          >
            Finish later
          </button>
        ) : onExit ? (
          <button
            type="button"
            onClick={onExit}
            disabled={saving}
            style={quietTextButton}
            title="Leave setup. Your progress is saved."
          >
            Exit
          </button>
        ) : null}
      </div>

      {/* Zone 2: the one scroll region. The inner wrapper is min-height 100%
          and centers its column, so short screens sit in the middle of the
          viewport and long screens start at the top and scroll naturally. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          style={{
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '12px 20px 24px',
            maxWidth: 480,
            width: '100%',
            margin: '0 auto',
          }}
        >
          {children}
        </div>
      </div>

      {/* Zone 3: pinned action bar. Only Continue lives here; the top circle
          owns Back. Frosted so content is felt scrolling underneath. */}
      {!barHidden && (
        <div
          style={{
            flexShrink: 0,
            padding: '12px 20px calc(16px + env(safe-area-inset-bottom))',
            background: 'rgba(251,251,253,0.85)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderTop: '1px solid rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <PrimaryPill onClick={onNext} disabled={!valid || saving} grow>
              {saving ? 'Saving...' : continueLabel || 'Continue'}
            </PrimaryPill>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

/* ============================================================ */

interface Props {
  /** The steps that make up the current screen, rendered stacked. */
  screen: StepId[] | 'success' | undefined
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  saving: boolean
  /** 1-based screen number; keys the entrance animation so it replays. */
  step: number
  onGoToStep: (stepId: StepId) => void
  onComplete: () => void
  onLogoUpload: (file: File) => void
  onPhotosUpload: (files: FileList) => void
  businessId: string | null
  /** Persist current progress before a full-page OAuth redirect leaves the wizard. */
  onSaveBeforeRedirect: () => Promise<void>
  /** Called by a single-choice step that sits alone on its screen when its one
   * answer lands, so the wizard can advance itself after a short beat. */
  onAutoAdvance?: () => void
}

/* The one entrance every screen shares: a gentle rise-and-fade in the sheet
 * grammar (same curve as .xp-sheet in the order flow). The wrapper below is
 * keyed to the screen number, so advancing replays it. CSS only, and quiet
 * for anyone who asked for reduced motion. */
function ScreenKeyframes() {
  return (
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        .ob-screen { animation: obScreenIn .5s cubic-bezier(.32,.72,.35,1) both }
        @keyframes obScreenIn { from { opacity: 0; transform: translateY(14px) scale(.99) } to { opacity: 1; transform: none } }
        .ob-screen > * { animation: obItemIn .55s cubic-bezier(.32,.72,.35,1) both }
        .ob-screen > *:nth-child(1) { animation-delay: .03s }
        .ob-screen > *:nth-child(2) { animation-delay: .08s }
        .ob-screen > *:nth-child(3) { animation-delay: .13s }
        .ob-screen > *:nth-child(4) { animation-delay: .18s }
        .ob-screen > *:nth-child(5) { animation-delay: .23s }
        .ob-screen > *:nth-child(n+6) { animation-delay: .28s }
        @keyframes obItemIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .ob-card { transition: transform .12s ease }
        .ob-card:active { transform: scale(.97) }
      }
    `}</style>
  )
}

export default function StepRenderer(props: Props) {
  const { screen, data, update, saving, step, onGoToStep, onComplete, onLogoUpload, onPhotosUpload } = props

  // Only a screen made of exactly ONE step may advance itself after a tap.
  // Grouped screens have more questions below, so they never auto-advance.
  const solo = Array.isArray(screen) && screen.length === 1

  // Render one step. Back and Continue live in the frame's fixed bars now, so
  // every step gets nav={null}; the prop stays so step internals are untouched.
  function renderStep(stepId: StepId) {
    switch (stepId) {
      case 'role': return <StepRole data={data} update={update} nav={null} onAnswered={solo ? props.onAutoAdvance : undefined} />
      case 'biz_name': return <StepBizName data={data} update={update} nav={null} onJumpToReview={() => onGoToStep('review')} />
      case 'confirm': return <StepConfirm data={data} update={update} nav={null} />
      case 'biz_type': return <StepBizType data={data} update={update} nav={null} onAnswered={solo ? props.onAutoAdvance : undefined} />
      case 'serve': return <StepServe data={data} update={update} nav={null} />
      case 'menu_details': return <StepMenuDetails data={data} update={update} nav={null} />
      case 'ordering': return <StepOrdering data={data} update={update} nav={null} />
      case 'menu': return <StepMenu data={data} update={update} nav={null} />
      case 'specials': return <StepSpecials data={data} update={update} nav={null} />
      case 'location': return <StepLocation data={data} update={update} nav={null} businessId={props.businessId} onSaveBeforeRedirect={props.onSaveBeforeRedirect} />
      case 'location_details': return <StepLocationDetails data={data} update={update} nav={null} />
      case 'rhythm': return <StepRhythm data={data} update={update} nav={null} />
      case 'story': return <StepStory data={data} update={update} nav={null} />
      case 'audience': return <StepAudience data={data} update={update} nav={null} />
      case 'goals': return <StepGoals data={data} update={update} nav={null} />
      case 'promote': return <StepPromote data={data} update={update} nav={null} />
      case 'brand_voice': return <StepBrandVoice data={data} update={update} nav={null} />
      case 'discovery': return <StepDiscovery data={data} update={update} nav={null} />
      case 'approval': return <StepApproval data={data} update={update} nav={null} />
      case 'connect': return <StepConnect data={data} update={update} nav={null} businessId={props.businessId} />
      case 'assets': return <StepAssets data={data} update={update} nav={null} onLogoUpload={onLogoUpload} onPhotosUpload={onPhotosUpload} />
      // Review owns its own finish button (next to the terms box it depends
      // on), so its screen hides the frame's bottom bar instead.
      case 'review': return <StepReview data={data} update={update} onGoToStep={onGoToStep} onComplete={onComplete} saving={saving} />
      default: return null
    }
  }

  return (
    <>
      <ScreenKeyframes />
      {screen === 'success' || !screen ? (
        <div key="success" className="ob-screen">
          <StepDone bizName={data.biz_name} />
        </div>
      ) : (
        /* Keyed to the screen number so every advance replays the entrance. */
        <div key={step} className="ob-screen">
          {screen.map((stepId, i) => (
            <div
              key={stepId}
              className={i > 0 ? 'mt-5 pt-5 border-t' : ''}
              style={i > 0 ? { borderColor: '#f0f0f2' } : undefined}
            >
              {renderStep(stepId)}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
