/**
 * analyst-derive — the PURE honesty logic behind the analyst's brief.
 *
 * Split out from analyst-payload.ts on purpose. That module imports the Supabase
 * admin client and the campaign readers, which pull in `server-only` and therefore
 * cannot be loaded by a plain test runner. Keeping the derivations here means the
 * rules that decide what the analyst is allowed to say are unit-testable offline,
 * with no database and no API key.
 *
 * Nothing in this file does I/O. Types live here too so the shapes travel with them.
 */

import type { InsightsWindow } from './compute-stages'

/** One source inside a stage, flattened to just what the analyst needs. */
export interface AnalystSource {
  label: string
  provider: string
  value: number | null
  status: string
  /** true when this source's value is part of the stage headline */
  counted: boolean
}

/** One funnel stage, real numbers only. */
export interface AnalystStage {
  stage: number
  label: string
  /** the headline == sum of counted sources, or null when the stage has no data */
  headline: number | null
  unit?: string
  isEmpty: boolean
  note?: string
  sources: AnalystSource[]
}

/** The fall-off between two consecutive stages that both have a real number. */
export interface AnalystDropOff {
  fromStage: number
  fromLabel: string
  fromValue: number
  toStage: number
  toLabel: string
  toValue: number
  /** toValue / fromValue as a percentage (how many made it to the next step) */
  keptPct: number
}

/** Which sources feed the funnel today vs. which are dark (would add signal). */
export interface AnalystSourceSummary {
  connected: string[]
  dark: Array<{ label: string; state: string }>
}

/**
 * How one stage moved against the SAME stage in the period right before it.
 *
 * The owner's own past is the only benchmark we use. We never compare them to other
 * businesses or to an industry average, so this is the analyst's sole source of
 * "is this good or bad", and it has to be trustworthy.
 */
export interface AnalystChange {
  stage: number
  label: string
  current: number | null
  previous: number | null
  /** Percent move, positive or negative. Null whenever the pair is not comparable. */
  changePct: number | null
  /** False when comparing the two numbers would mislead. Read `reason` before using them. */
  comparable: boolean
  /** Plain-language why-not, present only when comparable is false. */
  reason?: string
}

/** The complete grounded brief handed to the analyst. */
export interface AnalystPayload {
  business: { name: string; city: string | null; state: string | null }
  window: InsightsWindow
  stages: AnalystStage[]
  /** Same-stage movement vs the previous period. Empty when there is no history. */
  changes: AnalystChange[]
  dropOffs: AnalystDropOff[]
  reputation: { rating: number | null; reviewCount: number | null }
  topSearches: Array<{ query: string; impressions: number }>
  activeCampaignsByStage: Record<string, string[]>
  sources: AnalystSourceSummary
}

// ── Pure derivations (no I/O — unit tested) ──────────────────────────────

/**
 * The drop-off between each pair of consecutive stages that BOTH have a real
 * number and where the earlier stage is > 0. Stages with no data (null headline)
 * break the chain — we never invent a fall-off across a gap we can't see.
 */
export function deriveDropOffs(stages: AnalystStage[]): AnalystDropOff[] {
  const out: AnalystDropOff[] = []
  const withData = stages.filter((s) => s.headline != null && !s.isEmpty) as (AnalystStage & { headline: number })[]
  for (let i = 0; i < withData.length - 1; i++) {
    const from = withData[i]
    const to = withData[i + 1]
    // only chain ADJACENT funnel stages (no leap across a hidden stage)
    if (to.stage - from.stage !== 1) continue
    if (from.headline <= 0) continue
    out.push({
      fromStage: from.stage,
      fromLabel: from.label,
      fromValue: from.headline,
      toStage: to.stage,
      toLabel: to.label,
      toValue: to.headline,
      keptPct: Math.round((to.headline / from.headline) * 1000) / 10,
    })
  }
  return out
}

/** The sources that actually built a stage's headline, as a stable comparable key. */
function countedKey(stage: AnalystStage): string {
  return stage.sources
    .filter((s) => s.counted && s.value != null)
    .map((s) => s.label)
    .sort()
    .join('|')
}

/**
 * Movement per stage vs the previous period, with a hard guard against the trap that
 * makes period comparison dishonest.
 *
 * THE TRAP: if a source started reporting partway through (say GA4 was connected two
 * weeks ago), this period has website numbers and last period does not. The naive read
 * is "visits doubled!" when nothing about the business changed. We cannot detect that
 * from a connected-since date because we do not store one, but we CAN detect it from
 * the data: if the set of sources that fed the headline differs between the two
 * periods, the two headlines are measuring different things and must not be subtracted.
 *
 * So a change is only reported when both periods have a real number built from the
 * exact same sources, and the earlier number is above zero. Everything else is
 * returned as not comparable, with the reason, so the analyst says "I cannot compare
 * this yet" instead of inventing growth.
 */
export function deriveChanges(current: AnalystStage[], previous: AnalystStage[]): AnalystChange[] {
  const prevByStage = new Map(previous.map((s) => [s.stage, s]))
  const out: AnalystChange[] = []
  for (const cur of current) {
    const prev = prevByStage.get(cur.stage)
    const base = { stage: cur.stage, label: cur.label, current: cur.headline, previous: prev?.headline ?? null }
    if (cur.headline == null || !prev || prev.headline == null) {
      out.push({ ...base, changePct: null, comparable: false, reason: 'no number for one of the two periods' })
      continue
    }
    if (countedKey(cur) !== countedKey(prev)) {
      out.push({ ...base, changePct: null, comparable: false, reason: 'different sources fed this stage in each period, so the two numbers are not the same measurement' })
      continue
    }
    if (prev.headline <= 0) {
      out.push({ ...base, changePct: null, comparable: false, reason: 'the earlier period was zero, so a percent change would not mean anything' })
      continue
    }
    out.push({
      ...base,
      changePct: Math.round(((cur.headline - prev.headline) / prev.headline) * 1000) / 10,
      comparable: true,
    })
  }
  return out
}

/**
 * Split every source across all stages into "connected" (a real number is
 * flowing) vs "dark" (exists but isn't feeding the funnel — not connected,
 * errored, or no adapter yet). Deduped by label. This is how the analyst knows
 * its own blind spots and can honestly say "I can't see X."
 */
export function summarizeSources(stages: AnalystStage[]): AnalystSourceSummary {
  const connected = new Set<string>()
  const dark = new Map<string, string>()
  for (const st of stages) {
    for (const s of st.sources) {
      const live = (s.status === 'CONNECTED' || s.status === 'MANUAL_ENTRY') && s.value != null
      if (live) {
        connected.add(s.label)
        dark.delete(s.label) // a label that's live anywhere is not dark
      } else if (!connected.has(s.label) && s.status !== 'CONNECTED') {
        dark.set(s.label, s.status)
      }
    }
  }
  return {
    connected: [...connected],
    dark: [...dark.entries()].map(([label, state]) => ({ label, state })),
  }
}
