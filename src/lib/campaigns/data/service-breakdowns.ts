/**
 * Service breakdowns — full transparency on what's inside every service.
 *
 * Each service is broken into the concrete steps it actually takes, in
 * order, with who does each one. No black boxes: when an owner buys the
 * video engine they see strategy → shoot → edit → captions → schedule →
 * review, and exactly who's behind each step. Powers the LineCard "who does
 * it" drawer and the DIY "how you'd do it yourself" hints.
 *
 * Kept separate from priced-catalog.ts so the breakdown copy can be
 * edited without threading through every service object.
 */

export type StepWho = 'apnosh' | 'ai' | 'you'

export const STEP_WHO: Record<StepWho, { label: string; icon: string; hex: string }> = {
  apnosh: { label: 'Apnosh', icon: '◆',  hex: '#2e9a78' },
  ai:     { label: 'AI',     icon: '✨', hex: '#8b5cf6' },
  you:    { label: 'You',    icon: '🙋', hex: '#6b7280' },
}

export interface ProcessStep {
  step: string
  who: StepWho
  detail: string
}

const S = (step: string, who: StepWho, detail: string): ProcessStep => ({ step, who, detail })

export const BREAKDOWNS: Record<string, ProcessStep[]> = {
  /* ── Foundations ─────────────────────────────────────────────── */
  'gbp-setup': [
    S('Audit & claim', 'apnosh', 'Find and claim/verify your listing; fix duplicates and ownership issues.'),
    S('Categories & attributes', 'apnosh', 'Set the primary + secondary categories and attributes that actually drive ranking.'),
    S('Core info', 'apnosh', 'Hours (incl. holidays), service area, menu link, ordering/reservation links, contact.'),
    S('Photos & services', 'apnosh', 'Upload a starter photo set and lay out your services/menu sections.'),
    S('Verify & QA', 'apnosh', 'Confirm everything is live and rendering correctly on mobile search & Maps.'),
  ],
  'review-claim': [
    S('Claim listings', 'apnosh', 'Take ownership of Yelp and TripAdvisor (and any other platforms you trade on).'),
    S('Fix the data', 'apnosh', 'Correct hours, address, photos and category info across each platform.'),
    S('Flag violations', 'apnosh', 'Report reviews that break platform policy (fake, off-topic, conflicts).'),
    S('Set alerting', 'apnosh', 'Wire notifications so a new review never sits unseen.'),
  ],
  'site-menu': [
    S('Review & plan', 'apnosh', 'Audit the current site/menu on real phones; list what’s losing guests.'),
    S('Rebuild the menu', 'apnosh', 'Replace PDF menus with fast, readable HTML — searchable and linkable.'),
    S('Essentials up top', 'apnosh', 'Hours, location, and one-tap call / directions / order / reserve.'),
    S('Speed & mobile pass', 'apnosh', 'Optimize load time and layout for the phone, where most first visits start.'),
    S('Your review', 'you', 'You check it and request any tweaks before it goes live.'),
  ],
  'website-care': [
    S('Hosting & uptime watch', 'apnosh', 'Keep the site up; monthly speed and uptime check.'),
    S('Updates within a day', 'apnosh', 'Menu, hours, events and prices changed when you tell us, same-day.'),
    S('You flag changes', 'you', 'Send what needs updating; we handle the rest.'),
  ],
  'tracking': [
    S('Install GA4 + UTMs', 'apnosh', 'Stand up analytics and a tagging scheme so traffic sources are attributable.'),
    S('Conversion events', 'apnosh', 'Track calls, direction requests, orders and reservations as real conversions.'),
    S('Baseline snapshot', 'apnosh', 'Capture where you are today so every later line on the plan has a before/after.'),
  ],
  'crm-list': [
    S('Stand up the CRM', 'apnosh', 'Set up the system that holds every guest contact you own.'),
    S('Import & de-dupe', 'apnosh', 'Bring in existing contacts and merge duplicates cleanly.'),
    S('Segments & tags', 'apnosh', 'Define new / regular / lapsed segments and a tagging scheme you’ll actually use.'),
  ],
  'email-found': [
    S('Sending domain', 'apnosh', 'Set up a proper sending domain so email comes from you, not a generic address.'),
    S('Authentication', 'apnosh', 'SPF, DKIM and DMARC records so you land in inboxes, not spam.'),
    S('ESP wiring', 'apnosh', 'Connect the email platform to your CRM and run a deliverability check.'),
  ],
  'sms-found': [
    S('Provider & number', 'apnosh', 'Set up the SMS provider and register your number (A2P 10DLC).'),
    S('Compliance', 'apnosh', 'Opt-in language, quiet hours and opt-out handling — TCPA-clean.'),
    S('Test flow', 'apnosh', 'Send a controlled test to confirm delivery before any real send.'),
  ],
  'brand-kit': [
    S('Explore directions', 'ai', 'AI generates voice and visual directions fast for us to react to.'),
    S('Visual system', 'apnosh', 'A designer settles logo lockups, colors, fonts and photo style.'),
    S('Voice guide', 'apnosh', 'Write the voice rules every future AI draft is held to.'),
    S('Your sign-off', 'you', 'You approve the kit so everything after is made to one standard.'),
  ],
  'channel-connect': [
    S('Walk the access', 'apnosh', 'We guide you through granting publishing access for each channel.'),
    S('Verify end-to-end', 'apnosh', 'Confirm we can actually publish and read analytics on each one.'),
  ],
  'listings-sync': [
    S('Single source of truth', 'apnosh', 'Define the master record for hours, menu and photos.'),
    S('Propagate everywhere', 'ai', 'Sync tooling pushes it to Google, Yelp, Apple Maps and Facebook.'),
    S('Catch conflicts', 'apnosh', 'A human owns exceptions — wrong-hours and menu-drift never linger.'),
  ],
  'photo-library': [
    S('Shot list', 'apnosh', 'Plan the menu coverage and styling before the shoot day.'),
    S('On-site shoot', 'apnosh', 'A photographer styles and shoots your dishes on location.'),
    S('Edit & deliver', 'apnosh', 'Color, crop and retouch ~30 stills sized for Google, site, delivery apps and social.'),
    S('Hand-off', 'apnosh', 'You get the full library to own and reuse anywhere.'),
  ],
  'ordering-setup': [
    S('Pick the stack', 'apnosh', 'Choose ordering/reservation tools that fit your POS and menu.'),
    S('Build the menu', 'apnosh', 'Load items, modifiers and pricing; wire payments.'),
    S('Test the path', 'apnosh', 'Place real test orders end-to-end before going live.'),
  ],

  /* ── Awareness ───────────────────────────────────────────────── */
  'video-engine': [
    S('Monthly strategy', 'apnosh', 'Plan the month’s 8 videos: hooks, angles and what each one is for.'),
    S('Pre-production', 'apnosh', 'Shot list and prep so one visit captures everything efficiently.'),
    S('On-site shoot', 'apnosh', 'A videographer batches the whole month in a single on-location visit.'),
    S('Edit', 'apnosh', 'AI-assisted editing with a human finish — pacing, cuts, music, brand look.'),
    S('Captions & copy', 'ai', 'AI drafts captions and hooks in your voice; a human reviews.'),
    S('Schedule & publish', 'apnosh', 'Post all 8 to Instagram at the right times.'),
    S('One revision', 'apnosh', 'You get a round of changes before anything is final.'),
    S('Performance read', 'apnosh', 'Check reach and follows; feed what worked into next month.'),
  ],
  'video-single': [
    S('Concept', 'apnosh', 'Nail the hook and angle for this one video.'),
    S('Dedicated shoot', 'apnosh', 'A videographer comes out for the shoot (carries the full visit minimum).'),
    S('Edit', 'apnosh', 'AI-assisted edit with a human finish.'),
    S('Caption', 'ai', 'AI drafts the caption; a human reviews.'),
    S('Publish & revise', 'apnosh', 'Schedule it and handle one round of changes.'),
  ],
  'social-mgmt': [
    S('Content plan', 'apnosh', 'Map the month’s 12 posts to your events, menu and moments.'),
    S('Draft posts', 'ai', 'AI drafts captions and creative on your brand kit.'),
    S('Curate & schedule', 'apnosh', 'A human picks, polishes and schedules; offshore handles the mechanics.'),
    S('Community management', 'apnosh', 'Comments and DMs answered within a day — including the tricky ones.'),
  ],
  'gbp-posts': [
    S('Generate from your data', 'ai', 'AI writes 4 posts/mo and Q&A answers from your menu and events.'),
    S('Human QA', 'apnosh', '15-minute review before anything publishes.'),
    S('Publish', 'apnosh', 'Posts go live on your Google profile to keep it active.'),
  ],
  'local-seo': [
    S('Citation cleanup', 'apnosh', 'Fix name/address/phone consistency across dozens of directories.'),
    S('Schema markup', 'apnosh', 'Add structured data so search engines read your business correctly.'),
    S('Monthly monitoring', 'apnosh', 'Track local rank and citations; fix what slips.'),
  ],
  'delivery-opt': [
    S('Listing rebuild', 'apnosh', 'Restructure your DoorDash/UberEats/Grubhub menus to convert.'),
    S('Photos & descriptions', 'apnosh', 'Add item photos; AI drafts descriptions at volume, human-reviewed.'),
    S('Promos & ads', 'apnosh', 'Run in-platform promos and sponsored listings monthly.'),
    S('Watch ratings', 'apnosh', 'Monitor the in-app ratings that drive ranking.'),
  ],
  'paid-ads': [
    S('Strategy & setup', 'apnosh', 'Build geo-targeted Meta + Google campaigns around what already works.'),
    S('Creative', 'apnosh', 'Rotate ad creative drawn from your content library.'),
    S('Weekly optimization', 'apnosh', 'Adjust bids, audiences and creative on real performance.'),
    S('Cost-per-customer read', 'apnosh', 'Report what each new customer costs — and kill what doesn’t pay.'),
  ],
  'creator-collab': [
    S('Source & vet', 'apnosh', 'Find local food creators whose audience matches yours.'),
    S('Negotiate & brief', 'apnosh', 'Agree terms and brief them on the story to tell.'),
    S('Coordinate', 'apnosh', 'Handle the visit and make sure the post ships.'),
  ],
  'pr-media': [
    S('Story mining', 'apnosh', 'Find the angle — founder, recipes, opening — editors actually want.'),
    S('Press kit', 'apnosh', 'Assemble photos, facts and quotes into a ready-to-pitch kit.'),
    S('Pitch', 'apnosh', 'Reach local food press and critics through real relationships.'),
  ],
  'truck-location': [
    S('Schedule intake', 'you', 'You keep your calendar of stops current.'),
    S('Format the posts', 'ai', 'AI turns the schedule into daily “where we are” posts.'),
    S('Publish everywhere', 'apnosh', 'Push to your site, social, SMS list and truck-locator apps daily.'),
  ],
  'graphic': [
    S('Brief', 'apnosh', 'Capture the offer, the date and the look in one quick brief.'),
    S('Explore layouts', 'ai', 'AI generates layout and copy directions fast.'),
    S('Design & finish', 'apnosh', 'An Apnosh designer makes the final, on-brand graphic — sized for every channel.'),
    S('Your review', 'you', 'One round of changes before it ships.'),
  ],
  'gbp-event-post': [
    S('Draft from your details', 'ai', 'AI writes the event post from your date, offer and menu.'),
    S('Human QA', 'apnosh', 'A quick review for tone and accuracy.'),
    S('Publish dated', 'apnosh', 'Goes live on your Google profile with the right start/end dates.'),
  ],
  'fb-event': [
    S('Create the page', 'apnosh', 'Set up the Facebook event with name, date, location and cover art.'),
    S('Invite & seed', 'apnosh', 'Invite your followers and pin it so it spreads.'),
    S('Auto-reminders', 'ai', 'Facebook reminds everyone who responds as the date nears — automatically.'),
  ],

  /* ── Capture ─────────────────────────────────────────────────── */
  'capture-kit': [
    S('Offer copy', 'ai', 'AI drafts the incentive copy variants.'),
    S('Design & print', 'apnosh', 'Design table tents, counter cards and receipt inserts; arrange print.'),
    S('Wire the capture', 'apnosh', 'QR codes route into your CRM so every scan becomes a contact.'),
  ],
  'landing-page': [
    S('Copy', 'ai', 'AI drafts the offer page copy.'),
    S('Build the page', 'apnosh', 'A fast single page: offer, form, confirmation.'),
    S('Wire & test', 'apnosh', 'Connect the form to the CRM and test the whole signup path.'),
  ],
  'incentive-design': [
    S('Pick the offer', 'apnosh', 'Choose the giveaway (free app, dessert, % off) most likely to convert.'),
    S('Margin math', 'apnosh', 'Run it against your food cost so it stays profitable.'),
  ],
  'ai-phone': [
    S('Setup', 'apnosh', 'Configure the AI to answer hours, menu and directions in your voice.'),
    S('Escalation path', 'apnosh', 'Bookings and complaints route to a human; nothing sensitive is AI-only.'),
    S('Missed-call text-back', 'ai', 'Every missed call gets an instant text so you don’t lose the cover.'),
  ],
  'pre-opening': [
    S('Coming-soon page', 'apnosh', 'A page that captures emails before you open.'),
    S('GBP 90 days out', 'apnosh', 'Get your Google profile live up to 90 days before the doors.'),
    S('Countdown content', 'apnosh', 'Build the 8-week behind-the-scenes countdown.'),
    S('Soft opening ladder', 'apnosh', 'Stage friends/family → list → press into opening week.'),
    S('Opening press push', 'apnosh', 'Pitch local media around the launch.'),
  ],

  /* ── Nurture ─────────────────────────────────────────────────── */
  'welcome-seq': [
    S('Map the sequence', 'apnosh', 'Plan 3 emails + 1 SMS across the first two weeks.'),
    S('Draft the messages', 'ai', 'AI writes all four in your voice.'),
    S('Edit & build', 'apnosh', 'Human edit, then build and QA the automation.'),
    S('Launch', 'apnosh', 'Turn it on so every new contact is nudged back automatically.'),
  ],
  'second-visit': [
    S('Define the trigger', 'apnosh', 'Decide the timing and incentive after a first visit.'),
    S('Draft the message', 'ai', 'AI writes the nudge in your voice.'),
    S('Wire & test', 'apnosh', 'Build the automation and confirm it fires correctly.'),
  ],
  'newsletter': [
    S('Pick the angle', 'apnosh', 'Choose what’s worth saying this month — new, seasonal, a reason to visit.'),
    S('Draft', 'ai', 'AI writes the first version from your events and menu.'),
    S('Edit & send', 'apnosh', 'Human edit to earn the open, then build and send.'),
  ],
  'sms-program': [
    S('Segment', 'apnosh', 'Pick who gets each of the 2 monthly sends and when.'),
    S('Draft', 'ai', 'AI drafts the message.'),
    S('Send with discipline', 'apnosh', 'Human owns timing, frequency and compliance on every send.'),
  ],

  /* ── Convert ─────────────────────────────────────────────────── */
  'offer-eng': [
    S('Design the offer', 'apnosh', 'Build the hook, the mechanic and the redemption path.'),
    S('Margin math', 'apnosh', 'Pressure-test it against your food cost so it actually pays.'),
    S('Read the result', 'apnosh', 'Report redemptions and margin after it runs.'),
  ],
  'menu-eng': [
    S('Pull the data', 'apnosh', 'Analyze contribution margin per item from your POS.'),
    S('Classify items', 'ai', 'Sort stars / plowhorses / puzzles / dogs.'),
    S('Reprice & lay out', 'apnosh', 'Apply pricing psychology and layout; recommend cuts and promotions.'),
  ],
  'event-pkg': [
    S('One brief', 'apnosh', 'Capture the event details once.'),
    S('Draft every asset', 'ai', 'AI drafts graphic copy, email, SMS and GBP post from the brief.'),
    S('Design & ship', 'apnosh', 'Design the graphic and ship the whole set together.'),
  ],
  'reminder-send': [
    S('Pick the moment', 'apnosh', 'Choose the segment and the exact time to send for max bookings.'),
    S('Draft the nudge', 'ai', 'AI writes the “book now / tonight!” message in your voice.'),
    S('Send compliant', 'apnosh', 'Human owns timing and TCPA compliance on the send.'),
  ],
  'bar-events': [
    S('Monthly calendar', 'apnosh', 'Plan the recurring weeknight programming.'),
    S('Draft the assets', 'ai', 'AI drafts the 4 monthly event pushes from templates.'),
    S('Distribute', 'apnosh', 'Push to social, SMS and event listings.'),
  ],
  'catering-engine': [
    S('Lead capture', 'apnosh', 'Build the inquiry page and route leads into the CRM.'),
    S('Proposal templates', 'apnosh', 'AI drafts proposals/quotes; human tailors and finalizes.'),
    S('B2B outreach', 'apnosh', 'Reach local offices and planners to seed recurring accounts.'),
  ],
  'giftcards': [
    S('Program setup', 'apnosh', 'Stand up digital + physical gift cards on your POS.'),
    S('Q4 campaign', 'ai', 'AI drafts the November–December push; human ships it.'),
  ],
  'reservation-protect': [
    S('Reminders', 'apnosh', 'Wire confirmation + day-of reminder texts with one-tap rebooking.'),
    S('Deposit policy', 'apnosh', 'Design the deposit / card-hold policy for peak nights.'),
  ],

  /* ── Retain ──────────────────────────────────────────────────── */
  'review-engine': [
    S('Trigger setup', 'apnosh', 'Wire post-visit review invites to fire for every guest.'),
    S('Stay compliant', 'apnosh', 'No gating — invites go to everyone, inside Google/Yelp/FTC rules.'),
  ],
  'feedback-loop': [
    S('Survey', 'apnosh', 'Build a post-visit survey that hears problems directly.'),
    S('Triage', 'ai', 'AI flags unhappy responses and drafts the recovery outreach.'),
    S('Same-day save', 'apnosh', 'A human makes the recovery — runs alongside, never replaces, public review invites.'),
  ],
  'review-responses': [
    S('Draft responses', 'ai', 'AI writes a reply to every review in your voice, instantly.'),
    S('Approve & post', 'apnosh', 'A human approves and posts — especially the angry ones.'),
    S('Track the trend', 'apnosh', 'Watch rating and review volume month over month.'),
  ],
  'loyalty': [
    S('Design the program', 'apnosh', 'Pick a reward structure that fits your format and food cost.'),
    S('POS & app setup', 'apnosh', 'Build it into your POS and any app.'),
    S('Staff one-pager', 'apnosh', 'Give the team a simple script to enroll guests.'),
    S('Monthly care', 'apnosh', 'Keep it running and tuned.'),
  ],
  'winback': [
    S('Lapse logic', 'apnosh', 'Define what “gone quiet” means at 30 / 60 / 90 days.'),
    S('Draft the escalation', 'ai', 'AI writes the escalating reasons to return.'),
    S('Wire the triggers', 'apnosh', 'Build the automation so it runs itself.'),
  ],
  'birthday': [
    S('Collect the date', 'apnosh', 'Capture birthdays at signup.'),
    S('Write it once', 'ai', 'AI drafts the birthday treat message.'),
    S('Automate forever', 'apnosh', 'The send runs on its own from then on.'),
  ],

  /* ── Anticipation ────────────────────────────────────────────── */
  'seasonal-cal': [
    S('Generate candidates', 'ai', 'AI maps the quarter’s holidays, local events and menu moments.'),
    S('Curate with you', 'apnosh', 'We shape the calendar together so nothing is last-minute.'),
  ],
  'concierge': [
    S('Build the kit', 'apnosh', 'Per-hotel incentive cards and a concierge kit.'),
    S('Monthly visits', 'apnosh', 'In-person visits on a cadence so the front desk sends you guests.'),
  ],
  'vip-comms': [
    S('Pick the segment', 'apnosh', 'Choose which regulars hear it first, and when.'),
    S('Draft & send', 'ai', 'AI drafts the early-access send; we ship it.'),
  ],
  'reporting': [
    S('Assemble the numbers', 'ai', 'AI pulls visits, list growth, reviews and revenue signals together.'),
    S('Read & recommend', 'apnosh', 'We tell you what worked, what didn’t, and what to stop paying for.'),
    S('Review call', 'apnosh', 'A 20-minute call each month on what to change next.'),
  ],

  /* ── Content pieces (à-la-carte deliverables) ────────────────── */
  'content-reel': [
    S('Concept & hook', 'apnosh', 'Nail the angle that stops the scroll.'),
    S('Shoot footage', 'you', 'Grab clips on your phone, or we shoot it — your call.'),
    S('Edit & caption', 'ai', 'AI-assisted edit and caption in your voice; a human finishes.'),
    S('Publish', 'apnosh', 'Posted to Instagram at the right time.'),
  ],
  'content-photo': [
    S('Style & shoot', 'apnosh', 'A styled photo of the dish or moment.'),
    S('Edit', 'apnosh', 'Color and crop for every place it’ll appear.'),
  ],
  'content-post': [
    S('Draft', 'ai', 'AI drafts the post copy and graphic on your brand.'),
    S('Design & finish', 'apnosh', 'A human polishes and ships it.'),
  ],
  'content-story': [
    S('Draft', 'ai', 'AI drafts the day-of story frames.'),
    S('Publish', 'apnosh', 'Goes live on the day to drive same-night traffic.'),
  ],
  'content-email': [
    S('Draft', 'ai', 'AI writes the email in your voice from the event details.'),
    S('Edit & send', 'apnosh', 'Human edit to earn the open, then send to your list.'),
  ],
  'content-sms': [
    S('Draft', 'ai', 'AI writes the text in your voice.'),
    S('Send compliant', 'apnosh', 'Human owns timing and TCPA compliance on the send.'),
  ],
}

export function breakdownFor(id: string): ProcessStep[] {
  return BREAKDOWNS[id] ?? []
}
