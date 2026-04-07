'use client'

import { useState, useCallback, useRef } from 'react'
import {
  BookOpen, Sparkles, Palette, MessageCircle, Users, Swords, FileText,
  Loader2, Download, Upload, RotateCcw, MapPin, Target, Quote,
  Type, Image, Hash, Megaphone,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/supabase/hooks'
import { useBrandGuidelines } from '@/hooks/useBrandGuidelines'
import GuidelineSection from '@/components/brand-guidelines/GuidelineSection'
import ColorSwatches from '@/components/brand-guidelines/ColorSwatches'
import VoiceWordCard from '@/components/brand-guidelines/VoiceWordCard'
import UploadReviewScreen from '@/components/brand-guidelines/UploadReviewScreen'
import RevisionRequestModal from '@/components/brand-guidelines/RevisionRequestModal'
import type {
  BrandGuideline, BrandOverviewSection, VisualIdentitySection,
  VoiceAndToneSection, AudienceProfileSection,
  CompetitivePositioningSection, ContentGuidelinesSection,
} from '@/types/database'

// ── Helpers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sectionComplete(data: any): boolean {
  if (!data || typeof data !== 'object') return false
  return Object.values(data).some((v) =>
    v !== undefined && v !== null && v !== '' &&
    !(Array.isArray(v) && v.length === 0) &&
    !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)
  )
}

type EditingSection = 'brand_overview' | 'visual_identity' | 'voice_and_tone' | 'audience_profile' | 'competitive_positioning' | 'content_guidelines' | null
type UploadStep = 'idle' | 'uploading' | 'parsing' | 'reviewing' | 'saving'

// ── Page ────────────────────────────────────────────────────────────

