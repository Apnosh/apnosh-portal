/**
 * THE PICKER (owner 2026-09-18): pre-add the right items for an announcement from what the
 * owner said and what we know, each with one line of why. Rules first, so a full plan comes
 * back instantly and without an AI key; AI only reads free text and polishes the why lines.
 *
 * Two laws. Free items pre-add freely. Paid items pre-add only inside the budget on file;
 * with no budget, the free items plus the one paid item that matters most, and the screen
 * asks for a number.
 */
export type ItemId = 'post' | 'graphic' | 'video' | 'photos' | 'boost' | 'creator' | 'print' | 'apps' | 'taste' | 'review' | 'sign' | 'offer' | 'custom'
export interface ItemPick { id: ItemId; uid: string; on: boolean; why: string; options: Record<string, unknown>; cents: number }
/** things you can add more than once, each with its own options */
export const MULTI: ItemId[] = ['graphic', 'video', 'print', 'creator', 'custom']
export const newUid = (id: ItemId) => `${id}-${Math.random().toString(36).slice(2, 8)}`
export interface SuggestInput {
  kind: string
  facts: { price?: string | null; hasMedia: boolean; hasVideo: boolean; limited?: boolean; date?: string | null; what?: string | null; source?: 'mine' | 'licensed' | 'shoot' | 'none'; look?: string | null
    /* THE CONTENT CHOICE (owner 2026-09-23): where the pictures come from decides what gets made and how much */
    content?: 'shoot' | 'queue' | 'own' | 'library' | 'licensed' | 'none'; shootBooked?: boolean; shootDate?: string | null; shootPhotos?: number | null }
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
  /* the content choice has the last word on what gets made */
  const ct = i.facts.content
  if (ct) {
    const g = out.find((x) => x.id === 'graphic')!, v = out.find((x) => x.id === 'video')!, ph = out.find((x) => x.id === 'photos')!
    const shootish = ct === 'shoot' || ct === 'queue'
    const nG = ct === 'shoot' ? 3 : ct === 'queue' ? 2 : 1
    g.on = ct !== 'none'; g.options = { ...g.options, count: nG, from: shootish ? 'shoot' : ct === 'licensed' ? 'stock' : 'own' }
    g.why = ct === 'shoot' ? `${nG} designs from the day's photos, the price on them` : ct === 'queue' ? `${nG} designs once the shoot lands` : ct === 'licensed' ? 'Designed on a licensed photo in your style' : ct === 'none' ? 'No picture, so no graphic' : 'Designed from your photo'
    if (ct === 'shoot') { const pk = PACKAGES.standard; g.options = { ...g.options, count: pk.graphics, included: pk.graphics }; v.on = true; v.options = { ...v.options, count: pk.reels, included: pk.reels, filmed: 'shoot' }; v.why = 'A Reel cut from the day, inside the package' }
    else if (ct === 'queue') { g.options = { ...g.options, included: 0 }; v.on = true; v.options = { ...v.options, count: 1, included: 0, filmed: 'shoot' }; v.why = 'A Reel from the shoot when it lands, at the package rate' }
    else if ((ct === 'own' || ct === 'library') && i.facts.hasVideo) { v.on = true; v.options = { ...v.options, count: 1, filmed: 'clips' }; v.why = 'A Reel from the clips you added' }
    else { v.on = false; v.options = { ...v.options, count: 1, filmed: i.creator?.nearby ? 'creator' : 'visit' } }
    ph.on = shootish; ph.options = { ...ph.options, queue: ct === 'queue', newDay: ct === 'shoot' && !!i.facts.shootBooked, date: ct === 'shoot' ? (i.facts.shootDate ?? '') : '', photos: ct === 'shoot' ? PACKAGES.standard.photos : (i.facts.shootPhotos ?? 15), tier: ct === 'shoot' ? 'standard' : undefined }
    ph.why = ct === 'shoot' ? 'The content day: photos and video in one visit' : ct === 'queue' ? 'On the next content day, nothing to pay now' : ph.why
  }
  return out
}
/* THE CONTENT PACKAGES (owner 2026-09-23): a content day makes its own graphics and Reels, so the day's
   post-production is inside one price. Extras from the same day cost less than a standalone piece. */
