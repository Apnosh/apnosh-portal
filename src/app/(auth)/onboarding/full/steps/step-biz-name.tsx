'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { type OnboardingData, FOOD_BIZ_TYPES } from '../data'
import { Store, MapPin, X } from 'lucide-react'
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
  const [finding, setFinding] = useState(false)
  const [pickedNote, setPickedNote] = useState('')

  async function findOnGoogle() {
    const q = data.biz_name.trim()
    if (!q || !lookupOn) return
    setFinding(true); setMatches(null); setPickedNote('')
    try {
      const found = await searchBusinesses(q)
      setMatches(found.slice(0, 4))
      if (!found.length) setPickedNote('No Google match yet. Keep going and we will fill this in as we go.')
    } catch {
      setPickedNote('Could not reach Google just now. Keep going, nothing is lost.')
    }
    setFinding(false)
  }

  async function usePlace(c: PlaceCandidate) {
    setFinding(true)
    const p = await getBusinessPrefill(c.placeId).catch(() => null)
    setFinding(false)
    if (!p) { setPickedNote('Could not read that listing. Keep going and we will fill it in together.'); return }

    /* Only ever fill BLANKS. Anything already typed is the owner's and outranks Google. */
    const got: string[] = []
    update('primary_place_id', c.placeId)
    if (!data.biz_name.trim() && p.name) update('biz_name', p.name)
    if (p.full_address) { update('full_address', p.full_address); got.push('address') }
    if (p.city) update('city', p.city)
    if (p.state) update('state', p.state)
    if (p.zip) update('zip', p.zip)
    if (p.phone && !data.phone) { update('phone', p.phone); got.push('phone') }
    if (p.website && !data.website.trim()) { update('website', p.website); got.push('website') }
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
      ? `Got your ${summarize(got)} from Google. Everything below is already filled in. Change anything that looks off.`
      : 'Found your listing. We will fill the rest in as we go.')
    setMatches(null)
  }
  // True once a website scan has actually populated fields, so we can offer
  // a shortcut straight to the review screen instead of every step.
  const [filledSomething, setFilledSomething] = useState(false)

  /* MULTIPLE LOCATIONS (owner call 2026-08-27): the business screen owns the
   * roster. The Google pick above fills the MAIN spot; every extra spot is
   * added right here, searched the same way, and lands in data.locations
   * (the same field the confirm screen and completion save already persist). */
  const [addingSpot, setAddingSpot] = useState(false)
  const [spotQ, setSpotQ] = useState('')
  const [spotHits, setSpotHits] = useState<PlaceCandidate[]>([])
  const [spotBusy, setSpotBusy] = useState(false)
  const normAddr = (a: string) => a.trim().toLowerCase()
  const isDupSpot = (placeId: string, addr: string) =>
    (!!placeId && (placeId === data.primary_place_id || data.locations.some((l) => l.place_id === placeId))) ||
    (!!addr.trim() && (normAddr(addr) === normAddr(data.full_address) || data.locations.some((l) => normAddr(l.full_address) === normAddr(addr))))
  const syncSpotCount = (extras: number) => {
    const total = 1 + extras
    update('location_count', total <= 1 ? 'Just 1' : total <= 3 ? '2\u20133' : total <= 6 ? '4\u20136' : '7+')
  }
  async function findSpot() {
    if (!spotQ.trim() || !lookupOn) return
    setSpotBusy(true)
    try { setSpotHits((await searchBusinesses(spotQ)).slice(0, 4)) } catch { setSpotHits([]) }
    setSpotBusy(false)
  }
  async function addSpot(c: PlaceCandidate) {
    setSpotBusy(true)
    const p = await getBusinessPrefill(c.placeId).catch(() => null)
    setSpotBusy(false)
    const addr = p?.full_address || c.address
    if (isDupSpot(c.placeId, addr)) { setSpotQ(''); setSpotHits([]); return }
    const next = [...data.locations, { name: c.name, full_address: addr, city: p?.city ?? '', state: p?.state ?? '', zip: p?.zip ?? '', place_id: c.placeId, phone: p?.phone ?? '', hours: p?.hours ?? {} }]
    update('locations', next); syncSpotCount(next.length)
    setSpotQ(''); setSpotHits([]); setAddingSpot(false)
  }
  function addSpotTyped() {
    const a = spotQ.trim()
    if (!a || isDupSpot('', a)) return
    const next = [...data.locations, { name: '', full_address: a, city: '', state: '', zip: '', place_id: '', phone: '', hours: {} }]
    update('locations', next); syncSpotCount(next.length)
    setSpotQ(''); setSpotHits([]); setAddingSpot(false)
  }
  function removeSpot(i: number) {
    const next = data.locations.filter((_, x) => x !== i)
    update('locations', next); syncSpotCount(next.length)
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

          {/* One tap, and most of what follows is already answered. */}
          {lookupOn && data.biz_name.trim().length > 1 && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={findOnGoogle}
                disabled={finding || scanning}
                className="w-full rounded-[12px] border text-[13px] font-semibold disabled:opacity-50"
                style={{ borderColor: '#d8ece4', background: '#f0faf6', color: '#2e9a78', minHeight: 50 }}
              >
                {finding || scanning ? 'Looking you up...' : 'Find us on Google'}
              </button>

              {matches && matches.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="text-[12px]" style={{ color: '#98989d' }}>Which one is you?</div>
                  {matches.map((m) => (
                    <button
                      key={m.placeId}
                      type="button"
                      onClick={() => usePlace(m)}
                      className="w-full text-left rounded-[12px] border bg-white px-3 py-2.5"
                      style={{ borderColor: '#e6e6ea', minHeight: 52 }}
                    >
                      <div className="text-[14px] font-semibold" style={{ color: '#1d1d1f' }}>{m.name}</div>
                      <div className="text-[12px]" style={{ color: '#98989d' }}>{m.address}</div>
                    </button>
                  ))}
                </div>
              )}

              {pickedNote && (
                <div className="mt-2 text-[12px] leading-relaxed" style={{ color: '#6e6e73' }}>{pickedNote}</div>
              )}
            </div>
          )}
        </div>

        {/* the location roster lives at the TOP (owner call 2026-08-27): the main
            spot fills from the Google pick above, or gets typed right here when
            Google cannot find the place. Extra spots stack below it. */}
        {(
          <div>
            <FieldLabel>Locations</FieldLabel>
            <div className="flex flex-col gap-2">
              {!data.full_address.trim() && (
                <Input
                  value={data.full_address}
                  onChange={(v) => update('full_address', v)}
                  placeholder="Your address, if Google cannot find you"
                />
              )}
              {data.full_address.trim() && (
                <div className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 bg-white" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.05)' }}>
                  <MapPin size={16} color="#2e9a78" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate" style={{ color: '#1d1d1f' }}>{data.biz_name.trim() || 'Main spot'}</div>
                    <div className="text-[12px] truncate" style={{ color: '#6e6e73' }}>{data.full_address}</div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide flex-shrink-0" style={{ color: '#2e9a78' }}>Main</span>
                </div>
              )}
              {data.locations.map((l, i) => (
                <div key={`${l.place_id || l.full_address}-${i}`} className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 bg-white" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.05)' }}>
                  <MapPin size={16} color="#6e6e73" />
                  <div className="min-w-0 flex-1">
                    {l.name.trim() ? <div className="text-[13px] font-semibold truncate" style={{ color: '#1d1d1f' }}>{l.name}</div> : null}
                    <div className="text-[12px] truncate" style={{ color: '#6e6e73' }}>{l.full_address}</div>
                  </div>
                  <button type="button" aria-label={`Remove ${l.name || l.full_address}`} onClick={() => removeSpot(i)} className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, border: 'none', background: 'none', color: '#aeaeb2', cursor: 'pointer' }}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.full_address.trim() && (addingSpot ? (
          <div className="rounded-[14px] p-3" style={{ background: '#f0faf6', boxShadow: 'inset 0 0 0 1.5px rgba(74,189,152,0.4)' }}>
            <div className="flex gap-2">
              <Input value={spotQ} onChange={setSpotQ} placeholder="Search the next spot" />
              <button
                type="button" onClick={findSpot} disabled={!spotQ.trim() || spotBusy || !lookupOn}
                className="flex-shrink-0 px-4 rounded-[12px] text-[13px] font-semibold text-white disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, #4abd98, #2e9a78)', cursor: 'pointer' }}
              >
                {spotBusy ? 'Finding...' : 'Find'}
              </button>
            </div>
            {spotHits.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-2">
                {spotHits.map((c) => (
                  <button key={c.placeId} type="button" onClick={() => addSpot(c)} className="text-left rounded-[10px] px-3 py-2.5 bg-white" style={{ border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'pointer' }}>
                    <div className="text-[13px] font-medium" style={{ color: '#1d1d1f' }}>{c.name}</div>
                    <div className="text-[11.5px]" style={{ color: '#6e6e73' }}>{c.address}</div>
                  </button>
                ))}
              </div>
            )}
            {spotQ.trim() && !spotBusy && (
              <button type="button" onClick={addSpotTyped} className="mt-2 text-[12.5px] font-semibold" style={{ background: 'none', border: 'none', color: '#0f6e56', cursor: 'pointer', padding: 0 }}>
                Add {'\u201C'}{spotQ.trim()}{'\u201D'} as written
              </button>
            )}
            <div>
              <button type="button" onClick={() => { setAddingSpot(false); setSpotQ(''); setSpotHits([]) }} className="mt-2 text-[12.5px] font-semibold" style={{ background: 'none', border: 'none', color: '#6e6e73', cursor: 'pointer', padding: 0 }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button" onClick={() => setAddingSpot(true)}
            className="w-full text-[13px] font-bold"
            style={{ minHeight: 48, borderRadius: 14, border: '1.5px dashed rgba(74,189,152,0.6)', background: '#fff', color: '#0f6e56', cursor: 'pointer' }}
          >
            + Add another location
          </button>
        ))}

        {/* Website + optional scan — paste a site and we draft the story,
            menu, and specials so the owner is not typing it from scratch. */}
        <div>
          <FieldLabel>Website <span style={{ color: '#98989d', fontWeight: 400 }}>(optional)</span></FieldLabel>
          <div className="flex gap-2">
            <Input
              value={data.website}
              onChange={(v) => update('website', v)}
              placeholder="https://yourbusiness.com"
              type="url"
            />
            <button
              type="button"
              onClick={() => runScan(data.website)}
              disabled={!data.website.trim() || scanning}
              className="flex-shrink-0 px-4 rounded-[12px] text-[13px] font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #4abd98, #2e9a78)', boxShadow: '0 4px 14px rgba(74,189,152,0.30)' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'linear-gradient(135deg, #3fae8b, #23815f)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #4abd98, #2e9a78)' }}
            >
              {scanning ? 'Reading...' : 'Scan site'}
            </button>
          </div>
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

        <div>
          <FieldLabel>Phone number</FieldLabel>
          <Input
            value={data.phone}
            onChange={(v) => update('phone', v)}
            placeholder="(555) 123-4567"
            type="tel"
          />
        </div>

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
