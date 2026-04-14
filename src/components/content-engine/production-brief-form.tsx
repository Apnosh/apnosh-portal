'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles, Loader2, Check, X,
  Tag, ShoppingBag, PartyPopper, Snowflake, GraduationCap, Quote,
  Camera, Sun, MoreHorizontal, Image as ImageIcon, Film,
  MessageSquare, Music, Scissors, MapPin, Clock,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContentCategory =
  | 'promo' | 'product' | 'event' | 'seasonal'
  | 'educational' | 'testimonial' | 'bts' | 'brand' | 'other'

interface BriefFormData {
  // Shared
  content_category: ContentCategory | ''
  main_message: string
  call_to_action: string[]
  mood_tags: string[]
  publish_date: string
  urgency: string
  internal_note: string

  // Graphic-specific
  placement: string
  carousel_slide_count: number
  headline_text: string
  post_caption: string
  color_preference: string
  include_logo: boolean
  source_stock_photo: boolean
  avoid_colors: string
  avoid_styles: string
  designer_notes: string

  // Graphic content-type details
  offer_text: string
  promo_code: string
  offer_expiry: string
  price_display: string
  product_name: string
  product_desc: string
  product_price: string
  event_name: string
  event_date: string
  event_time: string
  event_location: string
  season_name: string
  season_message: string
  edu_topic: string
  edu_key_points: string
  testimonial_quote: string
  testimonial_name: string
  testimonial_source: string

  // Video-specific
  hook: string
  length_preference: string
  script_owner: string
  script_style: string
  voiceover_tone: string
  footage_source: string
  shoot_location: string
  shoot_date: string
  shoot_flexible: boolean
  shoot_subject: string
  shoot_who_on_camera: string
  music_owner: string
  music_feel: string
  editing_style: string
  reference_link: string
  avoid_text: string
}

const EMPTY_FORM: BriefFormData = {
  content_category: '', main_message: '', call_to_action: [], mood_tags: [],
  publish_date: '', urgency: 'standard', internal_note: '',
  placement: 'feed', carousel_slide_count: 3, headline_text: '', post_caption: '',
  color_preference: 'Use brand colors', include_logo: true, source_stock_photo: false,
  avoid_colors: '', avoid_styles: '', designer_notes: '',
  offer_text: '', promo_code: '', offer_expiry: '', price_display: '',
  product_name: '', product_desc: '', product_price: '',
  event_name: '', event_date: '', event_time: '', event_location: '',
  season_name: '', season_message: '', edu_topic: '', edu_key_points: '',
  testimonial_quote: '', testimonial_name: '', testimonial_source: '',
  hook: '', length_preference: '30-45s', script_owner: 'apnosh', script_style: 'text_overlay',
  voiceover_tone: 'casual', footage_source: 'apnosh_films',
  shoot_location: '', shoot_date: '', shoot_flexible: true, shoot_subject: '', shoot_who_on_camera: '',
  music_owner: 'apnosh_picks', music_feel: '', editing_style: '', reference_link: '',
  avoid_text: '',
}

const CATEGORIES: Array<{ id: ContentCategory; label: string; icon: typeof Tag }> = [
  { id: 'promo', label: 'Promotion', icon: Tag },
  { id: 'product', label: 'Product', icon: ShoppingBag },
  { id: 'event', label: 'Event', icon: PartyPopper },
  { id: 'seasonal', label: 'Seasonal', icon: Snowflake },
  { id: 'educational', label: 'Educational', icon: GraduationCap },
  { id: 'testimonial', label: 'Testimonial', icon: Quote },
  { id: 'bts', label: 'Behind the Scenes', icon: Camera },
  { id: 'brand', label: 'Brand', icon: Sun },
  { id: 'other', label: 'Other', icon: MoreHorizontal },
]

