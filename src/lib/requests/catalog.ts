/**
 * THE CREATIVE REQUEST CATALOG — every kind of marketing work an owner can ask for.
 *
 * This generalizes the design order ("get a graphic made") into the full request menu:
 * graphics, menus, logos, websites, short videos, photo shoots, social batches, emails,
 * ads, print and signs, and words. Request-first, quote-later: a request collects a
 * clear brief and NEVER charges. The team reads it, replies with a price and a plan,
 * and the work starts only after the owner says yes. That is why this can be live while
 * the design rate card is still under review: no unsigned number ever reaches a buyer.
 *
 * Copy rules (house lint, sim-enforced): no em or en dashes, plain 5th grade words,
 * short labels. Every type ends with the same two shared questions: when it is needed
 * and anything else we should know.
 */

import { DESTINATIONS } from '@/lib/design/destinations'

export type RequestTypeId =
  | 'graphic'
  | 'menu'
  | 'logo'
  | 'website'
  | 'video'
  | 'photos'
  | 'social'
  | 'email'
  | 'ads'
  | 'print'
  | 'copy'
  | 'other'

export type QuestionKind = 'choice' | 'text' | 'long'

export interface RequestQuestion {
  id: string
  prompt: string
  kind: QuestionKind
  /** required unless marked optional */
  optional?: boolean
  /** for kind 'choice' */
  options?: readonly string[]
  /** choice questions only: pick as many as apply; the answer stores them joined ', ' */
  multi?: boolean
  /** gray hint inside text inputs; never submitted as an answer */
  hint?: string
}

/** Split a multi-choice answer back into its picks. Safe on empty/single values. */
export const splitMulti = (val: string | undefined): string[] =>
  (val ?? '').split(', ').map((s) => s.trim()).filter(Boolean)

export interface RequestType {
  id: RequestTypeId
  label: string
  /** one plain line under the label on the picker */
  blurb: string
  /** short verb phrase for the success screen, e.g. "your graphic" */
  noun: string
  questions: readonly RequestQuestion[]
}

/** Shared tail questions every type gets (timing + open notes). */
export const SHARED_QUESTIONS: readonly RequestQuestion[] = [
  { id: 'when', prompt: 'When do you need it?', kind: 'choice', options: ['This week', 'In 2 weeks', 'This month', 'No rush'] },
  { id: 'notes', prompt: 'Anything else we should know?', kind: 'long', optional: true, hint: 'Links, examples you like, things to avoid' },
]

