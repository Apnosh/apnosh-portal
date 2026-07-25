'use client'

/**
 * THE RUN SIDE — relay → reckoning.
 *
 * Relay      the thing the portal has never had: jobs that WAIT on each other. One baton, one
 *            line on the owner's screen, and the piece the owner asked for — whoever is next
 *            can push back up the chain, but the call is always the owner's.
 * Reckoning  no guarantee was sold, so this has to be worth the money on its own. Where it
 *            leaked, what that means, and the one thing to change.
 *
 * The clock is a prototype affordance. Advancing a day moves whatever is genuinely unblocked,
 * which is the whole point: you can watch the dependency graph resolve instead of reading
 * about it.
 */

import React from 'react'
import { BENCH, GOODS, addDays, dayLabel, outcomeFor } from './data'
import type { FunnelStep } from './data'
import {
  Art, Avatar, Body, Btn, Card, DISPLAY, Display, Eyebrow, Rise, UI, money, type Tokens,
} from './kit'
import { hueOf, isLane, makerKind, makerName, priceOf, type Picks } from './screens-buy'

/* ─────────────────────────────────────────────────────────────────────────────
   The job states. `waiting` is the one that does not exist in the real schema
   today, and it is the reason the chain currently cannot be shown to anyone.
   ──────────────────────────────────────────────────────────────────────────── */

export type JobState = 'waiting' | 'ready' | 'doing' | 'flagged' | 'done'

export interface Job {
  goodId: string
  state: JobState
  /** Good ids this cannot start without. Empty once they are done or absent. */
  waitingOn: string[]
  /** Day index (from booking) when it started and when it landed. */
  startedDay: number | null
  doneDay: number | null
  /** Raised BY the person doing this job, ABOUT what they were handed. */
  flag: string | null
  /** Whether this job has EVER raised a question. Separate from `flag` on purpose:
   *  answering clears `flag`, and gating on that alone re-asked the same question on the
   *  very next tick while the advance button stayed disabled — a hard deadlock at 4 of 7. */
  raised: boolean
}

/** Build the chain from the plan. A dependency only counts if that piece is in the plan. */
export function buildJobs(goodIds: string[], picks: Picks): Job[] {
  const inPlan = new Set(goodIds.filter((id) => picks[id]))
  return goodIds
    .filter((id) => picks[id])
    .sort((a, b) => GOODS[b].lead - GOODS[a].lead)
    .map((id) => {
      const deps = (GOODS[id].from ?? []).filter((d) => inPlan.has(d))
      return {
        goodId: id,
        state: deps.length ? ('waiting' as JobState) : ('ready' as JobState),
        waitingOn: deps,
        startedDay: null,
        doneDay: null,
        flag: null,
        raised: false,
      }
    })
}

/**
 * Advance one day. Anything whose upstream is finished becomes ready, anything ready starts,
 * anything started long enough finishes. Deterministic, so the same plan always tells the
 * same story — a prototype that reshuffles on every click cannot be evaluated.
 */
export function tick(jobs: Job[], day: number): Job[] {
  const doneIds = new Set(jobs.filter((j) => j.state === 'done').map((j) => j.goodId))

  return jobs.map((j) => {
    if (j.state === 'done' || j.state === 'flagged') return j

    if (j.state === 'waiting') {
      const still = j.waitingOn.filter((d) => !doneIds.has(d))
      if (still.length === 0) return { ...j, state: 'ready', waitingOn: [] }
      return { ...j, waitingOn: still }
    }

    if (j.state === 'ready') return { ...j, state: 'doing', startedDay: day }

    if (j.state === 'doing') {
      const started = j.startedDay ?? day
      // The designer looks at what landed and can raise a problem with it. Exactly once,
      // on the first piece that is made from something else.
      const isDownstream = (GOODS[j.goodId].from ?? []).length > 0
      if (isDownstream && day - started >= 1 && !j.raised && j.goodId === firstDownstream(jobs)) {
        return {
          ...j,
          state: 'flagged',
          raised: true,
          flag: 'Three of the shots are too dark to build a poster on. Reshoot those, or shall I work with the other fifteen?',
        }
      }
      if (day - started >= 2) return { ...j, state: 'done', doneDay: day }
    }
    return j
  })
}

function firstDownstream(jobs: Job[]): string | null {
  const j = jobs.find((x) => (GOODS[x.goodId].from ?? []).length > 0)
  return j ? j.goodId : null
}

export function allDone(jobs: Job[]): boolean {
  return jobs.length > 0 && jobs.every((j) => j.state === 'done')
}

