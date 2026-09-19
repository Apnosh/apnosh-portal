/**
 * THE PICKER (owner 2026-09-18): pre-add the right items for an announcement from what the
 * owner said and what we know, each with one line of why. Rules first, so a full plan comes
 * back instantly and without an AI key; AI only reads free text and polishes the why lines.
 *
 * Two laws. Free items pre-add freely. Paid items pre-add only inside the budget on file;
 * with no budget, the free items plus the one paid item that matters most, and the screen
 * asks for a number.
 */
export type ItemId = 'post' | 'graphic' | 'video' | 'photos' | 'boost' | 'creator' | 'print' | 'apps' | 'taste' | 'review' | 'sign' | 'offer'
export interface ItemPick { id: ItemId; uid: string; on: boolean; why: string; options: Record<string, unknown>; cents: number }
/** things you can add more than once, each with its own options */
export const MULTI: ItemId[] = ['graphic', 'video', 'print', 'creator']
export const newUid = (id: ItemId) => `${id}-${Math.random().toString(36).slice(2, 8)}`
export interface SuggestInput {
  kind: string
  facts: { price?: string | null; hasMedia: boolean; hasVideo: boolean; limited?: boolean; date?: string | null; what?: string | null; source?: 'mine' | 'licensed' | 'shoot' | 'none'; look?: string | null }
  /* the restaurant's shape: how many doors, what kind of place, what they said they want */
  profile?: { locations: number; footprint: string | null; concept: string | null; goal: string | null; canFilm: boolean | null }
  connected: { instagram: boolean; facebook: boolean; google: boolean; website: boolean; ordering: boolean; apps: boolean }
  usualReach: number | null
  budgetCents: number | null
  creator: { slug: string; name: string; fromCents: number | null; nearby: number | null; date?: string | null; tierName?: string | null } | null
  last: { boostCents?: number | null; followers?: number | null; text?: string | null } | null
  prices: { graphic: number; video: number; shoot: number; print: number }
}
const PAID_ORDER: ItemId[] = ['creator', 'photos', 'video', 'graphic', 'print', 'boost'] // dropped first when over budget