export default function BrandGuidelinesPage() {
  const { data: business, loading: bizLoading } = useBusiness()
  const { guidelines, loading: guidelinesLoading, refetch, updateSection } = useBrandGuidelines()

  const [generating, setGenerating] = useState(false)
  const [editingSection, setEditingSection] = useState<EditingSection>(null)
  const [saving, setSaving] = useState(false)

  // Local edit drafts
  const [draftOverview, setDraftOverview] = useState<BrandOverviewSection>({})
  const [draftVisual, setDraftVisual] = useState<VisualIdentitySection>({})
  const [draftVoice, setDraftVoice] = useState<VoiceAndToneSection>({})
  const [draftAudience, setDraftAudience] = useState<AudienceProfileSection>({})
  const [draftPositioning, setDraftPositioning] = useState<CompetitivePositioningSection>({})
  const [draftContent, setDraftContent] = useState<ContentGuidelinesSection>({})

  // Upload flow state
  const [uploadStep, setUploadStep] = useState<UploadStep>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [extractedData, setExtractedData] = useState<Record<string, unknown> | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  // Revision modal state
  const [revisionOpen, setRevisionOpen] = useState(false)

  // ── Generate guidelines ───────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!business) return
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/enrich-guidelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: business.name,
          industry: business.industry,
          description: business.description,
          differentiator: business.differentiator,
          brandVoiceWords: business.brand_voice_words,
          brandTone: business.brand_tone,
          brandDoNots: business.brand_do_nots,
          brandColors: business.brand_colors,
          targetAudience: business.target_audience,
          targetAgeRange: business.target_age_range,
          targetLocation: business.target_location,
          targetProblem: business.target_problem,
          competitors: business.competitors,
          currentPlatforms: business.current_platforms,
          marketingGoals: business.marketing_goals,
          contentTopics: business.content_topics,
        }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const { guidelines: generated } = await res.json()

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .single()
      if (!biz) throw new Error('No business found')

      const row = {
        business_id: biz.id,
        version: 1,
        status: 'current' as const,
        source: 'auto' as const,
        brand_overview: generated.brand_overview || {},
        visual_identity: generated.visual_identity || {},
        voice_and_tone: generated.voice_and_tone || {},
        audience_profile: generated.audience_profile || {},
        competitive_positioning: generated.competitive_positioning || {},
        content_guidelines: generated.content_guidelines || {},
        seasonal_calendar: {},
        custom_sections: [],
        ai_generated_sections: generated.ai_generated_sections || [],
      }

      const { error } = await supabase.from('brand_guidelines').insert(row)
      if (error) throw new Error(error.message)

      refetch()
    } catch (e) {
      console.error('Generate error:', e)
    } finally {
      setGenerating(false)
    }
  }, [business, refetch])

  // ── Start editing ─────────────────────────────────────────────────

  const startEdit = (section: EditingSection) => {
    if (!guidelines || !section) return
    setEditingSection(section)
    if (section === 'brand_overview') setDraftOverview({ ...guidelines.brand_overview })
    if (section === 'visual_identity') setDraftVisual({ ...guidelines.visual_identity })
    if (section === 'voice_and_tone') setDraftVoice({ ...guidelines.voice_and_tone })
    if (section === 'audience_profile') setDraftAudience({ ...guidelines.audience_profile })
    if (section === 'competitive_positioning') setDraftPositioning({ ...guidelines.competitive_positioning })
    if (section === 'content_guidelines') setDraftContent({ ...guidelines.content_guidelines })
  }

  // ── Save section ──────────────────────────────────────────────────

  const saveSection = useCallback(async (section: EditingSection) => {
    if (!section || !guidelines) return
    setSaving(true)
    try {
      let data: Record<string, unknown> = {}
      if (section === 'brand_overview') data = draftOverview as unknown as Record<string, unknown>
      if (section === 'visual_identity') data = draftVisual as unknown as Record<string, unknown>
      if (section === 'voice_and_tone') data = draftVoice as unknown as Record<string, unknown>
      if (section === 'audience_profile') data = draftAudience as unknown as Record<string, unknown>
      if (section === 'competitive_positioning') data = draftPositioning as unknown as Record<string, unknown>
      if (section === 'content_guidelines') data = draftContent as unknown as Record<string, unknown>

      await updateSection(section, data)

      // Two-way sync for voice_and_tone
      if (section === 'voice_and_tone' && business) {
        const supabase = createClient()
        const voiceWords = (draftVoice.voice_words || []).map((w) => w.word)
        await supabase.from('businesses').update({
          brand_voice_words: voiceWords,
          brand_tone: draftVoice.tone_description || '',
          brand_do_nots: (draftVoice.do_nots || []).join(', '),
        }).eq('id', business.id)
      }

      setEditingSection(null)
    } finally {
      setSaving(false)
    }
  }, [guidelines, business, draftOverview, draftVisual, draftVoice, draftAudience, draftPositioning, draftContent, updateSection])

  // ── Loading state ─────────────────────────────────────────────────

  if (bizLoading || guidelinesLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-10 bg-ink-6 rounded-lg animate-pulse w-64" />
        <div className="h-40 bg-ink-6 rounded-xl animate-pulse" />
        <div className="h-40 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  const aiSections = guidelines?.ai_generated_sections || []

  // ── Empty state ───────────────────────────────────────────────────

  if (!guidelines) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="font-[family-name:var(--font-display)] text-xl text-ink mb-6">Brand Guidelines</h1>
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-brand-tint flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-brand-dark" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-2">
            Your Brand Guidelines
          </h2>
          <p className="text-sm text-ink-3 max-w-md mx-auto mb-8">
            Generate a complete brand guide from your business profile. It covers your voice, colors, audience, and content strategy.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-brand-dark rounded-xl hover:bg-brand-dark/90 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Your Brand Guidelines</>
            )}
          </button>
        </div>
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-[family-name:var(--font-display)] text-xl text-ink">Brand Guidelines</h1>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-3 border border-ink-6 rounded-lg hover:bg-bg-2 transition-colors">
            <Download className="w-3 h-3" /> Export as PDF
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-3 border border-ink-6 rounded-lg hover:bg-bg-2 transition-colors">
            <Upload className="w-3 h-3" /> Upload Existing
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-3 border border-ink-6 rounded-lg hover:bg-bg-2 transition-colors">
            <RotateCcw className="w-3 h-3" /> Request Revision
          </button>
        </div>
      </div>

      {/* 1. Brand Overview */}
      <GuidelineSection
        title="Brand Overview"
        icon={BookOpen}
        isComplete={sectionComplete(guidelines.brand_overview)}
        isAiGenerated={aiSections.includes('brand_overview')}
        editing={editingSection === 'brand_overview'}
        onEdit={() => startEdit('brand_overview')}
        onSave={() => saveSection('brand_overview')}
        saving={saving}
        defaultOpen
      >
        <BrandOverviewContent
          data={editingSection === 'brand_overview' ? draftOverview : guidelines.brand_overview}
          editing={editingSection === 'brand_overview'}
          onChange={setDraftOverview}
        />
      </GuidelineSection>

      {/* 2. Visual Identity */}
      <GuidelineSection
        title="Visual Identity"
        icon={Palette}
        isComplete={sectionComplete(guidelines.visual_identity)}
        isAiGenerated={aiSections.includes('visual_identity')}
        editing={editingSection === 'visual_identity'}
        onEdit={() => startEdit('visual_identity')}
        onSave={() => saveSection('visual_identity')}
        saving={saving}
      >
        <VisualIdentityContent
          data={editingSection === 'visual_identity' ? draftVisual : guidelines.visual_identity}
          editing={editingSection === 'visual_identity'}
          onChange={setDraftVisual}
        />
      </GuidelineSection>

      {/* 3. Voice & Tone */}
      <GuidelineSection
        title="Voice & Tone"
        icon={MessageCircle}
        isComplete={sectionComplete(guidelines.voice_and_tone)}
        isAiGenerated={aiSections.includes('voice_and_tone')}
        editing={editingSection === 'voice_and_tone'}
        onEdit={() => startEdit('voice_and_tone')}
        onSave={() => saveSection('voice_and_tone')}
        saving={saving}
      >
        <VoiceAndToneContent
          data={editingSection === 'voice_and_tone' ? draftVoice : guidelines.voice_and_tone}
          editing={editingSection === 'voice_and_tone'}
          onChange={setDraftVoice}
        />
      </GuidelineSection>

      {/* 4. Audience Profile */}
      <GuidelineSection
        title="Audience Profile"
        icon={Users}
        isComplete={sectionComplete(guidelines.audience_profile)}
        isAiGenerated={aiSections.includes('audience_profile')}
        editing={editingSection === 'audience_profile'}
        onEdit={() => startEdit('audience_profile')}
        onSave={() => saveSection('audience_profile')}
        saving={saving}
      >
        <AudienceProfileContent
          data={editingSection === 'audience_profile' ? draftAudience : guidelines.audience_profile}
          editing={editingSection === 'audience_profile'}
          onChange={setDraftAudience}
        />
      </GuidelineSection>

      {/* 5. Competitive Positioning */}
      <GuidelineSection
        title="Competitive Positioning"
        icon={Swords}
        isComplete={sectionComplete(guidelines.competitive_positioning)}
        isAiGenerated={aiSections.includes('competitive_positioning')}
        editing={editingSection === 'competitive_positioning'}
        onEdit={() => startEdit('competitive_positioning')}
        onSave={() => saveSection('competitive_positioning')}
        saving={saving}
      >
        <CompetitivePositioningContent
          data={editingSection === 'competitive_positioning' ? draftPositioning : guidelines.competitive_positioning}
          editing={editingSection === 'competitive_positioning'}
          onChange={setDraftPositioning}
        />
      </GuidelineSection>

      {/* 6. Content Guidelines */}
      <GuidelineSection
        title="Content Guidelines"
        icon={FileText}
        isComplete={sectionComplete(guidelines.content_guidelines)}
        isAiGenerated={aiSections.includes('content_guidelines')}
        editing={editingSection === 'content_guidelines'}
        onEdit={() => startEdit('content_guidelines')}
        onSave={() => saveSection('content_guidelines')}
        saving={saving}
      >
        <ContentGuidelinesContent
          data={editingSection === 'content_guidelines' ? draftContent : guidelines.content_guidelines}
          editing={editingSection === 'content_guidelines'}
          onChange={setDraftContent}
        />
      </GuidelineSection>
    </div>
  )
}

