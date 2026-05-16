/**
 * Per-turn client context loader.
 *
 * Pulls a fresh snapshot of EVERYTHING relevant to the client into
 * the agent's system prompt at the start of every conversation turn.
 * Static facts (brand voice, vertical, etc.) come from client_facts.
 * Dynamic data (recent reviews, current menu, last 7 days of activity)
 * comes from live tables.
 *
 * Without this, the agent runs on stale onboarding data and gives
 * generic answers. With this, the agent reasons about THIS specific
 * client at THIS moment in time.
 *
 * Token budget: target ~3-5k tokens of context. Lists are truncated
 * (top 12 menu items, last 5 reviews, last 7 days of activity).
 * Anything bigger goes through search_business_data as on-demand
 * lookup.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { renderFactsForPrompt } from './facts'
import { relevantPatternsFor } from './cross-client-patterns'

export interface ClientContextSnapshot {
  /** Full markdown-formatted block to splice into the system prompt. */
  text: string
  /** Token-ish length (rough char/4) so the runtime can monitor budget. */
  approxTokens: number
}

export async function loadClientContext(clientId: string): Promise<ClientContextSnapshot> {
  const admin = createAdminClient()
  const [factsText, menu, reviews, recentUpdates, openRequests, channels, locations, contentFields, specials, perfSummary, patterns] = await Promise.all([
    renderFactsForPrompt(clientId, 0.5),
    loadMenuSummary(clientId),
    loadRecentReviews(clientId),
    loadRecentUpdates(clientId),
    loadOpenRequests(clientId),
    loadConnectedChannels(clientId),
    loadLocations(clientId),
    loadContentFields(clientId),
    loadActiveSpecials(clientId),
    loadPerformanceSummary(clientId),
    loadCrossClientPatterns(clientId),
  ]).catch(err => {
    console.error('[context-loader] partial failure:', (err as Error).message)
    return ['', '', '', '', '', '', '', '', '', '', '']
  })
  void admin  // each loader uses its own client

  const sections: string[] = [
    '## Client knowledge graph (what we know about this restaurant)',
    factsText || '(no facts on file)',
  ]
  if (locations) sections.push('\n## Locations', locations)
  if (channels) sections.push('\n## Connected channels', channels)
  if (menu) sections.push('\n## Current menu (top items)', menu)
  if (specials) sections.push('\n## Active specials', specials)
  if (contentFields) sections.push('\n## Website copy (editable fields on file)', contentFields)
  if (reviews) sections.push('\n## Recent reviews', reviews)
  if (recentUpdates) sections.push('\n## Recent activity (last 14 days)', recentUpdates)
  if (openRequests) sections.push('\n## Open requests in the queue', openRequests)
  if (perfSummary) sections.push('\n## Last 7-day performance snapshot', perfSummary)
  if (patterns) sections.push('\n## What worked for similar restaurants', patterns)

  const text = sections.join('\n')
  return { text, approxTokens: Math.ceil(text.length / 4) }
}

async function loadCrossClientPatterns(clientId: string): Promise<string> {
  /* Look up the client's vertical so we pull only relevant patterns. */
  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('industry')
    .eq('id', clientId)
    .maybeSingle()
  const industry = (client?.industry as string | null) ?? null
  const patterns = await relevantPatternsFor({ industry, limit: 5 }).catch(() => [])
  if (patterns.length === 0) return ''
  return patterns.map(p => {
    const dir = p.avgPctChange != null && p.avgPctChange > 0 ? '+' : ''
    const sample = `n=${p.sampleSize}, ${p.strongSignalCount} strong`
    return `  - When clients use **${p.toolName}**, ${p.metricName} typically changes ${dir}${p.avgPctChange?.toFixed(1) ?? '?'}% (${sample})`
  }).join('\n')
}

// ─── Loaders ──────────────────────────────────────────────────────

