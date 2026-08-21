'use client'

/**
 * THE GRAPHICS SECTION (P2) — the store's browsable shelf of every graphic,
 * rendered straight from the type registry. Search on top, the five tinted
 * groups below; tapping a tile opens the one order flow with the type
 * pre-selected. Owner decision 2026-08-21: a section inside the store, never
 * a second destination — one front door, one production pipeline.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { DESK, paperGround } from '@/components/campaigns/desk/ui'
import { JOB_SHELF, jobLabelOf } from '@/lib/design/job-registry'
import { JobTile } from '@/components/design/job-tile'

export default function GraphicsBrowse() {
  const router = useRouter()
  const [q, setQ] = useState('')

  const shelf = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return JOB_SHELF
    return JOB_SHELF
      .map((g) => ({
        ...g,
        jobs: g.jobs.filter((j) =>
          jobLabelOf(j.id).toLowerCase().includes(query)
          || j.id.replace(/-/g, ' ').includes(query)
          || g.name.toLowerCase().includes(query)),
      }))
      .filter((g) => g.jobs.length > 0)
  }, [q])

  const open = (id: string) => router.push(`/dashboard/design/order?job=${encodeURIComponent(id)}`)

  return (
    <div style={{ ...paperGround, minHeight: '100%', padding: '16px 16px 40px', fontFamily: DESK.body, color: DESK.ink }}>
      <button type="button" onClick={() => router.push('/dashboard/campaigns/new?lens=creatives')}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: DESK.body, fontSize: 13.5, fontWeight: 600, color: DESK.ink2, marginBottom: 10 }}>
        ‹ Store
      </button>
      <div style={{ fontFamily: DESK.disp, fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em' }}>Graphics</div>

      <div style={{ position: 'relative', marginTop: 14 }}>
        <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: DESK.mute }} />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search, like sale or story or hiring"
          aria-label="Search graphics"
          style={{ width: '100%', height: 44, borderRadius: 22, border: `1.5px solid ${DESK.line}`, background: DESK.card, padding: '0 16px 0 36px', fontSize: 14, fontFamily: DESK.body, color: DESK.ink, outline: 'none' }}
        />
      </div>

      {shelf.length === 0 && (
        <div style={{ marginTop: 24, fontSize: 13, color: DESK.mute, textAlign: 'center' }}>
          Nothing matches. Tap Something else and say it in your own words.
        </div>
      )}

      {shelf.map((g) => (
        <div key={g.name} style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: g.dot, display: 'inline-block' }} />
            {g.name}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {g.jobs.map((j) => (
              <JobTile key={j.id} job={j} tint={g.tint} onClick={() => open(j.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
