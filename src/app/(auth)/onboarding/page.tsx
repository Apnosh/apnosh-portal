'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

import StepWelcome from './steps/StepWelcome';
import StepBusinessBasics from './steps/StepBusinessBasics';
import StepBrandIdentity from './steps/StepBrandIdentity';
import StepGoalsAudience from './steps/StepGoalsAudience';
import StepConnectAccounts from './steps/StepConnectAccounts';
import StepConfirmation from './steps/StepConfirmation';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: 'Welcome' },
  { label: 'Business Basics' },
  { label: 'Brand Identity' },
  { label: 'Goals & Audience' },
  { label: 'Connect Accounts' },
  { label: 'Confirmation' },
] as const;

const BUDGET_MAP: Record<string, number> = {
  '$0 - $200': 200,
  '$200 - $500': 500,
  '$500 - $1,000': 1000,
  '$1,000 - $2,000': 2000,
  '$2,000+': 5000,
};

const BUDGET_REVERSE: Record<number, string> = {
  200: '$0 - $200',
  500: '$200 - $500',
  1000: '$500 - $1,000',
  2000: '$1,000 - $2,000',
  5000: '$2,000+',
};

/* ------------------------------------------------------------------ */
/*  Form data shape                                                    */
/* ------------------------------------------------------------------ */

interface FormData {
  // Step 2
  businessName: string;
  industry: string;
  websiteUrl: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  // Step 3
  brandWords: string[];
  brandTone: string;
  primaryColor: string;
  secondaryColor: string;
  // Step 4
  marketingGoals: string[];
  targetAudience: string;
  monthlyBudget: string;
  // Step 5
  connectedPlatforms: string[];
}

