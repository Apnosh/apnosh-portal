'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Pencil, Save, X, Building2, Palette, Target, Swords, Megaphone, Goal,
  Globe, Phone, MapPin, Check, Plus, Trash2, Loader2, CheckCircle, AlertCircle,
  User, Briefcase, Upload, FileImage, FileText, Download,
} from 'lucide-react'
import { useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Business, BusinessLocation, Competitor } from '@/types/database'

// ── Draft type — mirrors Business but with editable fields ───────────

interface ProfileDraft {
  name: string
  industry: string
  description: string
  website_url: string
  phone: string
  hours: string
  locations: BusinessLocation[]
  // Brand
  brand_voice_words: string[]
  brand_tone: string
  brand_do_nots: string
  brand_colors: { primary: string; secondary: string }
  fonts: string
  style_notes: string
  // Target Audience
  target_audience: string
  target_age_range: string
  target_location: string
  target_problem: string
  // Competitors
  competitors: Competitor[]
  competitor_strengths: string
  differentiator: string
  // Marketing
  current_platforms: string[]
  posting_frequency: string
  has_google_business: boolean
  monthly_budget: string
  past_marketing_wins: string
  past_marketing_fails: string
  // Goals
  marketing_goals: string[]
  content_topics: string
  content_avoid_topics: string
  additional_notes: string
  seasonal_calendar: string
  // Legal / Contact
  legal_business_name: string
  dba_name: string
  entity_type: string
  primary_contact_name: string
  primary_contact_email: string
  primary_contact_phone: string
  address: string
  city: string
  state: string
  zip: string
}

// ── Brand Assets ────────────────────────────────────────────────────
interface BrandAsset {
  name: string
  url: string
  path: string
}

// ── Helpers ──────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  'Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'Twitter/X', 'YouTube', 'Google Business', 'Email', 'Website',
]

function businessToDraft(b: Business): ProfileDraft {
  return {
    name: b.name || '',
    industry: b.industry || '',
    description: b.description || '',
    website_url: b.website_url || '',
    phone: b.phone || '',
    hours: b.hours || '',
    locations: Array.isArray(b.locations) && b.locations.length ? b.locations : [{ address: '', city: '', state: '', zip: '', is_primary: true }],
    brand_voice_words: Array.isArray(b.brand_voice_words) ? b.brand_voice_words : (typeof (b.brand_voice_words as unknown) === 'string' && b.brand_voice_words ? String(b.brand_voice_words).split(',').map((s: string) => s.trim()) : []),
    brand_tone: b.brand_tone || '',
    brand_do_nots: b.brand_do_nots || '',
    brand_colors: (() => {
      const c = b.brand_colors
      if (!c) return { primary: '', secondary: '' }
      if (typeof c === 'object' && !Array.isArray(c) && c.primary !== undefined) return { primary: c.primary || '', secondary: c.secondary || '' }
      if (Array.isArray(c)) return { primary: c[0] || '', secondary: c[1] || '' }
      if (typeof c === 'string') {
        try { const arr = JSON.parse(c); return { primary: arr[0] || '', secondary: arr[1] || '' } } catch { return { primary: '', secondary: '' } }
      }
      return { primary: '', secondary: '' }
    })(),
    fonts: b.fonts || '',
    style_notes: b.style_notes || '',
    target_audience: b.target_audience || '',
    target_age_range: b.target_age_range || '',
    target_location: b.target_location || '',
    target_problem: b.target_problem || '',
    competitors: Array.isArray(b.competitors) ? b.competitors : [],
    competitor_strengths: b.competitor_strengths || '',
    differentiator: b.differentiator || '',
    current_platforms: Array.isArray(b.current_platforms) ? b.current_platforms : (typeof b.current_platforms === 'string' ? JSON.parse(b.current_platforms || '[]') : []),
    posting_frequency: b.posting_frequency || '',
    has_google_business: b.has_google_business ?? false,
    monthly_budget: b.monthly_budget != null ? String(b.monthly_budget) : '',
    past_marketing_wins: b.past_marketing_wins || '',
    past_marketing_fails: b.past_marketing_fails || '',
    marketing_goals: Array.isArray(b.marketing_goals) ? b.marketing_goals : (typeof b.marketing_goals === 'string' ? JSON.parse(b.marketing_goals || '[]') : []),
    content_topics: b.content_topics || '',
    content_avoid_topics: b.content_avoid_topics || '',
    additional_notes: b.additional_notes || '',
    seasonal_calendar: typeof b.seasonal_calendar === 'string' ? b.seasonal_calendar : (b.seasonal_calendar ? JSON.stringify(b.seasonal_calendar, null, 2) : ''),
    legal_business_name: b.legal_business_name || '',
    dba_name: b.dba_name || '',
    entity_type: b.entity_type || '',
    primary_contact_name: b.primary_contact_name || '',
    primary_contact_email: b.primary_contact_email || '',
    primary_contact_phone: b.primary_contact_phone || '',
    address: b.address || '',
    city: b.city || '',
    state: b.state || '',
    zip: b.zip || '',
  }
}

