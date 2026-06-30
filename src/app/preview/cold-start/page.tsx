/**
 * DEV-ONLY preview of cold-start signal-fit tailoring. Renders the REAL firstvisit plan
 * (brainRankedMix -> spec.aiMix -> composePlanForGoal, plus signalFitLead) for several fresh
 * businesses with no campaign history, so the tailoring can be seen in a browser without an
 * authenticated builder session and without writing anything to the DB. Not prod.
 */
import { notFound } from 'next/navigation'
import { emptySignals, planRoute, type BrainSignals } from '@/lib/campaigns/brain/signals'
import { reading } from '@/lib/campaigns/brain/readiness'
import { brainRankedMix } from '@/lib/campaigns/brain/rank'
import { composePlanForGoal, SYSTEM_STAGES, planLeadHeadline } from '@/lib/campaigns/builder/compose-plan'

export const dynamic = 'force-dynamic'

type Move = { serviceId: string; stage: string; role: string }

function profileBlank(): BrainSignals { return emptySignals() }
function profileLowRating(): BrainSignals {
  const s = emptySignals()
  s.rating = reading(4.1); s.ratingCount = reading(60); s.listingCompleteness = reading(0.85); s.hasList = reading(true)
  s.cuisine = reading('Italian'); s.neighborhood = reading('Lincoln Park'); s.priceRange = reading('$$')
  return s
}
function profileNoList(): BrainSignals {
  const s = emptySignals()
  s.rating = reading(4.7); s.ratingCount = reading(90); s.listingCompleteness = reading(0.85); s.hasList = reading(false)
  s.cuisine = reading('Tacos'); s.priceRange = reading('$')
  return s
}
function profilePoorListing(): BrainSignals {
  const s = emptySignals()
  s.rating = reading(4.6); s.ratingCount = reading(50); s.listingCompleteness = reading(0.45); s.hasList = reading(true)
  s.cuisine = reading('Sushi'); s.priceRange = reading('$$$')
  return s
}

const PROFILES: { name: string; tag: string; build: () => BrainSignals }[] = [
  { name: 'Blank restaurant', tag: 'no signals yet', build: profileBlank },
  { name: 'Low rating', tag: 'Google 4.1', build: profileLowRating },
  { name: 'No email list', tag: 'no list', build: profileNoList },
  { name: 'Half-built listing', tag: '45% complete', build: profilePoorListing },
]

function planFor(signals: BrainSignals): { lead: string | null; route: string; moves: Move[] } {
  const mix = brainRankedMix('firstvisit', 'standard', signals).mix
  const plan = composePlanForGoal('firstvisit', { budget: '500', aiMix: mix.join(',') }) as { moves?: Move[] }
  return { lead: planLeadHeadline('firstvisit', mix, signals), route: planRoute(signals), moves: plan.moves ?? [] }
}

const STAGE_TITLE: Record<string, string> = Object.fromEntries(
  SYSTEM_STAGES.firstvisit.map((s) => [s.stage, s.title]),
)
const STAGE_ORDER = SYSTEM_STAGES.firstvisit.map((s) => s.stage)

export default function ColdStartPreview() {
  if (process.env.NODE_ENV === 'production') notFound()

  const columns = PROFILES.map((p) => ({ ...p, plan: planFor(p.build()) }))

  return (
    <div style={{ minHeight: '100vh', background: '#0b0d12', color: '#e7e9ee', padding: '28px', fontFamily: 'ui-sans-serif, system-ui, -apple-system' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Cold-start tailoring — Win first-time visits</h1>
        <p style={{ color: '#9aa1ad', margin: '0 0 24px', fontSize: 14 }}>
          The same goal, four fresh restaurants with no campaign history. Each plan is built by the real brain. The
          first service in each stage is the leader. Watch how it shifts with the business.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {columns.map((c) => {
            const byStage = STAGE_ORDER.map((st) => ({ stage: st, title: STAGE_TITLE[st], moves: c.plan.moves.filter((m) => m.stage === st) }))
              .filter((g) => g.moves.length)
            return (
              <div key={c.name} data-col={c.name} style={{ background: '#141821', border: '1px solid #232a36', borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: '#7f8794', marginBottom: 10 }}>{c.tag} · route: <b style={{ color: c.plan.route === 'tailored' ? '#5fd08b' : '#c9a24a' }}>{c.plan.route}</b></div>

                <div data-lead style={{ minHeight: 56, background: c.plan.lead ? '#16241c' : '#1b1f29', border: `1px solid ${c.plan.lead ? '#2c6b46' : '#262d3a'}`, borderRadius: 10, padding: '8px 10px', fontSize: 12.5, lineHeight: 1.4, marginBottom: 14, color: c.plan.lead ? '#bdebcd' : '#8b93a1' }}>
                  {c.plan.lead ?? 'Expert default plan (no signal to tailor on yet).'}
                </div>

                {byStage.map((g, gi) => (
                  <div key={g.stage} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: '#6c7480', marginBottom: 5 }}>{gi + 1}. {g.title}</div>
                    {g.moves.slice(0, 4).map((m, mi) => (
                      <div key={m.serviceId} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '2px 0' }}>
                        <span style={{ fontSize: 11, fontWeight: mi === 0 ? 700 : 400, color: mi === 0 ? '#9ad0ff' : '#cdd2db' }}>
                          {mi === 0 ? '▸ ' : '· '}{m.serviceId}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
