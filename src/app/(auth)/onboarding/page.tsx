'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Competitor {
  name: string;
  website: string;
}

interface FormData {
  /* Step 1 — Business Basics */
  businessName: string;
  industry: string;
  businessDescription: string;
  websiteUrl: string;
  numberOfLocations: number;
  businessPhone: string;

  /* Step 2 — Brand Identity */
  brandWords: [string, string, string];
  tone: string;
  neverSay: string;
  primaryColor: string;
  secondaryColor: string;

  /* Step 3 — Target Audience */
  idealCustomer: string;
  ageRange: string;
  locationServed: string;
  problemSolved: string;

  /* Step 4 — Competitors & Market */
  competitors: [Competitor, Competitor, Competitor];
  competitorStrengths: string;
  differentiator: string;

  /* Step 5 — Current Marketing */
  socialPlatforms: string[];
  postingFrequency: string;
  googleBusinessProfile: string;
  marketingBudget: number;
  whatWorked: string;
  whatDidntWork: string;

  /* Step 6 — Goals & Preferences */
  marketingGoals: string[];
  contentTopics: string;
  topicsToAvoid: string;
  anythingElse: string;
}

const INITIAL_DATA: FormData = {
  businessName: '',
  industry: '',
  businessDescription: '',
  websiteUrl: '',
  numberOfLocations: 1,
  businessPhone: '',

  brandWords: ['', '', ''],
  tone: '',
  neverSay: '',
  primaryColor: '#4abd98',
  secondaryColor: '#2e9a78',

  idealCustomer: '',
  ageRange: '',
  locationServed: '',
  problemSolved: '',

  competitors: [
    { name: '', website: '' },
    { name: '', website: '' },
    { name: '', website: '' },
  ],
  competitorStrengths: '',
  differentiator: '',

  socialPlatforms: [],
  postingFrequency: '',
  googleBusinessProfile: '',
  marketingBudget: 500,
  whatWorked: '',
  whatDidntWork: '',

  marketingGoals: [],
  contentTopics: '',
  topicsToAvoid: '',
  anythingElse: '',
};

/* ------------------------------------------------------------------ */
/*  Step metadata                                                      */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: 'Business Basics', icon: '1' },
  { label: 'Brand Identity', icon: '2' },
  { label: 'Target Audience', icon: '3' },
  { label: 'Competitors', icon: '4' },
  { label: 'Marketing', icon: '5' },
  { label: 'Goals', icon: '6' },
] as const;

const INDUSTRIES = [
  'Restaurant',
  'Retail',
  'Professional Services',
  'Health & Wellness',
  'Real Estate',
  'Home Services',
  'Beauty & Salon',
  'Automotive',
  'Education',
  'Other',
];

const TONES = [
  'Professional',
  'Friendly & Casual',
  'Luxury & Premium',
  'Fun & Playful',
  'Bold & Direct',
  'Warm & Welcoming',
];

const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55+', 'All ages'];

const SOCIAL_PLATFORMS = [
  'Instagram',
  'Facebook',
  'TikTok',
  'LinkedIn',
  'Twitter/X',
  'YouTube',
  'None',
];

const POSTING_FREQUENCIES = [
  'Daily',
  'Few times/week',
  'Weekly',
  'Rarely',
  'Never',
];

const MARKETING_GOALS = [
  'More customers',
  'Brand awareness',
  'Social media growth',
  'Better online reviews',
  'Website traffic',
  'Email list growth',
  'Local SEO',
  'Content creation',
];

const BUDGET_MARKS = [0, 500, 1000, 2000, 5000];

/* ------------------------------------------------------------------ */
/*  Reusable UI primitives                                             */
/* ------------------------------------------------------------------ */

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium mb-1.5"
      style={{ color: '#1d1d1f', fontFamily: 'Inter, sans-serif' }}
    >
      {children}
    </label>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  id: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-all
                 focus:border-[#4abd98] focus:ring-2 focus:ring-[#4abd98]/20
                 placeholder:text-gray-400"
      style={{ fontFamily: 'Inter, sans-serif', color: '#1d1d1f' }}
    />
  );
}

