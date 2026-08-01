/**
 * PROBE, not a golden: 15 real owner situations through the design read's local floor.
 * Reports what the vocabulary catches, misses, and mislabels — evidence for the question
 * audit, thrown away after. Run: npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/design-situations-probe.ts
 */
import { matchDesignJob, sanitizeDesignRead } from '../../src/lib/design/design-read'

const TODAY = '2026-07-31'

const SITUATIONS: { id: string; text: string; want: string }[] = [
  { id: 'taco-tuesday', text: 'Instagram post for our taco tuesday special, $2 tacos every tuesday', want: 'weekly-special, ig-post, offer $2' },
  { id: 'grand-opening', text: 'We are having a grand opening on September 12 and need a big banner and flyers to hand out', want: 'event, banner(!), flyer, Sep 12' },
  { id: 'menu-board', text: 'New menu board for the wall behind the counter', want: 'new-menu, menu-board' },
  { id: 'holiday-close', text: 'We are closed Labor Day weekend, need something for the door and for Facebook', want: 'holiday-hours, poster+fb, NO photos needed' },
  { id: 'hiring', text: 'Now hiring line cooks, $18 an hour, need a post for Instagram and a flyer for the window', want: 'hiring, ig+flyer' },
  { id: 'trivia', text: 'Trivia night every Thursday starting next month', want: 'event-promo, recurring(!)' },
  { id: 'doordash', text: 'We just got on DoorDash and want to announce it everywhere', want: 'other, announce' },
  { id: 'mothers-day', text: 'Mothers Day brunch May 10, reservations required, want table tents and an email blast', want: 'event, table-tent, email(!)' },
  { id: 'happy-hour-redesign', text: 'Need our happy hour menu redesigned, it looks dated', want: 'new-menu' },
  { id: 'gift-cards', text: 'Gift cards to sell for the holidays', want: 'other, gift-card(!)' },
  { id: 'patio-asap', text: 'A poster for the window about our new patio, need it asap', want: 'other, poster, rush' },
  { id: 'google-photos', text: 'Something for Google when people search us, our photos on there are old', want: 'google-listing (but is it a design job?)' },
  { id: 'catering', text: 'Catering flyer to drop off at local offices, we do office lunches', want: 'other, flyer' },
  { id: 'anniversary', text: 'Anniversary party June 20, ten years open, free cake with every table', want: 'event, free-cake offer, Jun 20' },
  { id: 'qr-tents', text: 'QR code table tents so people can order from the table', want: 'table-tent, QR asset(!)' },
]

for (const s of SITUATIONS) {
  const job = matchDesignJob(s.text)
  const read = sanitizeDesignRead(null, s.text, TODAY) // null = pure local floor
  console.log(`\n■ ${s.id}  (want: ${s.want})`)
  console.log(`  local job: ${job ?? 'NULL (chips ask)'}  monthHint: ${read.monthHint ?? '-'}  rush: ${read.rushLanguage ?? false}  unplaced: ${read.unplaced?.join(',') ?? '-'}`)
}
