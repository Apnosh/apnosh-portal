'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { CreatorBrief, BriefOrder } from '@/lib/campaigns/creator-brief'
import { safeHref } from '@/lib/campaigns/work-orders-core'

export default function OrderBriefPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<{ order: BriefOrder; brief: CreatorBrief } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/creator/work/${id}`, { cache: 'no-store' })
    if (!r.ok) { setState('error'); return }
    const j = await r.json()
    setData(j); setUrl(j.order?.deliveredUrl ?? ''); setState('ready')
  }, [id])
  useEffect(() => { load() }, [load])

  const act = useCallback(async (patch: { status?: string; delivered_url?: string }) => {
    setBusy(true)
    try {
      await fetch('/api/creator/work', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
      await load()
    } finally { setBusy(false) }
  }, [id, load])

  if (state === 'loading') return <Center>Pulling your brief together…</Center>
  if (state === 'error' || !data) return <Center>Couldn’t load this brief.</Center>

  const { order, brief } = data
  const c = brief.creative
  const conceptPending = order.conceptStatus === 'pending'

  return (
    <div className="min-h-screen bg-neutral-50 pb-28">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/85 backdrop-blur px-4 py-3">
        <button onClick={() => router.push('/creator/work')} className="text-[13px] text-neutral-500">← All work</button>
        <h1 className="mt-1 text-[17px] font-semibold leading-snug text-neutral-900">{brief.headline}</h1>
        <p className="mt-0.5 text-xs text-neutral-400">{order.campaignName} · goal: {order.goal}</p>
      </header>

      <main className="mx-auto max-w-xl space-y-3 p-4">
        {/* schedule — her deadline first */}
        <Card>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Shoot by" value={brief.schedule.shootByLabel} />
            <Stat label="Draft due" value={brief.schedule.draftDueLabel} accent />
            <Stat label="Goes live" value={brief.schedule.postsLabel} />
          </div>
          <p className="mt-2 text-center text-[11px] text-neutral-400">Send the owner your draft by <b>{brief.schedule.draftDueLabel}</b> so it can be approved before it posts.</p>
        </Card>

        {conceptPending && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">⏳ Waiting on the owner to approve the concept below before you produce. You can review everything now.</div>
        )}
        {order.note && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">Owner note: {order.note}</div>
        )}

        {/* the idea */}
        <Section title="The idea" badge={brief.creativeSource === 'ai' ? 'AI-written' : brief.creativeSource === 'owner' ? 'From the owner' : 'Starter'}>
          <p className="text-[14px] leading-relaxed text-neutral-800">{c.concept}</p>
          <Field label="Hook">{c.hook}</Field>
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{brief.stepsLabel}</p>
            <ol className="space-y-1.5">
              {c.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-neutral-700"><span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-600">{i + 1}</span>{s}</li>
              ))}
            </ol>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Caption</p>
              <button onClick={() => navigator.clipboard?.writeText(c.caption)} className="text-[11px] font-medium text-neutral-500">Copy</button>
            </div>
            <p className="rounded-lg bg-neutral-100 px-3 py-2 text-[13px] text-neutral-700">{c.caption}</p>
            {c.hashtags.length > 0 && <p className="mt-1.5 text-[12px] text-blue-600">{c.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}</p>}
          </div>
        </Section>

        {/* what to feature */}
        <Section title="What to feature"><p className="text-[14px] text-neutral-800">{brief.featuring}</p></Section>

        {/* about the spot */}
        <Section title="About the spot">
          <p className="text-[14px] font-medium text-neutral-800">{brief.aboutTheSpot.name} <span className="font-normal text-neutral-500">· {brief.aboutTheSpot.cuisine}</span></p>
          {brief.aboutTheSpot.voice.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">{brief.aboutTheSpot.voice.map((v, i) => <span key={i} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[12px] text-neutral-600">{v}</span>)}</div>
          )}
          {brief.aboutTheSpot.tone && <Field label="Tone">{brief.aboutTheSpot.tone}</Field>}
          {brief.aboutTheSpot.colors.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5"><span className="text-[12px] text-neutral-500">Colors</span>{brief.aboutTheSpot.colors.map((col, i) => <span key={i} className="h-4 w-4 rounded-full border border-neutral-200" style={{ background: col }} />)}</div>
          )}
          {brief.aboutTheSpot.doNots && <Field label="Avoid">{brief.aboutTheSpot.doNots}</Field>}
        </Section>

        {/* specs */}
        <Section title="Specs">
          <Row k="Platform" v={brief.specs.platform} />
          <Row k="Aspect" v={brief.specs.aspectRatio} />
          <Row k="Length / size" v={brief.specs.sizeOrLength} />
          <Row k="Format" v={brief.specs.format} />
        </Section>

        {brief.offer && (
          <Section title="The offer"><p className="text-[14px] font-medium text-neutral-800">{brief.offer.label}</p><p className="mt-1 text-[12px] text-neutral-500">{brief.offer.cta}</p></Section>
        )}

        {/* deliverables */}
        <Section title="Hand back">
          <ul className="space-y-1">{brief.deliverables.map((d, i) => <li key={i} className="flex gap-2 text-[13px] text-neutral-700"><span className="text-neutral-300">▢</span>{d}</li>)}</ul>
        </Section>
      </main>

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-xl">
          {order.status === 'offered' && (
            <div className="flex gap-2">
              <Btn primary busy={busy} onClick={() => act({ status: 'accepted' })}>Accept this job</Btn>
              <Btn busy={busy} onClick={() => act({ status: 'declined' })}>Decline</Btn>
            </div>
          )}
          {order.status === 'accepted' && (conceptPending
            ? <p className="text-center text-[13px] text-amber-700">Concept pending the owner’s OK — you’ll be able to start once they approve.</p>
            : <Btn primary busy={busy} onClick={() => act({ status: 'in_progress' })}>Start work</Btn>)}
          {(order.status === 'in_progress' || order.status === 'revision') && (
            <div className="flex gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link to the finished work" className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
              <Btn primary busy={busy} disabled={!url.trim()} onClick={() => act({ status: 'delivered', delivered_url: url.trim() })}>Deliver</Btn>
            </div>
          )}
          {order.status === 'delivered' && <p className="text-center text-[13px] text-neutral-500">Delivered — waiting on the owner to review.</p>}
          {order.status === 'approved' && <p className="text-center text-[13px] font-medium text-emerald-700">Approved ✓ {safeHref(order.deliveredUrl) && <a href={safeHref(order.deliveredUrl)!} target="_blank" rel="noreferrer" className="underline">view</a>}</p>}
        </div>
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) { return <div className="min-h-screen grid place-items-center px-6 text-center text-sm text-neutral-500">{children}</div> }
function Card({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">{children}</div> }
function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
        {badge && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">{badge}</span>}
      </div>
      {children}
    </Card>
  )
}
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div><p className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</p><p className={`mt-0.5 text-[13px] font-semibold ${accent ? 'text-neutral-900' : 'text-neutral-600'}`}>{value}</p></div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-2"><span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}: </span><span className="text-[13px] text-neutral-700">{children}</span></div>
}
function Row({ k, v }: { k: string; v: string }) { return <div className="flex justify-between gap-3 py-1 text-[13px]"><span className="text-neutral-500">{k}</span><span className="text-right font-medium text-neutral-800">{v}</span></div> }
function Btn({ children, onClick, primary, busy, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; busy?: boolean; disabled?: boolean }) {
  return <button onClick={onClick} disabled={busy || disabled} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${primary ? 'bg-neutral-900 text-white hover:bg-neutral-700' : 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50'}`}>{busy ? '…' : children}</button>
}
