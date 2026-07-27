/**
 * The Client Agreement — the standing terms a restaurant accepts before Apnosh does paid work.
 *
 * NOT LEGAL ADVICE AND NOT LAWYER-REVIEWED. This is a plain-language draft written to answer the
 * questions owners actually asked, so the product stops being silent on them. It must be reviewed by
 * a lawyer before anyone relies on it. Bump CLIENT_AGREEMENT_VERSION whenever the text changes
 * materially, so every acceptance stays attributable to the exact words that were on screen.
 *
 * Mirrors the creator side (src/lib/marketplace/creator-agreement.ts), which already works this way:
 * a version constant, a public page, and the accepted version recorded against the account. Plain
 * module, no server-only, so the terms page, the plan screen and the server action share one source.
 *
 * WHY THESE SIX CLAUSES. Each one is here because a real owner stopped at its absence:
 *   ownership     a lawyer-turned-owner had a photographer claim copyright over shots of her own food
 *   cancelling    "Pause any time" was doing a cancellation policy's job without being one
 *   in-progress   if you stop on day three, who owns the half-finished work
 *   your data     your guest list and your Google access are yours, and leaving must not cost them
 *   price         a monthly that can drift silently is the oldest trick in the category
 *   renewal       "runs every month" with no end date IS auto-renewal; say so rather than imply it
 */

export const CLIENT_AGREEMENT_VERSION = '2026-07-25'
export const CLIENT_AGREEMENT_EFFECTIVE = 'July 25, 2026'

export interface Clause {
  /** The owner's question, in their words. This is the heading. */
  q: string
  /** The answer, plainly. No hedging, no "commercially reasonable efforts". */
  a: string[]
}

export const CLIENT_AGREEMENT: Clause[] = [
  {
    q: 'Who owns the photos, videos and posts?',
    a: [
      'You do. Everything we make for you — photographs, video, written posts, graphics, the words on your listings — belongs to you once it is paid for. You can use it anywhere, forever, including after you stop working with us.',
      'That includes work made by a creator we hired for you. We require every creator to assign their work to you as a condition of being paid, so you never have to negotiate with them separately.',
      'We would like to show your work in our own portfolio. You can tell us not to, at any time, and we will take it down.',
      'Anything you gave us stays yours and always was: your logo, your existing photos, your menu, your name.',
    ],
  },
  {
    q: 'How do I stop, and what does it cost?',
    a: [
      'You can pause or stop a plan at any time from the plan screen. There is no notice period and no cancellation fee.',
      'Recurring work is billed monthly. When you stop, you are billed for the month you are in and nothing after it. We do not bill a further month for the privilege of leaving.',
      'One-time setup work is billed once and is not refundable after it is delivered, because it is done and it is yours. If you stop before a piece of setup work is delivered, you are not billed for it.',
    ],
  },
  {
    q: 'What happens to work that is half-finished?',
    a: [
      'Work already delivered is yours, paid for, and you keep it.',
      'Work in progress stops. You are not billed for it, and we will hand over whatever exists of it if you want it, in whatever state it is in.',
      'If you have paid for something we have not yet delivered, we refund it.',
    ],
  },
  {
    q: 'What happens to my accounts and my data?',
    a: [
      'Your Google Business Profile, your social accounts and your website are yours. We access them because you connected them, and you can disconnect us at any time from Connected accounts, without asking us.',
      'Your guest list is yours. You can export it at any time, and we will export it for you when you leave.',
      'We do not sell your data, and we do not use your guest list for anyone but you.',
      'When you leave, we keep only what we are legally required to keep for tax and accounting.',
    ],
  },
  {
    q: 'Can the price change?',
    a: [
      'Not without telling you first. If a monthly price changes, we will tell you at least 30 days before it takes effect, and you can stop before it does.',
      'The price you see when you start a plan is the price you pay for that plan. Adding or removing work changes it, and you make that change yourself.',
    ],
  },
  {
    q: 'Does this renew on its own?',
    a: [
      'Yes, and we would rather say so plainly than hide it in the word "ongoing". A monthly plan continues every month until you pause or stop it. There is no fixed term and no minimum.',
      'We will not quietly restart a plan you stopped.',
    ],
  },
  {
    q: 'What do you promise about results?',
    a: [
      'Nothing about how many people will come. Nobody can honestly promise that, and anyone who does is guessing at your expense.',
      'What we promise is the work itself: the specific things listed on your plan, made and delivered. If we do not deliver something on your plan, you do not pay for it.',
      'We will show you what actually happened where we can measure it, and say "we do not know yet" where we cannot.',
    ],
  },
  {
    q: 'What do you need from me?',
    a: [
      'Approval before anything goes out in your name, unless you tell us otherwise. Nothing publishes without you.',
      'Access to the accounts you want us to work on.',
      'If we cannot reach you and work is waiting on your approval, it waits. We will not publish on your behalf to keep a schedule.',
    ],
  },
]

/** One line for the accept control. Short enough to read, specific enough to mean something. */
export const CLIENT_AGREEMENT_SUMMARY =
  'You own everything we make. You can stop any time with no fee. Nothing goes out without your approval.'
