/**
 * Gather all client-specific context relevant to generating a website.
 * Walks the various profile/brand/location tables and assembles a single
 * payload to feed Claude.
 *
 * Used by /api/admin/generate-site to seed Claude with the rich
 * onboarding data we already collected, so the generated draft is tuned
 * to the client's actual goals, voice, customer types, and offerings.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface ClientContext {
  // ----- Identity -----
  client: {
    id: string
    name: string
    slug: string
    industry: string | null
    location: string | null
    website: string | null
    socials: Record<string, string> | null
  }

  // ----- Profile (rich onboarding data) -----
  profile: {
    business_description: string | null
    unique_differentiator: string | null
    year_founded: number | null
    price_range: string | null
    cuisine: string | null
    service_styles: string[] | null
    customer_types: string[] | null
    why_choose: string[] | null
    customer_age_range: string | null
    primary_goal: string | null
    goal_detail: string | null
    secondary_goals: string[] | null
    success_signs: string[] | null
    main_offerings: string | null
    signature_items: string[] | null
    upcoming_events: string | null
    seasonal_notes: string | null
    tone_tags: string[] | null
    avoid_tone_tags: string[] | null
    custom_tone: string | null
    voice_notes: string | null
    content_type_tags: string[] | null
  }

  // ----- Brand (visual identity) -----
  brand: {
    primary_color: string | null
    secondary_color: string | null
    accent_color: string | null
    font_display: string | null
    font_body: string | null
    logo_url: string | null
    visual_style: string | null
    photo_style: string | null
    voice_notes: string | null
  }

  // ----- Locations -----
  locations: {
    name: string | null
    tagline: string | null
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
    phone: string | null
    is_primary: boolean
    full_address: string | null
    hours: unknown
  }[]

  // ----- Reviews / testimonials hint -----
  reviews: {
    text: string | null
    author: string | null
    rating: number | null
    source: string | null
  }[]
}

export async function gatherClientContext(clientId: string): Promise<ClientContext> {
  const db = createAdminClient()

  const [clientRes, profileRes, brandRes, locationsRes, reviewsRes] = await Promise.all([
    db
      .from('clients')
      .select('id, name, slug, industry, location, website, socials')
      .eq('id', clientId)
      .single(),
    db
      .from('client_profiles')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('client_brands')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('client_locations')
      .select('location_name, full_address, street, city, state, zip, hours, is_primary')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false }),
    db
      .from('reviews')
      .select('comment, reviewer_name, rating, source')
      .eq('client_id', clientId)
      .gte('rating', 4)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const client = clientRes.data ?? { id: clientId, name: '', slug: '', industry: null, location: null, website: null, socials: null }
  const profile = profileRes.data ?? null
  const brand = brandRes.data ?? null
  const locations = locationsRes.data ?? []
  const reviews = reviewsRes.data ?? []

  return {
    client: {
      id: client.id as string,
      name: (client.name as string) ?? '',
      slug: (client.slug as string) ?? '',
      industry: (client.industry as string | null) ?? null,
      location: (client.location as string | null) ?? null,
      website: (client.website as string | null) ?? null,
      socials: (client.socials as Record<string, string> | null) ?? null,
    },
    profile: {
      business_description: profile?.business_description ?? null,
      unique_differentiator: profile?.unique_differentiator ?? null,
      year_founded: profile?.year_founded ?? null,
      price_range: profile?.price_range ?? null,
      cuisine: profile?.cuisine ?? null,
      service_styles: profile?.service_styles ?? null,
      customer_types: profile?.customer_types ?? null,
      why_choose: profile?.why_choose ?? null,
      customer_age_range: profile?.customer_age_range ?? null,
      primary_goal: profile?.primary_goal ?? null,
      goal_detail: profile?.goal_detail ?? null,
      secondary_goals: profile?.secondary_goals ?? null,
      success_signs: profile?.success_signs ?? null,
      main_offerings: profile?.main_offerings ?? null,
      signature_items: profile?.signature_items ?? null,
      upcoming_events: profile?.upcoming_events ?? null,
      seasonal_notes: profile?.seasonal_notes ?? null,
      tone_tags: profile?.tone_tags ?? null,
      avoid_tone_tags: profile?.avoid_tone_tags ?? null,
      custom_tone: profile?.custom_tone ?? null,
      voice_notes: profile?.voice_notes ?? null,
      content_type_tags: profile?.content_type_tags ?? null,
    },
    brand: {
      primary_color: brand?.primary_color ?? null,
      secondary_color: brand?.secondary_color ?? null,
      accent_color: brand?.accent_color ?? null,
      font_display: brand?.font_display ?? null,
      font_body: brand?.font_body ?? null,
      logo_url: brand?.logo_url ?? null,
      visual_style: brand?.visual_style ?? null,
      photo_style: brand?.photo_style ?? null,
      voice_notes: brand?.voice_notes ?? null,
    },
    locations: locations.map(l => ({
      name: l.location_name as string | null,
      tagline: null,
      address: l.street as string | null,
      city: l.city as string | null,
      state: l.state as string | null,
      zip: l.zip as string | null,
      phone: null,
      full_address: l.full_address as string | null,
      is_primary: !!l.is_primary,
      hours: l.hours,
    })),
    reviews: reviews.map(r => ({
      text: r.comment as string | null,
      author: r.reviewer_name as string | null,
      rating: r.rating as number | null,
      source: r.source as string | null,
    })),
  }
}

/**
 * Compress the rich context into a structured prompt block for Claude.
 * Skips empty fields so the prompt stays focused.
 */
