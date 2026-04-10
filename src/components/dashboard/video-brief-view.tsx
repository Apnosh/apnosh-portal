'use client'

/**
 * Renders the structured creative brief from a video_requests row.
 * Used by both the client portal request detail and the admin queue tab.
 *
 * The `internal_note` field is gated behind `isAdmin` — never exposed to
 * the client side.
 */

import { useState, useEffect } from 'react'
import {
  Tag, ShoppingBag, PartyPopper, Snowflake, GraduationCap, Quote,
  Camera, Sun, MoreHorizontal, Film, Mic, Music, Video,
  AlertTriangle, Palette, Sparkles, Lock, Calendar, MessageCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { VideoRequest, VideoContentType } from '@/types/database'

const TYPE_META: Record<VideoContentType, { label: string; icon: typeof Tag }> = {
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

const LENGTH_LABELS: Record<string, string> = {
  under_15: 'Under 15s',
  '15_30': '15–30s',
  '30_60': '30–60s',
  '60_90': '60–90s',
  apnosh_decides: 'Apnosh decides',
}

const SCRIPT_OWNER_LABELS: Record<string, string> = {
  apnosh: 'Apnosh writes it',
  client: 'Client writes it',
  collab: 'Client drafts, Apnosh refines',
}

const SCRIPT_STYLE_LABELS: Record<string, string> = {
  voiceover: 'Voiceover',
  on_screen: 'On-screen text',
  both: 'Voiceover + on-screen text',
  apnosh_decides: 'Apnosh decides',
}

const VOICEOVER_TONE_LABELS: Record<string, string> = {
  energetic: 'Energetic & hyped',
  calm: 'Calm & conversational',
  professional: 'Professional & authoritative',
  fun: 'Fun & playful',
  apnosh_decides: 'Apnosh decides',
}

const FOOTAGE_LABELS: Record<string, string> = {
  client_clips: "Client sends clips",
  animated: 'Animated graphics',
  stock: 'Stock footage',
  apnosh_films: 'Apnosh films on location',
  mix: 'Mix of sources',
}

const WHO_ON_CAMERA_LABELS: Record<string, string> = {
  just_me: 'Just one person',
  two_three: '2–3 people',
  full_team: 'The full team',
  no_people: 'No people — product/space only',
  apnosh_decides: 'Apnosh decides',
}

const MUSIC_OWNER_LABELS: Record<string, string> = {
  apnosh: 'Apnosh picks',
  client: 'Client suggests',
  none: 'No music',
}

const MUSIC_FEEL_LABELS: Record<string, string> = {
  hype: 'Hype / energetic',
  chill: 'Chill / relaxed',
  emotional: 'Emotional',
  trending: 'Trending / viral',
  corporate: 'Clean & corporate',
  apnosh_decides: 'Apnosh decides',
}

const EDITING_STYLE_LABELS: Record<string, string> = {
  cinematic: 'Cinematic',
  trendy: 'Trendy / viral',
  documentary: 'Documentary',
  clean: 'Clean & simple',
  ugc: 'UGC style',
  motion: 'Motion graphics',
  slideshow: 'Photo slideshow',
  apnosh_decides: 'Apnosh decides',
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube_shorts: 'YouTube Shorts',
  linkedin: 'LinkedIn',
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

export function VideoBriefView({ contentQueueId, isAdmin = false }: Props) {
  const supabase = createClient()
  const [brief, setBrief] = useState<VideoRequest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabase
        .from('video_requests')
        .select('*')
        .eq('content_queue_id', contentQueueId)
        .maybeSingle()
      if (!active) return
      if (data) setBrief(data as VideoRequest)
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

  if (!brief) return null

  const meta = TYPE_META[brief.content_type] || TYPE_META.other
  const TypeIcon = meta.icon

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-dark" />
        <h2 className="text-sm font-semibold text-ink">Video Creative Brief</h2>
      </div>

      {/* What & how */}
      <Section title="What & how" icon={Film}>
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
          <Field
            label="Format"
            value={
              brief.is_series
                ? `Series of ${brief.series_episode_count ?? '?'} reels`
                : 'Single reel'
            }
          />
          {brief.length_preference && (
            <Field label="Length" value={LENGTH_LABELS[brief.length_preference]} />
          )}
        </Grid>
      </Section>

      {/* Message & script */}
      <Section title="Message & script" icon={MessageCircle}>
        <Grid>
          {brief.main_message && <Field label="Main message" value={brief.main_message} fullRow />}
          {brief.hook && <Field label="Hook (first 3s)" value={brief.hook} fullRow />}
          {brief.call_to_action && brief.call_to_action.length > 0 && (
            <Field label="Call to action" value={brief.call_to_action.join(' · ')} fullRow />
          )}
          {brief.script_owner && <Field label="Script by" value={SCRIPT_OWNER_LABELS[brief.script_owner]} />}
          {brief.script_style && <Field label="Delivery" value={SCRIPT_STYLE_LABELS[brief.script_style]} />}
          {brief.voiceover_tone && (
            <Field label="VO tone" value={VOICEOVER_TONE_LABELS[brief.voiceover_tone]} />
          )}
        </Grid>
      </Section>

      {/* Footage */}
      <Section title="Footage" icon={Video}>
        <Grid>
          {brief.footage_source && (
            <Field label="Source" value={FOOTAGE_LABELS[brief.footage_source]} fullRow />
          )}
          {brief.footage_source === 'apnosh_films' && (
            <>
              {brief.shoot_location && <Field label="Location" value={brief.shoot_location} />}
              {brief.shoot_date && <Field label="Preferred date" value={brief.shoot_date} />}
              {brief.shoot_flexible !== null && (
                <Field label="Flexible date" value={brief.shoot_flexible ? 'Yes' : 'No'} />
              )}
              {brief.shoot_who_on_camera && (
                <Field label="On camera" value={WHO_ON_CAMERA_LABELS[brief.shoot_who_on_camera]} />
              )}
              {brief.shoot_subject && <Field label="Subject" value={brief.shoot_subject} fullRow />}
            </>
          )}
        </Grid>
      </Section>

      {/* Music */}
      {(brief.music_owner || brief.music_feel) && (
        <Section title="Music" icon={Music}>
          <Grid>
            {brief.music_owner && (
              <Field label="Music by" value={MUSIC_OWNER_LABELS[brief.music_owner]} />
            )}
            {brief.music_feel && (
              <Field label="Feel" value={MUSIC_FEEL_LABELS[brief.music_feel]} />
            )}
          </Grid>
        </Section>
      )}

      {/* Look & feel */}
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
          {brief.editing_style && (
            <Field label="Editing style" value={EDITING_STYLE_LABELS[brief.editing_style]} />
          )}
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
            <div className="text-[10px] font-medium text-ink-4 uppercase tracking-wide mb-2">Reference uploads</div>
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

      {/* Avoid */}
      {brief.avoid_text && (
        <Section title="Avoid" icon={AlertTriangle}>
          <Field label="Avoid" value={brief.avoid_text} fullRow />
        </Section>
      )}

      {/* Where & when */}
      <Section title="Where & when" icon={Calendar}>
        <Grid>
          {brief.platforms && brief.platforms.length > 0 && (
            <Field
              label="Platforms"
              value={brief.platforms.map(p => PLATFORM_LABELS[p] || p).join(' · ')}
              fullRow
            />
          )}
          {brief.publish_date && <Field label="Publish date" value={brief.publish_date} />}
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

      {/* Internal note — admin only */}
      {isAdmin && brief.internal_note && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            <h3 className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">
              Internal — from client to account manager
            </h3>
          </div>
          <p className="text-[10px] text-amber-700 mb-2 italic">Not visible to the editor or other clients.</p>
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
