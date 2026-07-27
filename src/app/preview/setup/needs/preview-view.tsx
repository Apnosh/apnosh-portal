'use client'

/**
 * The pickers exist so the thing that actually needs reviewing is reviewable: how the list CHANGES
 * between lanes. "What it takes" is only worth building if the free lane and the done-for-you lane
 * of the same card visibly ask for different things — otherwise the lane picker above it is a price
 * list, not a choice. Switching lanes here is the check.
 */

import React, { useState } from 'react'
import { C, SPACE, RADIUS, TEXT } from '@/components/mvp/tokens'
import { WhatItTakes } from '@/components/mvp/what-it-takes'
import { SETUP_CARDS } from '@/lib/campaigns/setup/cards'
import type { SetupLaneKind } from '@/lib/campaigns/setup/types'

/** A pretend vault: one thing we genuinely checked, one thing the owner simply told us. Both are
 *  on screen so the solid tick and the open ring can be compared side by side, which is the one
 *  distinction this component exists to carry. */
const HELD = ['GOOGLE', 'NAP']
const HELD_HOLLOW = ['NAP']

const LANE_LABEL: Record<SetupLaneKind, string> = {
  diy: 'I do it myself',
  ai: 'With Apnosh AI',
  team: 'Done for you',
}

export default function PreviewNeedsView() {
  const [cardId, setCardId] = useState(SETUP_CARDS[0].id)
  const [lane, setLane] = useState<SetupLaneKind>('diy')
  const [vault, setVault] = useState(true)

  const card = SETUP_CARDS.find((c) => c.id === cardId) ?? SETUP_CARDS[0]
  const chosen = card.lanes.find((l) => l.kind === lane) ?? card.lanes[0]

  return (
    <div style={{ padding: `${SPACE.lg}px 14px 40px` }}>
      <Picker
        label="Card"
        options={SETUP_CARDS.map((c) => ({ value: c.id, label: c.id }))}
        value={cardId}
        onChange={setCardId}
      />
      <Picker
        label="Version"
        options={card.lanes.map((l) => ({ value: l.kind, label: LANE_LABEL[l.kind] }))}
        value={chosen.kind}
        onChange={(v) => setLane(v as SetupLaneKind)}
      />
      <Picker
        label="Vault"
        options={[{ value: 'on', label: 'Returning client' }, { value: 'off', label: 'Brand new' }]}
        value={vault ? 'on' : 'off'}
        onChange={(v) => setVault(v === 'on')}
      />

      <div style={{ marginTop: SPACE.xxl }}>
        <WhatItTakes
          needs={chosen.needs ?? []}
          held={vault ? HELD : []}
          heldHollow={vault ? HELD_HOLLOW : []}
        />
      </div>

      {!chosen.needs?.length && (
        <div style={{ marginTop: SPACE.lg, fontSize: TEXT.sm, color: C.mute, lineHeight: 1.5 }}>
          This lane names nothing, so nothing renders. That is the component behaving: an empty list
          is not a heading with a blank underneath it.
        </div>
      )}
    </div>
  )
}

function Picker({ label, options, value, onChange }: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.md }}>
      <span style={{ fontSize: TEXT.xs, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, width: 54, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' }}>
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              style={{
                border: `1px solid ${on ? C.green : C.line}`,
                background: on ? C.greenSoft : '#fff',
                color: on ? C.greenDk : C.mute,
                borderRadius: RADIUS.pill,
                padding: '5px 11px',
                // fontFamily, NOT the `font` shorthand: `font: 'inherit'` would reset the two lines
                // below it, because a shorthand clears every longhand it covers.
                fontFamily: 'inherit',
                fontSize: TEXT.sm,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
