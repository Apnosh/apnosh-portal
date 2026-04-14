'use client'

import { type OnboardingData, type StepId } from './data'
import StepRole from './steps/step-role'
import StepBizName from './steps/step-biz-name'
import StepBizType from './steps/step-biz-type'
import StepCuisine from './steps/step-cuisine'
import StepServiceStyle from './steps/step-service-style'
import StepLocation from './steps/step-location'
import StepStory from './steps/step-story'
import StepCustomers from './steps/step-customers'
import StepWhyYou from './steps/step-why-you'
import StepGoal from './steps/step-goal'
import StepSuccess from './steps/step-success'
import StepPromote from './steps/step-promote'
import StepVoice from './steps/step-voice'
import StepContent from './steps/step-content'
import StepAvoid from './steps/step-avoid'
import StepApproval from './steps/step-approval'
import StepConnect from './steps/step-connect'
import StepAssets from './steps/step-assets'
import StepReview from './steps/step-review'
import StepDone from './steps/step-done'

interface Props {
  stepId: StepId | 'success' | undefined
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
  onLogoUpload: (file: File) => void
  onPhotosUpload: (files: FileList) => void
  businessId: string | null
}

export default function StepRenderer(props: Props) {
  const { stepId, data, update, valid, saving, step, totalSteps, onNext, onBack, onGoToStep, onComplete, onLogoUpload, onPhotosUpload } = props

  const nav = (
    <Nav
      step={step}
      valid={valid}
      saving={saving}
      onNext={onNext}
      onBack={onBack}
    />
  )

  function renderStep() {
    switch (stepId) {
      case 'role': return <StepRole data={data} update={update} nav={nav} />
      case 'biz_name': return <StepBizName data={data} update={update} nav={nav} />
      case 'biz_type': return <StepBizType data={data} update={update} nav={nav} />
      case 'cuisine': return <StepCuisine data={data} update={update} nav={nav} />
      case 'service_style': return <StepServiceStyle data={data} update={update} nav={nav} />
      case 'location': return <StepLocation data={data} update={update} nav={nav} />
      case 'story': return <StepStory data={data} update={update} nav={nav} />
      case 'customers': return <StepCustomers data={data} update={update} nav={nav} />
      case 'why_you': return <StepWhyYou data={data} update={update} nav={nav} />
      case 'goal': return <StepGoal data={data} update={update} nav={nav} />
      case 'success': return step <= totalSteps
        ? <StepSuccess data={data} update={update} nav={nav} />
        : <StepDone bizName={data.biz_name} />
      case 'promote': return <StepPromote data={data} update={update} nav={nav} />
      case 'voice': return <StepVoice data={data} update={update} nav={nav} />
      case 'content': return <StepContent data={data} update={update} nav={nav} />
      case 'avoid': return <StepAvoid data={data} update={update} nav={nav} />
      case 'approval': return <StepApproval data={data} update={update} nav={nav} />
      case 'connect': return <StepConnect data={data} update={update} nav={nav} />
      case 'assets': return <StepAssets data={data} update={update} nav={nav} onLogoUpload={onLogoUpload} onPhotosUpload={onPhotosUpload} />
      case 'review': return <StepReview data={data} update={update} onGoToStep={onGoToStep} onComplete={onComplete} saving={saving} />
      default: return <StepDone bizName={data.biz_name} />
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-9 pb-2 max-sm:px-5 min-h-0 custom-scroll">
      {renderStep()}
    </div>
  )
}

// Navigation bar
function Nav({ step, valid, saving, onNext, onBack }: {
  step: number; valid: boolean; saving: boolean; onNext: () => void; onBack: () => void
}) {
  return (
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
  )
}
