'use client'

/**
 * THE BOARDS — a live, custom display for every request type (Request Desk).
 *
 * The Drafting Table idea, carried to all twelve asks: the thing you are ordering sits
 * pinned to the desk and VISIBLY BECOMES your answers. Pick "Delivery apps" and the menu
 * refolds into a phone. Pick "Bold and loud" and the logo plate changes voice. Type the
 * subject and it lands in the email's subject line. Nothing on the board is decoration:
 * every mark is an answer the owner gave, and unanswered parts wait as sketch ghosts.
 *
 * Pure presentation: props in (typeId + answers), pixels out. Desk palette only, no
 * external assets. The shared overlays every type gets: the date tape (the timing answer,
 * RUSH-toned for "This week") and the sticky note (their extra notes).
 */

import type { CSSProperties, ReactNode } from 'react'
import { DESK } from '@/components/campaigns/desk/ui'
import type { RequestAnswers, RequestTypeId } from '@/lib/requests/catalog'

const clip = (s: string | undefined, n: number) => {
  const v = (s ?? '').trim()
  return v.length > n ? `${v.slice(0, n)}...` : v
}

/* ── shared primitives ─────────────────────────────────────────────────────────────── */

function Tape({ children, tone, style }: { children: ReactNode; tone?: 'rush' | 'plain'; style?: CSSProperties }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', transform: 'rotate(-3deg)',
      background: tone === 'rush' ? DESK.amberWash : 'rgba(228,224,214,0.85)',
      border: `1px solid ${tone === 'rush' ? DESK.amberLine : DESK.line}`,
      color: tone === 'rush' ? DESK.amber : DESK.ink2,
      fontFamily: DESK.mono, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase',
      borderRadius: 2, ...style,
    }}>{children}</span>
  )
}

function Sticky({ children }: { children: ReactNode }) {
  return (
    <div style={{
      position: 'absolute', right: 8, bottom: 8, maxWidth: 130, padding: '7px 9px',
      background: '#FBF3D9', border: '1px solid #EADFB8', borderRadius: 2,
      transform: 'rotate(2deg)', boxShadow: '0 2px 5px rgba(22,33,28,0.10)',
      fontFamily: DESK.body, fontSize: 10, color: DESK.ink2, lineHeight: 1.35,
    }}>{children}</div>
  )
}

function Ghost({ w = '70%', h = 8, style }: { w?: string | number; h?: number; style?: CSSProperties }) {
  return <div style={{ width: w, height: h, borderRadius: 4, border: `1.5px dashed ${DESK.line}`, ...style }} />
}

function InkBar({ w = '70%', h = 8, dark, style }: { w?: string | number; h?: number; dark?: boolean; style?: CSSProperties }) {
  return <div className="dk-ink" style={{ width: w, height: h, borderRadius: 4, background: dark ? DESK.ink : DESK.ink2, opacity: dark ? 0.85 : 0.35, ...style }} />
}

/** The pinned artboard every type renders inside: paper, tape, the shared overlays. */
function Board({ children, when, notes, badge }: { children: ReactNode; when?: string; notes?: string; badge?: string }) {
  const rush = when === 'This week'
  return (
    <div style={{ position: 'relative', padding: '14px 0 4px' }}>
      <div style={{
        position: 'relative', background: '#FFFFFF', border: `1px solid ${DESK.line}`,
        borderRadius: 6, minHeight: 190, boxShadow: '0 10px 24px rgba(22,33,28,0.09)',
        padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', overflow: 'hidden',
      }}>
        <span aria-hidden style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%) rotate(-2deg)', width: 74, height: 18, background: 'rgba(228,224,214,0.9)', border: `1px solid ${DESK.line}`, borderRadius: 2 }} />
        {badge && <Tape style={{ position: 'absolute', top: 8, left: 8 }}>{badge}</Tape>}
        {when && <Tape tone={rush ? 'rush' : 'plain'} style={{ position: 'absolute', top: 8, right: 8, transform: 'rotate(3deg)' }}>{rush ? 'Rush · this week' : when}</Tape>}
        {children}
        {notes ? <Sticky>{clip(notes, 60)}</Sticky> : null}
      </div>
    </div>
  )
}

