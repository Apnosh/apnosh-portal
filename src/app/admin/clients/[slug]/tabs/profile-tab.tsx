'use client'

/**
 * Profile — the strategic playbook for a client.
 *
 * Narrative-first layout. Every other tab answers "what's happening."
 * This tab answers "what's the game plan." Strategy is the hero block
 * at the top; everything else supports it.
 *
 * Hierarchy (top → bottom):
 *   1. Strategy hero  — north star goal, detail, timeline, success signs
 *   2. Who we serve   — customer types + why they choose this client
 *   3. Positioning    — description + differentiator + competitors
 *   4. Content playbook — tone, content types, references, avoid
 *   5. Operations     — location, approvals, camera, tagging, platforms
 *   6. Brand assets   — colors, logo, drive
 *   7. Onboarding meta — small admin strip at the bottom
 *
 * Empty state is a real invitation: "Start this client's strategic
 * profile" CTA that creates an initial row and opens the goals editor.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Building2, MapPin, Target, Megaphone, Settings2, Palette,
  Pencil, Save, X, Loader2, Check, Sparkles, Users, Compass,
  CalendarClock, Heart, ExternalLink, Plus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { upsertClientProfile, type ClientProfileData } from '@/lib/crm-sync'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProfileData {
  user_role: string | null
  business_type: string | null
  business_type_other: string | null
  business_description: string | null
  unique_differentiator: string | null
  competitors: string | null
  cuisine: string | null
  cuisine_other: string | null
  service_styles: string[] | null
  full_address: string | null
  city: string | null
  state: string | null
  zip: string | null
  location_count: string | null
  hours: Record<string, unknown> | null
  website_url: string | null
  business_phone: string | null
  customer_types: string[] | null
  why_choose: string[] | null
  primary_goal: string | null
  goal_detail: string | null
  success_signs: string[] | null
  timeline: string | null
  main_offerings: string | null
  upcoming_events: string | null
  tone_tags: string[] | null
  custom_tone: string | null
  content_type_tags: string[] | null
  reference_accounts: string | null
  avoid_content_tags: string[] | null
  approval_type: string | null
  can_film: string[] | null
  can_tag: string | null
  platforms_connected: Record<string, boolean> | null
  logo_url: string | null
  brand_color_primary: string | null
  brand_color_secondary: string | null
  brand_drive: string | null
  onboarding_complete: boolean | null
  onboarding_step: number | null
  agreed_terms: boolean | null
  agreed_terms_at: string | null
  onboarding_completed_at: string | null
}

type EditGroupKey = 'strategy' | 'audience' | 'positioning' | 'playbook' | 'operations' | 'brand' | 'location'

/* ------------------------------------------------------------------ */
/*  Small primitives                                                   */
/* ------------------------------------------------------------------ */

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[10px] font-semibold text-ink-4 uppercase tracking-[0.14em]">
        {children}
      </span>
      <span className="flex-1 h-px bg-ink-6" />
      {action}
    </div>
  )
}

