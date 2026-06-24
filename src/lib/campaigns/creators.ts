/**
 * Creator supply + matching for the campaign marketplace.
 *
 * Seeded pool today, shaped like the real `vendors` table (migration 146:
 * avg_rating, total_bookings, service_area) so the source swaps to a live query
 * without changing callers. rankCreators is the matching brain: a deterministic,
 * honest score (rating + restaurant experience + style fit to the campaign's
 * vibe). The LLM brand-fit layer (reading real brand guidelines + reviews) slots
 * in later when there is real supply — model proposes, code disposes.
 */
export type Disc = 'Video' | 'Photo' | 'Social' | 'Design'
export type Style = 'warm' | 'clean' | 'bold'

export interface Creator {
  id: string
  name: string
  rating: number
  jobs: number        // total bookings, for credibility
  specialty: string   // ≤4 words, what they're known for
  style: Style        // the vibe they lead with — used for fit matching
  tones: string[]     // 2-3 hex colors — a glance at their style
  based: string       // service area label
}

export interface RankedCreator { creator: Creator; reason: string; topMatch: boolean }
export interface CreativeRole { discipline: Disc; creator: Creator; reason: string; recommended: boolean }

const POOL: Record<Disc, Creator[]> = {
  Video: [
    { id: 'v_devon', name: 'Devon K.', rating: 4.8, jobs: 58, specialty: 'Snappy food reels', style: 'clean', tones: ['#cfe0f2', '#7099d0'], based: 'Local' },
    { id: 'v_maya', name: 'Maya R.', rating: 4.9, jobs: 47, specialty: 'Cozy, warm reels', style: 'warm', tones: ['#d8a06a', '#8a5638'], based: 'Local' },
    { id: 'v_sam', name: 'Sam T.', rating: 4.7, jobs: 39, specialty: 'Bold, trendy edits', style: 'bold', tones: ['#ef6aa0', '#8a63e0'], based: 'Remote' },
    { id: 'v_rae', name: 'Rae B.', rating: 4.8, jobs: 51, specialty: 'Chef-at-work stories', style: 'warm', tones: ['#f5a93f', '#b56b42'], based: 'Local' },
  ],
  Photo: [
    { id: 'p_theo', name: 'Theo M.', rating: 4.9, jobs: 72, specialty: 'Bright, clean dishes', style: 'clean', tones: ['#e7eef5', '#9fc0e8'], based: 'Local' },
    { id: 'p_lena', name: 'Lena P.', rating: 4.8, jobs: 61, specialty: 'Natural-light food', style: 'warm', tones: ['#d8a06a', '#a8763f'], based: 'Local' },
    { id: 'p_kira', name: 'Kira W.', rating: 4.7, jobs: 44, specialty: 'Moody, rich plating', style: 'bold', tones: ['#6b5b4a', '#2e2620'], based: 'Remote' },
  ],
  Social: [
    { id: 's_ivy', name: 'Ivy C.', rating: 4.9, jobs: 52, specialty: 'Clean daily stories', style: 'clean', tones: ['#cfe0f2', '#7099d0'], based: 'Local' },
    { id: 's_nina', name: 'Nina F.', rating: 4.8, jobs: 45, specialty: 'Warm day-of stories', style: 'warm', tones: ['#f5a93f', '#b56b42'], based: 'Local' },
    { id: 's_omar', name: 'Omar D.', rating: 4.7, jobs: 38, specialty: 'Punchy story sets', style: 'bold', tones: ['#ef6aa0', '#8a63e0'], based: 'Remote' },
  ],
  Design: [
    { id: 'd_jordan', name: 'Jordan L.', rating: 4.7, jobs: 40, specialty: 'Clean menu graphics', style: 'clean', tones: ['#cfe0f2', '#7099d0'], based: 'Remote' },
    { id: 'd_priya', name: 'Priya N.', rating: 4.9, jobs: 34, specialty: 'Warm, rustic posts', style: 'warm', tones: ['#d8a06a', '#8a5638'], based: 'Remote' },
    { id: 'd_kai', name: 'Kai W.', rating: 4.8, jobs: 51, specialty: 'Bold, punchy promos', style: 'bold', tones: ['#ef6aa0', '#f5a93f'], based: 'Remote' },
  ],
}

