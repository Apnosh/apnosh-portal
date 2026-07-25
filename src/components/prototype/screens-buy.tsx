'use client'

/**
 * THE BUY SIDE — shelf → brief → spread → cast.
 *
 * All the logic here is unchanged from the tested version. What changed is everything you
 * can see, because the first pass looked like a settings page with prices on it:
 *
 *   Campaigns are magazine covers now — full-bleed imagery, a scrim, the title and price
 *   set in Playfair over the picture. That is what a shop looks like; a stack of bordered
 *   rectangles is what a form looks like.
 *
 *   Every good leads with its image at real size. A poster is a poster. Six posts are six
 *   photographs with captions under them. Nothing is a coloured square any more.
 *
 *   Money is brass and set in the display face, wherever it appears. One accent, one job.
 */

import React, { useMemo, useState } from 'react'
import {
  BENCH, CAMPAIGNS, CRAFT_LABEL, GOODS, LANES, ONE_OFFS, PRIORITY_LABEL, STAGE_LABEL,
  STAGE_ORDER, addDays, dayLabel, daysBetween, priceFor, rankBench,
} from './data'
import type { Campaign, Craft, Good, LaneId, Priority } from './data'
import {
  Art, Avatar, Body, Btn, Card, Counter, DISPLAY, Display, Eyebrow, Rise, UI, money, type Tokens,
} from './kit'

/* ─────────────────────────────────────────────────────────────────────────────
   A pick is whoever is making one good: a lane, or a creator id.
   ──────────────────────────────────────────────────────────────────────────── */

export type Pick = LaneId | string
export type Picks = Record<string, Pick | null>

export function isLane(p: Pick): p is LaneId {
  return p === 'you' || p === 'ai' || p === 'team'
}

/** What one good costs given who is on it. The only pricing rule in the prototype. */
export function priceOf(goodId: string, pick: Pick | null): number {
  if (!pick) return 0
  const g = GOODS[goodId]
  if (pick === 'you') return 0
  if (pick === 'ai') return g.aiPrice ?? 0
  if (pick === 'team') return g.teamPrice ?? 0
  const c = BENCH.find((x) => x.id === pick)
  return c ? priceFor(c, g) : 0
}

export function makerName(pick: Pick | null): string {
  if (!pick) return ''
  if (isLane(pick)) return LANES[pick].name
  return BENCH.find((c) => c.id === pick)?.name ?? ''
}

export function makerKind(pick: Pick): 'person' | 'ai' | 'you' | 'team' {
  return pick === 'you' ? 'you' : pick === 'ai' ? 'ai' : pick === 'team' ? 'team' : 'person'
}

export function hueOf(pick: Pick | null | undefined): [string, string] | undefined {
  if (!pick || isLane(pick)) return undefined
  return BENCH.find((c) => c.id === pick)?.hue
}

/** Everyone and every lane that could make this good. */
export function optionsFor(g: Good): Pick[] {
  const out: Pick[] = []
  if (g.diy) out.push('you')
  if (g.aiPrice != null) out.push('ai')
  if (g.teamPrice != null) out.push('team')
  if (g.craft) BENCH.filter((c) => c.crafts.includes(g.craft as Craft)).forEach((c) => out.push(c.id))
  return out
}

/**
 * What a good is made out of that is not in the plan. Never an error: a designer can work
 * from photos the restaurant already has. It is a weaker version, and it says so.
 */
export function fallbacksFor(goodId: string, picks: Picks): string[] {
  const from = GOODS[goodId].from
  if (!from) return []
  const anyPresent = from.some((id) => picks[id])
  return anyPresent ? [] : from.filter((id) => GOODS[id]).slice(0, 1)
}

/* ─────────────────────────────────────────────────────────────────────────────
   1 · THE SHELF
   ──────────────────────────────────────────────────────────────────────────── */

