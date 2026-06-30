'use client'

/**
 * /dashboard/market-preview — STANDALONE prototype of the FULL campaign journey
 * with the marketplace built in (mock data, nothing persists). Flow: browse and
 * choose a campaign -> see its plan -> pick ONE look (which staffs a vetted
 * specialist per creative piece) -> confirm. Price is fixed and Apnosh-set; the
 * owner chooses on taste, never on price, and approves every piece before ship.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Sparkles, Check, ArrowRight, ShieldCheck, Video, Camera, Palette, Mail, MapPin, Megaphone, Star } from 'lucide-react'
import { C, DISPLAY, GRAD } from '@/components/campaigns/ui'

type Disc = 'Video' | 'Photo' | 'Design'
const DISC_ICON: Record<Disc, typeof Video> = { Video, Photo: Camera, Design: Palette }
const SYS_ICON = { mail: Mail, map: MapPin, ads: Megaphone } as const

type Piece = { label: string; sub: string; price: number } & (
  | { creative: true; discipline: Disc }
  | { creative: false; sys: keyof typeof SYS_ICON }
)
type Campaign = { id: string; title: string; sub: string; emoji: string; pieces: Piece[] }

const CAMPAIGNS: Campaign[] = [
  {
    id: 'slow', title: 'Fill your slow nights', sub: 'Turn quiet weeknights into covers', emoji: '🌙',
    pieces: [
      { label: 'A reel for your slow-night special', sub: 'Short video for Instagram + TikTok', creative: true, discipline: 'Video', price: 120 },
      { label: 'A slow-night promo graphic', sub: 'For stories and a printed table card', creative: true, discipline: 'Design', price: 70 },
      { label: 'A slow-night offer, by email + text', sub: 'Sent to your list, runs on its own', creative: false, sys: 'mail', price: 85 },
      { label: 'A Google Business post', sub: 'So you show up when people search', creative: false, sys: 'map', price: 35 },
    ],
  },
  {
    id: 'winback', title: 'Win back quiet guests', sub: 'Bring back people who drifted away', emoji: '💛',
    pieces: [
      { label: 'A "we miss you" reel', sub: 'A warm nudge to come back', creative: true, discipline: 'Video', price: 120 },
      { label: 'A come-back promo graphic', sub: 'For stories and posts', creative: true, discipline: 'Design', price: 70 },
      { label: 'A win-back offer, by email + text', sub: 'Auto-sent after a guest goes quiet', creative: false, sys: 'mail', price: 85 },
    ],
  },
  {
    id: 'newlocals', title: 'Get found by new locals', sub: 'Reach nearby people who have never been', emoji: '📣',
    pieces: [
      { label: 'A reel introducing your spot', sub: 'For people who have never come in', creative: true, discipline: 'Video', price: 120 },
      { label: 'A photo set of your best dishes', sub: 'For your posts, menu, and listing', creative: true, discipline: 'Photo', price: 90 },
      { label: 'Polish your Google profile', sub: 'Hours, photos, and the info people see', creative: false, sys: 'map', price: 40 },
      { label: 'Local ads to nearby people', sub: 'We set them up and run them', creative: false, sys: 'ads', price: 60 },
    ],
  },
  {
    id: 'event', title: 'Promote an event', sub: 'Pack your next big night', emoji: '🎫',
    pieces: [
      { label: 'A hype reel for the event', sub: 'Short video to drive RSVPs', creative: true, discipline: 'Video', price: 120 },
      { label: 'An event graphic', sub: 'For stories, posts, and a flyer', creative: true, discipline: 'Design', price: 70 },
      { label: 'An invite, by email + text', sub: 'Sent to your list', creative: false, sys: 'mail', price: 85 },
      { label: 'A Google event post', sub: 'So it shows up in search', creative: false, sys: 'map', price: 35 },
    ],
  },
]

type Creator = { name: string; rating: number; jobs: number; tones: string[] }
const LOOKS = [
  {
    id: 'warm', label: 'Warm & rustic', desc: 'Cozy, natural light, homey', tones: ['#d8a06a', '#b56b42', '#8a5638'],
    team: {
      Video: { name: 'Maya R.', rating: 4.9, jobs: 47, tones: ['#d8a06a', '#b56b42', '#8a5638'] },
      Photo: { name: 'Lena P.', rating: 4.8, jobs: 61, tones: ['#caa074', '#a86b46', '#7e5236'] },
      Design: { name: 'Priya N.', rating: 4.9, jobs: 34, tones: ['#e0b483', '#c07a4a', '#90603c'] },
    } as Record<Disc, Creator>,
  },
  {
    id: 'clean', label: 'Clean & modern', desc: 'Bright, minimal, upscale', tones: ['#cfe0f2', '#9fc0e8', '#7099d0'],
    team: {
      Video: { name: 'Devon K.', rating: 4.8, jobs: 58, tones: ['#cfe0f2', '#9fc0e8', '#7099d0'] },
      Photo: { name: 'Theo M.', rating: 4.9, jobs: 72, tones: ['#dbe7f3', '#aecbe8', '#82a4d2'] },
      Design: { name: 'Jordan L.', rating: 4.7, jobs: 40, tones: ['#c6d8ec', '#94b6df', '#6b8fc8'] },
    } as Record<Disc, Creator>,
  },
  {
    id: 'bold', label: 'Bold & punchy', desc: 'High-energy, trendy, scroll-stopping', tones: ['#ef6aa0', '#f5a93f', '#8a63e0'],
    team: {
      Video: { name: 'Sam T.', rating: 4.7, jobs: 39, tones: ['#ef6aa0', '#f5a93f', '#8a63e0'] },
      Photo: { name: 'Rae B.', rating: 4.8, jobs: 44, tones: ['#f57ab0', '#ffb74d', '#9a72e8'] },
      Design: { name: 'Kai W.', rating: 4.9, jobs: 51, tones: ['#ea5e98', '#f59e2f', '#7d56d2'] },
    } as Record<Disc, Creator>,
  },
]
type Look = (typeof LOOKS)[number]

const total = (c: Campaign) => c.pieces.reduce((s, p) => s + p.price, 0)
const discs = (c: Campaign) => [...new Set(c.pieces.filter((p): p is Extract<Piece, { creative: true }> => p.creative).map((p) => p.discipline))]

type Step = 'browse' | 'plan' | 'look' | 'confirm'

export default function MarketPreviewPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('browse')
  const [camp, setCamp] = useState<Campaign | null>(null)
  const [look, setLook] = useState<Look | null>(null)
  const [apnoshPick, setApnoshPick] = useState(false)
  const chosen = apnoshPick ? LOOKS[0] : look

  const back = () => {
    if (step === 'plan') setStep('browse')
    else if (step === 'look') setStep('plan')
    else if (step === 'confirm') setStep('look')
    else router.push('/dashboard/campaigns')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', height: '100dvh' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
          <button onClick={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}><ChevronLeft size={18} /> Back</button>
          <div style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, color: C.ink }}><Sparkles size={15} color={C.green} /> New campaign</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 28px' }}>
          {step === 'browse' && <BrowseStep onPick={(c) => { setCamp(c); setStep('plan') }} />}
          {step === 'plan' && camp && <PlanStep camp={camp} />}
          {step === 'look' && camp && <LookStep disciplines={discs(camp)} onPick={(l) => { setLook(l); setApnoshPick(false); setStep('confirm') }} onApnosh={() => { setApnoshPick(true); setStep('confirm') }} />}
          {step === 'confirm' && camp && chosen && <ConfirmStep camp={camp} look={chosen} apnoshPick={apnoshPick} />}
        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: '#fff' }}>
          {step === 'browse' && <p style={{ textAlign: 'center', fontSize: 12.5, color: C.faint, margin: 0 }}>Pick a campaign to see the plan and choose a look.</p>}
          {step === 'plan' && <Cta label="Choose your look" onClick={() => setStep('look')} />}
          {step === 'look' && <p style={{ textAlign: 'center', fontSize: 12.5, color: C.faint, margin: 0 }}>One look styles every piece. You approve each one before it ships.</p>}
          {step === 'confirm' && <Cta label="Add this campaign" onClick={() => router.push('/dashboard/campaigns')} />}
        </div>
      </div>
    </div>
  )
}

function Cta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {label} <ArrowRight size={17} />
    </button>
  )
}

/** A style preview: tinted tiles standing in for a creator's reel thumbnails /
 *  portfolio. In production these become real images from the vendor's profile. */
