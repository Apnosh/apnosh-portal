/**
 * onboarding-facts.ts
 *
 * THE PIPE. Onboarding answers land in `client_profiles`, but no AI
 * generator reads that table — the content engine is grounded by
 * `client_knowledge_facts` and `client_brands`. This module bridges the
 * gap: it turns the self-serve wizard's answers into structured knowledge
 * facts and a real brand-voice record, so what a restaurant tells us at
 * signup actually shapes the captions, ideas, and posts we generate.
 *
 * Idempotent: re-running replaces this client's prior onboarding-sourced
 * facts (source = 'onboarding') rather than piling up duplicates. Facts
 * recorded by strategists or other sources are never touched.
 */

import { createAdminClient } from '@/lib/supabase/admin'

type FactCategory =
  | 'history' | 'specialty' | 'customer' | 'voice' | 'pet_peeve'
  | 'seasonality' | 'competitor' | 'event' | 'signature_item'
  | 'value_prop' | 'positioning' | 'observation'

interface DraftFact {
  category: FactCategory
  fact: string
  confidence?: 'low' | 'medium' | 'high'
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
}

/** Turn a 24h "HH:MM" string into a friendly "8am" / "5:30pm". */
function prettyTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return t.trim()
  let h = parseInt(m[1], 10)
  const min = m[2]
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return min === '00' ? `${h}${ampm}` : `${h}:${min}${ampm}`
}

/**
 * Summarize the hours map into one human line, e.g.
 * "Open Mon, Tue, Wed, Thu, Fri 8am–5pm; Sat 9am–3pm".
 * Groups consecutive days that share the same open/close.
 */
function summarizeHours(v: unknown): string {
  if (!v || typeof v !== 'object') return ''
  const h = v as Record<string, { open?: string; close?: string; closed?: boolean }>
  const groups: { days: string[]; range: string }[] = []
  for (const d of DAY_ORDER) {
    const day = h[d]
    if (!day || day.closed) continue
    const open = (day.open || '').trim()
    const close = (day.close || '').trim()
    if (!open && !close) continue
    const range = open && close ? `${prettyTime(open)}–${prettyTime(close)}` : (open ? `from ${prettyTime(open)}` : `until ${prettyTime(close)}`)
    const last = groups[groups.length - 1]
    if (last && last.range === range) last.days.push(d)
    else groups.push({ days: [d], range })
  }
  if (!groups.length) return ''
  return 'Open ' + groups.map((g) => `${g.days.join(', ')} ${g.range}`).join('; ')
}

/**
 * Build the structured fact list from raw onboarding data.
 * Exported for unit-testing the mapping without a DB.
 */