export function Shelf({ C, onPick, onOneOff }: {
  C: Tokens; onPick: (c: Campaign) => void; onOneOff: (goodId: string) => void
}) {
  const [typed, setTyped] = useState('')
  let n = 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      <Rise i={n++}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
          <Eyebrow C={C} tone="brass">Yellow Bee Market &amp; Cafe</Eyebrow>
          <Display C={C} size={40}>What do you need?</Display>
          <Body C={C} dim size={14}>Everything below is built for your place and ready to go.</Body>
        </div>
      </Rise>

      {/* Typing IS the AI. No button, no mode to enter. Most people never touch it. */}
      <Rise i={n++}>
        <div style={{ position: 'relative' }}>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={'Or just tell me. "My patio is dead on Sundays"'}
            style={{
              border: `1px solid ${C.line}`, borderRadius: 15, padding: '15px 16px',
              fontSize: 14, fontFamily: UI, background: C.card, color: C.ink,
              outline: 'none', width: '100%', boxShadow: C.lift,
            }}
          />
        </div>
      </Rise>
      {typed.trim().length > 3 && (
        <Card C={C} live style={{ padding: 17, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Body C={C} size={14}>
            That sounds like <b style={{ color: C.ink, fontWeight: 600 }}>filling a quiet night</b>.
            I can build a plan around it, or pick something below.
          </Body>
          <Btn C={C} size="sm" onClick={() => onPick(CAMPAIGNS[0])}>Build me that plan</Btn>
        </Card>
      )}

      {STAGE_ORDER.map((stage) => {
        const camps = CAMPAIGNS.filter((c) => c.stage === stage)
        // A good can sit inside several campaigns, but it is only SOLD ALONE in one place.
        const singles = ONE_OFFS.filter((id) => GOODS[id].soloStage === stage)
        if (!camps.length) return null
        return (
          <div key={stage} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Rise i={n++}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Eyebrow C={C} tone="brass">{STAGE_LABEL[stage]}</Eyebrow>
                <span style={{ flex: 1, height: 1, background: C.line }} />
              </div>
            </Rise>

            {camps.map((c) => {
              const crew = crewOf(c)
              const from = cheapestOf(c)
              // A cover has to be a PHOTOGRAPH. Taking the first good gave "Get discovered"
              // the wireframe search-result art, which reads as a loading skeleton on the shelf.
              const cover = coverArtFor(c)
              return (
                <Rise key={c.id} i={n++}>
                  <Card C={C} onClick={() => onPick(c)} label={`${c.title}, from ${money(from)}`}>
                    {/* The cover. The colour field is the ground; the TYPE is the subject,
                        which is what makes it read as designed rather than as a failed image. */}
                    <div style={{ position: 'relative' }}>
                      <Art kind={cover} C={C} hue={c.hue} h={196} />
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(to top, rgba(6,4,8,.72) 0%, rgba(6,4,8,.12) 58%, rgba(6,4,8,0) 100%)',
                      }} />
                      <div style={{
                        position: 'absolute', left: 20, right: 20, bottom: 17,
                        display: 'flex', flexDirection: 'column', gap: 11,
                      }}>
                        <div style={{
                          fontFamily: DISPLAY, fontSize: 34, fontWeight: 500, letterSpacing: '-.028em',
                          lineHeight: 1, color: '#fff',
                        }}>{c.title}</div>
                        {/* the brass rule: the one metal, doing the one job */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                          <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.28)' }} />
                          <span style={{
                            fontFamily: UI, fontSize: 9, fontWeight: 700, letterSpacing: '.18em',
                            textTransform: 'uppercase', color: 'rgba(255,255,255,.6)',
                          }}>from</span>
                          <span style={{
                            fontFamily: DISPLAY, fontSize: 24, color: '#fff', lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                          }}>{money(from)}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                      <Body C={C} size={13.5}>{c.blurb}</Body>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {crew.map((w, i) => (
                          <React.Fragment key={w}>
                            {i > 0 && <span style={{ fontSize: 10, color: C.faint }}>→</span>}
                            <span style={{
                              fontFamily: UI, fontSize: 10.5, fontWeight: 600, padding: '4px 9px',
                              borderRadius: 99, background: C.paper2, color: C.ink2,
                            }}>{w}</span>
                          </React.Fragment>
                        ))}
                        <span style={{ fontFamily: UI, fontSize: 10.5, color: C.faint, marginLeft: 3 }}>
                          {c.goods.length} things
                        </span>
                      </div>
                    </div>
                  </Card>
                </Rise>
              )
            })}

            {/* One-offs. Deliberately small — the size of the thing IS the distinction. */}
            {singles.length > 0 && (
              <Rise i={n++}>
                <div style={{ padding: '2px 4px' }}>
                  {singles.map((id) => (
                    <button key={id} type="button" onClick={() => onOneOff(id)} className="px-tap"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        width: '100%', padding: '13px 4px', background: 'none', border: 'none',
                        borderBottom: `1px solid ${C.line2}`, cursor: 'pointer',
                        fontFamily: UI, color: C.ink, textAlign: 'left',
                      }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                        {GOODS[id].solo ?? GOODS[id].name}
                      </span>
                      <span style={{
                        fontFamily: DISPLAY, fontSize: 15, color: C.brass, flexShrink: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {money(cheapestGood(id))}{GOODS[id].monthly ? <span style={{ fontFamily: UI, fontSize: 10 }}>/mo</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </Rise>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Every campaign cover is one scene. Six small frames read as a failed image grid, and a
 *  wireframe (the search result, the listing rows) reads as a loading skeleton. */
function coverArtFor(_c: Campaign): 'cover' { return 'cover' }

function crewOf(c: Campaign): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  c.levels.standard.forEach((id) => {
    const g = GOODS[id]
    const w = g.craft ? CRAFT_LABEL[g.craft] : g.aiPrice != null ? 'Apnosh AI' : 'Our team'
    if (!seen.has(w)) { seen.add(w); out.push(w) }
  })
  return out.slice(0, 4)
}

function cheapestGood(id: string): number {
  const g = GOODS[id]
  const opts = optionsFor(g).filter((p) => p !== 'you')
  const prices = opts.map((p) => priceOf(id, p)).filter((n) => n > 0)
  return prices.length ? Math.min(...prices) : 0
}

function cheapestOf(c: Campaign): number {
  return c.levels.lean.reduce((s, id) => s + cheapestGood(id), 0)
}

/* ─────────────────────────────────────────────────────────────────────────────
   2 · THE BRIEF
   ──────────────────────────────────────────────────────────────────────────── */

export function Brief({ C, campaign, onBuild, onBack }: {
  C: Tokens; campaign: Campaign
  onBuild: (opts: { door: 'best' | 'budget'; budget: number; date: Date; note: string }) => void
  onBack: () => void
}) {
  const [door, setDoor] = useState<'best' | 'budget'>('best')
  const [budget, setBudget] = useState(400)
  const [note, setNote] = useState('')
  const [offset, setOffset] = useState(15)
  const date = addDays(new Date(), offset)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Back C={C} onClick={onBack}>All of it</Back>

      <Rise i={0}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Eyebrow C={C} tone="brass">{STAGE_LABEL[campaign.stage]}</Eyebrow>
          <Display C={C} size={36}>{campaign.title}</Display>
          <Body C={C} dim size={14}>How should I build this?</Body>
        </div>
      </Rise>

      {(['best', 'budget'] as const).map((d, i) => (
        <Rise key={d} i={i + 1}>
          <Card C={C} live={door === d} onClick={() => setDoor(d)}
            label={d === 'best' ? 'Build me the best plan' : 'I have a number'}
            style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 20, color: C.ink, lineHeight: 1.15 }}>
              {d === 'best' ? 'Build me the best plan' : 'I have a number'}
            </div>
            <Body C={C} dim size={13}>
              {d === 'best'
                ? 'Everything that works for something like this. Trim it after.'
                : 'Tell me what you can spend and I will get as close as I can inside it.'}
            </Body>
            {d === 'budget' && door === 'budget' && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
                <input type="range" min={100} max={1500} step={25} value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  style={{ flex: 1, accentColor: C.brass }} />
                <span style={{
                  fontFamily: DISPLAY, fontSize: 26, color: C.brass, minWidth: 76,
                  textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                }}>{money(budget)}</span>
              </div>
            )}
          </Card>
        </Rise>
      ))}

      <Rise i={3}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Eyebrow C={C}>{campaign.dated ? 'The only things I cannot guess' : 'Anything I should know'}</Eyebrow>

          {campaign.dated && (
            <Card C={C} style={{ padding: 17, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Body C={C} dim size={13}>When is it?</Body>
                <span style={{ fontFamily: DISPLAY, fontSize: 21, color: C.ink }}>{dayLabel(date)}</span>
              </div>
              <input type="range" min={7} max={60} value={offset}
                onChange={(e) => setOffset(Number(e.target.value))}
                style={{ width: '100%', accentColor: C.brass }} />
              <Body C={C} dim size={11.5}>
                {offset} days out. Everything is scheduled backwards from this.
              </Body>
            </Card>
          )}

          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What kind of look? Moody, bright, playful..."
            style={{
              border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 15px', fontSize: 13.5,
              fontFamily: UI, background: C.card, color: C.ink, outline: 'none', width: '100%',
            }} />
        </div>
      </Rise>

      <Rise i={4}>
        <Btn C={C} full onClick={() => onBuild({ door, budget, date, note })}>Build it</Btn>
      </Rise>
    </div>
  )
}

function Back({ C, onClick, children }: { C: Tokens; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="px-tap"
      style={{
        alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: UI, fontSize: 12.5, fontWeight: 500, color: C.ink3, padding: '4px 0',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
      <span style={{ fontSize: 14 }}>←</span>{children}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   3 · THE SPREAD — the goods, in the order they get made.
   ──────────────────────────────────────────────────────────────────────────── */

export function Spread({
  C, campaign, picks, date, onSet, onCast, onBook, onBack, level, onLevel,
}: {
  C: Tokens; campaign: Campaign; picks: Picks; date: Date; note: string
  onSet: (goodId: string, pick: Pick | null) => void
  onCast: (goodId: string) => void
  onBook: () => void; onBack: () => void
  level: 'lean' | 'standard' | 'full' | 'custom'
  onLevel: (l: 'lean' | 'standard' | 'full') => void
}) {
  const live = campaign.goods.filter((id) => picks[id])
  const total = live.reduce((s, id) => s + priceOf(id, picks[id]!), 0)
  const mine = live.filter((id) => picks[id] === 'you')
  const soft = live.filter((id) => fallbacksFor(id, picks).length)
  const out = campaign.goods.filter((id) => !picks[id])
  const ordered = [...campaign.goods].sort((a, b) => GOODS[b].lead - GOODS[a].lead)

  const nextUp = useMemo(() => {
    if (!out.length) return null
    return out.map((id) => ({ id, p: cheapestGood(id) })).sort((a, b) => a.p - b.p)[0]
  }, [out])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 92 }}>
      <Back C={C} onClick={onBack}>Change the brief</Back>

      <Rise i={0}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Eyebrow C={C} tone="brass">{live.length} things, made for you</Eyebrow>
          <Display C={C} size={36}>What you get</Display>
          <Body C={C} dim size={13.5}>
            {campaign.dated
              ? `Everything lands before ${dayLabel(date)}`
              : 'Starts as soon as you book it'}
          </Body>
        </div>
      </Rise>

      <Rise i={1}>
        <div style={{
          display: 'flex', gap: 3, background: C.paper2, borderRadius: 14, padding: 4,
          border: `1px solid ${C.line}`,
        }}>
          {(['lean', 'standard', 'full'] as const).map((l) => (
            <button key={l} type="button" onClick={() => onLevel(l)} className="px-tap"
              style={{
                flex: 1, border: 'none', cursor: 'pointer', fontFamily: UI, padding: '11px 6px',
                borderRadius: 11, fontSize: 12.5, fontWeight: level === l ? 700 : 500,
                background: level === l ? C.card : 'transparent',
                color: level === l ? C.ink : C.ink3,
                boxShadow: level === l ? C.lift : 'none',
              }}>
              {l === 'lean' ? 'Apnosh AI' : l === 'standard' ? 'Real people' : 'The best'}
            </button>
          ))}
        </div>
      </Rise>

      {ordered.map((id, idx) => {
        const g = GOODS[id]
        const pick = picks[id]
        const gone = pick ? fallbacksFor(id, picks) : []
        const lands = addDays(date, -g.lead)
        const creator = pick && !isLane(pick) ? BENCH.find((c) => c.id === pick) : null

        if (!pick) {
          return (
            <Rise key={id} i={idx + 2}>
              <button type="button" onClick={() => onSet(id, defaultPickFor(g))} className="px-tap"
                style={{
                  border: `1.5px dashed ${C.line}`, borderRadius: 18, background: 'none',
                  cursor: 'pointer', padding: '18px 18px', fontFamily: UI, color: C.ink3,
                  textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, width: '100%',
                }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 17, color: C.ink2 }}>+ {g.name}</span>
                <span style={{ fontSize: 12, lineHeight: 1.45 }}>{g.what}</span>
              </button>
            </Rise>
          )
        }

        return (
          <Rise key={id} i={idx + 2}>
            <Card C={C} style={{ borderColor: gone.length ? C.brass : C.line }}>
              <div style={{ position: 'relative' }}>
                <Art kind={g.art} C={C} hue={creator?.hue} h={158} />
                <div style={{
                  position: 'absolute', top: 13, left: 14,
                  fontFamily: UI, fontSize: 9.5, fontWeight: 700, letterSpacing: '.13em',
                  textTransform: 'uppercase', color: '#fff',
                  background: 'rgba(0,0,0,.42)', backdropFilter: 'blur(6px)',
                  padding: '5px 9px', borderRadius: 99,
                }}>
                  {campaign.dated ? dayLabel(lands) : `${g.lead} days in`}
                </div>
              </div>

              <div style={{ padding: '15px 17px 17px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 21, color: C.ink, lineHeight: 1.15 }}>
                    {g.name}
                  </div>
                  <div style={{
                    fontFamily: DISPLAY, fontSize: 21, color: priceOf(id, pick) === 0 ? C.forest : C.brass,
                    flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {priceOf(id, pick) === 0 ? 'free' : money(priceOf(id, pick))}
                    {g.monthly && priceOf(id, pick) > 0
                      ? <span style={{ fontFamily: UI, fontSize: 11 }}>/mo</span> : null}
                  </div>
                </div>

                <Body C={C} size={13}>{g.what}</Body>

                {g.from && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
                    fontFamily: UI, fontSize: 11.5, lineHeight: 1.45, padding: '8px 11px',
                    borderRadius: 10,
                    background: gone.length ? C.brassSoft : C.paper2,
                    color: gone.length ? C.brassInk : C.ink3,
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: 99, flexShrink: 0,
                      background: gone.length ? C.brass : C.forest,
                    }} />
                    {gone.length ? (
                      <>
                        Falls back to photos you already have
                        <button type="button" onClick={() => onSet(gone[0], defaultPickFor(GOODS[gone[0]]))}
                          style={{
                            border: 'none', background: 'none', cursor: 'pointer', fontFamily: UI,
                            fontSize: 11.5, fontWeight: 700, color: C.brass,
                            textDecoration: 'underline', padding: 0,
                          }}>
                          Add {GOODS[gone[0]].name.toLowerCase()}
                        </button>
                      </>
                    ) : (
                      <>Made from {GOODS[g.from.find((f) => picks[f]) ?? g.from[0]].name.toLowerCase()}</>
                    )}
                  </div>
                )}

                <button type="button" className="px-tap"
                  onClick={() => (g.craft ? onCast(id) : cycleLane(id, g, pick, onSet))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '10px 12px',
                    borderRadius: 12, border: `1px solid ${C.line}`, background: C.paper2,
                    cursor: 'pointer', fontFamily: UI, color: C.ink, textAlign: 'left',
                  }}>
                  <Avatar name={makerName(pick)} kind={makerKind(pick)} C={C} size={30} />
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{makerName(pick)}</span>
                    <span style={{ fontSize: 11, color: C.ink3, lineHeight: 1.3 }}>
                      {creator ? creator.style : isLane(pick) ? LANES[pick].note : ''}
                    </span>
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.forest, flexShrink: 0 }}>
                    {g.craft ? 'Change' : 'Swap'}
                  </span>
                </button>

                <button type="button" onClick={() => onSet(id, null)}
                  style={{
                    border: 'none', background: 'none', cursor: 'pointer', fontFamily: UI,
                    fontSize: 11, fontWeight: 500, color: C.faint, padding: 2, alignSelf: 'flex-start',
                  }}>
                  I do not want this
                </button>
              </div>
            </Card>
          </Rise>
        )
      })}

      {mine.length > 0 && (
        <Card C={C} style={{ padding: '17px 19px', display: 'flex', flexDirection: 'column', gap: 9,
          borderColor: C.forest }}>
          <Eyebrow C={C} tone="forest">
            {mine.length} {mine.length === 1 ? 'job is yours' : 'jobs are yours'}
          </Eyebrow>
          {mine.map((id) => (
            <div key={id} style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 17, color: C.ink }}>{GOODS[id].name}</span>
              <span style={{ fontFamily: UI, fontSize: 11.5, color: C.ink3 }}>
                by {dayLabel(addDays(date, -GOODS[id].lead))}
              </span>
            </div>
          ))}
          <Body C={C} dim size={12}>
            That is real work on your own night. Hand any of it over above.
          </Body>
        </Card>
      )}

      {nextUp && (
        <Card C={C} style={{ overflow: 'hidden' }}>
          <div style={{ position: 'relative' }}>
            <Art kind={GOODS[nextUp.id].art} C={C} h={104} />
            <div style={{ position: 'absolute', inset: 0, background: C.scrim }} />
            <div style={{
              position: 'absolute', left: 17, bottom: 12,
              fontFamily: UI, fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,.75)',
            }}>What {money(nextUp.p)} more buys</div>
          </div>
          <div style={{ padding: '14px 17px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 20, color: C.ink }}>{GOODS[nextUp.id].name}</div>
            <Body C={C} dim size={12.5}>{GOODS[nextUp.id].what}</Body>
            <Btn C={C} tone="quiet" size="sm"
              onClick={() => onSet(nextUp.id, defaultPickFor(GOODS[nextUp.id]))}>Add it</Btn>
          </div>
        </Card>
      )}

      {/* The bill. Glass, so the spread keeps moving behind it. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
        display: 'flex', justifyContent: 'center', padding: '0 16px 16px',
        pointerEvents: 'none',
      }}>
        <div style={{
          width: '100%', maxWidth: 428, pointerEvents: 'auto',
          background: C.glass, backdropFilter: 'blur(26px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(26px) saturate(1.8)',
          border: `1px solid ${C.line}`, borderRadius: 18, padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
          boxShadow: C.liftHi,
        }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Counter value={total} style={{
              fontFamily: DISPLAY, fontSize: 30, color: C.ink, lineHeight: 1,
            }} />
            <span style={{
              fontFamily: UI, fontSize: 11, color: C.ink3, lineHeight: 1.35,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {live.length === 0 ? 'Nothing in it yet'
                : `${live.length} ${live.length === 1 ? 'thing' : 'things'}`}
              {soft.length > 0 && (
                <span style={{ color: C.brass, fontWeight: 600 }}> · {soft.length} using old photos</span>
              )}
            </span>
          </div>
          <Btn C={C} onClick={onBook} disabled={live.length === 0}>Book this</Btn>
        </div>
      </div>
    </div>
  )
}

/**
 * Who we put on a piece when the owner has not chosen.
 *
 * Sorting by rating alone picked the most expensive person on the bench every time — the
 * top-rated photographer is also the priciest — and quoted $1,350 for a plan billed as
 * "we do it". A default should be a fair professional, not the ceiling.
 */
export function defaultPickFor(g: Good, level: 'lean' | 'standard' | 'full' = 'standard'): Pick {
  // The level has to choose the LANE, not just which goods are in.
  if (level === 'lean') {
    if (g.aiPrice != null) return 'ai'
    if (g.diy) return 'you'
    if (g.craft) {
      const pool = BENCH.filter((c) => c.crafts.includes(g.craft as Craft))
      const cheapest = pool.slice().sort((a, b) => a.rate - b.rate)[0]
      if (cheapest) return cheapest.id
    }
    return g.teamPrice != null ? 'team' : 'you'
  }

  if (g.craft) {
    const pool = BENCH.filter((c) => c.crafts.includes(g.craft as Craft))
    const proven = pool.filter((c) => c.rating != null)
    const from = proven.length ? proven : pool
    const best = level === 'full'
      ? from.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.jobs - a.jobs)[0]
      : from.slice().sort((a, b) => ((b.rating ?? 4.4) / b.rate) - ((a.rating ?? 4.4) / a.rate))[0]
    if (best) return best.id
  }
  if (g.teamPrice != null) return 'team'
  if (g.aiPrice != null) return 'ai'
  return 'you'
}

/** Goods no creator can make just rotate through the lanes they do have. */
function cycleLane(id: string, g: Good, pick: Pick, onSet: (goodId: string, p: Pick) => void) {
  const opts = optionsFor(g)
  const i = opts.indexOf(pick)
  onSet(id, opts[(i + 1) % opts.length])
}

/* ─────────────────────────────────────────────────────────────────────────────
   4 · THE CAST
   ──────────────────────────────────────────────────────────────────────────── */

export function Cast({ C, goodId, picks, date, note, onSet, onDone }: {
  C: Tokens; goodId: string; picks: Picks; date: Date; note: string
  onSet: (goodId: string, pick: Pick) => void; onDone: () => void
}) {
  const g = GOODS[goodId]
  const [prios, setPrios] = useState<Priority[]>(note.trim() ? ['look'] : ['proven'])
  const [style, setStyle] = useState(note)

  const daysLeft = Math.max(1, daysBetween(new Date(), addDays(date, -g.lead)))
  const ranked = useMemo(() => rankBench(g, prios, style, daysLeft), [g, prios, style, daysLeft])

  const toggle = (p: Priority) =>
    setPrios((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Back C={C} onClick={onDone}>Back to the plan</Back>

      <Rise i={0}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Eyebrow C={C} tone="brass">Casting</Eyebrow>
          <Display C={C} size={34}>Who makes {g.name.toLowerCase()}?</Display>
          <Body C={C} dim size={13.5}>
            {(() => {
              const able = ranked.filter((m) => m.creator.free + m.creator.turnaround <= daysLeft).length
              const craft = CRAFT_LABEL[g.craft as Craft].toLowerCase()
              const by = dayLabel(addDays(date, -g.lead))
              return able === ranked.length
                ? `${able} ${craft}s can make ${by}`
                : `${able} of ${ranked.length} ${craft}s can make ${by}`
            })()}
          </Body>
        </div>
      </Rise>

      <Rise i={1}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Eyebrow C={C}>What matters most here?</Eyebrow>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <button key={p} type="button" onClick={() => toggle(p)} className="px-tap"
                style={{
                  border: `1px solid ${prios.includes(p) ? C.brass : C.line}`, borderRadius: 99,
                  background: prios.includes(p) ? C.brassSoft : C.card, cursor: 'pointer',
                  fontFamily: UI, padding: '9px 15px', fontSize: 12.5,
                  fontWeight: prios.includes(p) ? 700 : 500,
                  color: prios.includes(p) ? C.brassInk : C.ink2,
                }}>
                {PRIORITY_LABEL[p].label}
              </button>
            ))}
          </div>
          {prios.includes('look') && (
            <input value={style} onChange={(e) => setStyle(e.target.value)}
              placeholder="Describe the look. Moody, bright, playful, documentary..."
              style={{
                border: `1px solid ${C.line}`, borderRadius: 13, padding: '12px 14px', fontSize: 13,
                fontFamily: UI, background: C.card, color: C.ink, outline: 'none', width: '100%',
              }} />
          )}
        </div>
      </Rise>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {optionsFor(g).filter(isLane).map((lane, i) => (
          <Rise key={lane} i={i + 2}>
            <Card C={C} live={picks[goodId] === lane} label={LANES[lane].name}
              onClick={() => { onSet(goodId, lane); onDone() }}
              style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={LANES[lane].name} kind={lane} C={C} size={32} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 17, color: C.ink }}>{LANES[lane].name}</span>
                <span style={{ fontFamily: UI, fontSize: 11.5, color: C.ink3, lineHeight: 1.35 }}>
                  {LANES[lane].note}
                </span>
              </span>
              <span style={{
                fontFamily: DISPLAY, fontSize: 19, flexShrink: 0,
                color: priceOf(goodId, lane) === 0 ? C.forest : C.brass,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {priceOf(goodId, lane) === 0 ? 'free' : money(priceOf(goodId, lane))}
              </span>
            </Card>
          </Rise>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Eyebrow C={C} tone="brass">The bench, in the order you asked for</Eyebrow>
        <span style={{ flex: 1, height: 1, background: C.line }} />
      </div>

      {ranked.map((m, i) => {
        const sel = picks[goodId] === m.creator.id
        const canMake = m.creator.free + m.creator.turnaround <= daysLeft
        return (
          <Rise key={m.creator.id} i={i + 3}>
            <Card C={C} live={sel} label={`${m.creator.name}, ${money(m.price)}`}
              onClick={() => { onSet(goodId, m.creator.id); onDone() }}
              style={{ opacity: canMake ? 1 : 0.55 }}>
              {/* Their work, four frames of it, in their own colour. */}
              <div style={{ display: 'flex', gap: 2, background: C.line2 }}>
                {[0, 1, 2, 3].map((k) => (
                  <div key={k} style={{ flex: 1, overflow: 'hidden' }}>
                    <svg viewBox="0 0 80 92" preserveAspectRatio="xMidYMid slice"
                      style={{ display: 'block', width: '100%', height: 92 }}>
                      <FrameTile hue={m.creator.hue} seed={k * 2 + i + 1} uid={`${m.creator.id}-${k}`} />
                    </svg>
                  </div>
                ))}
              </div>

              <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                  <Avatar name={m.creator.name} kind="person" C={C} size={34} />
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: DISPLAY, fontSize: 20, color: C.ink, lineHeight: 1.1 }}>
                        {m.creator.name}
                      </span>
                      {i === 0 && canMake && (
                        <span style={{
                          fontFamily: UI, fontSize: 9, fontWeight: 700, letterSpacing: '.13em',
                          textTransform: 'uppercase', color: C.brassInk, background: C.brassSoft,
                          padding: '3px 8px', borderRadius: 99,
                        }}>Best fit</span>
                      )}
                    </span>
                    <span style={{ fontFamily: UI, fontSize: 12, color: C.ink3 }}>{m.creator.style}</span>
                  </span>
                  <span style={{
                    fontFamily: DISPLAY, fontSize: 24, color: C.brass, flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{money(m.price)}</span>
                </div>

                <Body C={C} size={12.5}>{m.creator.blurb}</Body>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Fact C={C}>{m.creator.jobs} restaurant jobs</Fact>
                  <Fact C={C}>{m.creator.turnaround} day turnaround</Fact>
                  {m.creator.onTime != null
                    ? <Fact C={C}>{m.creator.onTime}% on time</Fact>
                    : <Fact C={C} muted>Not yet rated</Fact>}
                  <Fact C={C}>{m.creator.free === 0 ? 'Free now' : `Free in ${m.creator.free}d`}</Fact>
                </div>

                <div style={{
                  fontFamily: UI, fontSize: 12, fontWeight: 600, lineHeight: 1.45,
                  color: canMake ? C.forest : C.ember,
                }}>{m.why}</div>
              </div>
            </Card>
          </Rise>
        )
      })}
    </div>
  )
}

/** One sample frame for a bench card — same lit-subject treatment as the goods. */
function FrameTile({ hue, seed, uid }: { hue: [string, string]; seed: number; uid: string }) {
  const cx = 26 + ((seed * 41) % 48)
  const cy = 22 + ((seed * 59) % 44)
  return (
    <>
      <defs>
        <radialGradient id={`bt-${uid}`} cx={`${cx}%`} cy={`${cy}%`} r="80%">
          <stop offset="0%" stopColor={hue[1]} />
          <stop offset="48%" stopColor={hue[1]} stopOpacity=".5" />
          <stop offset="100%" stopColor={hue[0]} />
        </radialGradient>
      </defs>
      <rect width="80" height="92" fill={`url(#bt-${uid})`} />
      <ellipse cx={`${cx}%`} cy={`${cy - 7}%`} rx="24%" ry="8%" fill="#fff" opacity=".12" />
      <rect width="80" height="92" fill="#000" opacity=".08" />
    </>
  )
}

function Fact({ children, C, muted }: { children: React.ReactNode; C: Tokens; muted?: boolean }) {
  return (
    <span style={{
      fontFamily: UI, fontSize: 10.5, fontWeight: 600, padding: '4px 9px', borderRadius: 99,
      background: muted ? C.brassSoft : C.paper2, color: muted ? C.brassInk : C.ink3,
    }}>{children}</span>
  )
}
