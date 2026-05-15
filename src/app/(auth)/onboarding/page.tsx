'use client'

/**
 * Restaurant-first onboarding -- 5 steps, ~3-5 min total.
 *
 * Apnosh's primary market is restaurants, so this flow is tailored
 * end-to-end for that buyer: restaurant subtype + cuisine + service
 * styles + price tier on the basics step, reservations + delivery
 * platforms on the connect step, restaurant-specific goal copy.
 *
 * Non-restaurant businesses can use the same flow (we accept 'other_food'
 * + 'non_food' subtypes) or drop into the deeper /onboarding/full
 * questionnaire for the AM-led path.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Loader2, Check, Sparkles,
  MapPin, Target, Camera, Globe, Search, UtensilsCrossed,
  Coffee, Beer, Truck, Cookie, Soup, ChefHat, ShoppingBag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { completeOnboardingCRM } from '@/lib/onboarding-actions'

interface OnboardingData {
  role: string
  biz_name: string
  restaurant_subtype: string
  cuisine: string
  service_styles: string[]
  price_tier: string
  full_address: string
  city: string
  state: string
  zip: string
  location_count: string
  primary_goal: string
  goal_detail: string
  connected: string[]
  reservations_platform: string
  delivery_platforms: string[]
  website_url: string
}

const INITIAL: OnboardingData = {
  role: '',
  biz_name: '',
  restaurant_subtype: '',
  cuisine: '',
  service_styles: [],
  price_tier: '',
  full_address: '',
  city: '',
  state: '',
  zip: '',
  location_count: '1',
  primary_goal: '',
  goal_detail: '',
  connected: [],
  reservations_platform: '',
  delivery_platforms: [],
  website_url: '',
}

const ROLES = [
  { id: 'owner',    label: 'Owner',     desc: 'I own this restaurant' },
  { id: 'manager',  label: 'Manager',   desc: 'I run things here' },
  { id: 'employee', label: 'Employee',  desc: 'I help with marketing' },
  { id: 'agency',   label: 'Other',     desc: 'I work for the owner' },
]

const SUBTYPES = [
  { id: 'restaurant',    label: 'Restaurant',     icon: UtensilsCrossed, desc: 'Full menu, seated service' },
  { id: 'cafe',          label: 'Café / coffee',  icon: Coffee,          desc: 'Coffee, pastries, light fare' },
  { id: 'bar',           label: 'Bar / pub',      icon: Beer,            desc: 'Drinks-led, small plates ok' },
  { id: 'food_truck',    label: 'Food truck',     icon: Truck,           desc: 'Mobile or pop-up' },
  { id: 'bakery',        label: 'Bakery',         icon: Cookie,          desc: 'Baked goods, dessert shop' },
  { id: 'fast_casual',   label: 'Fast casual',    icon: Soup,            desc: 'Counter service, quick' },
  { id: 'catering',      label: 'Catering',       icon: ChefHat,         desc: 'Events + private dining' },
  { id: 'non_food',      label: 'Not food',       icon: ShoppingBag,     desc: 'Different industry' },
]

const CUISINES = [
  'American', 'Italian', 'Mexican', 'Asian fusion', 'Chinese', 'Japanese',
  'Thai', 'Indian', 'Mediterranean', 'Middle Eastern', 'French',
  'Pizza', 'BBQ', 'Seafood', 'Steakhouse',
  'Vegan / plant-based', 'Health / bowls', 'Breakfast / brunch',
  'Dessert', 'Bakery', 'Coffee', 'Cocktail bar', 'Wine bar',
  'Other',
]

const SERVICE_STYLES = [
  { id: 'dine_in',     label: 'Dine in' },
  { id: 'takeout',     label: 'Takeout' },
  { id: 'delivery',    label: 'Delivery' },
  { id: 'catering',    label: 'Catering' },
  { id: 'drive_thru',  label: 'Drive-thru' },
]

const PRICE_TIERS = [
  { id: '$',    label: '$',    sub: 'Under $15 / person' },
  { id: '$$',   label: '$$',   sub: '$15–$30' },
  { id: '$$$',  label: '$$$',  sub: '$30–$60' },
  { id: '$$$$', label: '$$$$', sub: '$60+' },
]

const GOALS = [
  { id: 'foot_traffic',  label: 'More foot traffic',     desc: 'Get more locals walking in' },
  { id: 'online_orders', label: 'More online orders',    desc: 'DoorDash / UberEats / your own' },
  { id: 'reservations',  label: 'More reservations',     desc: 'Fill those Friday + Saturday nights' },
  { id: 'reviews',       label: 'Better reviews',        desc: '4-star → 4.8-star reputation' },
  { id: 'social',        label: 'Grow social',           desc: 'IG followers, viral Reels, real engagement' },
  { id: 'brand',         label: 'Brand awareness',       desc: 'Be the new spot everyone knows' },
]

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram',         icon: Camera, copy: 'Track followers, reach, engagement' },
  { id: 'facebook',  label: 'Facebook',          icon: Globe,  copy: 'Page performance + linked Instagram' },
  { id: 'gbp',       label: 'Google Business',   icon: Search, copy: 'Get found on Google + Maps' },
]

const RESERVATIONS = [
  { id: 'opentable', label: 'OpenTable' },
  { id: 'resy',      label: 'Resy' },
  { id: 'tock',      label: 'Tock' },
  { id: 'yelp',      label: 'Yelp Reservations' },
  { id: 'in_house',  label: 'In-house only' },
  { id: 'none',      label: 'No reservations' },
]

const DELIVERY = [
  { id: 'doordash', label: 'DoorDash' },
  { id: 'ubereats', label: 'Uber Eats' },
  { id: 'grubhub',  label: 'Grubhub' },
  { id: 'toast',    label: 'Toast' },
  { id: 'own',      label: 'Our own' },
  { id: 'none',     label: 'No delivery' },
]

const TOTAL_STEPS = 5

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>(INITIAL)
  const [userId, setUserId] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: biz } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle()

      if (biz) {
        setBusinessId(biz.id)
        if (biz.onboarding_completed) { router.push('/dashboard'); return }
        setData(d => ({
          ...d,
          role: biz.user_role || '',
          biz_name: biz.name || '',
          restaurant_subtype: biz.restaurant_subtype || '',
          cuisine: biz.cuisine || '',
          service_styles: biz.service_styles || [],
          price_tier: biz.price_tier || '',
          full_address: biz.address || '',
          city: biz.city || '',
          state: biz.state || '',
          zip: biz.zip || '',
          location_count: biz.location_count || '1',
          primary_goal: biz.primary_goal || '',
          goal_detail: biz.goal_detail || '',
          connected: biz.current_platforms || [],
          reservations_platform: biz.reservations_platform || '',
          delivery_platforms: biz.delivery_platforms || [],
          website_url: biz.website_url || '',
        }))
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update<K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) {
    setData(d => ({ ...d, [field]: value }))
  }

  async function persist(): Promise<string | null> {
    if (!userId) return null
    const isFood = data.restaurant_subtype && data.restaurant_subtype !== 'non_food'
    const payload = {
      owner_id: userId,
      user_role: data.role || null,
      name: data.biz_name || null,
      /* Keep legacy industry column populated for backwards compat.
         Restaurant subtype is the more granular field we filter on. */
      industry: isFood ? 'restaurant' : (data.restaurant_subtype === 'non_food' ? 'other' : null),
      restaurant_subtype: data.restaurant_subtype || null,
      cuisine: data.cuisine || null,
      service_styles: data.service_styles,
      price_tier: data.price_tier || null,
      address: data.full_address || null,
      city: data.city || null,
      state: data.state || null,
      zip: data.zip || null,
      location_count: data.location_count || null,
      primary_goal: data.primary_goal || null,
      goal_detail: data.goal_detail || null,
      current_platforms: data.connected,
      reservations_platform: data.reservations_platform || null,
      delivery_platforms: data.delivery_platforms,
      website_url: data.website_url || null,
      onboarding_step: step,
    }
    if (businessId) {
      await supabase.from('businesses').update(payload).eq('id', businessId)
      return businessId
    }
    const { data: inserted } = await supabase
      .from('businesses')
      .insert(payload)
      .select('id')
      .single()
    if (inserted?.id) setBusinessId(inserted.id)
    return inserted?.id ?? null
  }

  async function goNext() {
    setSaving(true)
    await persist()
    setSaving(false)
    if (step < TOTAL_STEPS) {
      setStep(s => s + 1)
    } else {
      await handleComplete()
    }
  }

  function goBack() {
    if (step > 1) setStep(s => s - 1)
  }

  async function handleComplete() {
    if (!businessId || !userId) return
    setSaving(true)
    await supabase
      .from('businesses')
      .update({
        onboarding_completed: true,
        onboarding_step: TOTAL_STEPS + 1,
        agreed_terms: true,
        agreed_terms_at: new Date().toISOString(),
      })
      .eq('id', businessId)

    await completeOnboardingCRM(businessId, userId, {
      role: data.role, biz_name: data.biz_name, website: data.website_url, phone: '',
      biz_type: data.restaurant_subtype === 'non_food' ? 'other' : 'restaurant',
      biz_other: '', cuisine: data.cuisine, cuisine_other: '',
      service_styles: data.service_styles,
      full_address: data.full_address, city: data.city, state: data.state, zip: data.zip,
      location_count: data.location_count, hours: {},
      biz_desc: '', unique: '', competitors: '',
      customer_types: [], why_choose: [],
      primary_goal: data.primary_goal, goal_detail: data.goal_detail,
      success_signs: [], timeline: '', main_offerings: '', upcoming: '',
      tones: [], content_likes: [], ref_accounts: '', avoid_list: [],
      approval_style: '',
      connected: data.connected, logo_url: '', logo_name: '', photos: [],
    })

    setSaving(false)
    setDone(true)
  }

  const isFood = data.restaurant_subtype && data.restaurant_subtype !== 'non_food'
  const valid =
    step === 1 ? !!data.role && !!data.biz_name && !!data.restaurant_subtype :
    step === 2 ? !isFood || (!!data.cuisine && data.service_styles.length > 0) :
    step === 3 ? !!data.full_address || (!!data.city && !!data.state) :
    step === 4 ? !!data.primary_goal :
    step === 5 ? true :
    false

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-4" />
      </div>
    )
  }

  if (done) return <DoneScreen bizName={data.biz_name} />

  return (
    <div className="min-h-screen bg-bg-2/40">
      <div className="max-w-2xl mx-auto px-5 pt-8 pb-12">
        {/* Header */}
        <div className="mb-7">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
              Step {step} of {TOTAL_STEPS}
            </p>
            <Link
              href="/onboarding/full"
              className="text-[11px] text-ink-3 hover:text-ink-2"
            >
              Need a deeper questionnaire? →
            </Link>
          </div>
          <div className="h-1 bg-ink-7 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="bg-white rounded-3xl border border-ink-6 p-7 sm:p-9 shadow-sm">
          {step === 1 && <BasicsStep data={data} update={update} />}
          {step === 2 && <KitchenStep data={data} update={update} isFood={!!isFood} />}
          {step === 3 && <LocationStep data={data} update={update} />}
          {step === 4 && <GoalStep data={data} update={update} />}
          {step === 5 && <PresenceStep data={data} update={update} />}
        </div>

        {/* Nav */}
        <div className="flex items-center justify-between mt-5">
          {step > 1 ? (
            <button
              onClick={goBack}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink px-3 py-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          ) : <div />}
          <button
            onClick={goNext}
            disabled={!valid || saving}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed rounded-full px-5 py-2.5 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {step === TOTAL_STEPS ? "I'm done" : 'Continue'}
            {!saving && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────── Steps ─────────────────────────────── */

function BasicsStep({
  data, update,
}: { data: OnboardingData; update: <K extends keyof OnboardingData>(f: K, v: OnboardingData[K]) => void }) {
  return (
    <div>
      <h1 className="text-[26px] font-semibold text-ink leading-tight">
        Tell us about your spot
      </h1>
      <p className="text-[14px] text-ink-3 mt-1.5">
        Three quick fields. Takes a minute.
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Your role
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ROLES.map(r => {
              const selected = data.role === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => update('role', r.id)}
                  className={`text-left rounded-xl px-3 py-2.5 transition-all ${
                    selected
                      ? 'bg-brand/5 ring-2 ring-brand'
                      : 'bg-bg-2 ring-1 ring-transparent hover:ring-ink-5'
                  }`}
                >
                  <p className="text-[13px] font-semibold text-ink">{r.label}</p>
                  <p className="text-[11px] text-ink-3 mt-0.5">{r.desc}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Restaurant name
          </label>
          <input
            type="text"
            value={data.biz_name}
            onChange={e => update('biz_name', e.target.value)}
            placeholder="e.g. Marco's Pizza"
            className="w-full rounded-xl bg-bg-2 ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none px-3.5 py-2.5 text-[14px]"
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            What kind of spot?
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SUBTYPES.map(t => {
              const Icon = t.icon
              const selected = data.restaurant_subtype === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => update('restaurant_subtype', t.id)}
                  className={`flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-left transition-all ${
                    selected
                      ? 'bg-brand/5 ring-2 ring-brand'
                      : 'bg-bg-2 ring-1 ring-transparent hover:ring-ink-5'
                  }`}
                >
                  <Icon className="w-4 h-4 text-ink-3 flex-shrink-0" />
                  <span className="text-[12.5px] font-semibold text-ink">{t.label}</span>
                  <span className="text-[10.5px] text-ink-3 leading-tight">{t.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function KitchenStep({
  data, update, isFood,
}: {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(f: K, v: OnboardingData[K]) => void
  isFood: boolean
}) {
  if (!isFood) {
    return (
      <div>
        <h1 className="text-[26px] font-semibold text-ink leading-tight">
          Got it, not a food business
        </h1>
        <p className="text-[14px] text-ink-3 mt-1.5">
          The portal works for any local business. Your strategist will tailor things.
          Hit Continue to move on.
        </p>
        <div className="mt-6 rounded-2xl bg-bg-2 p-4 text-[12.5px] text-ink-2">
          We can still help with: social content, local SEO, reviews, ads, website,
          email/SMS, and brand. If you want a more tailored questionnaire, click
          &quot;Need a deeper questionnaire?&quot; at the top.
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-[26px] font-semibold text-ink leading-tight">
        What you serve
      </h1>
      <p className="text-[14px] text-ink-3 mt-1.5">
        Helps your strategist pick the right voice, photos, and timing.
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Cuisine
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {CUISINES.map(c => {
              const selected = data.cuisine === c
              return (
                <button
                  key={c}
                  onClick={() => update('cuisine', c)}
                  className={`rounded-lg px-2 py-1.5 text-[11.5px] font-medium transition-all ${
                    selected
                      ? 'bg-brand/5 ring-2 ring-brand text-ink'
                      : 'bg-bg-2 ring-1 ring-transparent hover:ring-ink-5 text-ink-2'
                  }`}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Service styles <span className="text-ink-4 font-normal">(pick any)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SERVICE_STYLES.map(s => {
              const selected = data.service_styles.includes(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    const next = selected
                      ? data.service_styles.filter(x => x !== s.id)
                      : [...data.service_styles, s.id]
                    update('service_styles', next)
                  }}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                    selected
                      ? 'bg-brand text-white'
                      : 'bg-bg-2 ring-1 ring-ink-6 text-ink-2 hover:ring-ink-4'
                  }`}
                >
                  {selected && <Check className="w-3 h-3 inline-block mr-1" />}
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Price point
          </label>
          <div className="grid grid-cols-4 gap-2">
            {PRICE_TIERS.map(p => {
              const selected = data.price_tier === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => update('price_tier', p.id)}
                  className={`rounded-xl px-3 py-2.5 text-center transition-all ${
                    selected
                      ? 'bg-brand/5 ring-2 ring-brand'
                      : 'bg-bg-2 ring-1 ring-transparent hover:ring-ink-5'
                  }`}
                >
                  <p className="text-[16px] font-bold text-ink">{p.label}</p>
                  <p className="text-[10px] text-ink-3 mt-0.5">{p.sub}</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function LocationStep({
  data, update,
}: { data: OnboardingData; update: <K extends keyof OnboardingData>(f: K, v: OnboardingData[K]) => void }) {
  return (
    <div>
      <h1 className="text-[26px] font-semibold text-ink leading-tight flex items-center gap-2">
        <MapPin className="w-6 h-6 text-ink-4" />
        Where are you?
      </h1>
      <p className="text-[14px] text-ink-3 mt-1.5">
        Drives local search visibility and matches you with a strategist who knows the area.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Street address
          </label>
          <input
            type="text"
            value={data.full_address}
            onChange={e => update('full_address', e.target.value)}
            placeholder="123 Main Street"
            className="w-full rounded-xl bg-bg-2 ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none px-3.5 py-2.5 text-[14px]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">City</label>
            <input
              type="text"
              value={data.city}
              onChange={e => update('city', e.target.value)}
              placeholder="Seattle"
              className="w-full rounded-xl bg-bg-2 ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none px-3.5 py-2.5 text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">State</label>
            <input
              type="text"
              value={data.state}
              onChange={e => update('state', e.target.value)}
              placeholder="WA"
              maxLength={2}
              className="w-full rounded-xl bg-bg-2 ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none px-3.5 py-2.5 text-[14px] uppercase"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            How many locations?
          </label>
          <div className="flex gap-2">
            {['1', '2-3', '4-10', '10+'].map(opt => {
              const selected = data.location_count === opt
              return (
                <button
                  key={opt}
                  onClick={() => update('location_count', opt)}
                  className={`rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-all ${
                    selected
                      ? 'bg-brand text-white'
                      : 'bg-bg-2 ring-1 ring-ink-6 text-ink-2 hover:ring-ink-4'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function GoalStep({
  data, update,
}: { data: OnboardingData; update: <K extends keyof OnboardingData>(f: K, v: OnboardingData[K]) => void }) {
  return (
    <div>
      <h1 className="text-[26px] font-semibold text-ink leading-tight flex items-center gap-2">
        <Target className="w-6 h-6 text-ink-4" />
        What&apos;s the ONE thing you want most?
      </h1>
      <p className="text-[14px] text-ink-3 mt-1.5">
        Pick the top priority. Your strategist focuses here first.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6">
        {GOALS.map(g => {
          const selected = data.primary_goal === g.id
          return (
            <button
              key={g.id}
              onClick={() => update('primary_goal', g.id)}
              className={`text-left rounded-2xl px-4 py-3 transition-all ${
                selected
                  ? 'bg-brand/5 ring-2 ring-brand'
                  : 'bg-bg-2 ring-1 ring-transparent hover:ring-ink-5'
              }`}
            >
              <p className="text-[14px] font-semibold text-ink">{g.label}</p>
              <p className="text-[12px] text-ink-3 mt-0.5">{g.desc}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
          Anything specific your strategist should know? <span className="text-ink-4 font-normal">(optional)</span>
        </label>
        <textarea
          value={data.goal_detail}
          onChange={e => update('goal_detail', e.target.value)}
          rows={2}
          placeholder="e.g. New brunch menu launching next month. Want to fill Saturday mornings."
          className="w-full rounded-xl bg-bg-2 ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none px-3.5 py-2.5 text-[13.5px] resize-none"
        />
      </div>
    </div>
  )
}

function PresenceStep({
  data, update,
}: { data: OnboardingData; update: <K extends keyof OnboardingData>(f: K, v: OnboardingData[K]) => void }) {
  function togglePlatform(p: string) {
    const next = data.connected.includes(p)
      ? data.connected.filter(x => x !== p)
      : [...data.connected, p]
    update('connected', next)
  }
  function toggleDelivery(p: string) {
    if (p === 'none') {
      update('delivery_platforms', data.delivery_platforms.includes('none') ? [] : ['none'])
      return
    }
    const without = data.delivery_platforms.filter(x => x !== 'none')
    const next = without.includes(p) ? without.filter(x => x !== p) : [...without, p]
    update('delivery_platforms', next)
  }

  return (
    <div>
      <h1 className="text-[26px] font-semibold text-ink leading-tight">
        Your online presence
      </h1>
      <p className="text-[14px] text-ink-3 mt-1.5">
        Tell us what you have. You can actually connect things later from the portal.
      </p>

      <div className="mt-6 space-y-5">
        {/* Website */}
        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Website <span className="text-ink-4 font-normal">(optional)</span>
          </label>
          <input
            type="url"
            value={data.website_url}
            onChange={e => update('website_url', e.target.value)}
            placeholder="https://marcospizza.com"
            className="w-full rounded-xl bg-bg-2 ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none px-3.5 py-2.5 text-[14px]"
          />
        </div>

        {/* Social platforms */}
        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-2">
            Mark what you have
          </label>
          <div className="space-y-2">
            {PLATFORMS.map(p => {
              const Icon = p.icon
              const selected = data.connected.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    selected
                      ? 'bg-brand/5 ring-2 ring-brand'
                      : 'bg-bg-2 ring-1 ring-transparent hover:ring-ink-5'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${
                    selected ? 'bg-brand text-white' : 'bg-white ring-1 ring-ink-6 text-ink-3'
                  }`}>
                    {selected ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink">{p.label}</p>
                    <p className="text-[11px] text-ink-3 mt-0.5">{p.copy}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Reservations */}
        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Reservations <span className="text-ink-4 font-normal">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {RESERVATIONS.map(r => {
              const selected = data.reservations_platform === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => update('reservations_platform', selected ? '' : r.id)}
                  className={`rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-all ${
                    selected
                      ? 'bg-brand text-white'
                      : 'bg-bg-2 ring-1 ring-ink-6 text-ink-2 hover:ring-ink-4'
                  }`}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Delivery */}
        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Delivery / online orders <span className="text-ink-4 font-normal">(pick any)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DELIVERY.map(d => {
              const selected = data.delivery_platforms.includes(d.id)
              return (
                <button
                  key={d.id}
                  onClick={() => toggleDelivery(d.id)}
                  className={`rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-all ${
                    selected
                      ? 'bg-brand text-white'
                      : 'bg-bg-2 ring-1 ring-ink-6 text-ink-2 hover:ring-ink-4'
                  }`}
                >
                  {selected && <Check className="w-2.5 h-2.5 inline-block mr-1" />}
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function DoneScreen({ bizName }: { bizName: string }) {
  const router = useRouter()
  useEffect(() => {
    const t = setTimeout(() => router.push('/dashboard'), 1500)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="min-h-screen grid place-items-center px-5 bg-gradient-to-br from-emerald-50/40 via-white to-rose-50/30">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 ring-1 ring-emerald-200 grid place-items-center mb-5">
          <Sparkles className="w-7 h-7 text-emerald-700" />
        </div>
        <h1 className="text-[28px] font-semibold text-ink">
          You&apos;re in, {bizName || 'welcome'}!
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed">
          Your portal is ready. Taking you there now.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-ink-4" />
          <span className="text-[12px] text-ink-3">Loading your dashboard...</span>
        </div>
      </div>
    </div>
  )
}
