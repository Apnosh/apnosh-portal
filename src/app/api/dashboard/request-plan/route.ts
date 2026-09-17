/**
 * /api/dashboard/request-plan — the request sheet for the creative tiles (owner 2026-09-17,
 * "build it anyway").
 *
 * GET ?clientId=&type= : what we know before asking. Whether a brand file is on hand, how many
 *   photos are on file, the last order of this type, the usual tier, and the price of every
 *   level from the same sheets the desk charges. Plus the turnaround, in days, from the table
 *   the campaign builder keeps.
 *
 * POST { clientId, type, answers, level, tier, attachments, dueDate } : the order, made real
 *   through the one function the desk uses, and a plan: the brief today, the first draft, you
 *   approve, delivered, then the send-off when it is a picture or a video. Recorded on an
 *   announcements row (kind 'request') so the results engine and Coming up follow it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCreativeRequest, graphicOrderCents } from '@/lib/requests/create'
import { priceCreativeRequest } from '@/lib/requests/pricing'
import { getActiveRateCard } from '@/lib/design/price-sheet'
import { DESTINATIONS } from '@/lib/design/destinations'
import { SERVICE_TURNAROUND } from '@/lib/campaigns/data/service-turnaround'
import { withTurnaround } from '@/lib/plan/turnaround'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES = ['graphic', 'video', 'photos', 'print', 'logo', 'website'] as const
type RType = (typeof TYPES)[number]
const SERVICE_OF: Record<RType, string> = { graphic: 'graphic', video: 'video-single', photos: 'photo-library', print: 'capture-kit', logo: 'brand-kit', website: 'landing-page' }
const day = (d: Date) => d.toISOString().slice(0, 10)
const addBiz = (from: Date, n: number) => { const d = new Date(from); let left = n; while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left -= 1 } return d }
const isHttps = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://')

function turnaround(type: RType): { min: number; max: number; shoot: boolean } {
  const t = SERVICE_TURNAROUND[SERVICE_OF[type]]
  if (!t) return { min: 3, max: 5, shoot: false }
  if (t.class === 'recurring') return { min: t.startsWithin.min, max: t.startsWithin.max, shoot: false }
  return { min: t.business.min, max: t.business.max, shoot: t.class === 'creative' && !!t.needsShoot }
}

/** the price of each level, from the desk's own sheet, for the answers so far */
async function prices(type: RType, answers: Record<string, string>) {
  if (type === 'graphic') {
    const card = await getActiveRateCard().catch(() => null)
    if (!card) return null
    const labels = String(answers.where ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    const ids = DESTINATIONS.filter((d) => labels.includes(d.label)).map((d) => d.id)
    const dests = ids.length ? ids : ['instagram-post', 'facebook-post']
    const photos = answers._photos === 'own' ? 'own' : 'none'
    return { 1: graphicOrderCents({ destinations: dests, tier: 1, photos }, card.card), 2: graphicOrderCents({ destinations: dests, tier: 2, photos }, card.card), 3: graphicOrderCents({ destinations: dests, tier: 3, photos }, card.card) }
  }
  const std = priceCreativeRequest(type, { ...answers, level: 'Standard', when: 'No rush' })
  const works = priceCreativeRequest(type, { ...answers, level: 'The works', when: 'No rush' })
  return { standard: std?.totalCents ?? null, works: works?.totalCents ?? null, startsAt: !!std?.startsAt }
}

async function context(clientId: string, type: RType, answers: Record<string, string>) {
  const admin = createAdminClient()
  const [client, biz, assets, menu, last, brandFiles] = await Promise.all([
    admin.from('clients').select('name, design_prefs, website').eq('id', clientId).maybeSingle(),
    admin.from('businesses').select('id, brand_voice_words').eq('client_id', clientId).maybeSingle(),
    admin.from('assets').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('type', 'image'),
    admin.from('menu_items').select('id', { count: 'exact', head: true }).eq('client_id', clientId).not('photo_url', 'is', null),
    admin.from('creative_requests').select('id, type, status, created_at, quote_cents, brief').eq('client_id', clientId).eq('type', type).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('brand_assets').select('id', { count: 'exact', head: true }),
  ])
  const prefs = ((client.data?.design_prefs as Record<string, unknown> | null) ?? {})
  const bizId = biz.data?.id as string | undefined
  let brandCount = 0
  if (bizId) { const { count } = await admin.from('brand_assets').select('id', { count: 'exact', head: true }).eq('business_id', bizId); brandCount = count ?? 0 }
  void brandFiles
  const ta = turnaround(type)
  const dueDefault = day(addBiz(new Date(), ta.max + (ta.shoot ? 5 : 1)))
  return {
    name: (client.data?.name as string | undefined)?.trim() || 'your restaurant',
    brandFile: prefs.brandMode === 'file' || brandCount > 0,
    brandFiles: brandCount,
    usualTier: typeof prefs.tier === 'number' ? (prefs.tier as number) : null,
    photosOnFile: (assets.count ?? 0) + (menu.count ?? 0),
    hasSite: !!client.data?.website,
    lastOrder: last.data ? { id: String(last.data.id), status: String(last.data.status), at: String(last.data.created_at), cents: (last.data.quote_cents as number | null) ?? null } : null,
    turnaround: ta,
    dueDefault,
    prices: await prices(type, answers),
  }
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  const type = req.nextUrl.searchParams.get('type') as RType | null
  if (!clientId || !type || !TYPES.includes(type)) return NextResponse.json({ error: 'clientId and type required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const answers: Record<string, string> = {}
  for (const [k, v] of req.nextUrl.searchParams.entries()) if (k.startsWith('a.') && v) answers[k.slice(2)] = v.slice(0, 300)
  return NextResponse.json(await context(clientId, type, answers), { headers: { 'Cache-Control': 'no-store' } })
}

interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: 'scheduled' | 'with_team' | 'needs_payment' | 'done' | 'later'; ref: { kind: string; id: string | null; href?: string } | null; why?: string }

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; type?: string; answers?: Record<string, unknown>; level?: string; tier?: number; attachments?: unknown; dueDate?: string; whys?: Record<string, unknown> }
  const clientId = body.clientId
  const type = body.type as RType
  if (!clientId || !type || !TYPES.includes(type)) return NextResponse.json({ error: 'clientId and type required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized || !access.userId) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const userId = access.userId
  const admin = createAdminClient()
  const answers: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.answers ?? {})) if (typeof v === 'string' && v.trim()) answers[k] = v.trim().slice(0, 600)
  const level = body.level === 'works' ? 'The works' : 'Standard'
  const tier = body.tier === 1 || body.tier === 3 ? body.tier : 2
  const dueDate = typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : null
  const attachments = (Array.isArray(body.attachments) ? body.attachments : []).filter((a) => a && typeof a === 'object' && isHttps((a as { url?: unknown }).url)).slice(0, 10) as { url: string; name?: string }[]
  const whys: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.whys ?? {})) if (typeof v === 'string' && v.trim()) whys[k] = v.trim().slice(0, 140)
  const ctx = await context(clientId, type, answers)
  const ta = ctx.turnaround
  const today = day(new Date())

  /* the order lane for the priced types; website and branding are quotes the team agrees in the thread */
  const priced = type === 'graphic' || type === 'video' || type === 'photos' || type === 'print'
  const desk = await createCreativeRequest({
    clientId, userId, type, order: priced, due_date: dueDate,
    attachments: attachments.map((a, i) => ({ url: a.url, name: a.name ?? `file-${i + 1}` })),
    answers: { ...answers, ...(type !== 'graphic' ? { level } : {}), when: (() => { if (!dueDate) return 'No rush'; const d = Math.round((Date.parse(dueDate) - Date.now()) / 86400000); return d <= 7 ? 'This week' : d <= 14 ? 'In 2 weeks' : d <= 31 ? 'This month' : 'No rush' })() },
    design: type === 'graphic' ? { destinations: (() => { const labels = String(answers.where ?? '').split(',').map((x) => x.trim()); const ids = DESTINATIONS.filter((d) => labels.includes(d.label)).map((d) => d.id); return ids.length ? ids : ['instagram-post', 'facebook-post'] })(), tier, photos: attachments.length ? 'own' : 'none', dueDateISO: dueDate ?? undefined, brand: ctx.brandFile ? 'file' : 'none' } : undefined,
  })
  if (!desk.ok) return NextResponse.json({ error: desk.error }, { status: desk.status })

  const plan: Line[] = []
  const href = `/dashboard/requests/${desk.row.id}`
  const firstDraft = day(addBiz(new Date(), Math.max(1, ta.min - 1)))
  const delivered = dueDate ?? day(addBiz(new Date(), ta.max))
  const cost = desk.orderCents
  plan.push({ key: 'brief', label: desk.needsPayment ? 'The brief is in. Pay to start' : 'The brief is in, the work starts', detail: desk.needsPayment ? `${desk.assigned} takes it the moment the card clears` : `${desk.assigned} has it`, date: today, cost, status: desk.needsPayment ? 'needs_payment' : 'with_team', ref: { kind: 'request', id: desk.row.id, href }, why: whys.brief })
  if (ta.shoot) plan.push({ key: 'shootday', label: 'The shoot day', detail: 'We pick it with you in the thread. Five to ten days out is usual', date: null, cost: null, status: 'later', ref: { kind: 'request', id: desk.row.id, href } })
  plan.push({ key: 'draft', label: type === 'website' ? 'The first pages' : type === 'logo' ? 'The first concepts' : 'The first draft', detail: type === 'graphic' ? `${tier === 1 ? 'One concept' : tier === 3 ? 'Three concepts' : 'Two concepts'} to pick from` : level === 'The works' ? 'The works: more concepts, a senior hand' : 'One direction, done well', date: ta.shoot ? null : firstDraft, cost: null, status: 'later', ref: { kind: 'request', id: desk.row.id, href } })
  plan.push({ key: 'approve', label: 'You approve it', detail: `${tier === 1 || level === 'Standard' ? 'One round' : 'Two rounds'} of changes included`, date: null, cost: null, status: 'later', ref: { kind: 'request', id: desk.row.id, href }, why: whys.approve })
  plan.push({ key: 'delivered', label: 'Delivered', detail: type === 'photos' ? 'Every file in your Photos and files' : type === 'video' ? 'The cut, in your Photos and files' : type === 'website' ? 'Live on your address' : type === 'logo' ? 'The files, for print and web' : 'The files, ready to use', date: delivered, cost: null, status: 'later', ref: { kind: 'request', id: desk.row.id, href }, why: whys.delivered })
  if (type === 'graphic' || type === 'video' || type === 'photos') plan.push({ key: 'sendoff', label: 'Then post it', detail: 'Approve it and it goes out through the send-off, with the words written', date: delivered, cost: null, status: 'later', ref: { kind: 'page', id: null, href: '/dashboard/insights/coming-up' }, why: 'A picture nobody sees did not happen' })
  if (type === 'print') plan.push({ key: 'printing', label: 'Printing and shipping', detail: answers.printing === 'Just the design file' ? 'Not this time, you asked for the file' : 'The team quotes the run in the thread', date: null, cost: null, status: 'later', ref: { kind: 'request', id: desk.row.id, href } })
  const shaped = withTurnaround(plan)

  const { data: row } = await admin.from('announcements').insert({
    client_id: clientId, kind: 'request', status: 'in_progress',
    answers: { what: answers.what || answers.scope || `${type} request`, type, level: type === 'graphic' ? `Tier ${tier}` : level },
    picture: { mediaUrls: attachments.map((a) => a.url) }, timing: { dueDate }, plan: shaped, total_cents: cost ?? 0, created_by: userId,
  }).select('id').single()
  return NextResponse.json({ ok: true, id: (row?.id as string | undefined) ?? null, requestId: desk.row.id, needsPayment: desk.needsPayment, cost, plan: shaped, errors: [] })
}
