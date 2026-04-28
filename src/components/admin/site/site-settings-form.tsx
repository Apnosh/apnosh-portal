'use client'

/**
 * Admin form for Apnosh Site settings.
 *
 * IMPORTANT: this form ONLY handles things that are truly site-specific.
 * Everything else (name, tagline, brand colors, fonts, logo, social
 * handles, hours) flows from the canonical client tables -- edit those
 * in their normal places (Brand tab, Connections, Updates) and the
 * site auto-updates.
 *
 * Site-specific fields:
 *   - Publication state (is the site live?)
 *   - Custom domain (future: yourrestaurant.com -> CNAME apnoshsites.com)
 *   - Order online URL (no clear home in clients yet)
 *   - Reservation URL (no clear home in clients yet)
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, AlertCircle, Globe, ExternalLink, Link2 } from 'lucide-react'
import { upsertSiteSettings, type SiteSettings, type SiteSettingsInput } from '@/lib/site-settings/actions'

interface Props {
  clientId: string
  clientSlug: string
  initial: SiteSettings | null
}

export default function SiteSettingsForm({ clientId, clientSlug, initial }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [form, setForm] = useState<SiteSettingsInput>(() => ({
    isPublished: initial?.isPublished ?? false,
    customDomain: initial?.customDomain ?? '',
    orderOnlineUrl: initial?.orderOnlineUrl ?? '',
    reservationUrl: initial?.reservationUrl ?? '',
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

      {/* ── Information note ──────────────────────────────────── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">The site pulls from your client profile automatically</p>
            <p className="text-blue-800 leading-relaxed">
              Restaurant name, tagline, brand colors, fonts, logo, social handles, hours, and address all come
              from the canonical sources (Brand tab, Profile, Connections, Updates). Edit them in their normal
              places and the site updates. This page is just for site-specific things.
            </p>
          </div>
        </div>
      </div>

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
              When checked, the site at{' '}
              <code className="font-mono text-[11px] bg-bg-2 px-1 py-0.5 rounded">/sites/{clientSlug}</code>{' '}
              is publicly accessible. Uncheck to hide while you set things up.
            </p>
          </div>
        </label>
      </Section>

      {/* ── Custom domain ─────────────────────────────────────── */}
      <Section title="Custom domain" icon={Link2}>
        <Field
          label="Domain"
          hint="Future: point your own domain (yourrestaurant.com) at Apnosh via CNAME. Not yet active."
        >
          <input
            type="text"
            value={form.customDomain ?? ''}
            placeholder="yourrestaurant.com"
            onChange={e => update('customDomain', e.target.value || null)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
            disabled
          />
        </Field>
      </Section>

      {/* ── Ordering links ────────────────────────────────────── */}
      <Section title="Action links" icon={ExternalLink}>
        <p className="text-xs text-ink-3">
          These show up as the primary CTAs on your site. Reservation gets priority over Order Online if both
          are set.
        </p>
        <Field label="Order online URL" hint="Toast / ChowNow / direct ordering link">
          <input
            type="url"
            value={form.orderOnlineUrl ?? ''}
            placeholder="https://order.toasttab.com/..."
            onChange={e => update('orderOnlineUrl', e.target.value || null)}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </Field>
        <Field label="Reservation URL" hint="OpenTable / Resy / Tock link">
          <input
            type="url"
            value={form.reservationUrl ?? ''}
            placeholder="https://www.opentable.com/..."
            onChange={e => update('reservationUrl', e.target.value || null)}
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