export function buildOnboardingFacts(data: Record<string, unknown>): DraftFact[] {
  const facts: DraftFact[] = []

  // — What they serve —
  const cuisine = s(data.cuisine) === 'Other' ? s(data.cuisine_other) : s(data.cuisine)
  if (cuisine) facts.push({ category: 'specialty', fact: `Cuisine: ${cuisine}`, confidence: 'high' })

  const styles = arr(data.service_styles)
  if (styles.length) facts.push({ category: 'positioning', fact: `Service style: ${styles.join(', ')}` })

  const price = s(data.price_range)
  if (price) facts.push({ category: 'positioning', fact: `Price point: ${price}`, confidence: 'high' })

  for (const dish of arr(data.signature_items)) {
    facts.push({ category: 'signature_item', fact: dish, confidence: 'high' })
  }

  const dietary = arr(data.dietary_options)
  if (dietary.length) facts.push({ category: 'specialty', fact: `Dietary options offered: ${dietary.join(', ')}` })

  const offerings = s(data.main_offerings)
  if (offerings) facts.push({ category: 'specialty', fact: `Main offerings: ${offerings}` })

  // — How people book & order —
  const reservations = s(data.reservations_platform)
  if (reservations) facts.push({ category: 'observation', fact: `Reservations: ${reservations}` })
  const delivery = arr(data.delivery_platforms)
  if (delivery.length) facts.push({ category: 'observation', fact: `Delivery / ordering: ${delivery.join(', ')}` })

  // — Menu highlights (the full menu is also seeded into menu_items;
  //   we surface a handful here so fact-only generators see real dishes) —
  const menuRows = (Array.isArray(data.menu_items) ? data.menu_items : [])
    .map((m) => (m && typeof m === 'object' ? (m as { name?: unknown; price?: unknown; category?: unknown }) : null))
    .filter((m): m is { name?: unknown; price?: unknown; category?: unknown } =>
      !!m && typeof m.name === 'string' && (m.name as string).trim() !== '')
  for (const m of menuRows.slice(0, 8)) {
    const name = (m.name as string).trim()
    const price = typeof m.price === 'string' ? m.price.trim() : ''
    const cat = typeof m.category === 'string' ? m.category.trim() : ''
    const detail = [cat, price].filter(Boolean).join(' · ')
    facts.push({ category: 'specialty', fact: detail ? `Menu item: ${name} (${detail})` : `Menu item: ${name}` })
  }

  // — Who they are —
  const desc = s(data.biz_desc)
  if (desc) facts.push({ category: 'history', fact: desc, confidence: 'high' })

  const unique = s(data.unique)
  if (unique) facts.push({ category: 'value_prop', fact: `What makes them different: ${unique}`, confidence: 'high' })

  for (const why of arr(data.why_choose)) {
    facts.push({ category: 'value_prop', fact: `Customers value: ${why}` })
  }

  const competitors = s(data.competitors)
  if (competitors) facts.push({ category: 'competitor', fact: `Competitors: ${competitors}` })

  // — Who they serve —
  const customers = arr(data.customer_types)
  if (customers.length) facts.push({ category: 'customer', fact: `Target customers: ${customers.join(', ')}`, confidence: 'high' })

  const age = s(data.customer_age_range)
  if (age) facts.push({ category: 'customer', fact: `Customer age: ${age}` })

  // — Rhythm / seasonality —
  const slow = (data.slow_periods && typeof data.slow_periods === 'object')
    ? (data.slow_periods as Record<string, string>) : {}
  const slowDays = DAY_ORDER.filter((d) => slow[d] === 'slow')
  const busyDays = DAY_ORDER.filter((d) => slow[d] === 'busy')
  if (slowDays.length) facts.push({ category: 'seasonality', fact: `Typically slow on: ${slowDays.join(', ')}`, confidence: 'high' })
  if (busyDays.length) facts.push({ category: 'seasonality', fact: `Typically busy on: ${busyDays.join(', ')}` })

  // — Events —
  const upcoming = s(data.upcoming)
  if (upcoming) facts.push({ category: 'event', fact: `Upcoming: ${upcoming}` })

  // — Goals & marketing direction —
  const goal = s(data.primary_goal)
  if (goal) facts.push({ category: 'positioning', fact: `Primary marketing goal: ${goal}`, confidence: 'high' })
  const goalDetail = s(data.goal_detail)
  if (goalDetail) facts.push({ category: 'observation', fact: `Goal context: ${goalDetail}` })
  const success = arr(data.success_signs)
  if (success.length) facts.push({ category: 'observation', fact: `What success looks like to them: ${success.join(', ')}` })

  // — Content direction (what to make more of, who inspires them) —
  const contentLikes = arr(data.content_likes)
  if (contentLikes.length) facts.push({ category: 'observation', fact: `Content types they want: ${contentLikes.join(', ')}` })
  const refs = s(data.ref_accounts)
  if (refs) facts.push({ category: 'observation', fact: `Accounts/brands they admire: ${refs}` })

  // — Discovery: brand hashtags & local SEO keywords —
  const hashtags = arr(data.brand_hashtags)
  if (hashtags.length) facts.push({ category: 'positioning', fact: `Brand hashtags: ${hashtags.join(', ')}`, confidence: 'high' })
  const keywords = arr(data.target_keywords)
  if (keywords.length) facts.push({ category: 'positioning', fact: `Target search keywords: ${keywords.join(', ')}`, confidence: 'high' })

  // — Location / local market —
  const city = s(data.city)
  const state = s(data.state)
  const place = [city, state].filter(Boolean).join(', ')
  if (place) facts.push({ category: 'positioning', fact: `Located in ${place}`, confidence: 'high' })
  const address = s(data.full_address)
  if (address) facts.push({ category: 'positioning', fact: `Address / neighborhood: ${address}` })

  // — Operations: hours, who can appear on camera, urgency —
  const hoursLine = summarizeHours(data.hours)
  if (hoursLine) facts.push({ category: 'seasonality', fact: hoursLine, confidence: 'high' })

  const canFilm = arr(data.can_film)
  if (canFilm.length) facts.push({ category: 'observation', fact: `Who can appear in content: ${canFilm.join(', ')}` })

  const canTag = s(data.can_tag)
  if (canTag) facts.push({ category: 'observation', fact: `Tagging customers in posts: ${canTag}` })

  const timeline = s(data.timeline)
  if (timeline) facts.push({ category: 'observation', fact: `Marketing timeline / urgency: ${timeline}` })

  // — Voice (also written to client_brands, but kept as facts for retrieval) —
  const tones = arr(data.tones)
  const customTone = s(data.custom_tone)
  if (tones.length) facts.push({ category: 'voice', fact: `Brand tone: ${tones.join(', ')}`, confidence: 'high' })
  if (customTone) facts.push({ category: 'voice', fact: `Voice in their words: ${customTone}`, confidence: 'high' })

  const emoji = s(data.emoji_usage)
  if (emoji) facts.push({ category: 'voice', fact: `Emoji usage preference: ${emoji}` })

  // — Things to avoid —
  for (const avoid of arr(data.avoid_tones)) {
    facts.push({ category: 'pet_peeve', fact: `Avoid sounding: ${avoid}` })
  }
  for (const avoid of arr(data.avoid_list)) {
    facts.push({ category: 'pet_peeve', fact: `Avoid in content: ${avoid}` })
  }

  return facts
}

