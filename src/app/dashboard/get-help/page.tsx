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
import { REPLY_PROMISE, REPLY_PROMISE_SENTENCE } from '@/lib/reply-promise'
import { replyClock } from '@/lib/team/reply-line'
import { useClient } from '@/lib/client-context'
import { useLang } from '@/components/mvp/mvp-language'

export default function GetHelpPage() {
  const { client } = useClient()
  const { T, locale } = useLang()
  const [ask, setAsk] = useState<{ askedAt: string; answeredAt: string | null } | null>(null)

  useEffect(() => {
    const id = client?.id
    if (!id) return
    let alive = true
    // Only the clock: the people list and the median wait belong to other screens.
    fetch(`/api/dashboard/people?clientId=${id}&with=ask`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.latestAsk) setAsk(j.latestAsk as { askedAt: string; answeredAt: string | null }) })
      .catch(() => { /* no clock is fine; the promise line below still stands */ })
    return () => { alive = false }
  }, [client?.id])

  // The clock's four joining words and the promise itself come from the dictionary, so the
  // Spanish reads as one sentence rather than a translated half glued to an English half.
  const clock = replyClock(
    { askedAt: ask?.askedAt ?? null, answeredAt: ask?.answeredAt ?? null },
    {
      promise: T(REPLY_PROMISE),
      locale,
      words: {
        sent: T('Sent'), weReply: T('we reply'), due: T('due'), answeredIn: T('Answered in'),
        owedBy: T('we owed you a reply by'), missed: T('we missed it.'),
      },
    },
  )

  return (
    <MvpShell active="more" header={<MvpDetailHeader title={T('Get help')} subtitle={T(REPLY_PROMISE_SENTENCE)} />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '10px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        <MvpGroup title={T('Talk to us')} hue="mint">
          <MvpRow icon={<MessageCircle size={18} />} hue="mint" label={T('Message us')} sub={T('We reply {promise}', { promise: T(REPLY_PROMISE) })} href="/dashboard/messages?to=support" />
          <MvpRow icon={<Megaphone size={18} />} hue="announce" label={T('Share feedback')} sub={T('Tell us what to make better')} href={`/dashboard/messages?to=strategist&draft=${encodeURIComponent('Feedback: ')}`} />
        </MvpGroup>
        {/* No Get help door on the line here: they are already standing in it. The red is the
            same one the thread header uses, so a missed promise reads the same in both places. */}
        {clock && <div style={{ fontSize: 12, color: clock.state === 'late' ? '#c92d32' : C.mute, margin: '-8px 4px 18px' }}>{clock.text}</div>}
        <MvpGroup title={T('Find it yourself')} hue="nights">
          <MvpRow icon={<HelpCircle size={18} />} hue="nights" label={T('Questions and answers')} href="/dashboard/help" />
        </MvpGroup>
        <MvpGroup title={T('The papers')} hue="grey">
          <MvpRow icon={<FileText size={18} />} hue="grey" label={T('Your agreements')} href="/dashboard/agreements" />
        </MvpGroup>
      </div>
    </MvpShell>
  )
}
