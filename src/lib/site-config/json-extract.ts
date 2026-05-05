/**
 * Extract JSON from a Claude response that may contain a leading
 * <strategy>...</strategy> block, markdown fences, or trailing prose.
 *
 * Strategies tried in order:
 *   1. Strip <strategy>...</strategy> if present
 *   2. Look for a fenced ```json ... ``` block
 *   3. Look for a fenced ``` ... ``` block
 *   4. Greedy first-{ to last-} match
 *   5. Bracket-balance scan from first { until balanced
 *
 * Returns { json, strategy } or { error, raw }.
 */

export interface ExtractResult {
  json: unknown
  strategy: string | null
}

export function extractJsonFromClaude(text: string): ExtractResult | { error: string; raw: string } {
  if (!text || typeof text !== 'string') {
    return { error: 'Empty Claude response', raw: '' }
  }

  let working = text

  // Pull out strategy block first — keep it for surfacing back to the UI
  let strategy: string | null = null
  const strategyMatch = working.match(/<strategy>([\s\S]*?)<\/strategy>/i)
  if (strategyMatch) {
    strategy = strategyMatch[1].trim()
    working = working.replace(strategyMatch[0], '')
  }

  // Strategy 1: ```json fenced block
  const fencedJson = working.match(/```json\s*([\s\S]*?)\s*```/i)
  if (fencedJson) {
    const parsed = tryParse(fencedJson[1])
    if (parsed.ok) return { json: parsed.value, strategy }
  }

  // Strategy 2: any ``` fenced block
  const fencedAny = working.match(/```\s*([\s\S]*?)\s*```/)
  if (fencedAny) {
    const parsed = tryParse(fencedAny[1])
    if (parsed.ok) return { json: parsed.value, strategy }
  }

  // Strategy 3: bracket-balance scan from first {
  const firstBrace = working.indexOf('{')
  if (firstBrace >= 0) {
    const balanced = scanBalanced(working, firstBrace)
    if (balanced) {
      const parsed = tryParse(balanced)
      if (parsed.ok) return { json: parsed.value, strategy }
    }
  }

  // Strategy 4: greedy first-{ to last-}
  const greedy = working.match(/\{[\s\S]*\}/)
  if (greedy) {
    const parsed = tryParse(greedy[0])
    if (parsed.ok) return { json: parsed.value, strategy }
  }

  // Strategy 5: try to repair truncated trailing — find last balanced { ... }
  const repaired = attemptRepair(working)
  if (repaired) {
    const parsed = tryParse(repaired)
    if (parsed.ok) return { json: parsed.value, strategy }
  }

  return {
    error: 'Could not extract valid JSON from Claude response. The output may have been truncated or malformed.',
    raw: text.slice(0, 500),
  }
}

function tryParse(s: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(s) }
  } catch {
    return { ok: false }
  }
}

/** Walk forward from idx, tracking string/escape state, until braces balance. */
function scanBalanced(text: string, start: number): string | null {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * If Claude got cut off mid-output (variants mode with 3 full sites), the
 * trailing JSON is incomplete. Try truncating to the last fully-closed brace.
 */
function attemptRepair(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  // Walk until we hit truncation, keep last balanced position
  let depth = 0
  let inString = false
  let escape = false
  let lastBalanced = -1
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) lastBalanced = i
    }
  }
  if (lastBalanced > 0) return text.slice(start, lastBalanced + 1)
  return null
}
