'use client'

import { useState } from 'react'
import {
  Pencil, Save, X, Building2, Palette, Target, Swords, Megaphone, Goal,
  FolderOpen, Globe, Phone, MapPin, Check, Upload, FileImage, FileVideo,
  FileText, Camera, Video, Mail, Search,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────

interface BusinessProfile {
  name: string
  industry: string
  description: string
  website: string
  phone: string
  locations: string[]
  brandVoice: string[]
  tone: string
  doNots: string[]
  colors: { name: string; hex: string }[]
  fonts: string[]
  audienceDescription: string
  ageRange: string
  audienceLocation: string
  problemSolved: string
  competitors: { name: string; url: string }[]
  platforms: { name: string; icon: typeof Camera }[]
  postingFrequency: string
  googleBusiness: boolean
  budget: string
  goals: { label: string; checked: boolean }[]
  contentTopics: string[]
  avoidTopics: string[]
  assets: { name: string; type: 'image' | 'video' | 'document'; size: string }[]
}

// ── Mock Data ────────────────────────────────────────────────────────

const initialProfile: BusinessProfile = {
  name: 'Casa Priya',
  industry: 'Restaurant & Hospitality',
  description: 'A vibrant Indian-fusion restaurant in downtown Portland, blending traditional recipes with modern Pacific Northwest ingredients. Known for our seasonal tasting menus and craft cocktail pairings.',
  website: 'https://casapriya.com',
  phone: '(503) 555-0142',
  locations: ['123 NW Burnside St, Portland, OR 97209', '456 SE Division St, Portland, OR 97202'],
  brandVoice: ['Warm', 'Sophisticated', 'Inviting'],
  tone: 'Friendly and approachable, but with a refined edge. We speak like a knowledgeable friend who loves great food and wants to share the experience.',
  doNots: ['Don\'t use slang or overly casual language', 'Avoid generic food descriptions', 'Never mention competitor restaurants by name'],
  colors: [
    { name: 'Saffron Gold', hex: '#D4A843' },
    { name: 'Deep Plum', hex: '#5B2C6F' },
    { name: 'Cream', hex: '#FFF8E7' },
    { name: 'Charcoal', hex: '#2C2C2C' },
  ],
  fonts: ['Playfair Display', 'Inter'],
  audienceDescription: 'Urban professionals and food enthusiasts aged 28-50 who value unique dining experiences, quality ingredients, and cultural exploration through food.',
  ageRange: '28-50',
  audienceLocation: 'Portland metro area, Pacific Northwest',
  problemSolved: 'Providing an elevated, culturally rich dining experience that goes beyond typical Indian restaurants, offering fusion dishes that feel both familiar and adventurous.',
  competitors: [
    { name: 'Bollywood Theater', url: 'https://bollywoodtheaterpdx.com' },
    { name: 'Eem', url: 'https://eempdx.com' },
    { name: 'Langbaan', url: 'https://langbaanpdx.com' },
  ],
  platforms: [
    { name: 'Instagram', icon: Camera },
    { name: 'Facebook', icon: Globe },
    { name: 'YouTube', icon: Video },
    { name: 'Email', icon: Mail },
    { name: 'Google', icon: Search },
  ],
  postingFrequency: '4-5 posts/week on Instagram, 3/week on Facebook, 1 video/month on YouTube',
  googleBusiness: true,
  budget: '$2,500/month',
  goals: [
    { label: 'Increase foot traffic by 20%', checked: true },
    { label: 'Grow Instagram to 10K followers', checked: true },
    { label: 'Launch email newsletter', checked: false },
    { label: 'Improve Google Maps ranking to top 3', checked: true },
    { label: 'Build brand awareness in SE Portland', checked: false },
  ],
  contentTopics: ['Seasonal menus & specials', 'Behind-the-scenes kitchen stories', 'Chef spotlights', 'Cultural food history', 'Customer testimonials'],
  avoidTopics: ['Price comparisons', 'Negative food industry news', 'Political topics'],
  assets: [
    { name: 'Primary Logo (Full Color)', type: 'image', size: '2.4 MB' },
    { name: 'Logo Mark (Icon Only)', type: 'image', size: '840 KB' },
    { name: 'Hero Photo - Interior', type: 'image', size: '5.1 MB' },
    { name: 'Menu Photography Set', type: 'image', size: '18.2 MB' },
    { name: 'Brand Intro Video', type: 'video', size: '42.7 MB' },
    { name: 'Brand Guidelines PDF', type: 'document', size: '3.8 MB' },
  ],
}

// ── Helpers ──────────────────────────────────────────────────────────

const assetIcons: Record<string, typeof FileImage> = {
  image: FileImage,
  video: FileVideo,
  document: FileText,
}

const assetColors: Record<string, string> = {
  image: 'bg-blue-50 text-blue-600',
  video: 'bg-purple-50 text-purple-600',
  document: 'bg-amber-50 text-amber-600',
}

// ── Component ────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [editing, setEditing] = useState(false)
  const [profile, setProfile] = useState<BusinessProfile>(initialProfile)
  const [draft, setDraft] = useState<BusinessProfile>(initialProfile)

  const startEdit = () => {
    setDraft({ ...profile })
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft({ ...profile })
    setEditing(false)
  }

  const saveEdit = () => {
    setProfile({ ...draft })
    setEditing(false)
  }

  const SectionCard = ({ title, icon: Icon, children }: { title: string; icon: typeof Building2; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-ink-6 bg-bg-2">
        <Icon className="w-4 h-4 text-ink-3" />
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )

  const Field = ({ label, value, field, multiline }: { label: string; value: string; field?: keyof BusinessProfile; multiline?: boolean }) => (
    <div>
      <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">{label}</label>
      {editing && field ? (
        multiline ? (
          <textarea
            value={draft[field] as string}
            onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
            rows={3}
            className="mt-1 w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
          />
        ) : (
          <input
            type="text"
            value={draft[field] as string}
            onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
            className="mt-1 w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        )
      ) : (
        <p className="mt-1 text-sm text-ink-2 leading-relaxed">{value}</p>
      )}
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Business Profile</h1>
          <p className="text-ink-3 text-sm mt-1">Last updated March 15, 2026</p>
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
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink-3 bg-bg-2 rounded-lg hover:bg-ink-6 transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Business Info */}
      <SectionCard title="Business Information" icon={Building2}>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Business Name" value={profile.name} field="name" />
          <Field label="Industry" value={profile.industry} field="industry" />
          <div className="sm:col-span-2">
            <Field label="Description" value={profile.description} field="description" multiline />
          </div>
          <Field label="Website" value={profile.website} field="website" />
          <Field label="Phone" value={profile.phone} field="phone" />
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Locations</label>
            <div className="mt-1 space-y-2">
              {(editing ? draft : profile).locations.map((loc, i) => (
                <div key={i} className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-ink-4 mt-0.5 flex-shrink-0" />
                  {editing ? (
                    <input
                      type="text"
                      value={draft.locations[i]}
                      onChange={(e) => {
                        const locs = [...draft.locations]
                        locs[i] = e.target.value
                        setDraft({ ...draft, locations: locs })
                      }}
                      className="flex-1 text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    />
                  ) : (
                    <p className="text-sm text-ink-2">{loc}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Brand Identity */}
      <SectionCard title="Brand Identity" icon={Palette}>
        <div className="space-y-5">
          {/* Voice Words */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Brand Voice</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(editing ? draft : profile).brandVoice.map((word, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-tint text-brand-dark text-sm font-medium rounded-full">
                  {word}
                </span>
              ))}
            </div>
          </div>

          {/* Tone */}
          <Field label="Tone of Voice" value={profile.tone} field="tone" multiline />

          {/* Do-Nots */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Do-Nots</label>
            <ul className="mt-2 space-y-1.5">
              {(editing ? draft : profile).doNots.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
                  <X className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Colors */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Brand Colors</label>
            <div className="flex flex-wrap gap-3 mt-2">
              {(editing ? draft : profile).colors.map((color, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg border border-ink-6 shadow-sm" style={{ backgroundColor: color.hex }} />
                  <div>
                    <p className="text-xs font-medium text-ink">{color.name}</p>
                    <p className="text-[11px] text-ink-4">{color.hex}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fonts */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Fonts</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(editing ? draft : profile).fonts.map((font, i) => (
                <span key={i} className="px-3 py-1.5 bg-ink-6 text-ink-2 text-sm font-medium rounded-lg">{font}</span>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Target Audience */}
      <SectionCard title="Target Audience" icon={Target}>
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <Field label="Audience Description" value={profile.audienceDescription} field="audienceDescription" multiline />
          </div>
          <Field label="Age Range" value={profile.ageRange} field="ageRange" />
          <Field label="Location" value={profile.audienceLocation} field="audienceLocation" />
          <div className="sm:col-span-2">
            <Field label="Problem Your Business Solves" value={profile.problemSolved} field="problemSolved" multiline />
          </div>
        </div>
      </SectionCard>

      {/* Competitors */}
      <SectionCard title="Competitors" icon={Swords}>
        <div className="space-y-3">
          {(editing ? draft : profile).competitors.map((comp, i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-bg-2 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-ink-6 flex items-center justify-center flex-shrink-0">
                <Globe className="w-4 h-4 text-ink-3" />
              </div>
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={draft.competitors[i].name}
                      onChange={(e) => {
                        const comps = [...draft.competitors]
                        comps[i] = { ...comps[i], name: e.target.value }
                        setDraft({ ...draft, competitors: comps })
                      }}
                      className="flex-1 text-sm text-ink border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      placeholder="Name"
                    />
                    <input
                      type="text"
                      value={draft.competitors[i].url}
                      onChange={(e) => {
                        const comps = [...draft.competitors]
                        comps[i] = { ...comps[i], url: e.target.value }
                        setDraft({ ...draft, competitors: comps })
                      }}
                      className="flex-1 text-sm text-ink border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      placeholder="URL"
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-ink">{comp.name}</p>
                    <p className="text-xs text-ink-4 truncate">{comp.url}</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Current Marketing */}
      <SectionCard title="Current Marketing" icon={Megaphone}>
        <div className="space-y-5">
          {/* Platforms */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Active Platforms</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(editing ? draft : profile).platforms.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg-2 border border-ink-6 text-ink-2 text-sm font-medium rounded-lg">
                  <p.icon className="w-3.5 h-3.5" />
                  {p.name}
                </span>
              ))}
            </div>
          </div>

          <Field label="Posting Frequency" value={profile.postingFrequency} field="postingFrequency" />

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Google Business Profile</label>
              <div className="flex items-center gap-2 mt-1.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${(editing ? draft : profile).googleBusiness ? 'bg-green-100' : 'bg-ink-6'}`}>
                  <Check className={`w-3 h-3 ${(editing ? draft : profile).googleBusiness ? 'text-green-600' : 'text-ink-4'}`} />
                </div>
                <span className="text-sm text-ink-2">{(editing ? draft : profile).googleBusiness ? 'Active & Claimed' : 'Not Set Up'}</span>
              </div>
            </div>
            <Field label="Monthly Marketing Budget" value={profile.budget} field="budget" />
          </div>
        </div>
      </SectionCard>

      {/* Goals */}
      <SectionCard title="Goals & Content" icon={Goal}>
        <div className="space-y-5">
          {/* Marketing Goals */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Marketing Goals</label>
            <div className="mt-2 space-y-2">
              {(editing ? draft : profile).goals.map((goal, i) => (
                <label key={i} className="flex items-center gap-3 group cursor-pointer">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    goal.checked
                      ? 'bg-brand border-brand'
                      : 'border-ink-5 bg-white'
                  }`}>
                    {goal.checked && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className={`text-sm ${goal.checked ? 'text-ink' : 'text-ink-3'}`}>{goal.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Content Topics */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Content Topics</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(editing ? draft : profile).contentTopics.map((topic, i) => (
                <span key={i} className="px-3 py-1.5 bg-brand-tint text-brand-dark text-xs font-medium rounded-full">{topic}</span>
              ))}
            </div>
          </div>

          {/* Avoid Topics */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Topics to Avoid</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(editing ? draft : profile).avoidTopics.map((topic, i) => (
                <span key={i} className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-full">{topic}</span>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Brand Assets */}
      <SectionCard title="Brand Assets" icon={FolderOpen}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(editing ? draft : profile).assets.map((asset, i) => {
            const Icon = assetIcons[asset.type]
            const colorClass = assetColors[asset.type]
            return (
              <div key={i} className="flex flex-col items-center p-4 bg-bg-2 rounded-xl border border-ink-6 hover:shadow-sm transition-shadow text-center">
                <div className={`w-12 h-12 rounded-xl ${colorClass} flex items-center justify-center mb-3`}>
                  <Icon className="w-6 h-6" />
                </div>
                <p className="text-xs font-medium text-ink leading-tight">{asset.name}</p>
                <p className="text-[11px] text-ink-4 mt-1">{asset.size}</p>
              </div>
            )
          })}

          {/* Upload button */}
          {editing && (
            <button className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-ink-5 rounded-xl text-ink-4 hover:border-brand hover:text-brand-dark transition-colors">
              <Upload className="w-6 h-6 mb-2" />
              <span className="text-xs font-medium">Upload Asset</span>
            </button>
          )}
        </div>
      </SectionCard>

      {/* Bottom Save/Cancel bar in edit mode */}
      {editing && (
        <div className="flex items-center justify-end gap-3 pt-2 pb-4">
          <button
            onClick={cancelEdit}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-ink-3 bg-bg-2 rounded-lg hover:bg-ink-6 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={saveEdit}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      )}
    </div>
  )
}
