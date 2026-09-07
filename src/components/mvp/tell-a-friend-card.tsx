'use client'

/**
 * The Home card that asks for a referral — and the whole of the rule about when we may ask.
 *
 * IT DRAWS NOTHING unless the server says two things are true: the loop is open
 * (REFERRALS_ENABLED) and this owner has had at least one promise reach a counted number. Both
 * answers come from the server; this component never works either one out for itself, so a screen
 * cannot start asking because a flag was read in the wrong place.
 *
 * The FIRST of the two rides in on the /api/dashboard/load payload Home already waits for, as
 * `on`. With the switch off this card asks nothing at all — no second request per Home visit for a
 * feature nobody has — and Home is byte for byte the Home it was before Move 8. Only when the loop
 * really is open does it ask /api/referrals/me the second question, which that route decides on
 * the server too.
 *
 * It is the proof deck's own card shape (proof-card.tsx): a mint dot, the small uppercase label,
 * one line, a chevron. No new colours, no new component family.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useMvpTheme } from './mvp-theme'
import { useLang } from './mvp-language'
import { creditWords, REFERRAL_CREDIT_CENTS } from '@/lib/referrals/model'

export default function TellAFriendCard({ clientId, on }: { clientId?: string; on?: boolean }) {
  const { C } = useMvpTheme()
  const { T } = useLang()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!clientId || on !== true) return
    let alive = true
    fetch(`/api/referrals/me?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return
        // Both, always. Either one false and the card is not on the page at all.
        if (j.enabled && j.eligible) setShow(true)
      })
      .catch(() => { /* no card is the right answer to a route that cannot answer */ })
    return () => { alive = false }
  }, [clientId, on])

  if (!show) return null
  const amount = creditWords(REFERRAL_CREDIT_CENTS)

  return (
    <Link
      href="/dashboard/tell-a-friend"
      className="mvp-rise"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textDecoration: 'none',
        background: C.card, borderRadius: 14, padding: '11px 13px', marginBottom: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.06)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: C.green, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.greenDk }}>
          {T('Tell a friend')}
        </span>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.ink, marginTop: 1 }}>
          {T('Know an owner who would like this?')}
        </span>
        <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>
          {T('Give {amount}, get {amount}.', { amount })}
        </span>
      </span>
      <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />
    </Link>
  )
}
