'use client'

/**
 * CreatorBookingDetail — one booking, everything in one place: when it is, the requirements the
 * restaurant answered, every delivery and its state, and what it's worth. The tappable home for a
 * booking, reached from the bookings list and the calendar, so a creator can run their schedule
 * without hunting across three screens. Read-only overview; delivering happens in the Work tab.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarClock, Camera, Laptop, Repeat, MessageSquareText, Clock, Store, MapPin } from 'lucide-react'
import type { CreatorBookingDetail } from '@/lib/marketplace/creator-booking'

const C = {
  green: '#4abd98', greenDk: '#0f6e56', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  bg: '#f5f5f7', amber: '#8a5a0c', amberBg: '#fbf3e4', violet: '#6d4bb3', violetBg: '#f1ecfb', blue: '#3a6ea5', blueBg: '#eef3fb', chip: '#eef0ef',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const SHAPE: Record<string, { label: string; Icon: typeof Camera }> = {
  scheduled: { label: 'On-site shoot', Icon: Camera },
  async: { label: 'Remote', Icon: Laptop },
  recurring: { label: 'Monthly plan', Icon: Repeat },
  quote: { label: 'Custom quote', Icon: MessageSquareText },
}

function money(cents: number): string | null {
  if (!cents || cents <= 0) return null
  const d = cents / 100
  return d % 1 === 0 ? `$${d.toLocaleString('en-US')}` : `$${d.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}
function fmtTime(hhmm: string | null): string {
  if (!hhmm) return ''
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}
function workLabel(status: string): { label: string; fg: string; bg: string } {
  switch (status) {
    case 'delivered': return { label: 'Ready to review', fg: C.violet, bg: C.violetBg }
    case 'approved': return { label: 'Approved', fg: C.greenDk, bg: C.greenSoft }
    case 'revision': return { label: 'Changes asked', fg: C.blue, bg: C.blueBg }
    case 'declined': return { label: 'Cancelled', fg: C.mute, bg: C.chip }
    default: return { label: 'To deliver', fg: C.blue, bg: C.blueBg }
  }
}

export default function CreatorBookingDetail({ detail }: { detail: CreatorBookingDetail }) {
  const shape = SHAPE[detail.shape] ?? SHAPE.scheduled
  const intakeEntries = Object.entries(detail.intake).filter(([, v]) => v)
  const total = money(detail.totalCents)
  const whenLabel = detail.shape === 'scheduled' ? 'When' : detail.shape === 'recurring' ? 'Starts' : 'Due'

  return (
    <div style={{ background: C.bg, minHeight: '100%', paddingBottom: 40, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ paddingTop: 14, paddingBottom: 8 }}>
          <Link href="/creator/bookings" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.greenDk, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            <ArrowLeft size={17} /> Bookings
          </Link>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 4, marginBottom: 16 }}>
          <span style={{ width: 46, height: 46, borderRadius: 13, background: C.greenSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}><shape.Icon size={21} color={C.greenDk} /></span>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.15 }}>{detail.listingTitle}{detail.tierName ? <span style={{ color: C.faint, fontWeight: 400 }}> · {detail.tierName}</span> : null}</h1>
            <div style={{ fontSize: 13, color: C.mute, marginTop: 3 }}>{shape.label}</div>
          </div>
        </div>

        {/* When */}
        {detail.date && (
          <Card>
            <Label>{whenLabel}</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: C.ink }}>
              <CalendarClock size={16} color={C.greenDk} />
              {fmtDate(detail.date)}{detail.start ? ` · ${fmtTime(detail.start)}${detail.end ? ` to ${fmtTime(detail.end)}` : ''}` : ''}
            </div>
            {detail.timezone && detail.start && <div style={{ fontSize: 12, color: C.faint, marginTop: 4, marginLeft: 24 }}>{detail.timezone.replace(/_/g, ' ')}</div>}
          </Card>
        )}

        {/* Restaurant */}
        {detail.restaurantName && (
          <Card>
            <Label>Restaurant</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: C.ink }}>
              <Store size={16} color={C.greenDk} /> {detail.restaurantName}
            </div>
            {detail.restaurantLocation && detail.shape === 'scheduled' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.mute, marginTop: 6, marginLeft: 1 }}>
                <MapPin size={14} color={C.faint} /> {detail.restaurantLocation}
              </div>
            )}
          </Card>
        )}

        {/* Requirements */}
        {intakeEntries.length > 0 && (
          <Card>
            <Label>What they told you</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {intakeEntries.map(([q, a], i) => (
                <div key={i}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{q}</div>
                  <div style={{ fontSize: 13.5, color: C.mute, marginTop: 1, lineHeight: 1.4 }}>{a}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Deliveries */}
        <Card>
          <Label>{detail.deliverables.length > 1 ? `Deliveries · ${detail.deliverables.length}` : 'Delivery'}</Label>
          {detail.deliverables.length === 0 ? (
            <div style={{ fontSize: 13.5, color: C.mute }}>No deliverable yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {detail.deliverables.map((d) => {
                const lab = workLabel(d.status)
                const amt = money(d.amountCents)
                return (
                  <div key={d.orderId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title || 'Delivery'}</div>
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {d.dueDate && <><Clock size={11} /> Due {fmtDate(d.dueDate)}</>}{amt ? `${d.dueDate ? ' · ' : ''}${amt}` : ''}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', borderRadius: 99, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', background: lab.bg, color: lab.fg }}>{lab.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Value + deliver link */}
        {total && (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 4px 0' }}>
            <span style={{ fontSize: 13, color: C.mute }}>Booking value</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, color: C.ink }}>{total}</span>
          </div>
        )}
        <Link href="/creator/work" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, padding: '11px 16px', borderRadius: 12, background: C.green, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          Deliver in your work
        </Link>
      </div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 15, marginBottom: 12 }}>{children}</div>
}
function Label({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.faint, marginBottom: 9 }}>{children}</div>
}
