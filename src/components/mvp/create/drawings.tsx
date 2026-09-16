/**
 * THE DRAWINGS (owner 2026-09-15, "use those"): one object per thing, not a tiny screen.
 * ==========================================================================================
 * Every card, tile and sheet draws ONE object in one hand: a white body with an ink line, one
 * light panel tone and one accent in the stage colour, standing on the same floor shadow, on a
 * 100×100 grid. No words on any of them. The duotone set the owner picked ("A, redrawn").
 *
 * Colour comes from the stage the object sits on: --c2 (the stage's dark) is the accent,
 * the panel tone mixes it with white. A greyed "now" state is the same drawing desaturated.
 */
import type { ReactNode } from 'react'

export type Scene =
  | 'google' | 'search' | 'directories' | 'apps' | 'chart'
  | 'site' | 'sitemenu' | 'order' | 'reserve' | 'sticky' | 'gift' | 'fix' | 'catering'
  | 'post' | 'story' | 'reel' | 'profile' | 'linkpage' | 'grid' | 'batch' | 'graphic' | 'photos' | 'creator' | 'ad' | 'ticket' | 'event' | 'calendar'
  | 'missed' | 'keyword' | 'dm' | 'waitlist' | 'email' | 'offer' | 'stamps' | 'review' | 'pin'
  | 'print' | 'brand' | 'hours' | 'boost'
  | 'dish' | 'hiring' | 'open' | 'holiday' | 'else'
export type GoogleFocus = 'photos' | 'menu' | 'buttons' | 'qa' | 'products' | 'gpost' | 'reviews' | 'all' | 'none'

export interface DrawSpec { scene: Scene; focus?: GoogleFocus }

/** card id → what to draw. Anything not here falls back by channel (see sceneFor). */
export const DRAW_BY_ID: Record<string, DrawSpec> = {
  gbp: { scene: 'google', focus: 'photos' }, gmenu: { scene: 'sitemenu' }, friction: { scene: 'google', focus: 'buttons' },
  gattrs: { scene: 'google', focus: 'qa' }, gfindus: { scene: 'pin' }, gproducts: { scene: 'google', focus: 'products' },
  gpostbtn: { scene: 'google', focus: 'gpost' }, gpost: { scene: 'google', focus: 'gpost' }, gbpmgmt: { scene: 'google', focus: 'gpost' },
  localseo: { scene: 'search' }, reviewsplan: { scene: 'review' }, reviewsreply: { scene: 'review' }, measure: { scene: 'chart' },
  listings: { scene: 'directories' }, yelpapple: { scene: 'directories' }, appprofiles: { scene: 'apps' }, deliverymenu: { scene: 'apps' },
  website: { scene: 'site' }, 'creative-website': { scene: 'site' }, sitemenu: { scene: 'sitemenu' }, direct: { scene: 'order' },
  sitereserve: { scene: 'reserve' }, sitecall: { scene: 'sticky' }, sitegift: { scene: 'gift' }, giftcard: { scene: 'gift' }, sitefix: { scene: 'fix' },
  catering: { scene: 'catering' }, cateringengine: { scene: 'catering' },
  story: { scene: 'story' }, linksticker: { scene: 'story' }, reel: { scene: 'reel' }, edit: { scene: 'reel' }, 'creative-video': { scene: 'reel' },
  dish: { scene: 'post' }, tapposts: { scene: 'post' }, 'b-weekly': { scene: 'post' },
  graphic: { scene: 'graphic' }, design: { scene: 'graphic' }, 'creative-graphic': { scene: 'graphic' }, 'creative-print': { scene: 'print' }, 'creative-menu': { scene: 'sitemenu' }, 'creative-logo': { scene: 'brand' }, 'creative-copy': { scene: 'graphic' },
  'creative-photos': { scene: 'photos' }, shoot: { scene: 'photos' },
  'creative-social': { scene: 'batch' }, socialmgmt: { scene: 'batch' }, launch: { scene: 'batch' },
  socialprofiles: { scene: 'profile' }, igbuttons: { scene: 'profile' }, 'b-social': { scene: 'profile' }, onelink: { scene: 'linkpage' }, pinned: { scene: 'grid' },
  creator: { scene: 'creator' }, 'creator-monthly': { scene: 'creator' },
  reach: { scene: 'ad' }, callads: { scene: 'ad' }, retarget: { scene: 'ad' }, 'creative-ads': { scene: 'ad' }, firstvisit: { scene: 'ad' },
  ticket: { scene: 'ticket' }, promoevent: { scene: 'event' }, barnights: { scene: 'event' }, seasonplan: { scene: 'calendar' }, trucklocation: { scene: 'pin' },
  missedcall: { scene: 'missed' }, 'b-answer': { scene: 'missed' }, textorder: { scene: 'keyword' }, dmhour: { scene: 'dm' }, waitlist: { scene: 'waitlist' },
  emaildeliver: { scene: 'email' }, earlyaccess: { scene: 'email' }, welcome: { scene: 'email' }, news: { scene: 'email' }, 'creative-email': { scene: 'email' },
  slowoffer: { scene: 'offer' }, winback: { scene: 'offer' }, birthday: { scene: 'offer' }, regulars: { scene: 'offer' }, nights: { scene: 'offer' },
  loyalty: { scene: 'stamps' },
  'b-google': { scene: 'google', focus: 'all' }, 'b-site': { scene: 'site' }, 'b-everywhere': { scene: 'directories' },
}

