import 'server-only'
/**
 * Shared Anthropic call for the planning stages (Diagnose, Select, ...). One
 * structured-output call mirroring the proven api/dashboard/suggestions route:
 * model claude-opus-4-8, output_config json_schema (strict), env-or-.env.local
 * key, hard timeout. Returns the parsed object or null on any failure so every
 * caller can fall back deterministically (spec §7 graceful degradation).
 */

export function readApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
    const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m)
    return m ? m[1].trim() : null
  } catch { return null }
}

export interface StructuredCall {
  system: string
  user: string
  schema: object
  maxTokens?: number
  timeoutMs?: number
  /**
   * Who is calling and for whom, for the AI call log (law 4's sibling) and the loud-failure
   * alert (law 6). Optional so no caller breaks, but an untagged call still logs as 'unknown':
   * the log's coverage is the point of putting it at this choke point, and a tag a caller
   * forgot must not mean a call the record never saw.
   */
  tag?: { kind: string; clientId?: string | null; schemaName?: string }
}

const MODEL = 'claude-opus-4-8'

/** HTTP status + body → failure class, pure so the sim can pin it.
 *
 *  MEASURED, NOT ASSUMED: Anthropic returns **400 invalid_request_error** for an exhausted credit
 *  balance ("Your credit balance is too low..."), not 402. Probed live 2026-07-28. Classifying by
 *  status alone filed the exact outage this system exists to catch under log-only 5xx, so the body
 *  is part of the classification. 402 stays mapped in case the API ever starts using it. */
export function failClassForStatus(status: number, body?: string): import('./ai-log').FailClass {
  if (body && /credit balance/i.test(body)) return 'http-402'
  return status === 401 ? 'http-401' : status === 402 ? 'http-402' : status === 429 ? 'http-429' : 'http-5xx'
}

/**
 * Returns the parsed JSON object the model produced, or null (no key / HTTP
 * error / abort / unparseable). Never throws. The model is told to price/select
 * nothing it shouldn't by the caller's schema — this helper only transports.
 *
 * EVERY call through here is logged verbatim to ai_call_log, and key/credit/rate
 * failures raise an admin notification (401/402 every time, 429 deduped). Both are
 * fire-and-forget: the log can be down, the call still answers. See ai-log.ts for
 * why this is the permanent fix for the silent-outage failure mode.
 */
export async function callStructuredOutput<T>(opts: StructuredCall): Promise<T | null> {
  const started = Date.now()
  const kind = opts.tag?.kind ?? 'unknown'
  const finish = (
    result: T | null,
    outcome: { responseText: string | null; failClass?: import('./ai-log').FailClass; tokensIn?: number; tokensOut?: number },
  ): T | null => {
    // Dynamic import so this transport stays importable in contexts that never call it, and
    // fire-and-forget so logging can never slow or fail a planning call.
    void import('./ai-log')
      .then(({ logAiCall, alertAiFailure }) => {
        void logAiCall({
          kind,
          clientId: opts.tag?.clientId ?? null,
          model: MODEL,
          system: opts.system,
          user: opts.user,
          schemaName: opts.tag?.schemaName,
          responseText: outcome.responseText,
          ok: result !== null,
          failClass: result === null ? outcome.failClass ?? 'unparseable' : undefined,
          latencyMs: Date.now() - started,
          tokensIn: outcome.tokensIn,
          tokensOut: outcome.tokensOut,
        })
        if (result === null && outcome.failClass) void alertAiFailure(outcome.failClass, kind)
      })
      .catch(() => {})
    return result
  }

  const apiKey = readApiKey()
  if (!apiKey) return finish(null, { responseText: null, failClass: 'no-key' })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 18000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      // Mirrors the proven route exactly. The spec also asks for thinking:adaptive
      // + output_config.effort:'high'; deferred until validated against the live
      // API, since a rejected field would silently force every call to fall back.
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 1200,
        output_config: { format: { type: 'json_schema', schema: opts.schema } },
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      const failClass = failClassForStatus(res.status, errBody)
      return finish(null, { responseText: null, failClass })
    }
    const data = await res.json()
    const usage = (data.usage ?? {}) as { input_tokens?: number; output_tokens?: number }
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? ''
    if (!text) return finish(null, { responseText: null, failClass: 'unparseable', tokensIn: usage.input_tokens, tokensOut: usage.output_tokens })
    try {
      return finish(JSON.parse(text) as T, { responseText: text, tokensIn: usage.input_tokens, tokensOut: usage.output_tokens })
    } catch {
      return finish(null, { responseText: text, failClass: 'unparseable', tokensIn: usage.input_tokens, tokensOut: usage.output_tokens })
    }
  } catch {
    return finish(null, { responseText: null, failClass: 'timeout' })
  } finally {
    clearTimeout(timer)
  }
}
