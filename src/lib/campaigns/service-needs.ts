/**
 * Service-driven "what we need from you" — turns the campaign's actual services into the specific
 * inputs/actions the team needs, so the readiness page asks ONLY for what THIS plan requires (an SMS
 * service ⇒ carrier registration; an ordering service ⇒ your POS vendor; any shoot ⇒ shoot access).
 * Each service already carries the signal: its turnaround gate (service-turnaround.ts) and needsShoot.
 * Emits the same ReadinessItem shape readiness.ts renders. Server-only. Pure over its inputs.
 */
import 'server-only'
import { turnaroundFor } from './data/service-turnaround'
import { draftSourceCatalogIds } from './data/catalog-availability'
import { playbookNeedKeys } from './data/service-playbooks'
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

  // ── money: a card is only needed for billing that happens AFTER checkout — content
  // pieces that bill as they publish, or a recurring monthly line. A one-time service
  // (e.g. the $100 Google-profile fix) was paid at checkout, so it never needs a card here.
  const billsOngoing = (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && (it.price ?? 0) > 0 && (isContent(it.serviceId) || (it.cadence as { kind?: string } | undefined)?.kind === 'recurring'))
  if (!hasPaymentMethod && billsOngoing && campaign.draft.path !== 'diy') {
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

  // The owner-run lanes of the Google button card. Same shape as the gbp walkthrough
  // above: the campaign's deliverable IS the owner doing it, so the task points at the
  // screen that does it, and it is done when the buttons are actually live.
  const orderLine = (campaign.draft.items ?? []).find((it) => it.included && !it.optOut && it.serviceId === 'google-food-order' && it.producer === 'diy')
  if (orderLine) {
    // Two owner-run lanes, two different tasks, because they are different products.
    //
    // The AI lane earns its tier by doing the hard part: it reads the listing, proposes a
    // link, writes it, and reads back to prove it took. That needs the walkthrough.
    //
    // The FREE lane is self-serve in the same shape as the Google-profile fix: here is the
    // page, go do it, tell us when it is done. Sending it into the AI walkthrough would
    // hand a free owner the paid surface, and the paid lane stops meaning anything.
    const isAi = orderLine.ownerMode === 'ai'
    push(isAi
      ? {
          id: 'order-buttons', kind: 'action', group: 'Access',
          title: 'Point your Google order buttons at you',
          why: 'We show you where they go today, what we can change, and what Google locks. You confirm before anything moves.',
          actionLabel: exec.orderButtonsFixedAt ? 'Open' : 'Start',
          href: `/dashboard/order-buttons?campaignId=${campaign.draft.id}`,
          done: !!exec.orderButtonsFixedAt,
        }
      : {
          id: 'order-buttons-self', kind: 'action', group: 'Access',
          title: 'Set your Google order and reserve links',
          why: 'Open your Google profile, put your own ordering and booking links on the Order and Reserve buttons, then mark this done.',
          actionLabel: 'Open Google',
          href: 'https://business.google.com/edit/l/#lp',
          done: !!exec.orderButtonsFixedAt,
        })
  }

  // ── playbook-driven needs: everything the TEAM's own checklist starts with ──
  // Each service's playbook (service-playbooks.ts) opens with a client intake step whose
  // needsInput names what only the owner can give: Manager access, site and delivery logins,
  // ad targeting, photos, brand voice. Before this rail NOTHING consumed those keys, so the
  // paid order silently stalled while /ready said all set. This walks EVERY active service,
  // recurring included (the gate rail below only ever covered turnaround class 'setup').
  // Runs FIRST so its more specific copy wins the id dedupe against the gate rail.
  for (const id of ids) {
    for (const key of playbookNeedKeys(id)) {
      switch (key) {
        case 'gbp-access':
          // The claim-or-create escape: an owner with NO profile (or no login) is not stuck —
          // the team playbook claims or creates the listing, so the ask says so and is skippable.
          if (!doneSetup.has('gbp-setup')) push({ id: 'gbp-access', kind: 'action', group: 'Access', title: 'Connect your Google profile', why: 'Your team\'s first step needs access to your listing. No profile, or no login? Skip this and your team claims or creates it for you. That is part of the work you bought.', actionLabel: 'Connect', href: CONNECT_HREF, done: false })
          break
        case 'listing-access':
          if (!doneSetup.has('review-claim')) push({ id: 'listing-access', kind: 'action', group: 'Access', title: 'Connect your listings', why: 'So your hours and menu match everywhere. Listings can take up to a week to update.', actionLabel: 'Connect', href: CONNECT_HREF, done: false })
          break
        case 'menu-source':
          push({ id: 'menu-source', kind: 'input', group: 'Content', field: 'menuSource', inputType: 'text', title: 'Send us your current menu', why: 'So the content and page show the right items and prices.', placeholder: hasMenuItems ? 'We have one on file. Add a link if it changed' : 'Link to your menu, or where to find it', value: exec.menuSource ?? '', done: !!exec.menuSource || hasMenuItems, optional: hasMenuItems })
          break
        case 'pos-vendor':
          // The delivery card's playbook needs the DELIVERY APP logins, not a POS vendor —
          // "Which POS?" was jargon that answered the wrong question.
          if (id === 'delivery-opt') push({ id: 'delivery-access', kind: 'input', group: 'Access', field: 'deliveryAccess', inputType: 'text', title: 'Your delivery apps, and how we get in', why: 'Which apps you sell on, plus the login email or store ID for each. Your team can only fix pages it can reach.', placeholder: 'e.g. DoorDash and Uber Eats, login mia@myshop.com', value: exec.deliveryAccess ?? '', done: !!exec.deliveryAccess })
          // The Google button card needs the LINKS, not the vendor's name. "Which POS?" is
          // the same jargon the delivery card already learned to drop: it answers a question
          // we then have to chase, while the link IS the thing we write onto the listing.
          // The order-links route pre-fills both from the client's own site, so this is
          // usually a confirm rather than a hunt.
          else if (id === 'google-food-order') {
            push({ id: 'ordering-link', kind: 'input', group: 'Access', field: 'orderingLink', inputType: 'text', title: 'Your online ordering link', why: 'This is what we put on the Order button, so orders come to you instead of a delivery app.', placeholder: 'e.g. yourplace.toasttab.com or your own order page', value: exec.orderingLink ?? '', done: !!exec.orderingLink })
            push({ id: 'booking-link', kind: 'input', group: 'Access', field: 'bookingLink', inputType: 'text', title: 'Your reservations link', why: 'This goes on the Reserve button. OpenTable, Resy, Yelp and your own booking page all work.', placeholder: 'e.g. opentable.com/your-place', value: exec.bookingLink ?? '', done: !!exec.bookingLink, optional: true })
          }
          else push({ id: 'pos-vendor', kind: 'input', group: 'Access', field: 'vendorInfo', inputType: 'text', title: 'Which ordering or POS system do you use?', why: 'Your ordering or point-of-sale vendor controls when this can go live.', placeholder: 'e.g. Toast, Square, Clover', value: exec.vendorInfo ?? '', done: !!exec.vendorInfo })
          break
        case 'gbp-photos':
          push({ id: 'gbp-photos', kind: 'input', group: 'Content', field: 'photoUrls', inputType: 'upload', title: 'Send us 15 to 20 real photos', why: 'Storefront, inside, and your best dishes. Real photos sell your listing.', value: exec.photoUrls ?? '', done: !!(exec.photoUrls && exec.photoUrls.trim()) })
          break
        case 'ad-access':
          push({ id: 'ad-access', kind: 'input', group: 'Access', field: 'adAccess', inputType: 'text', title: 'Your ad accounts', why: 'We run your ads from your own Meta and Google ad accounts. Tell us what you have, or write "none" and we set them up with you.', placeholder: 'e.g. we have Meta Business. Or: none', value: exec.adAccess ?? '', done: !!exec.adAccess })
          push({ id: 'ad-targeting', kind: 'input', group: 'Info', field: 'adTargeting', inputType: 'text', title: 'Who should your ads reach?', why: 'Your ads spend real money. Tell us the area and the people to aim at.', placeholder: 'e.g. families within 5 miles of downtown', value: exec.adTargeting ?? '', done: !!exec.adTargeting })
          break
        case 'onSiteContact':
          // Covered by the shoot rail below (same field, richer group) — nothing extra to ask here.
          break
      }
    }
    // Asks the playbook words inside a broader intake step (no dedicated needsInput key):
    if (id === 'review-responses') {
      push({ id: 'brand-voice', kind: 'input', group: 'Content', field: 'brandVoice', inputType: 'textarea', title: 'How should your replies sound?', why: 'We write every reply in your voice. Tell us the words to use and the words to never use.', placeholder: 'e.g. warm and casual. Always thank them by name. Never blame staff.', value: exec.brandVoice ?? '', done: !!exec.brandVoice })
    }
    if (id === 'site-menu') {
      push({ id: 'site-access', kind: 'input', group: 'Access', field: 'siteAccess', inputType: 'text', title: 'Who runs your website?', why: 'We need a way in to make the fixes. Name your website tool or the person who manages it, and we reach out and handle the rest.', placeholder: 'e.g. Wix, GoDaddy, or your web person\'s email', value: exec.siteAccess ?? '', done: !!exec.siteAccess })
    }
  }

  // ── gate-driven needs: each setup service's external dependency implies one owner-facing ask ──
  for (const id of ids) {
    const t = turnaroundFor(id)
    const gate = t && t.class === 'setup' ? t.gate : undefined
    if (!gate) continue
    switch (gate.kind) {
      case 'gbp-verify':
        if (!doneSetup.has('gbp-setup')) push({ id: 'gbp-access', kind: 'action', group: 'Access', title: 'Connect your Google profile', why: 'Your team\'s first step needs access to your listing. No profile, or no login? Skip this and your team claims or creates it for you. That is part of the work you bought.', actionLabel: 'Connect', href: CONNECT_HREF, done: false })
        break
      case 'listing-propagation':
        if (!doneSetup.has('review-claim')) push({ id: 'listing-access', kind: 'action', group: 'Access', title: 'Connect your listings', why: 'So your hours and menu match everywhere. Listings can take up to a week to update.', actionLabel: 'Connect', href: CONNECT_HREF, done: false })
        break
      case 'pos-vendor':
        // The Google button card asks for the ordering LINK above, which is a better
        // version of the same question, so the gate must not re-ask the vendor's name.
        // Both paths fire for one service (the playbook needsInput AND the turnaround
        // gate), and only patching the playbook branch left the jargon ask on screen.
        if (id !== 'google-food-order') {
          push({ id: 'pos-vendor', kind: 'input', group: 'Access', field: 'vendorInfo', inputType: 'text', title: 'Which ordering or POS system do you use?', why: 'Your ordering or point-of-sale vendor controls when this can go live.', placeholder: 'e.g. Toast, Square, Clover', value: exec.vendorInfo ?? '', done: !!exec.vendorInfo })
        }
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
  // Checks EVERY source id, not just the first: a merged cart stores the primary in sourceCatalogId
  // and the full set in sourceCatalogIds, and the edit item can sit in any cart position.
  if (draftSourceCatalogIds(campaign.draft).includes('edit')) {
    push({ id: 'footage', kind: 'input', group: 'Content', field: 'footageUrls', inputType: 'upload', title: 'Upload your clips and photos', why: 'Send us the footage. We cut and polish it into your reel and edited shots.', value: exec.footageUrls ?? '', done: !!(exec.footageUrls && exec.footageUrls.trim()) })
  }

  // ── menu source ──
  if ([...ids].some((id) => MENU_SERVICES.has(id))) {
    push({ id: 'menu-source', kind: 'input', group: 'Content', field: 'menuSource', inputType: 'text', title: 'Send us your current menu', why: 'So the content and page show the right items and prices.', placeholder: hasMenuItems ? 'We have one on file. Add a link if it changed' : 'Link to your menu, or where to find it', value: exec.menuSource ?? '', done: !!exec.menuSource || hasMenuItems, optional: hasMenuItems })
  }

  // ── customer list ──
  if ([...ids].some((id) => LIST_SERVICES.has(id))) {
    push({ id: 'customer-list', kind: 'action', group: 'Info', title: 'Share your customer list', why: 'So we can set up your email and text outreach.', actionLabel: 'Add', href: BIZ_HREF, done: false })
  }

  return out
}