/** The scene for a card not in the table, from the channels it goes out on. */
export function sceneFor(id: string, channels: string[]): DrawSpec {
  const hit = DRAW_BY_ID[id]
  if (hit) return hit
  const ch = channels.join(' ').toLowerCase()
  if (/^google/.test(ch)) return { scene: 'google', focus: 'all' }
  if (/^your site/.test(ch)) return { scene: 'site' }
  if (/instagram|tiktok|facebook|social|print|photo|everywhere|anything/.test(ch)) return { scene: 'post' }
  if (/email|text/.test(ch)) return { scene: 'email' }
  if (/google|yelp|apple|bing|maps|doordash|uber|grubhub/.test(ch)) return { scene: 'google', focus: 'all' }
  return { scene: 'post' }
}

export interface DrawProps {
  spec: DrawSpec
  /** kept for callers; the drawings carry no words */
  name: string
  rating: string
  /** the "now" state for a before/after: the same object, greyed */
  now?: boolean
  t: (s: string) => string
}

/* the objects, one per scene, as static markup on a 100×100 grid (trusted, hand-drawn) */
const OBJECTS: Record<Scene, string> = {
  dish: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><ellipse class="f1 ln" cx="50" cy="58" rx="34" ry="14"/><ellipse class="f2 ln" cx="50" cy="58" rx="20" ry="8"/><circle class="f3 ln" cx="50" cy="56" r="6"/><path class="ln nf" d="M40 22c0 4-4 4-4 8s4 4 4 8M50 18c0 4-4 4-4 8s4 4 4 8M60 22c0 4-4 4-4 8s4 4 4 8"/>`,
  hiring: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><circle class="f1 ln" cx="50" cy="36" r="14"/><path class="f1 ln" d="M24 78a26 26 0 0 1 52 0z"/><path class="f3 ln" d="M38 62l12 16 12-16"/><circle class="f3 ln" cx="70" cy="28" r="9"/><path class="f1w2" d="M66 28h8M70 24v8"/>`,
  open: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="18" y="46" width="64" height="34" rx="4"/><rect class="f2 ln" x="42" y="60" width="16" height="20" rx="3"/><path class="f3 ln" d="M14 46l6-10h60l6 10z"/><path class="f1 ln" d="M14 46a5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 4.5 0v-2H14z"/><circle class="f3 ln" cx="50" cy="20" r="9"/><path class="ln nf" d="M50 4v4M50 32v4M34 20h4M62 20h4M39 9l3 3M58 28l3 3M61 9l-3 3M42 28l-3 3"/>`,
  holiday: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="18" y="24" width="64" height="54" rx="8"/><path class="f3 ln" d="M18 32a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H18z"/><rect class="f1 ln" x="30" y="18" width="5" height="12" rx="2.5"/><rect class="f1 ln" x="65" y="18" width="5" height="12" rx="2.5"/><polygon class="f3 ln" points="50.0,46.0 53.2,53.6 61.4,54.3 55.1,59.7 57.1,67.7 50.0,63.4 42.9,67.7 44.9,59.7 38.6,54.3 46.8,53.6"/>`,
  else: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M18 22h64a8 8 0 0 1 8 8v30a8 8 0 0 1-8 8H40l-12 10V68H18a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z"/><circle class="f3 ln" cx="50" cy="45" r="11"/><path class="f1w2" d="M50 39v12M44 45h12"/>`,
  boost: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="30" y="12" width="40" height="66" rx="9"/><rect class="f2" x="36" y="21" width="28" height="30" rx="5"/><circle class="f3 ln" cx="50" cy="36" r="8"/><circle class="f1" cx="50" cy="36" r="3"/><rect class="f2" x="36" y="57" width="18" height="4" rx="2"/><rect class="f2" x="36" y="65" width="12" height="4" rx="2"/><circle class="f3 ln" cx="72" cy="20" r="9"/><path class="f1w2" d="M72 25v-9M68 20l4-4 4 4"/>`,
  post: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="30" y="12" width="40" height="66" rx="9"/><rect class="f2" x="36" y="21" width="28" height="30" rx="5"/><circle class="f3 ln" cx="50" cy="36" r="8"/><circle class="f1" cx="50" cy="36" r="3"/><rect class="f2" x="36" y="57" width="18" height="4" rx="2"/><rect class="f2" x="36" y="65" width="12" height="4" rx="2"/><circle class="f3 ln" cx="72" cy="20" r="8"/><path class="f1w" d="M72 24.5l-4.2-4.1a2.3 2.3 0 0 1 3.3-3.3l.9.9.9-.9a2.3 2.3 0 0 1 3.3 3.3z"/>`,
  reel: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="30" y="12" width="40" height="66" rx="9"/><rect class="f3" x="35" y="19" width="30" height="52" rx="5"/><path class="f1" d="M46 37l12 8-12 8z"/><circle class="f1" cx="60" cy="59" r="2.2"/><circle class="f1" cx="60" cy="51" r="2.2"/><circle class="f1" cx="60" cy="43" r="2.2"/>`,
  story: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="30" y="12" width="40" height="66" rx="9"/><rect class="f2" x="35" y="19" width="30" height="52" rx="5"/><rect class="f3" x="37" y="22" width="12" height="2.5" rx="1.25"/><rect class="f1" x="51" y="22" width="12" height="2.5" rx="1.25"/><rect class="f3 ln" x="38" y="46" width="24" height="12" rx="4" transform="rotate(-6 50 52)"/>`,
  sticky: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="30" y="12" width="40" height="66" rx="9"/><rect class="f2" x="36" y="21" width="28" height="34" rx="5"/><rect class="f3 ln" x="34" y="60" width="32" height="11" rx="5.5"/><circle class="f1" cx="42" cy="65.5" r="2.4"/><circle class="f1" cx="50" cy="65.5" r="2.4"/><circle class="f1" cx="58" cy="65.5" r="2.4"/>`,
  linkpage: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="30" y="12" width="40" height="66" rx="9"/><circle class="f3 ln" cx="50" cy="26" r="7"/><rect class="f2 ln" x="37" y="39" width="26" height="7" rx="3.5"/><rect class="f2 ln" x="37" y="50" width="26" height="7" rx="3.5"/><rect class="f2 ln" x="37" y="61" width="26" height="7" rx="3.5"/>`,
  photos: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f2 ln" x="38" y="24" width="24" height="10" rx="3"/><rect class="f1 ln" x="18" y="32" width="64" height="42" rx="9"/><circle class="f3 ln" cx="50" cy="53" r="13"/><circle class="f1 ln" cx="50" cy="53" r="6"/><circle class="f3" cx="74" cy="42" r="2.8"/>`,
  google: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="18" y="46" width="64" height="34" rx="4"/><rect class="f2 ln" x="42" y="60" width="16" height="20" rx="3"/><rect class="f2 ln" x="25" y="54" width="11" height="9" rx="2"/><rect class="f2 ln" x="64" y="54" width="11" height="9" rx="2"/><path class="f3 ln" d="M14 46l6-10h60l6 10z"/><path class="f1 ln" d="M14 46a5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 10 0 5 5 0 0 0 4.5 0v-2H14z"/><path class="f3 ln" d="M50 8c-7 0-12 5-12 12 0 9 12 20 12 20s12-11 12-20c0-7-5-12-12-12z"/><circle class="f1" cx="50" cy="20" r="4.5"/>`,
  review: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M18 22h64a8 8 0 0 1 8 8v30a8 8 0 0 1-8 8H40l-12 10V68H18a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z"/><g class="f3 ln"><polygon points="24.0,38.0 25.9,42.5 30.7,42.8 27.0,46.0 28.1,50.7 24.0,48.1 19.9,50.7 21.0,46.0 17.3,42.8 22.1,42.5"/><polygon points="37.0,38.0 38.9,42.5 43.7,42.8 40.0,46.0 41.1,50.7 37.0,48.1 32.9,50.7 34.0,46.0 30.3,42.8 35.1,42.5"/><polygon points="50.0,38.0 51.9,42.5 56.7,42.8 53.0,46.0 54.1,50.7 50.0,48.1 45.9,50.7 47.0,46.0 43.3,42.8 48.1,42.5"/><polygon points="63.0,38.0 64.9,42.5 69.7,42.8 66.0,46.0 67.1,50.7 63.0,48.1 58.9,50.7 60.0,46.0 56.3,42.8 61.1,42.5"/><polygon points="76.0,38.0 77.9,42.5 82.7,42.8 79.0,46.0 80.1,50.7 76.0,48.1 71.9,50.7 73.0,46.0 69.3,42.8 74.1,42.5"/></g>`,
  event: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M12 34a6 6 0 0 1 6-6h64a6 6 0 0 1 6 6v9a7 7 0 0 0 0 14v9a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6v-9a7 7 0 0 0 0-14z"/><path class="ln dash" d="M62 30v40"/><polygon class="f3 ln" points="36.0,39.0 38.9,46.0 46.5,46.6 40.7,51.5 42.5,58.9 36.0,55.0 29.5,58.9 31.3,51.5 25.5,46.6 33.1,46.0"/><rect class="f2 ln" x="69" y="43" width="12" height="5" rx="2.5"/><rect class="f2 ln" x="69" y="53" width="12" height="5" rx="2.5"/>`,
  ticket: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M12 34a6 6 0 0 1 6-6h64a6 6 0 0 1 6 6v9a7 7 0 0 0 0 14v9a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6v-9a7 7 0 0 0 0-14z"/><path class="ln dash" d="M62 30v40"/><polygon class="f3 ln" points="36.0,39.0 38.9,46.0 46.5,46.6 40.7,51.5 42.5,58.9 36.0,55.0 29.5,58.9 31.3,51.5 25.5,46.6 33.1,46.0"/><rect class="f2 ln" x="69" y="43" width="12" height="5" rx="2.5"/><rect class="f2 ln" x="69" y="53" width="12" height="5" rx="2.5"/>`,
  offer: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M32 22h42a6 6 0 0 1 6 6v44a6 6 0 0 1-6 6H32L14 50z"/><circle class="f3 ln" cx="28" cy="50" r="5"/><circle class="f1" cx="28" cy="50" r="1.8"/><rect class="f3 ln" x="46" y="42" width="24" height="16" rx="8"/><circle class="f1" cx="53" cy="50" r="2.5"/><circle class="f1" cx="63" cy="50" r="2.5"/><path class="f1w" d="M59 45l-6 10"/>`,
  email: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="12" y="24" width="76" height="52" rx="8"/><path class="ln nf" d="M14 32l36 26 36-26"/><path class="ln nf" d="M14 70l26-20M86 70L60 50"/><circle class="f3 ln" cx="50" cy="56" r="7"/><circle class="f1" cx="50" cy="56" r="2.5"/>`,
  print: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f2 ln" d="M62 20l22-6v56l-22 6z"/><rect class="f1 ln" x="20" y="14" width="42" height="62" rx="4"/><rect class="f3 ln" x="28" y="22" width="16" height="9" rx="2.5"/><rect class="f2" x="28" y="38" width="26" height="4" rx="2"/><rect class="f2" x="28" y="46" width="20" height="4" rx="2"/><rect class="f2" x="28" y="54" width="24" height="4" rx="2"/>`,
  brand: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><circle class="f1 ln" cx="50" cy="44" r="30"/><circle class="f3 ln" cx="50" cy="44" r="18"/><polygon class="f1" points="50.0,34.0 52.6,40.4 59.5,40.9 54.3,45.4 55.9,52.1 50.0,48.5 44.1,52.1 45.7,45.4 40.5,40.9 47.4,40.4"/><rect class="f2 ln" x="22" y="80" width="14" height="10" rx="3"/><rect class="f3 ln" x="43" y="80" width="14" height="10" rx="3"/><rect class="f1 ln" x="64" y="80" width="14" height="10" rx="3"/>`,
  site: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="10" y="16" width="80" height="62" rx="8"/><path class="f2 ln" d="M10 24a8 8 0 0 1 8-8h64a8 8 0 0 1 8 8v6H10z"/><circle class="f3" cx="20" cy="23" r="2.5"/><circle class="f3" cx="29" cy="23" r="2.5"/><circle class="f3" cx="38" cy="23" r="2.5"/><circle class="f3 ln" cx="33" cy="54" r="12"/><circle class="f1 ln" cx="33" cy="54" r="5"/><rect class="f2" x="54" y="44" width="26" height="5" rx="2.5"/><rect class="f2" x="54" y="54" width="20" height="5" rx="2.5"/><rect class="f3" x="54" y="64" width="16" height="5" rx="2.5"/>`,
  ad: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M18 42h12l32-18v52L30 58H18a6 6 0 0 1-6-6v-4a6 6 0 0 1 6-6z"/><path class="f2 ln" d="M30 58l4 18h10l-2-18"/><path class="ln nf thick" d="M72 38c6 4 6 20 0 24"/><path class="ln nf thick f3s" d="M80 30c10 6 10 34 0 40"/>`,
  search: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><circle class="f1 ln" cx="44" cy="42" r="22"/><circle class="f2" cx="44" cy="42" r="13"/><path class="f3 ln" d="M44 26c-5 0-9 4-9 9 0 7 9 15 9 15s9-8 9-15c0-5-4-9-9-9z"/><circle class="f1" cx="44" cy="35" r="3"/><path class="f3 ln" d="M62 56l4-4 18 18-4 4z"/>`,
  directories: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f2 ln" x="22" y="26" width="52" height="40" rx="6" transform="rotate(-8 48 46)"/><rect class="f1 ln" x="26" y="34" width="52" height="40" rx="6"/><circle class="f3 ln" cx="38" cy="48" r="6"/><rect class="f2" x="48" y="43" width="22" height="4" rx="2"/><rect class="f2" x="48" y="51" width="16" height="4" rx="2"/><rect class="f3" x="34" y="62" width="14" height="4" rx="2"/>`,
  apps: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M22 38h56l-4 40H26z"/><path class="ln nf" d="M36 38v-6a14 14 0 0 1 28 0v6"/><rect class="f3 ln" x="38" y="50" width="24" height="12" rx="4"/><circle class="f1" cx="46" cy="56" r="2.2"/><circle class="f1" cx="54" cy="56" r="2.2"/>`,
  chart: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="ln nf" d="M16 76h68"/><rect class="f2 ln" x="22" y="52" width="14" height="24" rx="3"/><rect class="f2 ln" x="43" y="40" width="14" height="36" rx="3"/><rect class="f3 ln" x="64" y="24" width="14" height="52" rx="3"/>`,
  sitemenu: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="24" y="16" width="52" height="62" rx="6"/><rect class="f3 ln" x="24" y="16" width="52" height="12" rx="6"/><rect class="f2" x="32" y="36" width="22" height="4" rx="2"/><circle class="f3" cx="66" cy="38" r="3"/><rect class="f2" x="32" y="48" width="26" height="4" rx="2"/><circle class="f3" cx="66" cy="50" r="3"/><rect class="f2" x="32" y="60" width="18" height="4" rx="2"/><circle class="f3" cx="66" cy="62" r="3"/>`,
  order: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M22 38h56l-4 40H26z"/><path class="ln nf" d="M36 38v-6a14 14 0 0 1 28 0v6"/><circle class="f3 ln" cx="50" cy="58" r="10"/><path class="f1w2" d="M45 58l4 4 7-8"/>`,
  reserve: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="18" y="24" width="64" height="54" rx="8"/><path class="f3 ln" d="M18 32a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H18z"/><rect class="f1 ln" x="30" y="18" width="5" height="12" rx="2.5"/><rect class="f1 ln" x="65" y="18" width="5" height="12" rx="2.5"/><g class="f2"><circle cx="30" cy="52" r="3.5"/><circle cx="43" cy="52" r="3.5"/><circle cx="57" cy="52" r="3.5"/><circle cx="70" cy="52" r="3.5"/><circle cx="30" cy="65" r="3.5"/><circle cx="43" cy="65" r="3.5"/><circle cx="70" cy="65" r="3.5"/></g><circle class="f3 ln" cx="57" cy="65" r="5"/>`,
  calendar: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="18" y="24" width="64" height="54" rx="8"/><path class="f3 ln" d="M18 32a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H18z"/><rect class="f1 ln" x="30" y="18" width="5" height="12" rx="2.5"/><rect class="f1 ln" x="65" y="18" width="5" height="12" rx="2.5"/><g class="f2"><circle cx="30" cy="52" r="3.5"/><circle cx="57" cy="52" r="3.5"/><circle cx="70" cy="52" r="3.5"/><circle cx="30" cy="65" r="3.5"/><circle cx="43" cy="65" r="3.5"/><circle cx="57" cy="65" r="3.5"/></g><circle class="f3" cx="43" cy="52" r="4"/><circle class="f3" cx="70" cy="65" r="4"/>`,
  gift: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="16" y="30" width="68" height="46" rx="8"/><rect class="f3" x="46" y="30" width="8" height="46"/><rect class="f3" x="16" y="49" width="68" height="8"/><path class="f1 ln" d="M50 30c-6-8-14-8-14-2s8 4 14 2zM50 30c6-8 14-8 14-2s-8 4-14 2z"/>`,
  fix: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M62 18a14 14 0 0 0-16 18L20 62a6 6 0 0 0 8 8l26-26a14 14 0 0 0 18-16l-8 8-8-2-2-8z"/><circle class="f3" cx="27" cy="63" r="3"/>`,
  catering: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><ellipse class="f2 ln" cx="50" cy="68" rx="36" ry="6"/><path class="f1 ln" d="M22 64a28 28 0 0 1 56 0z"/><circle class="f3 ln" cx="50" cy="34" r="4"/>`,
  profile: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="16" y="18" width="68" height="60" rx="8"/><circle class="f3 ln" cx="34" cy="38" r="9"/><rect class="f2" x="50" y="32" width="24" height="4" rx="2"/><rect class="f2" x="50" y="40" width="16" height="4" rx="2"/><rect class="f2 ln" x="24" y="56" width="16" height="8" rx="4"/><rect class="f2 ln" x="43" y="56" width="16" height="8" rx="4"/><rect class="f3 ln" x="62" y="56" width="14" height="8" rx="4"/>`,
  grid: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><g class="f2 ln"><rect x="18" y="16" width="18" height="18" rx="3"/><rect x="41" y="16" width="18" height="18" rx="3"/><rect x="18" y="39" width="18" height="18" rx="3"/><rect x="41" y="39" width="18" height="18" rx="3"/><rect x="64" y="39" width="18" height="18" rx="3"/><rect x="18" y="62" width="18" height="18" rx="3"/><rect x="41" y="62" width="18" height="18" rx="3"/><rect x="64" y="62" width="18" height="18" rx="3"/></g><rect class="f3 ln" x="64" y="16" width="18" height="18" rx="3"/>`,
  batch: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f2 ln" x="30" y="14" width="40" height="50" rx="6"/><rect class="f2 ln" x="25" y="20" width="40" height="50" rx="6"/><rect class="f1 ln" x="20" y="26" width="40" height="50" rx="6"/><rect class="f2" x="26" y="32" width="28" height="22" rx="4"/><circle class="f3 ln" cx="40" cy="43" r="6"/><rect class="f2" x="26" y="60" width="18" height="4" rx="2"/>`,
  graphic: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="14" y="18" width="72" height="56" rx="8"/><circle class="f3 ln" cx="36" cy="42" r="10"/><path class="f2 ln" d="M50 56l12-20 12 20z"/><rect class="f2" x="22" y="60" width="30" height="4" rx="2"/><rect class="f3" x="70" y="60" width="8" height="4" rx="2"/>`,
  creator: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><circle class="f1 ln" cx="50" cy="36" r="14"/><path class="f1 ln" d="M24 78a26 26 0 0 1 52 0z"/><circle class="f3 ln" cx="68" cy="26" r="9"/><polygon class="f1" points="68.0,21.0 69.3,24.2 72.8,24.5 70.1,26.7 70.9,30.0 68.0,28.2 65.1,30.0 65.9,26.7 63.2,24.5 66.7,24.2"/>`,
  missed: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M28 20c-6 0-8 4-8 8 0 26 26 52 52 52 4 0 8-2 8-8v-6l-14-6-6 8c-8-3-16-11-19-19l8-6-6-14z"/><path class="ln nf thick f3s" d="M60 22h16v16M76 22L58 40"/>`,
  keyword: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f1 ln" d="M18 22h64a8 8 0 0 1 8 8v30a8 8 0 0 1-8 8H40l-12 10V68H18a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z"/><g class="f3"><rect x="40" y="34" width="4" height="24" rx="2"/><rect x="54" y="34" width="4" height="24" rx="2"/><rect x="35" y="40" width="28" height="4" rx="2"/><rect x="35" y="49" width="28" height="4" rx="2"/></g>`,
  dm: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><path class="f2 ln" d="M14 18h40a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8H30l-10 8v-8h-6a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z"/><path class="f3 ln" d="M46 44h40a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8h-6v8l-10-8H46a8 8 0 0 1-8-8V52a8 8 0 0 1 8-8z"/><circle class="f1" cx="58" cy="60" r="2.5"/><circle class="f1" cx="66" cy="60" r="2.5"/><circle class="f1" cx="74" cy="60" r="2.5"/>`,
  waitlist: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="22" y="18" width="56" height="62" rx="6"/><rect class="f2 ln" x="38" y="12" width="24" height="10" rx="4"/><circle class="f3 ln" cx="34" cy="40" r="4"/><rect class="f2" x="44" y="38" width="24" height="4" rx="2"/><circle class="f2 ln" cx="34" cy="54" r="4"/><rect class="f2" x="44" y="52" width="20" height="4" rx="2"/><circle class="f2 ln" cx="34" cy="68" r="4"/><rect class="f2" x="44" y="66" width="22" height="4" rx="2"/>`,
  stamps: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><rect class="f1 ln" x="14" y="26" width="72" height="48" rx="8"/><g class="f3 ln"><circle cx="27" cy="42" r="5"/><circle cx="42" cy="42" r="5"/><circle cx="57" cy="42" r="5"/><circle cx="72" cy="42" r="5"/><circle cx="27" cy="59" r="5"/></g><g class="f2 ln"><circle cx="42" cy="59" r="5"/><circle cx="57" cy="59" r="5"/><circle cx="72" cy="59" r="5"/></g>`,
  pin: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><ellipse class="f2 ln" cx="50" cy="74" rx="28" ry="8"/><path class="f3 ln" d="M50 12c-12 0-20 8-20 20 0 15 20 36 20 36s20-21 20-36c0-12-8-20-20-20z"/><circle class="f1 ln" cx="50" cy="32" r="8"/>`,
  hours: `<ellipse class="sh" cx="50" cy="87" rx="30" ry="4"/><circle class="f1 ln" cx="50" cy="46" r="32"/><g class="f2"><circle cx="50" cy="20" r="2.5"/><circle cx="76" cy="46" r="2.5"/><circle cx="50" cy="72" r="2.5"/><circle cx="24" cy="46" r="2.5"/></g><path class="ln nf thick" d="M50 46V28"/><path class="ln nf thick f3s" d="M50 46l14 10"/><circle class="f3 ln" cx="50" cy="46" r="3.5"/>`,
}

