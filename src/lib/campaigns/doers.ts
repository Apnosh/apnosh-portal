/**
 * WHO DOES THIS WORK — the one place that answers it.
 *
 * A campaign line can be run by four different doers, and until now every surface
 * worked it out for itself (or, in the team card's case, didn't: it hardcoded
 * "Apnosh" and guessed the crafts by string-matching line names). That's how an
 * AI-built campaign still showed a human team. This module is the single read, so
 * every surface names the same doer for the same line.
 *
 * The mapping, from the two fields that actually encode it:
 *   producer 'ai'                        → Apnosh AI
 *   producer 'diy' + ownerMode 'ai'      → Apnosh AI   (the GBP AI lane: owner-run, AI-drafted)
 *   producer 'diy'                       → You
 *   producer 'creator'                   → an outside creator
 *   producer 'team'                      → the Apnosh team
 *   producer null/undefined              → the Apnosh team (legacy lines; see below)
 *
 * On the null case: `producer` was optional and several creation paths never set
 * it, so most older service lines are NULL. Every consumer happens to test
 * `!== 'diy'`, which made NULL behave exactly like 'team' — correct by accident.
 * We keep that meaning here so nothing shifts, while `serviceToLine`/`serviceToLines`
 * now always stamp 'team' so new lines are never unset. Treating NULL as 'team'
 * is therefore the honest reading of existing data, not a guess.
 */

/** The four real doers. */
export type DoerKind = 'you' | 'ai' | 'apnosh' | 'creator'

/** Just the line fields this module reads — keeps it usable from any surface. */
export interface DoerLine {
  producer?: string | null
  ownerMode?: string | null
  included?: boolean
  /** A REASON string on real lines (OptOutReason), not a flag — any truthy value
   *  means the owner opted this line out. Typed wide so any caller's line fits. */
  optOut?: string | boolean | null
  plain?: string
  name?: string
  serviceId?: string
}

/** The canonical read: which doer owns this one line. */
export function doerOf(it: DoerLine): DoerKind {
  const p = it.producer ?? null
  if (p === 'ai') return 'ai'
  if (p === 'diy') return it.ownerMode === 'ai' ? 'ai' : 'you'
  if (p === 'creator') return 'creator'
  // 'team' and legacy NULL both mean the Apnosh team runs it.
  return 'apnosh'
}

/** Owner-facing label for a line (what the card lists under a doer). */
export function lineLabel(it: DoerLine): string {
  return (it.plain || it.name || it.serviceId || 'This item').trim()
}

/** How each doer introduces itself. `messageable` is false where there is no human
 *  on the other end — you don't message yourself, and you don't message the AI. */
export const DOER_META: Record<DoerKind, { title: string; sub: string; messageable: boolean }> = {
  you: { title: 'You', sub: 'You do this one yourself', messageable: false },
  ai: { title: 'Apnosh AI', sub: 'Drafts it for you. Nothing goes out until you say yes', messageable: false },
  apnosh: { title: 'Apnosh', sub: 'Setup, posting, and the day-to-day', messageable: true },
  creator: { title: 'Your creator', sub: 'Shoots and edits your content', messageable: true },
}

/** Stable display order: your own work first, then the AI, then the people. */
export const DOER_ORDER: DoerKind[] = ['you', 'ai', 'apnosh', 'creator']

export interface DoerGroup {
  kind: DoerKind
  title: string
  sub: string
  messageable: boolean
  /** The included lines this doer handles. */
  lines: DoerLine[]
  /** Their owner-facing names, for listing under the row. */
  labels: string[]
}

/**
 * Group a campaign's live lines by who actually does them. Only included,
 * non-opted-out lines count, and a doer with no lines is omitted entirely —
 * so a campaign the AI runs no longer claims a human team, and a campaign
 * with no owner tasks doesn't show a "You" row.
 */
export function doerGroups(items: DoerLine[] | null | undefined): DoerGroup[] {
  const live = (items ?? []).filter((i) => i.included && !i.optOut)
  const by = new Map<DoerKind, DoerLine[]>()
  for (const it of live) {
    const k = doerOf(it)
    const arr = by.get(k)
    if (arr) arr.push(it)
    else by.set(k, [it])
  }
  return DOER_ORDER
    .filter((k) => (by.get(k)?.length ?? 0) > 0)
    .map((k) => {
      const lines = by.get(k) ?? []
      return { kind: k, ...DOER_META[k], lines, labels: lines.map(lineLabel) }
    })
}
