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
// From service-rows, NOT what-you-get: what-you-get reads these card configs, so importing it
// here would be a cycle, and cycles in module-level code crash on load order rather than on logic.
import { whatYouGetForServices } from '../builder/service-rows'
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

/* ── Getting measurable ─────────────────────────────────────────────────────────────────────────
 * THE SETUP BEFORE THE SETUPS. Every card above quietly assumes this one is done: none of them can
 * prove they worked without Search Console and Analytics behind them.
 *
 * Its platform shape is new, and it is the reason this card could never have been a copy of the
 * Google ones. We can READ whether data is flowing, and there is a genuine independent probe (the
 * health cron reads the actual data path daily). But we hold NO write access to the client's
 * website, because their tag goes on their own site, on whatever host they happen to use. So
 * `canWrite` is false and the law does the rest: no lane here may say "we-write". The paid lane is
 * a person working inside access the client granted, which is what `we-operate` is for.
 *
 * The payoff is the best proof rung on any card we sell. The listings card ends in the owner's word
 * because we cannot see inside Yelp. This one ends in data arriving, which nobody can claim their
 * way to. */
const MEASURE: SetupCard = {
  id: 'measure',
  serviceId: 'tracking',
  platform: {
    canRead: true,
    canWrite: false,
    hasProbe: true,
    limitation: 'Your tracking tag goes on your own website, which we cannot change for you. So we tell you exactly what to do, or do it inside access you grant us, and then we watch for your data arriving.',
  },
  lanes: [
    {
      kind: 'diy',
      label: 'You do it yourself, step by step',
      delivery: 'owner-applies',
      /* Not the owner's word, and not a re-read either: the daily health check watches real data
       * come down the pipe. Done here is the strongest thing we can say anywhere. */
      proof: 'probe',
      whatYouGet: [
        'We show you which of the two tools you have, and which you do not',
        'The exact steps for your website host, not a generic help article',
        'It marks itself done when your data starts arriving',
      ],
      needs: ['GOOGLE'],
      ownerTask: {
        title: 'Get measurable',
        why: 'Search Console and Analytics, one at a time, with the exact steps for your website host.',
        href: '/dashboard/measure',
        actionLabel: 'Start',
      },
    },
    {
      kind: 'ai',
      label: 'You do it with Apnosh AI, step by step',
      delivery: 'owner-applies',
      proof: 'probe',
      proOnly: true,
      whatYouGet: [
        'We work out who hosts your site and give you that host\'s own path',
        'The gotchas for your host, like the www-only trap that quietly halves your data',
        'We watch for your data and tell you the moment it is really flowing',
      ],
      needs: ['GOOGLE', 'SITE'],
      ownerTask: {
        title: 'Get measurable',
        why: 'We work out who hosts your site and walk you through that host\'s own path, gotchas included.',
        href: '/dashboard/measure',
        actionLabel: 'Start',
      },
    },
    {
      kind: 'team',
      label: 'Done for you by Apnosh',
      /* Hands inside their site admin, not an API call. There is no write path to somebody else's
       * website and there never will be, so this is the honest mechanism. */
      delivery: 'we-operate',
      proof: 'probe',
      needs: ['GOOGLE', 'SITE', 'LINKS'],
      whatYouGet: whatYouGetForServices(['tracking']),
    },
  ],
}

/* ── Landing in the inbox ───────────────────────────────────────────────────────────────────────
 * The best read position of any card we sell, and the one that needed the least to earn it: SPF and
 * DMARC are public DNS, so we can diagnose a restaurant's email from a cold start with no login, no
 * connection and nothing granted. The check is the same one Gmail runs before deciding whether
 * their email lands.
 *
 * Same platform shape as get-measurable, for the same reason: the records live at the registrar
 * where the domain was bought, and we hold no write access there. `canWrite` false, so the law
 * refuses a we-write lane and the paid lane is hands inside access the client grants.
 *
 * THE LIMITATION IS NAMED BECAUSE IT IS REAL. DKIM sits under a selector only the sending provider
 * knows, and DNS cannot be enumerated, so a miss is "we could not check" and never "you do not have
 * one". lib/email/deliverability.ts enforces that; the copy here has to match it. */