/* ── per-type boards ───────────────────────────────────────────────────────────────── */

function GraphicBoard({ a }: { a: RequestAnswers }) {
  /* The frame takes the SHAPE of where it will live; the words ink onto it. */
  const where = a.where
  const dims = where === 'Print' ? { w: 120, h: 160 } : where === 'Website' ? { w: 210, h: 110 } : where === 'Email' ? { w: 130, h: 170 } : { w: 150, h: 150 }
  return (
    <div style={{ position: 'relative' }}>
      {where === 'More than one' && <div style={{ position: 'absolute', inset: -6, transform: 'rotate(-4deg)', background: '#fff', border: `1px solid ${DESK.line}`, borderRadius: 4 }} />}
      <div style={{ position: 'relative', width: dims.w, height: dims.h, border: `1.5px solid ${DESK.ink2}`, borderRadius: 4, background: DESK.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 12 }}>
        {a.what
          ? <div className="dk-ink" style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 14, color: DESK.ink, textAlign: 'center', lineHeight: 1.2 }}>{clip(a.what, 40)}</div>
          : <><Ghost w="80%" h={12} /><Ghost w="55%" /></>}
        {a.words ? <div className="dk-ink" style={{ fontFamily: DESK.body, fontSize: 10, color: DESK.ink2, textAlign: 'center' }}>{clip(a.words, 60)}</div> : <Ghost w="65%" h={6} />}
        {where && <Tape style={{ position: 'absolute', bottom: -9 }}>{where}</Tape>}
      </div>
    </div>
  )
}

function MenuBoard({ a }: { a: RequestAnswers }) {
  /* The menu refolds per which-menu; updates strike prices in pencil red. */
  const which = a.which
  const update = a.change === 'Update prices or items' || a.change === 'Both'
  const phone = which === 'Delivery apps' || which === 'QR menu'
  const panels = which === 'All of them' ? 3 : which === 'Dine in' ? 2 : 1
  const Panel = ({ i }: { i: number }) => (
    <div style={{ width: phone ? 92 : 86, height: phone ? 168 : 150, background: DESK.paper, border: `1.5px solid ${DESK.ink2}`, borderRadius: phone ? 14 : 3, padding: '12px 9px', transform: panels > 1 ? `rotate(${(i - 1) * 3}deg)` : 'none', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
      <div style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', color: DESK.ink }}>{which === 'Drinks' ? 'DRINKS' : 'MENU'}</div>
      {which === 'QR menu' && i === 0 && <div style={{ width: 34, height: 34, background: `repeating-conic-gradient(${DESK.ink} 0% 25%, transparent 0% 50%)`, backgroundSize: '10px 10px', opacity: 0.75 }} />}
      {[0, 1, 2].map((r) => (
        <div key={r} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
          <InkBar w="60%" h={5} />
          <span style={{ marginLeft: 'auto', position: 'relative', fontFamily: DESK.mono, fontSize: 7.5, color: DESK.ink2 }}>
            $$
            {update && <span style={{ position: 'absolute', left: -2, right: -2, top: '48%', height: 1.5, background: '#C0392B', transform: 'rotate(-8deg)' }} />}
          </span>
        </div>
      ))}
      {a.items && i === 0 && <div className="dk-ink" style={{ fontFamily: DESK.body, fontSize: 8.5, color: '#C0392B', lineHeight: 1.3 }}>{clip(a.items, 34)}</div>}
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: panels > 1 ? 0 : 8 }}>
      {Array.from({ length: panels }, (_, i) => <Panel key={i} i={i} />)}
    </div>
  )
}

