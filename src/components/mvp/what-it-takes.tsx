'use client'

/**
 * WHAT IT TAKES — the list of things we will need from you, shown BEFORE you buy.
 *
 * The gap this closes: today a card sells a lane, takes the money, and only then discovers the
 * owner out loud that it wants manager access on Google, thirty photos and a signature. Every one
 * of those was knowable at the moment of the decision. Showing them after payment is not a UX
 * detail — it is the difference between a price and a price plus an unknown amount of the owner's
 * Saturday.
 *
 * Three honesties this component is built to keep:
 *
 * 1. IT SUBTRACTS WHAT WE ALREADY HAVE. `held` comes from the vault, so a client who connected
 *    Google for the profile card sees it already ticked here. That is the entire promise of the
 *    requirements library made visible, and it is also the only proof that the promise is real.
 *
 * 2. A CHECK MEANS WE LOOKED. Anything resting on the owner's word renders as a HOLLOW ring, never
 *    a solid tick, and says so in words at the bottom. The whole trust model of this product is
 *    that green means verified; a screen that ticks "you told us your hours" the same way it ticks
 *    "your Google account answers our API" spends that model for nothing.
 *
 * 3. IT NEVER GROWS A REQUIREMENT OF ITS OWN. Everything here comes from the lane's `needs` ids and
 *    the library's own wording. If this screen and the intake screen could disagree about what a
 *    card asks for, the list would be decoration.
 */

import React from 'react'
import { Check } from 'lucide-react'
import { C, SPACE, RADIUS, TEXT } from './tokens'
import {
  intakeFor,
  groupOf,
  type Requirement,
  type RequirementGroup,
  type CollectionMethod,
} from '@/lib/campaigns/setup/requirements'

/** What the owner physically does, per collection method. The library says how a thing is
 *  collected; this turns that into the verb the owner recognises. */
const VERB: Record<CollectionMethod, string> = {
  confirm: 'One tap to confirm',
  choice: 'Pick from a list',
  text: 'Type it in',
  form: 'A short form',
  upload: 'Upload',
  connect: 'Connect',
  invite: 'Add us as a user',
  link: 'One thing, elsewhere',
  sign: 'Sign',
  call: 'A call with us',
  detect: 'Nothing, we check',
  prereq: 'Comes from earlier work',
}

const GROUP_TITLE: Record<RequirementGroup, string> = {
  access: 'Things to connect',
  // Not "things to confirm": most are a tap, but the photo set is an upload and the menu is a file,
  // and a heading that promises one tap above a request for thirty photos is the exact
  // after-the-fact surprise this screen exists to stop.
  facts: 'Things about your place',
  intent: 'Things to decide',
  human: 'Things to do',
}

const GROUP_ORDER: RequirementGroup[] = ['access', 'facts', 'intent', 'human']

export interface WhatItTakesProps {
  /** Requirement ids this lane needs. Prerequisites are pulled in automatically. */
  needs: readonly string[]
  /** Requirement ids the vault already holds. */
  held?: readonly string[]
  /** Held ids whose proof is only the owner's word, so their tick stays hollow. */
  heldHollow?: readonly string[]
}

export function WhatItTakes({ needs, held = [], heldHollow = [] }: WhatItTakesProps) {
  const rows = intakeFor(needs)
  if (!rows.length) return null

  const have = new Set(held)
  const hollow = new Set(heldHollow)
  // Count only what THIS lane asks for. Counting the whole vault reads as "2 of these you have
  // already given us" above a list of one, which is the screen taking credit for work the card
  // never needed — a small lie, but exactly the kind this component exists to not tell.
  const already = rows.filter((r) => have.has(r.id)).length
  const left = rows.length - already
  const anyHollow = rows.some((r) => have.has(r.id) && hollow.has(r.id))

  const byGroup = GROUP_ORDER
    .map((g) => ({ group: g, items: rows.filter((r) => groupOf(r.id) === g) }))
    .filter((x) => x.items.length > 0)

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: RADIUS.lg, padding: SPACE.xl, background: '#fff' }}>
      <div style={{ fontSize: TEXT.xl, fontWeight: 650, color: C.ink, marginBottom: SPACE.xs }}>
        What we will need from you
      </div>
      <div style={{ fontSize: TEXT.sm, color: C.mute, lineHeight: 1.5, marginBottom: SPACE.xl }}>
        {already === 0
          ? 'All of it, before we can start. Nothing here is a surprise later.'
          : left === 0
            ? 'You have already given us everything this one needs.'
            : `${already} of these you have already given us. ${left} to go.`}
      </div>

      {byGroup.map(({ group, items }) => (
        <div key={group} style={{ marginBottom: SPACE.xl }}>
          <div style={{ fontSize: TEXT.xs, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: SPACE.md }}>
            {GROUP_TITLE[group]}
          </div>
          {items.map((r) => (
            <RequirementRow key={r.id} req={r} held={have.has(r.id)} hollow={hollow.has(r.id)} />
          ))}
        </div>
      ))}

      {anyHollow && (
        <div style={{ fontSize: TEXT.xs, color: C.mute, lineHeight: 1.5, borderTop: `1px solid ${C.line}`, paddingTop: SPACE.lg }}>
          An open ring means you told us, and we took your word for it. A solid tick means we checked it ourselves.
        </div>
      )}
    </div>
  )
}

function RequirementRow({ req, held, hollow }: { req: Requirement; held: boolean; hollow: boolean }) {
  return (
    <div style={{ display: 'flex', gap: SPACE.lg, padding: `${SPACE.md}px 0`, borderBottom: `1px solid ${C.line}` }}>
      <Mark held={held} hollow={hollow} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: TEXT.md, fontWeight: 600, color: held ? C.mute : C.ink, lineHeight: 1.4 }}>
          {req.label}
        </div>
        <div style={{ fontSize: TEXT.sm, color: C.faint, lineHeight: 1.45, marginTop: 2 }}>
          {held ? req.doneWhen : VERB[req.method]}
        </div>
      </div>
    </div>
  )
}

/** Solid tick: we checked. Open ring: you told us. Empty square: still to come.
 *  These three are the whole proof ladder as a 16-pixel glyph, and they must never be collapsed. */
function Mark({ held, hollow }: { held: boolean; hollow: boolean }) {
  const size = 16
  if (!held) {
    return <span style={{ width: size, height: size, borderRadius: RADIUS.sm - 2, border: `1.5px solid ${C.line}`, flexShrink: 0, marginTop: 2 }} />
  }
  if (hollow) {
    return (
      <span style={{ width: size, height: size, borderRadius: 99, border: `1.5px solid ${C.green}`, flexShrink: 0, marginTop: 2 }} />
    )
  }
  return (
    <span style={{ width: size, height: size, borderRadius: 99, background: C.green, color: '#fff', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Check size={10} strokeWidth={3.5} />
    </span>
  )
}
