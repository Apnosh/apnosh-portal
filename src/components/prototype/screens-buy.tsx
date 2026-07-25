'use client'

/**
 * THE BUY SIDE — shelf → brief → spread → cast.
 *
 * Shelf     outcomes in funnel order. Campaigns are big cards that show their crew; one-offs
 *           are thin rows underneath. The size of the card IS the campaign/one-off distinction,
 *           so nothing needs a label explaining it.
 * Brief     the two doors (build me the best / here is my number) plus the only things we
 *           genuinely cannot guess.
 * Spread    the goods, in the order they get made, running up to the date. Casting lives on
 *           each good. Price is the sum of who is on it.
 * Cast      the bench, ranked by what the owner just said matters. Real names, real rates.
 */

import React, { useMemo, useState } from 'react'
import {
  BENCH, CAMPAIGNS, CRAFT_LABEL, GOODS, LANES, ONE_OFFS, PRIORITY_LABEL, STAGE_LABEL,
  STAGE_ORDER, addDays, dayLabel, daysBetween, priceFor, rankBench,
} from './data'
import type { Campaign, Craft, Good, LaneId, Priority } from './data'
import { Art, Avatar, Btn, Card, Label, money, type Tokens } from './kit'

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 25, fontWeight: 780, letterSpacing: '-.03em', lineHeight: 1.08 }}>
          What do you need?
        </div>
        <div style={{ fontSize: 13.5, color: C.ink3 }}>Built for your place, ready to go</div>
      </div>

      {/* Typing IS the AI. No button, no mode to enter. Most people never touch it. */}
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={'Or just tell me. "My patio is dead on Sundays"'}
        style={{
          border: `1px solid ${C.line}`, borderRadius: 13, padding: '13px 14px', fontSize: 13.5,
          fontFamily: 'inherit', background: C.line2, color: C.ink, outline: 'none', width: '100%',
        }}
      />
      {typed.trim().length > 3 && (
        <Card C={C} live style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.45 }}>
            That sounds like <b style={{ color: C.ink }}>filling a quiet night</b>. I can build a plan
            around it, or pick something below.
          </div>
          <Btn C={C} size="sm" onClick={() => onPick(CAMPAIGNS[0])}>Build me that plan</Btn>
        </Card>
      )}

      {STAGE_ORDER.map((stage) => {
        const camps = CAMPAIGNS.filter((c) => c.stage === stage)
        // A good can sit inside several campaigns, but it is only SOLD ALONE in one place.
        // Deriving this from campaign membership listed the poster twice and reviews twice.
        const singles = ONE_OFFS.filter((id) => GOODS[id].soloStage === stage)
        if (!camps.length) return null
        return (
          <div key={stage} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Label C={C}>{STAGE_LABEL[stage]}</Label>

            {camps.map((c) => {
              const crew = crewOf(c)
              const from = cheapestOf(c)
              return (
                <Card key={c.id} C={C} onClick={() => onPick(c)} label={`${c.title}, from ${money(from)}`}
                  style={{ padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 16.5, fontWeight: 740, letterSpacing: '-.02em' }}>{c.title}</span>
                    <span style={{ fontSize: 13, fontWeight: 750, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      from {money(from)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.45 }}>{c.blurb}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    {crew.map((w, i) => (
                      <React.Fragment key={w}>
                        {i > 0 && <span style={{ fontSize: 10, color: C.faint }}>→</span>}
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                          background: C.greenWash, color: C.greenDk,
                        }}>{w}</span>
                      </React.Fragment>
                    ))}
                    <span style={{ fontSize: 10.5, color: C.faint, marginLeft: 2 }}>
                      {c.goods.length} things
                    </span>
                  </div>
                </Card>
              )
            })}

            {/* One-offs. Thin rows, and the word "Just" does the work. */}
            {singles.length > 0 && (
              <div style={{ padding: '0 3px' }}>
                {singles.map((id) => (
                  <button key={id} type="button" onClick={() => onOneOff(id)}
                    style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
                      width: '100%', padding: '10px 2px', background: 'none', border: 'none',
                      borderBottom: `1px solid ${C.line2}`, cursor: 'pointer', fontFamily: 'inherit',
                      color: C.ink, textAlign: 'left',
                    }}>
                    <span style={{ fontSize: 13, fontWeight: 640 }}>{GOODS[id].solo ?? GOODS[id].name}</span>
                    <span style={{ fontSize: 12, fontWeight: 720, color: C.ink3, flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums' }}>
                      {money(cheapestGood(id))}{GOODS[id].monthly ? '/mo' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

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
   2 · THE BRIEF — two doors, and only the questions we cannot answer ourselves.
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Btn C={C} tone="ghost" size="sm" onClick={onBack}>← All of it</Btn>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 24, fontWeight: 770, letterSpacing: '-.03em', lineHeight: 1.1 }}>
          {campaign.title}
        </div>
        <div style={{ fontSize: 13.5, color: C.ink3 }}>How should I build this?</div>
      </div>

      {(['best', 'budget'] as const).map((d) => (
        <Card key={d} C={C} live={door === d} onClick={() => setDoor(d)}
          style={{
            padding: 15, display: 'flex', flexDirection: 'column', gap: 4,
            background: door === d ? C.greenWash : C.card,
          }}>
          <div style={{ fontSize: 15, fontWeight: 730 }}>
            {d === 'best' ? 'Build me the best plan' : 'I have a number'}
          </div>
          <div style={{ fontSize: 12, color: C.ink3, lineHeight: 1.45 }}>
            {d === 'best'
              ? 'Everything that works for something like this. Trim it after.'
              : 'Tell me what you can spend and I will get as close as I can inside it.'}
          </div>
          {d === 'budget' && door === 'budget' && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 11 }}>
              <input type="range" min={100} max={1500} step={25} value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                style={{ flex: 1, accentColor: C.green }} />
              <span style={{ fontSize: 17, fontWeight: 780, fontVariantNumeric: 'tabular-nums',
                minWidth: 62, textAlign: 'right' }}>{money(budget)}</span>
            </div>
          )}
        </Card>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <Label C={C}>{campaign.dated ? 'The only things I cannot guess' : 'Anything I should know'}</Label>

        {campaign.dated && (
          <Card C={C} style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: C.ink3 }}>When is it?</span>
              <span style={{ fontSize: 14.5, fontWeight: 740 }}>{dayLabel(date)}</span>
            </div>
            <input type="range" min={7} max={60} value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              style={{ width: '100%', accentColor: C.green }} />
            <div style={{ fontSize: 11.5, color: C.faint }}>
              {offset} days out. Everything is scheduled backwards from this.
            </div>
          </Card>
        )}

        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="What kind of look? Moody, bright, playful..."
          style={{
            border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 13px', fontSize: 13,
            fontFamily: 'inherit', background: C.card, color: C.ink, outline: 'none', width: '100%',
          }} />
      </div>

      <Btn C={C} full onClick={() => onBuild({ door, budget, date, note })}>Build it</Btn>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   3 · THE SPREAD — the goods, in the order they get made.
   ──────────────────────────────────────────────────────────────────────────── */

export function Spread({
  C, campaign, picks, date, note, onSet, onCast, onBook, onBack, level, onLevel,
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

  // Ordered by when each thing has to land, so the spread reads as a run-up to the date.
  const ordered = [...campaign.goods].sort((a, b) => GOODS[b].lead - GOODS[a].lead)

  const nextUp = useMemo(() => {
    if (!out.length) return null
    return out
      .map((id) => ({ id, p: cheapestGood(id) }))
      .sort((a, b) => a.p - b.p)[0]
  }, [out])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Btn C={C} tone="ghost" size="sm" onClick={onBack}>← Change the brief</Btn>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 23, fontWeight: 770, letterSpacing: '-.03em', lineHeight: 1.1 }}>
          What you get
        </div>
        <div style={{ fontSize: 13, color: C.ink3 }}>
          {campaign.dated ? `Everything lands before ${dayLabel(date)}` : 'Starts as soon as you book it'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 3, background: C.line2, borderRadius: 12, padding: 3 }}>
        {(['lean', 'standard', 'full'] as const).map((l) => (
          <button key={l} type="button" onClick={() => onLevel(l)}
            style={{
              flex: 1, border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '9px 6px',
              borderRadius: 9, fontSize: 12.5, fontWeight: level === l ? 750 : 650,
              background: level === l ? C.card : 'transparent',
              color: level === l ? C.ink : C.ink3,
              boxShadow: level === l ? '0 1px 2px rgba(0,0,0,.07)' : 'none',
            }}>
            {l === 'lean' ? 'Apnosh AI' : l === 'standard' ? 'Real people' : 'The best'}
          </button>
        ))}
      </div>

      {ordered.map((id) => {
        const g = GOODS[id]
        const pick = picks[id]
        const gone = pick ? fallbacksFor(id, picks) : []
        const lands = addDays(date, -g.lead)
        const creator = pick && !isLane(pick) ? BENCH.find((c) => c.id === pick) : null

        if (!pick) {
          return (
            <button key={id} type="button" onClick={() => onSet(id, defaultPickFor(g))}
              style={{
                border: `1.5px dashed ${C.line}`, borderRadius: 15, background: 'none', cursor: 'pointer',
                padding: '13px 14px', fontFamily: 'inherit', color: C.ink3, textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
              <span style={{ fontSize: 13.5, fontWeight: 720 }}>+ {g.name}</span>
              <span style={{ fontSize: 11.5, lineHeight: 1.35 }}>{g.what}</span>
            </button>
          )
        }

        return (
          <Card key={id} C={C} style={{ overflow: 'hidden', borderColor: gone.length ? C.gold : C.line }}>
            <div style={{
              background: C.line2, padding: '13px 14px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', minHeight: 96,
            }}>
              <Art kind={g.art} C={C} hue={creator?.hue} />
            </div>

            <div style={{ padding: '11px 14px 13px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 9 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 780, letterSpacing: '.06em',
                    textTransform: 'uppercase', color: C.faint }}>
                    {campaign.dated ? dayLabel(lands) : `${g.lead} days in`}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 740, letterSpacing: '-.015em', lineHeight: 1.25 }}>
                    {g.name}
                  </span>
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 780, flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums' }}>
                  {priceOf(id, pick) === 0 ? 'free' : money(priceOf(id, pick))}
                  {g.monthly && priceOf(id, pick) > 0 ? <span style={{ fontSize: 11 }}>/mo</span> : null}
                </span>
              </div>

              <div style={{ fontSize: 12, color: C.ink2, lineHeight: 1.4 }}>{g.what}</div>

              {/* What it is made out of. A missing source is a downgrade, never a failure. */}
              {g.from && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  fontSize: 11, lineHeight: 1.4, padding: '5px 8px', borderRadius: 8,
                  background: gone.length ? C.goldWash : C.line2,
                  color: gone.length ? C.gold : C.ink3, fontWeight: gone.length ? 640 : 500,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: 99, flexShrink: 0,
                    background: gone.length ? C.gold : C.green,
                  }} />
                  {gone.length ? (
                    <>
                      Falls back to photos you already have
                      <button type="button" onClick={() => onSet(gone[0], defaultPickFor(GOODS[gone[0]]))}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 11, fontWeight: 800, color: C.gold, textDecoration: 'underline', padding: 0,
                        }}>
                        Add {GOODS[gone[0]].name.toLowerCase()}
                      </button>
                    </>
                  ) : (
                    <>Made from {GOODS[g.from.find((f) => picks[f]) ?? g.from[0]].name.toLowerCase()}</>
                  )}
                </div>
              )}

              {/* Who is making it. Tap to open the bench. */}
              <button type="button" onClick={() => (g.craft ? onCast(id) : cycleLane(id, g, pick, onSet))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 9px',
                  borderRadius: 10, border: `1px solid ${C.line}`, background: C.card, cursor: 'pointer',
                  fontFamily: 'inherit', color: C.ink, textAlign: 'left',
                }}>
                <Avatar name={makerName(pick)} kind={makerKind(pick)} C={C} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.25 }}>{makerName(pick)}</span>
                  <span style={{ fontSize: 10.5, color: C.ink3, lineHeight: 1.3 }}>
                    {creator ? creator.style : isLane(pick) ? LANES[pick].note : ''}
                  </span>
                </span>
                <span style={{ fontSize: 11, fontWeight: 760, color: C.green, flexShrink: 0 }}>
                  {g.craft ? 'Change' : 'Swap'}
                </span>
              </button>

              <button type="button" onClick={() => onSet(id, null)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 10.5, fontWeight: 700, color: C.faint, padding: 2, alignSelf: 'flex-start',
                }}>
                I do not want this
              </button>
            </div>
          </Card>
        )
      })}

      {/* What the owner quietly signed up for. The cheap level is only cheap if they do it. */}
      {mine.length > 0 && (
        <Card C={C} style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label C={C}>{mine.length} {mine.length === 1 ? 'job is yours' : 'jobs are yours'}</Label>
          {mine.map((id) => (
            <div key={id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{GOODS[id].name}</span>
              <span style={{ fontSize: 11.5, color: C.ink3 }}>
                by {dayLabel(addDays(date, -GOODS[id].lead))}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.4, marginTop: 2 }}>
            That is real work on your own night. Hand any of it over above.
          </div>
        </Card>
      )}

      {/* What the next money buys, named. Not "upgrade". */}
      {nextUp && (
        <Card C={C} style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 6,
          background: C.greenWash, borderColor: C.line }}>
          <Label C={C}>What {money(nextUp.p)} more buys</Label>
          <div style={{ fontSize: 13.5, fontWeight: 720 }}>{GOODS[nextUp.id].name}</div>
          <div style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.4 }}>{GOODS[nextUp.id].what}</div>
          <Btn C={C} tone="quiet" size="sm" onClick={() => onSet(nextUp.id, defaultPickFor(GOODS[nextUp.id]))}>
            Add it
          </Btn>
        </Card>
      )}

      <div style={{
        position: 'sticky', bottom: 0, background: C.card, border: `1px solid ${C.line}`,
        borderRadius: 16, padding: '13px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 13, boxShadow: '0 -2px 20px rgba(0,0,0,.06)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 24, fontWeight: 790, letterSpacing: '-.035em', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums' }}>{money(total)}</span>
          <span style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.35 }}>
            {live.length === 0 ? 'Nothing in it yet'
              : `${live.length} ${live.length === 1 ? 'thing' : 'things'} made for you`}
            {soft.length > 0 && (
              <span style={{ color: C.gold, fontWeight: 640 }}> · {soft.length} using old photos</span>
            )}
          </span>
        </div>
        <Btn C={C} onClick={onBook} disabled={live.length === 0}>Book this</Btn>
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
 *
 * So: proven people only (someone unrated is a deliberate choice, never a default we make
 * on the owner's behalf), then best rating per dollar among them. The owner can always
 * trade up or down on the casting screen, where the whole bench is visible.
 */
export function defaultPickFor(g: Good, level: 'lean' | 'standard' | 'full' = 'standard'): Pick {
  // The level has to choose the LANE, not just which goods are in. Picking the goods but
  // always casting a real creator made "you do most" cost $595, which is not a cheap lane
  // by any reading.
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
    // full = the ceiling, which is a legitimate thing to want and to charge for.
    // standard = best rating per dollar among people who have actually been rated.
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
   4 · THE CAST — the bench, ranked by what the owner says matters for THIS piece.
   ──────────────────────────────────────────────────────────────────────────── */

export function Cast({ C, goodId, picks, date, note, onSet, onDone }: {
  C: Tokens; goodId: string; picks: Picks; date: Date; note: string
  onSet: (goodId: string, pick: Pick) => void; onDone: () => void
}) {
  const g = GOODS[goodId]
  const [prios, setPrios] = useState<Priority[]>(note.trim() ? ['look'] : ['proven'])
  const [style, setStyle] = useState(note)

  const daysLeft = Math.max(1, daysBetween(new Date(), addDays(date, -g.lead)))
  const ranked = useMemo(
    () => rankBench(g, prios, style, daysLeft),
    [g, prios, style, daysLeft],
  )

  const toggle = (p: Priority) =>
    setPrios((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
      <Btn C={C} tone="ghost" size="sm" onClick={onDone}>← Back to the plan</Btn>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 22, fontWeight: 770, letterSpacing: '-.03em', lineHeight: 1.12 }}>
          Who makes {g.name.toLowerCase()}?
        </div>
        {/* Saying "5 photographers free before Tuesday" when three of them cannot make
            Tuesday is a small lie that the list immediately contradicts. Count the ones
            who can, and say what the rest are. */}
        <div style={{ fontSize: 13, color: C.ink3 }}>
          {(() => {
            const able = ranked.filter((m) => m.creator.free + m.creator.turnaround <= daysLeft).length
            const craft = CRAFT_LABEL[g.craft as Craft].toLowerCase()
            if (able === ranked.length) return `${able} ${craft}s can make ${dayLabel(addDays(date, -g.lead))}`
            return `${able} of ${ranked.length} ${craft}s can make ${dayLabel(addDays(date, -g.lead))}`
          })()}
        </div>
      </div>

      {/* The AI's real job: not choosing for them, but ordering the bench by their answer. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <Label C={C}>What matters most here?</Label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
            <button key={p} type="button" onClick={() => toggle(p)}
              style={{
                border: `1px solid ${prios.includes(p) ? C.green : C.line}`, borderRadius: 99,
                background: prios.includes(p) ? C.greenWash : C.card, cursor: 'pointer',
                fontFamily: 'inherit', padding: '7px 13px', fontSize: 12.5,
                fontWeight: prios.includes(p) ? 740 : 640,
                color: prios.includes(p) ? C.greenDk : C.ink2,
              }}>
              {PRIORITY_LABEL[p].label}
            </button>
          ))}
        </div>
        {prios.includes('look') && (
          <input value={style} onChange={(e) => setStyle(e.target.value)}
            placeholder="Describe the look. Moody, bright, playful, documentary..."
            style={{
              border: `1px solid ${C.line}`, borderRadius: 11, padding: '10px 12px', fontSize: 12.5,
              fontFamily: 'inherit', background: C.card, color: C.ink, outline: 'none', width: '100%',
            }} />
        )}
      </div>

      {/* Lanes first: taking it yourself is always a legitimate way to spend nothing. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {optionsFor(g).filter(isLane).map((lane) => (
          <Card key={lane} C={C} live={picks[goodId] === lane}
            onClick={() => { onSet(goodId, lane); onDone() }}
            style={{ padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={LANES[lane].name} kind={lane} C={C} size={26} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 710 }}>{LANES[lane].name}</span>
              <span style={{ fontSize: 11, color: C.ink3, lineHeight: 1.3 }}>{LANES[lane].note}</span>
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 760, flexShrink: 0,
              fontVariantNumeric: 'tabular-nums' }}>
              {priceOf(goodId, lane) === 0 ? 'free' : money(priceOf(goodId, lane))}
            </span>
          </Card>
        ))}
      </div>

      <Label C={C}>The bench, in the order you asked for</Label>

      {ranked.map((m, i) => {
        const sel = picks[goodId] === m.creator.id
        const canMake = m.creator.free + m.creator.turnaround <= daysLeft
        return (
          <Card key={m.creator.id} C={C} live={sel}
            onClick={() => { onSet(goodId, m.creator.id); onDone() }}
            style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 9,
              opacity: canMake ? 1 : 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={m.creator.name} kind="person" C={C} size={30} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 740 }}>{m.creator.name}</span>
                  {i === 0 && canMake && (
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em',
                      textTransform: 'uppercase', color: C.greenDk, background: C.greenWash,
                      padding: '2px 6px', borderRadius: 99 }}>Best fit</span>
                  )}
                </span>
                <span style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.3 }}>{m.creator.style}</span>
              </span>
              <span style={{ fontSize: 15.5, fontWeight: 780, flexShrink: 0,
                fontVariantNumeric: 'tabular-nums' }}>{money(m.price)}</span>
            </div>

            {/* Their work. Two hues per person so the bench reads as visibly different people. */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2, 3].map((k) => (
                <span key={k} style={{
                  flex: 1, height: 38, borderRadius: 6,
                  background: `linear-gradient(${125 + k * 22}deg, ${m.creator.hue[0]}, ${m.creator.hue[1]})`,
                  opacity: 1 - k * 0.14,
                }} />
              ))}
            </div>

            <div style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.4 }}>{m.creator.blurb}</div>

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <Fact C={C}>{m.creator.jobs} restaurant jobs</Fact>
              <Fact C={C}>{m.creator.turnaround} day turnaround</Fact>
              {m.creator.onTime != null
                ? <Fact C={C}>{m.creator.onTime}% on time</Fact>
                : <Fact C={C} muted>Not yet rated</Fact>}
              <Fact C={C}>{m.creator.free === 0 ? 'Free now' : `Free in ${m.creator.free}d`}</Fact>
            </div>

            <div style={{
              fontSize: 11.5, fontWeight: 650, lineHeight: 1.4,
              color: canMake ? C.greenDk : C.rust,
            }}>
              {m.why}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function Fact({ children, C, muted }: { children: React.ReactNode; C: Tokens; muted?: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 680, padding: '3px 7px', borderRadius: 99,
      background: muted ? C.goldWash : C.line2, color: muted ? C.gold : C.ink2,
    }}>{children}</span>
  )
}
