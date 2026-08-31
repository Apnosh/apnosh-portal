'use client'

/**
 * /dashboard/results — the archive of fired proof cards, grouped by month.
 * This is where read cards fold: the running record of what the marketing
 * actually did, in the owner's own numbers. Empty until cards fire (or
 * until migration 249 runs) — and it says so honestly.
 */

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import ProofCard, { type ProofCardData } from '@/components/mvp/proof-card'

interface ArchiveRow extends ProofCardData {
  rowKey: string
  fired_at: string
  is_sample?: boolean
}

export default function ResultsPage() {
  const { client } = useClient()
  const clientId = client?.id
  const [rows, setRows] = useState<ArchiveRow[] | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!clientId) return
    let alive = true
    fetch(`/api/dashboard/proof?clientId=${clientId}&list=1`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        setPending(!!j.pending)
        setRows((j.cards ?? []).map((c: Record<string, unknown>) => ({
          rowKey: String(c.id ?? c.card_key),
          id: String(c.card_key ?? c.id),
          label: String(c.label), big: String(c.big), context: String(c.context),
          attribution: (c.attribution as string) ?? undefined,
          spark: Array.isArray(c.spark) ? (c.spark as number[]) : undefined,
          fired_at: String(c.fired_at ?? ''),
          is_sample: !!c.is_sample,
          tone: c.card_type === 'gbp_down' ? 'heads_up' as const : 'win' as const,
          cta: c.card_type === 'gbp_down' ? { label: 'Plan the push', href: '/campaigns/new' } : undefined,
        })))
      })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [clientId])

  const groups = new Map<string, ArchiveRow[]>()
  for (const r of rows ?? []) {
    const m = r.fired_at ? new Date(r.fired_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Earlier'
    if (!groups.has(m)) groups.set(m, [])
    groups.get(m)!.push(r)
  }

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Results" subtitle="Proof from your weeks, kept" />}>
      <div style={{ background: '#f5f5f7', minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {rows === null ? (
          <div style={{ color: '#8e8e93', fontSize: 13, padding: '30px 0', textAlign: 'center' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[16px] px-5 py-10 bg-white" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <TrendingUp size={20} color="#aeaeb2" />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f' }}>Your results land here</div>
            <div style={{ fontSize: 12.5, color: '#6e6e73', maxWidth: 300, lineHeight: 1.5 }}>
              {pending
                ? 'The results ledger is almost on. A small database update turns it on.'
                : 'When a week on Google beats the last one, or a post beats your usual reach, the card lands on Home and then lives here.'}
            </div>
          </div>
        ) : (
          [...groups.entries()].map(([month, cards]) => (
            <div key={month} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8e8e93', margin: '4px 2px 10px' }}>{month}</div>
              {cards.map((c) => (
                <ProofCard key={c.rowKey} card={c} defaultOpen onDismiss={() => { /* archive: cards stay */ }} />
              ))}
            </div>
          ))
        )}
      </div>
    </MvpShell>
  )
}
