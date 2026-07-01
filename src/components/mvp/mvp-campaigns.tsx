'use client'

/**
 * MVP Campaigns — the design's campaign board, wired to real campaigns from
 * /api/campaigns. List + Calendar toggle, All/Live/In production/Drafts/Done
 * filters, and cards that open the campaign detail. Empty until the owner
 * creates one via ＋ New (the build flow).
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useClient } from '@/lib/client-context'
import {
  Plus, Repeat, Check, TrendingUp, TrendingDown, Minus, ArrowRight, Clock,
  CalendarDays, Eye, Heart, Loader2,
} from 'lucide-react'
import { campaignCardVM, type CampCard, type SavedCampaign } from '@/lib/campaigns/view'
import MvpCalendar from './mvp-calendar'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  amber: '#8a5a0c', amberBg: '#fbf3e4', amberLine: '#eed9b3', red: '#c0392b', redBg: '#fdecea',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const ANIM = `
@keyframes ccRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.cc-stagger>*{animation:ccRise .45s cubic-bezier(.2,.7,.3,1) both}
.cc-stagger>*:nth-child(1){animation-delay:.03s}.cc-stagger>*:nth-child(2){animation-delay:.08s}.cc-stagger>*:nth-child(3){animation-delay:.13s}.cc-stagger>*:nth-child(4){animation-delay:.18s}.cc-stagger>*:nth-child(5){animation-delay:.23s}.cc-stagger>*:nth-child(6){animation-delay:.28s}.cc-stagger>*:nth-child(7){animation-delay:.33s}.cc-stagger>*:nth-child(8){animation-delay:.38s}
.cc-scroll{scrollbar-width:none}.cc-scroll::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion: reduce){.cc-stagger>*{animation:none}}
`

type Tab = 'all' | 'live' | 'production' | 'draft' | 'done'

export default function MvpCampaigns() {
  const { client, loading: clientLoading } = useClient()
  const [saved, setSaved] = useState<SavedCampaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [tab, setTab] = useState<Tab>('all')

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    fetch(`/api/campaigns?clientId=${client.id}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`); return r.json() })
      .then((j) => { if (live) setSaved((j.campaigns ?? []) as SavedCampaign[]) })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [client?.id])

  const cards: CampCard[] = (saved ?? []).map(campaignCardVM)
  const counts: Record<Tab, number> = {
    all: cards.length,
    live: cards.filter((c) => c.kind === 'live').length,
    production: cards.filter((c) => c.pill === 'In production').length,
    draft: cards.filter((c) => c.kind === 'draft').length,
    done: cards.filter((c) => c.kind === 'done').length,
  }
  const shown = tab === 'all' ? cards
    : tab === 'live' ? cards.filter((c) => c.kind === 'live')
    : tab === 'production' ? cards.filter((c) => c.pill === 'In production')
    : tab === 'draft' ? cards.filter((c) => c.kind === 'draft')
    : cards.filter((c) => c.kind === 'done')

  const loading = clientLoading || saved === null
  const empty = !loading && cards.length === 0 && !error

  // Re-run the most recent campaign: re-open the builder on the same service.
  const last = (saved ?? []).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
  const lastTpl = last?.draft.brief?.templateId
  const lastItemId = lastTpl?.startsWith('builder-') ? lastTpl.slice('builder-'.length) : undefined

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: '#fafafb', minHeight: '100%', overflowY: 'auto', paddingBottom: 28 }}>
      <style>{ANIM}</style>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fafafb', padding: '14px 18px 12px', display: 'flex', alignItems: 'center', borderBottom: `0.5px solid ${C.line}` }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 25, color: C.ink, fontWeight: 600, lineHeight: 1 }}>Campaigns</div>
      </div>

      <div style={{ padding: '16px 18px 0' }}>
        <p style={{ fontSize: 13.5, color: C.mute, margin: '0 0 16px' }}>Open any card to see what it costs, what it&apos;s driving, and how it&apos;s doing inside.</p>

        {!empty && lastItemId && (
          <Link href={`/dashboard/campaigns/new?template=${lastItemId}`} style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '12px 14px', marginBottom: 18, color: 'inherit', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <span style={{ width: 34, height: 34, borderRadius: 12, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Repeat size={17} color={C.greenDk} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: DISPLAY, fontWeight: 600, fontSize: 14.5, color: C.ink }}>Re-run last campaign</span>
              <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last?.draft.name} · set it to repeat</span>
            </span>
            <ArrowRight size={18} color={C.mute} />
          </Link>
        )}

        {!empty && (
          <div style={{ display: 'inline-flex', background: '#f1f3f2', borderRadius: 12, padding: 3, marginBottom: 18 }}>
            {([['list', 'List'], ['calendar', 'Calendar']] as const).map(([k, l]) => {
              const on = view === k
              return <button key={k} onClick={() => setView(k)} style={{ border: 'none', borderRadius: 8, padding: '6px 18px', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.ink : C.mute, background: on ? '#fff' : 'transparent', boxShadow: on ? '0 1px 3px rgba(0,0,0,.08)' : 'none', cursor: 'pointer', transition: 'all .15s' }}>{l}</button>
            })}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: C.faint, fontSize: 13.5 }}><Loader2 size={16} className="animate-spin" /> Loading your campaigns…</div>
        ) : error ? (
          <div style={{ color: C.red, fontSize: 13.5, padding: '20px 0', textAlign: 'center' }}>Couldn&apos;t load campaigns: {error}</div>
        ) : empty ? (
          <EmptyState />
        ) : view === 'calendar' ? (
          <MvpCalendar saved={saved ?? []} />
        ) : (
          <>
            <div className="cc-scroll" style={{ display: 'flex', gap: 7, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
              {([['all', 'All'], ['live', 'Live'], ['production', 'In production'], ['draft', 'Drafts'], ['done', 'Done']] as const).map(([k, l]) => {
                const on = tab === k; const n = counts[k]
                return (
                  <button key={k} onClick={() => setTab(k)} style={{ flexShrink: 0, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff', color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', transition: 'all .15s' }}>
                    {l}<span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 99, background: on ? C.green : '#eef0ef', color: on ? '#fff' : C.faint, fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
                  </button>
                )
              })}
            </div>
            {shown.length === 0 ? (
              <div style={{ background: '#fff', border: `0.5px dashed ${C.line}`, borderRadius: 16, padding: '26px 16px', textAlign: 'center', color: C.faint, fontSize: 13.5 }}>Nothing in this filter.</div>
            ) : (
              <div className="cc-stagger" key={tab}>
                {shown.map((c) => <CampaignCard key={c.key} c={c} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ background: '#fff', border: `0.5px dashed ${C.line}`, borderRadius: 16, padding: '34px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 48, height: 48, borderRadius: 16, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={24} color={C.greenDk} /></div>
      <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600 }}>No campaigns yet</div>
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, maxWidth: 280 }}>Start one and your strategist runs it — you just approve. Pick a goal and we build the plan.</div>
      <Link href="/dashboard/campaigns/new" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, background: C.ink, color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 700, fontSize: 14 }}><Plus size={16} strokeWidth={2.5} /> New campaign</Link>
    </div>
  )
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1
  const w = 56, h = 20
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return <svg width={w} height={h} style={{ display: 'block' }}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function CampaignCard({ c }: { c: CampCard }) {
  const tone = c.kind === 'draft'
    ? { bar: '#cfd4d1', dot: '#aeb4b0', pillBg: '#eef0ef', pillC: C.mute }
    : { bar: C.green, dot: C.green, pillBg: C.greenSoft, pillC: C.greenDk }
  const ts = (t: 'up' | 'down' | 'flat') => t === 'up' ? { c: C.green, bg: C.greenSoft, I: TrendingUp } : t === 'down' ? { c: C.red, bg: C.redBg, I: TrendingDown } : { c: C.mute, bg: '#f0f0ee', I: Minus }
  const fmtReach = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  return (
    <Link href={c.href} style={{ display: 'block', textDecoration: 'none', color: 'inherit', position: 'relative', overflow: 'hidden', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '11px 13px 10px', marginBottom: 9, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tone.bar }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: tone.pillBg, color: tone.pillC, borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 11 }}>
            {c.pillIcon === 'check' ? <Check size={11} strokeWidth={3} /> : c.pillIcon === 'calendar' ? <CalendarDays size={11} /> : <span style={{ width: 6, height: 6, borderRadius: 99, background: tone.dot, display: 'inline-block' }} />}{c.pill}
          </span>
          {c.kind !== 'done' && c.cost && (c.recurring
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#eef0ef', color: C.mute, borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 10 }}><Repeat size={10} /> Recurring</span>
            : <span style={{ background: '#eef0ef', color: C.mute, borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 10 }}>One-time</span>)}
        </div>
        {c.cost && <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 14.5, color: C.ink, flexShrink: 0 }}>{c.cost}</span>}
      </div>

      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, color: C.ink, lineHeight: 1.15, marginBottom: 2 }}>{c.title}</div>
      <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.35, marginBottom: 8 }}>{c.blurb}</div>

      {c.perf?.type === 'trend' && (() => { const s = ts(c.perf.trend); return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: s.bg, color: s.c, borderRadius: 7, padding: '3px 8px', fontWeight: 700, fontSize: 11.5 }}><s.I size={12} /> {c.perf.metric}{c.perf.note ? ` ${c.perf.note}` : ''}</span>
          <Spark values={c.perf.spark} color={s.c} />
        </div>
      ) })()}
      {c.perf?.type === 'progress' && (() => { const pct = c.perf.total ? c.perf.live / c.perf.total : 0; return (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.ink }}>{c.perf.live} of {c.perf.total} parts live</span>
            <span style={{ fontSize: 10.5, color: C.faint }}>{Math.round(pct * 100)}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: '#eef0ef', overflow: 'hidden' }}><div style={{ width: `${Math.max(5, pct * 100)}%`, height: '100%', background: C.green, borderRadius: 99 }} /></div>
        </div>
      ) })()}
      {c.perf?.type === 'ready' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
          <Clock size={14} color={C.mute} />
          <span style={{ fontSize: 12.5 }}><b style={{ fontWeight: 700 }}>{c.perf.ready} parts ready</b> <span style={{ color: C.faint }}>· waiting to go live</span></span>
        </div>
      )}
      {c.perf?.type === 'lift' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.greenSoft, color: C.greenDk, borderRadius: 7, padding: '3px 8px', fontWeight: 700, fontSize: 11.5, marginBottom: 8 }}><TrendingUp size={12} /> +{c.perf.pct}% actions · {fmtReach(c.perf.reach)} reached</div>
      )}
      {c.perf?.type === 'results' && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 9 }}>
          {[
            { I: Eye, v: fmtReach(c.perf.impressions), l: 'impressions' },
            { I: Heart, v: fmtReach(c.perf.likes), l: 'likes' },
            { I: TrendingUp, v: c.perf.result, l: 'result' },
          ].map((m, i) => (
            <div key={i} style={{ flex: 1, minWidth: 0, background: '#f7f8f7', borderRadius: 12, padding: '7px 9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}><m.I size={11} color={C.greenDk} /><span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.v}</span></div>
              <div style={{ fontSize: 9.5, color: C.faint, fontWeight: 600 }}>{m.l}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.greenDk, fontWeight: 700, fontSize: 12.5 }}>See how it&apos;s doing <ArrowRight size={14} /></span>
        {c.review && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.amberBg, border: `0.5px solid ${C.amberLine}`, color: C.amber, borderRadius: 99, padding: '4px 10px', fontWeight: 700, fontSize: 11.5 }}><Eye size={12} /> Needs your OK</span>}
      </div>
    </Link>
  )
}
