'use client'

/**
 * Streamlined onboarding -- 5 steps + welcome screen.
 *
 * Replaces the 19-step deep wizard (now preserved at /onboarding/full
 * for AM-led deep onboarding). Goal: get the restaurant owner into
 * the portal in under 5 minutes with the essentials captured.
 *
 * The deeper questions (story, voice, content prefs, approval style,
 * customer types, etc.) move to contextual dashboard prompts the
 * portal surfaces after the owner has already experienced value.
 *
 * Data still writes to the businesses + clients tables using the same
 * column names as the deep wizard so AM tools keep working.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Loader2, Check, Sparkles,
  MapPin, Target, Camera, Globe, Search,
  Building2, ShoppingBag, Scissors, Dumbbell, Wrench, MoreHorizontal,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { completeOnboardingCRM } from '@/lib/onboarding-actions'

interface OnboardingData {
  role: string
  biz_name: string
  biz_type: string
  cuisine: string
  service_styles: string[]
  full_address: string
  city: string
  state: string
  zip: string
  location_count: string
  primary_goal: string
  goal_detail: string
  connected: string[]
}

const INITIAL: OnboardingData = {
  role: '',
  biz_name: '',
  biz_type: '',
  cuisine: '',
  service_styles: [],
  full_address: '',
  city: '',
  state: '',
  zip: '',
  location_count: '1',
  primary_goal: '',
  goal_detail: '',
  connected: [],
}

const ROLES = [
  { id: 'owner',    label: 'Owner',     desc: 'I own this business' },
  { id: 'manager',  label: 'Manager',   desc: 'I run marketing here' },
  { id: 'employee', label: 'Employee',  desc: 'I help with marketing' },
  { id: 'agency',   label: 'Agency',    desc: 'I work for the owner' },
]

const BIZ_TYPES = [
  { id: 'restaurant', label: 'Restaurant / café / bar', icon: Building2 },
  { id: 'retail',     label: 'Retail store',            icon: ShoppingBag },
  { id: 'salon',      label: 'Salon / spa / beauty',    icon: Scissors },
  { id: 'fitness',    label: 'Fitness / gym',           icon: Dumbbell },
  { id: 'service',    label: 'Service business',        icon: Wrench },
  { id: 'other',      label: 'Something else',          icon: MoreHorizontal },
]

const CUISINES = [
  'American', 'Italian', 'Mexican', 'Asian', 'Mediterranean',
  'Pizza', 'BBQ', 'Coffee shop', 'Bakery', 'Vegan',
  'Bar / pub', 'Fine dining', 'Fast casual', 'Food truck', 'Other',
]

const SERVICE_STYLES = [
  { id: 'dine_in',  label: 'Dine in' },
  { id: 'takeout',  label: 'Takeout' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'catering', label: 'Catering' },
]

const GOALS = [
  { id: 'foot_traffic', label: 'More foot traffic',    desc: 'Get more locals walking in' },
  { id: 'online_orders', label: 'More online orders',  desc: 'Drive delivery + pickup' },
  { id: 'reservations', label: 'More reservations',    desc: 'Fill tables ahead of time' },
  { id: 'brand',        label: 'Build the brand',      desc: 'Awareness, followers, story' },
  { id: 'reviews',      label: 'Better reviews',       desc: 'Reputation across platforms' },
  { id: 'social',       label: 'Grow social',          desc: 'Followers, engagement, reach' },
]

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram',         icon: Camera, oauth: '/api/auth/instagram-direct' },
  { id: 'facebook',  label: 'Facebook',          icon: Globe,  oauth: '/api/auth/instagram' },
  { id: 'gbp',       label: 'Google Business',   icon: Search, oauth: '/api/auth/google-business' },
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

  /* Bootstrap: load auth user + existing businesses row (if any). */
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
          biz_type: biz.industry || '',
          cuisine: biz.cuisine || '',
          service_styles: biz.service_styles || [],
          full_address: biz.address || '',
          city: biz.city || '',
          state: biz.state || '',
          zip: biz.zip || '',
          location_count: biz.location_count || '1',
          primary_goal: biz.primary_goal || '',
          goal_detail: biz.goal_detail || '',
          connected: biz.current_platforms || [],
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

  /* Persist a partial row after every step so progress survives a
     mid-flow refresh. Returns the businessId so subsequent calls can
     update the same row. */
  async function persist(): Promise<string | null> {
    if (!userId) return null
    const payload = {
      owner_id: userId,
      user_role: data.role || null,
      name: data.biz_name || null,
      industry: data.biz_type || null,
      cuisine: data.cuisine || null,
      service_styles: data.service_styles,
      address: data.full_address || null,
      city: data.city || null,
      state: data.state || null,
      zip: data.zip || null,
      location_count: data.location_count || null,
      primary_goal: data.primary_goal || null,
      goal_detail: data.goal_detail || null,
      current_platforms: data.connected,
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
      role: data.role,
      biz_name: data.biz_name,
      website: '',
      phone: '',
      biz_type: data.biz_type,
      biz_other: '',
      cuisine: data.cuisine,
      cuisine_other: '',
      service_styles: data.service_styles,
      full_address: data.full_address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      location_count: data.location_count,
      hours: {},
      biz_desc: '',
      unique: '',
      competitors: '',
      customer_types: [],
      why_choose: [],
      primary_goal: data.primary_goal,
      goal_detail: data.goal_detail,
      success_signs: [],
      timeline: '',
      main_offerings: '',
      upcoming: '',
      tones: [],
      content_likes: [],
      ref_accounts: '',
      avoid_list: [],
      approval_style: '',
      connected: data.connected,
      logo_url: '',
      logo_name: '',
      photos: [],
    })

    setSaving(false)
    setDone(true)
  }

  const valid =
    step === 1 ? !!data.role :
    step === 2 ? !!data.biz_name && !!data.biz_type && (data.biz_type !== 'restaurant' || !!data.cuisine) :
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
          {step === 1 && <RoleStep data={data} update={update} />}
          {step === 2 && <BusinessStep data={data} update={update} />}
          {step === 3 && <LocationStep data={data} update={update} />}
          {step === 4 && <GoalStep data={data} update={update} />}
          {step === 5 && <ConnectStep data={data} update={update} businessId={businessId} />}
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