function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-all
                 focus:border-[#4abd98] focus:ring-2 focus:ring-[#4abd98]/20
                 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23424245%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat"
      style={{ fontFamily: 'Inter, sans-serif', color: value ? '#1d1d1f' : '#9ca3af' }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt} value={opt} style={{ color: '#1d1d1f' }}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function Textarea({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      required={required}
      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-all resize-none
                 focus:border-[#4abd98] focus:ring-2 focus:ring-[#4abd98]/20
                 placeholder:text-gray-400"
      style={{ fontFamily: 'Inter, sans-serif', color: '#1d1d1f' }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Progress / step indicator                                          */
/* ------------------------------------------------------------------ */

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-xs font-medium"
          style={{ color: '#424245', fontFamily: 'Inter, sans-serif' }}
        >
          Step {current + 1} of {total}
        </span>
        <span
          className="text-xs font-medium"
          style={{ color: '#4abd98', fontFamily: 'Inter, sans-serif' }}
        >
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #4abd98, #2e9a78)' }}
        />
      </div>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-between relative mb-8">
      {/* Connecting line */}
      <div className="absolute top-4 left-0 right-0 h-px bg-gray-200 z-0" />
      <div
        className="absolute top-4 left-0 h-px z-0 transition-all duration-500 ease-out"
        style={{
          width: `${(current / (total - 1)) * 100}%`,
          background: 'linear-gradient(90deg, #4abd98, #2e9a78)',
        }}
      />

      {STEPS.map((step, i) => {
        const isCompleted = i < current;
        const isActive = i === current;
        return (
          <div key={step.label} className="flex flex-col items-center z-10 relative">
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold
                transition-all duration-300 border-2
                ${
                  isCompleted
                    ? 'bg-[#4abd98] border-[#4abd98] text-white'
                    : isActive
                      ? 'bg-white border-[#4abd98] text-[#4abd98]'
                      : 'bg-white border-gray-200 text-gray-400'
                }
              `}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {isCompleted ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 7.5L5.5 10L11 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`mt-1.5 text-[10px] font-medium whitespace-nowrap hidden sm:block ${
                isActive ? 'text-[#1d1d1f]' : isCompleted ? 'text-[#4abd98]' : 'text-gray-400'
              }`}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Validation per step                                                */
/* ------------------------------------------------------------------ */

function validateStep(step: number, data: FormData): string | null {
  switch (step) {
    case 0:
      if (!data.businessName.trim()) return 'Please enter your business name.';
      if (!data.industry) return 'Please select an industry.';
      if (!data.businessDescription.trim()) return 'Please provide a brief business description.';
      if (!data.businessPhone.trim()) return 'Please enter a business phone number.';
      return null;

    case 1:
      if (data.brandWords.some((w) => !w.trim()))
        return 'Please enter all 3 brand words.';
      if (!data.tone) return 'Please select a brand tone.';
      return null;

    case 2:
      if (!data.idealCustomer.trim()) return 'Please describe your ideal customer.';
      if (!data.ageRange) return 'Please select an age range.';
      if (!data.locationServed.trim()) return 'Please enter the area you serve.';
      if (!data.problemSolved.trim()) return 'Please describe the problem you solve.';
      return null;

    case 3:
      if (!data.competitors[0].name.trim())
        return 'Please enter at least one competitor name.';
      if (!data.differentiator.trim())
        return 'Please describe what makes you different.';
      return null;

    case 4:
      if (data.socialPlatforms.length === 0)
        return 'Please select at least one social media option.';
      if (!data.postingFrequency) return 'Please select a posting frequency.';
      if (!data.googleBusinessProfile)
        return 'Please indicate if you have a Google Business Profile.';
      return null;

    case 5:
      if (data.marketingGoals.length === 0)
        return 'Please select at least one marketing goal.';
      return null;

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Step content components                                            */
/* ------------------------------------------------------------------ */

function Step1({
  data,
  update,
}: {
  data: FormData;
  update: (patch: Partial<FormData>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="businessName">Business Name *</Label>
        <TextInput
          id="businessName"
          value={data.businessName}
          onChange={(v) => update({ businessName: v })}
          placeholder="e.g. Sunrise Cafe"
          required
        />
      </div>

      <div>
        <Label htmlFor="industry">Industry *</Label>
        <Select
          id="industry"
          value={data.industry}
          onChange={(v) => update({ industry: v })}
          options={INDUSTRIES}
          placeholder="Select your industry"
          required
        />
      </div>

      <div>
        <Label htmlFor="businessDescription">Business Description *</Label>
        <Textarea
          id="businessDescription"
          value={data.businessDescription}
          onChange={(v) => update({ businessDescription: v })}
          placeholder="Tell us about your business in 2-3 sentences..."
          required
        />
      </div>

      <div>
        <Label htmlFor="websiteUrl">Website URL (optional)</Label>
        <TextInput
          id="websiteUrl"
          value={data.websiteUrl}
          onChange={(v) => update({ websiteUrl: v })}
          placeholder="https://www.example.com"
          type="url"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="numberOfLocations">Number of Locations *</Label>
          <TextInput
            id="numberOfLocations"
            value={data.numberOfLocations}
            onChange={(v) => update({ numberOfLocations: parseInt(v) || 1 })}
            type="number"
          />
        </div>
        <div>
          <Label htmlFor="businessPhone">Business Phone *</Label>
          <TextInput
            id="businessPhone"
            value={data.businessPhone}
            onChange={(v) => update({ businessPhone: v })}
            placeholder="(555) 123-4567"
            type="tel"
          />
        </div>
      </div>
    </div>
  );
}

function Step2({
  data,
  update,
}: {
  data: FormData;
  update: (patch: Partial<FormData>) => void;
}) {
  const updateBrandWord = (index: number, value: string) => {
    const next = [...data.brandWords] as [string, string, string];
    next[index] = value;
    update({ brandWords: next });
  };

  return (
    <div className="space-y-5">
      <div>
        <Label>Describe your brand in 3 words *</Label>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <TextInput
              key={i}
              id={`brandWord${i}`}
              value={data.brandWords[i]}
              onChange={(v) => updateBrandWord(i, v)}
              placeholder={`Word ${i + 1}`}
              required
            />
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="tone">Brand Tone *</Label>
        <Select
          id="tone"
          value={data.tone}
          onChange={(v) => update({ tone: v })}
          options={TONES}
          placeholder="Select a tone"
          required
        />
      </div>

      <div>
        <Label htmlFor="neverSay">We never say... (things to avoid)</Label>
        <Textarea
          id="neverSay"
          value={data.neverSay}
          onChange={(v) => update({ neverSay: v })}
          placeholder="Words, phrases, or topics your brand avoids..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="primaryColor">Primary Brand Color</Label>
          <div className="flex items-center gap-3">
            <input
              id="primaryColor"
              type="color"
              value={data.primaryColor}
              onChange={(e) => update({ primaryColor: e.target.value })}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            />
            <span className="text-sm text-gray-500 font-mono">{data.primaryColor}</span>
          </div>
        </div>
        <div>
          <Label htmlFor="secondaryColor">Secondary Brand Color</Label>
          <div className="flex items-center gap-3">
            <input
              id="secondaryColor"
              type="color"
              value={data.secondaryColor}
              onChange={(e) => update({ secondaryColor: e.target.value })}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            />
            <span className="text-sm text-gray-500 font-mono">{data.secondaryColor}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step3({
  data,
  update,
}: {
  data: FormData;
  update: (patch: Partial<FormData>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="idealCustomer">Who is your ideal customer? *</Label>
        <Textarea
          id="idealCustomer"
          value={data.idealCustomer}
          onChange={(v) => update({ idealCustomer: v })}
          placeholder="Describe your perfect customer — demographics, interests, behaviors..."
          required
        />
      </div>

      <div>
        <Label htmlFor="ageRange">Age Range *</Label>
        <Select
          id="ageRange"
          value={data.ageRange}
          onChange={(v) => update({ ageRange: v })}
          options={AGE_RANGES}
          placeholder="Select an age range"
          required
        />
      </div>

      <div>
        <Label htmlFor="locationServed">Location / Area Served *</Label>
        <TextInput
          id="locationServed"
          value={data.locationServed}
          onChange={(v) => update({ locationServed: v })}
          placeholder="e.g. Downtown Austin, TX"
          required
        />
      </div>

      <div>
        <Label htmlFor="problemSolved">What problem do you solve for them? *</Label>
        <Textarea
          id="problemSolved"
          value={data.problemSolved}
          onChange={(v) => update({ problemSolved: v })}
          placeholder="What pain point or need does your business address?"
          required
        />
      </div>
    </div>
  );
}

function Step4({
  data,
  update,
}: {
  data: FormData;
  update: (patch: Partial<FormData>) => void;
}) {
  const updateCompetitor = (index: number, field: keyof Competitor, value: string) => {
    const next = [...data.competitors] as [Competitor, Competitor, Competitor];
    next[index] = { ...next[index], [field]: value };
    update({ competitors: next });
  };

  return (
    <div className="space-y-5">
      <div>
        <Label>Top 3 Competitors *</Label>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextInput
                id={`compName${i}`}
                value={data.competitors[i].name}
                onChange={(v) => updateCompetitor(i, 'name', v)}
                placeholder={`Competitor ${i + 1} name`}
                required={i === 0}
              />
              <TextInput
                id={`compUrl${i}`}
                value={data.competitors[i].website}
                onChange={(v) => updateCompetitor(i, 'website', v)}
                placeholder="Website URL"
                type="url"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="competitorStrengths">What do they do well?</Label>
        <Textarea
          id="competitorStrengths"
          value={data.competitorStrengths}
          onChange={(v) => update({ competitorStrengths: v })}
          placeholder="What are your competitors' strengths?"
        />
      </div>

      <div>
        <Label htmlFor="differentiator">What makes you different? *</Label>
        <Textarea
          id="differentiator"
          value={data.differentiator}
          onChange={(v) => update({ differentiator: v })}
          placeholder="Your unique value proposition — why should someone choose you?"
          required
        />
      </div>
    </div>
  );
}

function Step5({
  data,
  update,
}: {
  data: FormData;
  update: (patch: Partial<FormData>) => void;
}) {
  const togglePlatform = (platform: string) => {
    if (platform === 'None') {
      update({ socialPlatforms: data.socialPlatforms.includes('None') ? [] : ['None'] });
      return;
    }
    const without = data.socialPlatforms.filter((p) => p !== 'None');
    update({
      socialPlatforms: without.includes(platform)
        ? without.filter((p) => p !== platform)
        : [...without, platform],
    });
  };

  const budgetLabel = (v: number) => {
    if (v >= 5000) return '$5,000+';
    return `$${v.toLocaleString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <Label>Current Social Media Platforms *</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          {SOCIAL_PLATFORMS.map((platform) => {
            const checked = data.socialPlatforms.includes(platform);
            return (
              <label
                key={platform}
                className={`
                  flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-all
                  ${
                    checked
                      ? 'border-[#4abd98] bg-[#eaf7f3] text-[#1d1d1f]'
                      : 'border-gray-200 bg-white text-[#424245] hover:border-gray-300'
                  }
                `}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePlatform(platform)}
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    checked ? 'bg-[#4abd98] border-[#4abd98]' : 'border-gray-300'
                  }`}
                >
                  {checked && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5.5L4 7.5L8 3"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                {platform}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <Label htmlFor="postingFrequency">Current Posting Frequency *</Label>
        <Select
          id="postingFrequency"
          value={data.postingFrequency}
          onChange={(v) => update({ postingFrequency: v })}
          options={POSTING_FREQUENCIES}
          placeholder="How often do you post?"
          required
        />
      </div>

      <div>
        <Label>Do you have a Google Business Profile? *</Label>
        <div className="flex gap-3 mt-1">
          {['Yes', 'No'].map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => update({ googleBusinessProfile: opt })}
              className={`
                px-6 py-2.5 rounded-lg text-sm font-medium border transition-all
                ${
                  data.googleBusinessProfile === opt
                    ? 'border-[#4abd98] bg-[#eaf7f3] text-[#1d1d1f]'
                    : 'border-gray-200 bg-white text-[#424245] hover:border-gray-300'
                }
              `}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="marketingBudget">
          Current Marketing Budget: {budgetLabel(data.marketingBudget)}
        </Label>
        <div className="mt-2">
          <input
            id="marketingBudget"
            type="range"
            min={0}
            max={5000}
            step={100}
            value={data.marketingBudget}
            onChange={(e) => update({ marketingBudget: parseInt(e.target.value) })}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #4abd98 ${(data.marketingBudget / 5000) * 100}%, #e5e7eb ${(data.marketingBudget / 5000) * 100}%)`,
            }}
          />
          <div className="flex justify-between mt-1">
            {BUDGET_MARKS.map((m) => (
              <span
                key={m}
                className="text-[10px] text-gray-400"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {m === 5000 ? '$5k+' : `$${m}`}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="whatWorked">What&apos;s worked in the past?</Label>
        <Textarea
          id="whatWorked"
          value={data.whatWorked}
          onChange={(v) => update({ whatWorked: v })}
          placeholder="Marketing efforts that drove results..."
        />
      </div>

      <div>
        <Label htmlFor="whatDidntWork">What hasn&apos;t worked?</Label>
        <Textarea
          id="whatDidntWork"
          value={data.whatDidntWork}
          onChange={(v) => update({ whatDidntWork: v })}
          placeholder="Things you tried that didn't deliver..."
        />
      </div>
    </div>
  );
}

function Step6({
  data,
  update,
}: {
  data: FormData;
  update: (patch: Partial<FormData>) => void;
}) {
  const toggleGoal = (goal: string) => {
    update({
      marketingGoals: data.marketingGoals.includes(goal)
        ? data.marketingGoals.filter((g) => g !== goal)
        : [...data.marketingGoals, goal],
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <Label>Top Marketing Goals * (select up to 3)</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
          {MARKETING_GOALS.map((goal) => {
            const checked = data.marketingGoals.includes(goal);
            const disabled = !checked && data.marketingGoals.length >= 3;
            return (
              <label
                key={goal}
                className={`
                  flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  ${
                    checked
                      ? 'border-[#4abd98] bg-[#eaf7f3] text-[#1d1d1f]'
                      : 'border-gray-200 bg-white text-[#424245] hover:border-gray-300'
                  }
                `}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => !disabled && toggleGoal(goal)}
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    checked ? 'bg-[#4abd98] border-[#4abd98]' : 'border-gray-300'
                  }`}
                >
                  {checked && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5.5L4 7.5L8 3"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                {goal}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <Label htmlFor="contentTopics">Content topics you want to cover</Label>
        <Textarea
          id="contentTopics"
          value={data.contentTopics}
          onChange={(v) => update({ contentTopics: v })}
          placeholder="e.g. Behind the scenes, customer stories, industry tips..."
        />
      </div>

      <div>
        <Label htmlFor="topicsToAvoid">Topics to avoid</Label>
        <Textarea
          id="topicsToAvoid"
          value={data.topicsToAvoid}
          onChange={(v) => update({ topicsToAvoid: v })}
          placeholder="Subjects or themes you don't want in your content..."
        />
      </div>

      <div>
        <Label htmlFor="anythingElse">Anything else we should know?</Label>
        <Textarea
          id="anythingElse"
          value={data.anythingElse}
          onChange={(v) => update({ anythingElse: v })}
          placeholder="Additional context, upcoming events, seasonal notes..."
          rows={4}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step titles + subtitles                                            */
/* ------------------------------------------------------------------ */

const STEP_META: { title: string; subtitle: string }[] = [
  {
    title: 'Business Basics',
    subtitle: 'Let\u2019s start with the essentials about your business.',
  },
  {
    title: 'Brand Identity',
    subtitle: 'Help us understand how your brand looks and sounds.',
  },
  {
    title: 'Target Audience',
    subtitle: 'Tell us about the people you\u2019re trying to reach.',
  },
  {
    title: 'Competitors & Market',
    subtitle: 'Who else is in your space and what sets you apart?',
  },
  {
    title: 'Current Marketing',
    subtitle: 'Where are you today with your marketing efforts?',
  },
  {
    title: 'Goals & Preferences',
    subtitle: 'What do you want to achieve and how should we get there?',
  },
];

/* ------------------------------------------------------------------ */
/*  Main wizard                                                        */
/* ------------------------------------------------------------------ */

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormData>(INITIAL_DATA);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [isAnimating, setIsAnimating] = useState(false);

  const update = useCallback(
    (patch: Partial<FormData>) => setData((prev) => ({ ...prev, ...patch })),
    [],
  );

  const goTo = useCallback(
    (next: number, dir: 'forward' | 'back') => {
      setDirection(dir);
      setIsAnimating(true);
      setTimeout(() => {
        setStep(next);
        setError(null);
        setIsAnimating(false);
      }, 200);
    },
    [],
  );

  const handleContinue = () => {
    const err = validateStep(step, data);
    if (err) {
      setError(err);
      return;
    }
    if (step < STEPS.length - 1) {
      goTo(step + 1, 'forward');
    }
  };

  const handleBack = () => {
    if (step > 0) goTo(step - 1, 'back');
  };

  const handleComplete = () => {
    const err = validateStep(step, data);
    if (err) {
      setError(err);
      return;
    }
    // Log data for now — Supabase integration later
    console.log('Onboarding complete:', JSON.stringify(data, null, 2));
    router.push('/onboarding/complete');
  };

  const handleSaveLater = () => {
    console.log('Saved for later:', JSON.stringify(data, null, 2));
    // TODO: persist to Supabase draft
    alert('Your progress has been saved. You can pick up where you left off anytime.');
  };

  const isLastStep = step === STEPS.length - 1;

  const stepContent = [
    <Step1 key={0} data={data} update={update} />,
    <Step2 key={1} data={data} update={update} />,
    <Step3 key={2} data={data} update={update} />,
    <Step4 key={3} data={data} update={update} />,
    <Step5 key={4} data={data} update={update} />,
    <Step6 key={5} data={data} update={update} />,
  ];

  return (
    <div
      className="min-h-screen py-8 px-4 sm:px-6"
      style={{ background: 'linear-gradient(180deg, #f8fafb 0%, #eaf7f3 100%)' }}
    >
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="text-2xl sm:text-3xl font-bold mb-1"
            style={{ fontFamily: 'Playfair Display, serif', color: '#1d1d1f' }}
          >
            Set Up Your Profile
          </h1>
          <p
            className="text-sm"
            style={{ fontFamily: 'Inter, sans-serif', color: '#424245' }}
          >
            This helps us create a tailored marketing strategy just for you.
          </p>
        </div>

        {/* Progress */}
        <ProgressBar current={step} total={STEPS.length} />
        <StepIndicator current={step} total={STEPS.length} />

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Step header */}
          <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-gray-50">
            <h2
              className="text-lg sm:text-xl font-semibold"
              style={{ fontFamily: 'Playfair Display, serif', color: '#1d1d1f' }}
            >
              {STEP_META[step].title}
            </h2>
            <p
              className="text-sm mt-0.5"
              style={{ fontFamily: 'Inter, sans-serif', color: '#424245' }}
            >
              {STEP_META[step].subtitle}
            </p>
          </div>

          {/* Step body */}
          <div className="px-6 sm:px-8 py-6">
            <div
              className={`transition-all duration-200 ease-in-out ${
                isAnimating
                  ? direction === 'forward'
                    ? 'opacity-0 translate-x-4'
                    : 'opacity-0 -translate-x-4'
                  : 'opacity-100 translate-x-0'
              }`}
            >
              {stepContent[step]}
            </div>

            {/* Error */}
            {error && (
              <div
                className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 4.5V8.5M8 10.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 sm:px-8 py-4 border-t border-gray-50 flex items-center justify-between">
            <div>
              {step > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#424245] hover:text-[#1d1d1f] transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M10 12L6 8L10 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveLater}
                className="text-sm font-medium text-[#424245] hover:text-[#1d1d1f] transition-colors"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Save &amp; finish later
              </button>

              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleComplete}
                  className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-[#4abd98]/25 active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #4abd98, #2e9a78)',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  Complete Setup
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8H13M13 8L9 4M13 8L9 12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleContinue}
                  className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-[#4abd98]/25 active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #4abd98, #2e9a78)',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  Continue
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M5 3L9 7L5 11"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer text */}
        <p
          className="text-center text-xs mt-6"
          style={{ fontFamily: 'Inter, sans-serif', color: '#9ca3af' }}
        >
          Your information is private and only used to personalize your marketing strategy.
        </p>
      </div>
    </div>
  );
}
