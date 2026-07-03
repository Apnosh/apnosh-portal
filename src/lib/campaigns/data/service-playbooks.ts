/**
 * service-playbooks.ts — the hand-authored, per-service STEP TEMPLATE that turns a purchased service
 * line into a real work checklist. Keyed by serviceId, same authoring pattern as service-turnaround.ts
 * and service-channels (NOT in the generated catalog, so it survives regen and the catalog team can
 * tune it). A service is a repeatable recipe done hundreds of times, so the spine is templated, not
 * freeform; operators may add ad-hoc steps on top for edge cases, but the default is this list.
 *
 * Each step carries a short `lead` (one line: what the step is) plus `actions` — the concrete task
 * bullets an operator checks off to complete the step. The action bullets are the "exactly what to do"
 * list; a step is done when all its actions are checked (delivered still requires proof on the order).
 *
 * gbp-setup ("Show up on Google") + gbp-posts (the recurring GBP management cycle) are authored.
 * seedSteps() instantiates a template into the runtime jsonb the service_work_orders row stores.
 */

/** Who acts on a step: the Apnosh operator, the client (an input we need), or an external gate. */
export type StepActor = 'ops' | 'client' | 'gate'

/** One authored step in a service's playbook (the template — no runtime state). */
export interface PlaybookStep {
  id: string
  /** Client-facing short label ("Claim and verify your Google listing"). No em dashes. */
  label: string
  /** One-line summary of what this step is. */
  lead: string
  /** The concrete task bullets to complete the step. Each becomes a checkable item. */
  actions: string[]
  actor: StepActor
  /** The external turnaround gate this step can wait on (service-turnaround.ts kind), e.g. 'gbp-verify'. */
  gateKind?: string
  /** The readiness / service-needs key the client must satisfy before this step can proceed. */
  needsInput?: string
  /** What evidence marks it done, for the operator UI + the delivered proof pack. */
  proof?: 'link' | 'screenshot' | 'note' | 'none'
}

export interface ServicePlaybook {
  serviceId: string
  steps: PlaybookStep[]
  /** What the client receives on delivery. */
  deliverable: {
    /** Label for the live-result link the operator pastes (proof_url). */
    liveLinkLabel: string
    /** The metric the owner watches after, read from the catalog's metric. */
    metricLabel: string
  }
}

/** One runtime action bullet (stored in the step's jsonb): the task text plus its checked state. */
export interface WorkOrderAction {
  text: string
  done: boolean
  doneAt?: string
}

/** The runtime step, stored in service_work_orders.steps jsonb — the template plus live state. */
export interface WorkOrderStep {
  id: string
  label: string
  lead: string
  actions: WorkOrderAction[]
  actor: StepActor
  /** Derived from the actions (all done → 'done'); the operator toggles the bullets, not this. */
  status: 'todo' | 'done'
  gateKind?: string
  needsInput?: string
  proof?: 'link' | 'screenshot' | 'note' | 'none'
  proofUrl?: string
  doneAt?: string
}

