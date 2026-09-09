'use client'

/**
 * Shared apnosh-mvp detail-page kit. A small set of presentational components
 * every "Your business" (and future) detail page composes, so the whole hub
 * feels like one product. Pure inline styles + the C token map (matches
 * mvp-more.tsx / mvp-home.tsx); the `.mvp-row` press style lives in MvpShell.
 *
 * - MvpDetailHeader: back chevron + title, sits in MvpShell's header slot.
 * - MvpGroup + MvpRow: the iOS-Settings grouped card and its rows.
 *
 * Icons are passed as already-rendered nodes (e.g. icon={<Clock size={18} />})
 * so this works from server components too — lucide icons inherit the green
 * tile color via currentColor.
 */

import React from 'react'
import Link from 'next/link'
import TopRow from './top-row'
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react'
import { gradOf, tint, type HueKey } from './hues'
import { Mark } from './mark'

/* The palette, the display face and the amber trio all live in tokens.ts now, and are re-exported
 * here so the 37 files already importing them from this module keep working. One place to change a
 * colour; see that file for why the kit and the shell had drifted apart. */
export { C, DISPLAY, AMBER, AMBER_DK, AMBER_SOFT } from './tokens'
import { C, DISPLAY, AMBER_DK, AMBER_SOFT } from './tokens'



// Amber accent for "warning"/"due"/"pending" states (kept out of C so the core
// token map stays the brand greens + coral). Soft bg + dark text for pills.

export function MvpDetailHeader({ title, subtitle, backHref = '/dashboard/more' }: { title: string; subtitle?: string; backHref?: string; /** kept for callers; the row shows a chevron, not a word */ backLabel?: string }) {
  // Every screen you click INTO wears the app's top row (owner 2026-09-04): a glass back
  // chevron on the left, the screen's name in the centre, the bell on the right — then the
  // subtitle as the first line of the page. Stays in flow so the first row is never hidden.
  return (
    <div style={{ flexShrink: 0, background: '#fff' }}>
      <TopRow back={backHref} title={title} />
      {subtitle && <div style={{ fontSize: 12.5, color: C.mute, padding: '0 18px 10px', textAlign: 'center' }}>{subtitle}</div>}
    </div>
  )
}

export function MvpGroup({ title, children, hue }: { title?: string; children: React.ReactNode; /** a colour dot before the group title */ hue?: HueKey }) {
  /* Density pass (owner 2026-09-04): no hairlines between rows — the fixed mark column and the
     aligned labels say what belongs together; the group title and the gap say where a group ends. */
  return (
    <div style={{ marginBottom: 14 }}>
      {/* no card behind a plain list (owner 2026-09-04: use the whole screen) — the rows sit on the page */}
      {title && <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, letterSpacing: '.01em', color: C.mute, padding: '0 4px 4px' }}>{hue && <span style={{ width: 7, height: 7, borderRadius: 4, background: gradOf(hue) }} />}{title}</div>}
      <div>
        {children}
      </div>
    </div>
  )
}