// ── Section Renderers ───────────────────────────────────────────────

function SectionField({ label, value, onChange, multiline, placeholder }: {
  label: string; value: string; onChange?: (v: string) => void; multiline?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">{label}</label>
      {onChange ? (
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
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="mt-1 w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        )
      ) : (
        <p className="text-sm text-ink-2 mt-1">{value || <span className="italic text-ink-4">Not set</span>}</p>
      )}
    </div>
  )
}

function ListDisplay({ items, label }: { items: string[]; label: string }) {
  if (!items || items.length === 0) return (
    <div>
      <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">{label}</label>
      <p className="text-sm text-ink-4 italic mt-1">Not set</p>
    </div>
  )
  return (
    <div>
      <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">{label}</label>
      <ul className="mt-1 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-ink-2 flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-dark/40 mt-1.5 flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EditableList({ items, label, onChange, placeholder }: {
  items: string[]; label: string; onChange: (items: string[]) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">{label}</label>
      <div className="mt-1 space-y-1.5">
        {items.map((item, i) => (
          <input
            key={i}
            value={item}
            onChange={(e) => {
              const next = [...items]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder={placeholder}
            className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="text-xs text-brand-dark hover:underline"
        >
          + Add item
        </button>
      </div>
    </div>
  )
}

// ── Brand Overview ──────────────────────────────────────────────────

function BrandOverviewContent({ data, editing, onChange }: {
  data: BrandOverviewSection; editing: boolean; onChange: (d: BrandOverviewSection) => void
}) {
  return (
    <div className="space-y-4">
      <SectionField label="Mission" value={data.mission || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, mission: v }) : undefined}
        placeholder="Your brand's mission statement" />
      <SectionField label="Brand Story" value={data.story || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, story: v }) : undefined}
        placeholder="The story behind your brand" />
      <SectionField label="What We Do" value={data.what_we_do || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, what_we_do: v }) : undefined}
        placeholder="A clear description of what your business does" />
      <SectionField label="Tagline" value={data.tagline || ''}
        onChange={editing ? (v) => onChange({ ...data, tagline: v }) : undefined}
        placeholder="Your memorable tagline" />
    </div>
  )
}