const CTA_OPTIONS = ['Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'Call us', 'No CTA']
const MOOD_OPTIONS = ['Bold & energetic', 'Clean & minimal', 'Warm & inviting', 'Professional', 'Playful', 'Luxury', 'Festive']
const PLACEMENT_OPTIONS = [
  { value: 'feed', label: 'Feed (1080×1350)' },
  { value: 'story', label: 'Story (1080×1920)' },
  { value: 'reel-cover', label: 'Reel Cover (1080×1920)' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'banner', label: 'Banner (820×312)' },
]

type FormSection = 'category' | 'details' | 'message' | 'creative' | 'timing'

interface ProductionBriefFormProps {
  isVideo: boolean
  conceptTitle: string
  initialData?: Partial<BriefFormData>
  onSave: (data: BriefFormData) => Promise<void>
  onAutoFill?: () => Promise<Partial<BriefFormData>>
}

export default function ProductionBriefForm({
  isVideo, conceptTitle, initialData, onSave, onAutoFill,
}: ProductionBriefFormProps) {
  const [form, setForm] = useState<BriefFormData>({ ...EMPTY_FORM, ...initialData })
  const [activeSection, setActiveSection] = useState<FormSection>('category')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [autoFilling, setAutoFilling] = useState(false)

  useEffect(() => {
    if (initialData) setForm((prev) => ({ ...prev, ...initialData }))
  }, [initialData])

  const update = (field: keyof BriefFormData, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const toggleArray = (field: 'call_to_action' | 'mood_tags', value: string) => {
    setForm((prev) => {
      const arr = prev[field] as string[]
      return { ...prev, [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAutoFill = async () => {
    if (!onAutoFill) return
    setAutoFilling(true)
    const data = await onAutoFill()
    setForm((prev) => ({ ...prev, ...data }))
    setAutoFilling(false)
  }

  const sections: Array<{ key: FormSection; label: string; icon: typeof Tag }> = isVideo
    ? [
        { key: 'category', label: 'Type', icon: Tag },
        { key: 'message', label: 'Message & Script', icon: MessageSquare },
        { key: 'creative', label: 'Filming & Music', icon: Film },
        { key: 'timing', label: 'Scheduling', icon: Clock },
      ]
    : [
        { key: 'category', label: 'Type', icon: Tag },
        { key: 'details', label: 'Details', icon: Tag },
        { key: 'message', label: 'Message & Copy', icon: MessageSquare },
        { key: 'creative', label: 'Style & Design', icon: ImageIcon },
        { key: 'timing', label: 'Scheduling', icon: Clock },
      ]

  // Completeness per section
  const getSectionStatus = (key: FormSection): 'empty' | 'partial' | 'complete' => {
    if (key === 'category') return form.content_category ? 'complete' : 'empty'
    if (key === 'message') return form.main_message ? 'complete' : 'empty'
    if (key === 'timing') return form.publish_date ? 'complete' : form.urgency ? 'partial' : 'empty'
    if (key === 'creative') return (form.mood_tags.length > 0 || (isVideo && form.footage_source)) ? 'partial' : 'empty'
    if (key === 'details') return form.content_category && hasDetailFields() ? 'complete' : 'empty'
    return 'empty'
  }

  const hasDetailFields = () => {
    const c = form.content_category
    if (c === 'promo') return !!form.offer_text
    if (c === 'product') return !!form.product_name
    if (c === 'event') return !!form.event_name
    if (c === 'seasonal') return !!form.season_name
    if (c === 'educational') return !!form.edu_topic
    if (c === 'testimonial') return !!form.testimonial_quote
    return true
  }

  const STATUS_DOTS: Record<string, string> = { empty: 'bg-ink-5', partial: 'bg-amber-400', complete: 'bg-brand' }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-6 bg-bg-2 flex-shrink-0">
        <h3 className="text-sm font-bold text-ink truncate">{conceptTitle}</h3>
        <div className="flex items-center gap-2">
          {onAutoFill && (
            <button onClick={handleAutoFill} disabled={autoFilling} className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-brand bg-brand-tint rounded-lg hover:bg-brand/10 transition-colors disabled:opacity-50">
              {autoFilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI Fill
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50">
            {saved ? <><Check className="w-3 h-3" /> Saved</> : saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-ink-6 px-2 flex-shrink-0">
        {sections.map((s) => {
          const status = getSectionStatus(s.key)
          return (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors ${
                activeSection === s.key ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[status]}`} />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Form content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Category */}
        {activeSection === 'category' && (
          <div>
            <label className="text-xs font-semibold text-ink-3 block mb-2">What type of content?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORIES.map((c) => {
                const Icon = c.icon
                const active = form.content_category === c.id
                return (
                  <button key={c.id} onClick={() => update('content_category', c.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${active ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" /> {c.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Details (graphic only, depends on category) */}
        {activeSection === 'details' && !isVideo && (
          <div className="space-y-3">
            {form.content_category === 'promo' && (
              <>
                <Field label="Offer text" value={form.offer_text} onChange={(v) => update('offer_text', v)} placeholder="e.g., 20% off all entrees" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Promo code" value={form.promo_code} onChange={(v) => update('promo_code', v)} placeholder="e.g., SPRING20" />
                  <Field label="Expiry date" value={form.offer_expiry} onChange={(v) => update('offer_expiry', v)} type="date" />
                </div>
                <Field label="Price display" value={form.price_display} onChange={(v) => update('price_display', v)} placeholder="e.g., $15.99 → $12.79" />
              </>
            )}
            {form.content_category === 'product' && (
              <>
                <Field label="Product name" value={form.product_name} onChange={(v) => update('product_name', v)} placeholder="What's the product?" />
                <Field label="Description" value={form.product_desc} onChange={(v) => update('product_desc', v)} placeholder="Brief description" multiline />
                <Field label="Price" value={form.product_price} onChange={(v) => update('product_price', v)} placeholder="e.g., $29.99" />
              </>
            )}
            {form.content_category === 'event' && (
              <>
                <Field label="Event name" value={form.event_name} onChange={(v) => update('event_name', v)} placeholder="What's the event?" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date" value={form.event_date} onChange={(v) => update('event_date', v)} type="date" />
                  <Field label="Time" value={form.event_time} onChange={(v) => update('event_time', v)} placeholder="e.g., 7 PM" />
                </div>
                <Field label="Location" value={form.event_location} onChange={(v) => update('event_location', v)} placeholder="Where?" />
              </>
            )}
            {form.content_category === 'seasonal' && (
              <>
                <Field label="Season/holiday" value={form.season_name} onChange={(v) => update('season_name', v)} placeholder="e.g., Spring, Easter" />
                <Field label="Message" value={form.season_message} onChange={(v) => update('season_message', v)} placeholder="Seasonal message" multiline />
              </>
            )}
            {form.content_category === 'educational' && (
              <>
                <Field label="Topic" value={form.edu_topic} onChange={(v) => update('edu_topic', v)} placeholder="What are you teaching?" />
                <Field label="Key points" value={form.edu_key_points} onChange={(v) => update('edu_key_points', v)} placeholder="Main takeaways" multiline />
              </>
            )}
            {form.content_category === 'testimonial' && (
              <>
                <Field label="Quote" value={form.testimonial_quote} onChange={(v) => update('testimonial_quote', v)} placeholder="The customer's words" multiline />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name" value={form.testimonial_name} onChange={(v) => update('testimonial_name', v)} placeholder="Customer name" />
                  <div>
                    <label className="text-[10px] text-ink-4 block mb-1">Source</label>
                    <select value={form.testimonial_source} onChange={(e) => update('testimonial_source', e.target.value)} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30">
                      <option value="">Select</option>
                      <option value="google">Google</option>
                      <option value="yelp">Yelp</option>
                      <option value="direct">Direct</option>
                      <option value="social">Social Media</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            {!form.content_category && <p className="text-sm text-ink-3 text-center py-8">Select a content type first</p>}
            {['bts', 'brand', 'other'].includes(form.content_category) && <p className="text-sm text-ink-3 text-center py-4">No additional details needed for this type.</p>}
          </div>
        )}

        {/* Message & Copy */}
        {activeSection === 'message' && (
          <div className="space-y-3">
            <Field label="Main message" value={form.main_message} onChange={(v) => update('main_message', v)} placeholder="What's the core message of this post?" multiline />
            {isVideo && <Field label="Hook" value={form.hook} onChange={(v) => update('hook', v)} placeholder="Opening line — first 3 seconds" />}
            {!isVideo && <Field label="Headline text" value={form.headline_text} onChange={(v) => update('headline_text', v)} placeholder="Primary text on the graphic" />}
            {!isVideo && <Field label="Caption" value={form.post_caption} onChange={(v) => update('post_caption', v)} placeholder="Full Instagram/social caption" multiline rows={4} />}

            <div>
              <label className="text-[10px] text-ink-4 block mb-1.5">Call to action</label>
              <div className="flex flex-wrap gap-1.5">
                {CTA_OPTIONS.map((cta) => (
                  <button key={cta} onClick={() => toggleArray('call_to_action', cta)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${form.call_to_action.includes(cta) ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                    {cta}
                  </button>
                ))}
              </div>
            </div>

            {isVideo && (
              <>
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1">Video length</label>
                  <div className="flex gap-2">
                    {['15-30s', '30-45s', '45-60s', '60-90s'].map((len) => (
                      <button key={len} onClick={() => update('length_preference', len)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${form.length_preference === len ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                        {len}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-ink-4 block mb-1">Script by</label>
                    <select value={form.script_owner} onChange={(e) => update('script_owner', e.target.value)} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30">
                      <option value="apnosh">Apnosh writes</option>
                      <option value="client">Client provides</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-4 block mb-1">Style</label>
                    <select value={form.script_style} onChange={(e) => update('script_style', e.target.value)} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30">
                      <option value="text_overlay">Text overlay</option>
                      <option value="voiceover">Voiceover</option>
                      <option value="both">Both</option>
                      <option value="silent">Silent</option>
                    </select>
                  </div>
                </div>
                {(form.script_style === 'voiceover' || form.script_style === 'both') && (
                  <div>
                    <label className="text-[10px] text-ink-4 block mb-1">Voiceover tone</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['professional', 'casual', 'energetic', 'funny', 'inspirational'].map((tone) => (
                        <button key={tone} onClick={() => update('voiceover_tone', tone)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border capitalize transition-colors ${form.voiceover_tone === tone ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3'}`}>
                          {tone}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Creative / Style */}
        {activeSection === 'creative' && (
          <div className="space-y-3">
            {isVideo ? (
              <>
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1">Footage source</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { value: 'apnosh_films', label: 'We film it' },
                      { value: 'client_provides', label: 'Client provides' },
                      { value: 'ugc_style', label: 'UGC style' },
                      { value: 'animation', label: 'Animation' },
                      { value: 'stock', label: 'Stock footage' },
                    ].map((src) => (
                      <button key={src.value} onClick={() => update('footage_source', src.value)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${form.footage_source === src.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3'}`}>
                        {src.label}
                      </button>
                    ))}
                  </div>
                </div>
                {form.footage_source === 'apnosh_films' && (
                  <>
                    <Field label="Shoot location" value={form.shoot_location} onChange={(v) => update('shoot_location', v)} placeholder="Where should we film?" />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Shoot date" value={form.shoot_date} onChange={(v) => update('shoot_date', v)} type="date" />
                      <div className="flex items-center gap-2 pt-5">
                        <input type="checkbox" checked={form.shoot_flexible} onChange={(e) => update('shoot_flexible', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" />
                        <span className="text-xs text-ink-2">Date is flexible</span>
                      </div>
                    </div>
                    <Field label="Who's on camera?" value={form.shoot_who_on_camera} onChange={(v) => update('shoot_who_on_camera', v)} placeholder="Names or roles" />
                    <Field label="Subject" value={form.shoot_subject} onChange={(v) => update('shoot_subject', v)} placeholder="What are we filming?" />
                  </>
                )}
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1">Music</label>
                  <div className="flex gap-2 mb-2">
                    {[{ value: 'apnosh_picks', label: 'We pick' }, { value: 'client_provides', label: 'Client provides' }, { value: 'none', label: 'No music' }].map((m) => (
                      <button key={m.value} onClick={() => update('music_owner', m.value)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${form.music_owner === m.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3'}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {form.music_owner !== 'none' && (
                    <Field label="Music feel" value={form.music_feel} onChange={(v) => update('music_feel', v)} placeholder="e.g., upbeat, chill, trending" />
                  )}
                </div>
                <Field label="Editing style" value={form.editing_style} onChange={(v) => update('editing_style', v)} placeholder="e.g., fast cuts, cinematic, minimal" />
                <Field label="Reference link" value={form.reference_link} onChange={(v) => update('reference_link', v)} placeholder="Link to inspiration video" />
              </>
            ) : (
              <>
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1">Placement</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PLACEMENT_OPTIONS.map((p) => (
                      <button key={p.value} onClick={() => update('placement', p.value)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${form.placement === p.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                {form.placement === 'carousel' && (
                  <div>
                    <label className="text-[10px] text-ink-4 block mb-1">Number of slides</label>
                    <input type="number" min={2} max={10} value={form.carousel_slide_count} onChange={(e) => update('carousel_slide_count', parseInt(e.target.value) || 3)} className="w-20 text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1.5">Mood</label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOOD_OPTIONS.map((mood) => (
                      <button key={mood} onClick={() => toggleArray('mood_tags', mood)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${form.mood_tags.includes(mood) ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'border-ink-6 text-ink-3'}`}>
                        {mood}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1">Color preference</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Use brand colors', 'Light & airy', 'Dark & bold', 'Seasonal'].map((c) => (
                      <button key={c} onClick={() => update('color_preference', c)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${form.color_preference === c ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3'}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
                    <input type="checkbox" checked={form.include_logo} onChange={(e) => update('include_logo', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" /> Include logo
                  </label>
                  <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
                    <input type="checkbox" checked={form.source_stock_photo} onChange={(e) => update('source_stock_photo', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" /> Use stock photo
                  </label>
                </div>
                <Field label="Colors to avoid" value={form.avoid_colors} onChange={(v) => update('avoid_colors', v)} placeholder="e.g., neon green, red" />
                <Field label="Styles to avoid" value={form.avoid_styles} onChange={(v) => update('avoid_styles', v)} placeholder="e.g., clip art, cartoon" />
                <Field label="Designer notes" value={form.designer_notes} onChange={(v) => update('designer_notes', v)} placeholder="Anything else for the designer" multiline />
              </>
            )}

            {/* Mood tags for video too */}
            {isVideo && (
              <div>
                <label className="text-[10px] text-ink-4 block mb-1.5">Mood</label>
                <div className="flex flex-wrap gap-1.5">
                  {MOOD_OPTIONS.map((mood) => (
                    <button key={mood} onClick={() => toggleArray('mood_tags', mood)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${form.mood_tags.includes(mood) ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'border-ink-6 text-ink-3'}`}>
                      {mood}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timing */}
        {activeSection === 'timing' && (
          <div className="space-y-3">
            <Field label="Publish date" value={form.publish_date} onChange={(v) => update('publish_date', v)} type="date" />
            <div>
              <label className="text-[10px] text-ink-4 block mb-1">Urgency</label>
              <div className="flex gap-2">
                {[
                  { value: 'flexible', label: 'Flexible', sub: "We'll fit it in" },
                  { value: 'standard', label: 'Standard', sub: '2-3 business days' },
                  { value: 'urgent', label: 'Urgent', sub: 'Hard deadline' },
                ].map((u) => (
                  <button key={u.value} onClick={() => update('urgency', u.value)} className={`flex-1 text-left px-3 py-2 rounded-lg border transition-colors ${form.urgency === u.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                    <div className="text-[11px] font-semibold">{u.label}</div>
                    <div className="text-[9px] opacity-70">{u.sub}</div>
                  </button>
                ))}
              </div>
            </div>
            <Field label="Internal notes" value={form.internal_note} onChange={(v) => update('internal_note', v)} placeholder="Notes for the team (not visible to client)" multiline />
            {isVideo && <Field label="What to avoid" value={form.avoid_text} onChange={(v) => update('avoid_text', v)} placeholder="Topics, styles, or references to avoid" multiline />}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field component
// ---------------------------------------------------------------------------

function Field({ label, value, onChange, placeholder, type, multiline, rows }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
  type?: string; multiline?: boolean; rows?: number
}) {
  return (
    <div>
      <label className="text-[10px] text-ink-4 block mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? 3} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      ) : (
        <input type={type ?? 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      )}
    </div>
  )
}
