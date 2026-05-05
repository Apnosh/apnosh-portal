/**
 * Retrieve "gold standard" examples from past published sites to inject
 * into design prompts.
 *
 * Quality heuristics (in priority order):
 *   1. Site got published (passed strict validation)
 *   2. Was NOT edited within 7 days of publish (proxy for "client loved it")
 *   3. Generation source (if known) had high judge score (when eval harness exists)
 *
 * As the corpus grows, this query becomes the engine of compounding quality.
 * Future versions will rank by ai_judge_score, manual curation, or
 * client-engagement signals.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

export interface GoldExample {
  clientName: string
  vertical: string
  publishedAt: string
  site: RestaurantSite
  /** True if no edits within 7 days of publish — strong "client liked it" signal. */
  loved: boolean
}

export async function getGoldExamples(
  vertical: string,
  count = 3,
): Promise<GoldExample[]> {
  try {
    const admin = createAdminClient()

    // Pull recent published sites from the same vertical
    const { data: rows } = await admin
      .from('site_publish_history')
      .select(`
        client_id, data, published_at, version,
        clients ( name )
      `)
      .order('published_at', { ascending: false })
      .limit(50)

    if (!rows || rows.length === 0) return []

    // Filter to this vertical + sort by recency
    const candidates = (rows as Array<{
      client_id: string
      data: RestaurantSite
      published_at: string
      version: number
      clients: { name?: string } | { name?: string }[] | null
    }>)
      .filter(r => (r.data?.identity?.vertical ?? null) === vertical)

    if (candidates.length === 0) return []

    // For each candidate, check if subsequent edits were minimal — proxy
    // for "the client kept it as published"
    const examples: GoldExample[] = []
    for (const c of candidates) {
      const { count: editCount } = await admin
        .from('ai_generations')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', c.client_id)
        .eq('applied', true)
        .gte('created_at', c.published_at)
        .lte('created_at', new Date(new Date(c.published_at).getTime() + 7 * 86400 * 1000).toISOString())
      const loved = (editCount ?? 0) === 0

      const cli = Array.isArray(c.clients) ? c.clients[0] : c.clients
      examples.push({
        clientName: cli?.name ?? 'Restaurant',
        vertical,
        publishedAt: c.published_at,
        site: c.data,
        loved,
      })
      if (examples.length >= count * 2) break // gather a few extras to rank
    }

    // Rank: loved-first, then most-recent
    examples.sort((a, b) => {
      if (a.loved !== b.loved) return a.loved ? -1 : 1
      return b.publishedAt.localeCompare(a.publishedAt)
    })

    return examples.slice(0, count)
  } catch (e) {
    console.warn('[few-shot] getGoldExamples failed:', (e as Error).message)
    return []
  }
}

/**
 * Compress a gold example into a prompt-friendly block. We don't include
 * the full RestaurantSite JSON — just the parts that demonstrate good
 * design choices (hero, voice, about opening, FAQ structure).
 */
export function goldExampleToPromptBlock(ex: GoldExample, idx: number): string {
  const s = ex.site
  const lines: string[] = []
  lines.push(`### Example ${idx + 1}: ${ex.clientName}${ex.loved ? ' — published + kept as-is by client' : ''}`)

  if (s.identity?.tagline) lines.push(`Tagline: "${s.identity.tagline}"`)
  if (s.hero?.eyebrow) lines.push(`Hero eyebrow: "${s.hero.eyebrow}"`)
  if (s.hero?.headline) lines.push(`Hero headline: "${s.hero.headline}"`)
  if (s.hero?.subhead) lines.push(`Hero subhead: "${s.hero.subhead}"`)
  if (s.about?.headline) lines.push(`About headline: "${s.about.headline}"`)
  if (s.about?.body) {
    const firstPara = s.about.body.split('\n\n')[0] ?? s.about.body
    lines.push(`About opener: "${firstPara.slice(0, 280)}${firstPara.length > 280 ? '…' : ''}"`)
  }
  if (s.about?.values?.[0]) {
    lines.push(`Sample value title: "${s.about.values[0].title}" — body: "${s.about.values[0].body.slice(0, 160)}"`)
  }
  if (s.contact?.faqs?.[0]) {
    lines.push(`Sample FAQ — Q: "${s.contact.faqs[0].q}" A: "${s.contact.faqs[0].a.slice(0, 160)}"`)
  }
  if (s.brand?.designSystem) {
    const ds = s.brand.designSystem
    lines.push(`Design system: radius=${ds.radius}, density=${ds.density}, motion=${ds.motion}, surface=${ds.surface}, type=${ds.typeWeight}`)
  }

  return lines.join('\n')
}

/**
 * Render a list of gold examples as a single prompt block for injection.
 * Returns empty string if none — calling code can drop the section entirely.
 */
export function goldExamplesPromptSection(examples: GoldExample[]): string {
  if (examples.length === 0) return ''
  const blocks = examples.map((ex, i) => goldExampleToPromptBlock(ex, i)).join('\n\n')
  return [
    '## Reference: past sites in this vertical that landed well',
    '',
    'Treat these as inspiration for tone, specificity, and voice — NOT as templates to copy.',
    'These are real Apnosh-built sites that the client kept as-is after publish:',
    '',
    blocks,
    '',
  ].join('\n')
}
