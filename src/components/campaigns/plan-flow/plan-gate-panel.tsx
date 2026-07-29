'use client'

/**
 * PlanGatePanel — what the owner sees INSTEAD of a doomed plan.
 *
 * This renders only when a refuse-severity gate fired, which means the strategist declined to
 * compose: the date cannot be hit or the budget is under the smallest real version. The panel's
 * whole job is to make the refusal feel like advice, not a wall — the headline says what does
 * not fit, whatFits names the real alternative, the chip applies it in one tap, and the
 * strategist thread is one tap away with the question already written.
 *
 * Deliberately has NO "do it anyway" button. The advise tier exists for pushable dates; a
 * refusal is the plan of record's law working: we do not sell plans we know cannot land.
 */

import Link from 'next/link'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { C, SPACE, RADIUS, TEXT, DISPLAY } from '@/components/mvp/tokens'
import { DESK, DeskKeyframes, Stamp, paperGround } from '@/components/campaigns/desk/ui'
import { talkToUsHref, type PlanGate } from '@/lib/campaigns/builder/plan-gates'

export default function PlanGatePanel({ gates, onAdjust, onBack }: {
  gates: PlanGate[]
  /** Apply a gate's one-tap fix: patch the vals and re-run the plan. */
  onAdjust: (gate: PlanGate) => void
  onBack: () => void
}) {
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '18px 16px 40px', fontFamily: 'Inter, sans-serif', ...paperGround, minHeight: '100dvh' }}>
      <DeskKeyframes />
      <button
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: C.mute, fontSize: TEXT.md, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: SPACE.xl, fontFamily: 'inherit' }}
      >
        <ArrowLeft size={15} /> Change my answers
      </button>

      <div style={{ fontFamily: DISPLAY, fontSize: TEXT.hero, color: C.ink, lineHeight: 1.25, marginBottom: SPACE.md }}>
        Before we build this, one honest thing
      </div>
      <div style={{ fontSize: TEXT.md, color: C.mute, lineHeight: 1.55, marginBottom: SPACE.xxl }}>
        We could show you a plan anyway. It would look great and it would not happen. Here is what
        we can actually stand behind.
      </div>

      {gates.map((g) => (
        <div key={g.key} style={{ border: `1px solid ${DESK.amberLine}`, borderRadius: RADIUS.lg, padding: SPACE.xl, marginBottom: SPACE.lg, background: DESK.amberWash }}>
          {/* Honesty as a designed moment: the plan gets stamped, like a real desk. */}
          <div style={{ textAlign: 'center', marginBottom: SPACE.md }}>
            <Stamp>{g.key === 'lead-time' ? 'Too soon' : 'Not enough'}</Stamp>
          </div>
          <div style={{ fontSize: TEXT.lg, fontWeight: 650, color: C.ink, lineHeight: 1.4, marginBottom: SPACE.sm }}>
            {g.headline}
          </div>
          <div style={{ fontSize: TEXT.md, color: C.mute, lineHeight: 1.55, marginBottom: SPACE.lg }}>
            {g.whatFits}
          </div>
          <div style={{ display: 'flex', gap: SPACE.md, flexWrap: 'wrap' }}>
            {g.adjust && (
              <button
                onClick={() => onAdjust(g)}
                style={{ border: 'none', background: C.green, color: '#fff', borderRadius: RADIUS.pill, padding: '9px 16px', fontSize: TEXT.md, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {g.adjust.label}
              </button>
            )}
            <Link
              href={talkToUsHref(g)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, borderRadius: RADIUS.pill, padding: '9px 16px', fontSize: TEXT.md, fontWeight: 600, textDecoration: 'none' }}
            >
              <MessageCircle size={14} /> Ask a strategist
            </Link>
          </div>
        </div>
      ))}

      <div style={{ fontSize: TEXT.sm, color: C.faint, lineHeight: 1.5 }}>
        The message opens with your question already written, so it is one tap to send.
      </div>
    </div>
  )
}