export function MvpRow({ icon, label, sub, href, onClick, right, danger, external, hue, mark }: { icon?: React.ReactNode; label: string; sub?: string; href?: string; onClick?: () => void; right?: React.ReactNode; danger?: boolean; external?: boolean; /** portal redesign: the row's colour → a gradient glyph tile */ hue?: HueKey; /** a network's real mark leads instead of the icon (already rendered) */ mark?: React.ReactNode }) {
  const inner = (
    <>
      {mark
        ? <span style={{ width: 36, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}><span style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{mark}</span></span>
        : icon && (hue && !danger
          ? <Mark hue={hue} size={36} bare>{icon}</Mark>
          : <span style={{ width: 34, height: 34, borderRadius: 9, background: danger ? C.coralSoft : C.greenSoft, color: danger ? C.coral : C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>)}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: danger ? C.coral : C.ink, lineHeight: 1.25 }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </span>
      {right}
      {(href || onClick) && <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />}
    </>
  )
  const base: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '6px 2px 6px 2px', minHeight: 46, boxSizing: 'border-box', textDecoration: 'none', color: 'inherit', width: '100%', borderRadius: 12 }
  if (href && external) return <a href={href} target="_blank" rel="noopener noreferrer" className="mvp-row" style={base}>{inner}</a>
  if (href) return <Link href={href} className="mvp-row" style={base}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className="mvp-row" style={{ ...base, background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>{inner}</button>
  return <div style={base}>{inner}</div>
}

// Sticky bottom save bar — pins above the bottom nav inside the shell's scroll
// frame. `hint` shows a small line above the button (e.g. "Saved", or a nudge).
/**
 * THE BUTTON, as the design system defines it and not as each screen remembers it.
 *
 * design-system.html says it in one line: "Cal Sans for anything that NAMES a
 * thing: titles, card names, buttons, big numbers." Every button in the portal
 * had been written with `fontFamily: 'inherit'`, which is Inter, so the one face
 * that carries the brand was absent from the one element an owner actually
 * presses. portal.html's own `.btn` is the reference for the rest: a mint
 * gradient, a pill, and the gradient's own colour glowing under it -- not a flat
 * fill with a 14px radius.
 *
 *   primary  the thing this screen is for
 *   ghost    a real alternative, equal weight, quieter surface
 *   quiet    a way out, text only, no box competing with the primary
 */
export function MvpButton({ label, onClick, variant = 'primary', disabled, busy, full, icon, hue = 'mint' }: {
  label: string; onClick: () => void
  variant?: 'primary' | 'ghost' | 'quiet'
  disabled?: boolean; busy?: boolean; full?: boolean; icon?: React.ReactNode; hue?: HueKey
}) {
  const off = disabled || busy
  const H = variant === 'quiet' ? 40 : 50
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: full ? '100%' : undefined, height: H, padding: variant === 'quiet' ? '0 10px' : '0 22px',
    borderRadius: H / 2, border: 'none', cursor: off ? 'default' : 'pointer',
    fontFamily: DISPLAY, fontSize: variant === 'quiet' ? 13.5 : 16, fontWeight: 600,
    letterSpacing: '-.005em', transition: 'transform .12s ease, box-shadow .12s ease',
  }
  const skin: React.CSSProperties =
    variant === 'primary'
      ? off
        ? { background: C.skel, color: C.faint, boxShadow: 'none' }
        : { background: gradOf(hue), color: '#fff', boxShadow: `0 6px 16px ${tint(hue, 0.4, 1)}` }
      : variant === 'ghost'
        ? { background: off ? C.skel : '#fff', color: off ? C.faint : C.ink, boxShadow: 'none', border: `1px solid ${C.line}` }
        : { background: 'none', color: off ? C.faint : C.greenDk, boxShadow: 'none' }
  return (
    <button type="button" onClick={onClick} disabled={off} className="mvp-btn" style={{ ...base, ...skin }}>
      {busy && <Loader2 size={variant === 'quiet' ? 14 : 18} className="mvp-spin" />}{icon}{label}
    </button>
  )
}

/**
 * The same buttons, at the end of the page rather than stuck to the glass.
 *
 * A sticky bar is right when a long form can be saved at any point. It is wrong
 * here: it floated a second white plane over the bottom nav, so a screen with
 * two rows of chrome under it read as three, and it clipped the last thing the
 * owner was working on. This just ends the page.
 */
export function MvpActions({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginTop: 30, paddingTop: 20, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hint && <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', lineHeight: 1.45 }}>{hint}</div>}
      {children}
    </div>
  )
}

/**
 * The sticky save bar, for the six settings editors that want one: a long form
 * you can save from any point in it.
 *
 * It draws MvpButton so a Save reads as the same object as every other button.
 */
export function MvpSaveBar({ onClick, label = 'Save', disabled, saving, hint }: {
  onClick: () => void; label?: string; disabled?: boolean; saving?: boolean; hint?: string
}) {
  return (
    <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `0.5px solid ${C.line}`, padding: '10px 14px calc(12px + env(safe-area-inset-bottom))' }}>
      {hint && <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginBottom: 8 }}>{hint}</div>}
      <MvpButton full label={label} onClick={onClick} disabled={disabled} busy={saving} />
    </div>
  )
}

// iOS-style toggle, green when on. The canonical kit copy — editor-shell.tsx
// re-exports this so business-info editors and the new account screens share it.
export function MvpToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} style={{ position: 'relative', width: 46, height: 28, borderRadius: 99, border: 'none', background: on ? C.green : '#d6d6db', flexShrink: 0, cursor: 'pointer', transition: 'background .15s', padding: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: 2, width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'transform .15s', transform: on ? 'translateX(18px)' : 'translateX(0)' }} />
    </button>
  )
}

// Small status chip (billing/agreement/subscription statuses). One pill across
// every account surface instead of per-page statusConfig maps.
export type PillTone = 'good' | 'warn' | 'bad' | 'neutral'
export function MvpPill({ tone = 'neutral', label, dot }: { tone?: PillTone; label: string; dot?: boolean }) {
  const map: Record<PillTone, { bg: string; fg: string }> = {
    good: { bg: C.greenSoft, fg: C.greenDk },
    warn: { bg: AMBER_SOFT, fg: AMBER_DK },
    bad: { bg: C.coralSoft, fg: C.coral },
    neutral: { bg: '#eef0ef', fg: C.mute },
  }
  const t = map[tone]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: t.bg, color: t.fg, borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: t.fg, display: 'inline-block' }} />}
      {label}
    </span>
  )
}