export function suggestItems(i: SuggestInput): ItemPick[] {
  const k = i.kind
  const first = i.creator?.name.split(' ')[0] ?? ''
  const isDeal = k === 'deal', isEvent = k === 'event', isDish = k === 'dish', isOpen = k === 'open', isHours = k === 'hours' || k === 'holiday'
  /* SHAPE (owner 2026-09-18): a chain promotes differently from a corner spot. Many doors means
     brand-led, paid reach, print at every location, no single creator visit; one door means a
     creator, a taste at the counter, the neighbourhood. */
  const locs = i.profile?.locations ?? 1
  const fp = i.profile?.footprint ?? null
  const chain = locs >= 6 || fp === 'enterprise' || fp === 'multi_regional'
  const multi = !chain && (locs >= 2 || fp === 'multi_local')
  const src = i.facts.source ?? (i.facts.hasMedia ? 'mine' : 'none')
  const b1 = (isDeal || isEvent || isOpen ? 4000 : 2000) * (chain ? 5 : multi ? 2 : 1)
  const out: ItemPick[] = []
  const add = (id: ItemId, on: boolean, why: string, options: Record<string, unknown>, cents: number) => out.push({ id, uid: id, on, why, options, cents })

  add('post', true, i.facts.hasMedia ? `Your ${i.facts.hasVideo ? 'video' : 'photo'} on your channels, a Story, the team told. Free` : 'Your channels, a Story, the team told. Free', { story: true }, 0)
  /* the graphic: when there is no photo, or when dates belong on the picture */
  const gOn = src !== 'mine' || isDeal || isEvent || isOpen || chain
  add('graphic', gOn, src === 'licensed' ? 'Designed on licensed photos in your style' : src === 'shoot' ? 'Designed from the shoot photos once they land' : src === 'none' ? 'There is no photo, so the desk designs one' : chain ? 'One brand-kit design for every location' : isDeal || isEvent ? 'A deal needs the dates on the picture' : isOpen ? 'An opening needs the date and the address on it' : 'You have a photo. Add a graphic if you want the price on it', { where: chain || multi ? ['post', 'tent'] : ['post'], priceOn: !!i.facts.price, brandKit: true, spanish: false, from: src === 'mine' ? 'own' : src === 'licensed' ? 'stock' : src === 'shoot' ? 'shoot' : 'ours', look: i.facts.look ?? '' }, i.prices.graphic)
  /* video: on when they already have clips, or when a creator visit makes it free of a trip */
  const vOn = i.facts.hasVideo || chain
  add('video', vOn, i.facts.hasVideo ? 'You have video. A Reel reaches about twice what a photo does' : i.creator?.nearby ? `Add it and we film it when ${first} visits, no extra trip` : 'Reels reach about twice what a photo does. Ten seconds on your phone is enough', { filmed: i.facts.hasVideo ? 'clips' : src === 'shoot' ? 'shoot' : i.creator?.nearby && !chain ? 'creator' : 'visit', style: 'dish', captions: true, tiktok: chain, spanish: false, look: i.facts.look ?? '' }, i.prices.video)
  add('photos', isOpen || src === 'shoot', src === 'shoot' ? 'You asked for a shoot. Add the patio or the team to the list' : isOpen ? 'An opening needs the room and the team on camera' : 'A shoot day. Add it when you want photos of more than this', { list: [], reel: false, look: i.facts.look ?? '' }, i.prices.shoot)
  /* boost: the usual pick, sized by kind, sized up by what worked last time */
  const lastB = i.last?.boostCents && i.last.followers && i.last.followers > 20 ? i.last.boostCents : null
  add('boost', !isHours, lastB ? `$${Math.round(lastB / 100)} again. Last time it brought ${i.last!.followers} followers` : isDeal || isEvent ? `$${b1 / 100}, because a ${isDeal ? 'deal' : 'night'} has only a few days to work` : `$${b1 / 100} reaches about ${(b1 / 100) * 150} people nearby, about ${i.usualReach ? Math.round(((b1 / 100) * 150) / Math.max(1, i.usualReach)) + ' times' : 'many times'} your usual post`, { cents: lastB ?? b1, days: isDeal || isEvent ? 2 : 3 }, lastB ?? b1)
  /* creator: only with verified reach, only for news a visit can carry */
  const cOk = !!i.creator?.nearby && (isDish || isDeal || isEvent || isOpen) && !chain
  add('creator', cOk && (i.budgetCents == null ? isOpen : true), chain ? 'A chain does creators city by city, as a separate ask to the team' : i.creator?.nearby ? `${first} reaches about ${i.creator.nearby.toLocaleString()} people nearby${multi ? ', for your flagship' : ''} and posts what you make` : 'No local creator with verified reach fits yet', i.creator ? { slug: i.creator.slug, tierName: i.creator.tierName ?? null, date: i.creator.date ?? null, code: true, repost: true, whitelist: false } : {}, i.creator?.fromCents ?? 0)
  add('print', isDeal || chain || multi, chain || multi ? `A menu insert for every location, ${locs} of them` : isDeal ? 'A table tent sells a deal at every table' : isOpen ? 'A window poster for the front' : 'A table tent or a window poster', { kinds: chain || multi ? ['insert'] : [isOpen ? 'poster' : 'tent'] }, i.prices.print)
  add('apps', isDish && i.connected.apps, i.connected.apps ? 'A promo on the item where delivery orders start' : 'When DoorDash or Uber Eats is connected', {}, 0)
  add('taste', isDish && !chain, chain ? 'Every location gets the team card instead; a taste is a store decision' : 'Free bites convert better than anything online. It goes on the team card', { days: 7 }, 0)
  add('review', isDish || isOpen, 'Two weeks of asking with the check, while it is new', { days: 14 }, 0)
  add('sign', isDish || isOpen || isEvent, 'Guests posting beats you posting. A small sign with a QR', {}, 0)
  add('offer', false, isDish ? 'A free drink with it this week, and a code the team counts' : 'A code the team counts', { text: '', code: true }, 0)

  /* what they said they want, from onboarding */
  const goal = (i.profile?.goal ?? '').toLowerCase()
  if (/regular|loyal|repeat/.test(goal)) { const r = out.find((x) => x.id === 'review'); if (r) { r.on = true; r.why = 'You said regulars matter. Reviews are how they find you again' } }
  if (/new|aware|reach|more people/.test(goal)) { const b = out.find((x) => x.id === 'boost'); if (b && !isHours) { b.on = true; b.why = `${b.why}. You said new faces are the goal` } }

  /* the budget law */
  const paid = () => out.filter((x) => x.on && x.cents > 0).reduce((s, x) => s + x.cents, 0)
  if (i.budgetCents != null) {
    for (const id of PAID_ORDER) { if (paid() <= i.budgetCents) break; const x = out.find((y) => y.id === id); if (x && x.on && x.cents > 0) { x.on = false; x.why = `${x.why}. Off to stay inside $${Math.round(i.budgetCents / 100)}` } }
  } else {
    /* no number on file: the free things plus the one paid item that matters most */
    let kept = false
    for (const id of ['graphic', 'boost', 'creator', 'video', 'photos', 'print'] as ItemId[]) { const x = out.find((y) => y.id === id); if (!x || !x.on || x.cents <= 0) continue; if (!kept) { kept = true; continue } x.on = false }
  }
  return out
}
export const itemsTotal = (items: ItemPick[]) => items.filter((x) => x.on).reduce((s, x) => s + x.cents, 0)