function LogoBoard({ a }: { a: RequestAnswers }) {
  /* The wordmark speaks in the voice they picked. */
  const feel = a.feel
  const styleFor: Record<string, CSSProperties> = {
    'Warm and homey': { fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#8a5a2c', fontWeight: 600 },
    'Clean and modern': { fontFamily: DESK.body, fontWeight: 300, letterSpacing: '0.35em', textTransform: 'uppercase', color: DESK.ink },
    'Bold and loud': { fontFamily: DESK.disp, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', color: DESK.ink, fontSize: 24 },
    'Classic and fancy': { fontFamily: 'Georgia, serif', fontWeight: 600, color: DESK.ink, borderTop: `1.5px solid ${DESK.ink}`, borderBottom: `1.5px solid ${DESK.ink}`, padding: '5px 12px' },
    'Fun and playful': { fontFamily: DESK.disp, fontWeight: 700, color: DESK.mintDeep, transform: 'rotate(-4deg)', fontSize: 21 },
  }
  const refresh = a.scope === 'Refresh my logo'
  const kit = a.scope === 'Full brand kit'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: 150, height: 110, borderRadius: 75, border: `1.5px solid ${DESK.line}`, background: DESK.paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {refresh && <span style={{ position: 'absolute', fontFamily: DESK.disp, fontWeight: 700, fontSize: 19, color: DESK.line, transform: 'rotate(-6deg) translateY(-16px)' }}>Your Name</span>}
        <span className="dk-ink" style={{ fontSize: 19, ...(feel ? styleFor[feel] : { fontFamily: DESK.disp, fontWeight: 700, color: DESK.line }) }}>
          Your Name
        </span>
      </div>
      {kit && (
        <div className="dk-ink" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[DESK.ink, DESK.mintDeep, DESK.amber, '#8a5a2c', DESK.line].map((c) => (
            <span key={c} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: `1px solid ${DESK.line}` }} />
          ))}
          <span style={{ fontFamily: DESK.mono, fontSize: 8.5, color: DESK.mute, marginLeft: 4 }}>+ FONTS + CARDS</span>
        </div>
      )}
      {a.uses && <Tape>{clip(a.uses, 30)}</Tape>}
    </div>
  )
}