function draftToUpdate(d: ProfileDraft) {
  return {
    name: d.name,
    industry: d.industry,
    description: d.description || null,
    website_url: d.website_url || null,
    phone: d.phone || null,
    hours: d.hours || null,
    locations: d.locations.filter((l) => l.address || l.city),
    brand_voice_words: d.brand_voice_words,
    brand_tone: d.brand_tone || null,
    brand_do_nots: d.brand_do_nots || null,
    brand_colors: { primary: d.brand_colors.primary, secondary: d.brand_colors.secondary },
    fonts: d.fonts || null,
    style_notes: d.style_notes || null,
    target_audience: d.target_audience || null,
    target_age_range: d.target_age_range || null,
    target_location: d.target_location || null,
    target_problem: d.target_problem || null,
    competitors: d.competitors.filter((c) => c.name),
    competitor_strengths: d.competitor_strengths || null,
    differentiator: d.differentiator || null,
    current_platforms: d.current_platforms,
    posting_frequency: d.posting_frequency || null,
    has_google_business: d.has_google_business,
    monthly_budget: d.monthly_budget ? Number(d.monthly_budget) : null,
    past_marketing_wins: d.past_marketing_wins || null,
    past_marketing_fails: d.past_marketing_fails || null,
    marketing_goals: d.marketing_goals,
    content_topics: d.content_topics || null,
    content_avoid_topics: d.content_avoid_topics || null,
    additional_notes: d.additional_notes || null,
    seasonal_calendar: d.seasonal_calendar || null,
    legal_business_name: d.legal_business_name || null,
    dba_name: d.dba_name || null,
    entity_type: d.entity_type || null,
    primary_contact_name: d.primary_contact_name || null,
    primary_contact_email: d.primary_contact_email || null,
    primary_contact_phone: d.primary_contact_phone || null,
    address: d.address || null,
    city: d.city || null,
    state: d.state || null,
    zip: d.zip || null,
  }
}

/** Count how many "important" fields are filled */
function computeCompleteness(d: ProfileDraft): number {
  const checks = [
    d.name,
    d.industry,
    d.description,
    d.website_url,
    d.phone,
    d.locations.some((l) => l.address),
    d.brand_voice_words.length > 0,
    d.brand_tone,
    d.brand_colors.primary,
    d.target_audience,
    d.target_age_range,
    d.target_location,
    d.target_problem,
    d.competitors.length > 0,
    d.differentiator,
    d.current_platforms.length > 0,
    d.posting_frequency,
    d.marketing_goals.length > 0,
    d.content_topics,
    d.primary_contact_name,
    d.primary_contact_email,
  ]
  const filled = checks.filter(Boolean).length
  return Math.round((filled / checks.length) * 100)
}

// ── Brand Assets Component ───────────────────────────────────────────

