import 'server-only'
/**
 * Campaign-level channel window-lift (Phase 3, window_lift tier). For a campaign whose
 * pieces have NO per-post reading (e.g. a GBP-led campaign — Google posts never get a
 * social_posts row), this gives the owner an honest campaign-level signal: the relevant
 * daily metric in the window AFTER the campaign shipped vs a matched window before.
 *
 * It is a CORRELATION, not causation (client-level daily metrics, and other things move
 * them too), so it is labeled "since this campaign started", never "caused by", and it is
 * campaign-scoped — never attributed to a single piece. Display-only: it does not write the
 * ledger and does not feed the planner's learning (per-post readings do that).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { maturedWindow, channelLift } from './window-lift-math'

// Baselines high enough that ordinary variance on a small denominator can't read as a big swing.
const GBP_MIN_BASELINE = 30      // Google actions over the matured window
const SOCIAL_MIN_BASELINE = 500  // reach over the matured window

export interface ChannelLift { hasData: boolean; metricLabel: string; metricDelta: number }
const NONE: ChannelLift = { hasData: false, metricLabel: 'activity', metricDelta: 0 }

function sumField(rows: Record<string, unknown>[] | null, fields: string[]): number {
  let n = 0
  for (const r of rows ?? []) for (const f of fields) n += (typeof r[f] === 'number' ? (r[f] as number) : 0)
  return n
}

/** The campaign's strongest available channel lift (GBP first, then social reach). Returns
 *  hasData=false when the post-window hasn't matured (so a just-launched campaign reads an
 *  honest "gathering", never a fake collapse) or the baseline is too small to be meaningful. */
export async function campaignChannelLift(clientId: string, anchorISO: string, channels: string[]): Promise<ChannelLift> {
  if (!clientId || !anchorISO) return NONE
  const today = new Date().toISOString().slice(0, 10)
  const w = maturedWindow(anchorISO, today)
  if (!w) return NONE  // too soon to read a lift honestly (post-window not settled yet)

  // GBP first — its posts never get a per-post row, so this is the clearest window-lift case.
  if (channels.includes('gbp')) {
    const admin = createAdminClient()
    const f = ['directions', 'calls', 'website_clicks']
    const [post, pre] = await Promise.all([
      admin.from('gbp_metrics').select('directions, calls, website_clicks').eq('client_id', clientId).gte('date', w.postStart).lt('date', w.postEnd),
      admin.from('gbp_metrics').select('directions, calls, website_clicks').eq('client_id', clientId).gte('date', w.preStart).lt('date', w.preEnd),
    ])
    const r = channelLift(sumField(post.data, f), sumField(pre.data, f), GBP_MIN_BASELINE)
    if (r.hasData) return { hasData: true, metricLabel: 'Google actions', metricDelta: r.delta }
  }

  // Social reach next.
  if (channels.some((c) => c === 'reels' || c === 'social')) {
    const admin = createAdminClient()
    const [post, pre] = await Promise.all([
      admin.from('social_metrics').select('reach').eq('client_id', clientId).gte('date', w.postStart).lt('date', w.postEnd),
      admin.from('social_metrics').select('reach').eq('client_id', clientId).gte('date', w.preStart).lt('date', w.preEnd),
    ])
    const r = channelLift(sumField(post.data, ['reach']), sumField(pre.data, ['reach']), SOCIAL_MIN_BASELINE)
    if (r.hasData) return { hasData: true, metricLabel: 'reach', metricDelta: r.delta }
  }

  return NONE
}