export const REQUEST_TYPES: readonly RequestType[] = [
  {
    id: 'graphic',
    label: 'A graphic',
    blurb: 'A promo image, social graphic, or any one off design',
    noun: 'your graphic',
    questions: [
      { id: 'what', prompt: 'What is the graphic for?', kind: 'text', hint: 'Taco Tuesday flyer, grand opening poster' },
      /* The REAL destination formats from the design spec (src/lib/design/destinations),
       * pick as many as apply — each lands on the board as a frame at its true size. */
      { id: 'where', prompt: 'Where will it go? Pick every place.', kind: 'choice', multi: true, options: DESTINATIONS.map((d) => d.label) },
      { id: 'words', prompt: 'What words must be on it?', kind: 'long', optional: true, hint: 'The deal, the date, your phone number' },
    ],
  },
  {
    id: 'menu',
    label: 'Menu design',
    blurb: 'A new menu or changes to the one you have',
    noun: 'your menu',
    questions: [
      { id: 'which', prompt: 'Which menus? Pick every one.', kind: 'choice', multi: true, options: ['Dine in', 'Takeout', 'Delivery apps', 'Drinks', 'QR menu'] },
      { id: 'change', prompt: 'New design or an update?', kind: 'choice', options: ['Brand new look', 'Update prices or items', 'Both'] },
      { id: 'items', prompt: 'What is changing?', kind: 'long', optional: true, hint: 'New dishes, new prices, things to remove' },
    ],
  },
  {
    id: 'logo',
    label: 'Logo and brand',
    blurb: 'A new logo, a refresh, or a full brand look',
    noun: 'your logo',
    questions: [
      { id: 'scope', prompt: 'What do you need?', kind: 'choice', options: ['Brand new logo', 'Refresh my logo', 'Full brand kit'] },
      { id: 'feel', prompt: 'What feel fits your place?', kind: 'choice', options: ['Warm and homey', 'Clean and modern', 'Bold and loud', 'Classic and fancy', 'Fun and playful'] },
      { id: 'uses', prompt: 'Where will it be used most?', kind: 'long', optional: true, hint: 'Sign, menus, cups, social, uniforms' },
    ],
  },
  {
    id: 'website',
    label: 'Website',
    blurb: 'A new site, a redesign, or changes to yours',
    noun: 'your website',
    questions: [
      { id: 'scope', prompt: 'What do you need?', kind: 'choice', options: ['Brand new website', 'Redesign my website', 'Small changes', 'Not sure yet'] },
      { id: 'what', prompt: 'What should it do? Pick every job.', kind: 'choice', multi: true, options: ['Show the menu', 'Take orders online', 'Take reservations', 'Tell our story'] },
      { id: 'current', prompt: 'Your current website, if you have one', kind: 'text', optional: true, hint: 'yourplace.com' },
    ],
  },
  {
    id: 'video',
    label: 'Short video',
    blurb: 'Reels and TikToks that show your food moving',
    noun: 'your video',
    questions: [
      { id: 'what', prompt: 'What should the video show?', kind: 'text', hint: 'The cheese pull, the pour, the line out the door' },
      { id: 'filming', prompt: 'How do we get the footage?', kind: 'choice', options: ['Come film at my place', 'Use clips and photos I have', 'Not sure'] },
      { id: 'count', prompt: 'How many videos?', kind: 'choice', options: ['Just 1', '3 to 5', 'A monthly batch'] },
    ],
  },
  {
    id: 'photos',
    label: 'Photo shoot',
    blurb: 'Real photos of your food, your space, your people',
    noun: 'your photos',
    questions: [
      { id: 'what', prompt: 'What should we shoot? Pick everything.', kind: 'choice', multi: true, options: ['Food and dishes', 'The space', 'The team'] },
      { id: 'use', prompt: 'Where will the photos go?', kind: 'choice', multi: true, options: ['Google and Yelp', 'Social media', 'Website', 'Menus'] },
      { id: 'dishes', prompt: 'Any must have shots?', kind: 'long', optional: true, hint: 'The dishes or corners you want covered' },
    ],
  },
  {
    id: 'social',
    label: 'Social posts',
    blurb: 'A batch of ready to post content with captions',
    noun: 'your posts',
    questions: [
      { id: 'platforms', prompt: 'Where do you post? Pick every one.', kind: 'choice', multi: true, options: ['Instagram', 'Facebook', 'TikTok'] },
      { id: 'count', prompt: 'How many posts?', kind: 'choice', options: ['4 a month', '8 a month', '12 or more', 'Not sure'] },
      { id: 'about', prompt: 'What should the posts push?', kind: 'long', optional: true, hint: 'Specials, events, new items, your story' },
    ],
  },
  {
    id: 'email',
    label: 'An email',
    blurb: 'A designed email to send your customers',
    noun: 'your email',
    questions: [
      { id: 'what', prompt: 'What is the email about?', kind: 'text', hint: 'Monthly news, a deal, an event invite' },
      { id: 'list', prompt: 'Do you have a customer list?', kind: 'choice', options: ['Yes', 'A small one', 'Not yet'] },
    ],
  },
  {
    id: 'ads',
    label: 'Ad creative',
    blurb: 'The images and words for paid ads',
    noun: 'your ads',
    questions: [
      { id: 'platform', prompt: 'Where will the ads run?', kind: 'choice', options: ['Facebook and Instagram', 'Google', 'Both', 'Not sure'] },
      { id: 'push', prompt: 'What are you promoting?', kind: 'text', hint: 'A deal, an event, just more customers' },
    ],
  },
  {
    id: 'print',
    label: 'Print and signs',
    blurb: 'Banners, window decals, table tents, cards, signs',
    noun: 'your print work',
    questions: [
      { id: 'what', prompt: 'What do you need made?', kind: 'text', hint: 'A banner, table tents, loyalty cards, a window decal' },
      { id: 'printing', prompt: 'Should we handle the printing too?', kind: 'choice', options: ['Yes, print and deliver', 'Just the design file', 'Not sure'] },
    ],
  },
  {
    id: 'copy',
    label: 'Words and writing',
    blurb: 'Menu descriptions, your story, announcements',
    noun: 'your writing',
    questions: [
      { id: 'what', prompt: 'What needs writing?', kind: 'choice', options: ['Menu descriptions', 'Our story or about page', 'An announcement', 'Something else'] },
      { id: 'about', prompt: 'Tell us the gist', kind: 'long', hint: 'What it is about, in your own words' },
    ],
  },
  {
    id: 'other',
    label: 'Something else',
    blurb: 'Anything marketing you need that is not listed',
    noun: 'your request',
    questions: [
      { id: 'what', prompt: 'Tell us what you need', kind: 'long', hint: 'Plain words are perfect. We will figure it out with you.' },
    ],
  },
]

export const requestTypeById = (id: string): RequestType | null =>
  REQUEST_TYPES.find((t) => t.id === id) ?? null

/** Full question list for a type: its own questions then the shared tail. */
export const questionsFor = (t: RequestType): readonly RequestQuestion[] => [...t.questions, ...SHARED_QUESTIONS]

