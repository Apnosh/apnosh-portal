import 'server-only'
/**
 * team/people — the people on your order, as data.
 *
 * The strategist's read: "the people on your order do not exist as data". After assign.ts they do,
 * so this is the read that proves it — for every piece of work still running on this client, the
 * staff person who owns it, what they are on, and the thread to reach them in.
 *
 * Home's people row and the Messages strip both read this, so the two can never disagree about
 * who is on your work; the drill checks "every minted order has a name on it" through the same
 * endpoint, without opening a UI.
 *
 * Where the names come from:
 *   service_work_orders.assignee_id  — stamped at mint (service-work-orders.ts)
 *   creator_work_orders              — a house-team piece has no vendor, so its owner is the
 *                                      campaign's execution.strategistId (work-orders.ts)
 *   creative_requests (desk orders)  — no assignee column; the client's strategist owns them
 *
 * Threads are keyed per BUSINESS + subject, not per person (message_threads, migration 001), so a
 * person carries the business thread that matches their role plus the subject to open, and the UI
 * addresses them by name inside it.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { currentStrategist } from './assign'
import { replyLagMinutesMedian, latestAsk } from './reply-timer'

/** The role words an owner reads. Kept to the four the plan names plus the ones already on the
 *  Team page, so nothing new is invented here. */
export type RoleWord = 'Strategist' | 'Designer' | 'Photographer' | 'Videographer' | 'Writer' | 'Apnosh team'

export interface PersonOrder {
  /** 'service' = a purchased service, 'creator' = a content piece, 'desk' = a request-desk order. */
  kind: 'service' | 'creator' | 'desk'
  id: string
  title: string
  status: string
  dueDate: string | null
  campaignId: string | null
}

export interface OrderPerson {
  id: string
  name: string
  avatarUrl: string | null
  role: RoleWord
  orders: PersonOrder[]
  /** The existing owner↔team thread for this person's role, when one has been started. */
  threadId: string | null
  /** The subject to open (or create) that thread with. Matches the Messages contact subjects. */
  threadSubject: string
}

export interface OrderPeople {
  people: OrderPerson[]
  /** Middle first-reply wait over the last 30 days, in minutes. Null when we do not know yet. */
  replyLagMinutesMedian: number | null
  /** The owner's most recent question and whether it has been answered, so Get help can show
   *  the clock on the thing they are actually waiting for. Null when they never asked. */
  latestAsk: { askedAt: string; answeredAt: string | null } | null
}

/** Work that is still running. A delivered service and an approved piece are finished; nobody is
 *  "on" them any more, so their owner does not belong in the row. */
const SERVICE_DONE = new Set(['delivered'])
const CREATOR_DONE = new Set(['approved', 'declined'])
const DESK_DONE = new Set(['delivered', 'closed', 'declined'])

/** Subject strings the Messages screen uses for each contact (mvp-messages.tsx CONTACTS). Keeping
 *  them identical is what makes a returned threadId open the right conversation. */
const THREAD_SUBJECT: Record<RoleWord, string> = {
  Strategist: 'Your strategist',
  Designer: 'Designer',
  Photographer: 'Photographer',
  Videographer: 'Videographer',
  Writer: 'Your strategist',
  'Apnosh team': 'Support',
}

/** A person's assigned role on this client, in the owner's words. */
const ROLE_WORD: Record<string, RoleWord> = {
  strategist: 'Strategist',
  photographer: 'Photographer',
  videographer: 'Videographer',
  editor: 'Videographer',
  copywriter: 'Writer',
  social_media_manager: 'Writer',
  community_mgr: 'Writer',
  admin: 'Strategist',
}

/** What the WORK implies, used when the person holds no named role on this client. */
const ROLE_OF_DISCIPLINE: Record<string, RoleWord> = {
  Video: 'Videographer',
  Photo: 'Photographer',
  Design: 'Designer',
  Social: 'Writer',
}
const ROLE_OF_REQUEST: Record<string, RoleWord> = {
  graphic: 'Designer', menu: 'Designer', logo: 'Designer', print: 'Designer', website: 'Designer',
  photos: 'Photographer', video: 'Videographer',
  copy: 'Writer', email: 'Writer', social: 'Writer', ads: 'Writer',
  other: 'Strategist',
}

