'use client'

/**
 * Restaurant shape editor (Phase B3).
 *
 * 4-dimension capture: footprint, concept, customer_mix, digital_maturity.
 * Per PRODUCT-SPEC.md, this is the "Your restaurant" surface --
 * shape drives playbook adaptation.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Store } from 'lucide-react'
import { setClientShape } from '@/lib/goals/mutations'
import type {
  RestaurantShape, Footprint, Concept, CustomerMix, DigitalMaturity,
} from '@/lib/goals/types'

const FOOTPRINT_OPTIONS: Array<{ value: Footprint; label: string; help: string }> = [
  { value: 'single_neighborhood', label: 'One neighborhood spot', help: 'Single location, locals are most of your customers' },
  { value: 'single_destination', label: 'One destination spot', help: 'Single location, people travel to visit you' },
  { value: 'multi_local', label: 'Multiple locations in one city', help: '2-5 stores in the same metro' },
  { value: 'multi_regional', label: 'Multi-city / regional', help: '5+ stores across a region' },
  { value: 'enterprise', label: 'Large chain', help: '20+ locations, national footprint' },
  { value: 'mobile', label: 'Food truck or pop-up', help: 'Mobile or rotating locations' },
  { value: 'ghost', label: 'Ghost kitchen / delivery-only', help: 'No dine-in; orders only' },
]

const CONCEPT_OPTIONS: Array<{ value: Concept; label: string }> = [
  { value: 'qsr', label: 'Quick-service (fast food)' },
  { value: 'fast_casual', label: 'Fast casual' },
  { value: 'casual', label: 'Casual dining' },
  { value: 'fine_dining', label: 'Fine dining' },
  { value: 'bar', label: 'Bar / cocktail' },
  { value: 'cafe', label: 'Cafe / coffee' },
  { value: 'mobile', label: 'Food truck / pop-up' },
  { value: 'delivery_only', label: 'Delivery / ghost kitchen' },
  { value: 'catering_heavy', label: 'Catering-focused' },
]

const CUSTOMER_MIX_OPTIONS: Array<{ value: CustomerMix; label: string; help: string }> = [
  { value: 'local_repeat', label: 'Mostly regulars', help: 'Same customers coming back' },
  { value: 'local_destination', label: 'Local destination', help: 'Locals come for special occasions' },
  { value: 'tourist_heavy', label: 'Tourist-driven', help: 'Out-of-towners are most of your traffic' },
  { value: 'regional_draw', label: 'Regional draw', help: 'People drive 30+ min to come' },
  { value: 'b2b_catering', label: 'B2B / catering', help: 'Companies and events drive most revenue' },
]

const DIGITAL_OPTIONS: Array<{ value: DigitalMaturity; label: string; help: string }> = [
  { value: 'nascent', label: 'Just getting started', help: 'Limited online presence' },
  { value: 'basic', label: 'Basic presence', help: 'Have accounts but not very active' },
  { value: 'active', label: 'Actively posting', help: 'Multiple channels, regular activity' },
  { value: 'sophisticated', label: 'Sophisticated', help: 'Multi-channel, data-informed marketing' },
]

interface Props {
  clientId: string
  initialShape: RestaurantShape | null
  /** Where to send the user after save. Defaults to /dashboard. */
  nextHref?: string
}

export default function ShapeEditor({ clientId, initialShape, nextHref = '/dashboard' }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [footprint, setFootprint] = useState<Footprint | ''>(initialShape?.footprint ?? '')
  const [concept, setConcept] = useState<Concept | ''>(initialShape?.concept ?? '')
  const [customerMix, setCustomerMix] = useState<CustomerMix | ''>(initialShape?.customerMix ?? '')
  const [digitalMaturity, setDigitalMaturity] = useState<DigitalMaturity | ''>(initialShape?.digitalMaturity ?? '')

  const canSave = !!(footprint && concept && customerMix && digitalMaturity)

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    await setClientShape({
      clientId,
      footprint: footprint as Footprint,
      concept: concept as Concept,
      customerMix: customerMix as CustomerMix,
      digitalMaturity: digitalMaturity as DigitalMaturity,
    })
    setSaving(false)
    startTransition(() => router.push(nextHref))
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <Store className="w-7 h-7 text-emerald-700" />
        </div>
        <h1 className="text-2xl font-bold text-ink mb-2">Your restaurant</h1>
        <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed">
          A few quick details so we can recommend the right marketing mix.
          The shape of your restaurant changes what works.
        </p>
      </div>

      <Section title="What's your footprint?" help="Choose the one that best describes your physical setup.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FOOTPRINT_OPTIONS.map(o => (
            <OptionButton
              key={o.value}
              label={o.label}
              help={o.help}
              active={footprint === o.value}
              onClick={() => setFootprint(o.value)}
            />
          ))}
        </div>
      </Section>

      <Section title="What kind of concept?" help="The food + experience type.">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CONCEPT_OPTIONS.map(o => (
            <OptionButton
              key={o.value}
              label={o.label}
              active={concept === o.value}
              onClick={() => setConcept(o.value)}
            />
          ))}
        </div>
      </Section>

      <Section title="Who are your customers?" help="The mix you serve today, not the mix you wish you had.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CUSTOMER_MIX_OPTIONS.map(o => (
            <OptionButton
              key={o.value}
              label={o.label}
              help={o.help}
              active={customerMix === o.value}
              onClick={() => setCustomerMix(o.value)}
            />
          ))}
        </div>
      </Section>

      <Section title="Where are you with digital marketing?" help="No wrong answer -- helps us pick the starting point.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DIGITAL_OPTIONS.map(o => (
            <OptionButton
              key={o.value}
              label={o.label}
              help={o.help}
              active={digitalMaturity === o.value}
              onClick={() => setDigitalMaturity(o.value)}
            />
          ))}
        </div>
      </Section>

      <div className="flex items-center justify-end pt-4 border-t border-ink-6">
        <button
          onClick={handleSave}
          disabled={!canSave || saving || pending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl px-6 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {saving || pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  )
}

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink mb-1">{title}</h2>
      {help && <p className="text-xs text-ink-3 mb-3">{help}</p>}
      {children}
    </div>
  )
}

function OptionButton({
  label, help, active, onClick,
}: { label: string; help?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-all text-sm ${
        active
          ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
          : 'bg-white border-ink-6 hover:border-emerald-300'
      }`}
    >
      <p className="font-medium text-ink">{label}</p>
      {help && <p className="text-[11px] text-ink-3 mt-0.5">{help}</p>}
    </button>
  )
}
