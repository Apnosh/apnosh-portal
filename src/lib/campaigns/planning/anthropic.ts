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
}

/**
 * Returns the parsed JSON object the model produced, or null (no key / HTTP
 * error / abort / unparseable). Never throws. The model is told to price/select
 * nothing it shouldn't by the caller's schema — this helper only transports.
 */
export async function callStructuredOutput<T>(opts: StructuredCall): Promise<T | null> {
  const apiKey = readApiKey()
  if (!apiKey) return null
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
        model: 'claude-opus-4-8',
        max_tokens: opts.maxTokens ?? 1200,
        output_config: { format: { type: 'json_schema', schema: opts.schema } },
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? ''
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
