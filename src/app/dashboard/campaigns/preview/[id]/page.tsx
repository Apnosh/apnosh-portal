'use client'

/**
 * Campaign preview — the DoorDash-style "item detail" for a campaign template.
 * Reached from the discovery feed. Shows what the campaign includes, who it's
 * for, the projected outcome, and an estimated cost, then "Start" hands off to
 * the builder (/dashboard/campaigns/new?template=<id>) to configure + choose
 * who builds it. Renders its own full-screen frame.
 */
import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ArrowRight, Clock, Target, Receipt } from 'lucide-react'
import { TEMPLATE_BY_ID, AUDIENCES, CATEGORY_META, type CampaignCategory } from '@/lib/campaigns/data/campaign-templates'
import { composePlay } from '@/lib/campaigns/play-engine'
import { billLabel } from '@/lib/campaigns/view'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f0f0f3', preview: '#f6f6f7',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GRAD = 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)'

const CAT_ACCENT: Record<CampaignCategory, { bg: string }> = {
  demand: { bg: '#eaf1fb' }, capacity: { bg: '#fdeee3' }, retain: { bg: '#f1edfb' }, reputation: { bg: '#fdeef3' },
}
const BEAT_ICON: Record<string, string> = { reel: '🎬', video: '🎬', sms: '💬', email: '✉️', post: '🔍', photo: '📸', story: '📱' }

export default function CampaignPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')
  const tpl = TEMPLATE_BY_ID[id]

  // Estimated cost from the default plan (composed with default targeting).
  const bill = useMemo(() => {
    if (!tpl) return { cost: null as string | null, recurring: false }
    try {
      const built = composePlay(tpl, { audience: tpl.defaultAudienceIds.join(',') }, { has: [] })
      return billLabel(built.items.filter((x) => x.included))
    } catch { return { cost: null as string | null, recurring: false } }
  }, [tpl])

  const back = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard/campaigns') }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '12px 12px 12px 6px', borderBottom: `0.5px solid ${C.line}` }}>
          <button onClick={back} aria-label="Back" style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'none', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={24} /></button>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18 }}>Campaign</div>
        </div>

        {!tpl ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontSize: 14, padding: 24, textAlign: 'center' }}>This campaign isn&apos;t available.</div>
        ) : (
          <>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 18px 24px' }}>
              {/* hero */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 60, height: 60, borderRadius: 17, background: CAT_ACCENT[tpl.category].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, flexShrink: 0 }}>{tpl.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint }}>{CATEGORY_META[tpl.category].label}</div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 22, lineHeight: 1.12, marginTop: 2 }}>{tpl.name}</div>
                  <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>{tpl.tagline}</div>
                </div>
              </div>

              {/* stats */}
              <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
                <Stat icon={<Clock size={15} color={C.greenDk} />} label="Length" value={tpl.durationWeeks ? `${tpl.durationWeeks} weeks` : 'Ongoing'} />
                <Stat icon={<Target size={15} color={C.greenDk} />} label="Goal" value={tpl.kpi} />
                <Stat icon={<Receipt size={15} color={C.greenDk} />} label="Est. cost" value={bill.cost ?? 'Set next'} />
              </div>

              {/* projected */}
              <div style={{ marginTop: 14, background: C.greenSoft, borderRadius: 14, padding: '13px 15px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.greenDk, opacity: 0.85 }}>What to expect</div>
                <div style={{ fontSize: 14.5, color: C.greenDk, fontWeight: 600, marginTop: 3 }}>{tpl.projected}</div>
              </div>

              {/* what's included */}
              <div style={{ marginTop: 22 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, marginBottom: 4 }}>What&apos;s included</div>
                <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 12 }}>The full plan a great marketer would run. You keep what you want.</div>
                {Array.from(new Set(tpl.contentPlan.map((b) => b.week))).sort((a, b) => a - b).map((wk) => (
                  <div key={wk} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 7 }}>Week {wk}</div>
                    {tpl.contentPlan.filter((b) => b.week === wk).map((b, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: `0.5px solid ${C.line}` }}>
                        <span style={{ width: 34, height: 34, borderRadius: 10, background: C.preview, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{BEAT_ICON[b.type] ?? '•'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 500, lineHeight: 1.3 }}>{b.label}</div>
                          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>{b.channel}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* who it's for */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, marginBottom: 10 }}>Who it reaches</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {tpl.defaultAudienceIds.map((aid) => {
                    const a = AUDIENCES[aid]
                    if (!a) return null
                    return <span key={aid} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${C.line}`, background: '#fff', color: C.ink2, borderRadius: 999, padding: '7px 12px', fontSize: 12.5, fontWeight: 600 }}><span>{a.icon}</span>{a.label}</span>
                  })}
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 22, lineHeight: 1.5 }}>
                You choose who builds it — AI, you, or Apnosh — and approve before anything is charged.
              </div>
            </div>

            <div style={{ flexShrink: 0, borderTop: `0.5px solid ${C.line}`, padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', background: '#fff' }}>
              <button onClick={() => router.push(`/dashboard/campaigns/new?template=${tpl.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', background: GRAD, color: '#fff', borderRadius: 14, padding: 15, fontWeight: 700, fontSize: 15.5, cursor: 'pointer' }}>
                Build this campaign <ArrowRight size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '10px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{icon}<span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.faint }}>{label}</span></div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 4, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{value}</div>
    </div>
  )
}