export const SERVICE_PLAYBOOKS: Record<string, ServicePlaybook> = {
  // ── "Show up on Google" — the one-time GBP setup. Best-possible restaurant version, built from a
  //    5-lens expert workflow. Scope is deliberately drawn to NOT overlap neighboring sellable
  //    services: Order/Reserve-button wiring is google-food-order; ongoing posts + Q&A are gbp-posts;
  //    ongoing review replies are review-responses; the monthly report is reporting. This service
  //    stands the profile up complete and correct once, and hands the rest off. ──
  'gbp-setup': {
    serviceId: 'gbp-setup',
    steps: [
      {
        id: 'intake',
        label: 'Get us in and gather the facts',
        lead: 'Collect access and the facts only the owner has, before any work starts.',
        actions: [
          'Owner adds Apnosh as a Manager on the Google profile (Owner if it is unclaimed)',
          'Get the exact business name as shown on the sign',
          'Get the full address, best public phone, and website',
          'Get regular hours and any holiday closures',
          'Get the service model: dine-in, takeout, delivery, curbside, reservations',
          'Get the main cuisine and 3 to 8 signature dishes',
          'Get the menu with prices (link or file)',
          'Get ordering and reservation links, and the owner\'s preferred one',
          'Get 15 to 20 real photos: storefront, inside, hero dishes, logo',
          'Ask about any duplicate or old-address listing to clean up',
        ],
        actor: 'client',
        needsInput: 'gbp-access',
        proof: 'note',
      },
      {
        id: 'access-proof',
        label: 'Confirm access with proof',
        lead: 'Prove we can actually reach the profile before starting.',
        actions: [
          'Run a connection probe on the profile',
          'Screenshot Apnosh showing in the Managers or Owners list',
          'If no listing exists yet, note it and go to Claim',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'baseline',
        label: 'Capture the starting numbers',
        lead: 'Record the before picture so the lift can be proven later.',
        actions: [
          'Screenshot the profile as it looks today',
          'Record the last 30 days: calls, direction requests, website clicks, views',
          'For a brand-new listing, write "no prior data, new listing"',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'claim',
        label: 'Claim, verify, and clean up duplicates',
        lead: 'Take ownership and make sure there is only one correct listing.',
        actions: [
          'Find the correct listing and claim it',
          'Start Google verification (video, postcard, phone, or instant)',
          'Merge or request removal of duplicate, old-owner, or wrong-address listings',
          'Confirm the map pin sits on the real front door',
          'If none exists, create the listing',
          'Note the verification method and expected clear date',
        ],
        actor: 'ops',
        gateKind: 'gbp-verify',
        proof: 'screenshot',
      },
      {
        id: 'category',
        label: 'Set the primary category and attributes',
        lead: 'Pick the strongest category and switch on the true attributes.',
        actions: [
          'Set the most specific primary category (e.g. "Korean barbecue restaurant", not "Restaurant")',
          'Glance at who already ranks nearby and record why this category',
          'Add 2 to 3 real secondary categories',
          'Set service options: dine-in, takeout, delivery, curbside',
          'Set the true attributes: reservations, accessibility, outdoor seating',
          'Set food filters: vegetarian or vegan, serves alcohol, kid-friendly',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'content',
        label: 'Write the description and services',
        lead: 'Fill the words that carry keywords and answer "why here".',
        actions: [
          'Write the ~750-character description, leading with cuisine, neighborhood, and signature dishes',
          'Keep it natural, no keyword stuffing',
          'Fill the Services list with real offerings and dish families',
          'Phrase them the way locals search ("birria tacos", "happy hour", "catering")',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'coreinfo',
        label: 'Fill hours, phone, website, and menu link',
        lead: 'Lock in the info that earns calls and directions.',
        actions: [
          'Enter regular hours and any holiday hours',
          'Set the service area if there is one',
          'Add the primary local phone',
          'Add the website, UTM-tagged for the owner\'s own analytics',
          'Add a working menu link',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'menu',
        label: 'Build the on-profile menu and dishes',
        lead: 'Put a real, readable menu on the profile where it renders.',
        actions: [
          'If Google\'s menu editor is available, enter menu sections (starters, mains, desserts, drinks)',
          'Add item names, short descriptions, and prices',
          'Seed the owner\'s signature dishes',
          'If the editor is not available, keep the external menu link as the fallback',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'photos',
        label: 'Load the food photo set that sells',
        lead: 'Upload owner photos into the right categories.',
        actions: [
          'Upload storefront and exterior shots',
          'Upload interior and ambiance shots',
          'Upload hero shots of the signature dishes',
          'Upload the logo and set the best food photo as cover',
          'Use owner photos only; if none exist, flag a photo shoot as a separate service',
        ],
        actor: 'ops',
        needsInput: 'gbp-photos',
        proof: 'link',
      },
      {
        id: 'review-link',
        label: 'Stand up the review request link',
        lead: 'Build the capture rail so reviews can start coming in.',
        actions: [
          'Generate the profile\'s short review link',
          'Make a printable QR code for the link',
          'Confirm the star rating surface is live',
          'Hand the link and QR to the owner',
        ],
        actor: 'ops',
        proof: 'link',
      },
      {
        id: 'signoff',
        label: 'Owner signs off on the choices',
        lead: 'Get a quick yes on the judgment calls before it goes out.',
        actions: [
          'Show the owner the primary category',
          'Show the owner the description',
          'Show the owner any button target',
          'Get a yes, or make the changes they ask for',
        ],
        actor: 'client',
        proof: 'note',
      },
      {
        id: 'qa-deliver',
        label: 'Check on a real phone and deliver',
        lead: 'Prove it works on a phone, then hand it over with the proof.',
        actions: [
          'Open the live profile on a real phone in Google Search and Maps',
          'Check category, hours, phone, website, and description',
          'Check the menu, photos, and any Order or Reserve buttons render and route right',
          'Confirm no wrong or duplicate info remains',
          'If Order or Reserve buttons are wanted but not set, flag the Google order and reserve service',
          'Deliver the live profile link plus the QA and baseline screenshots',
          'Add a plain note: verification and ranking are outside our control; actions build over 30 to 60 days; ongoing posts, replies, and updates are separate services',
        ],
        actor: 'ops',
        proof: 'link',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your live Google profile',
      metricLabel: 'Calls and direction requests from Google',
    },
  },

  // ── "GBP posts & Q&A" — the RECURRING GBP management service (already sold; this authors its
  //    monthly work cycle). One work order = one month's cycle. Keeps the profile active so it holds
  //    its rank, which the setup service explicitly hands off to. ──
  'gbp-posts': {
    serviceId: 'gbp-posts',
    steps: [
      {
        id: 'plan-month',
        label: 'Plan the month from real data',
        lead: 'Decide what to post from the real menu and events.',
        actions: [
          'Pull this month\'s menu, specials, and events',
          'Pick four post topics and the current offer to feature',
          'Note the top diner questions worth answering',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'draft',
        label: 'Draft four posts and Q&A',
        lead: 'Write the month\'s posts and answers in brand voice.',
        actions: [
          'Write four Google posts in the owner\'s brand voice',
          'Write the Q&A answers from the real menu and events',
          'No stock filler',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'qa-review',
        label: 'Human review before publish',
        lead: 'A person checks everything before it goes live.',
        actions: [
          'Review every post and answer',
          'Check voice, accuracy, and that the offer is right',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'publish',
        label: 'Publish live to the profile',
        lead: 'Put the posts and answers on the live profile.',
        actions: [
          'Publish the four posts across the month',
          'Post the Q&A answers',
          'Confirm each renders on Search and Maps',
        ],
        actor: 'ops',
        proof: 'link',
      },
      {
        id: 'log-actions',
        label: 'Log the month\'s profile actions',
        lead: 'Record the numbers so the trend is visible.',
        actions: [
          'Record the month\'s profile actions: post views, calls, directions',
          'Pass the numbers to the Monthly report service',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your Google profile',
      metricLabel: 'Google profile actions',
    },
  },
}

export function playbookFor(serviceId: string): ServicePlaybook | undefined {
  return SERVICE_PLAYBOOKS[serviceId]
}

/** Instantiate a service's playbook into the runtime step list stored on the work order. Returns []
 *  for a service with no authored playbook yet (the work order still exists; it just has no checklist
 *  until a playbook is authored — honest, never a fake step). */
export function seedSteps(serviceId: string): WorkOrderStep[] {
  const pb = SERVICE_PLAYBOOKS[serviceId]
  if (!pb) return []
  return pb.steps.map((s) => ({
    id: s.id,
    label: s.label,
    lead: s.lead,
    actions: s.actions.map((text) => ({ text, done: false })),
    actor: s.actor,
    status: 'todo' as const,
    ...(s.gateKind ? { gateKind: s.gateKind } : {}),
    ...(s.needsInput ? { needsInput: s.needsInput } : {}),
    ...(s.proof ? { proof: s.proof } : {}),
  }))
}