export function contextToPromptBlock(ctx: ClientContext): string {
  const lines: string[] = []
  const push = (label: string, val: unknown) => {
    if (val == null) return
    if (Array.isArray(val) && val.length === 0) return
    if (typeof val === 'string' && !val.trim()) return
    const v = Array.isArray(val) ? val.join(', ') : String(val)
    lines.push(`${label}: ${v}`)
  }

  lines.push(`# Client: ${ctx.client.name}`)
  push('Industry', ctx.client.industry)
  push('Location', ctx.client.location)
  push('Website', ctx.client.website)
  if (ctx.client.socials) {
    const social = Object.entries(ctx.client.socials).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' / ')
    if (social) lines.push(`Socials: ${social}`)
  }

  lines.push('\n## Business profile')
  push('Description', ctx.profile.business_description)
  push('Unique differentiator', ctx.profile.unique_differentiator)
  push('Year founded', ctx.profile.year_founded)
  push('Price range', ctx.profile.price_range)
  push('Cuisine', ctx.profile.cuisine)
  push('Service styles', ctx.profile.service_styles)
  push('Main offerings', ctx.profile.main_offerings)
  push('Signature items', ctx.profile.signature_items)
  push('Upcoming events', ctx.profile.upcoming_events)
  push('Seasonal notes', ctx.profile.seasonal_notes)

  lines.push('\n## Audience')
  push('Customer types', ctx.profile.customer_types)
  push('Why customers choose them', ctx.profile.why_choose)
  push('Customer age range', ctx.profile.customer_age_range)

  lines.push('\n## Goals')
  push('Primary goal', ctx.profile.primary_goal)
  push('Goal detail', ctx.profile.goal_detail)
  push('Secondary goals', ctx.profile.secondary_goals)
  push('Success signs', ctx.profile.success_signs)

  lines.push('\n## Brand voice')
  push('Tone tags', ctx.profile.tone_tags)
  push('Avoid these tones', ctx.profile.avoid_tone_tags)
  push('Custom tone notes', ctx.profile.custom_tone)
  push('Voice notes', ctx.profile.voice_notes ?? ctx.brand.voice_notes)
  push('Content tags', ctx.profile.content_type_tags)

  lines.push('\n## Visual brand')
  push('Primary color', ctx.brand.primary_color)
  push('Secondary color', ctx.brand.secondary_color)
  push('Accent color', ctx.brand.accent_color)
  push('Display font', ctx.brand.font_display)
  push('Body font', ctx.brand.font_body)
  push('Logo URL', ctx.brand.logo_url)
  push('Visual style', ctx.brand.visual_style)
  push('Photo style', ctx.brand.photo_style)

  if (ctx.locations.length > 0) {
    lines.push('\n## Locations')
    for (const [i, l] of ctx.locations.entries()) {
      const parts = [l.name, l.full_address || `${l.address}, ${l.city}, ${l.state} ${l.zip}`].filter(Boolean)
      lines.push(`${i + 1}. ${parts.join(' — ')}${l.is_primary ? ' (primary)' : ''}`)
    }
  }

  if (ctx.reviews.length > 0) {
    lines.push('\n## Recent positive reviews (use as testimonials)')
    for (const r of ctx.reviews.slice(0, 5)) {
      if (!r.text) continue
      lines.push(`- "${r.text}" — ${r.author ?? 'Customer'}${r.rating ? ` · ${r.rating}★` : ''}${r.source ? ` · ${r.source}` : ''}`)
    }
  }

  return lines.join('\n')
}
