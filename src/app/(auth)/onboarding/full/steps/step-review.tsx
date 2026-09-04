'use client'

import { CheckCircle2 } from 'lucide-react'
import { type OnboardingData, type StepId, ROLES, APPROVAL_TYPES, FOOD_BIZ_TYPES } from '../data'
import { Question, PrimaryPill, gradOf, DISPLAY, CARD_SHADOW } from '../ui'

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
  const mainLoc = data.primary_location_name.trim()
    ? (loc ? `${data.primary_location_name.trim()} (${loc})` : data.primary_location_name.trim())
    : loc
  const connectedList = Object.keys(data.connected).filter((k) => data.connected[k])

  const menuList = data.menu_items
    .filter((m) => m.name.trim())
    .map((m) => (m.price.trim() ? `${m.name} (${m.price})` : m.name))
    .join(', ') || null
  const specialsList = data.specials
    .filter((s) => s.title.trim())
    .map((s) => (s.time_window.trim() ? `${s.title} (${s.time_window})` : s.title))
    .join(', ') || null
  const hashtagList = data.brand_hashtags.map((h) => `#${h}`).join(' ') || null
  const keywordList = data.target_keywords.join(', ') || null
  const extraLocs = data.locations.filter((l) => l.full_address.trim())
  const extraLocList = extraLocs
    .map((l) => (l.name.trim() ? `${l.name} (${l.full_address})` : l.full_address))
    .join(', ') || null
  // Keep the count honest: when extra spots exist, show the real total
  // (primary + extras) so it can never read "Just 1" above a list of spots.
  const locationsValue = extraLocs.length
    ? `${extraLocs.length + 1} total`
    : (data.location_count || null)

  return (
    <>
      <Question title="One last look" subtitle="Tap Edit to change anything." icon={<CheckCircle2 size={28} strokeWidth={2} />} />
      <div className="mt-5 space-y-2">
        <ReviewCard title="You" stepId="role" onEdit={onGoToStep} rows={[
          { label: 'Role', value: roleName },
        ]} />
        <ReviewCard title="Business" stepId="biz_name" onEdit={onGoToStep} rows={[
          { label: 'Name', value: data.biz_name || null },
          { label: 'Website', value: data.website || null },
          { label: 'Phone', value: data.phone || null },
          { label: 'Location', value: mainLoc },
          { label: 'Locations', value: locationsValue },
          { label: 'Other spots', value: extraLocList },
        ]} />
        <ReviewCard title="What you are" stepId="biz_type" onEdit={onGoToStep} rows={[
          { label: 'Type', value: (data.biz_type === 'Other' ? data.biz_other : data.biz_type) || null },
          { label: 'Cuisine', value: isFood ? ((data.cuisine === 'Other' ? data.cuisine_other : data.cuisine) || null) : null },
          { label: 'Vibe', value: isFood && data.service_styles.length ? data.service_styles.join(', ') : null },
          { label: 'Mission', value: data.biz_desc || null },
          { label: 'Audience', value: data.customer_types.length ? data.customer_types.join(', ') : null },
        ]} />
        {isFood && (
          <ReviewCard title="Menu" stepId="menu" onEdit={onGoToStep} rows={[
            { label: 'Dishes', value: menuList },
          ]} />
        )}
        {isFood && (
          <ReviewCard title="Specials" stepId="specials" onEdit={onGoToStep} rows={[
            { label: 'Recurring', value: specialsList },
          ]} />
        )}
        <ReviewCard title="Story" stepId="about" onEdit={onGoToStep} rows={[
          { label: 'Stand out', value: data.unique || null },
          { label: 'Competitors', value: data.competitors || null },
          { label: 'Why you', value: data.why_choose.length ? data.why_choose.join(', ') : null },
        ]} />
        <ReviewCard title="Goals" stepId="goals" onEdit={onGoToStep} rows={[
          { label: 'Priority', value: data.primary_goal || null },
          { label: 'Success', value: data.success_signs.length ? data.success_signs.join(', ') : null },
          { label: 'Timeline', value: data.timeline || null },
        ]} />
        <ReviewCard title="Promote" stepId="promote" onEdit={onGoToStep} rows={[
          { label: 'Highlights', value: data.main_offerings || null },
          { label: 'Coming up', value: data.upcoming || null },
        ]} />
        <ReviewCard title="Brand" stepId="brand_voice" onEdit={onGoToStep} rows={[
          { label: 'Tone', value: data.tones.length ? data.tones.join(', ') : null },
          { label: 'Custom tone', value: data.custom_tone || null },
          { label: 'Content', value: data.content_likes.length ? data.content_likes.join(', ') : null },
          { label: 'Avoid', value: data.avoid_list.length ? data.avoid_list.join(', ') : null },
        ]} />
        <ReviewCard title="Discovery" stepId="discovery" onEdit={onGoToStep} rows={[
          { label: 'Hashtags', value: hashtagList },
          { label: 'Keywords', value: keywordList },
        ]} />
        <ReviewCard title="Workflow" stepId="approval" onEdit={onGoToStep} rows={[
          { label: 'Style', value: approvalName },
          { label: 'On camera', value: data.can_film.length ? data.can_film.join(', ') : null },
        ]} />
        <ReviewCard title="Connected" stepId="connect" onEdit={onGoToStep} rows={[
          { label: 'Platforms', value: connectedList.length ? connectedList.join(', ') : null },
        ]} />
        <ReviewCard title="Assets" stepId="assets" onEdit={onGoToStep} rows={[
          { label: 'Logo', value: data.logo_name || null },
          { label: 'Photos', value: data.photo_count ? `${data.photo_count} uploaded` : null },
          { label: 'Brand folder', value: data.brand_drive || null },
        ]} />
      </div>

      {/* Terms */}
      <div className="my-5 text-sm" style={{ color: '#6e6e73' }}>
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
      <PrimaryPill onClick={onComplete} disabled={!data.agreed_terms || saving} grow>
        {saving ? 'Saving...' : 'Complete setup'}
      </PrimaryPill>
    </>
  )
}

