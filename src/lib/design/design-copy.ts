/**
 * THE DESIGN ORDER'S OWNER COPY, in one place — the walk's question bank pattern
 * (walk-copy.ts), applied to the graphic configurator so the two flows speak identically.
 *
 * Same rules, same lint (scripts/sim/design-pricing.ts pins them here too):
 *   W1  titles are something an owner would say across the counter: 8 words or fewer
 *   W3  subs say what the answer changes
 *   W4  no em or en dashes anywhere in owner copy
 *   W5  optional questions say out loud what happens if skipped
 *
 * Where the SAME question exists in both flows, the line is imported from walk-copy and used
 * verbatim (never re-worded): uniformity is a build rule, not a style preference.
 *
 * `{tokens}` are substituted by the screen via the walk's own fill().
 */

import { WALK_SUBS, fill } from '../campaigns/data/walk-copy'

export { fill }

export const DESIGN_TITLES: Record<string, string> = {
  job: 'What do you need made?',
  where: 'Where is it going?',
  say: 'What should it say?',
  photos: 'Which photos should we use?',
  when: 'When do you need it?',
  'when.event': 'When do you need it in hand?',
  review: 'Look right?',
}

export const DESIGN_SUBS: Record<string, string> = {
  job: 'Say it your way, or tap a job. We work out the rest.',
  where: 'Each place gets its own size. Your first one is included.',
  say: 'Watch it take shape. Tap a suggestion or write your own.',
  /* The walk's assets line, verbatim: the promise is the same promise. */
  photos: WALK_SUBS.assets,
  when: 'Standard turnaround delivers by {date}.',
  'when.event': 'Your event is {date}. The design should be working before that.',
  review: "This exact order becomes the designer's brief.",
}

/** Card labels, follow-ups, notes: the small print, same register as WALK_LINES. */
export const DESIGN_LINES: Record<string, string> = {
  'banner.testprices': 'Test prices. The real rate card is not set yet, so these numbers are placeholders.',
  'read.prefix': 'From what you wrote:',
  'read.unplaced': 'We cannot make {list} here yet, so it is not in this order. Message us and we will sort it out.',
  'read.ownphotos': 'Your own photos',
  'print.qty': 'How many of each?',
  'print.client.label': 'My print shop prints it',
  'print.client.sub': 'We hand you print-ready files',
  'print.us.label': 'Handle the printing for me',
  'print.us.sub': 'We run the job. Printing is billed at cost, and you see the receipt.',
  'say.headline': 'The headline',
  'say.details': 'The when and where',
  'say.deal': 'The deal',
  'say.featuring': 'Featuring, from your menu',
  'say.optional': 'optional',
  'say.headline.ph': 'Live Music Friday',
  'say.details.ph': 'Friday nights, 8pm till late',
  'say.deal.ph': '20% off pitchers',
  'say.preview.headline': 'Your headline',
  'say.preview.details': 'The when and where',
  'say.caption': 'A rough layout of the words, not the design. Your designer makes it look good.',
  'say.note': 'We design exactly these words. Changes after design starts count as a revision.',
  'photos.none.label': 'No photos needed. $0',
  'photos.none.sub': 'Text and your brand only',
  'photos.source.label': 'Source photos for me. ${price}',
  'photos.source.sub': 'We find or license the shots',
  'photos.gate': 'Too small to look sharp',
  'photos.empty': 'Nothing here is sharp enough to design with. We can source photos for ${price}.',
  'when.rushnote': 'You mentioned needing this fast. The first day without a rush charge is {date}.',
  'when.rush.q': '{date} is inside our {days} day rush window. Your call:',
  'when.rush.label': 'Rush it for {date}. +${delta}',
  'when.rush.sub': 'Your job moves to the front. Total becomes ${total}.',
  'when.norush.label': 'No rush. $0 extra',
  'when.norush.sub': 'First standard day is {date}. Total stays ${total}.',
  'when.rushon': 'Rush on for {date}.',
  'when.after': '{picked} is after your {event} event. The design would arrive too late to work. Pick a day before it.',
  'when.suggest': '{date}, three days before your event',
  'when.tag.event': 'Amber days are a rush. Days after your event are off.',
  'when.tag': 'Amber days are a rush. Standard days cost nothing extra.',
  'review.revisions': '{n} revision rounds included. Round {next}+ is billed. A change to the message, offer, or destinations is a new order, not a revision.',
  'done.title': 'Order recorded',
  'done.sub': 'This exact order becomes the brief your designer works from. Nothing gets re-interpreted.',
  'done.testmode': 'Test mode: no payment was taken.',
}