export type PackageTier = 'standard' | 'full' | 'works'
export const PACKAGES: Record<PackageTier, { photos: number; graphics: number; reels: number; cents: number; label: string }> = {
  standard: { photos: 15, graphics: 1, reels: 1, cents: 69900, label: 'a quick visit' },
  full: { photos: 25, graphics: 3, reels: 2, cents: 119900, label: 'half a day' },
  works: { photos: 40, graphics: 5, reels: 4, cents: 189900, label: 'a full day' },
}
export const PACKAGE_EXTRA = { graphic: 18500, video: 22000 }
export const packageFor = (photos: number): PackageTier => (photos >= 40 ? 'works' : photos >= 25 ? 'full' : 'standard')
export const itemsTotal = (items: ItemPick[]) => items.filter((x) => x.on).reduce((s, x) => s + x.cents, 0)

/* THE LADDER (owner 2026-09-22, "the actual build plan logic"): three plans, each the one before plus more,
   built from what the app knows. A new dish is a conversion play for the people who already know the place,
   with a small awareness push nearby: content first, own channels on a peak day, Google for searchers, then
   paid reach in proportion to budget. Every set is a map of item id → true (the item's own options) or the
   options to use. */
export type LadderSet = Record<string, true | Record<string, unknown>>
export interface Ladder { simple: LadderSet; recommended: LadderSet; bigger: LadderSet; notes: { simple: string; recommended: string; bigger: string } }
export function ladderFor(i: SuggestInput, items: ItemPick[]): Ladder {
  const k = i.kind
  const isDish = k === 'dish', isDeal = k === 'deal', isEvent = k === 'event', isOpen = k === 'open', isHours = k === 'hours' || k === 'holiday'
  const src = i.facts.source ?? (i.facts.hasMedia ? 'mine' : 'none')
  const it = (id: ItemId) => items.find((x) => x.id === id) ?? null
  const centsOf = (id: ItemId) => it(id)?.cents ?? 0
  const first = i.creator?.name.split(' ')[0] ?? 'a creator'
  const ct = i.facts.content ?? (src === 'shoot' ? 'shoot' : src === 'mine' ? 'own' : src === 'licensed' ? 'licensed' : 'none')
  const shootish = ct === 'shoot' || ct === 'queue'
  /* Just be seen: the post on their channels and the Google update. With a shoot chosen, the day itself rides in
     every level (it is the content); with a licensed photo, the one graphic does, since the post needs a picture. */
  const simple: LadderSet = { post: true }
  if (ct === 'shoot') { const pk = PACKAGES.standard; simple.photos = { photos: pk.photos, tier: 'standard' }; simple.graphic = { count: pk.graphics, included: pk.graphics }; simple.video = { count: pk.reels, included: pk.reels, filmed: 'shoot', style: 'dish', captions: true } }
  if (ct === 'queue') simple.photos = true
  if (ct === 'licensed') simple.graphic = { count: 1 }
  /* Drive actions: a boost sized to how far their posts already go, the graphic unless the photo is their own,
     a table tent, the taste at the counter, a launch offer with a code the team counts */
  const low = i.usualReach == null || i.usualReach < 300
  const boostRec = isHours ? null : (isDeal || isEvent || isOpen) ? 4000 : low ? 5000 : 2000
  const recommended: LadderSet = { ...simple }
  /* what gets made follows the content: a content day feeds designs and Reels; your own photo needs little; a
     licensed photo needs the one design; no picture means words and the room only */
  if (ct === 'shoot') { const pk = PACKAGES.full; recommended.photos = { photos: pk.photos, tier: 'full' }; recommended.graphic = { count: pk.graphics, included: pk.graphics }; recommended.video = { count: pk.reels, included: pk.reels, filmed: 'shoot', style: 'dish', captions: true } }
  else if (ct === 'queue') { recommended.graphic = { count: 2, included: 0 }; recommended.video = { count: 1, included: 0, filmed: 'shoot', style: 'dish', captions: true } }
  else if (ct === 'own' || ct === 'library') { if (isDeal || isEvent || isOpen) recommended.graphic = { count: 1 }; if (i.facts.hasVideo) recommended.video = { count: 1, filmed: 'clips', style: 'dish', captions: true } }
  else if (ct === 'licensed') recommended.graphic = { count: 1 }
  if (boostRec) recommended.boost = { cents: boostRec, days: 3 }
  if ((isDish || isDeal) && ct !== 'none') recommended.print = { kinds: ['tent'] }
  if (isDish && it('taste')) recommended.taste = true
  if (isDish || isDeal) recommended.offer = { text: isDish ? 'A free drink with it this week' : 'This week only', code: true }
  const spent = (set: LadderSet) => Object.keys(set).reduce((sum, id) => sum + (id === 'boost' ? Number((set.boost as Record<string, unknown>)?.cents ?? 0) : centsOf(id as ItemId)), 0)
  /* the budget law for the middle plan: drop the dearest extras first, never the boost */
  if (i.budgetCents != null) for (const id of ['video', 'print', 'graphic'] as ItemId[]) { if (spent(recommended) <= i.budgetCents) break; if (id === 'graphic' && ct === 'licensed') continue; delete recommended[id] }
  /* The full push: the creator, a Reel, tent and poster, the bigger boost, the delivery apps, and the room
     working on reputation: ask for a review, the guest photo sign */
  const creatorOk = !!i.creator?.nearby && (isDish || isDeal || isEvent || isOpen)
  const bigger: LadderSet = { ...recommended }
  if (creatorOk) bigger.creator = { slug: i.creator!.slug, code: true, repost: true }
  if (!isHours && ct !== 'none') bigger.video = ct === 'shoot' ? { count: PACKAGES.works.reels, included: PACKAGES.works.reels, filmed: 'shoot', style: 'dish', captions: true } : ct === 'queue' ? { count: 1, included: 0, filmed: 'shoot', style: 'dish', captions: true } : { count: 1, filmed: creatorOk ? 'creator' : i.facts.hasVideo ? 'clips' : 'visit', style: 'dish', captions: true }
  if (!isHours && ct !== 'none') bigger.print = { kinds: ['tent', 'poster'] }
  if (ct === 'shoot') { bigger.photos = { photos: PACKAGES.works.photos, tier: 'works' }; bigger.graphic = { count: PACKAGES.works.graphics, included: PACKAGES.works.graphics } } else if (ct === 'queue') bigger.graphic = { count: 2, included: 0 }; else if (ct !== 'none') bigger.graphic = { count: 1 }
  if (!isHours) bigger.boost = { cents: 10000, days: 5 }
  if (isDish && i.connected.apps) bigger.apps = true
  if (it('review')) bigger.review = true
  if (it('sign')) bigger.sign = true
  if (isDish || isDeal) bigger.offer = { text: isDish ? 'A free drink with it this week' : 'This week only', code: true }
  const notes = {
    simple: ct === 'shoot' ? 'A quick visit: 15 photos, a graphic, a Reel, then the post' : ct === 'queue' ? 'The post now, more when the shoot lands' : ct === 'licensed' ? 'A designed post and Google' : ct === 'none' ? 'Words on Google and Facebook. Free' : 'Your photo on your channels and Google. Free',
    recommended: [recommended.boost ? `a $${Math.round(Number((recommended.boost as Record<string, unknown>).cents) / 100)} boost` : '', recommended.graphic ? 'a graphic' : '', recommended.print ? 'a table tent' : '', recommended.offer ? 'a code' : '', recommended.taste ? 'a taste' : ''].filter(Boolean).join(', '),
    bigger: [bigger.creator ? `${first} visits` : '', 'a Reel', 'print', 'the bigger boost', bigger.apps ? 'the delivery apps' : '', 'reviews'].filter(Boolean).join(', '),
  }
  /* EFFORT BY PLAN (owner 2026-09-24): Just be seen starts at Quick, Drive actions at Standard, The full
     push at The works, on the pieces made on their own. A piece the content day includes stays Standard
     (the package price covers Standard; going up is the owner's tap and costs the difference). */
  const effort = (set: LadderSet, g: 1 | 2 | 3, v: 'standard' | 'works') => {
    const gr = set.graphic
    if (gr && !(typeof gr === 'object' && (gr as Record<string, unknown>).included)) set.graphic = { ...(typeof gr === 'object' ? gr : {}), level: g }
    const vd = set.video
    if (vd && !(typeof vd === 'object' && (vd as Record<string, unknown>).filmed === 'shoot')) set.video = { ...(typeof vd === 'object' ? vd : {}), level: v }
  }
  effort(simple, 1, 'standard'); effort(recommended, 2, 'standard'); effort(bigger, 3, 'works')
  return { simple, recommended, bigger, notes }
}