// ── Visual Identity ─────────────────────────────────────────────────

function VisualIdentityContent({ data, editing, onChange }: {
  data: VisualIdentitySection; editing: boolean; onChange: (d: VisualIdentitySection) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider mb-2 block">Brand Colors</label>
        <ColorSwatches
          primary={data.primary_color || ''}
          secondary={data.secondary_color || ''}
          accents={data.accent_colors || []}
          editable={editing}
          onChange={editing ? (colors) => onChange({
            ...data,
            primary_color: colors.primary,
            secondary_color: colors.secondary,
            accent_colors: colors.accents,
          }) : undefined}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SectionField label="Primary Font" value={data.fonts?.primary || ''}
          onChange={editing ? (v) => onChange({ ...data, fonts: { ...data.fonts, primary: v } }) : undefined}
          placeholder="e.g. Montserrat" />
        <SectionField label="Secondary Font" value={data.fonts?.secondary || ''}
          onChange={editing ? (v) => onChange({ ...data, fonts: { ...data.fonts, secondary: v } }) : undefined}
          placeholder="e.g. Playfair Display" />
        <SectionField label="Body Font" value={data.fonts?.body || ''}
          onChange={editing ? (v) => onChange({ ...data, fonts: { ...data.fonts, body: v } }) : undefined}
          placeholder="e.g. Inter" />
      </div>
      <SectionField label="Logo Usage Notes" value={data.logo_usage_notes || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, logo_usage_notes: v }) : undefined}
        placeholder="Rules for how the logo should be used" />
      <SectionField label="Imagery Style" value={data.imagery_style || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, imagery_style: v }) : undefined}
        placeholder="The visual style that fits your brand" />
    </div>
  )
}

// ── Voice & Tone ────────────────────────────────────────────────────

function VoiceAndToneContent({ data, editing, onChange }: {
  data: VoiceAndToneSection; editing: boolean; onChange: (d: VoiceAndToneSection) => void
}) {
  const words = data.voice_words || []

  return (
    <div className="space-y-5">
      <div>
        <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider mb-2 block">Voice Words</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {words.map((w, i) => (
            <VoiceWordCard
              key={i}
              word={w.word}
              description={w.description}
              examples={w.examples}
              editable={editing}
              onChange={editing ? (updated) => {
                const next = [...words]
                next[i] = updated
                onChange({ ...data, voice_words: next })
              } : undefined}
            />
          ))}
        </div>
      </div>
      <SectionField label="Tone Description" value={data.tone_description || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, tone_description: v }) : undefined}
        placeholder="How your brand sounds" />
      {editing ? (
        <>
          <EditableList items={data.sample_phrases || []} label="Sample Phrases"
            onChange={(v) => onChange({ ...data, sample_phrases: v })} placeholder="On-brand phrase" />
          <EditableList items={data.sample_ctas || []} label="Sample CTAs"
            onChange={(v) => onChange({ ...data, sample_ctas: v })} placeholder="Call to action" />
          <EditableList items={data.do_nots || []} label="Do Nots"
            onChange={(v) => onChange({ ...data, do_nots: v })} placeholder="Thing to avoid" />
        </>
      ) : (
        <>
          <ListDisplay items={data.sample_phrases || []} label="Sample Phrases" />
          <ListDisplay items={data.sample_ctas || []} label="Sample CTAs" />
          <ListDisplay items={data.do_nots || []} label="Do Nots" />
        </>
      )}
    </div>
  )
}