function MoodStrip({ tones, h }: { tones: string[]; h: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, height: h }} aria-hidden="true">
      {tones.map((t, i) => (
        <div key={i} style={{ flex: 1, borderRadius: 8, background: `linear-gradient(150deg, ${t}, rgba(0,0,0,0.24))`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)' }} />
      ))}
    </div>
  )
}

function BrowseStep({ onPick }: { onPick: (c: Campaign) => void }) {
  return (
    <div>
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, margin: '0 0 4px' }}>Choose a campaign</h1>
      <p style={{ fontSize: 13, color: C.mute, margin: '0 0 16px' }}>Each one is a full plan, built and run for you. You pick the look; we staff vetted creators.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CAMPAIGNS.map((c) => {
          const n = c.pieces.length
          const creatives = c.pieces.filter((p) => p.creative).length
          return (
            <button key={c.id} onClick={() => onPick(c)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: `1px solid ${C.line}`, background: '#fff', borderRadius: 16, padding: '14px 15px', display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{ fontSize: 26, flexShrink: 0 }}>{c.emoji}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: C.ink }}>{c.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>{c.sub}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.faint, marginTop: 6 }}>{n} pieces · {creatives} creative · from ${total(c)}</span>
              </span>
              <ArrowRight size={17} color={C.faint} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PlanStep({ camp }: { camp: Campaign }) {
  const creatives = camp.pieces.filter((p) => p.creative).length
  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.greenSoft, color: C.greenDk, borderRadius: 99, padding: '4px 11px', fontWeight: 700, fontSize: 11, marginBottom: 12 }}>
        <Sparkles size={12} /> Your plan
      </div>
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 23, margin: '0 0 6px', lineHeight: 1.2 }}>{camp.title}</h1>
      <p style={{ fontSize: 13, color: C.mute, margin: '0 0 16px', lineHeight: 1.5 }}>{camp.pieces.length} pieces. {creatives} need a creative hand (you pick the look); the rest run on their own.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {camp.pieces.map((p, i) => {
          const Icon = p.creative ? DISC_ICON[p.discipline] : SYS_ICON[p.sys]
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 13px' }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, background: p.creative ? C.greenSoft : '#f1f4f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={17} color={p.creative ? C.greenDk : C.mute} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{p.label}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>{p.sub}</div>
                <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: p.creative ? C.greenDk : C.faint, background: p.creative ? C.greenSoft : '#f1f4f2', borderRadius: 6, padding: '2px 7px' }}>{p.creative ? `${p.discipline} · you pick the look` : 'Runs on its own'}</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, flexShrink: 0 }}>${p.price}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, padding: '0 2px' }}>
        <span style={{ fontSize: 13, color: C.mute }}>About</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>${total(camp)}</span>
      </div>
      <p style={{ fontSize: 12, color: C.faint, margin: '4px 2px 0', textAlign: 'right' }}>You only pay as each piece ships, after you approve it.</p>
    </div>
  )
}

