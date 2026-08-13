'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { type OnboardingData, type LocationDraft, CUISINES, PRICE_TIERS, FOOD_BIZ_TYPES, BIZ_TYPES } from '../data'
import { Question, Input, SingleChipGroup } from '../ui'
import { isLookupEnabled, searchBusinesses, getBusinessPrefill, type PlaceCandidate } from '@/lib/onboarding-lookup'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

/**
 * "HERE'S WHAT WE FOUND" — the screen that replaced twelve.
 *
 * Setup used to walk a restaurant through cuisine, price range, signature dishes, the menu,
 * specials, ordering platforms, address, hours, phone, the story, keywords and highlights:
 * twenty screens, about a hundred inputs. Then we added the Google + website lookup at the
 * name step, and every one of those answers started arriving before the question was asked.
 * We were interrogating owners for facts already sitting in the draft.
 *
 * So this screen states what we know and gets out of the way. Nothing is a required field.
 * Each line is a tap-to-fix, closed by default, because the common case is that the line is
 * simply right — and reading twelve correct lines is a different experience from typing them.
 *
 * The honesty rule: a line we could NOT fill says so plainly and stays skippable. We never
 * show a confident-looking blank, and we never imply Google told us something it did not.
 */
export default function StepConfirm({ data, update, nav }: Props) {
  const [openRow, setOpenRow] = useState<string | null>(null)
  const isFood = FOOD_BIZ_TYPES.includes(data.biz_type as typeof FOOD_BIZ_TYPES[number])

  /* `locations` holds the EXTRA spots; the primary one is the address rows above, so a
     single-location owner keeps an empty array and never sees a list. */
  const extras = data.locations ?? []
  const toDraft = (l: LocationDraft): LocationDraft => l
  const blankLocation = (): LocationDraft => ({
    name: '', full_address: '', city: '', state: '', zip: '', place_id: '', phone: '', hours: {},
  })
  const setExtra = (i: number, next: LocationDraft) =>
    update('locations', extras.map((l, j) => (j === i ? next : l)))

  /* GOOGLE SEARCH FOR EXTRA LOCATIONS.
   * The screen this replaced ran a Places lookup per location, and typing a second address by
   * hand is exactly the chore a chain feels most. Same helpers as the name step: search, pick,
   * and the whole draft (address, city, state, zip, phone, hours, place_id) arrives filled.
   * place_id matters beyond convenience — it is what later links this spot to its own Google
   * listing, which hand-typing can never produce. */
  const [lookupOn, setLookupOn] = useState(false)
  useEffect(() => { isLookupEnabled().then(setLookupOn) }, [])
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PlaceCandidate[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!adding || !lookupOn || q.trim().length < 3) { setHits([]); return }
    let live = true
    const t = setTimeout(async () => {
      setBusy(true)
      const found = await searchBusinesses(q.trim()).catch(() => [])
      if (live) { setHits(found.slice(0, 4)); setBusy(false) }
    }, 350)
    return () => { live = false; clearTimeout(t) }
  }, [q, adding, lookupOn])

  async function addFromGoogle(c: PlaceCandidate) {
    setBusy(true)
    const p = await getBusinessPrefill(c.placeId).catch(() => null)
    setBusy(false)
    const draft: LocationDraft = p
      ? { name: c.name, full_address: p.full_address, city: p.city, state: p.state, zip: p.zip,
          place_id: c.placeId, phone: p.phone, hours: p.hours }
      : { ...blankLocation(), name: c.name, full_address: c.address, place_id: c.placeId }
    update('locations', [...extras, draft])
    setQ(''); setHits([]); setAdding(false)
  }

  const hoursCount = Object.values(data.hours || {}).filter((h) => h && !h.closed).length
  const dishes = data.signature_items.filter((s) => s.trim()).length

  /** One fact. Shows its value, or says it is missing, and opens an editor on tap. */
  const Row = ({ id, label, value, children }: { id: string; label: string; value: string; children?: ReactNode }) => {
    const open = openRow === id
    const missing = !value
    return (
      <div style={{ borderBottom: '1px solid #f0f0f2' }}>
        <button
          type="button"
          onClick={() => setOpenRow(open ? null : id)}
          className="w-full text-left"
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 2px', background: 'none', border: 'none', minHeight: 52 }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 11.5, color: '#9aa1ab', letterSpacing: '.02em' }}>{label}</span>
            <span style={{ display: 'block', fontSize: 15, color: missing ? '#c3c7cd' : '#16181d', fontWeight: missing ? 400 : 500, marginTop: 1 }}>
              {value || 'Not set'}
            </span>
          </span>
          <span style={{ fontSize: 12.5, color: '#2f8f70', fontWeight: 600, flexShrink: 0 }}>{open ? 'Done' : missing ? 'Add' : 'Edit'}</span>
        </button>
        {open && children && <div style={{ padding: '2px 2px 16px' }}>{children}</div>}
      </div>
    )
  }

  return (
    <>
      <Question
        title="Here's what we found"
        subtitle="Tap anything that looks wrong. Nothing here is required."
      />

      <div className="mt-5">
        <Row id="name" label="BUSINESS" value={data.biz_name}>
          <Input value={data.biz_name} onChange={(v) => update('biz_name', v)} placeholder="Business name" />
        </Row>

        <Row id="type" label="TYPE" value={data.biz_type === 'Other' ? data.biz_other : data.biz_type}>
          <SingleChipGroup options={BIZ_TYPES as unknown as string[]} selected={data.biz_type} onSelect={(v) => update('biz_type', v)} />
        </Row>

        {isFood && (
          <>
            <Row id="cuisine" label="FOOD" value={data.cuisine === 'Other' ? data.cuisine_other : data.cuisine}>
              <SingleChipGroup options={CUISINES as unknown as string[]} selected={data.cuisine} onSelect={(v) => update('cuisine', v)} />
            </Row>
            <Row id="price" label="PRICE" value={data.price_range}>
              <SingleChipGroup options={PRICE_TIERS as unknown as string[]} selected={data.price_range} onSelect={(v) => update('price_range', v)} />
            </Row>
          </>
        )}

        <Row id="address" label="WHERE" value={data.full_address}>
          <Input value={data.full_address} onChange={(v) => update('full_address', v)} placeholder="Street address" />
        </Row>

        <Row id="phone" label="PHONE" value={data.phone}>
          <Input value={data.phone} onChange={(v) => update('phone', v)} placeholder="(555) 555-5555" />
        </Row>

        <Row id="site" label="WEBSITE" value={data.website}>
          <Input value={data.website} onChange={(v) => update('website', v)} placeholder="yourplace.com" />
        </Row>

        {/* MORE THAN ONE LOCATION.
            The old flow had a whole screen for this. Most owners have one place, so a screen
            asking "how many?" taxed everyone to serve a few. It lives here instead: one line
            that says how many we have, opening a small list when there genuinely are more.
            Dropping this in the redesign was a real regression — a chain could not add its
            other locations at all (caught by the owner, 2026-08-13). */}
        <Row id="locs" label="LOCATIONS" value={extras.length ? `${extras.length + 1} locations` : 'Just this one'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {extras.map((loc, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Input
                  value={loc.name}
                  onChange={(v) => setExtra(i, { ...loc, name: v })}
                  placeholder={`Location ${i + 2} name, e.g. Capitol Hill`}
                />
                <Input
                  value={loc.full_address}
                  onChange={(v) => setExtra(i, { ...loc, full_address: v })}
                  placeholder="Street address"
                />
                <button
                  type="button"
                  onClick={() => update('locations', extras.filter((_, j) => j !== i).map(toDraft))}
                  style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: '#9aa1ab', fontSize: 12.5, padding: '4px 0', minHeight: 32 }}
                >
                  Remove
                </button>
              </div>
            ))}
            {adding ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input value={q} onChange={setQ} placeholder="Search Google for the location" autoFocus />
                {busy && <span style={{ fontSize: 12, color: '#9aa1ab' }}>Searching…</span>}
                {hits.map((h) => (
                  <button
                    key={h.placeId}
                    type="button"
                    onClick={() => addFromGoogle(h)}
                    className="w-full text-left"
                    style={{ border: '1px solid #e8e9ec', background: '#fff', borderRadius: 12, padding: '10px 12px', minHeight: 52 }}
                  >
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#16181d' }}>{h.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#9aa1ab' }}>{h.address}</span>
                  </button>
                ))}
                <div style={{ display: 'flex', gap: 14 }}>
                  {/* Google does not know every spot — a brand new one may not be listed yet. */}
                  <button
                    type="button"
                    onClick={() => { update('locations', [...extras.map(toDraft), blankLocation()]); setAdding(false); setQ('') }}
                    style={{ border: 'none', background: 'none', color: '#2f8f70', fontSize: 12.5, fontWeight: 600, padding: '6px 0', minHeight: 34 }}
                  >
                    Type it instead
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdding(false); setQ(''); setHits([]) }}
                    style={{ border: 'none', background: 'none', color: '#9aa1ab', fontSize: 12.5, padding: '6px 0', minHeight: 34 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => (lookupOn ? setAdding(true) : update('locations', [...extras.map(toDraft), blankLocation()]))}
                style={{ border: '1px solid #d8ece4', background: '#f2faf7', color: '#2f8f70', fontSize: 13, fontWeight: 600, borderRadius: 12, minHeight: 44 }}
              >
                Add another location
              </button>
            )}
            <span style={{ fontSize: 11.5, color: '#9aa1ab', lineHeight: 1.5 }}>
              Just a name and address here. Hours, phone and their Google listings are easier to
              set per location from your dashboard.
            </span>
          </div>
        </Row>

        {/* Read-only counts. Editing a whole menu on a phone during setup is the kind of task
            that ends setup; these live in the dashboard where there is room to do it properly. */}
        <div style={{ display: 'flex', gap: 18, padding: '15px 2px 0', flexWrap: 'wrap' }}>
          {[
            { n: hoursCount, label: hoursCount === 1 ? 'day of hours' : 'days of hours' },
            ...(isFood ? [
              { n: data.menu_items.length, label: 'menu items' },
              { n: dishes, label: dishes === 1 ? 'signature dish' : 'signature dishes' },
            ] : []),
          ].map((x) => (
            <span key={x.label} style={{ fontSize: 12.5, color: x.n > 0 ? '#6b7280' : '#c3c7cd' }}>
              <b style={{ color: x.n > 0 ? '#16181d' : '#c3c7cd', fontWeight: 600 }}>{x.n}</b> {x.label}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#9aa1ab', marginTop: 10, lineHeight: 1.5 }}>
          Menu, hours and photos are easier to fix from your dashboard later. Nothing is lost by moving on.
        </div>
      </div>

      {nav}
    </>
  )
}
