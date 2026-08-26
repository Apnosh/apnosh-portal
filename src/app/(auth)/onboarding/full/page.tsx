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
  const screens = getScreens(data.biz_type, data)
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
          primary_place_id: biz.primary_place_id || '',
          location_count: biz.location_count || '',
          hours: biz.business_hours || {},
          biz_desc: biz.description || '',
          unique: biz.differentiator || '',
          competitors: Array.isArray(biz.competitors) ? (biz.competitors as string[]).join(', ') : '',
          customer_types: biz.customer_types || [],
          why_choose: biz.why_choose || [],
          primary_goal: biz.primary_goal || '',
          /* Rebuild the three picks on resume from the columns we already store, so coming
             back mid-setup shows the same chips lit rather than an empty screen. */
          top_goals: [
            ...(biz.primary_goal ? [String(biz.primary_goal)] : []),
            ...String(biz.goal_detail || '').split(',').map((g) => g.trim()).filter(Boolean),
          ].slice(0, 3),
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
          color1: colors.primary || '',
          color2: colors.secondary || '',
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

  /* AUTO-ADVANCE, ONE BEAT AFTER A SINGLE-CHOICE ANSWER.
   * A screen whose only question is a one-of-N choice (role today) should not
   * make the owner scroll to find Continue: the step reports the tap through
   * onAutoAdvance, we wait a short beat so the selected state is visible, then
   * move on. Bumping a tick (instead of a boolean) restarts the timer on every
   * tap, so a quick change of mind inside the beat wins: the timeout closure
   * is rebuilt with the latest data and the LAST choice is what gets saved.
   * Multi-select and typed steps never call this. */
  const [advanceTick, setAdvanceTick] = useState(0)
  const requestAutoAdvance = useCallback(() => setAdvanceTick((t) => t + 1), [])
  useEffect(() => {
    if (!advanceTick) return
    const t = setTimeout(() => {
      if (valid && !saving) goNext()
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceTick])

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
      primary_place_id: data.primary_place_id,
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

  /* The phase checklist belonged to the desktop side rail, which the phone frame does not
     have. The phase NAME still shows in the header beside the step count, which is the part
     that orients someone on a small screen; a five-item checklist there would just cost rows
     of thumb space to say what the progress bar already says. */

  return (
    /* THE PHONE FRAME. Onboarding was the last surface still built desktop-first: a fixed
       300px brand rail beside a 640px card, with the rail merely HIDDEN under 768px. That
       degrades to a phone; it was never designed for one, and it looked nothing like the
       portal a client lands in ten seconds later. This is the same frame the dashboard and
       insights use — one column, thumb-reachable, 480 wide on anything bigger. */
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, height: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', fontFamily: "'Inter',system-ui,sans-serif", color: '#16181d' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa1ab', fontSize: 13 }}>
            Loading…
          </div>
        ) : (
          <>
            {/* Sticky head: who we are, the way out, and where they are. Never scrolls away —
                on a phone the progress is the only thing telling them this has an end. */}
            <div style={{ flexShrink: 0, padding: '14px 18px 0', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showSuccess ? 4 : 14 }}>
                <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 600, color: '#2e9a78', letterSpacing: '-0.3px' }}>
                  Apnosh
                </span>
                {!showSuccess && (
                  <button
                    onClick={handleExit}
                    disabled={saving}
                    style={{ border: 'none', background: 'none', color: '#9aa1ab', fontSize: 13, fontWeight: 500, padding: '6px 2px', cursor: 'pointer', minHeight: 34 }}
                    title="Leave setup. Your progress is saved."
                  >
                    Exit
                  </button>
                )}
              </div>

              {!showSuccess && (
                <div style={{ paddingBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
                    {Array.from({ length: totalScreens }).map((_, i) => (
                      <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, overflow: 'hidden', background: '#ececef' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: '#4abd98', width: i + 1 <= screenNo ? '100%' : '0%', transition: 'width .4s ease' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#16181d' }}>
                      {phaseLabel || ''}
                      <span style={{ fontWeight: 400, color: '#9aa1ab' }}>{' · '}Step {screenNo} of {totalScreens}</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#2e9a78' }}>{pct}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* The one scrolling region. Each step owns its own sticky Continue. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 18px 24px' }}>
              <StepRenderer
                screen={showSuccess ? 'success' : currentScreen}
                data={data}
                update={update}
                valid={valid}
                saving={saving}
                step={screenNo}
                totalSteps={totalScreens}
                onNext={goNext}
                onAutoAdvance={requestAutoAdvance}
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
          </>
        )}
      </div>
    </div>
  )
}

