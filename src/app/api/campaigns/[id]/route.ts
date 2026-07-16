import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaign, replaceLineItems, updateCampaignFields, deleteCampaign, materializeCampaignDrafts, getCampaignProgress } from '@/lib/campaigns/server'
import { mintWorkOrders, clearCampaignBriefCache, getCampaignCharges, campaignHasAccruedMoney, reconcileCampaignProduction } from '@/lib/campaigns/work-orders'
import { mintServiceWorkOrders } from '@/lib/campaigns/service-work-orders'
import { planCampaignPieces } from '@/lib/campaigns/work-orders-core'
import { getCampaignOutcomes } from '@/lib/campaigns/outcomes/read'
import { getCampaignPieces } from '@/lib/campaigns/tracker/pieces'
import { getCampaignActivity } from '@/lib/campaigns/tracker/activity'
import { getCampaignReadiness } from '@/lib/campaigns/readiness'
import { getCampaignPayment } from '@/lib/campaigns/campaign-payments-server'
import { getConfirmedBookingForCampaign } from '@/lib/campaigns/gates/booking-server'
import { verifyAndLinkCheckoutPayment } from '@/lib/campaigns/checkout-server'
import { checkoutBill } from '@/lib/campaigns/checkout-bill'
import { shipBillingGate, SHIP_NEEDS_PAYMENT } from '@/lib/campaigns/ship-guard'
import { beatsFromLines } from '@/lib/campaigns/catalog'
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { notifyStaffForClient } from '@/lib/notifications'
import type { LineItem, PieceProducer } from '@/lib/campaigns/types'

async function authorize(id: string) {
  const campaign = await getCampaign(id)
  if (!campaign) return { campaign: null, res: NextResponse.json({ error: 'not found' }, { status: 404 }) }
  const access = await checkClientAccess(campaign.clientId)
  if (!access.authorized) return { campaign, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { campaign, res: null }
}

// GET /api/campaigns/:id — full campaign (items + brief).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { campaign, res } = await authorize(id)
  if (res) return res
  // Only shipped (or stopped — the settlement view still needs its charges/
  // progress/history), team-run campaigns have materialized pieces; skip the
  // queries for drafts and DIY.
  const shipped = !!campaign && (campaign.status === 'shipped' || campaign.status === 'stopped')
  const shippedTeamRun = shipped && campaign!.draft.path !== 'diy'
  // Outcomes apply to any shipped campaign with published pieces (team or DIY); progress/
  // charges are team-run only. Each read is best-effort so one failure never blanks the page.
  const [progress, charges, outcomes, pieces, activity, readiness, payment, booking] = await Promise.all([
    shippedTeamRun ? getCampaignProgress(id).catch(() => null) : Promise.resolve(null),
    shippedTeamRun ? getCampaignCharges(id).catch(() => null) : Promise.resolve(null),
    shipped ? getCampaignOutcomes(id).catch(() => null) : Promise.resolve(null),
    shipped ? getCampaignPieces(id).catch(() => null) : Promise.resolve(null),
    shipped ? getCampaignActivity(id).catch(() => null) : Promise.resolve(null),
    shipped ? getCampaignReadiness(id).catch(() => null) : Promise.resolve(null),
    // The upfront charge-at-checkout receipt (paid at order time), if any.
    shipped ? getCampaignPayment(id).catch(() => null) : Promise.resolve(null),
    // The confirmed shoot booking (Checkout Gates), if this order picked a date at checkout.
    shipped ? getConfirmedBookingForCampaign(id).catch(() => null) : Promise.resolve(null),
  ])
  return NextResponse.json({ campaign, progress, charges, outcomes, pieces, activity, readiness, payment, booking })
}