// Connection chip for hub headers (Site, Analytics, Google listing, ...). Green
// dot when on. Sits in a flex row of one or more above the first group.
export function StatusPill({ label, on, onText = 'Connected', offText = 'Not connected' }: { label: string; on: boolean; onText?: string; offText?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '10px 12px', minWidth: 0 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: on ? C.green : C.faint, flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.mute }}>{on ? onText : offText}</span>
      </span>
    </div>
  )
}

// Uppercase section caption above a snapshot or group.
export function MvpSectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: C.mute, padding: '2px 6px 8px' }}>{children}</div>
}

// Snapshot stat tile: a number, a label, an optional up/down delta. Zero values
// dim to 0.5 so an empty channel reads calm, not broken.
export function MvpStat({ icon, value, label, delta }: { icon?: React.ReactNode; value: string; label: string; delta?: { dir: 'up' | 'down' | 'flat'; text: string } }) {
  const zero = !value || value === '0' || value === '—' || value === '$0' || value === '0%'
  const dColor = delta?.dir === 'up' ? C.greenDk : delta?.dir === 'down' ? C.coral : C.faint
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '10px 6px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, opacity: zero ? 0.5 : 1, minWidth: 0 }}>
      {icon && <span style={{ color: C.green, display: 'flex' }}>{icon}</span>}
      <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 500, lineHeight: 1.05, color: C.ink }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.2 }}>{label}</div>
      {delta && <div style={{ fontSize: 10, fontWeight: 700, color: dColor }}>{delta.text}</div>}
    </div>
  )
}

// Grid wrapper for MvpStat tiles (caps at 4 across).
export function MvpStatGrid({ children }: { children: React.ReactNode }) {
  const n = React.Children.count(children)
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, n) || 1},1fr)`, gap: 8 }}>{children}</div>
}

// Not-connected / empty state. Dashed green halo card with an optional icon.
export function MvpEmpty({ icon, title, text }: { icon?: React.ReactNode; title?: string; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: 'linear-gradient(180deg,#fbfdfc,#f5f9f7)', border: '1px dashed rgba(74,189,152,0.4)', borderRadius: 18, padding: '26px 20px', marginBottom: 14 }}>
      {icon && <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 2px 10px rgba(74,189,152,0.18)' }}>{icon}</div>}
      {title && <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{title}</div>}
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, maxWidth: 240 }}>{text}</div>
    </div>
  )
}

/**
 * The waiting state. Grey blocks in the shape of what is about to arrive.
 *
 * WHY THIS EXISTS. Every screen that loads writes its own version of this, and five of them are
 * already the same three lines character for character (settings, settings/notifications, both
 * agreements pages, billing): same grey, same corner, same beat, retyped. Nobody chose to have
 * five copies. It is what happens when there is nothing to import. The next time the grey or the
 * beat changes it would have to change in five places, and it would change in one.
 *
 * `heights` is the only thing a page genuinely picks, and it is worth picking: pass the heights of
 * the cards the page is about to render, so the wait is the shape of the answer rather than a
 * generic bar. A page that shows three cards passes three numbers.
 *
 * THE KEYFRAMES TRAVEL WITH IT, on purpose. This gets used from loading.tsx files, which render
 * on their own outside MvpShell, so a rule that lived in the shell would quietly do nothing there
 * and the skeleton would sit still. Repeating an identical @keyframes costs nothing. The
 * reduced-motion line is here for the same reason: the shell guards its other animations, and a
 * pulse an owner cannot turn off is the one that makes people feel sick.
 */
export function MvpSkeleton({ heights }: { heights: number[] }) {
  return (
    <>
      {heights.map((h, i) => (
        <div key={i} className="mvp-skel" style={{ height: h, background: C.skel, borderRadius: 16, marginBottom: 14 }} />
      ))}
      <style>{`.mvp-skel{animation:mvpPulse 1.2s ease-in-out infinite}@keyframes mvpPulse{0%,100%{opacity:1}50%{opacity:.55}}@media(prefers-reduced-motion:reduce){.mvp-skel{animation:none}}`}</style>
    </>
  )
}

/**
 * The one line that answers "did that save?".
 *
 * WHY THIS EXISTS. Every form in the app writes its own answer, and every one picks its own green,
 * its own red, its own corner and its own weight. An owner should learn one shape, not twenty, and
 * the shape should say which of the two things happened before they read a word of it: green means
 * it saved, coral means it did not. Both colours come from C, so changing the palette changes every
 * form at once instead of the ones somebody remembers.
 *
 * The words stay with the caller. That is deliberate: the sentence has to go through T() where it
 * is written, and only the page knows what actually failed.
 *
 * aria-live, because a result that only exists as a colour is not a result for everyone.
 */
export function MvpMsg({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: ok ? C.greenSoft : C.coralSoft, color: ok ? C.greenDk : C.coral, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>
      {text}
    </div>
  )
}