/** Compose a concise brand-voice note for client_brands.voice_notes. */
function buildVoiceNotes(data: Record<string, unknown>): string {
  const parts: string[] = []
  const tones = arr(data.tones)
  if (tones.length) parts.push(`Tone: ${tones.join(', ')}.`)
  const customTone = s(data.custom_tone)
  if (customTone) parts.push(customTone.endsWith('.') ? customTone : `${customTone}.`)
  const emoji = s(data.emoji_usage)
  if (emoji) parts.push(`Emoji usage: ${emoji}.`)
  const avoid = arr(data.avoid_tones)
  if (avoid.length) parts.push(`Avoid sounding: ${avoid.join(', ')}.`)
  return parts.join(' ').trim()
}

/** Compose a small brand markdown doc for client_brands.brand_md. */
function buildBrandMd(name: string, data: Record<string, unknown>): string {
  const voice = buildVoiceNotes(data)
  const signatures = arr(data.signature_items)
  const cuisine = s(data.cuisine) === 'Other' ? s(data.cuisine_other) : s(data.cuisine)
  const lines = [`# ${name || 'Brand'}`]
  if (cuisine) lines.push('', `**Cuisine:** ${cuisine}`)
  if (voice) lines.push('', '## Voice', voice)
  if (signatures.length) {
    lines.push('', '## Signature items', ...signatures.map((x) => `- ${x}`))
  }
  return lines.join('\n')
}

/**
 * Sync onboarding answers into the AI-readable layer:
 *   - client_knowledge_facts (structured KB the content engine retrieves)
 *   - client_brands (voice_notes, brand_md, colors, logo)
 *
 * Best-effort and non-throwing — onboarding completion must not fail just
 * because the AI grounding write hiccupped. Returns counts for logging.
 */
export async function syncOnboardingToKnowledge(
  clientId: string,
  userId: string | null,
  data: Record<string, unknown>,
): Promise<{ factsWritten: number; brandWritten: boolean; error: string | null }> {
  const admin = createAdminClient()

  try {
    // 1. Replace prior onboarding-sourced facts (idempotent re-runs).
    await admin
      .from('client_knowledge_facts')
      .delete()
      .eq('client_id', clientId)
      .eq('source', 'onboarding')

    // 2. Insert the freshly-built facts.
    const drafts = buildOnboardingFacts(data)
    let factsWritten = 0
    if (drafts.length > 0) {
      const rows = drafts.map((f) => ({
        client_id: clientId,
        category: f.category,
        fact: f.fact,
        source: 'onboarding' as const,
        confidence: f.confidence ?? 'medium',
        recorded_by: userId,
        active: true,
      }))
      const { count, error } = await admin
        .from('client_knowledge_facts')
        .insert(rows, { count: 'exact' })
      if (error) return { factsWritten: 0, brandWritten: false, error: `facts: ${error.message}` }
      factsWritten = count ?? rows.length
    }

    // 3. Upsert real brand voice + colors so captions stop returning null voice.
    const name = s(data.biz_name)
    const voiceNotes = buildVoiceNotes(data)
    const brandMd = buildBrandMd(name, data)
    const logoUrl = s(data.logo_url) || null
    const color1 = s(data.color1) || '#4abd98'
    const color2 = s(data.color2) || '#2e9a78'

    const { error: brandErr } = await admin
      .from('client_brands')
      .upsert(
        {
          client_id: clientId,
          voice_notes: voiceNotes || null,
          brand_md: brandMd,
          primary_color: color1,
          secondary_color: color2,
          ...(logoUrl ? { logo_url: logoUrl } : {}),
        },
        { onConflict: 'client_id' },
      )

    return {
      factsWritten,
      brandWritten: !brandErr,
      error: brandErr ? `brand: ${brandErr.message}` : null,
    }
  } catch (e) {
    return {
      factsWritten: 0,
      brandWritten: false,
      error: e instanceof Error ? e.message : 'unknown error',
    }
  }
}
