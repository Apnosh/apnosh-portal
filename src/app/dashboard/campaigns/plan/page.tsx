'use client'

/**
 * /dashboard/campaigns/plan — the AI Marketing Plan Builder, end to end.
 *
 * The owner picks a goal + a monthly budget. We diagnose the one binding
 * constraint, then select + price a real plan from the closed catalog and show
 * it for approval. The model never prices — every number comes from code.
 * Approving saves the returned draft via the existing POST /api/campaigns and
 * opens the saved campaign.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, Sparkles, Rocket } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { summarize } from '@/lib/campaigns/types'
import HonestBillBar from '@/components/campaigns/honest-bill-bar'
import { C, DISPLAY, GRAD } from '@/components/campaigns/ui'
import type { BuiltPlan } from '@/lib/campaigns/planning/build-plan'

const GOALS = [
  { key: 'new-customers', label: 'Get more new customers', icon: '📣' },
  { key: 'regulars', label: 'Turn visitors into regulars', icon: '💛' },
  { key: 'slow-nights', label: 'Fill the slow nights', icon: '🌙' },
  { key: 'reviews', label: 'Fix our reviews and rating', icon: '⭐' },
]
const BUDGETS = [400, 600, 800, 1200, 1800, 2500]
const BUILDING_LINES = ['Reading your reviews and listings', 'Finding the one thing holding you back', 'Choosing the plays that fix it', 'Pricing every piece']

export default function PlanPage() {
  const router = useRouter()
  const { client } = useClient()
  const [goalKey, setGoalKey] = useState<string | null>(null)
  const [budget, setBudget] = useState(800)
  const [phase, setPhase] = useState<'setup' | 'building' | 'review'>('setup')
  const [plan, setPlan] = useState<BuiltPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function build() {
    if (!client?.id) return
    setErr(null); setPhase('building')
    try {
      const res = await fetch('/api/campaigns/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, goalKey, budgetMonthly: budget }),
      })
      if (!res.ok) throw new Error('Could not build the plan. Try again.')
      setPlan((await res.json()) as BuiltPlan)
      setPhase('review')
    } catch (e) {
      setErr((e as Error).message); setPhase('setup')
    }
  }

  async function approve() {
    if (!client?.id || !plan) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, draft: plan.draft }),
      })
      if (!res.ok) throw new Error()
      const { id } = (await res.json()) as { id?: string }
      if (!id) throw new Error()
      router.push(`/dashboard/campaigns/${id}`)
    } catch {
      setBusy(false); setErr('Could not save. Try again.')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', height: '100dvh' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
          <button onClick={() => (phase === 'review' ? setPhase('setup') : router.push('/dashboard/campaigns'))} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}><ChevronLeft size={18} /> Back</button>
          <div style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, color: C.ink }}><Sparkles size={15} color={C.green} /> Build my plan</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 28px' }}>
          {phase === 'setup' && (
            <Setup goalKey={goalKey} setGoalKey={setGoalKey} budget={budget} setBudget={setBudget} err={err} />
          )}
          {phase === 'building' && <Building />}
          {phase === 'review' && plan && <Review plan={plan} err={err} />}
        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: '#fff' }}>
          {phase === 'setup' && (
            <button onClick={build} disabled={!client?.id} style={ctaStyle(!!client?.id)}>
              <Sparkles size={17} /> Build my plan
            </button>
          )}
          {phase === 'building' && (
            <button disabled style={ctaStyle(false)}><Loader2 size={17} className="animate-spin" /> Building…</button>
          )}
          {phase === 'review' && plan && (
            <button onClick={approve} disabled={busy} style={ctaStyle(!busy)}>
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Rocket size={17} />} Approve and save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ctaStyle(enabled: boolean): React.CSSProperties {
  return { width: '100%', background: enabled ? GRAD : '#c9cdcb', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 15, cursor: enabled ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }
}

function Setup({ goalKey, setGoalKey, budget, setBudget, err }: { goalKey: string | null; setGoalKey: (k: string | null) => void; budget: number; setBudget: (n: number) => void; err: string | null }) {
  return (
    <div>
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, margin: '0 0 4px' }}>What should we focus on?</h1>
      <p style={{ fontSize: 13, color: C.mute, margin: '0 0 16px' }}>Pick a goal and a monthly budget. We do the rest, and you approve before anything ships.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 22 }}>
        {GOALS.map((g) => {
          const on = goalKey === g.key
          return (
            <button key={g.key} onClick={() => setGoalKey(on ? null : g.key)} style={{ textAlign: 'left', cursor: 'pointer', border: `1.5px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff', borderRadius: 14, padding: '12px 12px' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{g.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{g.label}</div>
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Monthly budget</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {BUDGETS.map((b) => {
          const on = budget === b
          return (
            <button key={b} onClick={() => setBudget(b)} style={{ cursor: 'pointer', border: `1.5px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff', color: on ? C.greenDk : C.ink, borderRadius: 22, padding: '9px 16px', fontSize: 14, fontWeight: 700 }}>${b}/mo</button>
          )
        })}
      </div>
      {err && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 16 }}>{err}</p>}
    </div>
  )
}

function Building() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, BUILDING_LINES.length - 1)), 1400)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
      <Loader2 size={34} className="animate-spin" color={C.green} style={{ marginBottom: 20 }} />
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 19, color: C.ink, marginBottom: 8 }}>Building your plan</div>
      <div style={{ fontSize: 14, color: C.mute, minHeight: 20 }}>{BUILDING_LINES[i]}</div>
    </div>
  )
}

function Review({ plan, err }: { plan: BuiltPlan; err: string | null }) {
  const d = plan.diagnosis
  const items = plan.draft.items
  const included = items.filter((it) => it.included)
  const recommended = items.filter((it) => !it.included)
  const bill = summarize(items)

  return (
    <div>
      {/* the diagnosis */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.greenSoft, color: C.greenDk, borderRadius: 99, padding: '4px 11px', fontWeight: 700, fontSize: 11, marginBottom: 12 }}>
        <Sparkles size={12} /> {plan.diagnosisSource === 'ai' ? 'Strategist' : 'Baseline'} read
      </div>
      <p style={{ fontSize: 14, color: C.ink, lineHeight: 1.5, margin: '0 0 14px' }}>{d.situation}</p>
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 18 }}>
        <Row label="The one thing to fix" value={d.bindingConstraint} strong />
        <Row label="The bet" value={d.bet} />
        {d.skip.length > 0 && <Row label="Skip for now" value={d.skip.map((s) => s.what).join(', ')} />}
      </div>

      {plan.budgetGap && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 12, padding: '11px 12px', marginBottom: 16, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
          The plan to fix this needs about ${plan.budgetGap.needed}/mo. You set ${plan.budgetGap.set}/mo, so we kept the core and flagged the rest.
        </div>
      )}

      <h2 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, margin: '0 0 10px' }}>Your plan</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {included.map((it) => <ItemRow key={it.id} name={it.plain || it.name} does={it.does} price={it.optOut ? null : it.price} cadence={it.cadence.kind} owned={!!it.optOut} />)}
      </div>

      {recommended.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Go further (a bit more budget)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recommended.map((it) => <ItemRow key={it.id} name={it.plain || it.name} does={it.does} price={it.price} cadence={it.cadence.kind} muted />)}
          </div>
        </div>
      )}

      {plan.unlock && (
        <p style={{ fontSize: 12.5, color: C.mute, marginTop: 14 }}>About ${plan.unlock.addlMonthly}/mo more would unlock {plan.unlock.name}.</p>
      )}

      <div style={{ marginTop: 18 }}>
        <HonestBillBar items={items} note="Approving is free. Each piece bills only when it ships." />
      </div>
      {err && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 14 }}>{err}</p>}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid #f3f6f4' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: strong ? 15 : 13.5, fontWeight: strong ? 700 : 500, color: C.ink, lineHeight: 1.4 }}>{value}</div>
    </div>
  )
}

function ItemRow({ name, does, price, cadence, owned, muted }: { name: string; does: string; price: number | null; cadence: string; owned?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 13px', opacity: muted ? 0.85 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{name}</div>
        {does && <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>{does}</div>}
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        {owned ? <span style={{ fontSize: 12, fontWeight: 700, color: C.greenDk }}>You have it</span>
          : price != null ? <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>${price}{cadence === 'recurring' ? '/mo' : ''}</span>
            : null}
      </div>
    </div>
  )
}