const INITIAL_DATA: FormData = {
  businessName: '',
  industry: '',
  websiteUrl: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  brandWords: [],
  brandTone: '',
  primaryColor: '#4abd98',
  secondaryColor: '#2e9a78',
  marketingGoals: [],
  targetAudience: '',
  monthlyBudget: '',
  connectedPlatforms: [],
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormData>(INITIAL_DATA);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ── Load existing business data on mount ── */
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const { data: biz } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', user.id)
        .single();

      if (biz) {
        setBusinessId(biz.id);
        const loc = Array.isArray(biz.locations) && biz.locations.length > 0
          ? biz.locations[0] as { address?: string; city?: string; state?: string; zip?: string }
          : {};
        const colors = (biz.brand_colors || {}) as { primary?: string; secondary?: string };

        setData({
          businessName: biz.name || '',
          industry: biz.industry || '',
          websiteUrl: biz.website_url || '',
          phone: biz.phone || '',
          address: loc.address || '',
          city: loc.city || '',
          state: loc.state || '',
          zip: loc.zip || '',
          brandWords: Array.isArray(biz.brand_voice_words) ? biz.brand_voice_words as string[] : [],
          brandTone: biz.brand_tone || '',
          primaryColor: colors.primary || '#4abd98',
          secondaryColor: colors.secondary || '#2e9a78',
          marketingGoals: Array.isArray(biz.marketing_goals) ? biz.marketing_goals as string[] : [],
          targetAudience: biz.target_audience || '',
          monthlyBudget: biz.monthly_budget ? (BUDGET_REVERSE[biz.monthly_budget] || '') : '',
          connectedPlatforms: Array.isArray(biz.current_platforms) ? biz.current_platforms as string[] : [],
        });

        // Resume from saved step
        if (biz.onboarding_step > 0 && !biz.onboarding_completed) {
          setStep(biz.onboarding_step);
        }
      }

      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Field updater ── */
  const updateField = useCallback((field: string, value: string | string[]) => {
    setData((prev) => ({ ...prev, [field]: value }));
  }, []);

  /* ── Per-step save to Supabase ── */
  async function saveStepData(nextStep: number) {
    if (!userId) return;
    setSaving(true);

    const location = {
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      is_primary: true,
    };

    const payload: Record<string, unknown> = {
      name: data.businessName || 'My Business',
      industry: data.industry,
      website_url: data.websiteUrl,
      phone: data.phone,
      locations: [location],
      brand_voice_words: data.brandWords,
      brand_tone: data.brandTone,
      brand_colors: { primary: data.primaryColor, secondary: data.secondaryColor },
      marketing_goals: data.marketingGoals,
      target_audience: data.targetAudience,
      monthly_budget: data.monthlyBudget ? (BUDGET_MAP[data.monthlyBudget] ?? null) : null,
      current_platforms: data.connectedPlatforms,
      onboarding_step: nextStep,
    };

    if (businessId) {
      // Update existing
      await supabase.from('businesses').update(payload).eq('id', businessId);
    } else {
      // Create new business record
      const { data: newBiz } = await supabase
        .from('businesses')
        .insert({ ...payload, owner_id: userId })
        .select('id')
        .single();
      if (newBiz) setBusinessId(newBiz.id);
    }

    setSaving(false);
  }

  /* ── Logo upload ── */
  async function handleLogoUpload(file: File) {
    if (!businessId) return;
    const path = `${businessId}/logo`;
    await supabase.storage.from('brand-assets').upload(path, file, { upsert: true });
  }

  /* ── Navigation ── */
  async function goNext() {
    const nextStep = step + 1;
    // Save on steps 1-4 (welcome step has no data)
    if (step >= 1) {
      await saveStepData(nextStep);
    }
    setStep(nextStep);
  }

  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  async function handleComplete() {
    if (!businessId) return;
    setSaving(true);
    await supabase
      .from('businesses')
      .update({ onboarding_completed: true, onboarding_step: 6 })
      .eq('id', businessId);
    setSaving(false);
    router.push('/dashboard');
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #f8fafb 0%, #eaf7f3 100%)' }}
      >
        <div className="animate-pulse text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(180deg, #f8fafb 0%, #eaf7f3 100%)' }}
    >
      <div className="w-full max-w-[600px]">
        {/* Progress indicator */}
        {step > 0 && step < 5 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                    i < step
                      ? 'bg-[#4abd98] text-white'
                      : i === step
                        ? 'bg-[#4abd98] text-white ring-4 ring-[#4abd98]/20'
                        : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {i < step ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7L5.5 9.5L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-0.5 ${i < step ? 'bg-[#4abd98]' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {/* Step title */}
          {step > 0 && step < 5 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-[#4abd98] uppercase tracking-wider mb-1">
                Step {step} of 6
              </p>
              <h2
                className="text-xl font-bold"
                style={{ fontFamily: 'Playfair Display, serif', color: '#1d1d1f' }}
              >
                {STEPS[step].label}
              </h2>
            </div>
          )}

          {/* Step content */}
          {step === 0 && <StepWelcome onNext={goNext} />}

          {step === 1 && (
            <StepBusinessBasics data={data} onChange={updateField} />
          )}

          {step === 2 && (
            <StepBrandIdentity
              data={data}
              onChange={updateField}
              businessId={businessId}
              onLogoUpload={handleLogoUpload}
            />
          )}

          {step === 3 && (
            <StepGoalsAudience data={data} onChange={updateField} />
          )}

          {step === 4 && (
            <StepConnectAccounts
              connectedPlatforms={data.connectedPlatforms}
              onToggle={(id) => {
                const current = data.connectedPlatforms;
                if (current.includes(id)) {
                  updateField('connectedPlatforms', current.filter((p) => p !== id));
                } else {
                  updateField('connectedPlatforms', [...current, id]);
                }
              }}
              onSkip={goNext}
            />
          )}

          {step === 5 && (
            <StepConfirmation
              businessName={data.businessName}
              industry={data.industry}
              goalsCount={data.marketingGoals.length}
              platformsCount={data.connectedPlatforms.length}
              onComplete={handleComplete}
            />
          )}

          {/* Navigation buttons (steps 1-4) */}
          {step >= 1 && step <= 4 && (
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={saving || (step === 1 && !data.businessName.trim())}
                className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-[#4abd98]/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #4abd98, #2e9a78)' }}
              >
                {saving ? 'Saving...' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
