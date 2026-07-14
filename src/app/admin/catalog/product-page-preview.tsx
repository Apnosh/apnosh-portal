'use client'
/**
 * ProductPagePreview — a faithful, prop-driven replica of the live customer product page
 * (apnosh-campaign.jsx ProductPage). The admin editors feed it the exact words + derived
 * facts they are about to publish, so "how the customer sees it" matches the real store
 * section-by-section: hero (chips, eyebrow, headline, product tile), the sell copy, how
 * it's done, what we'll need, what you get, analytics to track, and the buy footer.
 *
 * In `interactive` mode each section is clickable and hover-highlights, so the campaign
 * editor can work like a page builder: click a section on the page to jump to its editor.
 */
import { useState } from 'react'
import type { CSSProperties, HTMLAttributes } from 'react'
import type { FunnelStage } from '@/lib/campaigns/data/create-catalog'
import { STAGE_TAG_LABEL } from '@/lib/campaigns/data/create-catalog'
import type { TimelineStep } from '@/lib/campaigns/data/campaign-timeline'

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
  /** The "How it's done" detail line (used when `lanes` is not given). */
  howItsDone?: string
  /** gbp-style: show a Google-listing card as the product shot instead of the art tile. */
  googleTile?: boolean
  businessName?: string
  rating?: { value: number; count: number } | null
  /** When set, render the 3-tab "Choose how it's done" picker instead of the single line. */
  lanes?: { label: string; price: string; pro?: boolean }[]
  selectedLane?: number
  laneDetail?: string
  /** When set, render the "When you'll have it" section with computed dates. */
  timeline?: TimelineStep[]
  /** Page-builder mode: sections become clickable + hover-highlight. */
  interactive?: boolean
  active?: string | null
  onSection?: (key: string) => void
}