function Chips({ items, tone = 'brand' }: { items: string[] | null; tone?: 'brand' | 'neutral' | 'warn' }) {
  if (!items?.length) return null
  const classes = tone === 'warn' ? 'bg-red-50 text-red-700 border-red-100'
    : tone === 'neutral' ? 'bg-bg-2 text-ink-2 border-ink-6'
    : 'bg-brand-tint text-brand-dark border-brand/20'
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(t => (
        <span key={t} className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${classes}`}>
          {t}
        </span>
      ))}
    </div>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-4 italic text-[12px]">{children}</span>
}

function Field({ label, value, emptyHint = 'Not set' }: {
  label: string
  value: string | null | undefined
  emptyHint?: string
}) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-4 mb-1">{label}</dt>
      <dd className="text-[13px] text-ink leading-snug">
        {value || <EmptyHint>{emptyHint}</EmptyHint>}
      </dd>
    </div>
  )
}

function Card({
  title, caption, onEdit, children, className = '',
}: {
  title: string
  caption?: string
  onEdit?: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white rounded-xl border border-ink-6 shadow-sm p-5 ${className}`}>
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          {caption && <p className="text-[11px] text-ink-4 mt-0.5">{caption}</p>}
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-ink-4 hover:text-brand-dark transition-colors p-1 -mr-1"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Edit modal (unchanged wire-up; now supports our grouped keys)     */
/* ------------------------------------------------------------------ */

function EditModal({ title, fields, profile, clientId, onClose, onSaved }: {
  title: string
  fields: { key: keyof ProfileData; label: string; type: 'text' | 'textarea' | 'chips' }[]
  profile: ProfileData
  clientId: string
  onClose: () => void
  onSaved: (updates: Partial<ProfileData>) => void
}) {
  const [values, setValues] = useState<Record<string, string | string[]>>(() => {
    const init: Record<string, string | string[]> = {}
    for (const f of fields) {
      const v = profile[f.key]
      if (f.type === 'chips') init[f.key] = Array.isArray(v) ? v : []
      else init[f.key] = typeof v === 'string' ? v : ''
    }
    return init
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const updates: Partial<ProfileData> = {}
    for (const f of fields) {
      const v = values[f.key]
      if (f.type === 'chips') {
        (updates as Record<string, unknown>)[f.key] = v
      } else {
        (updates as Record<string, unknown>)[f.key] = typeof v === 'string' ? (v.trim() || null) : null
      }
    }
    const res = await upsertClientProfile(clientId, updates as ClientProfileData)
    if (res.success) {
      onSaved(updates)
      onClose()
    } else {
      alert('Could not save: ' + res.error)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-ink-6">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {fields.map(f => (
            <div key={f.key as string}>
              <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">
                {f.label}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  value={values[f.key] as string}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-y"
                />
              ) : f.type === 'chips' ? (
                <input
                  type="text"
                  value={(values[f.key] as string[])?.join(', ') ?? ''}
                  onChange={e => {
                    const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    setValues(v => ({ ...v, [f.key]: arr }))
                  }}
                  placeholder="Comma separated — e.g. Foodies, Lunch crowd, Tourists"
                  className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              ) : (
                <input
                  type="text"
                  value={values[f.key] as string}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-6 bg-bg-2">
          <button onClick={onClose} className="text-sm text-ink-3 hover:text-ink px-3">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Strategy Hero — the star of the page                              */
/* ------------------------------------------------------------------ */

function StrategyHero({ profile, onEdit }: {
  profile: ProfileData
  onEdit: () => void
}) {
  const hasGoal = !!profile.primary_goal
  const hasDetail = !!profile.goal_detail
  const hasSigns = profile.success_signs && profile.success_signs.length > 0

  return (
    <div className="relative bg-white rounded-2xl border border-ink-6 shadow-sm overflow-hidden">
      {/* Gradient ribbon — signals "this is the hero block" */}
      <div className="h-1 bg-gradient-to-r from-brand/50 via-brand to-brand-dark" />

      <div className="p-7">
        <div className="flex items-start justify-between gap-5">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-tint text-brand-dark text-[10.5px] font-semibold uppercase tracking-wide">
              <Compass className="w-3 h-3" />
              North Star
            </div>

            {hasGoal ? (
              <h2 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-ink mt-3 tracking-tight">
                {profile.primary_goal}
              </h2>
            ) : (
              <h2 className="font-[family-name:var(--font-display)] text-[22px] leading-tight text-ink-4 italic mt-3">
                No primary goal set yet
              </h2>
            )}

            {hasDetail && (
              <p className="text-[14px] text-ink-2 mt-3 leading-relaxed max-w-[680px] whitespace-pre-line">
                {profile.goal_detail}
              </p>
            )}

            {/* Timeline row */}
            {profile.timeline && (
              <div className="inline-flex items-center gap-1.5 mt-4 text-[12px] text-ink-3">
                <CalendarClock className="w-3.5 h-3.5 text-ink-4" />
                <span className="font-medium">Timeline:</span>
                <span>{profile.timeline}</span>
              </div>
            )}
          </div>

          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 text-[12px] text-ink-4 hover:text-brand-dark px-2 py-1 flex-shrink-0 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit strategy
          </button>
        </div>

        {/* Success signs — checklist feel */}
        {hasSigns && (
          <div className="mt-6 pt-5 border-t border-ink-6">
            <div className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-4 uppercase tracking-wide mb-3">
              <Heart className="w-3 h-3" />
              Success will feel like
            </div>
            <ul className="space-y-1.5">
              {profile.success_signs!.map((sign, i) => (
                <li key={i} className="flex items-start gap-2 text-[13.5px] text-ink-2 leading-snug">
                  <Check className="w-3.5 h-3.5 text-emerald-600 mt-1 flex-shrink-0" />
                  <span>{sign}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!hasGoal && !hasDetail && !hasSigns && (
          <div className="mt-5 p-4 rounded-xl bg-bg-2/60 border border-ink-6 border-dashed">
            <p className="text-[13px] text-ink-3 leading-relaxed">
              The North Star answers &ldquo;what does success look like for this
              client in the next 3-6 months?&rdquo; Define it once and every
              conversation, content brief, and performance review can point
              back to it.
            </p>
            <button
              onClick={onEdit}
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-brand-dark hover:underline font-medium"
            >
              Define the strategy <Plus className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ProfileTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditGroupKey | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('client_profiles')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle()
    setProfile(data as ProfileData | null)
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  async function startProfile() {
    setCreating(true)
    // Upsert an empty row so subsequent edits just work
    await upsertClientProfile(clientId, {} as ClientProfileData)
    await load()
    setCreating(false)
    setEditing('strategy')
  }

  function handleSaved(updates: Partial<ProfileData>) {
    setProfile(p => p ? { ...p, ...updates } : p)
  }

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-48 bg-ink-6 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-ink-6 rounded-xl" />
          <div className="h-40 bg-ink-6 rounded-xl" />
        </div>
      </div>
    )
  }

  // Rich empty state — the old "no profile" screen was useless
  if (!profile) {
    return (
      <div className="bg-white rounded-2xl border border-ink-6 shadow-sm p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/40 flex items-center justify-center mx-auto mb-4">
          <Compass className="w-6 h-6 text-brand-dark" />
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-[22px] text-ink tracking-tight">
          Define the playbook for this client
        </h2>
        <p className="text-[13.5px] text-ink-3 mt-2 max-w-lg mx-auto leading-relaxed">
          Capture their north-star goal, who they serve, how they&apos;re positioned,
          and how you&apos;ll make content. Every other tab gets richer once this is
          filled in — especially Content, Performance, and the Overview.
        </p>
        <button
          onClick={startProfile}
          disabled={creating}
          className="mt-6 inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 disabled:opacity-50 transition-colors"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Start strategic profile
        </button>
        <p className="text-[11px] text-ink-4 mt-3">
          Or wait for them to complete onboarding — their answers will populate here automatically.
        </p>
      </div>
    )
  }

  const EDIT_GROUPS: Record<EditGroupKey, { title: string; fields: { key: keyof ProfileData; label: string; type: 'text' | 'textarea' | 'chips' }[] }> = {
    strategy: {
      title: 'Edit north-star strategy',
      fields: [
        { key: 'primary_goal', label: 'Primary goal (one sentence)', type: 'text' },
        { key: 'goal_detail', label: 'Why this matters + how we get there', type: 'textarea' },
        { key: 'timeline', label: 'Timeline (e.g. Q4 2026)', type: 'text' },
        { key: 'success_signs', label: 'What success will feel like (comma-separated)', type: 'chips' },
      ],
    },
    audience: {
      title: 'Edit who we serve',
      fields: [
        { key: 'customer_types', label: 'Who their customers are', type: 'chips' },
        { key: 'why_choose', label: 'Why customers choose them', type: 'chips' },
      ],
    },
    positioning: {
      title: 'Edit positioning',
      fields: [
        { key: 'business_description', label: 'Description', type: 'textarea' },
        { key: 'unique_differentiator', label: 'What makes them different', type: 'textarea' },
        { key: 'competitors', label: 'Competitors', type: 'text' },
        { key: 'business_type', label: 'Business type', type: 'text' },
        { key: 'cuisine', label: 'Cuisine (if restaurant)', type: 'text' },
        { key: 'service_styles', label: 'Service styles', type: 'chips' },
      ],
    },
    playbook: {
      title: 'Edit content playbook',
      fields: [
        { key: 'main_offerings', label: 'What to promote', type: 'textarea' },
        { key: 'tone_tags', label: 'Brand voice (comma-separated tones)', type: 'chips' },
        { key: 'custom_tone', label: 'Tone notes', type: 'textarea' },
        { key: 'content_type_tags', label: 'Content types', type: 'chips' },
        { key: 'reference_accounts', label: 'Accounts they admire', type: 'text' },
        { key: 'avoid_content_tags', label: 'Things to avoid', type: 'chips' },
      ],
    },
    operations: {
      title: 'Edit operations',
      fields: [
        { key: 'approval_type', label: 'Approval style', type: 'text' },
        { key: 'can_film', label: 'Who can be on camera', type: 'chips' },
        { key: 'can_tag', label: 'Can tag @apnosh', type: 'text' },
        { key: 'upcoming_events', label: 'Upcoming events to plan around', type: 'textarea' },
      ],
    },
    brand: {
      title: 'Edit brand assets',
      fields: [
        { key: 'brand_color_primary', label: 'Primary color (hex)', type: 'text' },
        { key: 'brand_color_secondary', label: 'Secondary color (hex)', type: 'text' },
        { key: 'brand_drive', label: 'Brand drive link', type: 'text' },
        { key: 'logo_url', label: 'Logo URL', type: 'text' },
      ],
    },
    location: {
      title: 'Edit location',
      fields: [
        { key: 'full_address', label: 'Address', type: 'text' },
        { key: 'city', label: 'City', type: 'text' },
        { key: 'state', label: 'State', type: 'text' },
        { key: 'zip', label: 'Zip', type: 'text' },
        { key: 'location_count', label: 'Number of locations', type: 'text' },
        { key: 'website_url', label: 'Website', type: 'text' },
        { key: 'business_phone', label: 'Phone', type: 'text' },
      ],
    },
  }

  const platforms = profile.platforms_connected || {}
  const connectedPlatforms = Object.entries(platforms).filter(([, v]) => v).map(([k]) => k)

  return (
    <div className="space-y-6">
      {/* 1. Strategy hero */}
      <StrategyHero profile={profile} onEdit={() => setEditing('strategy')} />

      {/* 2. Who we serve */}
      <div>
        <SectionLabel>Who we serve</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            title="Customer types"
            caption="The people this business is built for"
            onEdit={() => setEditing('audience')}
          >
            {profile.customer_types?.length
              ? <Chips items={profile.customer_types} />
              : <EmptyHint>Define their ideal customer</EmptyHint>
            }
          </Card>
          <Card
            title="Why customers choose them"
            caption="What earns loyalty, what wins a first visit"
            onEdit={() => setEditing('audience')}
          >
            {profile.why_choose?.length
              ? <Chips items={profile.why_choose} tone="neutral" />
              : <EmptyHint>Capture what they do well</EmptyHint>
            }
          </Card>
        </div>
      </div>

      {/* 3. Positioning */}
      <div>
        <SectionLabel>Positioning</SectionLabel>
        <Card
          title="How they show up in the market"
          caption="Description, differentiator, competitive frame"
          onEdit={() => setEditing('positioning')}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Field label="In one paragraph" value={profile.business_description} emptyHint="Write the elevator pitch" />
              <Field label="What makes them different" value={profile.unique_differentiator} />
            </div>
            <div className="space-y-4">
              <Field label="Competitors" value={profile.competitors} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Type" value={profile.business_type} />
                {profile.cuisine && <Field label="Cuisine" value={profile.cuisine} />}
              </div>
              {profile.service_styles?.length ? (
                <div>
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Service styles</dt>
                  <Chips items={profile.service_styles} tone="neutral" />
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      {/* 4. Content playbook */}
      <div>
        <SectionLabel>Content playbook</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            title="Voice & tone"
            caption="How the brand should sound"
            onEdit={() => setEditing('playbook')}
          >
            <div className="space-y-3">
              {profile.tone_tags?.length
                ? <Chips items={profile.tone_tags} />
                : <EmptyHint>Add tone descriptors (e.g. warm, playful, direct)</EmptyHint>
              }
              {profile.custom_tone && (
                <p className="text-[12.5px] text-ink-2 leading-relaxed pt-2 border-t border-ink-6">
                  {profile.custom_tone}
                </p>
              )}
            </div>
          </Card>
          <Card
            title="What we publish"
            caption="Formats + what to promote + things to avoid"
            onEdit={() => setEditing('playbook')}
          >
            <div className="space-y-3">
              {profile.content_type_tags?.length
                ? <Chips items={profile.content_type_tags} tone="neutral" />
                : <EmptyHint>Add content formats</EmptyHint>
              }
              {profile.main_offerings && (
                <div className="pt-2 border-t border-ink-6">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Promote</dt>
                  <p className="text-[12.5px] text-ink-2 leading-snug">{profile.main_offerings}</p>
                </div>
              )}
              {profile.avoid_content_tags?.length ? (
                <div className="pt-2 border-t border-ink-6">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Avoid</dt>
                  <Chips items={profile.avoid_content_tags} tone="warn" />
                </div>
              ) : null}
              {profile.reference_accounts && (
                <div className="pt-2 border-t border-ink-6">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Accounts they admire</dt>
                  <p className="text-[12.5px] text-ink-2">{profile.reference_accounts}</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* 5. Operations */}
      <div>
        <SectionLabel>Operations</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card
            title="Workflow"
            caption="Approvals + who we can tag + filming"
            onEdit={() => setEditing('operations')}
          >
            <div className="space-y-3">
              <Field label="Approval style" value={profile.approval_type} />
              <Field label="Can tag @apnosh" value={profile.can_tag} />
              {profile.can_film?.length ? (
                <div>
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-4 mb-1">On camera</dt>
                  <Chips items={profile.can_film} tone="neutral" />
                </div>
              ) : null}
              {profile.upcoming_events && (
                <Field label="Upcoming events" value={profile.upcoming_events} />
              )}
            </div>
          </Card>

          <Card
            title="Location & contact"
            caption="Where they are, how to reach them"
            onEdit={() => setEditing('location')}
          >
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-ink-4 mt-0.5 flex-shrink-0" />
                <div className="text-[12.5px] text-ink leading-snug">
                  {profile.full_address
                    ? <>
                        {profile.full_address}<br/>
                        <span className="text-ink-3">
                          {[profile.city, profile.state, profile.zip].filter(Boolean).join(', ')}
                        </span>
                      </>
                    : <EmptyHint>Add address</EmptyHint>
                  }
                </div>
              </div>
              {profile.website_url && (
                <a
                  href={profile.website_url.startsWith('http') ? profile.website_url : `https://${profile.website_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-ink hover:text-brand-dark"
                >
                  <ExternalLink className="w-3 h-3" />
                  {profile.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              )}
              {profile.business_phone && (
                <div className="text-[12.5px] text-ink-2 tabular-nums">
                  {profile.business_phone}
                </div>
              )}
              {profile.location_count && (
                <div className="text-[11.5px] text-ink-4 inline-flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {profile.location_count} location{profile.location_count === '1' ? '' : 's'}
                </div>
              )}
            </div>
          </Card>

          <Card
            title="Connected platforms"
            caption="Where we publish + pull analytics"
          >
            {connectedPlatforms.length
              ? <Chips items={connectedPlatforms} tone="neutral" />
              : <EmptyHint>Connect socials from Settings tab</EmptyHint>
            }
          </Card>
        </div>
      </div>

      {/* 6. Brand */}
      <div>
        <SectionLabel>Brand assets</SectionLabel>
        <Card
          title="Colors, logo, files"
          caption="Use these as the source of truth for content"
          onEdit={() => setEditing('brand')}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-4 mb-2">Colors</dt>
              <div className="flex items-center gap-3">
                {profile.brand_color_primary && (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg border border-ink-6 shadow-sm"
                      style={{ background: profile.brand_color_primary }}
                    />
                    <div className="text-[11px] text-ink-3 font-mono uppercase">{profile.brand_color_primary}</div>
                  </div>
                )}
                {profile.brand_color_secondary && (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg border border-ink-6 shadow-sm"
                      style={{ background: profile.brand_color_secondary }}
                    />
                    <div className="text-[11px] text-ink-3 font-mono uppercase">{profile.brand_color_secondary}</div>
                  </div>
                )}
                {!profile.brand_color_primary && !profile.brand_color_secondary && (
                  <EmptyHint>Add brand colors</EmptyHint>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {profile.logo_url && (
                <a
                  href={profile.logo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-ink hover:text-brand-dark"
                >
                  <ExternalLink className="w-3 h-3" />
                  Logo file
                </a>
              )}
              {profile.brand_drive && (
                <a
                  href={profile.brand_drive}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-ink hover:text-brand-dark"
                >
                  <ExternalLink className="w-3 h-3" />
                  Brand drive
                </a>
              )}
              {!profile.logo_url && !profile.brand_drive && (
                <EmptyHint>Link the logo + brand drive</EmptyHint>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* 7. Onboarding meta — small admin strip */}
      <div className="text-[11px] text-ink-4 px-1 flex items-center gap-5 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          {profile.onboarding_complete
            ? <><Check className="w-3 h-3 text-emerald-600" /> Onboarding complete</>
            : <><Loader2 className="w-3 h-3 text-amber-600" /> On step {profile.onboarding_step || 1}</>
          }
        </span>
        {profile.onboarding_completed_at && (
          <span>Completed {new Date(profile.onboarding_completed_at).toLocaleDateString()}</span>
        )}
        {profile.user_role && <span>Role: {profile.user_role}</span>}
      </div>

      {/* Edit modal */}
      {editing && EDIT_GROUPS[editing] && (
        <EditModal
          title={EDIT_GROUPS[editing].title}
          fields={EDIT_GROUPS[editing].fields}
          profile={profile}
          clientId={clientId}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
