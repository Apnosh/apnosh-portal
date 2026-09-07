'use client'
/**
 * /dashboard/get-help — one door for help (owner 2026-09-05): message us, the questions page,
 * share feedback (a message to your strategist with the subject filled in), and the papers.
 *
 * The promise now carries a clock (2026-09-07). "We reply within one business day" was a claim
 * with nothing beside it, so an owner who was waiting could not tell a slow answer from a
 * dropped one. When they have a question open, this page says when they asked and when the
 * answer is owed; when the last one was answered, it says how long it took. Nothing shows
 * before they have ever asked — a timer with no question on it is just marketing.
 */
import { useEffect, useState } from 'react'
import { MessageCircle, HelpCircle, Megaphone, FileText } from 'lucide-react'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpRow, C } from '@/components/mvp/mvp-detail'
import { REPLY_PROMISE } from '@/lib/reply-promise'
import { replyLine } from '@/lib/team/reply-line'
import { useClient } from '@/lib/client-context'

export default function GetHelpPage() {
  const { client } = useClient()
  const [ask, setAsk] = useState<{ askedAt: string; answeredAt: string | null } | null>(null)

  useEffect(() => {
    const id = client?.id
    if (!id) return
    let alive = true
    fetch(`/api/dashboard/people?clientId=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.latestAsk) setAsk(j.latestAsk as { askedAt: string; answeredAt: string | null }) })
      .catch(() => { /* no clock is fine; the promise line below still stands */ })
    return () => { alive = false }
  }, [client?.id])

  const clock = replyLine({ askedAt: ask?.askedAt ?? null, answeredAt: ask?.answeredAt ?? null }, { promise: REPLY_PROMISE })

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Get help" subtitle="A real person answers" />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '10px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        <MvpGroup title="Talk to us" hue="mint">
          <MvpRow icon={<MessageCircle size={18} />} hue="mint" label="Message us" sub={`We reply ${REPLY_PROMISE}`} href="/dashboard/messages?to=support" />
          <MvpRow icon={<Megaphone size={18} />} hue="announce" label="Share feedback" sub="Tell us what to make better" href={`/dashboard/messages?to=strategist&draft=${encodeURIComponent('Feedback: ')}`} />
        </MvpGroup>
        {clock && <div style={{ fontSize: 12, color: C.mute, margin: '-8px 4px 18px' }}>{clock}</div>}
        <MvpGroup title="Find it yourself" hue="nights">
          <MvpRow icon={<HelpCircle size={18} />} hue="nights" label="Questions and answers" href="/dashboard/help" />
        </MvpGroup>
        <MvpGroup title="The papers" hue="grey">
          <MvpRow icon={<FileText size={18} />} hue="grey" label="Your agreements" href="/dashboard/agreements" />
        </MvpGroup>
      </div>
    </MvpShell>
  )
}
