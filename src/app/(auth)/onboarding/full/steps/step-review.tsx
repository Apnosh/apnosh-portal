'use client'

import { CheckCircle2 } from 'lucide-react'
import { type OnboardingData, type StepId, ROLES, APPROVAL_TYPES, FOOD_BIZ_TYPES } from '../data'
import { Question, PrimaryPill, gradOf, DISPLAY, CARD_SHADOW } from '../ui'
import { SHAPE_LABEL, isShelfShape } from '@/lib/clients/shape'
import { useLang } from '@/components/mvp/mvp-language'

/** A screen's T, passed down so the cards read in the owner's language. */
type Tr = (key: string, vars?: Record<string, string | number>) => string

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  onGoToStep: (stepId: StepId) => void
  onComplete: () => void
  saving: boolean
}

/* THE LAST SCREEN, IN THE OWNER'S LANGUAGE. Every LABEL goes through T(); the VALUES beside them
 * do not, because they are the owner's own words (their name, their address, the dishes they
 * typed). The two that are ours — the role they picked and the approval style — are option titles
 * from data.ts, so those get T() too. Nothing stored changes. */
export default function StepReview({ data, update, onGoToStep, onComplete, saving }: Props) {
  const { T } = useLang()
  const isFood = FOOD_BIZ_TYPES.includes(data.biz_type as typeof FOOD_BIZ_TYPES[number])
  const role = ROLES.find((r) => r.id === data.role)?.title
  const roleName = role ? T(role) : null
  const approval = APPROVAL_TYPES.find((a) => a.id === data.approval_type)?.title
  const approvalName = approval ? T(approval) : null
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
  // The two answers the STORE reads and the review never played back. An owner who is about to
  // finish setup should see the budget the shelf will price against and the shape it will draw
  // for, with an Edit next to each, rather than meeting both as a surprise on the Create page.
  // Left blank when they skipped the screen: "never answered" is a real state and the shelf
  // treats it as a storefront with no cap, so the review must not invent an answer either.
  const shapeValue = isShelfShape(data.shape) ? T(SHAPE_LABEL[data.shape].title) : null
  const locationsValue = extraLocs.length
    ? T('{n} total', { n: extraLocs.length + 1 })
    : (data.location_count || null)

  return (
    <>
      <Question title={T('One last look')} subtitle={T('Tap Edit to change anything.')} icon={<CheckCircle2 size={28} strokeWidth={2} />} />
      <div className="mt-5 space-y-2">
        <ReviewCard T={T} title="You" stepId="role" onEdit={onGoToStep} rows={[
          { label: 'Role', value: roleName },
        ]} />
        <ReviewCard T={T} title="Business" stepId="biz_name" onEdit={onGoToStep} rows={[
          { label: 'Name', value: data.biz_name || null },
          { label: 'Website', value: data.website || null },
          { label: 'Phone', value: data.phone || null },
          { label: 'Location', value: mainLoc },
          { label: 'Locations', value: locationsValue },
          { label: 'Other spots', value: extraLocList },
        ]} />
        <ReviewCard T={T} title="What you are" stepId="biz_type" onEdit={onGoToStep} rows={[
          { label: 'Type', value: (data.biz_type === 'Other' ? data.biz_other : data.biz_type) || null },
          { label: 'Cuisine', value: isFood ? ((data.cuisine === 'Other' ? data.cuisine_other : data.cuisine) || null) : null },
          { label: 'Vibe', value: isFood && data.service_styles.length ? data.service_styles.join(', ') : null },
          { label: 'Mission', value: data.biz_desc || null },
          { label: 'Audience', value: data.customer_types.length ? data.customer_types.join(', ') : null },
        ]} />
        <ReviewCard T={T} title="How it runs" stepId="shape" onEdit={onGoToStep} rows={[
          { label: 'Shape', value: shapeValue },
        ]} />
        {isFood && (
          <ReviewCard T={T} title="Menu" stepId="menu" onEdit={onGoToStep} rows={[
            { label: 'Dishes', value: menuList },
          ]} />
        )}
        {isFood && (
          <ReviewCard T={T} title="Specials" stepId="specials" onEdit={onGoToStep} rows={[
            { label: 'Recurring', value: specialsList },
          ]} />
        )}
        <ReviewCard T={T} title="Story" stepId="about" onEdit={onGoToStep} rows={[
          { label: 'Stand out', value: data.unique || null },
          { label: 'Competitors', value: data.competitors || null },
          { label: 'Why you', value: data.why_choose.length ? data.why_choose.join(', ') : null },
        ]} />
        <ReviewCard T={T} title="Goals" stepId="goals" onEdit={onGoToStep} rows={[
          { label: 'Priority', value: data.primary_goal || null },
          { label: 'Success', value: data.success_signs.length ? data.success_signs.join(', ') : null },
          { label: 'Timeline', value: data.timeline || null },
        ]} />
        <ReviewCard T={T} title="Budget" stepId="budget" onEdit={onGoToStep} rows={[
          { label: 'To start', value: data.marketing_budget || null },
        ]} />
        <ReviewCard T={T} title="Promote" stepId="promote" onEdit={onGoToStep} rows={[
          { label: 'Highlights', value: data.main_offerings || null },
          { label: 'Coming up', value: data.upcoming || null },
        ]} />
        <ReviewCard T={T} title="Brand" stepId="brand_voice" onEdit={onGoToStep} rows={[
          { label: 'Tone', value: data.tones.length ? data.tones.join(', ') : null },
          { label: 'Custom tone', value: data.custom_tone || null },
          { label: 'Content', value: data.content_likes.length ? data.content_likes.join(', ') : null },
          { label: 'Avoid', value: data.avoid_list.length ? data.avoid_list.join(', ') : null },
        ]} />
        <ReviewCard T={T} title="Discovery" stepId="discovery" onEdit={onGoToStep} rows={[
          { label: 'Hashtags', value: hashtagList },
          { label: 'Keywords', value: keywordList },
        ]} />
        <ReviewCard T={T} title="Workflow" stepId="approval" onEdit={onGoToStep} rows={[
          { label: 'Style', value: approvalName },
          { label: 'On camera', value: data.can_film.length ? data.can_film.join(', ') : null },
        ]} />
        <ReviewCard T={T} title="Connected" stepId="connect" onEdit={onGoToStep} rows={[
          { label: 'Platforms', value: connectedList.length ? connectedList.join(', ') : null },
        ]} />
        <ReviewCard T={T} title="Assets" stepId="assets" onEdit={onGoToStep} rows={[
          { label: 'Logo', value: data.logo_name || null },
          { label: 'Photos', value: data.photo_count ? T('{n} uploaded', { n: data.photo_count }) : null },
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
          {/* Four pieces, not one sentence with holes in it: the two link words have to be
              tappable, so they cannot ride inside a {placeholder}. */}
          <span>
            {T("I agree to Apnosh's")}{' '}
            <a href="/terms" target="_blank" className="underline" style={{ color: '#2e9a78' }}>{T('Terms of Service')}</a>
            {' '}{T('and the')}{' '}
            <a href="/privacy" target="_blank" className="underline" style={{ color: '#2e9a78' }}>{T('Privacy Policy')}</a>.
          </span>
        </label>
      </div>

      {/* Complete button */}
      <PrimaryPill onClick={onComplete} disabled={!data.agreed_terms || saving} grow>
        {saving ? T('Saving...') : T('Complete setup')}
      </PrimaryPill>
    </>
  )
}

/* One colour per section, the same hues the setup screens used. */
const REVIEW_HUE: Record<string, string> = {
  You: 'mint', Business: 'newfaces', 'What you are': 'announce', Menu: 'announce', Specials: 'deal',
  Story: 'brand', Goals: 'event', Promote: 'announce', Brand: 'brand', Discovery: 'newfaces',
  // Same hues the two new setup screens wear, so the review reads as the same flow.
  'How it runs': 'newfaces', Budget: 'online',
  Workflow: 'nights', Connected: 'nights', Assets: 'catering',
}

function ReviewCard({
  title,
  stepId,
  onEdit,
  rows,
  T,
}: {
  /** the English name of the section: the key REVIEW_HUE is keyed on, and the key T looks up */
  title: string
  stepId: StepId
  onEdit: (stepId: StepId) => void
  rows: Array<{ label: string; value: string | null }>
  T: Tr
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
          {T(title)}
        </span>
        <button
          type="button"
          onClick={() => onEdit(stepId)}
          className="text-[12.5px] font-semibold"
          style={{ color: '#2e9a78' }}
        >
          {T('Edit')}
        </button>
      </div>
      {setRows.map((r) => (
        <div key={r.label} className="text-[13px] leading-relaxed" style={{ color: '#6e6e73' }}>
          {T(r.label)}:{' '}
          <span className="font-medium" style={{ color: '#1d1d1f' }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}
