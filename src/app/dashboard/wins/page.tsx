'use client'

/**
 * /dashboard/wins — the cards worth showing somebody.
 *
 * The Results archive keeps everything that ever fired, heads-ups included. This is the shorter
 * shelf: only the cards that are mint AND carry a real number (src/lib/love/win.ts), because that
 * is the difference between "here is what happened" and "here is something I can send my brother".
 *
 * Nothing here invents a card. It reads the same archive the deck reads and filters it by the same
 * rules the share route enforces, so a card that has a Show someone button here is a card the
 * server will actually mint a link for.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trophy, ChevronRight } from 'lucide-react'
import { presentCardType } from '@/lib/proof/present'
import { isWin } from '@/lib/love/win'
import { useClient } from '@/lib/client-context'
import { useLang } from '@/components/mvp/mvp-language'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import ProofCard, { type ProofCardData } from '@/components/mvp/proof-card'

interface WinRow extends ProofCardData { firedOn: string }

export default function WinsPage() {
  const { client } = useClient()
  const { T, locale } = useLang()
  const clientId = client?.id
  const [rows, setRows] = useState<WinRow[] | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!clientId) return
    let alive = true
    fetch(`/api/dashboard/proof?clientId=${clientId}&list=1`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        setPending(!!j.pending)
        const wins = (j.cards ?? [])
          .filter((c: Record<string, unknown>) => isWin({
            cardKey: String(c.card_key ?? c.id ?? ''),
            cardType: String(c.card_type ?? ''),
            big: String(c.big ?? ''),
          }))
          .map((c: Record<string, unknown>) => ({
            id: String(c.card_key ?? c.id),
            label: String(c.label), big: String(c.big), context: String(c.context),
            attribution: (c.attribution as string) ?? undefined,
            spark: Array.isArray(c.spark) ? (c.spark as number[]) : undefined,
            firedOn: c.fired_at ? new Date(String(c.fired_at)).toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : '',
            ...presentCardType(String(c.card_type)),
          })) as WinRow[]
        setRows(wins)
      })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [clientId, locale])

  return (
    <MvpShell active="more" header={<MvpDetailHeader title={T('Wins')} subtitle={T('Proof you can show someone')} />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {rows === null ? (
          <div style={{ color: '#8e8e93', fontSize: 13, padding: '30px 0', textAlign: 'center' }}>{T('Loading…')}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[16px] px-5 py-10 bg-white" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <Trophy size={20} color="#aeaeb2" />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f' }}>{T('No wins yet')}</div>
            <div style={{ fontSize: 12.5, color: '#6e6e73', maxWidth: 300, lineHeight: 1.5 }}>
              {pending
                ? T('The wins shelf is almost on. A small database update turns it on.')
                : T('When a week beats the one before, or a post beats your usual reach, the card lands here. Then you can show it to someone.')}
            </div>
          </div>
        ) : (
          rows.map((c) => (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <ProofCard card={c} defaultOpen onDismiss={() => { /* the shelf keeps its cards */ }} />
              <Link
                href={`/dashboard/wins/${encodeURIComponent(c.id)}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: '#0f6e56', textDecoration: 'none', margin: '-6px 2px 14px' }}
              >
                {T('Show someone')} <ChevronRight size={13} />
              </Link>
            </div>
          ))
        )}
      </div>
    </MvpShell>
  )
}
