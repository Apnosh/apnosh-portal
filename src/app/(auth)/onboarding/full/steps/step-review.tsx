'use client'

import { type OnboardingData, type StepId, ROLES, APPROVAL_TYPES, FOOD_BIZ_TYPES } from '../data'
import { Question } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  onGoToStep: (stepId: StepId) => void
  onComplete: () => void
  saving: boolean
}

export default function StepReview({ data, update, onGoToStep, onComplete, saving }: Props) {
  const isFood = FOOD_BIZ_TYPES.includes(data.biz_type as typeof FOOD_BIZ_TYPES[number])
  const roleName = ROLES.find((r) => r.id === data.role)?.title || null
  const approvalName = APPROVAL_TYPES.find((a) => a.id === data.approval_type)?.title || null
  const loc = [data.city, data.state].filter(Boolean).join(', ') || null
  const connectedList = Object.keys(data.connected).filter((k) => data.connected[k])

  return (
    <>
      <Question title="Looking good — one last look" subtitle="Make sure everything's right, then let's go" />
      <div className="mt-4 space-y-2">
        <ReviewCard title="You" stepId="role" onEdit={onGoToStep}>
          <Row label="Role" value={roleName} />
        </ReviewCard>

        <ReviewCard title="Business" stepId="biz_name" onEdit={onGoToStep}>
          <Row label="Name" value={data.biz_name} />
          <Row label="Website" value={data.website || null} />
          <Row label="Phone" value={data.phone || null} />
          <Row label="Type" value={data.biz_type === 'Other' ? data.biz_other : data.biz_type} />
          {isFood && <Row label="Cuisine" value={data.cuisine === 'Other' ? data.cuisine_other : data.cuisine} />}
          {isFood && <Row label="Style" value={data.service_styles.length ? data.service_styles.join(', ') : null} />}
          <Row label="Location" value={loc} />
          <Row label="Locations" value={data.location_count || null} />
        </ReviewCard>

        <ReviewCard title="Story" stepId="story" onEdit={onGoToStep}>
          <Row label="About" value={data.biz_desc || null} />
          <Row label="Stand out" value={data.unique || null} />
          <Row label="Competitors" value={data.competitors || null} />
        </ReviewCard>

        <ReviewCard title="Customers" stepId="customers" onEdit={onGoToStep}>
          <Row label="Types" value={data.customer_types.length ? data.customer_types.join(', ') : null} />
          <Row label="Why you" value={data.why_choose.length ? data.why_choose.join(', ') : null} />
        </ReviewCard>

        <ReviewCard title="Goals" stepId="goal" onEdit={onGoToStep}>
          <Row label="Priority" value={data.primary_goal || null} />
          <Row label="Success" value={data.success_signs.length ? data.success_signs.join(', ') : null} />
          <Row label="Timeline" value={data.timeline || null} />
        </ReviewCard>

        <ReviewCard title="Promote" stepId="promote" onEdit={onGoToStep}>
          <Row label="Highlights" value={data.main_offerings || null} />
          <Row label="Coming up" value={data.upcoming || null} />
        </ReviewCard>

        <ReviewCard title="Brand" stepId="voice" onEdit={onGoToStep}>
          <Row label="Tone" value={data.tones.length ? data.tones.join(', ') : null} />
          <Row label="Custom tone" value={data.custom_tone || null} />
          <Row label="Content" value={data.content_likes.length ? data.content_likes.join(', ') : null} />
          <Row label="Avoid" value={data.avoid_list.length ? data.avoid_list.join(', ') : null} />
        </ReviewCard>

        <ReviewCard title="Workflow" stepId="approval" onEdit={onGoToStep}>
          <Row label="Style" value={approvalName} />
          <Row label="On camera" value={data.can_film.length ? data.can_film.join(', ') : null} />
        </ReviewCard>

        <ReviewCard title="Connected" stepId="connect" onEdit={onGoToStep}>
          <Row label="Platforms" value={connectedList.length ? connectedList.join(', ') : null} />
        </ReviewCard>

        <ReviewCard title="Assets" stepId="assets" onEdit={onGoToStep}>
          <Row label="Logo" value={data.logo_name || null} />
          <Row label="Photos" value={data.photo_count ? `${data.photo_count} uploaded` : null} />
          <Row label="Brand folder" value={data.brand_drive || null} />
        </ReviewCard>
      </div>

      {/* Terms */}
      <div className="my-5 text-sm" style={{ color: '#555' }}>
        <label className="flex items-start gap-2 cursor-pointer leading-relaxed">
          <input
            type="checkbox"
            checked={data.agreed_terms}
            onChange={(e) => update('agreed_terms', e.target.checked)}
            className="mt-0.5 accent-[#4abd98] flex-shrink-0"
          />
          <span>
            I agree to Apnosh's{' '}
            <a href="/terms" target="_blank" className="underline" style={{ color: '#2e9a78' }}>Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" className="underline" style={{ color: '#2e9a78' }}>Privacy Policy</a>.
          </span>
        </label>
      </div>

      {/* Complete button */}
      <button
        type="button"
        onClick={onComplete}
        disabled={!data.agreed_terms || saving}
        className="w-full py-3.5 rounded-[10px] text-white text-base font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#4abd98', fontFamily: 'DM Sans, sans-serif' }}
        onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#2e9a78' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#4abd98' }}
      >
        {saving ? 'Saving...' : 'Complete setup'}
      </button>
    </>
  )
}

function ReviewCard({ title, stepId, onEdit, children }: {
  title: string; stepId: StepId; onEdit: (stepId: StepId) => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-[10px] px-3.5 py-3" style={{ background: '#f5f5f2' }}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>
          {title}
        </span>
        <button
          type="button"
          onClick={() => onEdit(stepId)}
          className="text-xs font-medium"
          style={{ color: '#4abd98' }}
        >
          Edit
        </button>
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="text-[13px] leading-relaxed" style={{ color: '#555' }}>
      {label}:{' '}
      {value ? (
        <span className="font-medium" style={{ color: '#111' }}>{value}</span>
      ) : (
        <span className="italic" style={{ color: '#999' }}>&mdash;</span>
      )}
    </div>
  )
}
