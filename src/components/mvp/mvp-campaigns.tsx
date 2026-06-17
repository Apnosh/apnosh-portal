'use client'

/**
 * MVP Campaigns — a DoorDash-style discovery feed. Instead of a builder front
 * door, the owner browses campaigns to run: a personalized "Recommended for
 * you" row (ranked by their real signals via /api/campaigns/recommend), then
 * category rows of every play. Tapping a card opens the campaign preview
 * (/dashboard/campaigns/preview/[id]) — what's included, the projected outcome,
 * and the cost — before building. Their running campaigns sit in a rail on top.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useClient } from '@/lib/client-context'
import { Loader2, ArrowRight, Sparkles, ChevronRight, Check } from 'lucide-react'
import { campaignCardVM, type CampCard, type SavedCampaign } from '@/lib/campaigns/view'
import { CAMPAIGN_TEMPLATES, CATEGORY_META, TEMPLATE_BY_ID, type CampaignCategory, type CampaignTemplate } from '@/lib/campaigns/data/campaign-templates'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.3)',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', red: '#c0392b',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const CAT_ORDER: CampaignCategory[] = ['demand', 'capacity', 'retain', 'reputation']
const CAT_ACCENT: Record<CampaignCategory, { bg: string; fg: string }> = {
  demand: { bg: '#eaf1fb', fg: '#2f6fd0' },
  capacity: { bg: '#fdeee3', fg: '#c2772f' },
  retain: { bg: '#f1edfb', fg: '#6b4fd0' },
  reputation: { bg: '#fdeef3', fg: '#c0567f' },
}
// Shown until /api/campaigns/recommend returns (or if it fails).
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

export default function MvpCampaigns() {
  const { client } = useClient()
  const [saved, setSaved] = useState<SavedCampaign[] | null>(null)
  const [recs, setRecs] = useState<{ id: string; reason: string }[] | null>(null)

  useEffect(() => {
    if (!client?.id) return
    let live = true
    fetch(`/api/campaigns?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((j) => { if (live) setSaved((j.campaigns ?? []) as SavedCampaign[]) })
      .catch(() => { if (live) setSaved([]) })
    fetch(`/api/campaigns/recommend?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.recommended?.length) setRecs(j.recommended) })
      .catch(() => { /* keep defaults */ })
    return () => { live = false }
  }, [client?.id])

  const activeCards: CampCard[] = (saved ?? []).map(campaignCardVM)
  const recList = (recs ?? DEFAULT_RECS)
    .map((r) => ({ tpl: TEMPLATE_BY_ID[r.id] as CampaignTemplate | undefined, reason: r.reason }))
    .filter((x): x is { tpl: CampaignTemplate; reason: string } => !!x.tpl)

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: '#fff', minHeight: '100%', overflowY: 'auto', paddingBottom: 30 }}>
      <style>{ANIM}</style>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', padding: '16px 18px 12px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 25, lineHeight: 1 }}>Campaigns</div>
        <div style={{ fontSize: 12.5, color: C.mute, marginTop: 5 }}>Pick a campaign to run. We build it, you approve.</div>
      </div>

      {/* your running campaigns */}
      {activeCards.length > 0 && (
        <Section title="Your campaigns">
          <Rail>
            {activeCards.map((c) => <ActiveMini key={c.key} c={c} />)}
          </Rail>
        </Section>
      )}

      {/* personalized recommendations */}
      <Section title="Recommended for you" sub="Based on your numbers, reviews, and what's coming up">
        <Rail>
          {recList.map(({ tpl, reason }) => <RecCard key={tpl.id} tpl={tpl} reason={reason} />)}
        </Rail>
      </Section>

      {/* categories */}
      {CAT_ORDER.map((cat) => {
        const tpls = CAMPAIGN_TEMPLATES.filter((t) => t.category === cat)
        if (!tpls.length) return null
        return (
          <Section key={cat} title={CATEGORY_META[cat].label}>
            <Rail>
              {tpls.map((t) => <TplCard key={t.id} tpl={t} />)}
            </Rail>
          </Section>
        )
      })}
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
  const a = CAT_ACCENT[cat]
  return <div style={{ width: size, height: size, borderRadius: 13, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, flexShrink: 0 }}>{emoji}</div>
}
function durationLabel(t: CampaignTemplate) { return t.durationWeeks ? `${t.durationWeeks} weeks` : 'Ongoing' }

// Larger recommended card with the personalized "why".
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

// Compact category card.
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

// A running/draft campaign — links to its detail.
function ActiveMini({ c }: { c: CampCard }) {
  const live = c.kind === 'live'
  return (
    <Link href={c.href} style={{ scrollSnapAlign: 'start', flex: '0 0 232px', maxWidth: 232, minWidth: 0, textDecoration: 'none', color: 'inherit', position: 'relative', overflow: 'hidden', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '12px 13px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c.kind === 'draft' ? '#cfd4d1' : C.green }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: live || c.kind === 'done' ? C.greenSoft : '#eef0ef', color: live || c.kind === 'done' ? C.greenDk : C.mute, borderRadius: 99, padding: '2px 9px', fontWeight: 700, fontSize: 10.5 }}>
          {c.kind === 'done' ? <Check size={10} strokeWidth={3} /> : <span style={{ width: 5, height: 5, borderRadius: 99, background: c.kind === 'draft' ? C.faint : C.green }} />}{c.pill}
        </span>
        {c.cost && <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 13, color: C.ink }}>{c.cost}</span>}
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 14.5, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.greenDk, fontWeight: 700, fontSize: 12, marginTop: 8 }}>{c.review ? 'Needs your OK' : "See how it's doing"} <ChevronRight size={13} /></div>
    </Link>
  )
}