export function Drawing({ spec, now = false }: DrawProps): ReactNode {
  const body = OBJECTS[spec.scene] ?? OBJECTS.post
  return <svg className={`dw ob ${spec.scene}${now ? ' now' : ''}`} viewBox="0 0 100 100" role="img" aria-hidden dangerouslySetInnerHTML={{ __html: body }} />
}

export const DRAW_CSS = `
.cr .dw.ob{display:block;width:100%;height:auto;overflow:visible;--ob-l:color-mix(in srgb, var(--c2, #2e9a78) 28%, #fff)}
.cr .dw.ob .f1{fill:#fff}.cr .dw.ob .f2{fill:var(--ob-l)}.cr .dw.ob .f3{fill:var(--c2, #2e9a78)}
.cr .dw.ob .f1w{fill:#fff;stroke:none}.cr .dw.ob .f1w2{fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.cr .dw.ob .sh{fill:rgba(29,29,31,.10)}
.cr .dw.ob .ln{stroke:#1d1d1f;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.cr .dw.ob .nf{fill:none}.cr .dw.ob .dash{stroke-dasharray:4 4;fill:none}.cr .dw.ob .thick{stroke-width:3}.cr .dw.ob .f3s{stroke:var(--c2, #2e9a78)}
.cr .dw.ob.now{filter:grayscale(1);opacity:.55}
`
