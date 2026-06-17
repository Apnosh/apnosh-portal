'use client'

/**
 * Campaign discovery — the "create a campaign" page (opened from the center +).
 * A DoorDash-style feed: a personalized "Recommended for you" row (ranked by
 * the owner's real signals via /api/campaigns/recommend), then category rows of
 * every play. Tapping a card opens the campaign preview
 * (/dashboard/campaigns/preview/[id]) before building. Renders its own
 * full-screen frame (close → back to the campaigns list).
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import { X, ArrowRight, Sparkles } from 'lucide-react'
import { CAMPAIGN_TEMPLATES, CATEGORY_META, TEMPLATE_BY_ID, type CampaignCategory, type CampaignTemplate } from '@/lib/campaigns/data/campaign-templates'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f0f0f3',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const CAT_ORDER: CampaignCategory[] = ['demand', 'capacity', 'retain', 'reputation']
const CAT_ACCENT: Record<CampaignCategory, { bg: string }> = {
  demand: { bg: '#eaf1fb' }, capacity: { bg: '#fdeee3' }, retain: { bg: '#f1edfb' }, reputation: { bg: '#fdeef3' },
}
const DEFAULT_RECS: { id: string; reason: string }[] = [
  { id: 'fill-shifts', reason: 'Turn your quiet shifts into covers' },
  { id: 'event', reason: 'Pack your next big date' },
  { id: 'discover', reason: 'Be found by nearby diners' },
  { id: 'reviews', reason: 'Lift your rating with fresh reviews' },
  { id: 'winback', reason: 'Bring back guests who drifted' },
]
const ANIM = `
@keyframes ccRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.cc-rise{animation:ccRise .45s cubic-bezier(.2,.7,.3,1) both}
.cc-scroll{scrollbar-width:none}.cc-scroll::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion: reduce){.cc-rise{animation:none}}
`

export default function MvpCampaignsDiscovery() {
  const router = useRouter()
  const { client } = useClient()
  const [recs, setRecs] = useState<{ id: string; reason: string }[] | null>(null)

  useEffect(() => {
    if (!client?.id) return
    let live = true
    fetch(`/api/campaigns/recommend?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.recommended?.length) setRecs(j.recommended) })
      .catch(() => { /* keep defaults */ })
    return () => { live = false }
  }, [client?.id])

  const recList = (recs ?? DEFAULT_RECS)
    .map((r) => ({ tpl: TEMPLATE_BY_ID[r.id] as CampaignTemplate | undefined, reason: r.reason }))
    .filter((x): x is { tpl: CampaignTemplate; reason: string } => !!x.tpl)

  const close = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard/campaigns') }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        <style>{ANIM}</style>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `0.5px solid ${C.line}` }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18 }}>Start a campaign</div>
          <button onClick={close} aria-label="Close" style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'none', color: C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={22} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 28 }}>
          <div style={{ padding: '16px 18px 0' }}>
            <div style={{ fontSize: 13.5, color: C.mute }}>Pick one to run. We build it, you approve before anything ships.</div>
          </div>

          <Section title="Recommended for you" sub="Based on your numbers, reviews, and what's coming up">
            <Rail>{recList.map(({ tpl, reason }) => <RecCard key={tpl.id} tpl={tpl} reason={reason} />)}</Rail>
          </Section>

          {CAT_ORDER.map((cat) => {
            const tpls = CAMPAIGN_TEMPLATES.filter((t) => t.category === cat)
            if (!tpls.length) return null
            return (
              <Section key={cat} title={CATEGORY_META[cat].label}>
                <Rail>{tpls.map((t) => <TplCard key={t.id} tpl={t} />)}</Rail>
              </Section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="cc-rise" style={{ marginTop: 20 }}>
      <div style={{ padding: '0 18px', marginBottom: 11 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}
function Rail({ children }: { children: React.ReactNode }) {
  return <div className="cc-scroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 18px 2px', scrollSnapType: 'x proximity' }}>{children}</div>
}
function IconTile({ emoji, cat, size = 46 }: { emoji: string; cat: CampaignCategory; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: 13, background: CAT_ACCENT[cat].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, flexShrink: 0 }}>{emoji}</div>
}
function durationLabel(t: CampaignTemplate) { return t.durationWeeks ? `${t.durationWeeks} weeks` : 'Ongoing' }

function RecCard({ tpl, reason }: { tpl: CampaignTemplate; reason: string }) {
  return (
    <Link href={`/dashboard/campaigns/preview/${tpl.id}`} style={{ scrollSnapAlign: 'start', flex: '0 0 78%', maxWidth: 290, minWidth: 0, textDecoration: 'none', color: 'inherit', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 18, padding: 15, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
        <IconTile emoji={tpl.icon} cat={tpl.category} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16.5, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.name}</div>
          <div style={{ fontSize: 12, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{tpl.tagline}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, background: C.greenSoft, borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
        <Sparkles size={13} color={C.greenDk} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, lineHeight: 1.35 }}>{reason}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto' }}>
        <span style={{ fontSize: 11.5, color: C.faint }}>{tpl.projected} · {durationLabel(tpl)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.greenDk, fontWeight: 700, fontSize: 12.5, flexShrink: 0 }}>View <ArrowRight size={13} /></span>
      </div>
    </Link>
  )
}
function TplCard({ tpl }: { tpl: CampaignTemplate }) {
  return (
    <Link href={`/dashboard/campaigns/preview/${tpl.id}`} style={{ scrollSnapAlign: 'start', flex: '0 0 210px', maxWidth: 210, minWidth: 0, textDecoration: 'none', color: 'inherit', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 13, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', boxSizing: 'border-box' }}>
      <IconTile emoji={tpl.icon} cat={tpl.category} size={40} />
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 14.5, lineHeight: 1.2, marginTop: 10 }}>{tpl.name}</div>
      <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.35, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{tpl.tagline}</div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>{durationLabel(tpl)}</div>
    </Link>
  )
}
