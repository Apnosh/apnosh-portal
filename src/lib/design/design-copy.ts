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
  'say.menu.all': 'Show all {n}',
  'say.menu.less': 'Show less',
  'say.menu.search.ph': 'Search your menu',
  'say.featuring.other': 'Something else',
  'say.featuring.other.ph': 'Name the dish or special',
  'say.headline.ph': 'Live Music Friday',
  'say.details.ph': 'Friday nights, 8pm till late',
  'say.deal.ph': '20% off pitchers',
  'say.preview.headline': 'Your headline',
  'say.preview.details': 'The when and where',
  'say.caption': 'A rough layout of the words, not the design. Your designer makes it look good.',
  'say.note': 'We design exactly these words. Changes after design starts count as a revision.',
  'dest.other.label': 'Somewhere else',
  'dest.other.ph': 'Say where it goes, like a sticker or a billboard',
  'dest.other.note': 'We size it right and quote it with the rest.',
  'photos.other.label': 'Something else',
  'photos.other.sub': 'Tell us your idea in your own words',
  'photos.other.ph': 'Like: use the photos on my Instagram',
  'photos.best': 'Your sharpest photos come first. Tap every one that fits.',
  'photos.all': 'Show all {n}',
  'photos.less': 'Show less',
  'photos.search.ph': 'Search your photos',
  'photos.or': 'Or hand the photos to us',
  'photos.shoot.label': 'Book a photo shoot',
  'photos.shoot.sub': 'We shoot the real thing at your place. We set the date with you after this goes in.',
  'photos.none.label': 'No photos. Custom artwork',
  'photos.none.sub': 'Your brand, your colors, and drawn art instead of a photo',
  'photos.source.label': 'Find photos for me. ${price}',
  'photos.source.sub': 'We find or license shots that fit your place',
  'photos.gate': 'Too small to look sharp',
  'photos.sharp': 'Sharp',
  'photos.menu': 'From your menu',
  'photos.empty': 'Nothing in your library is sharp enough to design with. Book a shoot, have us find photos, or go with custom artwork.',
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
  'board.empty': 'Your graphic takes shape here',
  'board.rush': 'Rush',
  'tag.inhand': 'In hand {date}',
  'tag.event': 'Event {date}',
  'dest.included': 'Included',
  'panel.sofar': 'Your price so far',
  'panel.total': 'Total',
  'panel.revisions': 'Includes {n} revision rounds.',
  'nav.back': 'Back',
  'nav.next': 'Next',
  'nav.continue': 'Continue',
  'nav.reading': 'Reading your words',
  'photos.upload': 'Upload',
  'seal.label': 'Hold\nto order',
  'done.stamp': 'Ordered',
  'done.title': 'Order recorded',
  'done.sub': 'This exact order becomes the brief your designer works from. Nothing gets re-interpreted.',
  'done.testmode': 'Test mode: no payment was taken.',

  /* Request mode: the same flow while the rate card is unsigned. No numbers appear
   * anywhere; the seal sends a quote request instead of recording an order. */
  'banner.request': 'Sending this is free. We answer with a plan and a real price. Nothing is charged until you say yes.',
  'photos.source.label.request': 'Find the photos for me',
  'when.rush.label.request': 'Yes, rush it for {date}',
  'when.rush.sub.request': 'Rush work costs more. Your quote will show the number.',
  'when.norush.sub.request': 'First standard day is {date}.',
  'receipt.request.label': 'What this costs to send',
  'receipt.request.note': 'We read it, then send you a plan and a real price. Work starts only after you say yes.',
  'seal.label.request': 'Hold\nto send',
  'done.stamp.request': 'Request sent',
  'done.title.request': 'The team has your graphic.',
  'done.sub.request': 'This exact brief goes to a real person. You will get a plan and a price in your inbox. No charge until you say yes.',
  'send.error': 'Could not send. Check your connection and hold the seal again.',
}
