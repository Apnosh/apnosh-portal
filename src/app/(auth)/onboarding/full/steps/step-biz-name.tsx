'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { type OnboardingData, type LocationDraft, type WeekHours, FOOD_BIZ_TYPES } from '../data'
import { Store, MapPin, X, ChevronDown, Check } from 'lucide-react'
import { HoursEditor, hasOpenHours } from './step-location-details'
import { Question, Input, FieldLabel } from '../ui'
import { matchCuisine } from '../cuisine'
import { extractFromWebsite, isLookupEnabled, searchBusinesses, getBusinessPrefill, type PlaceCandidate } from '@/lib/onboarding-lookup'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  /** Fast-forward to the review screen once the AI has filled the profile. */
  onJumpToReview?: () => void
}

/** The business website is the DOMAIN. Google often hands back a page deep
 * inside the site (a location's menu page); only a location may keep that. */
function originOf(url: string): string {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).origin } catch { return url }
}

/** A short line describing what a prefill pass populated, for the recap card. */
function summarize(found: string[]): string {
  if (!found.length) return ''
  if (found.length === 1) return found[0]
  return found.slice(0, -1).join(', ') + ' and ' + found[found.length - 1]
}

export default function StepBizName({ data, update, nav, onJumpToReview }: Props) {
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState<string>('')
  /* GOOGLE MATCHES, ASKED FOR HERE RATHER THAN SIX SCREENS LATER.
   * The Places lookup already existed, but it only ran on the LOCATION step, which for a
   * restaurant sits after cuisine, price range, signature dishes, ordering and the menu — all
   * things Google or their own site can answer. The owner was being interrogated for facts we
   * could already see. Asking at the name, where the name is, means every later step arrives
   * pre-filled and is mostly a confirmation. */
  const [lookupOn, setLookupOn] = useState(false)
  useEffect(() => { isLookupEnabled().then(setLookupOn) }, [])
  const [matches, setMatches] = useState<PlaceCandidate[] | null>(null)
  /* Multi-select over the Google results: a business with several spots picks
   * them all in one pass. Tap order matters: the first pick becomes Main. */
  const [picked, setPicked] = useState<string[]>([])
  /* The panel opens with 5 suggestions; Show more reveals the rest (Google
   * returns up to 20). Reset per search so every query starts compact. */
  const [showAllHits, setShowAllHits] = useState(false)
  const [finding, setFinding] = useState(false)
  const [pickedNote, setPickedNote] = useState('')

  /* The name field IS the Google search: results appear as you type. Active
   * only until a main spot exists, so a finished roster is not re-searched. */
  useEffect(() => {
    if (!lookupOn || data.full_address.trim()) return
    const q = data.biz_name.trim()
    if (q.length < 3) { setMatches(null); setPicked([]); setShowAllHits(false); return }
    let alive = true
    setFinding(true)
    const t = setTimeout(async () => {
      try {
        const found = await searchBusinesses(q)
        if (alive) {
          setMatches(found)
          setShowAllHits(false)
          setPicked((prev) => prev.filter((id) => found.some((f) => f.placeId === id)))
        }
      } catch { if (alive) setMatches([]) }
      if (alive) setFinding(false)
    }, 400)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.biz_name, data.full_address, lookupOn])

  async function usePlace(c: PlaceCandidate) {
    setFinding(true)
    const p = await getBusinessPrefill(c.placeId).catch(() => null)
    setFinding(false)
    if (!p) { setPickedNote('Could not read that listing. Keep going and we will fill it in together.'); return }

    /* Only ever fill BLANKS. Anything already typed is the owner's and outranks Google. */
    const got: string[] = []
    update('primary_place_id', c.placeId)
    update('primary_location_name', c.name)
    if (!data.biz_name.trim() && p.name) update('biz_name', p.name)
    if (p.full_address) { update('full_address', p.full_address); got.push('address') }
    if (p.city) update('city', p.city)
    if (p.state) update('state', p.state)
    if (p.zip) update('zip', p.zip)
    if (p.phone && !data.phone) { update('phone', p.phone); got.push('phone') }
    if (p.website && !data.website.trim()) { update('website', originOf(p.website)); got.push('website') }
    if (p.price_range && !data.price_range) { update('price_range', p.price_range); got.push('price range') }
    if (p.hours && Object.keys(p.hours).length && !Object.keys(data.hours || {}).length) {
      update('hours', p.hours); got.push('opening hours')
    }
    if (!data.biz_type && p.is_food) update('biz_type', FOOD_BIZ_TYPES[0])
    if (got.length) setFilledSomething(true)

    /* Their own site answers the things Google cannot: cuisine, signature dishes, the menu.
     * Run it straight away so the owner never has to think about a second button. */
    if (p.website) await runScan(p.website)

    setPickedNote(got.length
      ? 'All set. Your location is below with its phone and hours from Google. Change anything that looks off.'
      : 'Found your listing. We will fill the rest in as we go.')
    setMatches(null)
  }
  /* Apply every picked result in one go. First pick (or the existing main)
   * anchors the business; every other pick becomes a location card with its
   * own phone + hours pulled from Google. */
  async function confirmPicks() {
    if (!matches || !picked.length || finding) return
    const chosen = picked
      .map((id) => matches.find((m) => m.placeId === id))
      .filter((m): m is PlaceCandidate => !!m)
    const hasMain = !!data.full_address.trim()
    const [head, ...rest] = chosen
    const extrasSrc = hasMain ? chosen : rest
    const mainId = hasMain ? data.primary_place_id : head.placeId
    setFinding(true)
    if (!hasMain) await usePlace(head)
    const extras: LocationDraft[] = []
    for (const c of extrasSrc) {
      if (c.placeId === mainId) continue
      if (extras.some((e) => e.place_id === c.placeId)) continue
      if (isDupSpot(c.placeId, c.address)) continue
      const p = await getBusinessPrefill(c.placeId).catch(() => null)
      extras.push({
        name: c.name, full_address: p?.full_address || c.address,
        city: p?.city ?? '', state: p?.state ?? '', zip: p?.zip ?? '',
        place_id: c.placeId, phone: p?.phone ?? '', hours: p?.hours ?? {},
        website: p?.website ?? '',
      })
    }
    if (extras.length) {
      const next = [...data.locations, ...extras]
      update('locations', next)
      const total = 1 + next.length
      update('location_count', total <= 1 ? 'Just 1' : total <= 3 ? '2\u20133' : total <= 6 ? '4\u20136' : '7+')
      setPickedNote((prev) => (prev ? prev + ' ' : '') + `Added ${extras.length} more location${extras.length > 1 ? 's' : ''} below.`)
    }
    setFinding(false)
    setMatches(null)
    setPicked([])
  }

  // True once a website scan has actually populated fields, so we can offer
  // a shortcut straight to the review screen instead of every step.
  const [filledSomething, setFilledSomething] = useState(false)

  /* MANUAL LANE (owner call 2026-08-27, v4): Google is handled by the
   * multi-select above, so adding a location by hand is just a small form:
   * name (for extra spots) + address. Phone and hours are added by tapping
   * the card after. The FIRST location still becomes the main spot. */
  const [addingSpot, setAddingSpot] = useState(false)
  const [spotName, setSpotName] = useState('')
  const [spotAddr, setSpotAddr] = useState('')
  /* Which location card is open to show its phone + hours. 'main' is the
   * primary spot; a number indexes data.locations. Each spot keeps its own
   * phone and hours, so the card is where you check and fix them. */
  const [openCard, setOpenCard] = useState<'main' | number | null>(null)
  function updateSpot(i: number, patch: Partial<LocationDraft>) {
    update('locations', data.locations.map((l, x) => (x === i ? { ...l, ...patch } : l)))
  }
  const spotPeek = (phone: string, hours: WeekHours) => {
    const bits: string[] = []
    if (phone.trim()) bits.push(phone.trim())
    if (hasOpenHours(hours)) bits.push('Hours saved')
    return bits.length ? bits.join(' \u00B7 ') : 'Add phone and hours'
  }
  const normAddr = (a: string) => a.trim().toLowerCase()
  const isDupSpot = (placeId: string, addr: string) =>
    (!!placeId && (placeId === data.primary_place_id || data.locations.some((l) => l.place_id === placeId))) ||
    (!!addr.trim() && (normAddr(addr) === normAddr(data.full_address) || data.locations.some((l) => normAddr(l.full_address) === normAddr(addr))))
  const syncSpotCount = (extras: number) => {
    const total = (data.full_address.trim() ? 1 : 0) + extras || 1
    update('location_count', total <= 1 ? 'Just 1' : total <= 3 ? '2\u20133' : total <= 6 ? '4\u20136' : '7+')
  }
  function closeSpotLane() {
    setAddingSpot(false); setSpotName(''); setSpotAddr('')
  }
  function addSpotManual() {
    const a = spotAddr.trim()
    if (!a || isDupSpot('', a)) return
    if (!data.full_address.trim()) {
      /* first location = the main spot */
      update('full_address', a)
      syncSpotCount(data.locations.length)
    } else {
      const next = [...data.locations, { name: spotName.trim(), full_address: a, city: '', state: '', zip: '', place_id: '', phone: '', hours: {} }]
      update('locations', next); syncSpotCount(next.length)
    }
    closeSpotLane()
  }
  /* All cards are equal: removing the first location promotes the next one
   * into the primary fields (the system still keeps A primary internally,
   * the owner never manages it). */
  function removePrimary() {
    const [next, ...rest] = data.locations
    if (next) {
      update('primary_location_name', next.name || '')
      update('full_address', next.full_address)
      update('city', next.city); update('state', next.state); update('zip', next.zip)
      update('primary_place_id', next.place_id || '')
      update('phone', next.phone || ''); update('hours', next.hours || {})
      update('locations', rest)
      const total = 1 + rest.length
      update('location_count', total <= 1 ? 'Just 1' : total <= 3 ? '2\u20133' : total <= 6 ? '4\u20136' : '7+')
    } else {
      update('primary_location_name', '')
      update('full_address', ''); update('city', ''); update('state', ''); update('zip', '')
      update('primary_place_id', ''); update('phone', ''); update('hours', {})
      update('location_count', 'Just 1')
    }
    setOpenCard(null)
  }
  function removeSpot(i: number) {
    const next = data.locations.filter((_, x) => x !== i)
    update('locations', next); syncSpotCount(next.length)
    setOpenCard((c) => (typeof c === 'number' ? (c === i ? null : c > i ? c - 1 : c) : c))
  }


  async function runScan(url: string) {
    const target = (url || data.website).trim()
    if (!target) return
    setScanning(true)
    setScanNote('')
    const x = await extractFromWebsite(target)
    setScanning(false)
    if (!x) { setScanNote("We could not read that site automatically. Some sites load their menu with code we cannot scan yet. No problem, we will fill this in together as we go."); return }

    const got: string[] = []
    if (x.description && !data.biz_desc) { update('biz_desc', x.description); got.push('a description') }
    if (x.cuisine && !data.cuisine) {
      const m = matchCuisine(x.cuisine)
      if (m.cuisine) {
        update('cuisine', m.cuisine)
        if (m.cuisine === 'Other') update('cuisine_other', m.other)
        got.push('cuisine')
      }
    }
    if (x.signature_items.length && !data.signature_items.some((s) => s.trim())) {
      update('signature_items', x.signature_items); got.push(`${x.signature_items.length} signature dishes`)
    }
    if (x.menu_items.length && !data.menu_items.length) {
      update('menu_items', x.menu_items); got.push(`${x.menu_items.length} menu items`)
    }
    if (x.specials.length && !data.specials.length) {
      update('specials', x.specials); got.push(`${x.specials.length} specials`)
    }
    if (x.service_styles.length && !data.service_styles.length) {
      update('service_styles', x.service_styles); got.push('how you serve')
    }
    if (x.dietary_options.length && !data.dietary_options.length) {
      update('dietary_options', x.dietary_options); got.push('dietary options')
    }
    if (x.reservations_platform && !data.reservations_platform) {
      update('reservations_platform', x.reservations_platform); got.push('reservations')
    }
    if (x.delivery_platforms.length && !data.delivery_platforms.length) {
      update('delivery_platforms', x.delivery_platforms); got.push('delivery')
    }
    if (got.length) setFilledSomething(true)
    setScanNote(got.length
      ? `From your site we drafted ${summarize(got)}. Review and tweak anything as you go.`
      : 'Read your site. Nothing new to pull, so we will fill this in together.')
  }

  return (
    <>
      <Question title="Your business" icon={<Store size={26} strokeWidth={2} />} />
      <div className="mt-5 space-y-4">
        {/* Business name — the brand, kept separate from any one location's
            Google listing (those get searched on the next step). */}
        <div>
          <FieldLabel>Business name</FieldLabel>
          <Input
            value={data.biz_name}
            onChange={(v) => update('biz_name', v)}
            placeholder="The Golden Spoon"
            autoFocus
          />

          {/* Typing the name searches Google on its own; no button to find. */}
          {lookupOn && data.biz_name.trim().length > 1 && (
            <div className="mt-2.5">
              {/* The suggestions panel: one white sheet under the field,
                  Google-autocomplete style. Tapped rows keep a check so a
                  multi-spot business picks everything in one pass. */}
              {((finding && !data.full_address.trim()) || (matches && matches.length > 0)) && (
                <div
                  className="rounded-[12px] bg-white overflow-hidden"
                  style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05), 0 14px 40px rgba(0,0,0,0.13)' }}
                >
                  {finding && (
                    <div className="flex items-center gap-3 px-3.5 py-3">
                      <MapPin size={15} color="#d1d1d6" className="flex-shrink-0" />
                      <span className="text-[13px]" style={{ color: '#8e8e93' }}>Searching Google...</span>
                    </div>
                  )}
                  {((showAllHits ? matches : matches?.slice(0, 5)) ?? []).map((m, i) => {
                    const on = picked.includes(m.placeId)
                    return (
                      <button
                        key={m.placeId} type="button"
                        onClick={() => setPicked(on ? picked.filter((x) => x !== m.placeId) : [...picked, m.placeId])}
                        className="w-full text-left flex items-center gap-3 px-3.5 transition-all"
                        style={{
                          border: 'none', minHeight: 54, cursor: 'pointer',
                          background: on ? '#f0faf6' : '#fff',
                          borderTop: i > 0 || finding ? '1px solid #f2f2f4' : 'none',
                        }}
                      >
                        <MapPin size={15} color={on ? '#2e9a78' : '#aeaeb2'} className="flex-shrink-0" />
                        <div className="min-w-0 flex-1 py-2">
                          <div className="text-[14px] font-medium truncate" style={{ color: '#1d1d1f' }}>{m.name}</div>
                          <div className="text-[12px] truncate" style={{ color: '#8e8e93' }}>{m.address}</div>
                        </div>
                        {on && (
                          <span className="flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 18, borderRadius: 9, background: '#2e9a78' }}>
                            <Check size={11} color="#fff" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                  {matches && matches.length > 5 && !showAllHits && (
                    <button
                      type="button" onClick={() => setShowAllHits(true)}
                      className="w-full text-[12.5px] font-semibold"
                      style={{ minHeight: 44, border: 'none', borderTop: '1px solid #f2f2f4', background: '#fff', color: '#0f6e56', cursor: 'pointer' }}
                    >
                      Show {matches.length - 5} more
                    </button>
                  )}
                  {matches && matches.length > 0 && (
                    <div
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                      style={{ borderTop: '1px solid #f2f2f4', background: '#fbfbfd' }}
                    >
                      <span className="text-[11.5px]" style={{ color: '#8e8e93' }}>Tap all of your locations.</span>
                      {picked.length > 0 && (
                        <button
                          type="button" onClick={confirmPicks} disabled={finding}
                          className="text-[13px] font-bold text-white flex-shrink-0 transition-all disabled:opacity-50"
                          style={{
                            minHeight: 36, padding: '0 16px', borderRadius: 18, border: 'none', cursor: 'pointer',
                            background: 'linear-gradient(135deg, #4abd98, #2e9a78)',
                            boxShadow: '0 6px 16px rgba(74,189,152,0.30)',
                          }}
                        >
                          {picked.length === 1 ? 'Use this location' : `Use these ${picked.length} locations`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {matches && matches.length === 0 && !finding && !data.full_address.trim() && (
                <div className="text-[12.5px]" style={{ color: '#6e6e73' }}>No Google match. Enter your location below.</div>
              )}

              {pickedNote && (
                <div className="mt-2 text-[12px] leading-relaxed" style={{ color: '#6e6e73' }}>{pickedNote}</div>
              )}
            </div>
          )}
        </div>

        {/* Locations, one flow: cards for what exists, one button to add the
            next, one field that is both Google search and manual address */}
        <div>
          <FieldLabel>Locations</FieldLabel>
          <div className="flex flex-col gap-2">
            {data.full_address.trim() && (
              <div className="rounded-[14px] bg-white" style={{ boxShadow: openCard === 'main' ? 'inset 0 0 0 1.5px #4abd98, 0 8px 24px rgba(74,189,152,0.15)' : '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.05)' }}>
                <div
                  role="button" tabIndex={0}
                  onClick={() => setOpenCard(openCard === 'main' ? null : 'main')}
                  onKeyDown={(e) => { if (e.key === 'Enter') setOpenCard(openCard === 'main' ? null : 'main') }}
                  className="flex items-center gap-2.5 px-3.5 py-3" style={{ cursor: 'pointer' }}
                >
                  <MapPin size={16} color="#6e6e73" className="flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    {data.primary_location_name.trim() ? <div className="text-[13px] font-semibold truncate" style={{ color: '#1d1d1f' }}>{data.primary_location_name}</div> : null}
                    <div className="text-[12px] truncate" style={{ color: '#6e6e73' }}>{data.full_address}</div>
                    <div className="text-[11.5px] mt-0.5 truncate" style={{ color: data.phone.trim() || hasOpenHours(data.hours) ? '#8e8e93' : '#0f6e56' }}>{spotPeek(data.phone, data.hours)}</div>
                  </div>
                  <ChevronDown size={15} color="#aeaeb2" className="flex-shrink-0" style={{ transform: openCard === 'main' ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
                  <button type="button" aria-label="Remove this location" onClick={(e) => { e.stopPropagation(); removePrimary() }} className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, border: 'none', background: 'none', color: '#aeaeb2', cursor: 'pointer' }}>
                    <X size={15} />
                  </button>
                </div>
                {openCard === 'main' && (
                  <div className="px-3.5 pb-3.5 flex flex-col gap-3">
                    {data.primary_place_id ? (
                      <div className="text-[12px]" style={{ color: '#6e6e73' }}>From your Google listing. Fix anything that looks off.</div>
                    ) : null}
                    <div>
                      <FieldLabel>Location name</FieldLabel>
                      <Input value={data.primary_location_name} onChange={(v) => update('primary_location_name', v)} placeholder="Like Downtown or Kent" />
                    </div>
                    <div>
                      <FieldLabel>Address</FieldLabel>
                      <Input value={data.full_address} onChange={(v) => update('full_address', v)} placeholder="Street, city, state" />
                    </div>
                    <div>
                      <FieldLabel>Phone</FieldLabel>
                      <Input value={data.phone} onChange={(v) => update('phone', v)} placeholder="(555) 123-4567" type="tel" />
                    </div>
                    <div>
                      <FieldLabel>Hours</FieldLabel>
                      <HoursEditor hours={data.hours} onChange={(h) => update('hours', h)} />
                    </div>
                    <button type="button" onClick={() => setOpenCard(null)} className="self-start text-[12.5px] font-semibold" style={{ background: 'none', border: 'none', color: '#0f6e56', cursor: 'pointer', padding: 0 }}>Done</button>
                  </div>
                )}
              </div>
            )}
            {data.locations.map((l, i) => (
              <div key={`${l.place_id || l.full_address}-${i}`} className="rounded-[14px] bg-white" style={{ boxShadow: openCard === i ? 'inset 0 0 0 1.5px #4abd98, 0 8px 24px rgba(74,189,152,0.15)' : '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.05)' }}>
                <div
                  role="button" tabIndex={0}
                  onClick={() => setOpenCard(openCard === i ? null : i)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setOpenCard(openCard === i ? null : i) }}
                  className="flex items-center gap-2.5 px-3.5 py-3" style={{ cursor: 'pointer' }}
                >
                  <MapPin size={16} color="#6e6e73" className="flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    {l.name.trim() ? <div className="text-[13px] font-semibold truncate" style={{ color: '#1d1d1f' }}>{l.name}</div> : null}
                    <div className="text-[12px] truncate" style={{ color: '#6e6e73' }}>{l.full_address}</div>
                    <div className="text-[11.5px] mt-0.5 truncate" style={{ color: (l.phone || '').trim() || hasOpenHours(l.hours) ? '#8e8e93' : '#0f6e56' }}>{spotPeek(l.phone || '', l.hours || {})}</div>
                  </div>
                  <ChevronDown size={15} color="#aeaeb2" className="flex-shrink-0" style={{ transform: openCard === i ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
                  <button type="button" aria-label={`Remove ${l.name || l.full_address}`} onClick={(e) => { e.stopPropagation(); removeSpot(i) }} className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, border: 'none', background: 'none', color: '#aeaeb2', cursor: 'pointer' }}>
                    <X size={15} />
                  </button>
                </div>
                {openCard === i && (
                  <div className="px-3.5 pb-3.5 flex flex-col gap-3">
                    {l.place_id ? (
                      <div className="text-[12px]" style={{ color: '#6e6e73' }}>From this spot{'\u2019'}s Google listing. Fix anything that looks off.</div>
                    ) : null}
                    <div>
                      <FieldLabel>Location name</FieldLabel>
                      <Input value={l.name} onChange={(v) => updateSpot(i, { name: v })} placeholder="Like Downtown or Kent" />
                    </div>
                    <div>
                      <FieldLabel>Address</FieldLabel>
                      <Input value={l.full_address} onChange={(v) => updateSpot(i, { full_address: v })} placeholder="Street, city, state" />
                    </div>
                    <div>
                      <FieldLabel>Phone</FieldLabel>
                      <Input value={l.phone || ''} onChange={(v) => updateSpot(i, { phone: v })} placeholder="(555) 123-4567" type="tel" />
                    </div>
                    <div>
                      <FieldLabel>This spot{'\u2019'}s web page</FieldLabel>
                      <Input value={l.website || ''} onChange={(v) => updateSpot(i, { website: v })} placeholder="Its own page, if it has one" type="url" />
                    </div>
                    <div>
                      <FieldLabel>This spot{'\u2019'}s menu link</FieldLabel>
                      <Input value={l.menu_url || ''} onChange={(v) => updateSpot(i, { menu_url: v })} placeholder="Its own menu, if it differs" type="url" />
                    </div>
                    <div>
                      <FieldLabel>Hours</FieldLabel>
                      <HoursEditor hours={l.hours || {}} onChange={(h) => updateSpot(i, { hours: h })} />
                    </div>
                    <button type="button" onClick={() => setOpenCard(null)} className="self-start text-[12.5px] font-semibold" style={{ background: 'none', border: 'none', color: '#0f6e56', cursor: 'pointer', padding: 0 }}>Done</button>
                  </div>
                )}
              </div>
            ))}
            {!data.full_address.trim() && data.locations.length === 0 && !addingSpot && (
              <div
                className="flex flex-col items-center justify-center gap-1.5 rounded-[14px] px-4 py-6"
                style={{ border: '1.5px dashed #d8d8dc', background: 'rgba(255,255,255,0.5)' }}
              >
                <MapPin size={18} color="#aeaeb2" />
                <div className="text-[13px]" style={{ color: '#8e8e93' }}>Your locations will show up here.</div>
              </div>
            )}
            {addingSpot ? (
              <div className="rounded-[14px] p-3 bg-white flex flex-col gap-2.5" style={{ boxShadow: 'inset 0 0 0 1.5px #4abd98, 0 8px 24px rgba(74,189,152,0.15)' }}>
                {data.full_address.trim() ? (
                  <Input value={spotName} onChange={setSpotName} placeholder="Location name, like Downtown" autoFocus />
                ) : null}
                <Input value={spotAddr} onChange={setSpotAddr} placeholder="Street, city, state" autoFocus={!data.full_address.trim()} />
                <button
                  type="button" onClick={addSpotManual} disabled={!spotAddr.trim()}
                  className="w-full text-[13px] font-bold text-white transition-all disabled:opacity-40"
                  style={{ minHeight: 44, borderRadius: 22, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #4abd98, #2e9a78)', boxShadow: '0 6px 18px rgba(74,189,152,0.30)' }}
                >
                  Add this location
                </button>
                <button type="button" onClick={closeSpotLane} className="self-start text-[12.5px] font-semibold" style={{ background: 'none', border: 'none', color: '#6e6e73', cursor: 'pointer', padding: 0 }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button" onClick={() => setAddingSpot(true)}
                className="self-center text-[12.5px] font-semibold"
                style={{ background: 'none', border: 'none', color: '#0f6e56', cursor: 'pointer', padding: '4px 0' }}
              >
                + Enter manually
              </button>
            )}
          </div>
        </div>

        {/* Website + optional scan — paste a site and we draft the story,
            menu, and specials so the owner is not typing it from scratch. */}
        <div>
          <FieldLabel>Website <span style={{ color: '#98989d', fontWeight: 400 }}>(optional)</span></FieldLabel>
          <Input
            value={data.website}
            onChange={(v) => update('website', v)}
            placeholder="https://yourbusiness.com"
            type="url"
          />
        </div>

        {/* Scan recap */}
        {scanNote && (
          <div
            className="text-[13px] leading-relaxed rounded-[12px] px-3.5 py-2.5"
            style={{ background: '#f5f5f7', color: '#48484a', borderLeft: '3px solid #4abd98' }}
          >
            {scanNote}
          </div>
        )}


        {/* Fast-forward: once the AI has filled fields, let the owner jump
            straight to the review screen instead of tapping every step. */}
        {filledSomething && onJumpToReview && (
          <button
            type="button"
            onClick={onJumpToReview}
            className="w-full py-3 rounded-[12px] text-[13px] font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #2e9a78, #0f6e56)', boxShadow: '0 6px 18px rgba(46,154,120,0.30)', minHeight: 52, borderRadius: 26 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #23815f, #0a5a45)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #2e9a78, #0f6e56)' }}
          >
            See what we filled →
          </button>
        )}
      </div>
      {nav}
    </>
  )
}