function LookStep({ disciplines, onPick, onApnosh }: { disciplines: Disc[]; onPick: (l: Look) => void; onApnosh: () => void }) {
  return (
    <div>
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 23, margin: '0 0 6px', lineHeight: 1.2 }}>Pick a look</h1>
      <p style={{ fontSize: 13, color: C.mute, margin: '0 0 14px', lineHeight: 1.5 }}>One choice styles all {disciplines.length} creative pieces. We match a vetted {disciplines.map((d) => d.toLowerCase()).join(', ')} creator to it, so everything feels like one brand. Same price either way.</p>

      <button onClick={onApnosh} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: `1.5px solid ${C.green}`, background: C.greenSoft, borderRadius: 16, padding: '13px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={18} color={C.green} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: C.greenDk }}>Let Apnosh choose the look</span>
          <span style={{ display: 'block', fontSize: 12, color: C.greenDk, opacity: 0.85, marginTop: 1 }}>We match the best fit for your brand. Fastest.</span>
        </span>
        <ArrowRight size={17} color={C.greenDk} />
      </button>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, margin: '4px 0 10px' }}>Or pick a style</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LOOKS.map((l) => (
          <button key={l.id} onClick={() => onPick(l)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: `1px solid ${C.line}`, background: '#fff', borderRadius: 16, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '6px 6px 0' }}><MoodStrip tones={l.tones} h={80} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: C.ink }}>{l.label}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>{l.desc}</span>
              </span>
              <ArrowRight size={16} color={C.faint} />
            </div>
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.faint, margin: '16px 2px 0', lineHeight: 1.5 }}>Want a specific person? After you pick a look you can swap any creator on the team.</p>
    </div>
  )
}

function ConfirmStep({ camp, look, apnoshPick }: { camp: Campaign; look: Look; apnoshPick: boolean }) {
  const disciplines = discs(camp)
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 8px 18px' }}>
        <div style={{ width: 66, height: 66, borderRadius: 33, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Check size={32} color={C.greenDk} /></div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 23, margin: '0 0 6px' }}>Your team is set</h1>
        <p style={{ fontSize: 13.5, color: C.mute, margin: 0, lineHeight: 1.5, maxWidth: 320 }}>
          <b>{camp.title}</b>, with a {look.label.toLowerCase()} look{apnoshPick ? ' we picked for you' : ''}, and the right creator on each piece.
        </p>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, margin: '0 0 10px' }}>Your creators</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {disciplines.map((d) => {
          const Icon = DISC_ICON[d]
          const cr = look.team[d]
          const initials = cr.name.split(' ').map((x) => x[0]).join('')
          return (
            <div key={d} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
                <span style={{ width: 36, height: 36, borderRadius: 18, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{cr.name}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, color: C.mute }}><Star size={11} color="#f5a623" fill="#f5a623" /> {cr.rating}</span>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.mute, marginTop: 1 }}><Icon size={11} /> {d} · {cr.jobs} for restaurants</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.green, cursor: 'pointer', flexShrink: 0 }}>Swap</span>
              </div>
              <MoodStrip tones={cr.tones} h={44} />
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px' }}>
        <span style={{ fontSize: 13, color: C.mute }}>{camp.pieces.length}-piece campaign</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>${total(camp)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: C.greenSoft, color: C.greenDk, borderRadius: 12, padding: '11px 12px', marginTop: 14, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
        <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>You approve every piece before it goes out, and you only pay as each one ships. If something is not right, we make it right or you do not pay.</span>
      </div>
    </div>
  )
}
