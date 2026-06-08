'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  type OnboardingData,
  type StepId,
  INITIAL_DATA,
  getScreens,
  canContinueScreen,
  getScreenPhase,
  stepIndexToScreen,
  screenToStepIndex,
} from './data'
import StepRenderer from './step-renderer'
import { completeOnboardingCRM } from '@/lib/onboarding-actions'

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [screenNo, setScreenNo] = useState(1)
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string>('')

  // Derived screen info. The wizard groups each phase's questions onto one
  // scrollable screen, so navigation moves screen-by-screen, not step-by-step.
  const screens = getScreens(data.biz_type)
  const totalScreens = screens.length
  const currentScreen = screens[screenNo - 1]
  const pct = Math.round((screenNo / totalScreens) * 100)
  const valid = currentScreen ? canContinueScreen(currentScreen, data) : false
  const phaseLabel = currentScreen ? getScreenPhase(currentScreen) : null

  // Load existing data on mount
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

        // Restore saved data
        const colors = (biz.brand_colors || {}) as { primary?: string; secondary?: string }
        setData({
          // Base defaults guarantee every field is present; restored values
          // below override the ones we persist on the businesses row. Newer
          // profile-only fields (price, signatures, dietary, rhythm, etc.) keep
          // their empty defaults until the client edits them.
          ...INITIAL_DATA,
          role: biz.user_role || '',
          biz_name: biz.name || '',
          website: biz.website_url || '',
          phone: biz.phone || '',
          biz_type: biz.industry || '',
          biz_other: biz.industry_other || '',
          cuisine: biz.cuisine || '',
          cuisine_other: biz.cuisine_other || '',
          service_styles: biz.service_styles || [],
          price_range: biz.price_range || '',
          signature_items: biz.signature_items || [],
          dietary_options: biz.dietary_options || [],
          reservations_platform: biz.reservations_platform || '',
          delivery_platforms: biz.delivery_platforms || [],
          menu_items: (biz.menu_items_draft as OnboardingData['menu_items']) || [],
          specials: (biz.specials_draft as OnboardingData['specials']) || [],
          locations: (biz.locations_draft as OnboardingData['locations']) || [],
          brand_hashtags: biz.brand_hashtags || [],
          target_keywords: biz.target_keywords || [],
          slow_periods: (biz.slow_periods as Record<string, string>) || {},
          customer_age_range: biz.customer_age_range || '',
          avoid_tones: biz.avoid_tones || [],
          emoji_usage: biz.emoji_usage || '',
          full_address: biz.address || '',
          city: biz.city || '',
          state: biz.state || '',
          zip: biz.zip || '',
          primary_location_name: biz.primary_location_name || '',
          location_count: biz.location_count || '',
          hours: biz.business_hours || {},
          biz_desc: biz.description || '',
          unique: biz.differentiator || '',
          competitors: Array.isArray(biz.competitors) ? (biz.competitors as string[]).join(', ') : '',
          customer_types: biz.customer_types || [],
          why_choose: biz.why_choose || [],
          primary_goal: biz.primary_goal || '',
          goal_detail: biz.goal_detail || '',
          success_signs: biz.success_signs || [],
          timeline: biz.timeline || '',
          main_offerings: biz.main_offerings || '',
          upcoming: biz.upcoming || '',
          tones: Array.isArray(biz.brand_voice_words) ? biz.brand_voice_words as string[] : [],
          custom_tone: biz.brand_tone || '',
          content_likes: biz.content_likes || [],
          ref_accounts: biz.ref_accounts || '',
          avoid_list: biz.avoid_list || [],
          approval_type: biz.approval_type || '',
          can_film: biz.can_film || [],
          can_tag: biz.can_tag || '',
          connected: Array.isArray(biz.current_platforms)
            ? Object.fromEntries((biz.current_platforms as string[]).map((p) => [p, true]))
            : {},
          logo_name: '',
          photo_count: 0,
          color1: colors.primary || '#4abd98',
          color2: colors.secondary || '#2e9a78',
          brand_drive: biz.brand_drive || '',
          agreed_terms: biz.agreed_terms || false,
        })

        // Resume from saved progress. onboarding_step is persisted as a step
        // index for backward compatibility; map it to the screen that holds it.
        if (biz.onboarding_step && biz.onboarding_step > 1) {
          setScreenNo(stepIndexToScreen(biz.industry || '', biz.onboarding_step))
        }
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Field updater
  const update = useCallback(<K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => {
    setData((prev) => ({ ...prev, [field]: value }))
  }, [])

  // Save current data to Supabase. `nextScreen` is a 1-based screen index;
  // we persist it as a step index so older resume logic stays compatible.
  async function saveData(nextScreen: number) {
    if (!userId) return
    setSaving(true)

    const connectedPlatforms = Object.keys(data.connected).filter((k) => data.connected[k])

    const payload: Record<string, unknown> = {
      user_role: data.role,
      name: data.biz_name || 'My Business',
      website_url: data.website,
      phone: data.phone,
      industry: data.biz_type,
      industry_other: data.biz_other,
      cuisine: data.cuisine,
      cuisine_other: data.cuisine_other,
      service_styles: data.service_styles,
      // Restaurant fields — mirrored onto businesses (migration 156) so a
      // half-finished deep flow restores losslessly on resume.
      price_range: data.price_range,
      signature_items: data.signature_items,
      dietary_options: data.dietary_options,
      reservations_platform: data.reservations_platform,
      delivery_platforms: data.delivery_platforms,
      menu_items_draft: data.menu_items,
      specials_draft: data.specials,
      locations_draft: data.locations,
      brand_hashtags: data.brand_hashtags,
      target_keywords: data.target_keywords,
      slow_periods: data.slow_periods,
      customer_age_range: data.customer_age_range,
      avoid_tones: data.avoid_tones,
      emoji_usage: data.emoji_usage,
      address: data.full_address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      primary_location_name: data.primary_location_name,
      location_count: data.location_count,
      business_hours: data.hours,
      description: data.biz_desc,
      differentiator: data.unique,
      competitors: data.competitors ? data.competitors.split(',').map((s) => s.trim()).filter(Boolean) : [],
      customer_types: data.customer_types,
      why_choose: data.why_choose,
      primary_goal: data.primary_goal,
      goal_detail: data.goal_detail,
      success_signs: data.success_signs,
      timeline: data.timeline,
      main_offerings: data.main_offerings,
      upcoming: data.upcoming,
      brand_voice_words: data.tones,
      brand_tone: data.custom_tone,
      content_likes: data.content_likes,
      ref_accounts: data.ref_accounts,
      avoid_list: data.avoid_list,
      approval_type: data.approval_type,
      can_film: data.can_film,
      can_tag: data.can_tag,
      current_platforms: connectedPlatforms,
      brand_colors: { primary: data.color1, secondary: data.color2 },
      brand_drive: data.brand_drive,
      onboarding_step: screenToStepIndex(data.biz_type, nextScreen),
    }

    if (businessId) {
      await supabase.from('businesses').update(payload).eq('id', businessId)
    } else {
      const { data: newBiz } = await supabase
        .from('businesses')
        .insert({ ...payload, owner_id: userId })
        .select('id')
        .single()
      if (newBiz) setBusinessId(newBiz.id)
    }
    setSaving(false)
  }

  // Navigation — moves screen by screen.
  async function goNext() {
    if (!valid && currentScreen) return
    const next = screenNo + 1
    await saveData(next)
    setScreenNo(next)
  }

  async function goBack() {
    if (screenNo > 1) {
      await saveData(screenNo - 1)
      setScreenNo(screenNo - 1)
    }
  }

  function goToStep(stepId: StepId) {
    const idx = screens.findIndex((sc) => sc.includes(stepId))
    if (idx > -1) setScreenNo(idx + 1)
  }

  // Complete onboarding
  async function handleComplete() {
    if (!businessId || !userId) return
    setSaving(true)

    // Mark businesses as completed (legacy gate)
    await supabase
      .from('businesses')
      .update({
        onboarding_completed: true,
        onboarding_step: screenToStepIndex(data.biz_type, totalScreens) + 1,
        agreed_terms: true,
        agreed_terms_at: new Date().toISOString(),
      })
      .eq('id', businessId)

    // Create CRM records: clients + client_profiles + client_users
    await completeOnboardingCRM(businessId, userId, {
      ...data,
      biz_desc: data.biz_desc,
      unique: data.unique,
      upcoming: data.upcoming,
      tones: data.tones,
      content_likes: data.content_likes,
      ref_accounts: data.ref_accounts,
      avoid_list: data.avoid_list,
      connected: data.connected,
      logo_url: logoUrl,
    })

    setSaving(false)
    setShowSuccess(true)
  }

  /**
   * Save partial onboarding and jump into the portal. Requires the
   * minimum essentials (role, biz_name, biz_type) so we have enough
   * to provision a clients row. The dashboard surfaces a 'Complete
   * your profile' prompt for anyone who finishes via this path.
   */
  async function handleSkipForNow() {
    if (!businessId || !userId) return
    const minReady = data.role && data.biz_name && data.biz_type
    if (!minReady) {
      // Not enough data yet. The Skip button is hidden until step >= 3.
      return
    }
    setSaving(true)

    await supabase
      .from('businesses')
      .update({
        onboarding_completed: true,        // unlocks portal access
        onboarding_step: screenToStepIndex(data.biz_type, screenNo), // remember where they left off
        onboarding_paused: true,           // dashboard banner uses this
        agreed_terms: true,
        agreed_terms_at: new Date().toISOString(),
      })
      .eq('id', businessId)

    await completeOnboardingCRM(businessId, userId, {
      ...data,
      biz_desc: data.biz_desc,
      unique: data.unique,
      upcoming: data.upcoming,
      tones: data.tones,
      content_likes: data.content_likes,
      ref_accounts: data.ref_accounts,
      avoid_list: data.avoid_list,
      connected: data.connected,
      logo_url: logoUrl,
    })

    setSaving(false)
    router.push('/dashboard')
  }

  /**
   * Leave setup without provisioning. Saves the in-progress draft (so
   * nothing typed is lost) and marks the businesses row onboarding_paused
   * so middleware lets the owner into the portal mid-setup. Unlike "Save
   * and finish later", this does NOT run completeOnboardingCRM — no client
   * records are created. They can resume any time from the dashboard.
   */
  async function handleExit() {
    setSaving(true)
    await saveData(screenNo)        // ensure a draft row exists + persist edits
    if (userId) {
      await supabase
        .from('businesses')
        .update({ onboarding_paused: true })
        .eq('owner_id', userId)
    }
    router.push('/dashboard')
  }

  // Logo upload handler
  async function handleLogoUpload(file: File) {
    if (!businessId) return
    const path = `${businessId}/logo/${file.name}`
    await supabase.storage.from('brand-assets').upload(path, file, { upsert: true })
    const { data: urlData } = supabase.storage.from('brand-assets').getPublicUrl(path)
    setLogoUrl(urlData?.publicUrl || '')
    update('logo_name', file.name)
  }

  // Photo upload handler
  async function handlePhotosUpload(files: FileList) {
    if (!businessId) return
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = `${businessId}/photos/${file.name}`
      await supabase.storage.from('brand-assets').upload(path, file, { upsert: true })
    }
    update('photo_count', files.length)
  }

  // Distinct phase labels in order, each tagged done / current / upcoming, for
  // the left brand panel's checklist. A phase is done once we have moved past
  // its last screen, and current while we sit on any of its screens.
  const phaseSeq = screens.map(getScreenPhase)
  const distinctPhases: typeof phaseSeq = []
  for (const p of phaseSeq) if (p && !distinctPhases.includes(p)) distinctPhases.push(p)
  const currentIndex = showSuccess ? screens.length : screenNo - 1
  const panelPhases = distinctPhases.map((label) => {
    const last = phaseSeq.lastIndexOf(label)
    const first = phaseSeq.indexOf(label)
    const state: 'done' | 'current' | 'upcoming' =
      currentIndex > last ? 'done' : currentIndex >= first ? 'current' : 'upcoming'
    return { label, state }
  })

  return (
    <div className="fixed inset-0 flex" style={{ background: '#fafaf8' }}>
      {/* Left brand + progress panel — desktop only */}
      <BrandPanel phases={loading ? [] : panelPhases} />

      {/* Right form area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact brand bar for mobile, where the side panel is hidden */}
        <header
          className="md:hidden flex items-center justify-between px-5 py-4 border-b bg-white flex-shrink-0"
          style={{ borderColor: '#f0f0f0' }}
        >
          <span
            className="text-[20px] font-semibold tracking-tight"
            style={{ fontFamily: 'Playfair Display, serif', color: '#2e9a78', letterSpacing: '-0.3px' }}
          >
            Apnosh
          </span>
          <span className="text-xs" style={{ color: '#999' }}>Account setup</span>
        </header>

        <main className="flex-1 overflow-y-auto flex items-start justify-center px-8 py-10 max-sm:px-4 max-sm:py-6">
          <div className="w-full max-w-[640px]">
            {loading ? (
              <div
                className="bg-white rounded-[16px] border p-10 text-center"
                style={{ borderColor: '#ececec', boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}
              >
                <div className="animate-pulse text-sm" style={{ color: '#999' }}>Loading...</div>
              </div>
            ) : (
              <div
                className="bg-white border flex flex-col overflow-hidden animate-[fadeUp_0.25s_ease]
                           rounded-[16px] max-sm:rounded-[14px]"
                style={{
                  borderColor: '#ececec',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
                }}
              >
                {/* Fixed top: progress + question */}
                <div className="flex-shrink-0 px-9 pt-8 max-sm:px-5 max-sm:pt-6">
                  {/* Always-available exit. Leaves setup without provisioning;
                      the draft is saved so they can pick up later. */}
                  {!showSuccess && (
                    <div className="flex justify-end -mt-2 mb-2">
                      <button
                        onClick={handleExit}
                        disabled={saving}
                        className="text-[12px] font-medium transition-colors disabled:opacity-40"
                        style={{ color: '#bbb', background: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#777' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb' }}
                        title="Leave setup. Your progress is saved."
                      >
                        Exit
                      </button>
                    </div>
                  )}
                  {/* Progress bar */}
                  {!showSuccess && (
                    <div className="mb-7">
                      {/* One tick per screen, filled up to the current screen */}
                      <div className="flex gap-1.5 mb-2.5">
                        {Array.from({ length: totalScreens }).map((_, i) => (
                          <div
                            key={i}
                            className="h-[3px] flex-1 rounded-sm overflow-hidden bg-[#eee]"
                          >
                            <div
                              className="h-full bg-[#4abd98] rounded-sm transition-all duration-400"
                              style={{ width: i + 1 <= screenNo ? '100%' : '0%' }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium" style={{ color: '#111' }}>
                          {phaseLabel || ''}
                          <span className="font-normal" style={{ color: '#999' }}>
                            {' · '}Step {screenNo} of {totalScreens}
                          </span>
                        </span>
                        <span className="text-xs font-medium" style={{ color: '#2e9a78' }}>
                          {pct}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Scrollable content */}
                <StepRenderer
                  screen={showSuccess ? 'success' : currentScreen}
                  data={data}
                  update={update}
                  valid={valid}
                  saving={saving}
                  step={screenNo}
                  totalSteps={totalScreens}
                  onNext={goNext}
                  onBack={goBack}
                  onGoToStep={goToStep}
                  onComplete={handleComplete}
                  onSkipForNow={handleSkipForNow}
                  canSkip={!!(data.role && data.biz_name && data.biz_type) && !showSuccess && screenNo < totalScreens}
                  onLogoUpload={handleLogoUpload}
                  onPhotosUpload={handlePhotosUpload}
                  businessId={businessId}
                  onSaveBeforeRedirect={() => saveData(screenNo)}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

/**
 * Desktop-only left rail: Apnosh brand, a short headline, and a phase
 * checklist that doubles as a progress map. Hidden under md so the form
 * gets the full width on phones (a compact top bar covers branding there).
 */
function BrandPanel({ phases }: { phases: { label: string; state: 'done' | 'current' | 'upcoming' }[] }) {
  return (
    <aside
      className="hidden md:flex flex-col justify-between flex-shrink-0 w-[300px] lg:w-[340px] px-8 py-9 text-white"
      style={{ background: 'linear-gradient(165deg, #2e9a78 0%, #1f7d61 52%, #0f6e56 100%)' }}
    >
      <div>
        <span
          className="text-[26px] font-semibold tracking-tight"
          style={{ fontFamily: 'Playfair Display, serif', letterSpacing: '-0.3px' }}
        >
          Apnosh
        </span>
        <h2 className="mt-9 text-[21px] font-semibold leading-snug">
          Let&apos;s set up your<br />marketing engine
        </h2>
        <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)' }}>
          A few quick steps. Your strategist gets everything they need to start.
        </p>

        {phases.length > 0 && (
          <ol className="mt-9 space-y-3.5">
            {phases.map((ph) => (
              <li key={ph.label} className="flex items-center gap-3">
                <span
                  className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-[11px] font-bold flex-shrink-0 transition-all"
                  style={
                    ph.state === 'done'
                      ? { background: '#fff', color: '#1f7d61' }
                      : ph.state === 'current'
                      ? { background: 'rgba(255,255,255,0.22)', boxShadow: '0 0 0 2px rgba(255,255,255,0.55)' }
                      : { background: 'rgba(255,255,255,0.12)' }
                  }
                >
                  {ph.state === 'done' ? '✓' : ''}
                </span>
                <span
                  className="text-[13.5px]"
                  style={{
                    color: ph.state === 'upcoming' ? 'rgba(255,255,255,0.55)' : '#fff',
                    fontWeight: ph.state === 'current' ? 600 : 500,
                  }}
                >
                  {ph.label}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
        Your progress saves automatically. Leave and pick up anytime.
      </p>
    </aside>
  )
}