async function loadMenuSummary(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('menu_items')
    .select('name, description, price_cents, category, is_featured, is_available, photo_url')
    .eq('client_id', clientId)
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .limit(25)
  const items = (data ?? []) as Array<{
    name: string; description: string | null; price_cents: number | null;
    category: string | null; is_featured: boolean | null; is_available: boolean | null;
    photo_url: string | null;
  }>
  if (items.length === 0) return ''

  const byCategory = new Map<string, typeof items>()
  for (const item of items) {
    const cat = item.category ?? 'Uncategorized'
    const arr = byCategory.get(cat) ?? []
    arr.push(item)
    byCategory.set(cat, arr)
  }
  const lines: string[] = []
  for (const [category, catItems] of byCategory) {
    lines.push(`**${category}** (${catItems.length} items)`)
    for (const item of catItems.slice(0, 8)) {
      const price = item.price_cents != null ? `$${(item.price_cents / 100).toFixed(2)}` : '—'
      const flags = [
        item.is_featured ? '⭐ featured' : null,
        item.is_available === false ? '⛔ unavailable' : null,
        item.photo_url ? '📷' : null,
      ].filter(Boolean).join(' ')
      const desc = item.description ? ` — ${truncate(item.description, 80)}` : ''
      lines.push(`  - ${item.name} (${price}${flags ? `, ${flags}` : ''})${desc}`)
    }
    if (catItems.length > 8) lines.push(`  ... and ${catItems.length - 8} more`)
  }
  return lines.join('\n')
}

async function loadRecentReviews(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('reviews')
    .select('rating, author_name, review_text, response_text, posted_at')
    .eq('client_id', clientId)
    .order('posted_at', { ascending: false })
    .limit(5)
  const reviews = (data ?? []) as Array<{
    rating: number | null; author_name: string | null;
    review_text: string | null; response_text: string | null; posted_at: string | null;
  }>
  if (reviews.length === 0) return '(no reviews yet)'

  // Quick aggregate
  const ratingsArr = reviews.map(r => r.rating).filter((r): r is number => r != null)
  const avg = ratingsArr.length > 0 ? (ratingsArr.reduce((a, b) => a + b, 0) / ratingsArr.length).toFixed(1) : '—'
  const unresponded = reviews.filter(r => !r.response_text).length

  const lines: string[] = [
    `Last 5 reviews: avg ${avg}★, ${unresponded} unresponded`,
  ]
  for (const r of reviews) {
    const author = r.author_name ?? 'Anonymous'
    const stars = r.rating != null ? '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) : '?'
    const date = r.posted_at ? new Date(r.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
    const text = r.review_text ? truncate(r.review_text, 150) : '(no text)'
    const responded = r.response_text ? '✓ responded' : '⚠ no response'
    lines.push(`  - ${stars} ${author} (${date}) ${responded}: "${text}"`)
  }
  return lines.join('\n')
}

async function loadRecentUpdates(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - 14)
  const { data } = await admin
    .from('client_updates')
    .select('type, summary, status, source, targets, created_at')
    .eq('client_id', clientId)
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  const updates = (data ?? []) as Array<{
    type: string; summary: string | null; status: string; source: string | null;
    targets: string[] | null; created_at: string;
  }>
  if (updates.length === 0) return '(no updates in the last 14 days)'
  return updates.map(u => {
    const date = new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const targets = u.targets ? `→ ${u.targets.join(',')}` : ''
    const source = u.source ? `[${u.source}]` : ''
    return `  - ${date} ${source} ${u.type}: ${u.summary ?? '—'} (${u.status}) ${targets}`
  }).join('\n')
}

