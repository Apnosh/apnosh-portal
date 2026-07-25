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
import { Art, Avatar, Btn, Card, Label, money, type Tokens } from './kit'
import { isLane, makerKind, makerName, priceOf, type Picks } from './screens-buy'

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 23, fontWeight: 770, letterSpacing: '-.03em', lineHeight: 1.1 }}>
          It is being made
        </div>
        <div style={{ fontSize: 13, color: C.ink3 }}>
          Day {day} · {done} of {jobs.length} finished · goes live {dayLabel(date)}
        </div>
      </div>

      {/* The thing the owner has to answer. Raised by the person downstream, about what they
          were handed. It goes to the owner, not back up to the photographer. */}
      {flagged && (
        <Card C={C} style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 10,
          background: C.goldWash, borderColor: C.gold }}>
          <Label C={C}>Needs you</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Avatar name={makerName(picks[flagged.goodId] ?? null)}
              kind={makerKind(picks[flagged.goodId] ?? 'team')} C={C} size={26} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {makerName(picks[flagged.goodId] ?? null)} says
            </span>
          </div>
          <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{flagged.flag}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn C={C} size="sm" onClick={() => onResolve(flagged.goodId, 'proceed')}>
              Use the other fifteen
            </Btn>
            <Btn C={C} size="sm" tone="quiet" onClick={() => onResolve(flagged.goodId, 'reshoot')}>
              Reshoot those three
            </Btn>
          </div>
          <div style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.4 }}>
            Your call either way. A reshoot costs a day.
          </div>
        </Card>
      )}

      {/* One baton, one line. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {jobs.map((j, i) => {
          const g = GOODS[j.goodId]
          const pick = picks[j.goodId]
          const last = i === jobs.length - 1
          const tone =
            j.state === 'done' ? C.green
            : j.state === 'flagged' ? C.gold
            : j.state === 'doing' ? C.sky
            : C.line

          return (
            <div key={j.goodId} style={{ display: 'flex', gap: 11 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                flexShrink: 0, width: 18 }}>
                <span style={{
                  width: 11, height: 11, borderRadius: 99, marginTop: 5, flexShrink: 0,
                  background: tone,
                  boxShadow: j.state === 'doing' || j.state === 'flagged'
                    ? `0 0 0 4px ${j.state === 'flagged' ? C.goldWash : C.greenWash}` : 'none',
                }} />
                {!last && <span style={{ flex: 1, width: 1.5, background: C.line, minHeight: 26 }} />}
              </div>

              <div style={{ flex: 1, paddingBottom: last ? 0 : 16, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  gap: 9 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 720, lineHeight: 1.3 }}>{g.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 790, letterSpacing: '.05em', textTransform: 'uppercase',
                    color: j.state === 'done' ? C.greenDk : j.state === 'flagged' ? C.gold : C.faint,
                    flexShrink: 0,
                  }}>{STATE_WORD[j.state]}</span>
                </div>

                <div style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.4, marginTop: 1 }}>
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
                  <div style={{ marginTop: 8, display: 'inline-flex', padding: 8, borderRadius: 10,
                    background: C.line2 }}>
                    <Art kind={g.art} C={C}
                      hue={pick && !isLane(pick) ? BENCH.find((c) => c.id === pick)?.hue : undefined} />
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
          <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', lineHeight: 1.4 }}>
            Prototype control. In the real thing this happens without you watching.
          </div>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 23, fontWeight: 770, letterSpacing: '-.03em', lineHeight: 1.1 }}>
          What actually happened
        </div>
        <div style={{ fontSize: 13, color: C.ink3 }}>
          {dayLabel(date)} · you spent {money(spent)}
        </div>
      </div>

      <Card C={C} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {o.steps.map((s: FunnelStep, i: number) => {
          const leak = i === o.leak
          const pct = Math.max(3, Math.round((s.n / top) * 100))
          const prev = i > 0 ? o.steps[i - 1].n : null
          const lost = prev != null ? prev - s.n : null
          return (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 9 }}>
                <span style={{ fontSize: 12.5, fontWeight: 660, color: C.ink2 }}>
                  {s.label}
                  {!s.measured && (
                    <span style={{ fontSize: 10.5, color: C.gold, fontWeight: 700 }}> · your count</span>
                  )}
                </span>
                <span style={{ fontSize: 15, fontWeight: 780, fontVariantNumeric: 'tabular-nums',
                  color: leak ? C.rust : C.ink }}>{s.n.toLocaleString()}</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: C.line2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`, borderRadius: 99,
                  background: leak ? C.rust : C.green,
                  // dashed fill = a number we did not measure ourselves
                  opacity: s.measured ? 1 : 0.55,
                }} />
              </div>
              {leak && lost != null && (
                <div style={{ fontSize: 11, color: C.rust, fontWeight: 660 }}>
                  {lost} said yes and did not show
                </div>
              )}
            </div>
          )
        })}
      </Card>

      <Card C={C} style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 5,
        background: C.rustWash, borderColor: C.line }}>
        <Label C={C}>Where it went wrong</Label>
        <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{o.why}</div>
      </Card>

      <Card C={C} style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 5,
        background: C.greenWash, borderColor: C.line }}>
        <Label C={C}>One thing to change</Label>
        <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{o.fix}</div>
      </Card>

      <Card C={C} style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Label C={C}>What we cannot see</Label>
        <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}>
          Reach, taps and RSVPs are ours to count. Who actually walked through the door is not.
          That last number came from you. Connect your till and it stops being a guess.
        </div>
      </Card>

      <Btn C={C} full onClick={onAgain}>Run it again with the reminder moved</Btn>
    </div>
  )
}
