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
/** One fact. Shows its value, or says it is missing, and opens an editor on tap.
 *  MODULE scope on purpose: defined inside the screen, this was a NEW component
 *  type on every keystroke, so React remounted the whole row — the open editor's
 *  input lost focus and the phone keyboard closed after every letter typed
 *  (owner hit this on the address, 2026-08-17). Hoisting it keeps the type
 *  stable, so the input lives across renders and the keyboard stays up. */
function Row({ id, label, value, openRow, setOpenRow, children }: {
  id: string; label: string; value: string
  openRow: string | null; setOpenRow: (id: string | null) => void
  children?: ReactNode
}) {
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
          <span style={{ display: 'block', fontSize: 11.5, color: '#98989d', letterSpacing: '.02em' }}>{label}</span>
          <span style={{ display: 'block', fontSize: 15, color: missing ? '#c7c7cc' : '#1d1d1f', fontWeight: missing ? 400 : 500, marginTop: 1 }}>
            {value || 'Not set'}
          </span>
        </span>
        <span style={{ fontSize: 12.5, color: '#2e9a78', fontWeight: 600, flexShrink: 0 }}>{open ? 'Done' : missing ? 'Add' : 'Edit'}</span>
      </button>
      {open && children && <div style={{ padding: '2px 2px 16px' }}>{children}</div>}
    </div>
  )
}

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

  /* Only worth showing once a scan or search actually FOUND things: a fresh
   * manual signup seeing a wall of "Not set" reads as broken, not helpful. */
  const foundAny = !!(data.biz_type || data.cuisine || hoursCount > 0 || dishes > 0)
  if (!foundAny) return null

  return (
    <>
      <div className="mt-1">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6e6e73' }}>What we found</div>
        <p className="text-[13px] mt-1" style={{ color: '#6e6e73' }}>Tap anything that looks wrong.</p>
      </div>

      <div className="mt-5">
        <Row openRow={openRow} setOpenRow={setOpenRow} id="name" label="BUSINESS" value={data.biz_name}>
          <Input value={data.biz_name} onChange={(v) => update('biz_name', v)} placeholder="Business name" />
        </Row>

        <Row openRow={openRow} setOpenRow={setOpenRow} id="type" label="TYPE" value={data.biz_type === 'Other' ? data.biz_other : data.biz_type}>
          <SingleChipGroup options={BIZ_TYPES as unknown as string[]} selected={data.biz_type} onSelect={(v) => update('biz_type', v)} />
        </Row>

        {isFood && (
          <>
            <Row openRow={openRow} setOpenRow={setOpenRow} id="cuisine" label="FOOD" value={data.cuisine === 'Other' ? data.cuisine_other : data.cuisine}>
              <SingleChipGroup options={CUISINES as unknown as string[]} selected={data.cuisine} onSelect={(v) => update('cuisine', v)} />
            </Row>
            <Row openRow={openRow} setOpenRow={setOpenRow} id="price" label="PRICE" value={data.price_range}>
              <SingleChipGroup options={PRICE_TIERS as unknown as string[]} selected={data.price_range} onSelect={(v) => update('price_range', v)} />
            </Row>
          </>
        )}

        {/* ONE PLACE READS AS A FIELD; SEVERAL MUST READ AS A LIST.
            The card first showed the main address under "WHERE" and hid the others behind a
            collapsed line, so a two-location business still looked like one place (owner,
            2026-08-13). Past the first location the address stops being an attribute of the
            business and becomes a set of places, so it is drawn as one — numbered, each with
            its own name and address, the main one included rather than floating above. */}
        {extras.length === 0 ? (
          <>
            <Row openRow={openRow} setOpenRow={setOpenRow} id="address" label="WHERE" value={data.full_address}>
              <Input value={data.full_address} onChange={(v) => update('full_address', v)} placeholder="Street address" />
            </Row>
            <Row openRow={openRow} setOpenRow={setOpenRow} id="phone" label="PHONE" value={data.phone}>
              <Input value={data.phone} onChange={(v) => update('phone', v)} placeholder="(555) 555-5555" />
            </Row>
          </>
        ) : (
          <div style={{ borderBottom: '1px solid #f0f0f2', padding: '14px 2px 16px' }}>
            <div style={{ fontSize: 11.5, color: '#98989d', marginBottom: 10 }}>
              {extras.length + 1} LOCATIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[{ name: data.biz_name, addr: data.full_address, primary: true },
                ...extras.map((l) => ({ name: l.name, addr: l.full_address, primary: false }))]
                .map((loc, i) => (
                  <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', border: '1px solid #e6e6ea', borderRadius: 12, padding: '11px 12px', background: '#fff' }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 99, background: '#f0faf6', color: '#2e9a78', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: loc.name ? '#1d1d1f' : '#c7c7cc' }}>
                        {loc.name || `Location ${i + 1}`}
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: loc.addr ? '#6e6e73' : '#c7c7cc', marginTop: 1 }}>
                        {loc.addr || 'No address yet'}
                      </span>
                      {loc.primary && (
                        <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 700, color: '#2e9a78', background: '#f0faf6', borderRadius: 99, padding: '2px 7px', marginTop: 6 }}>
                          MAIN
                        </span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <Row openRow={openRow} setOpenRow={setOpenRow} id="site" label="WEBSITE" value={data.website}>
          <Input value={data.website} onChange={(v) => update('website', v)} placeholder="yourplace.com" />
        </Row>

        {/* MORE THAN ONE LOCATION.
            The old flow had a whole screen for this. Most owners have one place, so a screen
            asking "how many?" taxed everyone to serve a few. It lives here instead: one line
            that says how many we have, opening a small list when there genuinely are more.
            Dropping this in the redesign was a real regression — a chain could not add its
            other locations at all (caught by the owner, 2026-08-13). */}
        <Row openRow={openRow} setOpenRow={setOpenRow} id="locs" label={extras.length ? "EDIT LOCATIONS" : "LOCATIONS"} value={extras.length ? `${extras.length + 1} places` : 'Just this one'}>
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
                  style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: '#98989d', fontSize: 12.5, padding: '4px 0', minHeight: 32 }}
                >
                  Remove
                </button>
              </div>
            ))}
            {adding ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input value={q} onChange={setQ} placeholder="Search Google for the location" autoFocus />
                {busy && <span style={{ fontSize: 12, color: '#98989d' }}>Searching…</span>}
                {hits.map((h) => (
                  <button
                    key={h.placeId}
                    type="button"
                    onClick={() => addFromGoogle(h)}
                    className="w-full text-left"
                    style={{ border: '1px solid #e6e6ea', background: '#fff', borderRadius: 12, padding: '10px 12px', minHeight: 52 }}
                  >
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#1d1d1f' }}>{h.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#98989d' }}>{h.address}</span>
                  </button>
                ))}
                <div style={{ display: 'flex', gap: 14 }}>
                  {/* Google does not know every spot — a brand new one may not be listed yet. */}
                  <button
                    type="button"
                    onClick={() => { update('locations', [...extras.map(toDraft), blankLocation()]); setAdding(false); setQ('') }}
                    style={{ border: 'none', background: 'none', color: '#2e9a78', fontSize: 12.5, fontWeight: 600, padding: '6px 0', minHeight: 34 }}
                  >
                    Type it instead
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdding(false); setQ(''); setHits([]) }}
                    style={{ border: 'none', background: 'none', color: '#98989d', fontSize: 12.5, padding: '6px 0', minHeight: 34 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => (lookupOn ? setAdding(true) : update('locations', [...extras.map(toDraft), blankLocation()]))}
                style={{ border: '1px solid #d8ece4', background: '#f0faf6', color: '#2e9a78', fontSize: 13, fontWeight: 600, borderRadius: 12, minHeight: 44 }}
              >
                Add another location
              </button>
            )}
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
            <span key={x.label} style={{ fontSize: 12.5, color: x.n > 0 ? '#6e6e73' : '#c7c7cc' }}>
              <b style={{ color: x.n > 0 ? '#1d1d1f' : '#c7c7cc', fontWeight: 600 }}>{x.n}</b> {x.label}
            </span>
          ))}
        </div>
      </div>

      {nav}
    </>
  )
}