async function loadOpenRequests(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('content_queue')
    .select('request_type, status, input_text, created_at')
    .eq('client_id', clientId)
    .in('status', ['new', 'drafting', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(5)
  const rows = (data ?? []) as Array<{ request_type: string; status: string; input_text: string | null; created_at: string }>
  if (rows.length === 0) return '(no open requests)'
  return rows.map(r => {
    const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `  - ${date} [${r.status}] ${truncate(r.input_text ?? '', 120)}`
  }).join('\n')
}

async function loadConnectedChannels(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const [pcRes, ccRes] = await Promise.all([
    admin.from('platform_connections')
      .select('platform, access_token, username')
      .eq('client_id', clientId)
      .not('access_token', 'is', null),
    admin.from('channel_connections')
      .select('channel, status, platform_account_name, platform_url, last_sync_at, sync_error')
      .eq('client_id', clientId)
      .not('access_token', 'is', null),
  ])
  const social = (pcRes.data ?? []) as Array<{ platform: string; username: string | null }>
  const channels = (ccRes.data ?? []) as Array<{
    channel: string; status: string; platform_account_name: string | null;
    platform_url: string | null; last_sync_at: string | null; sync_error: string | null;
  }>
  if (social.length === 0 && channels.length === 0) return '(no channels connected yet)'

  const lines: string[] = []
  for (const c of channels) {
    const errIndicator = c.sync_error ? ` ⚠ ${truncate(c.sync_error, 60)}` : ''
    lines.push(`  - ${c.channel} [${c.status}]: ${c.platform_account_name ?? c.platform_url ?? 'connected'}${errIndicator}`)
  }
  for (const s of social) {
    lines.push(`  - ${s.platform}: ${s.username ?? 'connected'}`)
  }
  return lines.join('\n')
}

async function loadLocations(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('gbp_locations')
    .select('location_name, address, hours, status, store_code')
    .eq('client_id', clientId)
    .limit(5)
  const locs = (data ?? []) as Array<{
    location_name: string | null; address: string | null;
    hours: Record<string, unknown> | null; status: string | null; store_code: string | null;
  }>
  if (locs.length === 0) return ''
  return locs.map(l => {
    return `  - ${l.location_name ?? 'Unnamed'}${l.address ? ` — ${truncate(l.address, 80)}` : ''}${l.status ? ` [${l.status}]` : ''}`
  }).join('\n')
}

async function loadContentFields(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('client_content_fields')
    .select('field_key, value, last_edited_at')
    .eq('client_id', clientId)
    .order('field_key', { ascending: true })
    .limit(20)
  const fields = (data ?? []) as Array<{ field_key: string; value: string; last_edited_at: string | null }>
  if (fields.length === 0) return '(no copy overrides; using defaults from apnosh-content.json)'
  return fields.map(f => `  - ${f.field_key}: "${truncate(f.value, 100)}"`).join('\n')
}

async function loadActiveSpecials(clientId: string): Promise<string> {
  const admin = createAdminClient()
  /* specials table exists per earlier inspection; we don't know exact
     columns universally so use a defensive select. */
  const { data, error } = await admin
    .from('specials')
    .select('*')
    .eq('client_id', clientId)
    .limit(5)
  if (error) return ''
  const rows = (data ?? []) as Array<Record<string, unknown>>
  if (rows.length === 0) return '(no active specials)'
  return rows.map(s => {
    const name = (s.name as string | undefined) ?? (s.title as string | undefined) ?? 'Special'
    const desc = (s.description as string | undefined) ?? ''
    const price = (s.price_cents as number | undefined) != null
      ? `$${(((s.price_cents as number) ?? 0) / 100).toFixed(2)}`
      : ''
    return `  - ${name}${price ? ` (${price})` : ''}${desc ? ` — ${truncate(desc, 80)}` : ''}`
  }).join('\n')
}

async function loadPerformanceSummary(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const [webRes, searchRes, gbpRes] = await Promise.all([
    admin.from('website_metrics').select('visitors, sessions, page_views').eq('client_id', clientId).gte('date', cutoffStr),
    admin.from('search_metrics').select('total_impressions, total_clicks').eq('client_id', clientId).gte('date', cutoffStr),
    admin.from('gbp_metrics').select('directions, calls, website_clicks, impressions_total').eq('client_id', clientId).gte('date', cutoffStr),
  ])
  const web = ((webRes.data ?? []) as Array<{ visitors: number; sessions: number; page_views: number }>)
    .reduce((acc, r) => ({ visitors: acc.visitors + (r.visitors ?? 0), sessions: acc.sessions + (r.sessions ?? 0), page_views: acc.page_views + (r.page_views ?? 0) }), { visitors: 0, sessions: 0, page_views: 0 })
  const search = ((searchRes.data ?? []) as Array<{ total_impressions: number; total_clicks: number }>)
    .reduce((acc, r) => ({ impressions: acc.impressions + (r.total_impressions ?? 0), clicks: acc.clicks + (r.total_clicks ?? 0) }), { impressions: 0, clicks: 0 })
  const gbp = ((gbpRes.data ?? []) as Array<{ directions: number; calls: number; website_clicks: number; impressions_total: number }>)
    .reduce((acc, r) => ({ directions: acc.directions + (r.directions ?? 0), calls: acc.calls + (r.calls ?? 0), website_clicks: acc.website_clicks + (r.website_clicks ?? 0), impressions: acc.impressions + (r.impressions_total ?? 0) }), { directions: 0, calls: 0, website_clicks: 0, impressions: 0 })

  return [
    `  - Website (7d): ${web.visitors} visitors, ${web.sessions} sessions, ${web.page_views} pageviews`,
    `  - Search (7d): ${search.impressions} impressions, ${search.clicks} clicks`,
    `  - Google Business Profile (7d): ${gbp.impressions} impressions, ${gbp.directions} directions, ${gbp.calls} calls, ${gbp.website_clicks} clicks to site`,
  ].join('\n')
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
