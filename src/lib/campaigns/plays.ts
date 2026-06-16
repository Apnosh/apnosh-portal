/**
 * Plays — the owner's altitude. One play per job in the growth loop: an
 * outcome, an expected result, and the bundle of services that achieve it.
 * The line items still live inside; the play is just the level the owner
 * acts at by default.
 */
import type { LineItem } from '@/lib/campaigns/types'

export interface Play {
  key: string
  title: string
  result: string
  why: string
  icon: string
  items: LineItem[]
}

const PLAY_META: Record<string, { title: string; result: string; why: string; icon: string }> = {
  foundation:   { title: 'Get set up',              result: 'The groundwork everything else runs on', why: 'Diners check your Google, site and menu before a first visit.', icon: '🧱' },
  awareness:    { title: 'Get discovered',          result: 'Show up where hungry locals look',       why: 'Most first-timers find you on Google, not social.', icon: '🔎' },
  capture:      { title: 'Get their contact',       result: 'Build a guest list you own',             why: 'A list you own beats renting reach from the platforms.', icon: '📥' },
  convert:      { title: 'Get the first visit',     result: 'Turn interest into a visit',             why: 'One good reason to come in now turns a follower into a guest.', icon: '🍽️' },
  nurture:      { title: 'Win the 2nd visit',       result: 'Bring first-timers back before they forget you', why: 'The first→second visit is the steepest drop-off to fix.', icon: '💛' },
  retain:       { title: 'Make them regulars',      result: 'Build the habit and protect your rating', why: 'Members visit ~20% more — repeat visits are where the money is.', icon: '🔁' },
  winback:      { title: 'Win back the quiet ones', result: 'Recover guests who’ve gone quiet',        why: 'Winning back a lapsed guest is cheaper than finding a new one.', icon: '🔙' },
  advocate:     { title: 'Turn regulars into fans', result: 'Reviews & referrals that bring new guests', why: 'Each star of rating is worth ~5–9% of revenue (Luca, HBS).', icon: '🗣️' },
  anticipation: { title: 'Plan ahead',              result: 'Seasons, events & gift cards',           why: 'Nov–Dec is half the year’s gift-card sales.', icon: '✨' },
}

const ORDER = ['foundation', 'awareness', 'capture', 'convert', 'nurture', 'retain', 'winback', 'advocate', 'anticipation']

export function playsFrom(items: LineItem[]): Play[] {
  const map = new Map<string, LineItem[]>()
  items.forEach(it => { const k = it.stage; (map.get(k) ?? map.set(k, []).get(k)!).push(it) })
  return ORDER.filter(k => map.has(k)).map(k => ({ key: k, ...(PLAY_META[k] ?? { title: k, result: '', why: '', icon: '•' }), items: map.get(k)! }))
}