/** today + n business-ish days → "Mon, Jul 20". Runs at render (app runtime, not a workflow). */
function fmtDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function GoogleTile({ name, rating }: { name: string; rating?: { value: number; count: number } | null }) {
  return (
    <div style={{ width: '100%', background: '#fff', borderRadius: 18, padding: '15px 16px 14px', boxShadow: '0 14px 34px rgba(20,45,33,0.14), 0 2px 6px rgba(20,45,33,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <svg width="15" height="15" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" /></svg>
        <span style={{ fontFamily: PV.body, fontSize: 11, fontWeight: 600, color: PV.faint, letterSpacing: '0.2px' }}>Your Google listing</span>
      </div>
      <div style={{ fontFamily: PV.head, fontSize: 18, fontWeight: 700, color: PV.ink, lineHeight: 1.2 }}>{name || 'Your business'}</div>
      {rating && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
          <span style={{ fontFamily: PV.body, fontSize: 13.5, fontWeight: 700, color: '#a5670a' }}>{rating.value.toFixed(1)}</span>
          <span style={{ color: '#f5b301', fontSize: 13, letterSpacing: '1px' }}>{'★★★★★'.slice(0, Math.round(rating.value))}<span style={{ color: '#e2e5e1' }}>{'★★★★★'.slice(Math.round(rating.value))}</span></span>
          <span style={{ fontFamily: PV.body, fontSize: 12.5, color: PV.sub }}>({rating.count.toLocaleString()})</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
        {['Directions', 'Call', 'Website'].map((l) => (
          <span key={l} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: '#f4f7fb', borderRadius: 12, padding: '9px 4px', fontFamily: PV.body, fontSize: 10.5, fontWeight: 600, color: '#4a7fd0' }}>{l}</span>
        ))}
      </div>
    </div>
  )
}

export function ProductPagePreview(props: ProductPagePreviewProps) {
  const {
    eyebrow, headline, description, why, stages, cadenceLabel,
    priceLabel, whatYouGet, requirements, analytics, heroImage,
    howItsDone = 'The Apnosh team does this for you.',
    googleTile, businessName, rating, lanes, selectedLane, laneDetail, timeline,
    interactive, active, onSection,
  } = props
  const [hover, setHover] = useState<string | null>(null)
  const selLane = selectedLane ?? (lanes ? lanes.length - 1 : 0)
  const inc = whatYouGet.filter((x) => x && x.trim()).slice(0, 6)
  const reqs = requirements.filter((x) => x && x.trim())
  const metrics = analytics.filter((x) => x && x.trim())

  // Section wrapper props: adds click + hover-highlight in interactive mode, merged onto the
  // section's own style so layout is untouched when interactive is off.
  const si = (key: string, base: CSSProperties = {}): HTMLAttributes<HTMLElement> & { style: CSSProperties } => {
    if (!interactive) return { style: base }
    const on = active === key
    const hot = hover === key
    return {
      onClick: (e) => { e.stopPropagation(); onSection?.(key) },
      onMouseEnter: () => setHover(key),
      onMouseLeave: () => setHover((h) => (h === key ? null : h)),
      style: { ...base, cursor: 'pointer', outline: on ? `2px solid ${PV.mint}` : hot ? `2px dashed ${PV.mint}` : undefined, outlineOffset: '-3px', borderRadius: 10, transition: 'outline 0.1s' },
    }
  }

  return (
    <div style={{ borderRadius: 22, overflow: 'hidden', background: '#fff', border: `1px solid ${PV.line}`, boxShadow: '0 10px 34px rgba(20,45,33,0.10)', fontFamily: PV.body }}>
      {/* HERO */}
      <div {...si('hero', { background: PV.heroGrad, padding: '14px 20px 26px', position: 'relative', overflow: 'hidden' })}>
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
            {googleTile ? (
              <GoogleTile name={businessName ?? 'Your business'} rating={rating} />
            ) : heroImage ? (
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
          {description?.trim() && <p {...si('description', { margin: 0, fontFamily: PV.body, fontSize: 14.5, color: '#4c554f', lineHeight: 1.55 })}>{description.trim()}</p>}
          {why?.trim() && <p {...si('why', { margin: '10px 0 0', fontFamily: PV.body, fontSize: 13.5, color: PV.sub, lineHeight: 1.55 })}>{why.trim()}</p>}
        </div>
      )}
      {/* HOW IT'S DONE — 3-lane picker when lanes are given, else the single quiet line */}
      <div {...si('lanes', { padding: '22px 20px 0' })}>
        {lanes && lanes.length > 0 ? (
          <>
            <BlockLabel>Choose how it&apos;s done</BlockLabel>
            <div style={{ display: 'flex', gap: 7 }}>
              {lanes.map((l, i) => {
                const on = i === selLane
                return (
                  <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textAlign: 'center', background: on ? PV.mint : '#fff', border: `1.5px solid ${on ? PV.mint : PV.line}`, borderRadius: 14, padding: '11px 6px', boxShadow: on ? '0 4px 14px rgba(74,189,152,0.30)' : '0 1px 2px rgba(20,40,30,0.03)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                      <span style={{ fontFamily: PV.head, fontSize: 13, fontWeight: 600, color: on ? '#fff' : PV.ink, whiteSpace: 'nowrap' }}>{l.label}</span>
                      {l.pro && <span style={{ background: on ? 'rgba(255,255,255,0.24)' : '#eaf7f3', color: on ? '#fff' : '#2e9a78', fontSize: 8.5, fontWeight: 800, letterSpacing: '0.4px', borderRadius: 5, padding: '1.5px 4px' }}>PRO</span>}
                    </span>
                    <span style={{ fontFamily: PV.body, fontSize: 12, fontWeight: 700, color: on ? 'rgba(255,255,255,0.92)' : PV.mintDark }}>{l.price || 'Free'}</span>
                  </div>
                )
              })}
            </div>
            {laneDetail && <div style={{ fontFamily: PV.body, fontSize: 12.5, color: PV.sub, lineHeight: 1.45, marginTop: 10 }}>{laneDetail}</div>}
          </>
        ) : (
          <>
            <BlockLabel>How it&apos;s done</BlockLabel>
            <div style={{ fontFamily: PV.body, fontSize: 13.5, color: PV.sub, lineHeight: 1.45 }}>{howItsDone}</div>
          </>
        )}
      </div>
      {/* WHEN YOU'LL HAVE IT */}
      {timeline && timeline.length > 0 && (
        <div {...si('timeline', { padding: '20px 20px 0' })}>
          <BlockLabel>When you&apos;ll have it</BlockLabel>
          <div style={{ background: '#f7f9f8', borderRadius: 14, padding: '13px 15px' }}>
            {timeline.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: i ? 12 : 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: PV.mint, flexShrink: 0, marginTop: 6 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: PV.body, fontSize: 13.5, color: PV.ink, lineHeight: 1.4 }}>{s.text}{typeof s.whenDays === 'number' ? <> by around <span style={{ fontWeight: 700 }}>{fmtDate(s.whenDays)}</span></> : null}</div>
                  {s.sub && <div style={{ fontFamily: PV.body, fontSize: 12, color: PV.sub, lineHeight: 1.45, marginTop: 2 }}>{s.sub}</div>}
                </div>
              </div>
            ))}
            {timeline.some((s) => typeof s.whenDays === 'number') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13, paddingTop: 11, borderTop: `1px solid ${PV.line}` }}>
                <span style={{ fontFamily: PV.body, fontSize: 11, color: PV.faint }}>These are estimates.</span>
                <span style={{ color: '#c7ccc8' }}>·</span>
                <span style={{ fontFamily: PV.body, fontSize: 12.5, fontWeight: 600, color: PV.mintDark }}>Need it faster?</span>
              </div>
            )}
          </div>
        </div>
      )}
      {/* WHAT WE'LL NEED FROM YOU */}
      {reqs.length > 0 && (
        <div {...si('requirements', { padding: '20px 20px 0' })}>
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
        <div {...si('get', { padding: '18px 20px 0' })}>
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
        <div {...si('analytics', { padding: '28px 20px 0' })}>
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
      <div {...si('footer', { marginTop: 24, background: '#fff', borderTop: `1px solid ${PV.line}`, boxShadow: '0 -10px 28px rgba(20,40,30,0.10)', padding: '11px 18px 14px' })}>
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
