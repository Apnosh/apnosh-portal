'use client'

/**
 * The chain — the visualization, and the reason the four steps are drawn as a flow at all.
 *
 * WHAT IS REAL HERE, AND WHAT IS NOT.
 * The obvious thing to draw is a dependency graph (this shoot feeds that poster feeds those posts).
 * For `nights` that graph does not exist: only sms-program and reminder-send declare deps
 * (SEND_DEPS), both are held on the send rail, and no nights service sets needsShoot. Drawing a rich
 * web of arrows here would be decoration dressed as data, which is the exact failure this codebase
 * keeps designing against.
 *
 * What IS real is the order the steps depend on each other in, and it carries one fact an owner
 * genuinely needs: A STEP CAN ONLY PASS ON WHAT IT WAS GIVEN. Telling people about a night with no
 * draw is telling them about nothing. Getting them to come back when nobody heard about it in the
 * first place is a step with no input. So the connector between two steps is drawn SOLID when the
 * step above it has something to hand down, and BROKEN when it does not, and the break is the whole
 * point of the picture: it shows you where the plan stops working, which a list of line items never
 * does.
 *
 * Real service-level dependencies still get drawn, as a tie under the step that owns them, because
 * where they exist they are true.
 */

import type { PlanLine } from './slow-nights-data'

export interface ChainStep {
  stage: string
  n: number
  name: string
  col: string
  /** What this step hands to the next one. Shown on a live connector. */
  gives: string
  /** What breaks when this step is empty. Shown on a broken connector. */
  breaks: string
}

export function chainStateOf(steps: readonly ChainStep[], lines: PlanLine[]) {
  return steps.map((s) => {
    const mine = lines.filter((l) => l.stage === s.stage)
    const live = mine.filter((l) => !l.held)
    return { step: s, live, held: mine.filter((l) => l.held), empty: live.length === 0 }
  })
}

/** The one sentence the whole picture is for. Null when the chain is unbroken. */
export function chainVerdict(steps: readonly ChainStep[], lines: PlanLine[]): string | null {
  const state = chainStateOf(steps, lines)
  const firstBreak = state.find((s) => s.empty)
  if (!firstBreak) return null
  return firstBreak.step.breaks
}

const LINE = '#e6e6ea'
const MUTE = '#6e6e73'
const FAINT = '#aeaeb2'
const AMBER_DK = '#8a5a0c'

/**
 * One rung of the chain: the step, then the connector down to the next one.
 * The connector is the argument, so it carries words, not just a line.
 */
export function ChainRung({
  state,
  last,
  nextEmpty,
  onOpen,
  dim,
}: {
  state: ReturnType<typeof chainStateOf>[number]
  last: boolean
  nextEmpty: boolean
  onOpen: () => void
  dim: boolean
}) {
  const { step, live, held, empty } = state
  // The connector below this step is broken when THIS step has nothing to hand down.
  const broken = empty

  return (
    <div style={{ display: 'flex', gap: 12, opacity: dim ? 0.32 : 1, transition: 'opacity .18s' }}>
      {/* the spine */}
      <div style={{ flex: '0 0 auto', width: 28, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onOpen}
          data-step={step.stage}
          aria-label={step.name}
          style={{
            width: 28,
            height: 28,
            borderRadius: 99,
            border: empty ? `1.5px dashed ${FAINT}` : 'none',
            background: empty ? 'transparent' : step.col,
            color: empty ? FAINT : '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            font: 'inherit',
            lineHeight: 1,
          }}
        >
          {step.n}
        </button>
        {!last && (
          <div
            aria-hidden
            style={{
              flex: 1,
              width: broken ? 0 : 2,
              minHeight: 34,
              marginTop: 6,
              marginBottom: 6,
              background: broken ? 'none' : `linear-gradient(${step.col}, ${nextEmpty ? FAINT : LINE})`,
              borderLeft: broken ? `2px dashed ${FAINT}` : 'none',
              borderRadius: 2,
            }}
          />
        )}
      </div>

      {/* the step */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 14 }}>
        <button
          type="button"
          onClick={onOpen}
          data-step={step.stage}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: 0,
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              display: 'block',
              fontFamily: "'Cal Sans','Inter',sans-serif",
              fontSize: 16,
              fontWeight: 600,
              color: empty ? MUTE : '#1d1d1f',
              lineHeight: 1.2,
              marginTop: 3,
            }}
          >
            {step.name}
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 4,
              fontSize: 12.5,
              color: empty ? AMBER_DK : MUTE,
              lineHeight: 1.5,
            }}
          >
            {empty ? 'Nothing here yet.' : live.map((l) => l.name).join(' + ')}
          </span>
          {held.length > 0 && (
            <span
              style={{
                display: 'inline-block',
                marginTop: 6,
                padding: '2px 7px',
                borderRadius: 99,
                background: '#fbf0da',
                color: AMBER_DK,
                fontSize: 10.5,
                fontWeight: 700,
              }}
            >
              {held.length} not yet
            </span>
          )}
        </button>

        {/* the connector's argument, in words */}
        {!last && (
          <div
            style={{
              marginTop: 10,
              fontSize: 11.5,
              lineHeight: 1.45,
              color: broken ? AMBER_DK : FAINT,
              fontWeight: broken ? 600 : 400,
            }}
          >
            {broken ? step.breaks : step.gives}
          </div>
        )}
      </div>
    </div>
  )
}