function WebsiteBoard({ a }: { a: RequestAnswers }) {
  /* A browser frame whose hero rearranges around the job they picked. */
  const what = a.what
  const block = (label: string, mint?: boolean) => (
    <div key={label} className="dk-ink" style={{ borderRadius: 5, border: `1.5px solid ${mint ? DESK.mint : DESK.line}`, background: mint ? DESK.mintWash : '#fff', color: mint ? DESK.mintDeep : DESK.ink2, fontFamily: DESK.disp, fontWeight: 700, fontSize: 9.5, textAlign: 'center', padding: '7px 4px' }}>{label}</div>
  )
  const hero = what === 'Show the menu' ? [block('YOUR MENU', true), block('Photos'), block('Hours + map')]
    : what === 'Take orders online' ? [block('ORDER NOW', true), block('Menu'), block('Pickup + delivery')]
    : what === 'Take reservations' ? [block('BOOK A TABLE', true), block('Tonight 6:30 · 7:00 · 7:30'), block('Menu')]
    : what === 'Tell our story' ? [block('OUR STORY', true), block('Photos of the room'), block('Meet the family')]
    : what === 'All of it' ? [block('MENU', true), block('ORDER', true), block('BOOK', true), block('STORY')]
    : [<Ghost key="g1" w="100%" h={22} />, <Ghost key="g2" w="100%" h={14} />, <Ghost key="g3" w="70%" h={14} />]
  return (
    <div style={{ width: 220 }}>
      <div style={{ border: `1.5px solid ${DESK.ink2}`, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', borderBottom: `1px solid ${DESK.line}`, background: DESK.paper }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: DESK.line }} />)}
          <span style={{ flex: 1, marginLeft: 4, borderRadius: 6, border: `1px solid ${DESK.line}`, fontFamily: DESK.mono, fontSize: 8, color: a.current ? DESK.ink2 : DESK.line, padding: '2px 6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {a.current ? clip(a.current, 26) : 'yourplace.com'}
          </span>
        </div>
        <div style={{ padding: 10, display: 'grid', gridTemplateColumns: what === 'All of it' ? '1fr 1fr' : '1fr', gap: 6 }}>{hero}</div>
      </div>
      {a.scope && <div style={{ marginTop: 8, textAlign: 'center' }}><Tape>{a.scope}</Tape></div>}
    </div>
  )
}

function VideoBoard({ a }: { a: RequestAnswers }) {
  /* The phone plays their moment; the strip below grows to the count. */
  const n = a.count === 'Just 1' ? 1 : a.count === '3 to 5' ? 4 : a.count === 'A monthly batch' ? 6 : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {a.filming === 'Come film at my place' && (
          <div className="dk-ink" style={{ textAlign: 'center' }}>
            <div style={{ width: 26, height: 18, border: `1.5px solid ${DESK.ink2}`, borderRadius: 3, position: 'relative' }}>
              <span style={{ position: 'absolute', right: -7, top: 3, width: 7, height: 9, background: DESK.ink2, clipPath: 'polygon(0 50%, 100% 0, 100% 100%)' }} />
            </div>
            <div style={{ width: 1.5, height: 16, background: DESK.ink2, margin: '0 auto' }} />
            <div style={{ fontFamily: DESK.mono, fontSize: 7.5, color: DESK.mute, marginTop: 2 }}>ON SITE</div>
          </div>
        )}
        <div style={{ position: 'relative', width: 92, height: 165, borderRadius: 14, border: `1.5px solid ${DESK.ink2}`, background: DESK.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 }}>
          <span style={{ width: 30, height: 30, borderRadius: 15, background: DESK.mintWash, border: `1.5px solid ${DESK.mint}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 0, height: 0, borderLeft: `9px solid ${DESK.mintDeep}`, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', marginLeft: 2 }} />
          </span>
          {a.what ? <div className="dk-ink" style={{ fontFamily: DESK.body, fontSize: 9, color: DESK.ink2, textAlign: 'center', lineHeight: 1.3 }}>{clip(a.what, 44)}</div> : <><Ghost w="80%" h={6} /><Ghost w="60%" h={6} /></>}
        </div>
        {a.filming === 'Use clips and photos I have' && (
          <div className="dk-ink" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 22, height: 14, border: `1.5px solid ${DESK.ink2}`, borderRadius: 2, background: '#fff' }} />)}
            <div style={{ fontFamily: DESK.mono, fontSize: 7.5, color: DESK.mute }}>YOUR CLIPS</div>
          </div>
        )}
      </div>
      {n > 0 && (
        <div className="dk-ink" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {Array.from({ length: n }, (_, i) => <span key={i} style={{ width: 16, height: 26, borderRadius: 3, border: `1.5px solid ${DESK.mint}`, background: DESK.mintWash }} />)}
          {a.count === 'A monthly batch' && <span style={{ fontFamily: DESK.mono, fontSize: 8.5, color: DESK.mintDeep, marginLeft: 3 }}>/MO</span>}
        </div>
      )}
    </div>
  )
}

function PhotosBoard({ a }: { a: RequestAnswers }) {
  /* A contact sheet that fills with what we are shooting. */
  const what = a.what
  const cell = (kind: 'dish' | 'room' | 'team' | 'ghost', i: number) => (
    <div key={i} className={kind === 'ghost' ? undefined : 'dk-ink'} style={{ width: 40, height: 40, border: `1.5px ${kind === 'ghost' ? 'dashed' : 'solid'} ${kind === 'ghost' ? DESK.line : DESK.ink2}`, borderRadius: 3, background: kind === 'ghost' ? 'transparent' : DESK.paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {kind === 'dish' && <span style={{ width: 20, height: 20, borderRadius: 10, border: `1.5px solid ${DESK.ink2}`, display: 'block', position: 'relative' }}><span style={{ position: 'absolute', inset: 4, borderRadius: 8, background: DESK.mintWash, border: `1px solid ${DESK.mintLine}` }} /></span>}
      {kind === 'room' && <span style={{ width: 22, height: 16, borderBottom: `2px solid ${DESK.ink2}`, borderLeft: `1.5px solid ${DESK.ink2}`, borderRight: `1.5px solid ${DESK.ink2}`, display: 'block' }} />}
      {kind === 'team' && <span style={{ display: 'flex', gap: 2 }}>{[0, 1].map((j) => <span key={j} style={{ width: 8, height: 8, borderRadius: 4, border: `1.5px solid ${DESK.ink2}`, display: 'block' }} />)}</span>}
    </div>
  )
  const kinds: ('dish' | 'room' | 'team' | 'ghost')[] =
    what === 'Food and dishes' ? ['dish', 'dish', 'dish', 'dish', 'dish', 'dish']
    : what === 'The space' ? ['room', 'room', 'room', 'room', 'room', 'room']
    : what === 'The team' ? ['team', 'team', 'team', 'team', 'team', 'team']
    : what === 'All of it' ? ['dish', 'room', 'team', 'dish', 'room', 'dish']
    : ['ghost', 'ghost', 'ghost', 'ghost', 'ghost', 'ghost']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gap: 5, padding: 8, background: '#fff', border: `1.5px solid ${DESK.ink2}`, borderRadius: 4 }}>
        {kinds.map((k, i) => cell(k, i))}
      </div>
      {a.use && <Tape>{`For ${a.use}`}</Tape>}
      {a.dishes && <div className="dk-ink" style={{ fontFamily: DESK.body, fontSize: 9.5, color: DESK.ink2 }}>Must have: {clip(a.dishes, 40)}</div>}
    </div>
  )
}

function SocialBoard({ a }: { a: RequestAnswers }) {
  /* The month's grid fills to the count; the platform stamps the corner. */
  const n = a.count === '4 a month' ? 4 : a.count === '8 a month' ? 8 : a.count === '12 or more' ? 12 : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', padding: 10, background: '#fff', border: `1.5px solid ${DESK.ink2}`, borderRadius: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 26px)', gap: 4 }}>
          {Array.from({ length: 12 }, (_, i) => i < n
            ? <span key={i} className="dk-ink" style={{ width: 26, height: 26, borderRadius: 4, background: DESK.mintWash, border: `1.5px solid ${DESK.mint}` }} />
            : <span key={i} style={{ width: 26, height: 26, borderRadius: 4, border: `1.5px dashed ${DESK.line}` }} />)}
        </div>
        <span style={{ position: 'absolute', top: -8, right: -6, fontFamily: DESK.mono, fontSize: 8, background: DESK.paper, border: `1px solid ${DESK.line}`, borderRadius: 3, padding: '2px 5px', color: DESK.ink2 }}>1 MONTH</span>
      </div>
      {a.platforms && <Tape>{a.platforms}</Tape>}
      {a.about && <div className="dk-ink" style={{ fontFamily: DESK.body, fontSize: 9.5, color: DESK.ink2, maxWidth: 220, textAlign: 'center' }}>{clip(a.about, 60)}</div>}
    </div>
  )
}

function EmailBoard({ a }: { a: RequestAnswers }) {
  /* Their subject line lands in a real inbox row. */
  return (
    <div style={{ width: 230 }}>
      <div style={{ border: `1.5px solid ${DESK.ink2}`, borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '7px 10px', borderBottom: `1px solid ${DESK.line}`, background: DESK.paper, fontFamily: DESK.mono, fontSize: 8.5, color: DESK.mute, letterSpacing: '0.08em' }}>INBOX</div>
        <div style={{ padding: '9px 10px', display: 'flex', gap: 8, alignItems: 'center', background: DESK.mintWash }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: DESK.mintDeep, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 10.5, color: DESK.ink }}>Your Restaurant</div>
            {a.what
              ? <div className="dk-ink" style={{ fontFamily: DESK.body, fontSize: 10, color: DESK.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip(a.what, 34)}</div>
              : <Ghost w={130} h={7} style={{ marginTop: 3 }} />}
          </div>
        </div>
        {[0, 1].map((i) => (
          <div key={i} style={{ padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', borderTop: `1px solid ${DESK.line}` }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: DESK.line, flexShrink: 0 }} />
            <div><InkBar w={60} h={6} /><Ghost w={110} h={5} style={{ marginTop: 4 }} /></div>
          </div>
        ))}
      </div>
      {a.list && <div style={{ marginTop: 8, textAlign: 'center' }}><Tape>{a.list === 'Yes' ? 'To your list' : a.list === 'A small one' ? 'To your small list' : 'We help you start a list'}</Tape></div>}
    </div>
  )
}

function AdsBoard({ a }: { a: RequestAnswers }) {
  /* The ad takes the shape of where it runs. */
  const p = a.platform
  const feed = (
    <div className="dk-ink" style={{ width: 150, border: `1.5px solid ${DESK.ink2}`, borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '6px 9px', display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: DESK.mintWash, border: `1px solid ${DESK.mintLine}` }} />
        <span style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 9, color: DESK.ink }}>Your Restaurant</span>
        <span style={{ marginLeft: 'auto', fontFamily: DESK.mono, fontSize: 7, color: DESK.mute }}>SPONSORED</span>
      </div>
      <div style={{ height: 64, background: DESK.paper, borderTop: `1px solid ${DESK.line}`, borderBottom: `1px solid ${DESK.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {a.push ? <span style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 11, color: DESK.ink, textAlign: 'center', padding: '0 8px' }}>{clip(a.push, 30)}</span> : <Ghost w="70%" h={10} />}
      </div>
      <div style={{ padding: '6px 9px' }}><span style={{ fontFamily: DESK.mono, fontSize: 8, color: DESK.mintDeep, border: `1px solid ${DESK.mintLine}`, borderRadius: 4, padding: '2px 7px', background: DESK.mintWash }}>ORDER NOW</span></div>
    </div>
  )
  const search = (
    <div className="dk-ink" style={{ width: 150, border: `1.5px solid ${DESK.ink2}`, borderRadius: 8, background: '#fff', padding: '9px 10px' }}>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{ fontFamily: DESK.mono, fontSize: 7, color: DESK.ink, border: `1px solid ${DESK.ink2}`, borderRadius: 2, padding: '1px 3px' }}>AD</span>
        <span style={{ fontFamily: DESK.mono, fontSize: 8, color: DESK.mute }}>yourplace.com</span>
      </div>
      <div style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 10.5, color: '#1a0dab', marginTop: 4 }}>{a.push ? clip(a.push, 28) : 'Your best offer here'}</div>
      <Ghost w="90%" h={5} style={{ marginTop: 5 }} />
      <Ghost w="70%" h={5} style={{ marginTop: 3 }} />
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', transform: p === 'Both' ? 'scale(0.9)' : 'none' }}>
      {(p === 'Facebook and Instagram' || p === 'Both' || !p || p === 'Not sure') && feed}
      {(p === 'Google' || p === 'Both') && search}
    </div>
  )
}

function PrintBoard({ a }: { a: RequestAnswers }) {
  /* Crop-marked piece; their words on it; the printing choice stamps the corner. */
  const mark = (pos: CSSProperties) => <span aria-hidden style={{ position: 'absolute', width: 10, height: 10, borderLeft: `1.5px solid ${DESK.ink2}`, borderTop: `1.5px solid ${DESK.ink2}`, ...pos }} />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', padding: 12 }}>
        {mark({ top: 0, left: 0 })}
        {mark({ top: 0, right: 0, transform: 'rotate(90deg)' })}
        {mark({ bottom: 0, left: 0, transform: 'rotate(-90deg)' })}
        {mark({ bottom: 0, right: 0, transform: 'rotate(180deg)' })}
        <div style={{ width: 190, height: 96, background: DESK.paper, border: `1.5px solid ${DESK.ink2}`, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
          {a.what
            ? <span className="dk-ink" style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 13, color: DESK.ink, textAlign: 'center' }}>{clip(a.what, 40)}</span>
            : <><Ghost w="60%" h={12} /></>}
        </div>
      </div>
      {a.printing && <Tape tone={a.printing === 'Yes, print and deliver' ? 'rush' : 'plain'}>{a.printing === 'Yes, print and deliver' ? 'We print + deliver' : a.printing === 'Just the design file' ? 'Files to you' : 'Printing: open'}</Tape>}
    </div>
  )
}

