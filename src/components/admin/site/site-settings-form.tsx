'use client'

/**
 * Admin form for editing Apnosh Site settings per client.
 *
 * Sections:
 *   1. Branding -- tagline, hero photo, logo, colors, fonts
 *   2. Ordering -- order online, reservations, delivery
 *   3. Social -- IG, FB, TikTok URLs
 *   4. Publication -- publish toggle, custom domain
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, AlertCircle, Globe, Sparkles } from 'lucide-react'
import { upsertSiteSettings, type SiteSettings, type SiteSettingsInput } from '@/lib/site-settings/actions'

interface Props {
  clientId: string
  clientSlug: string
  initial: SiteSettings | null
}

const DEFAULT_HEADING_FONTS = ['Playfair Display', 'Lora', 'Merriweather', 'DM Serif Display', 'Inter', 'Poppins']
const DEFAULT_BODY_FONTS    = ['Inter', 'DM Sans', 'Lato', 'Source Sans Pro', 'Open Sans', 'Nunito']

export default function SiteSettingsForm({ clientId, initial }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [form, setForm] = useState<SiteSettingsInput>(() => ({
    tagline: initial?.tagline ?? '',
    heroPhotoUrl: initial?.heroPhotoUrl ?? '',
    logoUrl: initial?.logoUrl ?? '',
    primaryColor: initial?.primaryColor ?? '#2D4A22',
    accentColor: initial?.accentColor ?? '#D97706',
    backgroundColor: initial?.backgroundColor ?? '#FFFFFF',
    textColor: initial?.textColor ?? '#1C1917',
    headingFont: initial?.headingFont ?? 'Playfair Display',
    bodyFont: initial?.bodyFont ?? 'Inter',
    orderOnlineUrl: initial?.orderOnlineUrl ?? '',
    reservationUrl: initial?.reservationUrl ?? '',
    instagramUrl: initial?.instagramUrl ?? '',
    facebookUrl: initial?.facebookUrl ?? '',
    tiktokUrl: initial?.tiktokUrl ?? '',
    isPublished: initial?.isPublished ?? false,
  }))

  const update = <K extends keyof SiteSettingsInput>(k: K, v: SiteSettingsInput[K]) => {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  const handleSave = async () => {
    setBusy(true)
    setMessage(null)
    const res = await upsertSiteSettings(clientId, form)
    setBusy(false)
    if (res.success) {
      setMessage({ ok: true, text: 'Saved. Site updated.' })
      startTransition(() => router.refresh())
    } else {
      setMessage({ ok: false, text: res.error })
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`flex items-start gap-2 p-3 rounded-lg ${
          message.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
        }`}>
          {message.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* ── Publication state ─────────────────────────────────── */}
      <Section title="Publication" icon={Globe}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isPublished ?? false}
            onChange={e => update('isPublished', e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          <div>
            <div className="text-sm font-medium text-ink">Site is live</div>
            <p className="text-xs text-ink-3 mt-0.5">
              When checked, /sites/{initial?.id ? '...' : 'this-client'} is publicly accessible.
              Uncheck to hide.
            </p>
          </div>
        </label>
      </Section>

      {/* ── Branding ──────────────────────────────────────────── */}
      <Section title="Branding" icon={Sparkles}>
        <Field label="Tagline" hint="One sentence shown under the restaurant name">
          <input
            type="text"
            value={form.tagline ?? ''}
            placeholder="Seattle's most-loved ramen since 2018"
            onChange={e => update('tagline', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </Field>

        <Field label="Hero photo URL" hint="Full-bleed background image at the top of the site">
          <input
            type="url"
            value={form.heroPhotoUrl ?? ''}
            placeholder="https://..."
            onChange={e => update('heroPhotoUrl', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </Field>

        <Field label="Logo URL" hint="Optional brand logo">
          <input
            type="url"
            value={form.logoUrl ?? ''}
            placeholder="https://..."
            onChange={e => update('logoUrl', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </Field>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ColorField label="Primary" value={form.primaryColor ?? '#2D4A22'} onChange={v => update('primaryColor', v)} />
          <ColorField label="Accent" value={form.accentColor ?? '#D97706'} onChange={v => update('accentColor', v)} />
          <ColorField label="Background" value={form.backgroundColor ?? '#FFFFFF'} onChange={v => update('backgroundColor', v)} />
          <ColorField label="Text" value={form.textColor ?? '#1C1917'} onChange={v => update('textColor', v)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Heading font">
            <select
              value={form.headingFont ?? 'Playfair Display'}
              onChange={e => update('headingFont', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
            >
              {DEFAULT_HEADING_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Body font">
            <select
              value={form.bodyFont ?? 'Inter'}
              onChange={e => update('bodyFont', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
            >
              {DEFAULT_BODY_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      {/* ── Ordering / Reservations ───────────────────────────── */}
      <Section title="Ordering & reservations">
        <Field label="Order online URL" hint="Toast / ChowNow / direct ordering">
          <input
            type="url"
            value={form.orderOnlineUrl ?? ''}
            placeholder="https://order.toasttab.com/..."
            onChange={e => update('orderOnlineUrl', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </Field>
        <Field label="Reservation URL" hint="OpenTable / Resy / Tock">
          <input
            type="url"
            value={form.reservationUrl ?? ''}
            placeholder="https://www.opentable.com/..."
            onChange={e => update('reservationUrl', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </Field>
      </Section>

      {/* ── Social ────────────────────────────────────────────── */}
      <Section title="Social">
        <Field label="Instagram URL">
          <input
            type="url"
            value={form.instagramUrl ?? ''}
            placeholder="https://instagram.com/..."
            onChange={e => update('instagramUrl', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </Field>
        <Field label="Facebook URL">
          <input
            type="url"
            value={form.facebookUrl ?? ''}
            placeholder="https://facebook.com/..."
            onChange={e => update('facebookUrl', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </Field>
        <Field label="TikTok URL">
          <input
            type="url"
            value={form.tiktokUrl ?? ''}
            placeholder="https://tiktok.com/@..."
            onChange={e => update('tiktokUrl', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </Field>
      </Section>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={busy}
          className="px-5 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ─── UI helpers ────────────────────────────────────────────────

function Section({
  title, icon: Icon, children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-ink-6 bg-white p-5 space-y-4">
      <h2 className="text-sm font-bold text-ink flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-ink-3" />}
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-3 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-ink-4 mt-1">{hint}</p>}
    </div>
  )
}

function ColorField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-ink-3 block mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded border border-ink-5 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs font-mono border border-ink-5 rounded"
        />
      </div>
    </div>
  )
}
