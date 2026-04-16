'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  type OnboardingData,
  type StepId,
  INITIAL_DATA,
  getSteps,
  canContinue,
} from './data'
import StepRenderer from './step-renderer'
import { completeOnboardingCRM } from '@/lib/onboarding-actions'

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // Derived step info
  const steps = getSteps(data.biz_type)
  const totalSteps = steps.length
  const currentStepId = steps[step - 1] as StepId | undefined
  const pct = Math.round((step / totalSteps) * 100)
  const valid = currentStepId ? canContinue(currentStepId, data) : false

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
          role: biz.user_role || '',
          biz_name: biz.name || '',
          website: biz.website_url || '',
          phone: biz.phone || '',
          biz_type: biz.industry || '',
          biz_other: biz.industry_other || '',
          cuisine: biz.cuisine || '',
          cuisine_other: biz.cuisine_other || '',
          service_styles: biz.service_styles || [],
          full_address: biz.address || '',
          city: biz.city || '',
          state: biz.state || '',
          zip: biz.zip || '',
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

        // Resume from saved step
        if (biz.onboarding_step && biz.onboarding_step > 1) {
          setStep(biz.onboarding_step)
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

  // Save current data to Supabase
  async function saveData(nextStep: number) {
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
      address: data.full_address,
      city: data.city,
      state: data.state,
      zip: data.zip,
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
      onboarding_step: nextStep,
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

  // Navigation
  async function goNext() {
    if (!valid && currentStepId) return
    const nextStep = step + 1
    await saveData(nextStep)
    setStep(nextStep)
  }

  async function goBack() {
    if (step > 1) {
      await saveData(step - 1)
      setStep(step - 1)
    }
  }

  function goToStep(stepId: StepId) {
    const idx = steps.indexOf(stepId)
    if (idx > -1) setStep(idx + 1)
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
        onboarding_step: totalSteps + 1,
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
      logo_url: '', // URL set by upload handler if applicable
    })

    setSaving(false)
    setShowSuccess(true)
  }

  // Logo upload handler
  async function handleLogoUpload(file: File) {
    if (!businessId) return
    const path = `${businessId}/logo/${file.name}`
    await supabase.storage.from('brand-assets').upload(path, file, { upsert: true })
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

  if (loading) {
    return (
      <div className="w-full max-w-[560px]">
        <div
          className="bg-white rounded-[14px] border p-9 text-center"
          style={{ borderColor: '#f0f0f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
        >
          <div className="animate-pulse text-sm" style={{ color: '#999' }}>Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[560px]">
      <div
        className="bg-white border flex flex-col overflow-hidden animate-[fadeUp_0.25s_ease]
                   rounded-[14px] max-sm:rounded-none max-sm:border-none max-sm:shadow-none"
        style={{
          borderColor: '#f0f0f0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          maxHeight: 'calc(100vh - 140px)',
        }}
      >
        {/* Fixed top: progress + question */}
        <div className="flex-shrink-0 px-9 pt-9 max-sm:px-5 max-sm:pt-6">
          {/* Progress bar */}
          {!showSuccess && (
            <div className="mb-7">
              <div className="h-[3px] bg-[#eee] rounded-sm overflow-hidden mb-2">
                <div
                  className="h-full bg-[#4abd98] rounded-sm transition-all duration-400"
                  style={{ width: `${showSuccess ? 100 : pct}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: '#999' }} />
                <span className="text-xs font-medium" style={{ color: '#2e9a78' }}>
                  {pct}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <StepRenderer
          stepId={showSuccess ? 'success' : currentStepId}
          data={data}
          update={update}
          valid={valid}
          saving={saving}
          step={step}
          totalSteps={totalSteps}
          onNext={goNext}
          onBack={goBack}
          onGoToStep={goToStep}
          onComplete={handleComplete}
          onLogoUpload={handleLogoUpload}
          onPhotosUpload={handlePhotosUpload}
          businessId={businessId}
        />
      </div>
    </div>
  )
}
