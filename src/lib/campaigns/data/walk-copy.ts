/**
 * THE WALK'S OWNER COPY, in one place (docs/QUESTION-DESIGN-PLAN.md, P1).
 *
 * Every title and sub the question walk shows lives here, so the wording rules are checkable
 * instead of aspirational. The lint (scripts/sim/campaign-ledger.ts) pins:
 *   W1  titles are something an owner would say across the counter: 8 words or fewer
 *   W3  subs say what the answer changes (by review, not lint)
 *   W4  no em or en dashes anywhere in owner copy
 *   W5  optional questions say out loud what happens if skipped
 *
 * `{tokens}` are substituted by the screen ({amount}, {metric}, {date}). Keep them intact
 * when editing copy.
 */

export const WALK_TITLES: Record<string, string> = {
  'date.opening': 'When do you open?',
  'date.event': 'When is it?',
  'date.run': 'How long is it on for?',
  start: 'When should this start?',
  money: 'Do you have a budget in mind?',
  'money.confirm': 'Confirm the budget',
  offer: 'What is the deal, exactly?',
  capacity: 'If this works, what limits you?',
  target: 'What should this campaign hit?',
  shift: 'Which shifts need filling?',
  assets: 'What have you got to work with?',
  promote: 'What should we lead with?',
  reach: 'How far should we pull people from?',
  avoid: 'Anything we should never do?',
}

export const WALK_SUBS: Record<string, string> = {
  date: 'We work backwards from this day, so the last push lands on it.',
  'date.run': 'The day it starts, and the day it comes off.',
  start: 'We build the same plan either way. This just sets the clock.',
  money: 'Optional. Skip it and we size the plan to the job. You can always move the number on the plan itself.',
  'money.confirm': 'You wrote about {amount}. Confirm it or change it. Nothing is sized until you do.',
  offer: 'This goes out exactly as you set it here. We never guess money.',
  capacity: 'A full room needs the room ready. Tell us what runs out first, and who tells the staff.',
  target: 'We track {metric} for campaigns like this. Falling short partway, we flag it and adjust.',
  shift: 'Naming them aims the work at the tables that sit empty.',
  assets: 'Pick anything you already have. We build around it, and you are never billed for it.',
  promote: 'Pick one to three. We lead with your first pick.',
  reach: 'Ads and listings stop at this line. Wider costs more to reach the same person.',
  avoid: 'Optional, and the one place a plan most often goes wrong. Pick anything that is off limits.',
}

/** Card labels, restate prefixes, escape links: the small print of the walk. */
export const WALK_LINES: Record<string, string> = {
  'start.asap.label': 'As soon as possible',
  'start.asap.sub': 'We start the moment you approve the plan',
  'start.date.label': 'On a date',
  'start.date.sub': 'Pick the day the work should begin',
  'money.auto.label': 'You size it for me',
  'money.auto.sub': 'We build what this campaign needs and show you the price',
  'money.num.label': 'I have a number',
  'money.num.sub.dated': 'The launch gets built to fit it',
  'money.num.sub.monthly': 'The monthly plan gets built to fit it',
  'audience.line': 'Who is it mostly for? Optional. Sharpens the wording.',
  'assets.none': 'I have nothing yet',
  'offer.escape': 'My deal is different',
  'capacity.who': 'Who tells the staff about it?',
  'capacity.who.ph': 'The manager, at Friday setup.',
  'restate.promote': 'Leading with',
  'restate.shift': 'Fixing',
  'restate.avoid': 'Never',
  'run.note': 'We record the end date and the team works to it. The automatic schedule counts back from the start, so a long run gets checked by a person.',
}

/**
 * WHAT PICKING AN ASSET JUST DID FOR YOU — shown on the card the moment it is selected, so
 * honesty reads as visible money and strength (rule D2). Keys are OWNER_ASSETS values.
 */
export const ASSET_PAYOFF: Record<string, string> = {
  'A DJ or live music': 'Makes the event package worth more.',
  'Something to give away': 'Makes the offer design worth more.',
  'Tickets': 'Makes the giveaway and creator work stronger.',
  'A private room or patio': 'Makes catering and event work stronger.',
  'Staff happy to be on camera': 'Makes the video work stronger.',
  'Our own photos or video': 'Replaces the photo shoot. You will not pay for one.',
  'A special dish or menu': 'Gives the work something real to lead with.',
  'A partner or sponsor': 'Makes press and collab work stronger.',
}

/** The capacity question's part-one chips. 'Nothing limits us' is exclusive. */
export const CAPACITY_CHIPS: readonly string[] = [
  'Staffing is tight',
  'Prep is the limit',
  'Only so many of the featured item',
  'Nothing limits us',
]

/** The questions whose sub must state the skip-consequence (rule W5). */
export const OPTIONAL_QUESTION_SUBS: readonly string[] = ['money', 'avoid']

/** One-token substitution, kept dumb on purpose. */
export function fill(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => tokens[k] ?? m)
}