/* One colour per section, the same hues the setup screens used. */
const REVIEW_HUE: Record<string, string> = {
  You: 'mint', Business: 'newfaces', 'What you are': 'announce', Menu: 'announce', Specials: 'deal',
  Story: 'brand', Goals: 'event', Promote: 'announce', Brand: 'brand', Discovery: 'newfaces',
  Workflow: 'nights', Connected: 'nights', Assets: 'catering',
}

function ReviewCard({
  title,
  stepId,
  onEdit,
  rows,
}: {
  title: string
  stepId: StepId
  onEdit: (stepId: StepId) => void
  rows: Array<{ label: string; value: string | null }>
}) {
  /* Only what the owner actually answered. Empty rows do not render, and a
   * section with nothing set does not render at all. */
  const setRows = rows.filter((r) => r.value)
  if (!setRows.length) return null
  return (
    <div className="rounded-[18px] px-4 py-3.5 bg-white" style={{ boxShadow: CARD_SHADOW }}>
      <div className="flex items-center gap-2.5 mb-2">
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: gradOf(REVIEW_HUE[title] || 'mint'), flexShrink: 0 }} />
        <span className="text-[15px] flex-1" style={{ fontFamily: DISPLAY, fontWeight: 600, color: '#1d1d1f', letterSpacing: '-0.01em' }}>
          {title}
        </span>
        <button
          type="button"
          onClick={() => onEdit(stepId)}
          className="text-[12.5px] font-semibold"
          style={{ color: '#2e9a78' }}
        >
          Edit
        </button>
      </div>
      {setRows.map((r) => (
        <div key={r.label} className="text-[13px] leading-relaxed" style={{ color: '#6e6e73' }}>
          {r.label}:{' '}
          <span className="font-medium" style={{ color: '#1d1d1f' }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}
