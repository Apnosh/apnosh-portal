/**
 * The four setup cards that are live today, as configuration.
 *
 * This is the whole point of the engine: everything that used to be a hand-written branch is now a
 * row in this file. The lane picker used to be an English sentence decoded by a regex named after
 * gbp; the per-lane promises were four functions selected by an `if` chain; the owner's task was
 * four more `if (serviceId === …)` blocks in a different file. All of it is here, once, per card.
 *
 * NOTHING IN HERE IS NEW COPY. Every string is lifted verbatim from what ships today, because the
 * job of this pass is to prove the shape holds — `scripts/sim/setup-cards.ts` asserts that the rows
 * below are byte-identical to what the live code produces for all four cards and all three lanes.
 * Changing a word and refactoring at the same time would make a failure impossible to read.
 *
 * The `platform` block on each card is the new information, and it is the reason the get-listed
 * card can never quietly grow a "we'll do it for you" lane: there is nothing to write to.
 */

import { serviceById } from '../catalog'
import { whatYouGetForServices } from '../builder/what-you-get'
import type { SetupCard } from './types'

/** The gbp profile's fixable parts, read from the real deliverables so the copy stays true if the
 *  catalog changes. Same helper the live code uses, same fallback. */
function gbpPartCount(): number {
  const n = serviceById('gbp-setup')?.deliverables?.included?.length
  return typeof n === 'number' && n > 0 ? n : 6
}

/* ── Google Business Profile ────────────────────────────────────────────────────────────────────
 * The reference card, and the only one where we hold both halves of the Google API: we can read the
 * live profile and we can write to it. That is what earns it a read-back proof on two lanes and a
 * re-read on the third. */
const GBP: SetupCard = {
  id: 'gbp',
  serviceId: 'gbp-setup',
  platform: { canRead: true, canWrite: true },
  lanes: [
    {
      kind: 'diy',
      label: 'You do it yourself, step by step',
      /* The owner clicks every change on Google, but we can still re-read the profile afterwards,
       * so this lane proves itself without ever asking them to confirm. */
      delivery: 'owner-applies',
      proof: 'reread',
      whatYouGet: ['A clear checklist of what to fix', 'We recheck it for you when you are done'],
      needs: ['GOOGLE'],
      ownerTask: {
        title: 'Fix your Google profile',
        why: 'We walk you through it section by section, in plain words. It checks itself as you go.',
        href: '/dashboard/google-profile',
        actionLabel: 'Start',
        verifiedField: 'gbpFixedAt',
      },
    },
    {
      kind: 'ai',
      label: 'You do it with Apnosh AI, step by step',
      delivery: 'we-write',
      proof: 'read-back',
      proOnly: true,
      whatYouGet: ['AI drafts each fix for you', 'You review and apply, then we recheck'],
      needs: ['GOOGLE', 'PHOTOS'],
      ownerTask: {
        title: 'Fix your Google profile',
        why: 'We walk you through it section by section, in plain words. It checks itself as you go.',
        href: '/dashboard/google-profile',
        actionLabel: 'Start',
        verifiedField: 'gbpFixedAt',
      },
    },
    {
      kind: 'team',
      label: 'Done for you by Apnosh',
      delivery: 'we-write',
      proof: 'read-back',
      needs: ['GOOGLE', 'GBP-MGR', 'PHOTOS', 'HOURS', 'ATTR'],
      whatYouGet: [`We fix all ${gbpPartCount()} parts of your profile`, 'We recheck it and show you what changed'],
    },
  ],
}

/* ── Booking and ordering buttons ───────────────────────────────────────────────────────────────
 * Also Google, so also both halves. Covers both of the master document's link-wiring and
 * order-button items; they are one card, not two. */
const FRICTION: SetupCard = {
  id: 'friction',
  serviceId: 'google-food-order',
  platform: { canRead: true, canWrite: true },
  lanes: [
    {
      kind: 'diy',
      label: 'You do it yourself, step by step',
      delivery: 'owner-applies',
      proof: 'owner-word',
      whatYouGet: [
        'We show you exactly which buttons to change, and where',
        'You set them on Google yourself, at your own pace',
        'Mark it done when your links are live',
      ],
      needs: ['LINKS'],
      ownerTask: {
        title: 'Set your order and booking buttons',
        why: 'We show you which buttons to change and where. You set them on Google yourself.',
        href: 'https://business.google.com/edit/l/#lp',
        actionLabel: 'Open Google',
        claimedField: 'orderButtonsSelfDoneAt',
      },
    },
    {
      kind: 'ai',
      label: 'You do it with Apnosh AI, step by step',
      delivery: 'we-write',
      proof: 'read-back',
      proOnly: true,
      whatYouGet: [
        'We read your listing and tell you where the buttons go today',
        'We fill in your own ordering and booking links for you to confirm',
        'We set them on Google and read it back to prove it took',
      ],
      needs: ['GOOGLE', 'LINKS'],
      ownerTask: {
        title: 'Set your order and booking buttons',
        why: 'We read your listing, fill in your links, and set them on Google for you to confirm.',
        href: '/dashboard/order-buttons',
        actionLabel: 'Start',
        verifiedField: 'orderButtonsFixedAt',
      },
    },
    {
      kind: 'team',
      label: 'Done for you by Apnosh',
      delivery: 'we-write',
      proof: 'read-back',
      needs: ['GOOGLE', 'GBP-MGR', 'LINKS'],
      whatYouGet: whatYouGetForServices(['google-food-order']),
    },
  ],
}

