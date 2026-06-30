/**
 * getCampaignProfile — the real account profile the campaign builder hydrates from.
 *
 * The whole point of the madlib is to arrive PRE-FILLED from what the owner already told us at
 * onboarding, so they confirm/tweak instead of re-answering. The data already exists; this is the
 * one wire that connects it to the builder. It joins two sources the owner already has:
 *   • businesses (keyed by owner_id) — the onboarding profile: neighborhood, cuisine/concept, the
 *     target audience they described, their monthly budget, their primary goal.
 *   • assembleSignals(clientId) — the live GBP rating + email segments.
 *
 * Server-only (admin client). Never throws — a missing/empty profile degrades to all-nulls so the
 * builder just falls back to its static defaults.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { assembleSignals } from '@/lib/campaigns/planning/signals'

export interface CampaignProfile {
  /** "near me" copy + the ad geo. */
  neighborhood: string | null
  city: string | null
  /** Tone of the creative (a taqueria reads different from a wine bar). */
  cuisine: string | null
  concept: string | null
  /** Who the owner SAID they want to reach, in their words — the {who} default. */
  targetAudience: string | null
  /** Sizes the reach default / boost. */
  monthlyBudget: number | null
  /** Proof on the creative. */
  rating: number | null
  ratingCount: number | null
  /** Largest email segment name (a known-list "who" option). */
  topSegment: string | null
  primaryGoal: string | null
  /** The owner's current active special (title) — pre-fills the offer slot. */
  currentSpecial: string | null
  /** Worst "are we found" completeness across listings (0-100), or null. A weak listing makes
   *  "get found on Google" the binding lead move for a first-visits plan. */
  presence: number | null
}

const EMPTY: CampaignProfile = {
  neighborhood: null, city: null, cuisine: null, concept: null, targetAudience: null,
  monthlyBudget: null, rating: null, ratingCount: null, topSegment: null, primaryGoal: null, currentSpecial: null, presence: null,
}

export async function getCampaignProfile(clientId: string): Promise<CampaignProfile> {
  try {
    const admin = createAdminClient()
    const [bizRes, signals, specialRes] = await Promise.all([
      // The onboarding profile is on businesses, keyed by CLIENT_ID. (Previously this was keyed by the
      // signed-in owner_id AND selected several columns that have since been dropped from the table —
      // neighborhood/p_neighborhood/concept/concept_title/target/budget_monthly — so the whole query
      // errored and every account silently fell back to an empty profile. Keying by client_id also
      // makes it work for managed/agency access and headless/brain callers where there is no session.)
      admin.from('businesses')
        .select('city, cuisine, cuisine_other, target_audience, target_location, restaurant_subtype, monthly_budget, primary_goal, goal_detail')
        .eq('client_id', clientId).maybeSingle(),
      assembleSignals(clientId).catch(() => ({ reputation: { rating: null, ratingCount: null, themes: [] }, segments: [] as { name: string; count: number }[], presence: [] as { completeness: number }[] })),
      // The owner's current active special (top of their list) — the real promo to pre-fill the offer.
      admin.from('client_specials').select('title').eq('client_id', clientId).eq('is_active', true)
        .order('display_order', { ascending: true }).limit(1).maybeSingle(),
    ])
    const b = (bizRes.data ?? {}) as Record<string, unknown>
    const str = (k: string): string | null => { const v = b[k]; return typeof v === 'string' && v.trim() ? v.trim() : null }
    const num = (k: string): number | null => { const v = b[k]; const n = v != null ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? Math.round(n) : null }
    const segs = (signals.segments ?? []) as { name: string; count: number }[]
    const topSegment = segs.length ? [...segs].sort((x, y) => (y.count || 0) - (x.count || 0))[0]?.name ?? null : null
    return {
      // No dedicated neighborhood column today; the audience target-location is the closest real signal
      // for "near me" copy + ad geo, else the city.
      neighborhood: str('target_location') ?? str('city'),
      city: str('city'),
      cuisine: str('cuisine') ?? str('cuisine_other'),
      concept: str('restaurant_subtype'),
      targetAudience: str('target_audience'),
      monthlyBudget: num('monthly_budget'),
      rating: signals.reputation?.rating ?? null,
      ratingCount: signals.reputation?.ratingCount ?? null,
      topSegment,
      primaryGoal: str('primary_goal') ?? str('goal_detail'),
      currentSpecial: (() => { const t = (specialRes?.data as { title?: string } | null)?.title; return typeof t === 'string' && t.trim() ? t.trim() : null })(),
      presence: (() => { const ps = (signals.presence ?? []) as { completeness?: number }[]; const nums = ps.map((p) => p?.completeness).filter((n): n is number => typeof n === 'number'); return nums.length ? Math.min(...nums) : null })(),
    }
  } catch {
    return EMPTY
  }
}
