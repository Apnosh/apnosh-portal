/**
 * Creator supply + matching for the campaign marketplace.
 *
 * HONEST v1: there is no real creator marketplace yet, so we do NOT invent named
 * individuals or ratings. Each craft (video/photo/social/design) resolves to the
 * Apnosh creative team, differentiated only by style so the vibe-matching still
 * routes work to the right craft. The record is shaped like the real `vendors`
 * table (migration 146: avg_rating, total_bookings, service_area) so the source
 * swaps to a live query without changing callers; rating/jobs are 0 here because
 * there is no real per-creator track record to show. When real supply exists,
 * this pool becomes a live query and the identity/rating fields fill in for real.
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

// One craft per discipline = the Apnosh creative team. Multiple style variants
// keep vibe-matching working (and preserve historical ids so already-minted work
// orders still resolve to a name), but every entry is the same honest team — no
// invented individuals, no fabricated ratings or job counts.
const POOL: Record<Disc, Creator[]> = {
  Video: [
    { id: 'v_devon', name: 'Apnosh video team', rating: 0, jobs: 0, specialty: 'Snappy food reels', style: 'clean', tones: ['#cfe0f2', '#7099d0'], based: 'Apnosh' },
    { id: 'v_maya', name: 'Apnosh video team', rating: 0, jobs: 0, specialty: 'Cozy, warm reels', style: 'warm', tones: ['#d8a06a', '#8a5638'], based: 'Apnosh' },
    { id: 'v_sam', name: 'Apnosh video team', rating: 0, jobs: 0, specialty: 'Bold, trendy edits', style: 'bold', tones: ['#ef6aa0', '#8a63e0'], based: 'Apnosh' },
    { id: 'v_rae', name: 'Apnosh video team', rating: 0, jobs: 0, specialty: 'Chef-at-work stories', style: 'warm', tones: ['#f5a93f', '#b56b42'], based: 'Apnosh' },
  ],
  Photo: [
    { id: 'p_theo', name: 'Apnosh photo team', rating: 0, jobs: 0, specialty: 'Bright, clean dishes', style: 'clean', tones: ['#e7eef5', '#9fc0e8'], based: 'Apnosh' },
    { id: 'p_lena', name: 'Apnosh photo team', rating: 0, jobs: 0, specialty: 'Natural-light food', style: 'warm', tones: ['#d8a06a', '#a8763f'], based: 'Apnosh' },
    { id: 'p_kira', name: 'Apnosh photo team', rating: 0, jobs: 0, specialty: 'Moody, rich plating', style: 'bold', tones: ['#6b5b4a', '#2e2620'], based: 'Apnosh' },
  ],
  Social: [
    { id: 's_ivy', name: 'Apnosh social team', rating: 0, jobs: 0, specialty: 'Clean daily stories', style: 'clean', tones: ['#cfe0f2', '#7099d0'], based: 'Apnosh' },
    { id: 's_nina', name: 'Apnosh social team', rating: 0, jobs: 0, specialty: 'Warm day-of stories', style: 'warm', tones: ['#f5a93f', '#b56b42'], based: 'Apnosh' },
    { id: 's_omar', name: 'Apnosh social team', rating: 0, jobs: 0, specialty: 'Punchy story sets', style: 'bold', tones: ['#ef6aa0', '#8a63e0'], based: 'Apnosh' },
  ],
  Design: [
    { id: 'd_jordan', name: 'Apnosh design team', rating: 0, jobs: 0, specialty: 'Clean menu graphics', style: 'clean', tones: ['#cfe0f2', '#7099d0'], based: 'Apnosh' },
    { id: 'd_priya', name: 'Apnosh design team', rating: 0, jobs: 0, specialty: 'Warm, rustic posts', style: 'warm', tones: ['#d8a06a', '#8a5638'], based: 'Apnosh' },
    { id: 'd_kai', name: 'Apnosh design team', rating: 0, jobs: 0, specialty: 'Bold, punchy promos', style: 'bold', tones: ['#ef6aa0', '#f5a93f'], based: 'Apnosh' },
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
 * Rank a discipline's craft variants for a campaign by how well their style fits
 * the campaign's vibe. Returns best-first, each with a plain-language reason and a
 * topMatch flag. (No fabricated rating/experience — see the file header.)
 */
export function rankCreators(d: Disc, vibe?: Style | null): RankedCreator[] {
  const pool = creatorPool(d)
  if (!pool.length) return []
  const scored = pool
    .map((c) => {
      const fit = vibe && c.style === vibe ? 1 : 0
      // No real per-creator rating/track record yet, so rank purely on style fit
      // to the campaign's vibe; the reason is the honest craft, not a fake score.
      const score = fit * 0.25
      const bits = [c.specialty, fit ? `${c.style} style fit` : ''].filter(Boolean)
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

/** Map a content type key ('reel' | 'story' | 'post' | 'photo' | …) to the
 *  creative discipline that makes it. Null for non-creative types (email/sms). */
export function disciplineForType(type: string): Disc | null { return discFor(type) }

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
      return top ? { discipline: d, creator: top.creator, reason: top.reason, recommended: true } : null
    })
    .filter((r): r is CreativeRole => r !== null)
}