function CopyBoard({ a }: { a: RequestAnswers }) {
  /* A typed page: the header is what needs writing, their gist lands on the lines. */
  const head = a.what === 'Menu descriptions' ? 'THE MENU, IN WORDS' : a.what === 'Our story or about page' ? 'OUR STORY' : a.what === 'An announcement' ? 'BIG NEWS' : a.what === 'Something else' ? 'THE WORDS' : ''
  return (
    <div style={{ width: 200, background: '#fff', border: `1.5px solid ${DESK.ink2}`, borderRadius: 3, padding: '14px 14px 16px' }}>
      {head
        ? <div className="dk-ink" style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', color: DESK.ink, marginBottom: 10 }}>{head}</div>
        : <Ghost w="55%" h={9} style={{ marginBottom: 10 }} />}
      {a.about
        ? <div className="dk-ink" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 11, color: DESK.ink2, lineHeight: 1.6 }}>{clip(a.about, 90)}</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Ghost w="100%" h={6} /><Ghost w="92%" h={6} /><Ghost w="65%" h={6} /></div>}
    </div>
  )
}

function OtherBoard({ a }: { a: RequestAnswers }) {
  /* The desk notepad: their ask, in their words, clipped to the pad. */
  return (
    <div style={{ position: 'relative', width: 210, background: '#fff', border: `1.5px solid ${DESK.ink2}`, borderRadius: 4, padding: '18px 16px 16px' }}>
      <span aria-hidden style={{ position: 'absolute', top: -10, left: 18, width: 22, height: 26, border: `2.5px solid ${DESK.ink2}`, borderBottom: 'none', borderRadius: '10px 10px 0 0', background: 'transparent' }} />
      <div style={{ fontFamily: DESK.mono, fontSize: 8.5, letterSpacing: '0.14em', color: DESK.mute, marginBottom: 8 }}>WHAT YOU NEED</div>
      {a.what
        ? <div className="dk-ink" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 11.5, color: DESK.ink, lineHeight: 1.55 }}>{clip(a.what, 110)}</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Ghost w="100%" h={6} /><Ghost w="88%" h={6} /><Ghost w="60%" h={6} /></div>}
    </div>
  )
}