function BrandAssetsSection({ businessId, editing }: { businessId: string | null; editing: boolean }) {
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [uploading, setUploading] = useState(false)
  const [loadingAssets, setLoadingAssets] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch existing assets
  useEffect(() => {
    if (!businessId) { setLoadingAssets(false); return }
    const supabase = createClient()
    async function listFiles() {
      const { data, error } = await supabase.storage
        .from('brand-assets')
        .list(businessId!, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } })

      if (error) {
        // Bucket may not exist yet
        console.log('Brand assets bucket not available:', error.message)
        setLoadingAssets(false)
        return
      }

      const files: BrandAsset[] = (data || [])
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => {
          const { data: urlData } = supabase.storage.from('brand-assets').getPublicUrl(`${businessId}/${f.name}`)
          return { name: f.name, url: urlData.publicUrl, path: `${businessId}/${f.name}` }
        })
      setAssets(files)
      setLoadingAssets(false)
    }
    listFiles()
  }, [businessId])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !businessId) return
    setUploading(true)
    const supabase = createClient()

    const ext = file.name.split('.').pop()
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const path = `${businessId}/${safeName}`

    const { error } = await supabase.storage.from('brand-assets').upload(path, file)
    if (error) {
      console.error('Upload failed:', error.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('brand-assets').getPublicUrl(path)
    setAssets(prev => [{ name: file.name, url: urlData.publicUrl, path }, ...prev])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDelete = async (asset: BrandAsset) => {
    const supabase = createClient()
    const { error } = await supabase.storage.from('brand-assets').remove([asset.path])
    if (!error) setAssets(prev => prev.filter(a => a.path !== asset.path))
  }

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(name)

  if (loadingAssets) {
    return <div className="h-20 bg-ink-6 rounded-lg animate-pulse" />
  }

  return (
    <div className="space-y-4">
      {editing && (
        <div>
          <input ref={fileRef} type="file" accept="image/*,.pdf,.ai,.eps,.svg" onChange={handleUpload} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-brand-dark bg-brand-tint border border-brand/20 rounded-lg hover:bg-brand-tint/80 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Upload asset'}
          </button>
          <p className="text-[11px] text-ink-4 mt-1.5">Logos, photos, brand guidelines, design files (JPG, PNG, SVG, PDF)</p>
        </div>
      )}

      {assets.length === 0 && !editing && (
        <p className="text-sm text-ink-4 italic">No brand assets uploaded yet.</p>
      )}

      {assets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {assets.map(asset => (
            <div key={asset.path} className="relative group rounded-lg border border-ink-6 overflow-hidden bg-bg-2">
              {isImage(asset.name) ? (
                <div className="aspect-square">
                  <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-square flex items-center justify-center">
                  <FileText className="w-10 h-10 text-ink-4" />
                </div>
              )}
              <div className="px-2 py-1.5 bg-white border-t border-ink-6">
                <p className="text-[10px] text-ink-3 truncate">{asset.name}</p>
              </div>
              {/* Actions overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <a href={asset.url} target="_blank" rel="noopener noreferrer" className="p-2 bg-white rounded-lg hover:bg-ink-6 transition-colors">
                  <Download className="w-4 h-4 text-ink" />
                </a>
                {editing && (
                  <button onClick={() => handleDelete(asset)} className="p-2 bg-white rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [business, setBusiness] = useState<Business | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────

  const fetchBusiness = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    if (error) {
      console.error('Failed to load business:', error.message)
      setLoading(false)
      return
    }

    setBusiness(data as Business)
    setBusinessId(data.id)
    setDraft(businessToDraft(data as Business))
    setLoading(false)
  }, [])

  useEffect(() => { fetchBusiness() }, [fetchBusiness])

  // ── Auto-dismiss toast ───────────────────────────────────────────

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Save ─────────────────────────────────────────────────────────

  const saveEdit = async () => {
    if (!draft || !businessId) return
    setSaving(true)
    const supabase = createClient()
    const payload = draftToUpdate(draft)

    const { error } = await supabase
      .from('businesses')
      .update(payload)
      .eq('id', businessId)

    if (error) {
      setToast({ type: 'error', message: `Save failed: ${error.message}` })
      setSaving(false)
      return
    }

    // Re-fetch to get fresh data
    const { data: fresh } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single()

    if (fresh) {
      setBusiness(fresh as Business)
      setDraft(businessToDraft(fresh as Business))
    }

    setEditing(false)
    setSaving(false)
    setToast({ type: 'success', message: 'Profile saved successfully.' })
  }

  const startEdit = () => {
    if (business) setDraft(businessToDraft(business))
    setEditing(true)
  }

  const cancelEdit = () => {
    if (business) setDraft(businessToDraft(business))
    setEditing(false)
  }

  // ── Completeness ─────────────────────────────────────────────────

  const completeness = useMemo(() => draft ? computeCompleteness(draft) : 0, [draft])

  // ── Shared sub-components ────────────────────────────────────────

  const SectionCard = ({ title, icon: Icon, children }: { title: string; icon: typeof Building2; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-ink-6 bg-bg-2">
        <Icon className="w-4 h-4 text-ink-3" />
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )

  const Field = ({ label, value, onChange, multiline, placeholder }: {
    label: string; value: string; onChange?: (v: string) => void; multiline?: boolean; placeholder?: string
  }) => (
    <div>
      <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">{label}</label>
      {editing && onChange ? (
        multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            placeholder={placeholder}
            className="mt-1 w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="mt-1 w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        )
      ) : (
        <p className="mt-1 text-sm text-ink-2 leading-relaxed">{value || <span className="text-ink-4 italic">Not set</span>}</p>
      )}
    </div>
  )

  // ── Loading state ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-48 bg-ink-6 rounded animate-pulse" />
            <div className="h-4 w-32 bg-ink-6 rounded animate-pulse mt-2" />
          </div>
          <div className="h-10 w-28 bg-ink-6 rounded-lg animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="h-12 bg-bg-2 border-b border-ink-6 animate-pulse" />
            <div className="p-5 space-y-4">
              <div className="h-4 w-3/4 bg-ink-6 rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-ink-6 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-ink-6 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!business || !draft) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <Building2 className="w-12 h-12 text-ink-4 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-ink">No business profile found</h2>
        <p className="text-sm text-ink-3 mt-1">Please complete onboarding to create your business profile.</p>
      </div>
    )
  }

  const d = draft

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Business Profile</h1>
          <p className="text-ink-3 text-sm mt-1">
            Last updated {new Date(business.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Completeness */}
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-ink-6 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${completeness >= 80 ? 'bg-emerald-500' : completeness >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                style={{ width: `${completeness}%` }}
              />
            </div>
            <span className="text-xs font-medium text-ink-3">{completeness}%</span>
          </div>

          {!editing ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-dark bg-brand-tint rounded-lg hover:bg-brand/10 transition-colors w-fit"
            >
              <Pencil className="w-4 h-4" />
              Edit Profile
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink-3 bg-bg-2 rounded-lg hover:bg-ink-6 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Business Information ─────────────────────────────────────── */}
      <SectionCard title="Business Information" icon={Building2}>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Business Name" value={d.name} onChange={(v) => setDraft({ ...d, name: v })} />
          <Field label="Industry" value={d.industry} onChange={(v) => setDraft({ ...d, industry: v })} />
          <div className="sm:col-span-2">
            <Field label="Description" value={d.description} onChange={(v) => setDraft({ ...d, description: v })} multiline />
          </div>
          <Field label="Website" value={d.website_url} onChange={(v) => setDraft({ ...d, website_url: v })} placeholder="https://" />
          <Field label="Phone" value={d.phone} onChange={(v) => setDraft({ ...d, phone: v })} />
          <div className="sm:col-span-2">
            <Field label="Business Hours" value={d.hours} onChange={(v) => setDraft({ ...d, hours: v })} multiline placeholder="Mon-Fri 9am-9pm, Sat-Sun 10am-10pm" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Locations</label>
            <div className="mt-1 space-y-3">
              {d.locations.map((loc, i) => (
                <div key={i} className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-ink-4 mt-2.5 flex-shrink-0" />
                  {editing ? (
                    <div className="flex-1 grid sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={loc.address}
                        placeholder="Address"
                        onChange={(e) => {
                          const locs = [...d.locations]
                          locs[i] = { ...locs[i], address: e.target.value }
                          setDraft({ ...d, locations: locs })
                        }}
                        className="sm:col-span-2 text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      />
                      <input
                        type="text"
                        value={loc.city}
                        placeholder="City"
                        onChange={(e) => {
                          const locs = [...d.locations]
                          locs[i] = { ...locs[i], city: e.target.value }
                          setDraft({ ...d, locations: locs })
                        }}
                        className="text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={loc.state}
                          placeholder="State"
                          onChange={(e) => {
                            const locs = [...d.locations]
                            locs[i] = { ...locs[i], state: e.target.value }
                            setDraft({ ...d, locations: locs })
                          }}
                          className="w-20 text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                        />
                        <input
                          type="text"
                          value={loc.zip}
                          placeholder="ZIP"
                          onChange={(e) => {
                            const locs = [...d.locations]
                            locs[i] = { ...locs[i], zip: e.target.value }
                            setDraft({ ...d, locations: locs })
                          }}
                          className="w-24 text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                        />
                        {d.locations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDraft({ ...d, locations: d.locations.filter((_, j) => j !== i) })}
                            className="p-2 text-ink-4 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-2 py-1">
                      {[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ') || <span className="text-ink-4 italic">Not set</span>}
                    </p>
                  )}
                </div>
              ))}
              {editing && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...d, locations: [...d.locations, { address: '', city: '', state: '', zip: '', is_primary: false }] })}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-dark hover:text-brand transition-colors ml-6"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Location
                </button>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Legal / Contact ──────────────────────────────────────────── */}
      <SectionCard title="Legal & Contact" icon={Briefcase}>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Legal Business Name" value={d.legal_business_name} onChange={(v) => setDraft({ ...d, legal_business_name: v })} />
          <Field label="DBA Name" value={d.dba_name} onChange={(v) => setDraft({ ...d, dba_name: v })} />
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Entity Type</label>
            {editing ? (
              <select
                value={d.entity_type}
                onChange={(e) => setDraft({ ...d, entity_type: e.target.value })}
                className="mt-1 w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white"
              >
                <option value="">Select...</option>
                <option value="llc">LLC</option>
                <option value="corp">Corporation</option>
                <option value="s_corp">S-Corp</option>
                <option value="sole_prop">Sole Proprietorship</option>
                <option value="partnership">Partnership</option>
                <option value="nonprofit">Nonprofit</option>
                <option value="other">Other</option>
              </select>
            ) : (
              <p className="mt-1 text-sm text-ink-2">
                {d.entity_type
                  ? d.entity_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                  : <span className="text-ink-4 italic">Not set</span>}
              </p>
            )}
          </div>
          <Field label="Primary Contact Name" value={d.primary_contact_name} onChange={(v) => setDraft({ ...d, primary_contact_name: v })} />
          <Field label="Primary Contact Email" value={d.primary_contact_email} onChange={(v) => setDraft({ ...d, primary_contact_email: v })} />
          <Field label="Primary Contact Phone" value={d.primary_contact_phone} onChange={(v) => setDraft({ ...d, primary_contact_phone: v })} />
          <Field label="Address" value={d.address} onChange={(v) => setDraft({ ...d, address: v })} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Field label="City" value={d.city} onChange={(v) => setDraft({ ...d, city: v })} />
            <Field label="State" value={d.state} onChange={(v) => setDraft({ ...d, state: v })} />
            <Field label="ZIP" value={d.zip} onChange={(v) => setDraft({ ...d, zip: v })} />
          </div>
        </div>
      </SectionCard>

      {/* ── Brand Identity ───────────────────────────────────────────── */}
      <SectionCard title="Brand Identity" icon={Palette}>
        <div className="space-y-5">
          {/* Voice Words */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Brand Voice</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {d.brand_voice_words.map((word, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-tint text-brand-dark text-sm font-medium rounded-full">
                  {word}
                  {editing && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...d, brand_voice_words: d.brand_voice_words.filter((_, j) => j !== i) })}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    const word = prompt('Add a brand voice word:')
                    if (word?.trim()) setDraft({ ...d, brand_voice_words: [...d.brand_voice_words, word.trim()] })
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-ink-5 text-ink-4 text-sm rounded-full hover:border-brand hover:text-brand-dark transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              )}
            </div>
          </div>

          <Field label="Tone of Voice" value={d.brand_tone} onChange={(v) => setDraft({ ...d, brand_tone: v })} multiline />

          {/* Do-Nots */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Do-Nots</label>
            {!editing ? (
              d.brand_do_nots ? (
                <ul className="mt-2 space-y-1.5">
                  {d.brand_do_nots.split('\n').filter(Boolean).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
                      <X className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink-4 italic">Not set</p>
              )
            ) : (
              <textarea
                value={d.brand_do_nots}
                onChange={(e) => setDraft({ ...d, brand_do_nots: e.target.value })}
                rows={3}
                placeholder="One per line"
                className="mt-1 w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
              />
            )}
          </div>

          {/* Brand Colors */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Brand Colors</label>
            <div className="flex flex-wrap gap-4 mt-2">
              {(['primary', 'secondary'] as const).map((key) => (
                <div key={key} className="flex items-center gap-2.5">
                  {editing ? (
                    <>
                      <input
                        type="color"
                        value={d.brand_colors[key] || '#000000'}
                        onChange={(e) => setDraft({ ...d, brand_colors: { ...d.brand_colors, [key]: e.target.value } })}
                        className="w-8 h-8 rounded-lg border border-ink-6 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={d.brand_colors[key]}
                        onChange={(e) => setDraft({ ...d, brand_colors: { ...d.brand_colors, [key]: e.target.value } })}
                        placeholder="#000000"
                        className="w-24 text-sm text-ink border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      />
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-lg border border-ink-6 shadow-sm" style={{ backgroundColor: d.brand_colors[key] || '#eee' }} />
                      <div>
                        <p className="text-xs font-medium text-ink capitalize">{key}</p>
                        <p className="text-[11px] text-ink-4">{d.brand_colors[key] || 'Not set'}</p>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Fonts */}
          <Field label="Fonts" value={d.fonts} onChange={(v) => setDraft({ ...d, fonts: v })} placeholder="Primary: Inter, Display: Playfair Display" />

          {/* Style Notes */}
          <Field label="Style Notes" value={d.style_notes} onChange={(v) => setDraft({ ...d, style_notes: v })} multiline placeholder="Any design preferences, guidelines, or visual references" />
        </div>
      </SectionCard>

      {/* ── Brand Assets ──────────────────────────────────────────────── */}
      <SectionCard title="Brand Assets" icon={Palette}>
        <BrandAssetsSection businessId={businessId} editing={editing} />
      </SectionCard>

      {/* ── Target Audience ──────────────────────────────────────────── */}
      <SectionCard title="Target Audience" icon={Target}>
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <Field label="Audience Description" value={d.target_audience} onChange={(v) => setDraft({ ...d, target_audience: v })} multiline />
          </div>
          <Field label="Age Range" value={d.target_age_range} onChange={(v) => setDraft({ ...d, target_age_range: v })} placeholder="e.g. 25-45" />
          <Field label="Location" value={d.target_location} onChange={(v) => setDraft({ ...d, target_location: v })} />
          <div className="sm:col-span-2">
            <Field label="Problem Your Business Solves" value={d.target_problem} onChange={(v) => setDraft({ ...d, target_problem: v })} multiline />
          </div>
        </div>
      </SectionCard>

      {/* ── Competitors ──────────────────────────────────────────────── */}
      <SectionCard title="Competitors" icon={Swords}>
        <div className="space-y-5">
          <div className="space-y-3">
            {d.competitors.map((comp, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-bg-2 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-ink-6 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-4 h-4 text-ink-3" />
                </div>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="flex gap-3 items-center">
                      <input
                        type="text"
                        value={comp.name}
                        onChange={(e) => {
                          const comps = [...d.competitors]
                          comps[i] = { ...comps[i], name: e.target.value }
                          setDraft({ ...d, competitors: comps })
                        }}
                        className="flex-1 text-sm text-ink border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                        placeholder="Name"
                      />
                      <input
                        type="text"
                        value={comp.website_url || ''}
                        onChange={(e) => {
                          const comps = [...d.competitors]
                          comps[i] = { ...comps[i], website_url: e.target.value }
                          setDraft({ ...d, competitors: comps })
                        }}
                        className="flex-1 text-sm text-ink border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                        placeholder="Website URL"
                      />
                      <button
                        type="button"
                        onClick={() => setDraft({ ...d, competitors: d.competitors.filter((_, j) => j !== i) })}
                        className="p-1.5 text-ink-4 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-ink">{comp.name}</p>
                      <p className="text-xs text-ink-4 truncate">{comp.website_url || 'No website'}</p>
                    </>
                  )}
                </div>
              </div>
            ))}
            {d.competitors.length === 0 && !editing && (
              <p className="text-sm text-ink-4 italic">No competitors added yet.</p>
            )}
            {editing && (
              <button
                type="button"
                onClick={() => setDraft({ ...d, competitors: [...d.competitors, { name: '', website_url: '' }] })}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-dark hover:text-brand transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Competitor
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Competitor Strengths" value={d.competitor_strengths} onChange={(v) => setDraft({ ...d, competitor_strengths: v })} multiline />
            <Field label="Your Differentiator" value={d.differentiator} onChange={(v) => setDraft({ ...d, differentiator: v })} multiline />
          </div>
        </div>
      </SectionCard>

      {/* ── Current Marketing ────────────────────────────────────────── */}
      <SectionCard title="Current Marketing" icon={Megaphone}>
        <div className="space-y-5">
          {/* Platforms */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Active Platforms</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {editing ? (
                PLATFORM_OPTIONS.map((p) => {
                  const active = d.current_platforms.includes(p.toLowerCase().replace(/\//g, '_').replace(' ', '_'))
                    || d.current_platforms.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        const val = p
                        setDraft({
                          ...d,
                          current_platforms: active
                            ? d.current_platforms.filter((x) => x !== val && x !== p.toLowerCase().replace(/\//g, '_').replace(' ', '_'))
                            : [...d.current_platforms, val],
                        })
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                        active
                          ? 'bg-brand-tint border-brand/30 text-brand-dark'
                          : 'bg-bg-2 border-ink-6 text-ink-4 hover:border-ink-5'
                      }`}
                    >
                      {active && <Check className="w-3.5 h-3.5" />}
                      {p}
                    </button>
                  )
                })
              ) : (
                d.current_platforms.length > 0 ? (
                  d.current_platforms.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg-2 border border-ink-6 text-ink-2 text-sm font-medium rounded-lg">
                      {p}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-ink-4 italic">No platforms selected</p>
                )
              )}
            </div>
          </div>

          <Field label="Posting Frequency" value={d.posting_frequency} onChange={(v) => setDraft({ ...d, posting_frequency: v })} />

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Google Business Profile</label>
              <div className="flex items-center gap-2 mt-1.5">
                {editing ? (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...d, has_google_business: !d.has_google_business })}
                    className="flex items-center gap-2"
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${d.has_google_business ? 'bg-green-100' : 'bg-ink-6'}`}>
                      <Check className={`w-3 h-3 ${d.has_google_business ? 'text-green-600' : 'text-ink-4'}`} />
                    </div>
                    <span className="text-sm text-ink-2">{d.has_google_business ? 'Active & Claimed' : 'Not Set Up'}</span>
                  </button>
                ) : (
                  <>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${d.has_google_business ? 'bg-green-100' : 'bg-ink-6'}`}>
                      <Check className={`w-3 h-3 ${d.has_google_business ? 'text-green-600' : 'text-ink-4'}`} />
                    </div>
                    <span className="text-sm text-ink-2">{d.has_google_business ? 'Active & Claimed' : 'Not Set Up'}</span>
                  </>
                )}
              </div>
            </div>
            <Field
              label="Monthly Marketing Budget"
              value={d.monthly_budget ? `$${Number(d.monthly_budget).toLocaleString()}` : ''}
              onChange={editing ? (v) => setDraft({ ...d, monthly_budget: v.replace(/[^0-9.]/g, '') }) : undefined}
            />
          </div>
          <div className="sm:col-span-2">
            <Field label="Past Marketing Wins" value={d.past_marketing_wins} onChange={(v) => setDraft({ ...d, past_marketing_wins: v })} multiline placeholder="What worked well in the past?" />
          </div>
          <div className="sm:col-span-2">
            <Field label="Past Marketing Fails" value={d.past_marketing_fails} onChange={(v) => setDraft({ ...d, past_marketing_fails: v })} multiline placeholder="What didn't work or wasted money?" />
          </div>
        </div>
      </SectionCard>

      {/* ── Goals & Content ──────────────────────────────────────────── */}
      <SectionCard title="Goals & Content" icon={Goal}>
        <div className="space-y-5">
          {/* Marketing Goals */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Marketing Goals</label>
            <div className="mt-2 space-y-2">
              {d.marketing_goals.map((goal, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded border bg-brand border-brand flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                  {editing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={goal}
                        onChange={(e) => {
                          const goals = [...d.marketing_goals]
                          goals[i] = e.target.value
                          setDraft({ ...d, marketing_goals: goals })
                        }}
                        className="flex-1 text-sm text-ink border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      />
                      <button
                        type="button"
                        onClick={() => setDraft({ ...d, marketing_goals: d.marketing_goals.filter((_, j) => j !== i) })}
                        className="p-1 text-ink-4 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-ink">{goal}</span>
                  )}
                </div>
              ))}
              {d.marketing_goals.length === 0 && !editing && (
                <p className="text-sm text-ink-4 italic">No goals set yet.</p>
              )}
              {editing && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...d, marketing_goals: [...d.marketing_goals, ''] })}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-dark hover:text-brand transition-colors ml-8"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Goal
                </button>
              )}
            </div>
          </div>

          {/* Content Topics */}
          <Field label="Content Topics" value={d.content_topics} onChange={(v) => setDraft({ ...d, content_topics: v })} multiline placeholder="Topics your content should cover" />

          {/* Avoid Topics */}
          <Field label="Topics to Avoid" value={d.content_avoid_topics} onChange={(v) => setDraft({ ...d, content_avoid_topics: v })} multiline placeholder="Topics to stay away from" />

          {/* Additional Notes */}
          <Field label="Additional Notes" value={d.additional_notes} onChange={(v) => setDraft({ ...d, additional_notes: v })} multiline />

          {/* Seasonal Calendar */}
          <Field label="Seasonal Calendar" value={d.seasonal_calendar} onChange={(v) => setDraft({ ...d, seasonal_calendar: v })} multiline placeholder="Key dates, seasonal events, or busy periods for your business (e.g. Valentine's dinner rush, summer patio season)" />
        </div>
      </SectionCard>

      {/* Bottom Save/Cancel bar in edit mode */}
      {editing && (
        <div className="flex items-center justify-end gap-3 pt-2 pb-4">
          <button
            onClick={cancelEdit}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-ink-3 bg-bg-2 rounded-lg hover:bg-ink-6 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={saveEdit}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}