const EMAILDELIVER: SetupCard = {
  id: 'emaildeliver',
  serviceId: 'email-found',
  platform: {
    canRead: true,
    canWrite: false,
    hasProbe: true,
    limitation: 'These records live where you bought your domain, which we cannot change for you. So we read what is there, tell you exactly what to add, and then look again to prove it took.',
  },
  lanes: [
    {
      kind: 'diy',
      label: 'You do it yourself, step by step',
      delivery: 'owner-applies',
      proof: 'probe',
      whatYouGet: [
        'We read what your domain says today, the same way Gmail reads it',
        'The exact record to add, and where it goes at your domain company',
        'We look again and show you it took, so nobody has to take your word for it',
      ],
      needs: ['DNS'],
      ownerTask: {
        title: 'Land in the inbox',
        why: 'We read what your domain says today and hand you the exact record to add, one at a time.',
        href: '/dashboard/email',
        actionLabel: 'Start',
      },
    },
    {
      kind: 'ai',
      label: 'You do it with Apnosh AI, step by step',
      delivery: 'owner-applies',
      proof: 'probe',
      proOnly: true,
      whatYouGet: [
        'We work out which records are wrong and write the replacement for you to paste',
        'The steps for your own domain company, including what usually trips people up there',
        'We keep checking until it is really live, which can take a day',
      ],
      needs: ['DNS', 'ESP'],
      ownerTask: {
        title: 'Land in the inbox',
        why: 'We write the exact records for you to paste, with the steps for your own domain company.',
        href: '/dashboard/email',
        actionLabel: 'Start',
      },
    },
    {
      kind: 'team',
      label: 'Done for you by Apnosh',
      /* A person working in the registrar the client gave us access to. There is no API that edits
       * somebody else's DNS, and there is not going to be one. */
      delivery: 'we-operate',
      proof: 'probe',
      needs: ['DNS', 'ESP', 'AGREE'],
      whatYouGet: whatYouGetForServices(['email-found']),
    },
  ],
}

/* ── Pricing the delivery menu ──────────────────────────────────────────────────────────────────
 * THE SECOND CARD WITH NO PLATFORM AT ALL, and it proves the listings shape generalises. We hold no
 * API to DoorDash, Uber Eats or Grubhub: we cannot read their menu and we cannot change a price. So
 * `canRead` and `canWrite` are both false, there is no probe, and every lane closes on the owner's
 * word.
 *
 * What makes it worth selling anyway is that the hard part was never the typing. It is knowing what
 * the new number should BE, which is arithmetic on their own menu, their own food costs and the
 * rate on their own statement. That is the AI guide shape the get-listed card established, applied
 * to a job where the guidance is genuinely the product.
 *
 * The team lane is `we-operate`: a person in the client's own app dashboard, typing. There is no
 * API to hide behind and the price has to buy hands. */
const DELIVERYMENU: SetupCard = {
  id: 'deliverymenu',
  serviceId: 'delivery-opt',
  platform: {
    canRead: false,
    canWrite: false,
    hasProbe: false,
    limitation: 'The delivery apps give us no way to read or change your menu, so every lane here ends with you or us typing the new prices into their dashboard, and with you telling us it is done.',
  },
  lanes: [
    {
      kind: 'diy',
      label: 'You do it yourself, step by step',
      delivery: 'owner-applies',
      proof: 'owner-word',
      whatYouGet: [
        'Every dish with the price to charge on the app, worked out from your own menu',
        'The dishes that lose money even at the highest price we would ask a guest to pay',
        'You type them in yourself, and mark it done',
      ],
      needs: ['MENU'],
      ownerTask: {
        title: 'Price your delivery menu',
        why: 'Every dish with the price to charge on the app, worked out from your own menu and what the app takes.',
        href: '/dashboard/delivery-menu',
        actionLabel: 'Start',
        claimedField: 'deliveryMenuSelfDoneAt',
      },
    },
    {
      kind: 'ai',
      label: 'You do it with Apnosh AI, step by step',
      delivery: 'owner-applies',
      proof: 'owner-word',
      proOnly: true,
      whatYouGet: [
        'The same prices, plus what you keep per dish before and after',
        'Which dishes to pull off delivery instead of repricing',
        'It remembers where you got to, so you can do a few and come back',
      ],
      needs: ['MENU', 'COSTS'],
      ownerTask: {
        title: 'Price your delivery menu',
        why: 'The new price per dish, what you keep before and after, and which ones to pull instead.',
        href: '/dashboard/delivery-menu',
        actionLabel: 'Start',
        claimedField: 'deliveryMenuSelfDoneAt',
      },
    },
    {
      kind: 'team',
      label: 'Done for you by Apnosh',
      delivery: 'we-operate',
      proof: 'owner-word',
      needs: ['MENU', 'COSTS', 'DELIV', 'AGREE'],
      /* Written out rather than derived. `delivery-opt` lives in the atom catalog and the turnaround
       * table but has no entry in the PRICED catalog, so whatYouGetForServices returns nothing for
       * it, and a team lane that promises nothing is what the store used to ship silently. The sim
       * caught it; these are the rows until that service is priced properly. */
      whatYouGet: [
        'We work out the right price for every dish on every app you sell on',
        'We type them into your app dashboards for you',
        'We tell you which dishes to pull, and why they cannot be saved with a price',
      ],
    },
  ],
}


