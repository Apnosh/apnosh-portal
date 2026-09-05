'use client'

/**
 * The Mark (owner pick 2026-09-04, direction A): every glyph in the app sits on the same
 * object a brand mark sits on — a white circle with a soft lift — with the glyph drawn in
 * the row's colour. So a Google row and an Hours row weigh the same, and nothing in a list
 * shouts over anything else. Gradients stay for actions (buttons, the Create +, badges),
 * never for identity icons.
 */
import React from 'react'
import { hueOf, type HueKey } from './hues'

export const MARK_SHADOW = '0 1px 2px rgba(0,0,0,.05), 0 3px 10px rgba(0,0,0,.09)'

export function Mark({ hue = 'mint', size = 40, children, style, dim = false }: { hue?: HueKey; size?: number; children: React.ReactNode; style?: React.CSSProperties; /** a lane that is not available yet */ dim?: boolean }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: '#fff', boxShadow: MARK_SHADOW, color: dim ? '#aeaeb2' : hueOf(hue)[1], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}>
      {children}
    </span>
  )
}
