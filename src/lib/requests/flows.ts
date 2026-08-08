/**
 * CREATIVE FLOWS — the per-creative Drafting Table specs (owner law: every creative
 * gets the graphic builder's treatment, customized to itself; never a generic form).
 *
 * Each type gets its own numbered steps in the design flow's grammar: tickets and
 * chips sized to the thing, a real calendar for the date, the live board riding on
 * top, a spoken-sentence review, the $0 receipt, and the hold-to-send seal.
 *
 * Every control writes into the request catalog's OWN question ids, and choice
 * options are derived from the catalog so the spec can never drift from what the
 * server validates (sim-locked). The graphic is NOT here: it has the original
 * design-order-flow, which is the model these follow.
 */

import type { CSSProperties } from 'react'
import { REQUEST_TYPES, requestTypeById, type RequestAnswers, type RequestTypeId } from '@/lib/requests/catalog'

/** Options straight from the catalog question, so flow and validation stay one thing. */
const opts = (typeId: RequestTypeId, qid: string): readonly string[] => {
  const t = requestTypeById(typeId)
  return t?.questions.find((q) => q.id === qid)?.options ?? []
}

export interface TicketOption {
  value: string
  sub?: string
  /** small frame drawn on the ticket (menu shapes) */
  frame?: 'sheet' | 'trifold' | 'phone' | 'tall' | 'qr'
  /** the option label rendered in its own voice (logo feels) */
  style?: CSSProperties
}

export type FlowControl =
  | { kind: 'textarea'; qid: string; hint?: string; chips?: readonly string[] }
  | { kind: 'input'; qid: string; hint?: string; chips?: readonly string[] }
  | { kind: 'tickets'; qid: string; options: readonly TicketOption[]; multi?: boolean }
  | { kind: 'calendar' }

export interface FlowStep {
  title: string
  sub?: string
  controls: readonly FlowControl[]
  /** qids that must be answered before Next (calendar steps gate on the date) */
  requires: readonly string[]
}

export interface CreativeFlow {
  typeId: RequestTypeId
  steps: readonly FlowStep[]
  /** the spoken review sentence, built from the same answers the server receives */
  sentence: (a: RequestAnswers, dueLabel: string | null) => string
}

const withSubs = (typeId: RequestTypeId, qid: string, subs: Record<string, string> = {}, extra: Record<string, Partial<TicketOption>> = {}): TicketOption[] =>
  opts(typeId, qid).map((value) => ({ value, sub: subs[value], ...extra[value] }))

const dateStep = (sub: string): FlowStep => ({
  title: 'When do you need it?',
  sub,
  controls: [{ kind: 'calendar' }],
  requires: ['when'],
})