/* ── Social profiles ────────────────────────────────────────────────────────────────────────────
 * The social platforms give us NO write path to a profile, and the vendor connection (Zernio)
 * reads numbers, not bios — so this card takes the listings shape: the free and AI lanes are
 * guides that end in the owner's word, and the paid lane is a person working inside access the
 * client grants. The walkthrough lives at /dashboard/social-profiles: per platform, what to fix,
 * the exact lines to paste, and a link straight to that platform's edit screen. */
const SOCIALPROFILES: SetupCard = {
  id: 'socialprofiles',
  serviceId: 'social-profiles',
  platform: {
    canRead: false,
    canWrite: false,
    hasProbe: false,
    limitation: 'Instagram, Facebook, TikTok, LinkedIn and YouTube give us no way to read or edit your profile text, so every lane here ends with you telling us it is done.',
  },
  lanes: [
    {
      kind: 'diy',
      label: 'You do it yourself, step by step',
      delivery: 'owner-applies',
      proof: 'owner-word',
      whatYouGet: [
        'One checklist per platform: name, bio, link, photo and hours',
        'A link straight to the edit screen on each platform',
        'You fix each one and mark it done',
      ],
      needs: ['NAP', 'HOURS'],
      ownerTask: {
        title: 'Set up your social profiles',
        why: 'One platform at a time, with a link straight to its edit screen.',
        href: '/dashboard/social-profiles',
        actionLabel: 'Start',
        claimedField: 'socialProfilesSelfDoneAt',
      },
    },
    {
      kind: 'ai',
      label: 'You do it with Apnosh AI, step by step',
      /* The AI GUIDE shape: it writes the bio and the link list from your business info, so
       * every platform ends up saying the same right thing. It never touches the account. */
      delivery: 'owner-applies',
      proof: 'owner-word',
      proOnly: true,
      whatYouGet: [
        'A bio written for you, sized to each platform',
        'The same name, link and hours lines to paste, so all five match',
        'It remembers where you got to, so you can do a couple and come back',
      ],
      needs: ['NAP', 'HOURS'],
      ownerTask: {
        title: 'Set up your social profiles',
        why: 'The exact lines to paste on each platform, written from your business info.',
        href: '/dashboard/social-profiles',
        actionLabel: 'Start',
        claimedField: 'socialProfilesSelfDoneAt',
      },
    },
    {
      kind: 'team',
      label: 'Done for you by Apnosh',
      /* Hands inside accounts the client grants us — no API exists. */
      delivery: 'we-operate',
      proof: 'owner-word',
      needs: ['NAP', 'HOURS', 'META', 'AGREE'],
      whatYouGet: whatYouGetForServices(['social-profiles']),
    },
  ],
}

export const SETUP_CARDS: readonly SetupCard[] = [GBP, FRICTION, REVIEWSREPLY, LISTINGS, SOCIALPROFILES, MEASURE, EMAILDELIVER, DELIVERYMENU]

export const setupCardById = (id: string): SetupCard | undefined =>
  SETUP_CARDS.find((c) => c.id === id)

/** The card that composes to a catalog SERVICE, for callers holding a line item. The router
 *  (builder/routing.ts) reads lane truth through this — it never re-derives platform facts. */
export const setupCardByServiceId = (serviceId: string): SetupCard | undefined =>
  SETUP_CARDS.find((c) => c.serviceId === serviceId)

/** The card ids the engine now describes. Grows by one every time a service is finished. */
export const SETUP_CARD_IDS: readonly string[] = SETUP_CARDS.map((c) => c.id)
