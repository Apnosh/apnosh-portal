/**
 * handover — a website order ends in a domain the owner holds.
 *
 * A site or landing page is the one delivery where "done" is not a file. Things have to change
 * hands: the domain, the DNS, the hosting login, the analytics account. Before this, delivery was
 * a proof link and a promise, and an owner could be delighted on Tuesday and locked out in a year
 * because the domain sat in an Apnosh account nobody wrote down.
 *
 * WHERE IT APPLIES, and where it deliberately does not. The checklist is keyed to WEBSITE work —
 * the desk's 'website' order and the site-menu service — not to every playbook that ends in "hand
 * over". A photo library hands over too, and it has no domain, no DNS and no hosting login; a
 * checklist of four rows that never apply is noise a person learns to tick without reading, which
 * is worse than no checklist. When another service starts handing over an account, it is added
 * here by name.
 *
 * Pure + client-safe (no I/O, no clock beyond what the caller passes), so the admin screen, the
 * owner's order page, the delivery guard and a script all read one truth.
 */

export interface HandoverItem {
  id: string
  /** What changes hands, in the owner's words. */
  label: string
  /** Why it matters to them — this is the sentence that makes the tick worth doing. */
  why: string
  /** A required item must be ticked before the order can be delivered. */
  required: boolean
}

/** One ticked item, as stored on the work order's `handover` jsonb. */
export interface HandoverMark {
  id: string
  done: boolean
  doneAt?: string
  /** Where it went, in a few words: "in Mia's GoDaddy", "mia@ is the owner". */
  note?: string
}

/** The stored shape: `{ items: HandoverMark[] }` on service_work_orders / creator_work_orders. */
export interface HandoverState { items: HandoverMark[] }

/**
 * The four things a website hands over, plus the one that names who holds them.
 *
 * Every item is REQUIRED except analytics, which some owners genuinely do not have and should not
 * be blocked on — a required item nobody can satisfy turns into a tick made to clear a screen.
 */
export const WEBSITE_HANDOVER: HandoverItem[] = [
  { id: 'domain', label: 'The domain is in the owner\'s name', why: 'The address of their business belongs to them, not to us. If we part ways, the site keeps working.', required: true },
  { id: 'dns', label: 'DNS is written down and reachable', why: 'Where the domain points, and how to change it. Without this a broken site is a week of phone calls.', required: true },
  { id: 'hosting', label: 'The hosting login is theirs', why: 'The account the site actually lives in, with their email on it.', required: true },
  { id: 'analytics', label: 'Analytics is on their Google account', why: 'So the visits are counted on an account they keep.', required: false },
  { id: 'owner', label: 'Who owns what, written on the order', why: 'One note saying which account holds which piece, so nobody has to remember.', required: true },
]

/**
 * The checklist for a piece of work, or [] when this delivery hands nothing over.
 *
 * @param serviceId  a catalog service id ('site-menu'), or a desk type as 'request:<type>'
 */
export function handoverFor(serviceId: string | null | undefined): HandoverItem[] {
  const id = (serviceId ?? '').trim()
  if (!id) return []
  if (id === 'site-menu' || id === 'website-care') return WEBSITE_HANDOVER
  if (id === 'request:website') return WEBSITE_HANDOVER
  return []
}

/** The stored marks, read defensively — the column is jsonb and may hold anything or nothing. */
export function readHandover(raw: unknown): HandoverMark[] {
  if (!raw || typeof raw !== 'object') return []
  const items = (raw as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  return items
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string')
    .map((m) => ({
      id: String(m.id),
      done: m.done === true,
      doneAt: typeof m.doneAt === 'string' ? m.doneAt : undefined,
      note: typeof m.note === 'string' ? m.note.slice(0, 300) : undefined,
    }))
}

/** Merge one tick onto what is stored. Authored text is never stored, so it can never be rewritten. */
export function markHandover(raw: unknown, patch: { id: string; done?: boolean; note?: string }, nowISO: string): HandoverState {
  const items = readHandover(raw)
  const existing = items.find((m) => m.id === patch.id)
  const done = patch.done ?? existing?.done ?? false
  const next: HandoverMark = {
    id: patch.id,
    done,
    // The day it changed hands is stamped once and kept: un-ticking clears it, because an
    // untrue date is worse than none.
    doneAt: done ? existing?.doneAt ?? nowISO : undefined,
    note: patch.note !== undefined ? patch.note.slice(0, 300) : existing?.note,
  }
  return { items: [...items.filter((m) => m.id !== patch.id), next] }
}

/** How the owner reads it: every item, with the ones that are done marked. */
export function handoverProgress(serviceId: string | null | undefined, raw: unknown): {
  items: (HandoverItem & { done: boolean; doneAt?: string; note?: string })[]
  doneCount: number
  requiredOpen: HandoverItem[]
} {
  const spec = handoverFor(serviceId)
  const marks = new Map(readHandover(raw).map((m) => [m.id, m]))
  const items = spec.map((it) => {
    const m = marks.get(it.id)
    return { ...it, done: m?.done === true, doneAt: m?.doneAt, note: m?.note }
  })
  return {
    items,
    doneCount: items.filter((i) => i.done).length,
    requiredOpen: items.filter((i) => i.required && !i.done),
  }
}

/**
 * The delivery guard: a website order is not delivered until every required item is ticked.
 *
 * Sits beside deliverGuard (proof link + every step done) rather than inside it, because this is a
 * different promise: the steps say the work was done, this says the owner holds it.
 */
export function handoverGuard(serviceId: string | null | undefined, raw: unknown): { ok: true } | { ok: false; reason: string } {
  const open = handoverProgress(serviceId, raw).requiredOpen
  if (!open.length) return { ok: true }
  const names = open.map((i) => i.label).slice(0, 3).join(', ')
  return { ok: false, reason: `The handover is not finished: ${names}${open.length > 3 ? '…' : ''}. The owner has to hold these before this can be marked delivered.` }
}