// PATCH /api/campaigns/:id — { items?: LineItem[], fields?: {...} }.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { campaign, res } = await authorize(id)
  if (res || !campaign) return res ?? NextResponse.json({ error: 'not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  // Whitelist writable columns: fields is spread into a service-role UPDATE on campaigns,
  // so an unlisted key (client_id, confirmed_at, created_at, …) must never pass through —
  // it would let an authenticated owner move tenants or self-confirm past the admin gate.
  const WRITABLE_FIELDS = new Set(['name', 'budget_monthly', 'planned', 'phase', 'status', 'shipped_at', 'occasion', 'target_date', 'context', 'creator_choices', 'producer_choices', 'creative_control', 'execution'])
  if (body.fields !== undefined) {
    if (typeof body.fields !== 'object' || body.fields === null || Array.isArray(body.fields)) return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
    for (const k of Object.keys(body.fields)) {
      if (!WRITABLE_FIELDS.has(k)) return NextResponse.json({ error: `field '${k}' cannot be written` }, { status: 400 })
    }
    // The only status an owner can set here is 'shipped'. Un-shipping would re-fire the
    // one-shot ship block on the next ship and dodge the admin confirmation.
    if (body.fields.status !== undefined && body.fields.status !== 'shipped') {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
  }
  // Validate the enum'd field so a bad value is a clean 400, not a DB-check 500.
  if (body.fields?.creative_control && !['handoff', 'approve_concept', 'owner_directs'].includes(body.fields.creative_control)) {
    return NextResponse.json({ error: 'invalid creative_control' }, { status: 400 })
  }
  // Sanitize execution: only the known string keys, length-capped — so unbounded
  // or instruction-injected text can never reach the creative-brief AI prompt.
  if (body.fields?.execution !== undefined) {
    const e = body.fields.execution
    if (typeof e !== 'object' || e === null || Array.isArray(e)) return NextResponse.json({ error: 'invalid execution' }, { status: 400 })
    const clean: Record<string, string> = {}
    // Creative-brief keys + operational setup-intake keys (CampaignExecution). Only listed keys
    // persist; anything else is dropped, so unbounded/injected text can never accrete or reach a prompt.
    // Deliberately NOT here (owner-forgery-proof, like wrapUpSentAt): gbpFixedAt — the self-serve
    // Google-profile task's completion stamp is written only by POST /api/campaigns/:id/gbp-fixed,
    // which re-runs the diagnosis server-side and stamps only on a fresh all-good read.
    // Known keys, plus owner-defined custom asks (id `custom-<slug>` from the campaign builder).
    // Custom keys still pass the same string + 2000-char cap, so nothing unbounded/injected accretes.
    const KNOWN = new Set(['featuring', 'offerText', 'mustSay', 'avoid', 'postNotes', 'shootTimes', 'blackoutDates', 'onSiteContact', 'accessNotes', 'bestReach', 'filmStaff', 'socialHandles', 'orderingLink', 'setupNotes', 'vendorInfo', 'menuSource', 'setupSkipped'])
    for (const k of Object.keys(e as Record<string, unknown>)) {
      if (!KNOWN.has(k) && !/^custom-[a-z0-9-]{1,60}$/.test(k)) continue
      const v = (e as Record<string, unknown>)[k]
      if (v === undefined) continue
      if (typeof v !== 'string') return NextResponse.json({ error: `execution.${k} must be a string` }, { status: 400 })
      if (v.length > 2000) return NextResponse.json({ error: `execution.${k} is too long (2000 max)` }, { status: 400 })
      clean[k] = v
    }
    body.fields.execution = clean
  }
  // Validate producer_choices: a bounded map of pieceKey → the service ('team' |
  // 'creator' | 'diy' | 'ai'). The key mirrors planCampaignPieces: the beat's own stable
  // id when it has one (the Walk's b<n>/b<epoch> ids, a Content-Menu line id), else the
  // legacy positional "<group>:<slot>" where group is a discipline (Video/Photo/…) for
  // shots or the content type (email/sms/…) for sends. Accept BOTH shapes — rejecting
  // the id shape silently threw away every creator/AI/DIY pick made in the Walk.
  // Cap the count + pin the shape so a bad/oversized payload can't accrete junk jsonb.
  const PIECE_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}(?::\d{1,3})?$/
  const PRODUCERS = new Set(['team', 'creator', 'diy', 'ai'])
  if (body.fields?.producer_choices !== undefined) {
    // The mint is one-shot at ship, so a post-ship change would silently no-op —
    // fail loudly instead of round-tripping a choice that changes no production.
    if (campaign.status === 'shipped') return NextResponse.json({ error: 'service choices are locked once the campaign has shipped' }, { status: 409 })
    const pc = body.fields.producer_choices
    if (typeof pc !== 'object' || pc === null || Array.isArray(pc)) return NextResponse.json({ error: 'invalid producer_choices' }, { status: 400 })
    const entries = Object.entries(pc as Record<string, unknown>)
    if (entries.length > 64) return NextResponse.json({ error: 'too many producer_choices (64 max)' }, { status: 400 })
    const clean: Record<string, PieceProducer> = {}
    for (const [k, v] of entries) {
      if (!PIECE_KEY.test(k)) return NextResponse.json({ error: `producer_choices key '${k}' is not a valid piece key` }, { status: 400 })
      if (typeof v !== 'string' || !PRODUCERS.has(v)) return NextResponse.json({ error: `producer_choices.${k} must be team, creator, diy, or ai` }, { status: 400 })
      clean[k] = v as PieceProducer
    }
    body.fields.producer_choices = clean
  }
  // Detect the ship transition BEFORE the write (campaign holds the pre-update state),
  // then CLAIM it atomically inside the update (guarded on status <> 'shipped') so two
  // concurrent ship PATCHes (double-tap, retry, two tabs) can never both run the
  // one-shot mint/notify block below — the loser's guarded update matches zero rows.
  const wantsShip = body.fields?.status === 'shipped' && campaign.status !== 'shipped'

  // ── G7 (hardened for the ONE pay-first model, owner decision B): payment-aware ship.
  // Every billable campaign ships through the upfront checkout, which threads the paid PaymentIntent
  // into this PATCH. shipBillingGate decides:
  //   'allow'  → free/DIY $0 order, or a genuinely legacy pre-checkout campaign (dated carve-out)
  //   'verify' → a PaymentIntent was presented → confirm the charge succeeded + covers the bill, or 402
  //   'refuse' → a billable, non-legacy ship with NO payment → block (it must go through checkout)
  if (wantsShip) {
    const preTaxCents = checkoutBill({ items: campaign.draft.items }).preTaxCents
    const paymentIntentId = typeof body.paymentIntentId === 'string' ? body.paymentIntentId : undefined
    const gate = shipBillingGate({ preTaxCents, hasPaymentIntent: !!paymentIntentId, createdAtISO: campaign.createdAt })
    if (gate === 'refuse') return NextResponse.json({ error: SHIP_NEEDS_PAYMENT }, { status: 402 })
    if (gate === 'verify') {
      const verified = await verifyAndLinkCheckoutPayment({ paymentIntentId: paymentIntentId!, clientId: campaign.clientId, campaignId: id, preTaxCents })
      if (!verified.ok) return NextResponse.json({ error: verified.reason }, { status: 402 })
    }
  }

  let justShipped = false
  try {
    if (Array.isArray(body.items)) await replaceLineItems(id, campaign.clientId, body.items as LineItem[])
    if (body.fields && typeof body.fields === 'object') {
      const applied = await updateCampaignFields(id, body.fields, { onlyIfNotShipped: wantsShip })
      justShipped = wantsShip && applied
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 500 })
  }
  // Keep the in-memory campaign authoritative for materialize + mint: the ship
  // re-sends the owner's last-seen creator picks, covering a swallowed save.
  if (body.fields?.creator_choices && typeof body.fields.creator_choices === 'object') {
    campaign.creatorChoices = body.fields.creator_choices as Record<string, string>
  }
  // Regenerate the briefs only when a brief-relevant input actually changed
  // (vs the pre-update execution), so an unrelated/no-op save costs nothing.
  if (body.fields?.execution) {
    const delta = body.fields.execution as Record<string, string>
    const cur = (campaign.execution ?? {}) as Record<string, string>
    const changed = ['featuring', 'offerText', 'mustSay', 'avoid'].some((k) => k in delta && (delta[k] ?? '') !== (cur[k] ?? ''))
    if (changed) await clearCampaignBriefCache(id).catch(() => {})
  }
  // The owner shipping a team-run campaign is the handoff signal: tell the staff
  // assigned to this client so the "your team is preparing each piece" promise is
  // real. DIY ships are owner-run, so no handoff. Best-effort; never blocks save.
  if (justShipped && campaign.draft.path !== 'diy') {
    // Turn the campaign's content calendar into real production work items, and
    // tell the team. Both best-effort: a successful ship must never 500 here.
    const shipISO = typeof body.fields?.shipped_at === 'string' ? body.fields.shipped_at : new Date().toISOString()
    // Lock estimate-mode dates at ship: with no target date or occasion,
    // deriveSchedule re-anchors to "now" on every call, so the dates the owner
    // approved would drift forward by the review→ship gap. Persist the anchor as
    // target_date so calendar, drafts, and orders all agree from here on.
    // A menu campaign has no brief, so its calendar is derived from its lines — anchor
    // off THOSE beats, else every later edit re-anchors to a fresh "now" and churns
    // every piece's due date through the reconcile.
    if (!campaign.draft.targetDate && !campaign.draft.occasion) {
      const beats = (campaign.draft.brief?.contentBeats?.length ?? 0) > 0
        ? campaign.draft.brief!.contentBeats
        : beatsFromLines((campaign.draft.items ?? []).filter((it) => it.included))
      if (beats.length > 0) {
        const anchor = deriveSchedule({ contentBeats: beats }, shipISO).firstPostISO
        if (anchor) {
          await updateCampaignFields(id, { target_date: anchor }).catch(() => {})
          campaign.draft.targetDate = anchor
        }
      }
    }
    // One plan, two lanes: team pieces become content_drafts, creator pieces
    // become orders — each piece in exactly one lane. Computing both expectations
    // up front lets each dead-letter below fire only when its OWN lane dropped
    // work, now that a 0 from either side can be legitimate (all-team / all-creator).
    const pieces = planCampaignPieces(campaign, shipISO)
    // AI pieces land in the team lane too (materializeCampaignDrafts creates them and the
    // team finalizes the AI first draft) — count them, or an ai-heavy campaign's failed
    // materialize slips past the dead-letter and its handoff never fires.
    const expectedTeam = pieces.filter((p) => p.producer === 'team' || p.producer === 'ai').length
    const expectedOrders = pieces.filter((p) => p.producer === 'creator' && p.creatorId).length
    const made = await materializeCampaignDrafts(campaign, shipISO).catch(() => 0)
    // Dispatch the creator-run pieces to the chosen creators' inboxes (the supply
    // side). Best-effort; never blocks the ship.
    const minted = await mintWorkOrders(campaign, shipISO).catch(() => 0)
    // Every included service line (the non-content half of the plan — gbp-setup, listings, SEO,
    // ads, ...) becomes a service work order the team claims and works through its playbook. This
    // is what closes the audit's #1 gap: services used to mint NOTHING and had no "done". Idempotent
    // + best-effort; a failure here must never break the ship.
    const swo = await mintServiceWorkOrders(campaign, shipISO).catch(() => ({ minted: 0, expected: 0, error: 'threw' }))
    // Work this ship hands to Apnosh: any included, non-opted-out line the owner is NOT
    // running themselves. A pure owner-run plan (every line producer 'diy', e.g. the free
    // self-serve gbp version) creates no order to review and nothing for a team to build.
    const teamWork = (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && it.producer !== 'diy')
    if (teamWork) {
      // Every fresh REAL order lands in the admin confirmation queue: notify the admins so a
      // human reviews + confirms it (/admin/campaign-orders sets confirmed_at). Best-effort.
      ;(async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const { getAdminUserIds, notifyCampaignOrderShipped } = await import('@/lib/notify')
        const svc = createAdminClient()
        const [adminIds, client] = await Promise.all([
          getAdminUserIds(svc),
          svc.from('clients').select('name').eq('id', campaign.clientId).maybeSingle().then((r) => r.data),
        ])
        if (adminIds.length) await notifyCampaignOrderShipped(svc, adminIds, (client?.name as string) ?? 'A client', campaign.draft.name)
      })().catch(() => {})
    } else {
      // Nothing for a human to review or build: self-confirm at ship so admins are never
      // paged about a $0 self-serve order and the owner never reads "your team is looking
      // it over" about work only they will do. Guarded (first write only) + best-effort;
      // pre-migration-189 rows without confirmed_at just stay unconfirmed.
      ;(async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        await createAdminClient().from('campaigns').update({ confirmed_at: shipISO }).eq('id', id).is('confirmed_at', null)
      })().catch(() => {})
    }
    // Only hand off to staff when there is actually team/creator work to build. A menu
    // campaign whose pieces are all DIY (the owner makes them) is path 'ai' but produces
    // nothing for the team, so the path-based gate above isn't enough.
    if (expectedTeam > 0 || expectedOrders > 0) {
      await notifyStaffForClient(
        campaign.clientId,
        ['strategist', 'community_mgr'],
        {
          kind: 'client_signoff',
          title: 'Owner shipped a campaign, ready to build',
          body: `${campaign.draft.name}. The owner approved it to go live. Build and run the pieces.`,
          link: `/work/drafts?focus=${id}`,
        },
      ).catch(() => ({ notified: 0 }))
    } else if (teamWork) {
      // A service-only plan (SEO, listings, ads — the system goals sell mostly services,
      // not content pieces) mints nothing in either lane, so without this branch the ship
      // reached NOBODY on the Apnosh side: no work item, no handoff, a paid order in a
      // void. Until services get real work items, this handoff IS the work signal.
      // Opted-out and owner-run (producer 'diy', e.g. the free self-serve gbp version) lines
      // are NOT team work — a pure owner-run plan must not page the staff.
      const n = (campaign.draft.items ?? []).filter((it) => it.included && !it.optOut && it.producer !== 'diy').length
      await notifyStaffForClient(
        campaign.clientId,
        ['strategist', 'community_mgr'],
        {
          kind: 'client_signoff',
          title: 'Owner shipped a service plan, set it up',
          body: `${campaign.draft.name}. ${n} ${n === 1 ? 'service' : 'services'} to set up and run. No content pieces to build.`,
          link: `/work/today?focus=${id}`,
        },
      ).catch(() => ({ notified: 0 }))
    }
    // Dead-letter: the campaign had TEAM pieces to produce but made none (the
    // silent-drop bug) gets flagged for manual setup, never vanishes.
    if (made === 0 && expectedTeam > 0) {
      await notifyStaffForClient(campaign.clientId, ['strategist'], {
        kind: 'client_signoff',
        title: 'Campaign shipped but produced no work items',
        body: `${campaign.draft.name} shipped, but no content pieces were created. Set it up manually.`,
        link: `/work/drafts?focus=${id}`,
      }).catch(() => ({ notified: 0 }))
    }
    // Dead-letter: the campaign had creative work to dispatch but no creator
    // order was minted (transient insert error / missing table) — never let the
    // supply side silently strand. Re-mint is safe (idempotent) once fixed.
    if (expectedOrders > 0 && minted === 0) {
      await notifyStaffForClient(campaign.clientId, ['strategist'], {
        kind: 'client_signoff',
        title: 'Campaign shipped but creators were not dispatched',
        body: `${campaign.draft.name} shipped with ${expectedOrders} creative ${expectedOrders === 1 ? 'order' : 'orders'} to assign, but none reached a creator. Assign manually.`,
        link: `/work/today?focus=${id}`,
      }).catch(() => ({ notified: 0 }))
    }
    // Dead-letter: the plan had service lines to set up but no service work order was minted
    // (transient insert error / missing table). Never let the service side silently strand —
    // re-mint is idempotent once fixed.
    if (swo.expected > 0 && swo.minted === 0) {
      await notifyStaffForClient(campaign.clientId, ['strategist'], {
        kind: 'client_signoff',
        title: 'Campaign shipped but services were not set up',
        body: `${campaign.draft.name} shipped with ${swo.expected} ${swo.expected === 1 ? 'service' : 'services'} to run, but no work order was created. Set them up manually.`,
        link: `/work/today?focus=${id}`,
      }).catch(() => ({ notified: 0 }))
    }
  }
  // Editing an ALREADY-shipped campaign (not the initial ship) → reconcile production
  // to the new plan: mint added pieces, void removed-and-not-started ones, re-date the
  // moved. Best-effort; never blocks the save. DIY ships mint nothing, so nothing to sync.
  if (!justShipped && campaign.status === 'shipped' && campaign.draft.path !== 'diy' && (Array.isArray(body.items) || body.fields?.target_date !== undefined)) {
    const updated = await getCampaign(id)
    if (updated) await reconcileCampaignProduction(updated).catch(() => null)
  }
  return NextResponse.json({ campaign: await getCampaign(id) })
}

// DELETE /api/campaigns/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { campaign, res } = await authorize(id)
  if (res) return res
  // Only a draft can be discarded. A launched campaign has minted real work
  // (orders, drafts, staff notifications) — the owner path for those is Stop,
  // which settles in-flight work honestly instead of erasing it.
  if (campaign && campaign.status !== 'draft') {
    return NextResponse.json({ error: 'only a draft can be deleted — stop a running campaign instead' }, { status: 409 })
  }
  // Don't let a delete strand money: a campaign with accrued owner charges or
  // creator payouts has real work that was billed/owed. Deleting would erase the
  // charge (cascade) but orphan the payout (set-null), losing its provenance.
  if (await campaignHasAccruedMoney(id).catch(() => false)) {
    return NextResponse.json({ error: 'this campaign has billed or owed pieces — resolve its charges and payouts before deleting' }, { status: 409 })
  }
  await deleteCampaign(id)
  return NextResponse.json({ ok: true })
}
