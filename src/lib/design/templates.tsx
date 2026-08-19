/**
 * DRAFT TEMPLATES — the six hand-built layouts the AI composer fills (GD-4a).
 *
 * The scale rule: the AI never invents the design. These layouts are fixed;
 * the composer only writes the words, picks a template, and picks which of the
 * client's REAL photos to feature. Rendered server-side to a finished 1080px
 * square via next/og (satori), so every draft is on-brand by construction.
 *
 * Owner call (2026-08-19): real photos are the default; AI-enhanced imagery is
 * allowed later as a client choice (needs an image provider — not wired yet).
 *
 * Satori constraints honored throughout: flexbox only, explicit display:flex on
 * every box, absolute URLs for images. EVERY template must render with any
 * input missing (no photo, no logo) — the template sim locks this.
 */

import type { ReactElement } from 'react'

export const TEMPLATE_IDS = ['special', 'announcement', 'holiday', 'event', 'hiring', 'hours'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export interface DraftInputs {
  template: TemplateId
  headline: string
  subline: string
  /** e.g. "Sep 7 · Labor Day weekend" */
  dateLine?: string | null
  brand: {
    name: string
    /** hex; falls back to the Apnosh green family when the brand has no colors yet */
    primary?: string | null
    logoUrl?: string | null
  }
  photoUrl?: string | null
}

const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/* A photo-led layout: full-bleed photo (or brand ground), dark gradient, text
 * bottom-left. Used by special / holiday / event — the food is the hero. */
function photoLed(i: DraftInputs, badge?: string): ReactElement {
  const primary = i.brand.primary || '#1d4c3c'
  return (
    <div style={{ width: 1080, height: 1080, display: 'flex', position: 'relative', background: primary, fontFamily: 'sans-serif' }}>
      {i.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={i.photoUrl} width={1080} height={1080} style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: 1080, objectFit: 'cover' }} alt="" />
      ) : null}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: 1080, display: 'flex', background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.72) 100%)' }} />
      {badge ? (
        <div style={{ position: 'absolute', top: 52, left: 52, display: 'flex', background: primary, color: '#ffffff', fontSize: 30, fontWeight: 700, padding: '14px 30px', borderRadius: 999 }}>{badge}</div>
      ) : null}
      <div style={{ position: 'absolute', left: 52, right: 52, bottom: 56, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', color: '#ffffff', fontSize: 82, fontWeight: 800, lineHeight: 1.05 }}>{clamp(i.headline, 60)}</div>
        <div style={{ display: 'flex', color: 'rgba(255,255,255,0.92)', fontSize: 40, marginTop: 18, lineHeight: 1.3 }}>{clamp(i.subline, 90)}</div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 30 }}>
          {i.brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.brand.logoUrl} width={72} height={72} style={{ width: 72, height: 72, borderRadius: 999, objectFit: 'cover', marginRight: 20 }} alt="" />
          ) : null}
          <div style={{ display: 'flex', color: '#ffffff', fontSize: 34, fontWeight: 700 }}>{clamp(i.brand.name, 40)}</div>
          {i.dateLine ? <div style={{ display: 'flex', color: 'rgba(255,255,255,0.85)', fontSize: 34, marginLeft: 'auto' }}>{i.dateLine}</div> : null}
        </div>
      </div>
    </div>
  )
}

/* A type-led layout: brand-color ground, big words, small photo card (when one
 * exists). Used by announcement / hiring / hours — the message is the hero. */
function typeLed(i: DraftInputs, kicker: string): ReactElement {
  const primary = i.brand.primary || '#1d4c3c'
  return (
    <div style={{ width: 1080, height: 1080, display: 'flex', flexDirection: 'column', background: primary, fontFamily: 'sans-serif', padding: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {i.brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={i.brand.logoUrl} width={84} height={84} style={{ width: 84, height: 84, borderRadius: 999, objectFit: 'cover', marginRight: 22 }} alt="" />
        ) : null}
        <div style={{ display: 'flex', color: '#ffffff', fontSize: 38, fontWeight: 700 }}>{clamp(i.brand.name, 40)}</div>
      </div>
      <div style={{ display: 'flex', color: 'rgba(255,255,255,0.75)', fontSize: 32, fontWeight: 700, letterSpacing: 4, marginTop: 70 }}>{kicker.toUpperCase()}</div>
      <div style={{ display: 'flex', color: '#ffffff', fontSize: 96, fontWeight: 800, lineHeight: 1.04, marginTop: 18 }}>{clamp(i.headline, 60)}</div>
      <div style={{ display: 'flex', color: 'rgba(255,255,255,0.92)', fontSize: 42, lineHeight: 1.35, marginTop: 26 }}>{clamp(i.subline, 130)}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 'auto' }}>
        {i.dateLine ? (
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.16)', color: '#ffffff', fontSize: 34, fontWeight: 700, padding: '16px 30px', borderRadius: 16 }}>{i.dateLine}</div>
        ) : <div style={{ display: 'flex' }} />}
        {i.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={i.photoUrl} width={340} height={340} style={{ width: 340, height: 340, borderRadius: 28, objectFit: 'cover', marginLeft: 'auto' }} alt="" />
        ) : null}
      </div>
    </div>
  )
}

export function renderTemplate(i: DraftInputs): ReactElement {
  switch (i.template) {
    case 'special': return photoLed(i, 'This week')
    case 'holiday': return photoLed(i, i.dateLine ? undefined : 'Holiday')
    case 'event': return photoLed(i, 'Join us')
    case 'announcement': return typeLed(i, 'Announcement')
    case 'hiring': return typeLed(i, 'We are hiring')
    case 'hours': return typeLed(i, 'Hours update')
  }
}