/** What the caller actually draws. The people row is the only thing on Home, and the two
 *  message reads behind `lag` and `ask` are a thousand rows each — nobody should pay for them
 *  to render five faces. Off unless asked for. */
export interface PeopleReads {
  /** the median first-reply wait, for a surface that shows it */
  lag?: boolean
  /** the owner's latest question + whether it is answered, for the Get help clock */
  ask?: boolean
}

/**
 * Every staff person with live work on this client, once each, with what they are on.
 * Best-effort throughout: a table that is not there yet drops its lane, never the answer.
 */
export async function getOrderPeople(clientId: string, reads: PeopleReads = {}): Promise<OrderPeople> {
  const empty: OrderPeople = { people: [], replyLagMinutesMedian: null, latestAsk: null }
  if (!clientId) return empty
  const admin = createAdminClient()

  // A floor on how old a NEVER-ACCEPTED request can be and still put a face on Home. A quote
  // nobody ever answered keeps its status forever, and without a floor it would keep a person
  // on the row for the life of the account. It applies ONLY to that case: a creative_request
  // still sitting at requested / in_review / quoted. An open work order is real work somebody
  // is on, however old it is — a shoot waiting on a season, a program running all year — and
  // cutting those at ninety days took the person off Home while they were still doing the job.
  const QUOTE_FLOOR = new Date(Date.now() - 90 * 86_400_000).toISOString()
  /** a desk request nobody has accepted yet — the only place the floor applies */
  const NEVER_STARTED = new Set(['requested', 'in_review', 'quoted'])

  const [svcRes, creatorRes, deskRes, strategistId, lag, ask] = await Promise.all([
    admin.from('service_work_orders').select('id, title, status, due_date, assignee_id, campaign_id').eq('client_id', clientId).order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? [], () => []),
    admin.from('creator_work_orders').select('id, title, status, due_date, discipline, vendor_id, campaign_id').eq('client_id', clientId).order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? [], () => []),
    admin.from('creative_requests').select('id, type, status, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100).then((r) => r.data ?? [], () => []),
    currentStrategist(admin, clientId).catch(() => null),
    reads.lag ? replyLagMinutesMedian(clientId, 30).catch(() => null) : Promise.resolve(null),
    reads.ask ? latestAsk(clientId).catch(() => null) : Promise.resolve(null),
  ])

  // The person on a house-team content piece is recorded on its campaign, not on the order row.
  const campaignIds = [...new Set((creatorRes as { campaign_id: string | null }[]).map((r) => r.campaign_id).filter((x): x is string => !!x))]
  const stampByCampaign = new Map<string, string>()
  if (campaignIds.length) {
    const { data: camps } = await admin.from('campaigns').select('id, execution').in('id', campaignIds)
    for (const c of (camps ?? []) as { id: string; execution: Record<string, unknown> | null }[]) {
      const sid = (c.execution ?? {}).strategistId
      if (typeof sid === 'string' && sid) stampByCampaign.set(c.id, sid)
    }
  }

  // person id -> their orders, and the role word the work implies when they hold no named role.
  const orders = new Map<string, PersonOrder[]>()
  const impliedRole = new Map<string, RoleWord>()
  const add = (personId: string | null, order: PersonOrder, implied: RoleWord) => {
    if (!personId) return
    const arr = orders.get(personId) ?? []
    arr.push(order)
    orders.set(personId, arr)
    if (!impliedRole.has(personId)) impliedRole.set(personId, implied)
  }

  for (const r of svcRes as { id: string; title: string; status: string; due_date: string | null; assignee_id: string | null; campaign_id: string | null }[]) {
    if (SERVICE_DONE.has(r.status)) continue
    add(r.assignee_id ?? strategistId, { kind: 'service', id: r.id, title: r.title || 'A service', status: r.status, dueDate: r.due_date, campaignId: r.campaign_id }, 'Strategist')
  }
  for (const r of creatorRes as { id: string; title: string; status: string; due_date: string | null; discipline: string; vendor_id: string | null; campaign_id: string | null }[]) {
    if (CREATOR_DONE.has(r.status)) continue
    // A real vendor's own person is the marketplace's business, not this row: only house-team
    // work (no vendor) resolves to a named Apnosh person today.
    if (r.vendor_id) continue
    const owner = (r.campaign_id ? stampByCampaign.get(r.campaign_id) : null) ?? strategistId
    add(owner, { kind: 'creator', id: r.id, title: r.title || r.discipline, status: r.status, dueDate: r.due_date, campaignId: r.campaign_id }, ROLE_OF_DISCIPLINE[r.discipline] ?? 'Strategist')
  }
  if (deskRes.length) {
    const { requestTypeById } = await import('@/lib/requests/catalog')
    for (const r of deskRes as { id: string; type: string; status: string; created_at: string }[]) {
      if (DESK_DONE.has(r.status)) continue
      // the floor, and only here: a quote nobody ever accepted stops being somebody's work
      if (NEVER_STARTED.has(r.status) && r.created_at < QUOTE_FLOOR) continue
      add(strategistId, { kind: 'desk', id: r.id, title: requestTypeById(r.type)?.label ?? r.type, status: r.status, dueDate: null, campaignId: null }, ROLE_OF_REQUEST[r.type] ?? 'Strategist')
    }
  }
  if (!orders.size) return { people: [], replyLagMinutesMedian: lag, latestAsk: ask }

  const personIds = [...orders.keys()]
  const [profilesRes, assignRes, threadRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, avatar_url').in('id', personIds).then((r) => r.data ?? [], () => []),
    admin.from('role_assignments').select('person_id, role').eq('client_id', clientId).is('ended_at', null).in('person_id', personIds).then((r) => r.data ?? [], () => []),
    threadsForClient(admin, clientId),
  ])

  const profile = new Map(((profilesRes) as { id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]).map((p) => [p.id, p]))
  // A person's NAMED role on this account beats the role the work implies: the strategist covering
  // a design order is still your strategist, and we never label an admin "Photographer".
  const named = new Map<string, RoleWord>()
  for (const a of (assignRes) as { person_id: string; role: string }[]) {
    const word = ROLE_WORD[a.role]
    if (word && !named.has(a.person_id)) named.set(a.person_id, word)
  }

  const people: OrderPerson[] = personIds.map((id) => {
    const p = profile.get(id)
    const role = named.get(id) ?? impliedRole.get(id) ?? 'Apnosh team'
    const subject = THREAD_SUBJECT[role]
    return {
      id,
      // Never the email address. A profile with no full_name showed the owner
      // "admin@apnosh.com" as the person on their work; the team name is the honest answer.
      name: (p?.full_name || 'Your Apnosh team') as string,
      avatarUrl: p?.avatar_url ?? null,
      role,
      orders: orders.get(id) ?? [],
      threadId: threadRes.get(subject.toLowerCase()) ?? null,
      threadSubject: subject,
    }
  })
  // Most work first, then a stable name order, so the row does not reshuffle between reads.
  people.sort((a, b) => b.orders.length - a.orders.length || a.name.localeCompare(b.name))
  return { people, replyLagMinutesMedian: lag, latestAsk: ask }
}

/** subject (lowercased) -> thread id, for this client's business threads. */
async function threadsForClient(admin: ReturnType<typeof createAdminClient>, clientId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const { data: biz } = await admin.from('businesses').select('id').eq('client_id', clientId)
    const ids = ((biz ?? []) as { id: string }[]).map((b) => b.id)
    if (!ids.length) return out
    const { data } = await admin
      .from('message_threads')
      .select('id, subject, last_message_at')
      .in('business_id', ids)
      .order('last_message_at', { ascending: false })
      .limit(50)
    for (const t of (data ?? []) as { id: string; subject: string | null }[]) {
      const key = (t.subject ?? '').trim().toLowerCase()
      if (key && !out.has(key)) out.set(key, t.id)
    }
  } catch (e) {
    console.warn('[team] thread lookup failed:', (e as Error)?.message)
  }
  return out
}
