'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, AlertCircle, Loader2, User, Building2 } from 'lucide-react'
import { submitVendorApplication } from './actions'

const CATEGORY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'photographer', label: 'Photography' },
  { key: 'videographer', label: 'Videography' },
  { key: 'food_influencer', label: 'Food influencer / content creator' },
  { key: 'graphic_designer', label: 'Graphic design' },
  { key: 'web_designer', label: 'Web design / development' },
  { key: 'social_manager', label: 'Social media management' },
  { key: 'email_marketer', label: 'Email / SMS marketing' },
  { key: 'local_seo', label: 'Local SEO' },
  { key: 'pr_specialist', label: 'PR / publicity' },
  { key: 'strategist', label: 'Marketing strategy / consulting' },
  { key: 'full_service_agency', label: 'Full-service agency' },
  { key: 'other', label: 'Other' },
]

export default function ApplicationForm() {
  const [applicantType, setApplicantType] = useState<'individual' | 'company'>('individual')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [categories, setCategories] = useState<Set<string>>(new Set())
  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [socialHandle, setSocialHandle] = useState('')
  const [pitch, setPitch] = useState('')
  const [typicalRate, setTypicalRate] = useState('')
  const [yearsExp, setYearsExp] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const toggleCategory = (k: string) => {
    setCategories(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const r = await submitVendorApplication({
        applicantType,
        displayName,
        email,
        phone: phone || undefined,
        categories: [...categories],
        serviceArea: ['WA'],
        portfolioUrl: portfolioUrl || undefined,
        socialHandle: socialHandle || undefined,
        sampleWorkUrls: [],
        pitch,
        typicalRate: typicalRate || undefined,
        restaurantExperienceYears: yearsExp ? parseInt(yearsExp, 10) : undefined,
      })
      setResult(r)
    })
  }

  if (result?.ok) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
        <p className="text-[18px] font-semibold text-ink mb-1">Application received</p>
        <p className="text-[13px] text-ink-2">
          We&apos;ll review your application and get back to you within 5 business days.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Applicant type */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">
          Are you a...
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setApplicantType('individual')}
            className={[
              'flex items-center gap-3 p-4 rounded-xl border-2 transition text-left',
              applicantType === 'individual'
                ? 'border-brand bg-brand-tint/30'
                : 'border-ink-6 bg-white hover:border-ink-4',
            ].join(' ')}
          >
            <User className="w-5 h-5 text-brand-dark" />
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Freelancer</p>
              <p className="text-[11px] text-ink-3">Solo contractor or creator</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setApplicantType('company')}
            className={[
              'flex items-center gap-3 p-4 rounded-xl border-2 transition text-left',
              applicantType === 'company'
                ? 'border-brand bg-brand-tint/30'
                : 'border-ink-6 bg-white hover:border-ink-4',
            ].join(' ')}
          >
            <Building2 className="w-5 h-5 text-brand-dark" />
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Agency / company</p>
              <p className="text-[11px] text-ink-3">Team or studio</p>
            </div>
          </button>
        </div>
      </div>

      {/* Name + email */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label={applicantType === 'individual' ? 'Your name' : 'Company name'}
          value={displayName}
          onChange={setDisplayName}
          required
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Phone (optional)" value={phone} onChange={setPhone} />
        <Field
          label="Portfolio URL (optional)"
          placeholder="https://..."
          value={portfolioUrl}
          onChange={setPortfolioUrl}
        />
      </div>

      <Field
        label="Instagram or main social handle (optional)"
        placeholder="@yourhandle"
        value={socialHandle}
        onChange={setSocialHandle}
      />

      {/* Categories */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">
          What services do you offer? (pick all that apply)
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map(c => {
            const active = categories.has(c.key)
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleCategory(c.key)}
                className={[
                  'px-3 py-1.5 rounded-full text-[12px] font-medium transition',
                  active
                    ? 'bg-ink text-white'
                    : 'bg-white border border-ink-6 text-ink-2 hover:border-ink-4',
                ].join(' ')}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Pitch */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">
          Tell us about yourself
        </label>
        <textarea
          value={pitch}
          onChange={e => setPitch(e.target.value)}
          rows={5}
          required
          placeholder="Who do you serve? What's your style? Why do you want to work with restaurants?"
          className="w-full bg-white border border-ink-6 rounded-xl px-4 py-3 text-[13.5px] focus:outline-none focus:border-brand resize-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Typical rate (optional)"
          placeholder="$400 per shoot, $1,200/mo, etc."
          value={typicalRate}
          onChange={setTypicalRate}
        />
        <Field
          label="Years working with restaurants (optional)"
          type="number"
          value={yearsExp}
          onChange={setYearsExp}
        />
      </div>

      {result?.error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-rose-800">{result.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 bg-ink text-white text-[14px] font-semibold rounded-full px-6 py-3 hover:bg-ink-2 transition disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting...
          </>
        ) : 'Submit application'}
      </button>
      <p className="text-[11px] text-ink-3">
        We review every application and respond within 5 business days.
      </p>
    </form>
  )
}

function Field({
  label, value, onChange, type = 'text', required = false, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1.5">
        {label}{required && <span className="text-rose-600"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full bg-white border border-ink-6 rounded-xl px-4 py-2.5 text-[13.5px] focus:outline-none focus:border-brand"
      />
    </div>
  )
}