// ── Audience Profile ────────────────────────────────────────────────

function AudienceProfileContent({ data, editing, onChange }: {
  data: AudienceProfileSection; editing: boolean; onChange: (d: AudienceProfileSection) => void
}) {
  return (
    <div className="space-y-4">
      <SectionField label="Ideal Customer Persona" value={data.persona || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, persona: v }) : undefined}
        placeholder="Describe your ideal customer" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SectionField label="Age Range" value={data.age_range || ''}
          onChange={editing ? (v) => onChange({ ...data, age_range: v }) : undefined}
          placeholder="e.g. 25-45" />
        <SectionField label="Location" value={data.location || ''}
          onChange={editing ? (v) => onChange({ ...data, location: v }) : undefined}
          placeholder="e.g. Austin, TX metro" />
      </div>
      {editing ? (
        <>
          <EditableList items={data.pain_points || []} label="Pain Points"
            onChange={(v) => onChange({ ...data, pain_points: v })} placeholder="Customer pain point" />
          <EditableList items={data.motivations || []} label="Motivations"
            onChange={(v) => onChange({ ...data, motivations: v })} placeholder="What motivates them" />
        </>
      ) : (
        <>
          <ListDisplay items={data.pain_points || []} label="Pain Points" />
          <ListDisplay items={data.motivations || []} label="Motivations" />
        </>
      )}
      <SectionField label="Where They Hang Out" value={data.where_they_hang_out || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, where_they_hang_out: v }) : undefined}
        placeholder="Where this audience spends time" />
    </div>
  )
}

// ── Competitive Positioning ─────────────────────────────────────────

function CompetitivePositioningContent({ data, editing, onChange }: {
  data: CompetitivePositioningSection; editing: boolean; onChange: (d: CompetitivePositioningSection) => void
}) {
  return (
    <div className="space-y-4">
      <SectionField label="Positioning Statement" value={data.positioning_statement || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, positioning_statement: v }) : undefined}
        placeholder="How you position yourself in the market" />
      {editing ? (
        <EditableList items={data.differentiators || []} label="Differentiators"
          onChange={(v) => onChange({ ...data, differentiators: v })} placeholder="What makes you different" />
      ) : (
        <ListDisplay items={data.differentiators || []} label="Differentiators" />
      )}
      <SectionField label="Competitive Landscape" value={data.competitor_awareness || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, competitor_awareness: v }) : undefined}
        placeholder="Brief overview of the competitive landscape" />
      <SectionField label="Unique Value" value={data.unique_value || ''} multiline
        onChange={editing ? (v) => onChange({ ...data, unique_value: v }) : undefined}
        placeholder="Your unique value proposition" />
    </div>
  )
}

// ── Content Guidelines ──────────────────────────────────────────────

function ContentGuidelinesContent({ data, editing, onChange }: {
  data: ContentGuidelinesSection; editing: boolean; onChange: (d: ContentGuidelinesSection) => void
}) {
  return (
    <div className="space-y-4">
      {editing ? (
        <>
          <EditableList items={data.topics || []} label="Topics to Cover"
            onChange={(v) => onChange({ ...data, topics: v })} placeholder="Content topic" />
          <EditableList items={data.avoid_topics || []} label="Topics to Avoid"
            onChange={(v) => onChange({ ...data, avoid_topics: v })} placeholder="Topic to avoid" />
        </>
      ) : (
        <>
          <ListDisplay items={data.topics || []} label="Topics to Cover" />
          <ListDisplay items={data.avoid_topics || []} label="Topics to Avoid" />
        </>
      )}
      <SectionField label="Posting Frequency" value={data.posting_frequency || ''}
        onChange={editing ? (v) => onChange({ ...data, posting_frequency: v }) : undefined}
        placeholder="e.g. 3-4 times per week" />
      {editing ? (
        <>
          <EditableList items={data.best_platforms || []} label="Best Platforms"
            onChange={(v) => onChange({ ...data, best_platforms: v })} placeholder="Platform" />
          <EditableList items={data.content_pillars || []} label="Content Pillars"
            onChange={(v) => onChange({ ...data, content_pillars: v })} placeholder="Content pillar" />
        </>
      ) : (
        <>
          <ListDisplay items={data.best_platforms || []} label="Best Platforms" />
          <ListDisplay items={data.content_pillars || []} label="Content Pillars" />
        </>
      )}
    </div>
  )
}