/* ─────────────────────────────────────────────────────────────────────────────
   5 · THE RELAY
   ──────────────────────────────────────────────────────────────────────────── */

const STATE_WORD: Record<JobState, string> = {
  waiting: 'Waiting',
  ready: 'Ready to start',
  doing: 'In progress',
  flagged: 'Needs you',
  done: 'Done',
}

export function Relay({
  C, jobs, picks, day, date, onAdvance, onResolve, onFinish,
}: {
  C: Tokens; jobs: Job[]; picks: Picks; day: number; date: Date
  onAdvance: () => void
  onResolve: (goodId: string, choice: 'proceed' | 'reshoot') => void
  onFinish: () => void
}) {
  const done = jobs.filter((j) => j.state === 'done').length
  const flagged = jobs.find((j) => j.state === 'flagged')
  const finished = allDone(jobs)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
      <Rise i={0}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Eyebrow C={C} tone="brass">Day {day} · goes live {dayLabel(date)}</Eyebrow>
          <Display C={C} size={36}>It is being made</Display>
          {/* Progress as a filled rule rather than a sentence — the one number that matters,
              readable without reading. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 99, background: C.line, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99, background: C.forest,
                width: `${Math.round((done / Math.max(1, jobs.length)) * 100)}%`,
                transition: 'width .6s cubic-bezier(.2,.8,.3,1)',
              }} />
            </div>
            <span style={{ fontFamily: UI, fontSize: 11.5, color: C.ink3, flexShrink: 0 }}>
              {done} of {jobs.length}
            </span>
          </div>
        </div>
      </Rise>

      {/* The thing the owner has to answer. Raised by the person downstream, about what they
          were handed. It goes to the owner, not back up to the photographer. */}
      {flagged && (
        <Card C={C} style={{ padding: 19, display: 'flex', flexDirection: 'column', gap: 13,
          background: C.brassSoft, borderColor: C.brass }}>
          <Eyebrow C={C} tone="brass">Needs you</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Avatar name={makerName(picks[flagged.goodId] ?? null)}
              kind={makerKind(picks[flagged.goodId] ?? 'team')} C={C} size={26} />
            <span style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: C.ink2 }}>
              {makerName(picks[flagged.goodId] ?? null)} says
            </span>
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 20, color: C.ink, lineHeight: 1.32 }}>
            {flagged.flag}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn C={C} size="sm" tone="brass" onClick={() => onResolve(flagged.goodId, 'proceed')}>
              Use the other fifteen
            </Btn>
            <Btn C={C} size="sm" tone="quiet" onClick={() => onResolve(flagged.goodId, 'reshoot')}>
              Reshoot those three
            </Btn>
          </div>
          <Body C={C} dim size={11.5}>Your call either way. A reshoot costs a day.</Body>
        </Card>
      )}

      {/* One baton, one line. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {jobs.map((j, i) => {
          const g = GOODS[j.goodId]
          const pick = picks[j.goodId]
          const last = i === jobs.length - 1
          const tone =
            j.state === 'done' ? C.forest
            : j.state === 'flagged' ? C.brass
            : j.state === 'doing' ? C.brass
            : C.line

          return (
            <div key={j.goodId} style={{ display: 'flex', gap: 11 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                flexShrink: 0, width: 18 }}>
                <span style={{ position: 'relative', marginTop: 6, flexShrink: 0, width: 11, height: 11 }}>
                  {(j.state === 'doing' || j.state === 'flagged') && (
                    <span className="px-pulse" style={{
                      position: 'absolute', inset: -5, borderRadius: 99, background: tone,
                    }} />
                  )}
                  <span style={{
                    position: 'relative', display: 'block', width: 11, height: 11, borderRadius: 99,
                    background: tone,
                  }} />
                </span>
                {!last && <span style={{ flex: 1, width: 1.5, background: C.line, minHeight: 30, marginTop: 4 }} />}
              </div>

              <div style={{ flex: 1, paddingBottom: last ? 0 : 22, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  gap: 9 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 18, color: C.ink, lineHeight: 1.2 }}>
                    {g.name}
                  </span>
                  <span style={{
                    fontFamily: UI, fontSize: 9.5, fontWeight: 700, letterSpacing: '.13em',
                    textTransform: 'uppercase', flexShrink: 0,
                    color: j.state === 'done' ? C.forest : j.state === 'flagged' ? C.brass : C.faint,
                  }}>{STATE_WORD[j.state]}</span>
                </div>

                <div style={{ fontFamily: UI, fontSize: 11.5, color: C.ink3, lineHeight: 1.45, marginTop: 3 }}>
                  {pick ? makerName(pick) : ''}
                  {j.state === 'waiting' && j.waitingOn.length > 0 && (
                    <> · cannot start until {GOODS[j.waitingOn[0]].name.toLowerCase()} lands</>
                  )}
                  {j.state === 'done' && j.doneDay != null && <> · finished day {j.doneDay}</>}
                </div>

                {/* Tinted by whoever made it, exactly as it looked in the shop. Dropping the
                    hue here made Priya's photos come back generic green, which quietly breaks
                    the one promise the artwork carries: this is THEIR work. */}
                {j.state === 'done' && (
                  <div style={{
                    marginTop: 11, borderRadius: 13, overflow: 'hidden',
                    border: `1px solid ${C.line}`, boxShadow: C.lift,
                  }}>
                    <Art kind={g.art} C={C} hue={hueOf(pick)} h={116} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {finished ? (
        <Btn C={C} full onClick={onFinish}>See what happened</Btn>
      ) : (
        <>
          <Btn C={C} full tone="quiet" onClick={onAdvance} disabled={!!flagged}>
            {flagged ? 'Answer the question above first' : 'Skip a day →'}
          </Btn>
          <div style={{
            fontFamily: UI, fontSize: 11, color: C.faint, textAlign: 'center', lineHeight: 1.45,
          }}>Prototype control. In the real thing this happens without you watching.</div>
        </>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   6 · THE RECKONING — no guarantee was sold, so the analysis has to earn its keep.
   ──────────────────────────────────────────────────────────────────────────── */

export function Reckoning({ C, jobs, picks, date, onAgain }: {
  C: Tokens; jobs: Job[]; picks: Picks; date: Date; onAgain: () => void
}) {
  const spent = jobs.reduce((s, j) => s + priceOf(j.goodId, picks[j.goodId] ?? null), 0)
  const o = outcomeFor(jobs.length)
  const top = o.steps[0].n

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Rise i={0}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Eyebrow C={C} tone="brass">{dayLabel(date)} · you spent {money(spent)}</Eyebrow>
          <Display C={C} size={38}>What actually happened</Display>
        </div>
      </Rise>

      <Card C={C} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 17 }}>
        {o.steps.map((s: FunnelStep, i: number) => {
          const leak = i === o.leak
          const pct = Math.max(3, Math.round((s.n / top) * 100))
          const prev = i > 0 ? o.steps[i - 1].n : null
          const lost = prev != null ? prev - s.n : null
          return (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 9 }}>
                <span style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 500, color: C.ink2 }}>
                  {s.label}
                  {!s.measured && (
                    <span style={{ color: C.brass, fontWeight: 700 }}> · your count</span>
                  )}
                </span>
                <span style={{
                  fontFamily: DISPLAY, fontSize: 26, lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  color: leak ? C.ember : C.ink,
                }}>{s.n.toLocaleString()}</span>
              </div>
              <div style={{ height: 9, borderRadius: 99, background: C.line2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`, borderRadius: 99,
                  background: leak ? C.ember : C.forest,
                  // a number we did not measure ourselves is drawn hollower
                  opacity: s.measured ? 1 : 0.5,
                  transition: 'width .8s cubic-bezier(.2,.8,.3,1)',
                }} />
              </div>
              {leak && lost != null && (
                <div style={{ fontFamily: UI, fontSize: 11.5, color: C.ember, fontWeight: 600 }}>
                  {lost} said yes and did not show
                </div>
              )}
            </div>
          )
        })}
      </Card>

      <Card C={C} style={{ padding: 19, display: 'flex', flexDirection: 'column', gap: 8,
        background: C.emberSoft, borderColor: C.line }}>
        <Eyebrow C={C}>Where it went wrong</Eyebrow>
        <div style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink, lineHeight: 1.35 }}>{o.why}</div>
      </Card>

      <Card C={C} style={{ padding: 19, display: 'flex', flexDirection: 'column', gap: 8,
        background: C.forestSoft, borderColor: C.forest }}>
        <Eyebrow C={C} tone="forest">One thing to change</Eyebrow>
        <div style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink, lineHeight: 1.35 }}>{o.fix}</div>
      </Card>

      <Card C={C} style={{ padding: 17, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Eyebrow C={C}>What we cannot see</Eyebrow>
        <div style={{ fontFamily: UI, fontSize: 12.5, color: C.ink2, lineHeight: 1.55 }}>
          Reach, taps and RSVPs are ours to count. Who actually walked through the door is not.
          That last number came from you. Connect your till and it stops being a guess.
        </div>
      </Card>

      <Btn C={C} full onClick={onAgain}>Run it again with the reminder moved</Btn>
    </div>
  )
}
