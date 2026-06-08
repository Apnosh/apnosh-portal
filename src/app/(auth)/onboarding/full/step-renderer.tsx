'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, type StepId } from './data'
import StepRole from './steps/step-role'
import StepBizName from './steps/step-biz-name'
import StepBizType from './steps/step-biz-type'
import StepServe from './steps/step-serve'
import StepMenuDetails from './steps/step-menu-details'
import StepOrdering from './steps/step-ordering'
import StepMenu from './steps/step-menu'
import StepSpecials from './steps/step-specials'
import StepDiscovery from './steps/step-discovery'
import StepLocation from './steps/step-location'
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

interface Props {
  /** The steps that make up the current screen, rendered stacked. */
  screen: StepId[] | 'success' | undefined
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  valid: boolean
  saving: boolean
  step: number
  totalSteps: number
  onNext: () => void
  onBack: () => void
  onGoToStep: (stepId: StepId) => void
  onComplete: () => void
  /** Save partial onboarding and jump straight into the portal. */
  onSkipForNow: () => void
  /** True once we have enough data to provision a clients row. */
  canSkip: boolean
  onLogoUpload: (file: File) => void
  onPhotosUpload: (files: FileList) => void
  businessId: string | null
  /** Persist current progress before a full-page OAuth redirect leaves the wizard. */
  onSaveBeforeRedirect: () => Promise<void>
}

export default function StepRenderer(props: Props) {
  const { screen, data, update, valid, saving, step, onNext, onBack, onGoToStep, onComplete, onSkipForNow, canSkip, onLogoUpload, onPhotosUpload } = props

  const nav = (
    <Nav
      step={step}
      valid={valid}
      saving={saving}
      canSkip={canSkip}
      onNext={onNext}
      onBack={onBack}
      onSkipForNow={onSkipForNow}
    />
  )

  // Render one step. The shared nav is attached only to the last step on a
  // screen; earlier steps pass nav={null} so a phase reads as stacked sections
  // under a single Back/Continue bar.
  function renderStep(stepId: StepId, n: ReactNode) {
    switch (stepId) {
      case 'role': return <StepRole data={data} update={update} nav={n} />
      case 'biz_name': return <StepBizName data={data} update={update} nav={n} onJumpToReview={() => onGoToStep('review')} />
      case 'biz_type': return <StepBizType data={data} update={update} nav={n} />
      case 'serve': return <StepServe data={data} update={update} nav={n} />
      case 'menu_details': return <StepMenuDetails data={data} update={update} nav={n} />
      case 'ordering': return <StepOrdering data={data} update={update} nav={n} />
      case 'menu': return <StepMenu data={data} update={update} nav={n} />
      case 'specials': return <StepSpecials data={data} update={update} nav={n} />
      case 'location': return <StepLocation data={data} update={update} nav={n} businessId={props.businessId} onSaveBeforeRedirect={props.onSaveBeforeRedirect} />
      case 'rhythm': return <StepRhythm data={data} update={update} nav={n} />
      case 'story': return <StepStory data={data} update={update} nav={n} />
      case 'audience': return <StepAudience data={data} update={update} nav={n} />
      case 'goals': return <StepGoals data={data} update={update} nav={n} />
      case 'promote': return <StepPromote data={data} update={update} nav={n} />
      case 'brand_voice': return <StepBrandVoice data={data} update={update} nav={n} />
      case 'discovery': return <StepDiscovery data={data} update={update} nav={n} />
      case 'approval': return <StepApproval data={data} update={update} nav={n} />
      case 'connect': return <StepConnect data={data} update={update} nav={n} businessId={props.businessId} />
      case 'assets': return <StepAssets data={data} update={update} nav={n} onLogoUpload={onLogoUpload} onPhotosUpload={onPhotosUpload} />
      // Review owns its own finish button, so it never renders the shared nav.
      case 'review': return <StepReview data={data} update={update} onGoToStep={onGoToStep} onComplete={onComplete} saving={saving} />
      default: return null
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-9 pb-2 max-sm:px-5 min-h-0 custom-scroll">
      {screen === 'success' || !screen ? (
        <StepDone bizName={data.biz_name} />
      ) : (
        screen.map((stepId, i) => {
          const isLast = i === screen.length - 1
          const withNav = isLast && stepId !== 'review'
          return (
            <div
              key={stepId}
              className={i > 0 ? 'mt-9 pt-9 border-t' : ''}
              style={i > 0 ? { borderColor: '#f0f0f0' } : undefined}
            >
              {renderStep(stepId, withNav ? nav : null)}
            </div>
          )
        })
      )}
    </div>
  )
}

// Navigation bar
function Nav({ step, valid, saving, canSkip, onNext, onBack, onSkipForNow }: {
  step: number; valid: boolean; saving: boolean; canSkip: boolean
  onNext: () => void; onBack: () => void; onSkipForNow: () => void
}) {
  return (
    <>
      <div className="flex justify-between items-center mt-7 pt-4 border-t" style={{ borderColor: '#f0f0f0' }}>
        {step > 1 ? (
          <button
            onClick={onBack}
            className="text-sm font-semibold px-4 py-2.5 rounded-[10px] transition-colors"
            style={{ color: '#999', background: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#555' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#999' }}
          >
            Back
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={onNext}
          disabled={!valid || saving}
          className="text-sm font-semibold px-7 py-2.5 rounded-[10px] text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: '#4abd98' }}
          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#2e9a78' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#4abd98' }}
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </div>

      {canSkip && (
        <div className="text-center mt-4">
          <button
            onClick={onSkipForNow}
            disabled={saving}
            className="text-[13px] font-medium transition-colors disabled:opacity-40"
            style={{ color: '#2e9a78', background: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#1f7d61' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#2e9a78' }}
          >
            Short on time? Save and finish later →
          </button>
          <p className="text-[11px] mt-1" style={{ color: '#aaa' }}>
            Your progress is saved. Pick up from your dashboard anytime.
          </p>
        </div>
      )}
    </>
  )
}
