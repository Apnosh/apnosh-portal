'use client'

/**
 * THE GRAPHICS SECTION — a wall of miniature artboards (owner call 2026-08-21:
 * visually stunning). Every type renders as a tiny finished poster: its
 * headline seed set in display type on the dark board with corner ticks and a
 * soft glow in its group's color. Tap a board, the order flow opens with the
 * type chosen. Registry-driven end to end.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { DESK, paperGround } from '@/components/campaigns/desk/ui'
import { JOB_SHELF, jobLabelOf, type JobSpec } from '@/lib/design/job-registry'

function BoardTile({ job, dot, index, onClick }: { job: JobSpec; dot: string; index: number; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="gb-rise"
      style={{
        animationDelay: `${Math.min(index * 45, 500)}ms`,
        display: 'flex', flexDirection: 'column', gap: 5, padding: 0, border: 'none',
        background: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        className="gb-board"
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          aspectRatio: '1 / 1', width: '100%', borderRadius: 13, overflow: 'hidden',
          background: `radial-gradient(120% 120% at 85% 0%, ${dot}33, transparent 55%), linear-gradient(150deg, #1D2B24, #14201A)`,
          boxShadow: '0 4px 12px rgba(22,33,28,0.14), inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '10px 10px 9px',
        }}
      >
        {/* corner ticks, same language as the order flow's artboard */}
        {([['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']] as const).map(([v, h]) => (
          <span key={v + h} aria-hidden style={{
            position: 'absolute', [v]: 5, [h]: 5, width: 7, height: 7,
            [`border${v[0].toUpperCase() + v.slice(1)}` as never]: '1.5px solid rgba(255,255,255,0.4)',
            [`border${h[0].toUpperCase() + h.slice(1)}` as never]: '1.5px solid rgba(255,255,255,0.4)',
          }} />
        ))}
        <span style={{ fontFamily: DESK.disp, fontSize: 12, fontWeight: 700, lineHeight: 1.15, color: '#fff', letterSpacing: '-0.01em', textAlign: 'center', textWrap: 'balance' as never }}>
          {job.headline ?? jobLabelOf(job.id)}
        </span>
        <span aria-hidden style={{ position: 'absolute', right: 7, bottom: 5, fontSize: 12, opacity: 0.8 }}>{job.emoji}</span>
      </span>
      <span style={{ fontFamily: DESK.body, fontSize: 10.5, fontWeight: 600, color: DESK.ink2, textAlign: 'center', lineHeight: 1.2 }}>{jobLabelOf(job.id)}</span>
    </button>
  )
}

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
          || g.name.toLowerCase().includes(query)
          || (j.headline ?? '').toLowerCase().includes(query)),
      }))
      .filter((g) => g.jobs.length > 0)
  }, [q])

  const open = (id: string) => router.push(`/dashboard/design/order?job=${encodeURIComponent(id)}`)

  let i = 0
  return (
    <div style={{ ...paperGround, minHeight: '100%', padding: '16px 16px 40px', fontFamily: DESK.body, color: DESK.ink }}>
      <style>{`
@keyframes gbRise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
.gb-rise{animation:gbRise .4s cubic-bezier(.2,.7,.3,1) both}
.gb-board{transition:transform .16s ease, box-shadow .16s ease}
button:active .gb-board{transform:scale(.97)}
@media (hover:hover){button:hover .gb-board{transform:translateY(-2px);box-shadow:0 10px 26px rgba(22,33,28,0.22), inset 0 1px 0 rgba(255,255,255,0.06)}}
@media (prefers-reduced-motion:reduce){.gb-rise{animation:none}.gb-board{transition:none}}`}</style>

      <button type="button" onClick={() => router.push('/dashboard/campaigns/new?lens=creatives')}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: DESK.body, fontSize: 13.5, fontWeight: 600, color: DESK.ink2, marginBottom: 10 }}>
        ‹ Store
      </button>
      <div style={{ fontFamily: DESK.disp, fontSize: 26, fontWeight: 700, letterSpacing: '-0.015em' }}>Graphics</div>

      <div style={{ position: 'relative', marginTop: 12 }}>
        <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: DESK.mute }} />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          aria-label="Search graphics"
          style={{ width: '100%', height: 44, borderRadius: 22, border: `1.5px solid ${DESK.line}`, background: DESK.card, padding: '0 16px 0 36px', fontSize: 14, fontFamily: DESK.body, color: DESK.ink, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {shelf.length === 0 && (
        <div style={{ marginTop: 24, fontSize: 13, color: DESK.mute, textAlign: 'center' }}>
          Nothing matches. Open any type and say it in your own words.
        </div>
      )}

      {shelf.map((g) => (
        <div key={g.name} style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: g.dot, display: 'inline-block' }} />
            {g.name}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {g.jobs.map((j) => <BoardTile key={j.id} job={j} dot={g.dot} index={i++} onClick={() => open(j.id)} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