export function creatorPool(d: Disc): Creator[] { return POOL[d] ?? [] }
export function creatorById(id: string): Creator | undefined {
  for (const list of Object.values(POOL)) { const c = list.find((x) => x.id === id); if (c) return c }
  return undefined
}

/** The campaign's vibe, from its goal + occasion — drives style-fit matching. */
export function vibeForCampaign(goalKey?: string | null, occasion?: string | null): Style {
  if (/launch|event|promo|grand open|debut/i.test(occasion || '')) return 'bold'
  switch (goalKey) {
    case 'acquire': return 'bold'
    case 'retain':
    case 'capacity': return 'warm'
    case 'reviews': return 'clean'
    default: return 'clean'
  }
}

/**
 * Rank a discipline's creators for a campaign: highest rating + most restaurant
 * experience, with a bonus when their style matches the campaign's vibe. Returns
 * best-first, each with a plain-language reason and a topMatch flag.
 */
export function rankCreators(d: Disc, vibe?: Style | null): RankedCreator[] {
  const pool = creatorPool(d)
  if (!pool.length) return []
  const maxJobs = Math.max(1, ...pool.map((c) => c.jobs))
  const scored = pool
    .map((c) => {
      const fit = vibe && c.style === vibe ? 1 : 0
      const score = (c.rating / 5) * 0.55 + (c.jobs / maxJobs) * 0.2 + fit * 0.25
      const bits = [fit ? `${c.style} style fits` : '', `${c.rating}★`, `${c.jobs} restaurant jobs`].filter(Boolean)
      return { creator: c, score, reason: bits.join(' · ') }
    })
    .sort((a, b) => b.score - a.score)
  return scored.map((s, i) => ({ creator: s.creator, reason: s.reason, topMatch: i === 0 }))
}

// Which catalog content reads as which discipline. Order matters: specific
// creative cues win before the generic "post".
const MATCHERS: Array<[RegExp, Disc]> = [
  [/story|stories|ig[- ]?story|day[- ]?of/i, 'Social'],
  [/reel|video|tiktok|short[- ]?form|teaser/i, 'Video'],
  [/photo|shoot|styled|dish/i, 'Photo'],
  [/graphic|design|carousel|poster|flyer|post/i, 'Design'],
]
function discFor(text: string): Disc | null {
  for (const [re, d] of MATCHERS) if (re.test(text)) return d
  return null
}

/**
 * The creative roles a campaign needs, each with its creator: the owner's chosen
 * override when set, otherwise the top-ranked match for the campaign's vibe.
 * Returns [] when there is no creative work.
 */
export function creativeRolesForCampaign(
  items: Array<{ plain?: string; name?: string; serviceId?: string; included?: boolean }>,
  overrides?: Record<string, string> | null,
  vibe?: Style | null,
): CreativeRole[] {
  const seen = new Set<Disc>()
  for (const it of items) {
    if (!it.included) continue
    const d = discFor(`${it.plain ?? ''} ${it.name ?? ''} ${it.serviceId ?? ''}`)
    if (d) seen.add(d)
  }
  return (['Video', 'Photo', 'Social', 'Design'] as Disc[])
    .filter((d) => seen.has(d))
    .map((d): CreativeRole | null => {
      const overrideId = overrides?.[d]
      if (overrideId) {
        // Only honor a pick that actually belongs to THIS discipline's pool, so
        // a stale/cross-craft override (e.g. a Photo creator on a Video slot)
        // falls through to the ranked match instead of minting the wrong craft.
        const c = creatorPool(d).find((x) => x.id === overrideId)
        if (c) return { discipline: d, creator: c, reason: 'Your pick', recommended: false }
      }
      const top = rankCreators(d, vibe)[0]
      // Drop the discipline if nothing resolves (e.g. an empty live pool), rather
      // than crash the card.
      return top ? { discipline: d, creator: top.creator, reason: `Best match · ${top.reason}`, recommended: true } : null
    })
    .filter((r): r is CreativeRole => r !== null)
}
