'use client'
/**
 * ProductPagePreview — a faithful, prop-driven replica of the live customer product page
 * (apnosh-campaign.jsx ProductPage). The admin editors feed it the exact words + derived
 * facts they are about to publish, so "how the customer sees it" matches the real store
 * section-by-section: hero (chips, eyebrow, headline, product tile), the sell copy, how
 * it's done, what we'll need, what you get, analytics to track, and the buy footer.
 */
import type { FunnelStage } from '@/lib/campaigns/data/create-catalog'
import { STAGE_TAG_LABEL } from '@/lib/campaigns/data/create-catalog'

const PV = {
  mint: '#4abd98', mintDark: '#2e9a78', mintTint: '#eaf7f3', ink: '#1c2620', sub: '#6b736d', faint: '#a6aca7', line: '#e7e9e6',
  heroGrad: 'linear-gradient(168deg,#fbfaf4 0%,#f2f8f4 54%,#e7f3ed 100%)',
  head: "'Cal Sans','Poppins',system-ui,sans-serif", body: "'Inter',system-ui,sans-serif",
}

function BlockLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
      <span style={{ fontFamily: PV.head, fontSize: 16, fontWeight: 600, color: PV.ink, letterSpacing: '-0.2px' }}>{children}</span>
      {hint && <span style={{ marginLeft: 'auto', fontFamily: PV.body, fontSize: 11.5, fontWeight: 600, color: PV.faint }}>{hint}</span>}
    </div>
  )
}
const Check = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={PV.mintDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>

export interface ProductPagePreviewProps {
  eyebrow: string
  headline: string
  description?: string
  why?: string
  stages: FunnelStage[]
  cadenceLabel?: string
  priceLabel: string
  whatYouGet: string[]
  requirements: string[]
  analytics: string[]
  heroImage?: string | null
  /** The "How it's done" detail line. */
  howItsDone?: string
}

export function ProductPagePreview(props: ProductPagePreviewProps) {
  const {
    eyebrow, headline, description, why, stages, cadenceLabel,
    priceLabel, whatYouGet, requirements, analytics, heroImage,
    howItsDone = 'The Apnosh team does this for you.',
  } = props
  const inc = whatYouGet.filter((x) => x && x.trim()).slice(0, 6)
  const reqs = requirements.filter((x) => x && x.trim())
  const metrics = analytics.filter((x) => x && x.trim())

  return (
    <div style={{ borderRadius: 22, overflow: 'hidden', background: '#fff', border: `1px solid ${PV.line}`, boxShadow: '0 10px 34px rgba(20,45,33,0.10)', fontFamily: PV.body }}>
      {/* HERO */}
      <div style={{ background: PV.heroGrad, padding: '14px 20px 26px', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', top: -80, right: -60, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(74,189,152,0.22), rgba(74,189,152,0))', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {stages.map((s) => (
              <span key={s} style={{ fontFamily: PV.body, fontSize: 11, fontWeight: 700, color: PV.mintDark, background: 'rgba(74,189,152,0.14)', borderRadius: 8, padding: '4px 9px' }}>{STAGE_TAG_LABEL[s] ?? s}</span>
            ))}
            {cadenceLabel && <span style={{ fontFamily: PV.body, fontSize: 11, fontWeight: 600, color: '#7c837e', background: 'rgba(20,30,26,0.05)', borderRadius: 8, padding: '4px 9px' }}>{cadenceLabel}</span>}
          </div>
          <div style={{ fontFamily: PV.body, fontSize: 13, fontWeight: 700, color: PV.mintDark, marginBottom: 6 }}>{eyebrow || 'Untitled'}</div>
          <div style={{ fontFamily: PV.head, fontSize: 26, fontWeight: 700, color: PV.ink, lineHeight: 1.16, letterSpacing: '-0.5px' }}>{headline || eyebrow || 'Your headline goes here'}</div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
            {heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroImage} alt="" style={{ width: 112, height: 112, borderRadius: 28, objectFit: 'cover', boxShadow: '0 16px 34px rgba(20,45,33,0.24), 0 3px 8px rgba(20,40,30,0.12)' }} />
            ) : (
              <div style={{ width: 112, height: 112, borderRadius: 28, background: 'linear-gradient(150deg,#4abd98,#2e9a78)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 34px rgba(46,154,120,0.34), 0 3px 8px rgba(20,40,30,0.12)' }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.4 6.9L21.6 9l-5.8 4.4 2.2 7-6-4.3-6 4.3 2.2-7L2.4 9l7.2-.1z" /></svg>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* SELL */}
      {(description?.trim() || why?.trim()) && (
        <div style={{ padding: '16px 20px 0' }}>
          {description?.trim() && <p style={{ margin: 0, fontFamily: PV.body, fontSize: 14.5, color: '#4c554f', lineHeight: 1.55 }}>{description.trim()}</p>}
          {why?.trim() && <p style={{ margin: '10px 0 0', fontFamily: PV.body, fontSize: 13.5, color: PV.sub, lineHeight: 1.55 }}>{why.trim()}</p>}
        </div>
      )}
      {/* HOW IT'S DONE */}
      <div style={{ padding: '22px 20px 0' }}>
        <BlockLabel>How it&apos;s done</BlockLabel>
        <div style={{ fontFamily: PV.body, fontSize: 13.5, color: PV.sub, lineHeight: 1.45 }}>{howItsDone}</div>
      </div>
      {/* WHAT WE'LL NEED FROM YOU */}
      {reqs.length > 0 && (
        <div style={{ padding: '20px 20px 0' }}>
          <BlockLabel>What we&apos;ll need from you</BlockLabel>
          <div style={{ background: '#f7f9f8', borderRadius: 14, padding: '13px 15px' }}>
            {reqs.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: i ? 10 : 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: PV.mint, flexShrink: 0, marginTop: 6 }} />
                <span style={{ fontFamily: PV.body, fontSize: 13.5, color: PV.ink, lineHeight: 1.4 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* WHAT YOU GET */}
      {inc.length > 0 && (
        <div style={{ padding: '18px 20px 0' }}>
          <BlockLabel>What you get</BlockLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inc.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, background: PV.mintTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><Check /></span>
                <span style={{ fontFamily: PV.body, fontSize: 14, color: PV.ink, lineHeight: 1.45 }}>{it}</span>
              </div>
            ))}
            {whatYouGet.filter((x) => x && x.trim()).length > inc.length && <div style={{ fontFamily: PV.body, fontSize: 12, color: PV.faint, paddingLeft: 33 }}>+ {whatYouGet.filter((x) => x && x.trim()).length - inc.length} more</div>}
          </div>
        </div>
      )}
      {/* ANALYTICS TO TRACK */}
      {metrics.length > 0 && (
        <div style={{ padding: '28px 20px 0' }}>
          <BlockLabel hint="Watch these grow">Analytics to track</BlockLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {metrics.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, border: `1.5px solid ${PV.line}`, borderRadius: 14, background: '#fff', padding: '12px 14px' }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: PV.mintTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PV.mintDark} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
                </span>
                <span style={{ flex: 1, fontFamily: PV.body, fontSize: 14, color: PV.ink }}>{a}</span>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: PV.body, fontSize: 12, color: PV.faint, marginTop: 10, lineHeight: 1.45 }}>The numbers this campaign is built to lift. Watch them grow in your Insights.</div>
        </div>
      )}
      {/* BUY FOOTER */}
      <div style={{ marginTop: 24, background: '#fff', borderTop: `1px solid ${PV.line}`, boxShadow: '0 -10px 28px rgba(20,40,30,0.10)', padding: '11px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
          <span style={{ fontFamily: PV.body, fontSize: 12.5, fontWeight: 600, color: PV.sub }}>Your total</span>
          <span style={{ fontFamily: PV.head, fontSize: 21, fontWeight: 700, color: PV.ink, letterSpacing: '-0.4px' }}>{priceLabel || 'Free'}</span>
        </div>
        <div style={{ width: '100%', height: 52, borderRadius: 26, background: PV.mint, color: '#fff', fontFamily: PV.head, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 22px rgba(74,189,152,0.42)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>Add to plan
        </div>
      </div>
    </div>
  )
}