/* ── Replying to reviews ────────────────────────────────────────────────────────────────────────
 * The one card that never finishes: new reviews keep arriving. The free and AI lanes promise a pass
 * over what is waiting today; only the team lane keeps going. Saying otherwise would sell a
 * subscription as a one-off. */
const REVIEWSREPLY: SetupCard = {
  id: 'reviewsreply',
  serviceId: 'review-responses',
  platform: { canRead: true, canWrite: true },
  lanes: [
    {
      kind: 'diy',
      label: 'You do it yourself, step by step',
      delivery: 'owner-applies',
      proof: 'owner-word',
      whatYouGet: [
        'We show you every review still waiting on a reply, worst first',
        'You write and post each one on Google yourself',
        'Mark it done when you have caught up',
      ],
      needs: ['GOOGLE'],
      ownerTask: {
        title: 'Reply to your reviews',
        why: 'We show you every review still waiting, worst first. You write and post each one.',
        href: 'https://business.google.com/reviews',
        actionLabel: 'Open Google',
        claimedField: 'reviewRepliesSelfDoneAt',
      },
    },
    {
      kind: 'ai',
      label: 'You do it with Apnosh AI, step by step',
      delivery: 'we-write',
      proof: 'read-back',
      proOnly: true,
      whatYouGet: [
        'We show you every review still waiting on a reply, worst first',
        'We draft each reply in your voice for you to edit',
        'You approve, and we post it to Google and prove it posted',
      ],
      needs: ['GOOGLE', 'VOICE'],
      ownerTask: {
        title: 'Reply to your reviews',
        why: 'We draft each reply in your voice. You approve, and we post it and prove it posted.',
        href: '/dashboard/review-replies',
        actionLabel: 'Start',
        verifiedField: 'reviewRepliesDoneAt',
      },
    },
    {
      kind: 'team',
      label: 'Done for you by Apnosh',
      delivery: 'we-write',
      proof: 'read-back',
      needs: ['GOOGLE', 'GBP-MGR', 'VOICE', 'ESCAL'],
      whatYouGet: whatYouGetForServices(['review-responses']),
    },
  ],
}

/* ── Getting listed everywhere ──────────────────────────────────────────────────────────────────
 * THE CARD THAT PROVES THE LAW. We can neither read nor write any of these directories, and the
 * existing code says so in a comment: "no owner-run lane may claim to inspect one or fix one."
 *
 * So every lane here proves by the owner's word, and the team lane is `we-operate` — a person doing
 * the claiming by hand, not an API call. That is exactly the shape the master document's delivery
 * and POS cards will need, and the reason the engine has a `we-operate` mechanism at all. */
const LISTINGS: SetupCard = {
  id: 'listings',
  serviceId: 'listings-sync',
  platform: {
    canRead: false,
    canWrite: false,
    hasProbe: false,
    limitation: 'These directories have no way for us to read or change your details, so every lane here ends with you telling us it is done.',
  },
  lanes: [
    {
      kind: 'diy',
      label: 'You do it yourself, step by step',
      delivery: 'owner-applies',
      proof: 'owner-word',
      whatYouGet: [
        'Your name, address and phone in one place, exactly as they should read',
        'A link straight to the page that edits each site',
        'You claim and correct each one, and mark it done',
      ],
      needs: ['NAP'],
      ownerTask: {
        title: 'Get listed everywhere',
        why: 'Your details in one place, and a link straight to the page that edits each site.',
        href: '/dashboard/listings',
        actionLabel: 'Start',
        claimedField: 'citationsSelfDoneAt',
      },
    },
    {
      kind: 'ai',
      label: 'You do it with Apnosh AI, step by step',
      /* Not a write lane, and it must never become one. This is the AI GUIDE shape: it works out
       * the right answer and hands it over, one site at a time. */
      delivery: 'owner-applies',
      proof: 'owner-word',
      proOnly: true,
      whatYouGet: [
        'The same three lines to copy, so every site ends up saying exactly the same thing',
        'One site at a time, with what usually trips people up on that one',
        'It remembers where you got to, so you can do a couple and come back',
      ],
      needs: ['NAP', 'HOURS'],
      ownerTask: {
        title: 'Get listed everywhere',
        why: 'One site at a time, with the exact lines to copy and what usually trips people up.',
        href: '/dashboard/listings',
        actionLabel: 'Start',
        claimedField: 'citationsSelfDoneAt',
      },
    },
    {
      kind: 'team',
      label: 'Done for you by Apnosh',
      /* Hands, not an API. The price buys someone doing the claiming, and that is the whole
       * difference the copy has to earn. */
      delivery: 'we-operate',
      proof: 'owner-word',
      needs: ['NAP', 'HOURS', 'AGREE'],
      whatYouGet: whatYouGetForServices(['listings-sync']),
    },
  ],
}

export const SETUP_CARDS: readonly SetupCard[] = [GBP, FRICTION, REVIEWSREPLY, LISTINGS]

export const setupCardById = (id: string): SetupCard | undefined =>
  SETUP_CARDS.find((c) => c.id === id)

/** The card ids the engine now describes. Grows by one every time a service is finished. */
export const SETUP_CARD_IDS: readonly string[] = SETUP_CARDS.map((c) => c.id)
