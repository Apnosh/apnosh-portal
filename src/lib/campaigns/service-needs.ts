/**
 * Service-driven "what we need from you" — turns the campaign's actual services into the specific
 * inputs/actions the team needs, so the readiness page asks ONLY for what THIS plan requires (an SMS
 * service ⇒ carrier registration; an ordering service ⇒ your POS vendor; any shoot ⇒ shoot access).
 * Each service already carries the signal: its turnaround gate (service-turnaround.ts) and needsShoot.
 * Emits the same ReadinessItem shape readiness.ts renders. Server-only. Pure over its inputs.
 */
import 'server-only'
import { turnaroundFor } from './data/service-turnaround'
import type { SavedCampaign, CampaignExecution } from './view'
import type { ReadinessItem } from './readiness-types'

const isContent = (serviceId?: string) => /^content-/.test(serviceId ?? '')
const CONNECT_HREF = '/dashboard/connected-accounts'
const BIZ_HREF = '/dashboard/business-info'

const MENU_SERVICES = new Set(['site-menu', 'menu-eng', 'catering-engine', 'menu-photo-refresh'])
const LIST_SERVICES = new Set(['crm-list', 'email-found'])

export function deriveServiceNeeds(
  campaign: SavedCampaign,
  opts: { doneSetup: Set<string>; hasMenuItems: boolean; hasAddress: boolean; hasPaymentMethod?: boolean; exec: CampaignExecution },
): ReadinessItem[] {
  const { doneSetup, hasMenuItems, hasAddress, hasPaymentMethod = true, exec } = opts
  // Team-need asks derive only from work the TEAM will actually do: an opted-out line or an
  // owner-run line (producer 'diy') mints no staff work, so it must never generate "so we can
  // set it up" asks (the owner-run gbp line gets its own walkthrough task below instead).
  const svc = (campaign.draft.items ?? []).filter((it) => it.included && !it.optOut && it.producer !== 'diy' && !isContent(it.serviceId))
  const ids = new Set(svc.map((s) => s.serviceId).filter((x): x is string => !!x))
  const out: ReadinessItem[] = []
  const seen = new Set<string>()
  const push = (it: ReadinessItem) => { if (!seen.has(it.id)) { seen.add(it.id); out.push(it) } }

  // ── money: pieces bill as they publish, so a billable campaign needs a card on file.
  // Only asked while missing (billing_customers has no default payment method) and only
  // when this campaign actually bills anything. /dashboard/billing hosts the add-card rail.
  const billsAnything = (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && (it.price ?? 0) > 0)
  if (!hasPaymentMethod && billsAnything && campaign.draft.path !== 'diy') {
    push({ id: 'payment-method', kind: 'action', group: 'Info', title: 'Add a payment method', why: 'Each piece bills only when it ships. A card on file keeps the work moving.', actionLabel: 'Add card', href: '/dashboard/billing', done: false })
  }

  // ── the self-serve Google profile fix (the gbp card's free "I do it myself" version) ──
  // The deliverable IS the owner's own walkthrough, so the ask is the work itself. `done` flips
  // only when the SERVER's own fresh ALL-GOOD diagnosis stamps execution.gbpFixedAt (POST
  // /api/campaigns/:id/gbp-fixed; the key is not owner-writable) — self-checking, never self-claimed.
  const diyGbp = (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && it.serviceId === 'gbp-setup' && it.producer === 'diy')
  if (diyGbp) {
    push({
      id: 'gbp-fix', kind: 'action', group: 'Access',
      title: 'Fix your Google profile',
      why: 'We walk you through it section by section, in plain words. It checks itself as you go.',
      actionLabel: exec.gbpFixedAt ? 'Open' : 'Start',
      href: `/dashboard/google-profile?campaignId=${campaign.draft.id}`,
      done: !!exec.gbpFixedAt,
    })
  }

  // ── gate-driven needs: each setup service's external dependency implies one owner-facing ask ──
  for (const id of ids) {
    const t = turnaroundFor(id)
    const gate = t && t.class === 'setup' ? t.gate : undefined
    if (!gate) continue
    switch (gate.kind) {
      case 'gbp-verify':
        if (!doneSetup.has('gbp-setup')) push({ id: 'gbp-access', kind: 'action', group: 'Access', title: 'Connect your Google profile', why: 'So we can update your Google listing. Google verifies it, which can add a few days.', actionLabel: 'Connect', href: CONNECT_HREF, done: false })
        break
      case 'listing-propagation':
        if (!doneSetup.has('review-claim')) push({ id: 'listing-access', kind: 'action', group: 'Access', title: 'Connect your listings', why: 'So your hours and menu match everywhere. Listings can take up to a week to update.', actionLabel: 'Connect', href: CONNECT_HREF, done: false })
        break
      case 'pos-vendor':
        push({ id: 'pos-vendor', kind: 'input', group: 'Access', field: 'vendorInfo', inputType: 'text', title: 'Which ordering or POS system do you use?', why: 'Your ordering or point-of-sale vendor controls when this can go live.', placeholder: 'e.g. Toast, Square, Clover', value: exec.vendorInfo ?? '', done: !!exec.vendorInfo })
        break
      case 'sms-10dlc':
        push({ id: 'sms-register', kind: 'action', group: 'Info', title: 'Set up text messaging', why: 'Carriers require your legal business details before you can text customers. We collect these securely.', actionLabel: 'Add', href: BIZ_HREF, done: false })
        break
      case 'print':
        if (!hasAddress) push({ id: 'print-address', kind: 'action', group: 'Info', title: 'Confirm your shipping address', why: 'So we can send your printed cards and QR codes.', actionLabel: 'Add', href: BIZ_HREF, done: false })
        break
    }
  }

  // ── shoot needs: shared by every on-site shoot service + any content that needs filming ──
  // Beats whose footage the OWNER supplies (footageSource 'owner', the 'edit' card) never imply a
  // team shoot — their intake is the footage upload below, not shoot scheduling.
  const beatTypes = new Set(
    (campaign.draft.brief?.contentBeats ?? [])
      .filter((b) => (b as { footageSource?: string }).footageSource !== 'owner')
      .map((b) => (b as { type?: string }).type))
  const shootFromBeats = ['reel', 'video', 'photo'].some((tp) => beatTypes.has(tp))
  const shootFromServices = [...ids].some((id) => { const t = turnaroundFor(id); return t?.class === 'creative' && !!t.needsShoot })
  if (shootFromBeats || shootFromServices) {
    push({ id: 'shootTimes', kind: 'input', group: 'Shoot', field: 'shootTimes', inputType: 'text', title: 'Best days and times to film', why: 'So we come when your food and light look their best.', placeholder: 'e.g. weekday mornings before 11', value: exec.shootTimes ?? '', done: !!exec.shootTimes })
    push({ id: 'onSiteContact', kind: 'input', group: 'Shoot', field: 'onSiteContact', inputType: 'text', title: 'Who should we ask for?', why: 'A name and role so our team knows who to find.', placeholder: 'e.g. Maria, manager', value: exec.onSiteContact ?? '', done: !!exec.onSiteContact })
    push({ id: 'filmStaff', kind: 'input', group: 'Shoot', field: 'filmStaff', inputType: 'select', options: ['Yes', 'Ask first', 'No'], title: 'OK to film and tag your staff?', why: 'We need your OK before we show or tag your team.', value: exec.filmStaff ?? '', done: !!exec.filmStaff })
    push({ id: 'accessNotes', kind: 'input', group: 'Shoot', field: 'accessNotes', inputType: 'text', title: 'Parking or entry notes', why: 'Anything tricky about getting in.', placeholder: 'Optional', value: exec.accessNotes ?? '', done: !!exec.accessNotes, optional: true })
    push({ id: 'blackoutDates', kind: 'input', group: 'Scheduling', field: 'blackoutDates', inputType: 'text', title: 'Any busy dates to avoid', why: 'Holidays or private events we should plan around.', placeholder: 'Optional', value: exec.blackoutDates ?? '', done: !!exec.blackoutDates, optional: true })
  }

  // ── client footage (the "Edit my footage" card) ──
  // `edit` is content-only (no service line, so the service loop above never fires), but its whole
  // premise is "send us your clips and we cut them". Without an intake the team has nothing to edit,
  // so this asks the owner to upload their footage right after checkout. Required: no footage, no reel.
  if (campaign.draft.sourceCatalogId === 'edit') {
    push({ id: 'footage', kind: 'input', group: 'Content', field: 'footageUrls', inputType: 'upload', title: 'Upload your clips and photos', why: 'Send us the footage. We cut and polish it into your reel and edited shots.', value: exec.footageUrls ?? '', done: !!(exec.footageUrls && exec.footageUrls.trim()) })
  }

  // ── menu source ──
  if ([...ids].some((id) => MENU_SERVICES.has(id))) {
    push({ id: 'menu-source', kind: 'input', group: 'Content', field: 'menuSource', inputType: 'text', title: 'Send us your current menu', why: 'So the content and page show the right items and prices.', placeholder: hasMenuItems ? 'We have one on file — add a link if it changed' : 'Link to your menu, or where to find it', value: exec.menuSource ?? '', done: !!exec.menuSource || hasMenuItems, optional: hasMenuItems })
  }

  // ── customer list ──
  if ([...ids].some((id) => LIST_SERVICES.has(id))) {
    push({ id: 'customer-list', kind: 'action', group: 'Info', title: 'Share your customer list', why: 'So we can set up your email and text outreach.', actionLabel: 'Add', href: BIZ_HREF, done: false })
  }

  return out
}