const list = (v: string | undefined) => (v ?? '').split(', ').filter(Boolean)
const andJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/* Logo feels, spoken in their own voice on the tickets themselves. */
const FEEL_STYLES: Record<string, CSSProperties> = {
  'Warm and homey': { fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#8a5a2c', fontWeight: 600 },
  'Clean and modern': { fontWeight: 300, letterSpacing: '0.3em', textTransform: 'uppercase' },
  'Bold and loud': { fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em' },
  'Classic and fancy': { fontFamily: 'Georgia, serif', fontWeight: 600, textDecoration: 'underline overline' },
  'Fun and playful': { fontWeight: 700, transform: 'rotate(-2deg)', display: 'inline-block' },
}

export const CREATIVE_FLOWS: readonly CreativeFlow[] = [
  {
    typeId: 'menu',
    steps: [
      {
        title: 'Which menus?',
        sub: 'Pick every one. Each becomes its own piece.',
        controls: [{
          kind: 'tickets', qid: 'which', multi: true,
          options: withSubs('menu', 'which',
            { 'Dine in': 'The menu in their hands at the table', Takeout: 'The one-sheet by the register', 'Delivery apps': 'How you look on DoorDash and Uber Eats', Drinks: 'Cocktails, coffee, and pours', 'QR menu': 'Scan at the table, reads on a phone' },
            { 'Dine in': { frame: 'trifold' }, Takeout: { frame: 'sheet' }, 'Delivery apps': { frame: 'phone' }, Drinks: { frame: 'tall' }, 'QR menu': { frame: 'qr' } }),
        }],
        requires: ['which'],
      },
      {
        title: 'New look or an update?',
        controls: [
          { kind: 'tickets', qid: 'change', options: withSubs('menu', 'change', { 'Brand new look': 'We redesign it from the paper up', 'Update prices or items': 'Same look, new numbers and dishes', Both: 'New look and new items together' }) },
          { kind: 'textarea', qid: 'items', hint: 'New dishes, new prices, things to remove' },
        ],
        requires: ['change'],
      },
      dateStep('Menus print and laminate. Give us a real date.'),
    ],
    sentence: (a, due) =>
      `${andJoin(list(a.which))} menu${list(a.which).length > 1 ? 's' : ''}, ${(a.change ?? '').toLowerCase() || 'updated'}${a.items ? `, changing: ${a.items}` : ''}${due ? `, in hand by ${due}` : ''}.`,
  },
  {
    typeId: 'logo',
    steps: [
      {
        title: 'What do you need?',
        controls: [{
          kind: 'tickets', qid: 'scope',
          options: withSubs('logo', 'scope', { 'Brand new logo': 'Starting fresh', 'Refresh my logo': 'Keep the bones, clean it up', 'Full brand kit': 'Logo plus colors, fonts, and cards' }),
        }],
        requires: ['scope'],
      },
      {
        title: 'What feel fits your place?',
        sub: 'Each choice is written in its own voice.',
        controls: [{
          kind: 'tickets', qid: 'feel',
          options: opts('logo', 'feel').map((value) => ({ value, style: FEEL_STYLES[value] })),
        }],
        requires: ['feel'],
      },
      {
        title: 'Where will it be used most?',
        controls: [{ kind: 'input', qid: 'uses', hint: 'Sign, menus, cups, social, uniforms', chips: ['The sign out front', 'Menus', 'Cups and bags', 'Social profiles', 'Uniforms'] }],
        requires: [],
      },
      dateStep('Brand work takes rounds. Pick the day you need it settled.'),
    ],
    sentence: (a, due) =>
      `${(a.scope ?? 'A logo').replace('my logo', 'of your logo')}, ${(a.feel ?? '').toLowerCase() || 'in your voice'}${a.uses ? `, living mostly on ${a.uses.toLowerCase()}` : ''}${due ? `, settled by ${due}` : ''}.`,
  },
  {
    typeId: 'website',
    steps: [
      {
        title: 'What do you need?',
        controls: [{
          kind: 'tickets', qid: 'scope',
          options: withSubs('website', 'scope', { 'Brand new website': 'You have nothing, or nothing worth keeping', 'Redesign my website': 'Keep the address, rebuild the look', 'Small changes': 'Fix what bugs you', 'Not sure yet': 'We will look and tell you what we see' }),
        }],
        requires: ['scope'],
      },
      {
        title: 'What should it do?',
        sub: 'Pick every job. The homepage builds around them.',
        controls: [{
          kind: 'tickets', qid: 'what', multi: true,
          options: withSubs('website', 'what', { 'Show the menu': 'The number one thing people come for', 'Take orders online': 'Pickup and delivery from your own site', 'Take reservations': 'Book a table without calling', 'Tell our story': 'Who you are and why you cook' }),
        }],
        requires: ['what'],
      },
      {
        title: 'Your current website',
        controls: [{ kind: 'input', qid: 'current', hint: 'yourplace.com' }],
        requires: [],
      },
      dateStep('Sites go live on a day. Pick yours.'),
    ],
    sentence: (a, due) =>
      `${a.scope === 'Small changes' ? 'Changes to your website' : (a.scope ?? 'A website')}${list(a.what).length ? ` built to ${andJoin(list(a.what).map((x) => x.toLowerCase()))}` : ''}${a.current ? `, starting from ${a.current}` : ''}${due ? `, live by ${due}` : ''}.`,
  },
  {
    typeId: 'video',
    steps: [
      {
        title: 'What should the video show?',
        controls: [{ kind: 'textarea', qid: 'what', hint: 'The cheese pull, the pour, the line out the door', chips: ['Our best dish, up close', 'The kitchen at full speed', 'The room on a busy night', 'A special we are running'] }],
        requires: ['what'],
      },
      {
        title: 'How do we get the footage?',
        controls: [{
          kind: 'tickets', qid: 'filming',
          options: withSubs('video', 'filming', { 'Come film at my place': 'We shoot it on site, one visit', 'Use clips and photos I have': 'Send what you have, we cut it', 'Not sure': 'We will recommend after reading this' }),
        }],
        requires: ['filming'],
      },
      {
        title: 'How many videos?',
        controls: [{
          kind: 'tickets', qid: 'count',
          options: withSubs('video', 'count', { 'Just 1': 'One strong reel', '3 to 5': 'A batch from one shoot', 'A monthly batch': 'Fresh reels every month' }),
        }],
        requires: ['count'],
      },
      dateStep('Posting for something? Land the reels before it.'),
    ],
    sentence: (a, due) =>
      `${a.count === 'A monthly batch' ? 'A monthly batch of reels' : a.count === '3 to 5' ? '3 to 5 reels' : 'A reel'} showing ${a.what ?? 'your place'}, ${a.filming === 'Come film at my place' ? 'shot at your place' : a.filming === 'Use clips and photos I have' ? 'cut from your clips' : 'footage plan open'}${due ? `, ready by ${due}` : ''}.`,
  },
  {
    typeId: 'photos',
    steps: [
      {
        title: 'What should we shoot?',
        sub: 'Pick everything. One visit covers it.',
        controls: [{
          kind: 'tickets', qid: 'what', multi: true,
          options: withSubs('photos', 'what', { 'Food and dishes': 'Plates styled and lit', 'The space': 'The room, the bar, the patio', 'The team': 'The people behind it' }),
        }],
        requires: ['what'],
      },
      {
        title: 'Where will the photos go?',
        sub: 'Pick every place. We size and pick for each.',
        controls: [
          { kind: 'tickets', qid: 'use', multi: true, options: withSubs('photos', 'use', { 'Google and Yelp': 'The photos strangers judge you by', 'Social media': 'Feed and story sized', Website: 'Hero shots and menu pages', Menus: 'Print quality plates' }) },
          { kind: 'textarea', qid: 'dishes', hint: 'The dishes or corners you want covered' },
        ],
        requires: ['use'],
      },
      dateStep('Shoots book on a real day. Pick when you need the photos IN HAND.'),
    ],
    sentence: (a, due) =>
      `A shoot covering ${andJoin(list(a.what).map((x) => x.toLowerCase())) || 'your place'}, for ${andJoin(list(a.use).map((x) => x.toLowerCase())) || 'everywhere'}${a.dishes ? `, must have: ${a.dishes}` : ''}${due ? `, delivered by ${due}` : ''}.`,
  },
  {
    typeId: 'social',
    steps: [
      {
        title: 'Where do you post?',
        sub: 'Pick every one. Each gets its own sizes.',
        controls: [{
          kind: 'tickets', qid: 'platforms', multi: true,
          options: withSubs('social', 'platforms', { Instagram: 'Feed, stories, and reels', Facebook: 'Where the regulars follow you', TikTok: 'Where the strangers find you' }),
        }],
        requires: ['platforms'],
      },
      {
        title: 'How many posts?',
        controls: [{
          kind: 'tickets', qid: 'count',
          options: withSubs('social', 'count', { '4 a month': 'One a week, steady', '8 a month': 'Twice a week, present', '12 or more': 'Every couple days, loud', 'Not sure': 'We will suggest a pace' }),
        }],
        requires: ['count'],
      },
      {
        title: 'What should the posts push?',
        controls: [{ kind: 'textarea', qid: 'about', hint: 'Specials, events, new items, your story', chips: ['Weekly specials', 'Events and live nights', 'New menu items', 'Behind the scenes'] }],
        requires: [],
      },
      dateStep('Pick the day the first batch should be ready.'),
    ],
    sentence: (a, due) =>
      `${a.count === 'Not sure' || !a.count ? 'A batch of posts' : `${a.count.replace(' a month', '')} posts a month`} for ${andJoin(list(a.platforms)) || 'your platforms'}${a.about ? `, pushing ${a.about.toLowerCase()}` : ''}${due ? `, first batch by ${due}` : ''}.`,
  },
  {
    typeId: 'email',
    steps: [
      {
        title: 'What is the email about?',
        controls: [{ kind: 'input', qid: 'what', hint: 'Monthly news, a deal, an event invite', chips: ['Monthly news', 'A deal for regulars', 'An event invite', 'A new menu drop'] }],
        requires: ['what'],
      },
      {
        title: 'Do you have a customer list?',
        controls: [{
          kind: 'tickets', qid: 'list',
          options: withSubs('email', 'list', { Yes: 'We design for your list', 'A small one': 'We design it and help it grow', 'Not yet': 'We will help you start one' }),
        }],
        requires: ['list'],
      },
      dateStep('Emails send on a day. Pick it and we work backward.'),
    ],
    sentence: (a, due) =>
      `An email about ${a.what ?? 'your news'}, ${a.list === 'Yes' ? 'to your list' : a.list === 'A small one' ? 'to your small but mighty list' : 'while we help you start a list'}${due ? `, sending ${due}` : ''}.`,
  },
  {
    typeId: 'ads',
    steps: [
      {
        title: 'Where will the ads run?',
        controls: [{
          kind: 'tickets', qid: 'platform',
          options: withSubs('ads', 'platform', { 'Facebook and Instagram': 'Feed ads with a photo and a button', Google: 'The ad above the search results', Both: 'Cover the feed and the search', 'Not sure': 'We will recommend from your goal' }),
        }],
        requires: ['platform'],
      },
      {
        title: 'What are you promoting?',
        controls: [{ kind: 'input', qid: 'push', hint: 'A deal, an event, just more customers', chips: ['A weekly deal', 'An event', 'Grand opening', 'Just more customers'] }],
        requires: ['push'],
      },
      dateStep('Ads need lead time to learn. Pick the day they should be running.'),
    ],
    sentence: (a, due) =>
      `Ad creative for ${a.platform === 'Both' ? 'Facebook, Instagram, and Google' : a.platform ?? 'your platforms'}, promoting ${a.push ?? 'your place'}${due ? `, running by ${due}` : ''}.`,
  },
  {
    typeId: 'print',
    steps: [
      {
        title: 'What do you need made?',
        controls: [{ kind: 'input', qid: 'what', hint: 'A banner, table tents, loyalty cards, a window decal', chips: ['A banner', 'Table tents', 'Loyalty cards', 'A window decal', 'Business cards', 'A menu board'] }],
        requires: ['what'],
      },
      {
        title: 'Should we handle the printing too?',
        controls: [{
          kind: 'tickets', qid: 'printing',
          options: withSubs('print', 'printing', { 'Yes, print and deliver': 'We run the job and hand you the box', 'Just the design file': 'Print ready files, your shop prints', 'Not sure': 'We will quote it both ways' }),
        }],
        requires: ['printing'],
      },
      dateStep('Print adds production days. Pick the day it must be IN HAND.'),
    ],
    sentence: (a, due) =>
      `${a.what ?? 'A print piece'}, ${a.printing === 'Yes, print and deliver' ? 'printed and delivered by us' : a.printing === 'Just the design file' ? 'as print ready files' : 'printing quoted both ways'}${due ? `, in hand by ${due}` : ''}.`,
  },
  {
    typeId: 'copy',
    steps: [
      {
        title: 'What needs writing?',
        controls: [{
          kind: 'tickets', qid: 'what',
          options: withSubs('copy', 'what', { 'Menu descriptions': 'Words that sell the dish', 'Our story or about page': 'Who you are, said right', 'An announcement': 'News told plainly and loud', 'Something else': 'Any words you need' }),
        }],
        requires: ['what'],
      },
      {
        title: 'Tell us the gist',
        sub: 'Plain words are perfect. We polish, you approve.',
        controls: [{ kind: 'textarea', qid: 'about', hint: 'What it is about, in your own words' }],
        requires: ['about'],
      },
      dateStep('Words come back fast. Pick your day.'),
    ],
    sentence: (a, due) =>
      `${a.what ?? 'Writing'}, from your gist: ${a.about ? `"${a.about.length > 60 ? `${a.about.slice(0, 60)}...` : a.about}"` : 'to come'}${due ? `, back by ${due}` : ''}.`,
  },
  {
    typeId: 'other',
    steps: [
      {
        title: 'Tell us what you need',
        sub: 'Plain words are perfect. We will figure it out with you.',
        controls: [{ kind: 'textarea', qid: 'what', hint: 'Anything marketing. If we cannot do it, we say so and point you right.' }],
        requires: ['what'],
      },
      dateStep('Even a rough date helps us plan.'),
    ],
    sentence: (a, due) => `${a.what ?? 'Your request'}${due ? `, needed by ${due}` : ''}.`,
  },
]

export const flowFor = (typeId: string): CreativeFlow | null =>
  CREATIVE_FLOWS.find((f) => f.typeId === typeId) ?? null

/** Fold a picked calendar date into the catalog's honest timing buckets. */
export const bucketForDate = (dueISO: string | null, todayISO: string): string => {
  if (!dueISO) return 'No rush'
  const days = Math.round((new Date(dueISO).getTime() - new Date(todayISO).getTime()) / 86400000)
  return days <= 7 ? 'This week' : days <= 14 ? 'In 2 weeks' : days <= 31 ? 'This month' : 'No rush'
}