function RoleStep({
  data, update,
}: { data: OnboardingData; update: <K extends keyof OnboardingData>(f: K, v: OnboardingData[K]) => void }) {
  return (
    <div>
      <h1 className="text-[26px] font-semibold text-ink leading-tight">
        Hi 👋 Who are you to this business?
      </h1>
      <p className="text-[14px] text-ink-3 mt-1.5">
        Helps us tailor what we ask next.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-6">
        {ROLES.map(r => {
          const selected = data.role === r.id
          return (
            <button
              key={r.id}
              onClick={() => update('role', r.id)}
              className={`text-left rounded-2xl px-4 py-3 transition-all ${
                selected
                  ? 'bg-brand/5 ring-2 ring-brand'
                  : 'bg-bg-2 ring-1 ring-transparent hover:ring-ink-5'
              }`}
            >
              <p className="text-[14px] font-semibold text-ink">{r.label}</p>
              <p className="text-[12px] text-ink-3 mt-0.5">{r.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BusinessStep({
  data, update,
}: { data: OnboardingData; update: <K extends keyof OnboardingData>(f: K, v: OnboardingData[K]) => void }) {
  const isFood = data.biz_type === 'restaurant'
  return (
    <div>
      <h1 className="text-[26px] font-semibold text-ink leading-tight">
        Tell us about your business
      </h1>
      <p className="text-[14px] text-ink-3 mt-1.5">
        Just the basics. Takes 60 seconds.
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            Business name
          </label>
          <input
            type="text"
            value={data.biz_name}
            onChange={e => update('biz_name', e.target.value)}
            placeholder="e.g. Marco's Pizza"
            className="w-full rounded-xl bg-bg-2 ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none px-3.5 py-2.5 text-[14px]"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
            What kind of business?
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {BIZ_TYPES.map(t => {
              const Icon = t.icon
              const selected = data.biz_type === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => update('biz_type', t.id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all ${
                    selected
                      ? 'bg-brand/5 ring-2 ring-brand'
                      : 'bg-bg-2 ring-1 ring-transparent hover:ring-ink-5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
                  <span className="text-[12.5px] font-medium text-ink">{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {isFood && (
          <>
            <div>
              <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">
                Cuisine
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
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
                Service styles (pick any)
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
          </>
        )}
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
        Drives local search visibility and helps us match a strategist who knows your area.
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
            autoFocus
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
        What&apos;s the ONE thing you want most help with?
      </h1>
      <p className="text-[14px] text-ink-3 mt-1.5">
        Pick the top priority. We can add more later.
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

function ConnectStep({
  data, update, businessId,
}: {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(f: K, v: OnboardingData[K]) => void
  businessId: string | null
}) {
  function toggle(platform: string) {
    const next = data.connected.includes(platform)
      ? data.connected.filter(p => p !== platform)
      : [...data.connected, platform]
    update('connected', next)
  }

  return (
    <div>
      <h1 className="text-[26px] font-semibold text-ink leading-tight">
        Connect your accounts
      </h1>
      <p className="text-[14px] text-ink-3 mt-1.5">
        Mark which ones you have. You can connect them in the portal anytime; skipping is fine.
      </p>

      <div className="space-y-2 mt-6">
        {PLATFORMS.map(p => {
          const Icon = p.icon
          const selected = data.connected.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
                selected
                  ? 'bg-brand/5 ring-2 ring-brand'
                  : 'bg-bg-2 ring-1 ring-transparent hover:ring-ink-5'
              }`}
            >
              <span className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${
                selected ? 'bg-brand text-white' : 'bg-white ring-1 ring-ink-6 text-ink-3'
              }`}>
                {selected ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-ink">{p.label}</p>
                <p className="text-[11.5px] text-ink-3 mt-0.5">
                  {p.id === 'instagram' && 'Track followers, reach, engagement'}
                  {p.id === 'facebook'  && 'Page performance + linked Instagram'}
                  {p.id === 'gbp'       && 'Get found on Google + Maps'}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <p className="text-[11.5px] text-ink-4 mt-4">
        Your strategist will help you actually connect these inside the portal. For now just mark which ones exist.
      </p>
    </div>
  )
}

function DoneScreen({ bizName }: { bizName: string }) {
  const router = useRouter()
  useEffect(() => {
    /* Auto-redirect after a beat so they feel the celebration but
       don't have to click. */
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
