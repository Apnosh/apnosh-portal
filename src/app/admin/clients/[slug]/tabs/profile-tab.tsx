'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Building2, MapPin, Target, Megaphone, Settings2, Palette,
  CheckCircle2, Clock, Pencil, Save, X, Loader2,
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Chips({ items }: { items: string[] | null }) {
  if (!items?.length) return <span className="text-ink-4 text-sm">None set</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t} className="px-2.5 py-1 bg-brand-tint text-brand-dark text-xs font-medium rounded-full">{t}</span>
      ))}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">{label}</dt>
      <dd className="text-sm text-ink">{value || <span className="text-ink-4">Not set</span>}</dd>
    </div>
  )
}

function Card({ icon: Icon, title, children, onEdit }: {
  icon: typeof Building2; title: string; children: React.ReactNode; onEdit?: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-bold text-ink">{title}</h3>
        </div>
        {onEdit && (
          <button onClick={onEdit} className="text-ink-4 hover:text-brand transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Edit Modal                                                         */
/* ------------------------------------------------------------------ */

function EditModal({ title, fields, profile, clientId, onClose, onSaved }: {
  title: string
  fields: { key: keyof ProfileData; label: string; type: 'text' | 'textarea' | 'chips' }[]
  profile: ProfileData
  clientId: string
  onClose: () => void
  onSaved: (updated: Partial<ProfileData>) => void
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const init: Record<string, unknown> = {}
    fields.forEach(({ key, type }) => {
      const v = profile[key]
      if (type === 'chips') init[key] = Array.isArray(v) ? (v as string[]).join(', ') : ''
      else init[key] = v || ''
    })
    setDraft(init)
  }, [fields, profile])

  async function handleSave() {
    setSaving(true)
    const payload: Record<string, unknown> = {}
    fields.forEach(({ key, type }) => {
      const v = draft[key] as string
      if (type === 'chips') {
        payload[key] = v ? v.split(',').map((s: string) => s.trim()).filter(Boolean) : []
      } else {
        payload[key] = v || null
      }
    })
    await upsertClientProfile(clientId, payload as ClientProfileData)
    onSaved(payload as ClientProfileData)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-ink-6">
          <h3 className="font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {fields.map(({ key, label, type }) => (
            <div key={key}>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">{label}</label>
              {type === 'textarea' ? (
                <textarea
                  rows={3}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none"
                  value={(draft[key] as string) || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
              ) : (
                <input
                  type="text"
                  className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none"
                  value={(draft[key] as string) || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={type === 'chips' ? 'Comma-separated values' : ''}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-ink-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-3 hover:text-ink rounded-lg">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg disabled:opacity-50"
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
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ProfileTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)

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

  if (loading) return <div className="text-sm text-ink-4 animate-pulse py-8 text-center">Loading profile...</div>

  if (!profile) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
          <Building2 className="w-5 h-5 text-amber-600" />
        </div>
        <p className="text-sm font-medium text-ink mb-1">No CRM profile yet</p>
        <p className="text-xs text-ink-4 max-w-xs mx-auto">This client hasn't completed onboarding. A profile will appear once they do, or you can create one manually.</p>
      </div>
    )
  }

  function handleSaved(updates: Partial<ProfileData>) {
    setProfile((p) => p ? { ...p, ...updates } : p)
  }

  const EDIT_GROUPS: Record<string, { title: string; fields: { key: keyof ProfileData; label: string; type: 'text' | 'textarea' | 'chips' }[] }> = {
    business: {
      title: 'Edit Business Info',
      fields: [
        { key: 'business_type', label: 'Business Type', type: 'text' },
        { key: 'business_description', label: 'Description', type: 'textarea' },
        { key: 'unique_differentiator', label: 'What Makes Them Stand Out', type: 'textarea' },
        { key: 'competitors', label: 'Competitors', type: 'text' },
        { key: 'cuisine', label: 'Cuisine', type: 'text' },
        { key: 'service_styles', label: 'Service Styles', type: 'chips' },
      ],
    },
    location: {
      title: 'Edit Location',
      fields: [
        { key: 'full_address', label: 'Address', type: 'text' },
        { key: 'city', label: 'City', type: 'text' },
        { key: 'state', label: 'State', type: 'text' },
        { key: 'zip', label: 'Zip', type: 'text' },
        { key: 'location_count', label: 'Location Count', type: 'text' },
        { key: 'website_url', label: 'Website', type: 'text' },
        { key: 'business_phone', label: 'Phone', type: 'text' },
      ],
    },
    goals: {
      title: 'Edit Goals & Audience',
      fields: [
        { key: 'primary_goal', label: 'Primary Goal', type: 'text' },
        { key: 'goal_detail', label: 'Goal Detail', type: 'textarea' },
        { key: 'customer_types', label: 'Customer Types', type: 'chips' },
        { key: 'why_choose', label: 'Why People Choose Them', type: 'chips' },
        { key: 'success_signs', label: 'Success Signs', type: 'chips' },
        { key: 'timeline', label: 'Timeline', type: 'text' },
      ],
    },
    content: {
      title: 'Edit Content Strategy',
      fields: [
        { key: 'main_offerings', label: 'What to Promote', type: 'textarea' },
        { key: 'tone_tags', label: 'Brand Voice', type: 'chips' },
        { key: 'custom_tone', label: 'Custom Tone Notes', type: 'textarea' },
        { key: 'content_type_tags', label: 'Content Types', type: 'chips' },
        { key: 'reference_accounts', label: 'Reference Accounts', type: 'text' },
        { key: 'avoid_content_tags', label: 'Things to Avoid', type: 'chips' },
      ],
    },
    workflow: {
      title: 'Edit Workflow',
      fields: [
        { key: 'approval_type', label: 'Approval Style', type: 'text' },
        { key: 'can_film', label: 'Who Can Be on Camera', type: 'chips' },
        { key: 'can_tag', label: 'Can Tag @apnosh', type: 'text' },
      ],
    },
    brand: {
      title: 'Edit Brand',
      fields: [
        { key: 'brand_color_primary', label: 'Primary Color', type: 'text' },
        { key: 'brand_color_secondary', label: 'Secondary Color', type: 'text' },
        { key: 'brand_drive', label: 'Brand Drive Link', type: 'text' },
        { key: 'logo_url', label: 'Logo URL', type: 'text' },
      ],
    },
  }

  const platforms = profile.platforms_connected || {}
  const connectedPlatforms = Object.entries(platforms).filter(([, v]) => v).map(([k]) => k)

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Business Info */}
        <Card icon={Building2} title="Business Info" onEdit={() => setEditing('business')}>
          <div className="space-y-3">
            <Field label="Type" value={profile.business_type} />
            {profile.cuisine && <Field label="Cuisine" value={profile.cuisine} />}
            {profile.service_styles?.length ? (
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Service Styles</dt><Chips items={profile.service_styles} /></div>
            ) : null}
            <Field label="Description" value={profile.business_description} />
            <Field label="Stands Out" value={profile.unique_differentiator} />
            <Field label="Competitors" value={profile.competitors} />
          </div>
        </Card>

        {/* Location */}
        <Card icon={MapPin} title="Location" onEdit={() => setEditing('location')}>
          <div className="space-y-3">
            <Field label="Address" value={profile.full_address} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="City" value={profile.city} />
              <Field label="State" value={profile.state} />
              <Field label="Zip" value={profile.zip} />
            </div>
            <Field label="Locations" value={profile.location_count} />
            <Field label="Website" value={profile.website_url} />
            <Field label="Phone" value={profile.business_phone} />
          </div>
        </Card>

        {/* Goals & Audience */}
        <Card icon={Target} title="Goals & Audience" onEdit={() => setEditing('goals')}>
          <div className="space-y-3">
            <Field label="Primary Goal" value={profile.primary_goal} />
            <Field label="Detail" value={profile.goal_detail} />
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Customer Types</dt><Chips items={profile.customer_types} /></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Why People Choose Them</dt><Chips items={profile.why_choose} /></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Success Signs</dt><Chips items={profile.success_signs} /></div>
            <Field label="Timeline" value={profile.timeline} />
          </div>
        </Card>

        {/* Content Strategy */}
        <Card icon={Megaphone} title="Content Strategy" onEdit={() => setEditing('content')}>
          <div className="space-y-3">
            <Field label="What to Promote" value={profile.main_offerings} />
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Brand Voice</dt><Chips items={profile.tone_tags} /></div>
            <Field label="Custom Tone" value={profile.custom_tone} />
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Content Types</dt><Chips items={profile.content_type_tags} /></div>
            <Field label="Accounts They Admire" value={profile.reference_accounts} />
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Things to Avoid</dt><Chips items={profile.avoid_content_tags} /></div>
          </div>
        </Card>

        {/* Workflow */}
        <Card icon={Settings2} title="Workflow" onEdit={() => setEditing('workflow')}>
          <div className="space-y-3">
            <Field label="Approval Style" value={profile.approval_type} />
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">On Camera</dt><Chips items={profile.can_film} /></div>
            <Field label="Tag @apnosh" value={profile.can_tag} />
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Connected Platforms</dt>
              <Chips items={connectedPlatforms.length ? connectedPlatforms : null} />
            </div>
          </div>
        </Card>

        {/* Brand */}
        <Card icon={Palette} title="Brand" onEdit={() => setEditing('brand')}>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {profile.brand_color_primary && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md border border-ink-6" style={{ background: profile.brand_color_primary }} />
                  <span className="text-xs text-ink-3">{profile.brand_color_primary}</span>
                </div>
              )}
              {profile.brand_color_secondary && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md border border-ink-6" style={{ background: profile.brand_color_secondary }} />
                  <span className="text-xs text-ink-3">{profile.brand_color_secondary}</span>
                </div>
              )}
              {!profile.brand_color_primary && !profile.brand_color_secondary && <span className="text-sm text-ink-4">No colors set</span>}
            </div>
            <Field label="Logo" value={profile.logo_url} />
            <Field label="Brand Drive" value={profile.brand_drive} />
          </div>
        </Card>
      </div>

      {/* Onboarding Status */}
      <div className="mt-5 bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex items-center gap-2 mb-3">
          {profile.onboarding_complete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <Clock className="w-4 h-4 text-amber-500" />
          )}
          <h3 className="text-sm font-bold text-ink">Onboarding</h3>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-ink-4">Status: </span>
            <span className={profile.onboarding_complete ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
              {profile.onboarding_complete ? 'Complete' : `Step ${profile.onboarding_step || 1}`}
            </span>
          </div>
          {profile.onboarding_completed_at && (
            <div>
              <span className="text-ink-4">Completed: </span>
              <span className="text-ink">{new Date(profile.onboarding_completed_at).toLocaleDateString()}</span>
            </div>
          )}
          <div>
            <span className="text-ink-4">Terms: </span>
            <span className={profile.agreed_terms ? 'text-emerald-600' : 'text-ink-4'}>{profile.agreed_terms ? 'Agreed' : 'Not agreed'}</span>
          </div>
          <div>
            <span className="text-ink-4">Role: </span>
            <span className="text-ink">{profile.user_role || 'Not set'}</span>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
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
    </>
  )
}
