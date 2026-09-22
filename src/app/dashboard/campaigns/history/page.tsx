'use client'
/**
 * /dashboard/campaigns/history — the months billed and what ran. One tap from Campaigns.
 */
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import { C, DISPLAY } from '@/components/mvp/tokens'

interface Row { month: string; status: string; total_cents: number; started_at: string | null; thesis: string | null; pieces: number; done: number }
const MONTH_NAME = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString()}`

export default function Page() { return <Suspense fallback={null}><Inner /></Suspense> }
function Inner() {
  const { client, loading } = useClient()
  const sp = useSearchParams()
  const q = sp.get('clientId') ? `?clientId=${sp.get('clientId')}` : ''
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => { if (!client?.id) return; fetch(`/api/dashboard/plan-month?clientId=${client.id}&history=1`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => setRows((j?.months ?? []) as Row[])).catch(() => setRows([])) }, [client?.id])
  if (loading || !client?.id) return null
  return (
    <MvpShell active="campaigns" title="Order history" back={`/dashboard/campaigns${q}`}>
      <div className="cr" style={{ padding: '6px 16px 40px', maxWidth: 480, margin: '0 auto', color: C.ink }}>
        {!rows && <div style={{ padding: 40, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /></div>}
        {rows && rows.length === 0 && <div style={{ marginTop: 18, border: `0.5px dashed ${C.line}`, borderRadius: 16, padding: '22px 16px', textAlign: 'center', fontSize: 14, fontWeight: 700 }}>Nothing billed yet.</div>}
        {rows?.map((r) => (
          <a key={r.month} href={`/dashboard/campaigns${q}${q ? '&' : '?'}month=${r.month}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `0.5px solid ${C.line}`, textDecoration: 'none', color: C.ink }}>
            <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontFamily: DISPLAY, fontSize: 16, fontWeight: 600 }}>The plan · {MONTH_NAME(r.month)}</b><small style={{ display: 'block', color: C.mute, fontSize: 12, marginTop: 2 }}>{r.pieces} pieces · {r.done} done{r.started_at ? ` · started ${new Date(r.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</small></span>
            <span style={{ textAlign: 'right' }}><b style={{ display: 'block', fontSize: 15 }}>{dollars(r.total_cents)}</b><small style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: r.status === 'done' ? '#f2f2f5' : '#eaf7f3', color: r.status === 'done' ? C.mute : C.greenDk }}>{r.status === 'done' ? 'ran' : r.status === 'started' ? 'on' : 'drafted'}</small></span>
          </a>
        ))}
        <div style={{ fontSize: 12, color: C.mute, marginTop: 14, lineHeight: 1.45 }}>Each month is billed at the plan rate once it starts. Extras are approved and charged one by one, and show on their own request.</div>
      </div>
    </MvpShell>
  )
}
