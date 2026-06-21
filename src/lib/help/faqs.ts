/**
 * Owner Help / FAQ content. Kept here (not inline in the page) so the copy can
 * be edited without touching layout, and so search + the help screen share one
 * source of truth.
 *
 * Written for the shipped mobile mvp product: bottom nav (Home, Campaigns, the
 * green + Create button, Alerts, More), the Alerts inbox (approvals + reviews +
 * activity in one feed), Messages, and the Business info hub that syncs to
 * Google Business Profile and the website. There is NO sidebar and NO standalone
 * "Approvals" tab on these surfaces, so answers must not reference them.
 *
 * Copy rule: minimal words, ~5th grade reading level, helpful not salesy, and
 * no em dashes anywhere.
 */

export type FaqIcon =
  | 'start'
  | 'alerts'
  | 'reviews'
  | 'business'
  | 'billing'
  | 'agreements'
  | 'messages'

export interface FaqLink {
  label: string
  href: string
}

export interface FaqItem {
  q: string
  a: string
  link?: FaqLink
}

export interface FaqCategory {
  category: string
  icon: FaqIcon
  items: FaqItem[]
}

export const FAQS: FaqCategory[] = [
  {
    category: 'Getting started',
    icon: 'start',
    items: [
      {
        q: 'How do I set up my restaurant?',
        a: 'When you first sign in, you answer a few quick questions about your restaurant, your brand, and your goals. The more you share, the better your content gets. You can update it anytime in Business info.',
        link: { label: 'Open Business info', href: '/dashboard/business-info' },
      },
      {
        q: 'What happens after I sign my agreement?',
        a: 'Your team gets to work. Within a few days you will start seeing things to review on your Home screen and in Alerts. Your team will also say hello in Messages.',
        link: { label: 'Open Messages', href: '/dashboard/messages' },
      },
      {
        q: 'What are the suggestions on my Home screen?',
        a: 'These are ideas picked for your restaurant. Tap one to see what it does, then start it. They update as things change.',
      },
      {
        q: 'What is Campaigns and the green plus button?',
        a: 'Campaigns are ready to run marketing plans for your restaurant. Tap Campaigns to browse them, or tap the green plus to start one. Each shows what it includes before you commit, and you approve before anything goes live.',
      },
    ],
  },
  {
    category: 'Approvals and alerts',
    icon: 'alerts',
    items: [
      {
        q: 'Where do I review and approve content?',
        a: 'Open Alerts and look under Needs you. Tap an item to see the full preview, then approve it or ask for changes. Nothing goes live until you say yes.',
      },
      {
        q: 'What is the Alerts screen?',
        a: 'It is one feed for everything that needs you: items to approve, new reviews, and recent activity. Use the filters at the top to focus on one kind.',
      },
      {
        q: 'What if I do not approve in time?',
        a: 'We hold it and send a reminder. Nothing publishes without your approval.',
      },
    ],
  },
  {
    category: 'Reviews and replies',
    icon: 'reviews',
    items: [
      {
        q: 'How do I reply to a Google or Yelp review?',
        a: 'Open Alerts and tap a review. We draft a reply for you. Read it, edit if you want, then post.',
      },
      {
        q: 'Do the replies sound like my restaurant?',
        a: 'Yes. Replies use your brand voice and details from the review, so they feel personal and not canned.',
      },
    ],
  },
  {
    category: 'Business info and sync',
    icon: 'business',
    items: [
      {
        q: 'Where do I update my hours, menu, or photos?',
        a: 'Open More, then Business info. You can edit your hours, address, menu, category, and photos in one place.',
        link: { label: 'Open Business info', href: '/dashboard/business-info' },
      },
      {
        q: 'Does editing Business info update Google?',
        a: 'Yes. When you save with sync on, your changes go to your Google Business Profile and your website automatically. You will see exactly what updated.',
        link: { label: 'Open Business info', href: '/dashboard/business-info' },
      },
      {
        q: 'I changed my address. Why is Google asking to verify?',
        a: 'Google sometimes re-checks a new address to keep listings accurate. This is normal. Follow the steps Google sends and your update will go live.',
      },
    ],
  },
  {
    category: 'Billing',
    icon: 'billing',
    items: [
      {
        q: 'When am I billed?',
        a: 'Your invoice is created on the 1st of each month, or the date in your agreement. Payment is due within 10 days. You can see your next date on the Billing page.',
        link: { label: 'Open Billing', href: '/dashboard/billing' },
      },
      {
        q: 'How do I update my payment method?',
        a: 'Open Billing and tap Manage billing. This opens a secure page where you can update your card or bank account.',
        link: { label: 'Open Billing', href: '/dashboard/billing' },
      },
      {
        q: 'Can I pay by bank transfer?',
        a: 'Yes. We take cards and ACH bank transfers. Bank transfers cost less to process. You can pick your method on the billing page.',
      },
      {
        q: 'Where are my invoices?',
        a: 'All of them are in the Billing section. You can view, download, or print any past invoice.',
        link: { label: 'Open Billing', href: '/dashboard/billing' },
      },
    ],
  },
  {
    category: 'Agreements',
    icon: 'agreements',
    items: [
      {
        q: 'Where is my agreement?',
        a: 'Open More, then Agreements. Your current agreement and past versions are there. You can view the text or download a PDF.',
        link: { label: 'Open Agreements', href: '/dashboard/agreements' },
      },
      {
        q: 'How do I cancel?',
        a: 'You can cancel with 30 days notice, or the notice period in your agreement. Send a message to your team. You are billed for work done through your cancel date.',
        link: { label: 'Message your team', href: '/dashboard/messages' },
      },
      {
        q: 'Am I locked into a long contract?',
        a: 'No. Agreements are month to month. You can cancel anytime with the notice period in your agreement.',
      },
    ],
  },
  {
    category: 'Messaging your team',
    icon: 'messages',
    items: [
      {
        q: 'How do I reach my team?',
        a: 'Tap the message icon at the top, or open More then Contact support. You can message the right person, like your strategist, photographer, or videographer.',
        link: { label: 'Open Messages', href: '/dashboard/messages' },
      },
      {
        q: 'What if my request is urgent?',
        a: 'Send a message and mark it urgent. For time-sensitive issues, your team contact is also in your welcome message.',
        link: { label: 'Open Messages', href: '/dashboard/messages' },
      },
    ],
  },
]
