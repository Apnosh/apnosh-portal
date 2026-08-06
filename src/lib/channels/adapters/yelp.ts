/**
 * YELP ADAPTER — the only file that knows Yelp's wire format (CHANNELS-PLAN law 1).
 *
 * Connection rows are created by the EXISTING connectYelp() flow
 * (src/lib/connection-actions.ts): channel='yelp', connection_type='api_key',
 * platform_account_id = the business alias. This adapter owns the recurring SYNC:
 *
 *   - business rating + review count → channel_connections.metadata (the reputation
 *     surface reads the canonical row, never Yelp)
 *   - the ~3 review excerpts Yelp's API exposes → local_reviews (source='yelp'), which
 *     drops them straight into the existing reply workflow and inbox
 *
 * Yelp has NO reply API: replying stays a guide lane (P5), never pretended here.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { ChannelError, type ChannelAdapter, type ChannelConnection, type SyncResult } from '../types'

const API = 'https://api.yelp.com/v3'

async function yelpGet(path: string, apiKey: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (res.status === 401 || res.status === 403) throw new ChannelError('auth', `Yelp rejected the API key (${res.status})`)
  if (res.status === 429) throw new ChannelError('rate_limit', 'Yelp rate limit hit')
  if (!res.ok) throw new ChannelError('upstream', `Yelp returned ${res.status} for ${path}`)
  return (await res.json()) as Record<string, unknown>
}

export const yelpAdapter: ChannelAdapter = {
  id: 'yelp',
  kind: 'api_key',

  isConfigured() {
    return Boolean(process.env.YELP_API_KEY)
  },

  async connectStart() {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'YELP_API_KEY is not set')
    /* Connecting is the existing paste-your-Yelp-URL flow (connectYelp), not a redirect. */
    return { url: null, instructions: 'Paste the Yelp page URL in the connect card.' }
  },

  async sync(connection: ChannelConnection): Promise<SyncResult> {
    const apiKey = process.env.YELP_API_KEY
    if (!apiKey) throw new ChannelError('not_configured', 'YELP_API_KEY is not set')
    const alias = connection.platform_account_id
    if (!alias) throw new ChannelError('not_connected', 'Yelp connection has no business alias')

    const biz = await yelpGet(`/businesses/${encodeURIComponent(alias)}`, apiKey)
    const rating = Number(biz.rating ?? 0)
    const reviewCount = Number(biz.review_count ?? 0)

    const admin = createAdminClient()
    const { error: metaErr } = await admin
      .from('channel_connections')
      .update({
        metadata: {
          ...(connection.metadata ?? {}),
          rating,
          review_count: reviewCount,
          name: (biz.name as string) ?? null,
          url: (biz.url as string) ?? null,
          is_closed: Boolean(biz.is_closed),
        },
      })
      .eq('id', connection.id)
    if (metaErr) throw new ChannelError('upstream', `Failed to store Yelp metadata: ${metaErr.message}`)

    /* The excerpt reviews Yelp exposes (~3). Upserted on the platform review id so
     * re-syncs never duplicate; reply-lifecycle columns are NOT in the payload, so an
     * update can never clobber an owner's reply state (law 4). */
    let written = 0
    try {
      const rev = await yelpGet(`/businesses/${encodeURIComponent(alias)}/reviews`, apiKey)
      const reviews = Array.isArray(rev.reviews) ? (rev.reviews as Record<string, unknown>[]) : []
      if (reviews.length > 0) {
        const rows = reviews
          .filter((r) => typeof r.id === 'string' && r.rating != null)
          .map((r) => {
            const user = (r.user ?? {}) as Record<string, unknown>
            return {
              client_id: connection.client_id,
              source: 'yelp',
              external_id: String(r.id),
              external_url: typeof r.url === 'string' ? r.url : null,
              reviewer_name: typeof user.name === 'string' ? user.name : null,
              reviewer_avatar_url: typeof user.image_url === 'string' ? user.image_url : null,
              rating: Math.max(1, Math.min(5, Math.round(Number(r.rating)))),
              text: typeof r.text === 'string' ? r.text : null,
              created_at_platform: typeof r.time_created === 'string'
                ? new Date(r.time_created.replace(' ', 'T')).toISOString()
                : new Date().toISOString(),
              synced_at: new Date().toISOString(),
            }
          })
        if (rows.length > 0) {
          const { error: revErr } = await admin
            .from('local_reviews')
            .upsert(rows, { onConflict: 'client_id,source,external_id' })
          if (revErr) throw new ChannelError('upstream', `Failed to store Yelp reviews: ${revErr.message}`)
          written = rows.length
        }
      }
    } catch (e) {
      /* The excerpts endpoint is plan-gated on some Yelp tiers. Rating + count already
       * landed, so a reviews failure downgrades to a note rather than failing the run —
       * but it is SAID in the ledger, never swallowed silently. */
      if (e instanceof ChannelError && (e.code === 'auth' || e.code === 'upstream')) {
        return { itemsWritten: 0, note: `rating ${rating} (${reviewCount}); excerpts unavailable on this Yelp plan` }
      }
      throw e
    }

    return { itemsWritten: written, note: `rating ${rating} (${reviewCount} reviews), ${written} excerpts` }
  },
}
