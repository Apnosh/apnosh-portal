'use client'

/**
 * Renders the structured creative brief from a graphic_requests row.
 *
 * Used by both the client portal request detail page and the admin queue tab.
 *
 * IMPORTANT: the `internal_note` field is gated behind `isAdmin` — never
 * exposed to the client side regardless of how the component is mounted.
 */

import { useState, useEffect } from 'react'
import {
  Tag, ShoppingBag, PartyPopper, Snowflake, GraduationCap, Quote,
  Camera, Sun, MoreHorizontal, ImageIcon, Calendar, AlertTriangle,
  Palette, FileText, Sparkles, Lock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { GraphicRequest, GraphicContentType } from '@/types/database'

const TYPE_META: Record<GraphicContentType, { label: string; icon: typeof Tag }> = {
  promo:       { label: 'Promotion / offer',      icon: Tag },
  product:     { label: 'New product or item',    icon: ShoppingBag },
  event:       { label: 'Event or announcement',  icon: PartyPopper },
  seasonal:    { label: 'Seasonal / holiday',     icon: Snowflake },
  educational: { label: 'Educational / tip',      icon: GraduationCap },
  testimonial: { label: 'Testimonial / review',   icon: Quote },
  bts:         { label: 'Behind the scenes',      icon: Camera },
  brand:       { label: 'Brand awareness',        icon: Sun },
  other:       { label: 'Something else',         icon: MoreHorizontal },
}

const PLACEMENT_LABELS: Record<string, string> = {
  feed: 'Instagram feed',
  story: 'Story',
  'reel-cover': 'Reel cover',
  carousel: 'Carousel',
  banner: 'Profile banner',
  custom: 'Custom size',
}

const URGENCY_STYLES: Record<string, { label: string; color: string }> = {
  flexible: { label: 'Flexible',          color: 'bg-bg-2 text-ink-3' },
  standard: { label: 'Standard',          color: 'bg-blue-50 text-blue-700' },
  urgent:   { label: 'Urgent — deadline', color: 'bg-red-50 text-red-700' },
}

interface Props {
  contentQueueId: string
  isAdmin?: boolean
}

export function GraphicBriefView({ contentQueueId, isAdmin = false }: Props) {
  const supabase = createClient()
  const [brief, setBrief] = useState<GraphicRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabase
        .from('graphic_requests')
        .select('*')
        .eq('content_queue_id', contentQueueId)
        .maybeSingle()
      if (!active) return
      if (data) setBrief(data as GraphicRequest)
      else setNotFound(true)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [contentQueueId, supabase])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-5 animate-pulse">
        <div className="h-4 w-32 bg-ink-6 rounded mb-3" />
        <div className="h-3 w-full bg-ink-6 rounded mb-2" />
        <div className="h-3 w-2/3 bg-ink-6 rounded" />
      </div>
    )
  }

  if (notFound || !brief) {
    // Not a structured graphic request — likely a legacy quick request
    return null
  }

  const meta = TYPE_META[brief.content_type] || TYPE_META.other
  const TypeIcon = meta.icon

  // Build dimension string for placement
  let placementSub = ''
  if (brief.placement === 'feed') placementSub = '1080 × 1350 px'
  else if (brief.placement === 'story' || brief.placement === 'reel-cover') placementSub = '1080 × 1920 px'
  else if (brief.placement === 'banner') placementSub = '820 × 312 px'
  else if (brief.placement === 'carousel') placementSub = `${brief.carousel_slide_count ?? '?'} slides`
  else if (brief.placement === 'custom') {
    if (brief.custom_dim_mode === 'ratio' && brief.custom_ratio) {
      placementSub = `Ratio ${brief.custom_ratio}`
    } else if (brief.custom_width && brief.custom_height) {
      placementSub = `${brief.custom_width} × ${brief.custom_height} ${brief.custom_unit ?? 'px'}`
      if (brief.custom_dpi) placementSub += ` @ ${brief.custom_dpi} DPI`
    }
  }

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-dark" />
        <h2 className="text-sm font-semibold text-ink">Creative Brief</h2>
      </div>

      {/* What & where */}
      <Section title="What & where" icon={ImageIcon}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand-tint flex items-center justify-center">
            <TypeIcon className="w-4 h-4 text-brand-dark" />
          </div>
          <div>
            <div className="text-[10px] font-medium text-ink-4 uppercase tracking-wide">Content type</div>
            <div className="text-sm font-medium text-ink">{meta.label}</div>
          </div>
        </div>

        <Grid>
          {brief.placement && (
            <Field label="Placement" value={`${PLACEMENT_LABELS[brief.placement] ?? brief.placement}${placementSub ? ` · ${placementSub}` : ''}`} />
          )}
          {brief.publish_date && (
            <Field label="Publish date" value={formatDate(brief.publish_date)} />
          )}
          {brief.urgency && (
            <div>
              <div className="text-[10px] font-medium text-ink-4 uppercase tracking-wide mb-1">Urgency</div>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${URGENCY_STYLES[brief.urgency]?.color || 'bg-bg-2 text-ink-3'}`}>
                {URGENCY_STYLES[brief.urgency]?.label || brief.urgency}
              </span>
            </div>
          )}
        </Grid>
      </Section>

      {/* Content details (per type) */}
      <Section title="Content details" icon={FileText}>
        <Grid>
          <DetailFields brief={brief} />
        </Grid>

        {(brief.main_message || brief.headline_text || (brief.call_to_action && brief.call_to_action.length > 0)) && (
          <div className="mt-4 pt-4 border-t border-ink-6">
            <Grid>
              {brief.main_message && <Field label="Main message" value={brief.main_message} fullRow />}
              {brief.headline_text && <Field label="Headline" value={brief.headline_text} />}
              {brief.call_to_action && brief.call_to_action.length > 0 && (
                <Field label="Call to action" value={brief.call_to_action.join(' · ')} />
              )}
            </Grid>
          </div>
        )}
      </Section>

      {/* Visuals */}
      <Section title="Visuals" icon={Camera}>
        {brief.uploaded_asset_urls && brief.uploaded_asset_urls.length > 0 ? (
          <div>
            <div className="text-[10px] font-medium text-ink-4 uppercase tracking-wide mb-2">Uploaded photos</div>
            <div className="flex flex-wrap gap-2">
              {brief.uploaded_asset_urls.map(url => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-ink-6 hover:border-brand/50 transition-colors" />
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-4 italic">No photos uploaded</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Pill label={brief.source_stock_photo ? 'Source stock photo: Yes' : 'Source stock photo: No'} active={brief.source_stock_photo} />
          <Pill label={brief.include_logo ? 'Include logo: Yes' : 'Include logo: No'} active={brief.include_logo} />
        </div>
      </Section>

      {/* Style */}
      {((brief.mood_tags && brief.mood_tags.length > 0) || brief.color_preference || brief.reference_link || (brief.reference_asset_urls && brief.reference_asset_urls.length > 0)) && (
        <Section title="Look & feel" icon={Palette}>
          {brief.mood_tags && brief.mood_tags.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-medium text-ink-4 uppercase tracking-wide mb-1.5">Vibe</div>
              <div className="flex flex-wrap gap-1.5">
                {brief.mood_tags.map(t => (
                  <span key={t} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-tint text-brand-dark">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Grid>
            {brief.color_preference && <Field label="Colors" value={brief.color_preference} />}
            {brief.reference_link && (
              <div>
                <div className="text-[10px] font-medium text-ink-4 uppercase tracking-wide mb-1">Reference link</div>
                <a href={brief.reference_link} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:text-brand-dark underline break-all">
                  {brief.reference_link}
                </a>
              </div>
            )}
          </Grid>
          {brief.reference_asset_urls && brief.reference_asset_urls.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-medium text-ink-4 uppercase tracking-wide mb-2">Reference images</div>
              <div className="flex flex-wrap gap-2">
                {brief.reference_asset_urls.map(url => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-ink-6 hover:border-brand/50 transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Avoid */}
      {(brief.avoid_colors || brief.avoid_styles || brief.designer_notes) && (
        <Section title="Avoid & notes" icon={AlertTriangle}>
          <Grid>
            {brief.avoid_colors && <Field label="Avoid colors" value={brief.avoid_colors} />}
            {brief.avoid_styles && <Field label="Avoid styles" value={brief.avoid_styles} />}
            {brief.designer_notes && <Field label="Designer notes" value={brief.designer_notes} fullRow />}
          </Grid>
        </Section>
      )}

      {/* Internal note — admin only */}
      {isAdmin && brief.internal_note && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            <h3 className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">
              Internal — from client to account manager
            </h3>
          </div>
          <p className="text-[10px] text-amber-700 mb-2 italic">Not visible to the designer or other clients.</p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{brief.internal_note}</p>
        </div>
      )}
    </div>
  )
}

/* ─── Helpers ─────────────────────────────────────────────── */

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Tag; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded bg-bg-2 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-ink-3" />
        </div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
}

function Field({
  label, value, fullRow,
}: { label: string; value: string | null | undefined; fullRow?: boolean }) {
  if (!value) return null
  return (
    <div className={fullRow ? 'sm:col-span-2' : ''}>
      <div className="text-[10px] font-medium text-ink-4 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-ink-2 whitespace-pre-wrap">{value}</div>
    </div>
  )
}

function Pill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
      active ? 'bg-emerald-50 text-emerald-700' : 'bg-bg-2 text-ink-3'
    }`}>
      {label}
    </span>
  )
}