/* ── the switch ────────────────────────────────────────────────────────────────────── */

const BADGES: Record<RequestTypeId, string> = {
  graphic: 'Your graphic', menu: 'Your menu', logo: 'Your logo', website: 'Your website',
  video: 'Your video', photos: 'Your shoot', social: 'Your month', email: 'Your email',
  ads: 'Your ad', print: 'Your print piece', copy: 'Your words', other: 'Your request',
}

export default function RequestBoard({ typeId, answers }: { typeId: RequestTypeId; answers: RequestAnswers }) {
  const a = answers
  const inner =
    typeId === 'graphic' ? <GraphicBoard a={a} />
    : typeId === 'menu' ? <MenuBoard a={a} />
    : typeId === 'logo' ? <LogoBoard a={a} />
    : typeId === 'website' ? <WebsiteBoard a={a} />
    : typeId === 'video' ? <VideoBoard a={a} />
    : typeId === 'photos' ? <PhotosBoard a={a} />
    : typeId === 'social' ? <SocialBoard a={a} />
    : typeId === 'email' ? <EmailBoard a={a} />
    : typeId === 'ads' ? <AdsBoard a={a} />
    : typeId === 'print' ? <PrintBoard a={a} />
    : typeId === 'copy' ? <CopyBoard a={a} />
    : <OtherBoard a={a} />
  return <Board when={a.when} notes={a.notes} badge={BADGES[typeId]}>{inner}</Board>
}
