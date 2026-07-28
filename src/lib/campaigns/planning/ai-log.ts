import 'server-only'
/**
 * The AI call log and the loud-failure alert, behind the one choke point.
 *
 * Law 6 of the strategist-flow constitution: AI failure is loud and graceful. Graceful already
 * existed — every caller of callStructuredOutput falls back deterministically on null. LOUD did
 * not: when the prod key ran out of credits, 54 surfaces failed silently for days and the only
 * symptom was owners finding the AI lane "confusing". This module is the permanent fix for that
 * class of outage: the failure still degrades gracefully, AND an admin hears about it.
 *
 * Both writes are fire-and-forget BY CONTRACT: nothing in here may ever throw into a planning
 * call, and nothing in here may ever block one. A broken log is a quieter system, not a broken
 * strategist.
 *
 * DEDUPE (owner revision 3): 401/402 — the key is dead — alert EVERY time, because each one is a
 * production outage in progress. 429 — a rate-limit burst — alerts once per window and counts the
 * rest, because forty identical notifications in an hour trains the admin to ignore the rail,
 * which is precisely how the last outage went unnoticed.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminUserIds } from '@/lib/notify'

export type FailClass = 'no-key' | 'http-401' | 'http-402' | 'http-429' | 'http-5xx' | 'timeout' | 'unparseable'

export interface AiCallRecord {
  kind: string
  clientId?: string | null
  model: string
  system: string
  user: string
  schemaName?: string
  responseText: string | null
  ok: boolean
  failClass?: FailClass
  latencyMs: number
  tokensIn?: number
  tokensOut?: number
}

/** Public per-token rates for the models this transport uses, dollars per million. An estimate
 *  for the cost column, never a bill. */
const RATES: Record<string, { inPerM: number; outPerM: number }> = {
  'claude-opus-4-8': { inPerM: 5, outPerM: 25 },
}

export function estimateCost(model: string, tokensIn?: number, tokensOut?: number): number | null {
  const r = RATES[model]
  if (!r || (tokensIn === undefined && tokensOut === undefined)) return null
  return Math.round((((tokensIn ?? 0) * r.inPerM + (tokensOut ?? 0) * r.outPerM) / 1_000_000) * 1e6) / 1e6
}

/** Write the verbatim record. Never throws; never awaited by callers that cannot afford it. */
export async function logAiCall(rec: AiCallRecord): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('ai_call_log').insert({
      kind: rec.kind,
      client_id: rec.clientId ?? null,
      model: rec.model,
      system_prompt: rec.system,
      user_prompt: rec.user,
      schema_name: rec.schemaName ?? null,
      response_text: rec.responseText,
      ok: rec.ok,
      fail_class: rec.failClass ?? null,
      latency_ms: rec.latencyMs,
      tokens_in: rec.tokensIn ?? null,
      tokens_out: rec.tokensOut ?? null,
      cost_estimate: estimateCost(rec.model, rec.tokensIn, rec.tokensOut),
    })
  } catch {
    // The table may not exist yet (migration pending) or the insert may fail. Either way the
    // planning call already happened; losing one log row is the acceptable failure here.
  }
}

/**
 * The alert policy, pure so the sim can pin it (owner revision 3):
 *   always        an outage in progress; every occurrence notifies (dead key, no credits).
 *   dedupe-window weather; first in the window notifies, the rest are counted in the log.
 *   log-only      quality noise; never worth an interrupt.
 */
export function alertPolicy(failClass: FailClass): 'always' | 'dedupe-window' | 'log-only' {
  if (failClass === 'http-401' || failClass === 'http-402' || failClass === 'no-key') return 'always'
  if (failClass === 'http-429') return 'dedupe-window'
  return 'log-only'
}

/** How long a 429 burst stays deduped before the admin hears about it again. */
const RATE_LIMIT_WINDOW_MIN = 60

/**
 * Tell the admins, with class-appropriate volume. 401/402 are outages: every occurrence notifies.
 * 429 is weather: first in the window notifies, the rest are countable in ai_call_log.
 */
export async function alertAiFailure(failClass: FailClass, kind: string): Promise<void> {
  const policy = alertPolicy(failClass)
  if (policy === 'log-only') return
  try {
    const admin = createAdminClient()

    if (policy === 'dedupe-window') {
      const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString()
      const { data: recent } = await admin
        .from('notifications')
        .select('id')
        .eq('type', 'ai_failure')
        .gte('created_at', cutoff)
        .limit(1)
      if (recent && recent.length) return
    }

    const adminIds = await getAdminUserIds(admin)
    if (!adminIds.length) return

    const copy = failClass === 'http-429'
      ? {
          title: 'AI calls are being rate limited',
          body: `Anthropic returned 429 on a ${kind} call. Owners are getting the deterministic fallback plan. Further 429s in the next ${RATE_LIMIT_WINDOW_MIN} minutes are counted in ai_call_log without another notification.`,
        }
      : {
          title: 'AI is DOWN: key or credits failed',
          body: `A ${kind} call failed with ${failClass}. Every AI surface is now silently serving its fallback. Check the Anthropic console: this is the out-of-credits failure mode that previously went unnoticed for days.`,
        }

    await admin.from('notifications').insert(
      adminIds.map((uid) => ({ user_id: uid, type: 'ai_failure', title: copy.title, body: copy.body, link: null })),
    )
  } catch {
    // An alert that cannot be written must not break the call it is alerting about.
  }
}