function DetailFields({ brief }: { brief: GraphicRequest }) {
  switch (brief.content_type) {
    case 'promo':
      return (
        <>
          <Field label="Offer" value={brief.offer_text} fullRow />
          <Field label="Promo code" value={brief.promo_code} />
          <Field label="Expires" value={brief.offer_expiry} />
          <Field label="Price" value={brief.price_display} />
        </>
      )
    case 'product':
      return (
        <>
          <Field label="Product" value={brief.product_name} />
          <Field label="Status" value={brief.product_status} />
          <Field label="Description" value={brief.product_desc} fullRow />
          <Field label="Price" value={brief.product_price} />
        </>
      )
    case 'event':
      return (
        <>
          <Field label="Event" value={brief.event_name} fullRow />
          <Field label="Date" value={brief.event_date} />
          <Field label="Time" value={brief.event_time} />
          <Field label="Location" value={brief.event_location} />
          <Field label="Tickets / RSVP" value={brief.event_ticket_info} />
        </>
      )
    case 'seasonal':
      return (
        <>
          <Field label="Occasion" value={brief.season_name} />
          <Field label="Offer" value={brief.season_offer} />
          <Field label="Message" value={brief.season_message} fullRow />
        </>
      )
    case 'educational':
      return (
        <>
          <Field label="Topic" value={brief.edu_topic} fullRow />
          <Field label="Key points" value={brief.edu_key_points} fullRow />
        </>
      )
    case 'testimonial':
      return (
        <>
          <Field label="Quote" value={brief.testimonial_quote} fullRow />
          <Field label="Customer" value={brief.testimonial_name} />
          <Field label="Source" value={brief.testimonial_source} />
        </>
      )
    default:
      return null
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}
