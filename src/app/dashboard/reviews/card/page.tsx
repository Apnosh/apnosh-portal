'use client'
/**
 * /dashboard/reviews/card — the counter card: a QR to the Google review link, printable.
 *
 * One page, one job. The business name, one line, the QR, the short link under it for people
 * who would rather type. Print from the browser; the print sheet is a 4×6 card. The same card
 * is what the team prints and ships when the owner asks for table tents.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useClient } from '@/lib/client-context'

interface Kit { name: string; reviewUrl: string | null; rating: number | null; count: number | null }

export default function ReviewCardPage() {
  const { client, loading } = useClient()
  const params = useSearchParams()
  const clientId = client?.id ?? params.get('clientId') ?? null
  const [kit, setKit] = useState<Kit | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!clientId) return
    fetch(`/api/dashboard/reviews/kit?clientId=${clientId}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not load'); return j as Kit })
      .then(setKit).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load'))
  }, [clientId])

  if (loading && !clientId) return <p style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif', color: '#6e6e73' }}>Loading</p>
  if (!clientId) return <p style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif', color: '#6e6e73' }}>Sign in as a client to print the card.</p>
  if (err) return <p style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif', color: '#c92d32' }}>{err}</p>
  if (!kit) return null
  if (!kit.reviewUrl) return <p style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif', color: '#6e6e73' }}>No Google listing on file yet. Connect Google first.</p>

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f6', fontFamily: "'Inter', system-ui, sans-serif", color: '#1d1d1f' }}>
      <style>{`@media print { body { background: #fff } .no-print { display: none !important } .card { box-shadow: none !important; margin: 0 !important } @page { size: 4in 6in; margin: 0 } }`}</style>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '0.5px solid #e6e6ea', background: '#fff' }}>
        <Link href="/dashboard/campaigns/new" style={{ color: '#1d1d1f', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Back</Link>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 700 }}>The counter card</span>
        <button type="button" onClick={() => window.print()} style={{ height: 36, padding: '0 14px', borderRadius: 99, border: 0, background: '#1d1d1f', color: '#fff', fontWeight: 700, font: 'inherit', cursor: 'pointer' }}>Print</button>
      </div>
      <div className="card" style={{ width: '4in', height: '6in', margin: '24px auto', background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,.10)', padding: '0.4in 0.35in', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6e6e73', fontWeight: 700 }}>{kit.name}</div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.1, marginTop: 10 }}>Love it?<br />Tell Google.</div>
        <div style={{ fontSize: 13.5, color: '#6e6e73', marginTop: 8, lineHeight: 1.4 }}>A review takes a minute and it helps more than you know.</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/dashboard/reviews/qr?clientId=${clientId}&size=720`} alt="QR code to leave a Google review" style={{ width: '2.3in', height: '2.3in', marginTop: 18 }} />
        <div style={{ fontSize: 11.5, color: '#6e6e73', marginTop: 12, lineHeight: 1.4 }}>Point your camera at the code, or search {kit.name} on Google and tap Write a review.</div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1d1d1f', fontWeight: 700 }}>
          <span style={{ color: '#f0a12b' }}>★★★★★</span> Thank you
        </div>
      </div>
      <div className="no-print" style={{ maxWidth: 420, margin: '0 auto 40px', padding: '0 18px', fontSize: 13, color: '#6e6e73', lineHeight: 1.5, textAlign: 'center' }}>
        Print it on card stock, or ask for printed table tents from the Get reviews plan. The link under the code: <span style={{ wordBreak: 'break-all', color: '#1d1d1f' }}>{kit.reviewUrl}</span>
      </div>
    </div>
  )
}