/** Answer bag: question id -> the owner's answer string. */
export type RequestAnswers = Record<string, string>

const MAX_ANSWER = 2000

/** Server-side gate: same rules the UI enforces, so a hand-rolled POST cannot land garbage. */
export function validateRequestPayload(
  typeId: string,
  answers: unknown
): { ok: true; type: RequestType; clean: RequestAnswers } | { ok: false; problem: string } {
  const type = requestTypeById(typeId)
  if (!type) return { ok: false, problem: `Unknown request type: ${typeId}` }
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    return { ok: false, problem: 'Answers must be an object' }
  }
  const bag = answers as Record<string, unknown>
  const clean: RequestAnswers = {}
  for (const q of questionsFor(type)) {
    const raw = bag[q.id]
    const val = typeof raw === 'string' ? raw.trim() : ''
    if (!val) {
      if (!q.optional) return { ok: false, problem: `Missing answer: ${q.id}` }
      continue
    }
    if (val.length > MAX_ANSWER) return { ok: false, problem: `Answer too long: ${q.id}` }
    if (q.kind === 'choice') {
      const opts = q.options ?? []
      if (q.multi) {
        const picks = splitMulti(val)
        if (picks.length === 0 || picks.some((p) => !opts.includes(p))) {
          return { ok: false, problem: `Not one of the choices: ${q.id}` }
        }
      } else if (!opts.includes(val)) {
        return { ok: false, problem: `Not one of the choices: ${q.id}` }
      }
    }
    clean[q.id] = val
  }
  return { ok: true, type, clean }
}

/** One line for lists: "Short video, come film at my place, this week". */
export function summaryLine(typeId: string, answers: RequestAnswers): string {
  const type = requestTypeById(typeId)
  if (!type) return 'Request'
  const first = type.questions[0] ? answers[type.questions[0].id] : ''
  const when = answers.when
  return [type.label, first, when].filter(Boolean).join(' · ')
}

/** The status vocabulary, in lifecycle order. quoted carries the price note back to the owner. */
export const REQUEST_STATUSES = ['requested', 'in_review', 'quoted', 'in_progress', 'delivered', 'closed', 'declined'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const STATUS_LABEL: Record<RequestStatus, string> = {
  requested: 'Sent',
  in_review: 'Being reviewed',
  quoted: 'Price ready',
  in_progress: 'In the works',
  delivered: 'Delivered',
  closed: 'Done',
  declined: 'Not a fit',
}

/** What the owner should understand at each status, one plain line. */
export const STATUS_OWNER_LINE: Record<RequestStatus, string> = {
  requested: 'We got it. A real person reads every request.',
  in_review: 'The team is reading your request now.',
  quoted: 'Your price and plan are ready. Check your inbox.',
  in_progress: 'The work is underway.',
  delivered: 'Your work is ready to review.',
  closed: 'All wrapped up.',
  declined: 'We could not take this one on. We said why in a note.',
}

/* ── v2: files, real dates, and the bridge (pure, sim-locked) ─────────────────── */

/** A file the owner hands us with the request. url is the stored public URL. */
export interface RequestAttachment {
  url: string
  name: string
  path?: string
}

const MAX_ATTACHMENTS = 10

/** Server-side gate for the attachments array: keeps only well-formed http(s)
 *  entries, trims names, caps the count. Garbage in the array is dropped, not
 *  fatal — a bad extra file must never sink the whole request. */
export function validateAttachments(raw: unknown): RequestAttachment[] {
  if (!Array.isArray(raw)) return []
  const out: RequestAttachment[] = []
  for (const item of raw) {
    if (out.length >= MAX_ATTACHMENTS) break
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    const url = typeof o.url === 'string' ? o.url.trim() : ''
    if (!/^https?:\/\//.test(url) || url.length > 600) continue
    const name = (typeof o.name === 'string' ? o.name.trim() : '').slice(0, 120) || 'file'
    const path = typeof o.path === 'string' ? o.path.slice(0, 300) : undefined
    out.push(path ? { url, name, path } : { url, name })
  }
  return out
}

/** Server-side gate for the owner's picked date: YYYY-MM-DD, not in the past,
 *  within two years. Anything else is null (the request still lands). */
export function validateDueDate(raw: unknown, todayISO: string): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T00:00:00Z`)
  if (isNaN(d.getTime())) return null
  const today = new Date(`${todayISO}T00:00:00Z`)
  const horizon = new Date(today)
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 2)
  if (d < today || d > horizon) return null
  return raw
}

/** Which craft a request maps to when it becomes a work order on accept. */
export function disciplineForRequestType(typeId: string): string {
  if (typeId === 'photos') return 'Photo'
  if (typeId === 'video') return 'Video'
  return 'Design'
}
