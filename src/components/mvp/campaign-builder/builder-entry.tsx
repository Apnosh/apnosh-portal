'use client'

/**
 * Wrapper that feeds the ported campaign-builder design (apnosh-campaign.jsx)
 * real portal data: the owner's business name and menu items. Defines onClose
 * (exit to the campaigns list) and onCreate (Stage 4 will adapt the builder
 * output to a CampaignDraft + persist via createCampaign).
 */

import { useEffect, useState, type ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'
import { draftFromBuilder } from '@/lib/campaigns/builder/adapter'
import { resolveBrainGoal } from '@/lib/campaigns/builder/compose-plan'
import { CREATE_CATALOG_IDS } from '@/lib/campaigns/data/create-catalog'
import type { CampaignProfile } from '@/lib/campaigns/builder/campaign-profile'
import type { Diagnosis } from '@/lib/campaigns/planning/types'
import { summarize, type LineItem, type CampaignDraft, type PieceProducer, type CampaignReceipt } from '@/lib/campaigns/types'
import CampaignPlanFlow from '@/components/campaigns/plan-flow/campaign-plan-flow'
import PlanAnalyzing from '@/components/campaigns/plan-flow/plan-analyzing'
import OrderConfirmed from '@/components/campaigns/plan-flow/order-confirmed'
// apnosh-campaign is intentionally .jsx (untyped design code). TS infers a
// narrow props type from its defaults, so re-type it to the real prop surface.
import ApnoshCampaignRaw from './apnosh-campaign'

type MenuOpt = { l: string; photo?: string; f?: boolean }
type RecItem = { id: string; reason: string }
type CreatePayload = { itemId: string; status: string; vals: Record<string, unknown> }
type PlanPayload = { itemId: string; vals: Record<string, unknown> }
type BuilderProps = { restaurant?: string; menu?: MenuOpt[]; initialItem?: string; recommended?: RecItem[]; recsLoading?: boolean; monthlyCommitment?: number; liveCount?: number; monthlyCap?: number; hasList?: boolean; profile?: CampaignProfile | null; onCreate?: (p: CreatePayload) => Promise<boolean>; onClose?: () => void; onPlan?: (p: PlanPayload) => void }
const ApnoshCampaign = ApnoshCampaignRaw as unknown as ComponentType<BuilderProps>

// Honor ?template= deep-links from the discovery/preview pages + Home suggestions.
// Map the legacy 8 campaign-template ids onto the new catalog, and pass through
// a real catalog id; anything unknown just lands on the catalog (browse).
const TEMPLATE_MAP: Record<string, string> = {
  'fill-shifts': 'nights', 'new-menu': 'launch', event: 'launch',
  'recurring-night': 'nights', winback: 'winback', regulars: 'regulars',
  discover: 'reach', reviews: 'reviewsplan',
}
// Derived from the single-source create catalog so the deep-link validator can never drift from the
// set the recommend feed emits (scripts/verify-catalog-ids.ts guards it against the JSX render list).
const CATALOG_IDS = new Set(CREATE_CATALOG_IDS)

// A few catalog items ARE one of the brain's system goals under a different id. Alias them so the
// brain (buildSystem ordering + plan-mix) drives those goals too. Today only reviews: the catalog
// offers 'reviewsplan' (the lighter content version) instead of the 'reviews' system goal, so route
// it to the system reviews plan the other three system goals already use.
const SYSTEM_GOAL_ALIAS: Record<string, string> = { reviewsplan: 'reviews' }
// The strategist diagnosis (constraint + bet) speaks the business-goal vocabulary, not catalog ids.
// Only the four system goals get one: diagnosing an event plan against the STORED business goal
// could contradict the plan the owner is looking at, so event goals skip the call.
const DIAGNOSE_GOAL_KEY: Record<string, string> = { firstvisit: 'new-customers', nights: 'slow-nights', regulars: 'regulars', reviews: 'reviews' }
// Owner-facing goal phrase for the "analyzing" screen ("Locking onto your goal: …"). Falls back to a
// plain truthful label for any catalog id not listed.
const GOAL_PHRASE: Record<string, string> = {
  firstvisit: 'More first-time guests', reach: 'Getting discovered nearby', nights: 'Filling your slow nights',
  regulars: 'Bringing guests back', reviews: 'More 5-star reviews', reviewsplan: 'More 5-star reviews',
  winback: 'Winning back past guests', launch: 'Launching something new', promoevent: 'Promoting your event',
  dish: 'Showing off a dish', reel: 'A scroll-stopping reel',
}
const goalPhrase = (id: string) => GOAL_PHRASE[id] ?? 'Your goal'
function resolveInitialItem(template?: string): string | undefined {
  if (!template) return undefined
  return TEMPLATE_MAP[template] ?? (CATALOG_IDS.has(template) ? template : undefined)
}

export default function CampaignBuilderEntry({ template }: { template?: string }) {
  const router = useRouter()
  const { client } = useClient()
  const [menu, setMenu] = useState<MenuOpt[] | undefined>(undefined)
  const [recommended, setRecommended] = useState<RecItem[] | undefined>(undefined)
  const [recsLoading, setRecsLoading] = useState(false)
  const [commitment, setCommitment] = useState<{ perMonth: number; count: number }>({ perMonth: 0, count: 0 })
  const [monthlyCap, setMonthlyCap] = useState(0)
  // undefined while loading, then the real answer. Tri-state so an owner who DOES
  // have a list never momentarily defaults to social-only before the check lands.
  const [hasList, setHasList] = useState<boolean | undefined>(undefined)
  // The owner's real account profile (neighborhood, target audience, rating, …) so the madlib
  // arrives pre-filled from what onboarding already knew instead of static placeholders.
  const [profile, setProfile] = useState<CampaignProfile | null>(null)
  const initialItem = resolveInitialItem(template)
  // Carry profile facts the composer should use into the spec, without asking the owner for what we
  // already know: the neighborhood drives "near me" copy + the ad geo, and the live rating + count
  // let the composer hold paid reach when a low rating is the real ceiling (the reputation move).
  const applyProfile = (vals: Record<string, unknown>): Record<string, unknown> => {
    if (!profile) return vals
    const add: Record<string, unknown> = {}
    if (profile.neighborhood && !('neighborhood' in vals)) add.neighborhood = profile.neighborhood
    if (profile.rating != null && !('rating' in vals)) add.rating = String(profile.rating)
    if (profile.ratingCount != null && !('ratingCount' in vals)) add.ratingCount = String(profile.ratingCount)
    if (profile.presence != null && !('presence' in vals)) add.presence = String(profile.presence)
    return Object.keys(add).length ? { ...vals, ...add } : vals
  }
  // List handling. Items that ASK (a 'list' slot, e.g. a launch) respect the owner's choice but
  // get gated down to social-only when there is no connection, so the plan never promises a send
  // they can't make. Items that DON'T ask (firstvisit) auto-detect from the real connection — the
  // owner is never asked a question that invites them to skip people they already own.
  const applyList = (vals: Record<string, unknown>): Record<string, unknown> => {
    if ('list' in vals) return hasList === false ? { ...vals, list: 'social only' } : vals
    if (hasList === undefined) return vals // still loading; composer treats an absent list as none
    return { ...vals, list: hasList ? 'reaching your email + text list' : 'social only' }
  }
  // The plan flow (steps 2–3): after the madlib, the host overlays the breakdown + order
  // summary, then persists + ships on confirm. Overlays the builder so its madlib state
  // survives a Back.
  const [plan, setPlan] = useState<PlanPayload | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [planOutcome, setPlanOutcome] = useState<string | null>(null)
  const [planLead, setPlanLead] = useState<string | null>(null)
  // Honesty wiring: the AI's per-service reasons (selectMix already writes them; they were
  // discarded here before), the strategist's diagnosis (constraint + bet), and whether the
  // mix was GENUINELY tailored — drives the analyzing screen's finish copy so it never
  // claims "built around what we found" when the safe route or a failure kept the template.
  const [planReasons, setPlanReasons] = useState<Record<string, string> | null>(null)
  const [planDiagnosis, setPlanDiagnosis] = useState<{ diagnosis: Diagnosis; source: 'ai' | 'rules' } | null>(null)
  const [planTailored, setPlanTailored] = useState<boolean | null>(null)
  // The "AI is analyzing your business" screen plays over the plan while the brain tailors it. It
  // reveals the plan (sets false) when the staged steps finish AND the plan-mix call has resolved.
  const [analyzing, setAnalyzing] = useState(false)
  // After approve+ship: the "you're all set" confirmation screen (holds the new campaign id + its draft).
  const [confirmed, setConfirmed] = useState<{ id: string; draft: CampaignDraft; receipt: CampaignReceipt } | null>(null)

  // The owner's monthly marketing budget (from their profile), used as a soft
  // spend cap: the builder warns when the running total would go over it.
  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/marketing-budget')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && typeof j?.monthlyBudget === 'number') setMonthlyCap(j.monthlyBudget) })
      .catch(() => { /* no cap; running total still shows */ })
    return () => { cancelled = true }
  }, [])

  // Does the owner have a connected email/text list? Gates the launch list
  // option so we never plan a send to a list that does not exist.
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    fetch(`/api/dashboard/list-status?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && typeof j?.hasList === 'boolean') setHasList(j.hasList) })
      .catch(() => { /* default: no list, plan social-only */ })
    return () => { cancelled = true }
  }, [client?.id])

  // The real account profile — so the madlib defaults come from who the owner actually is
  // (their neighborhood, the audience they described at onboarding, their rating).
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    fetch(`/api/campaigns/profile?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.profile) setProfile(j.profile as CampaignProfile) })
      .catch(() => { /* fall back to static defaults */ })
    return () => { cancelled = true }
  }, [client?.id])

  useEffect(() => {
    let cancelled = false
    listMyMenuItems()
      .then((res) => { if (!cancelled) setMenu(res.success ? res.data.map((m) => ({ l: m.name, photo: m.photoUrl ?? undefined, f: m.isFeatured })) : []) })
      .catch(() => { if (!cancelled) setMenu([]) })
    return () => { cancelled = true }
  }, [])

  // AI recommendations for the catalog (the "Suggested for you" row + featured).
  // Best-effort: the builder falls back to its static suggested row if this fails.
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    setRecsLoading(true)
    fetch(`/api/campaigns/recommend-items?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.recommended?.length) setRecommended(j.recommended as RecItem[]) })
      .catch(() => { /* keep the static suggested row */ })
      .finally(() => { if (!cancelled) setRecsLoading(false) })
    return () => { cancelled = true }
  }, [client?.id])

  // The owner's current recurring monthly commitment across LIVE plans, so the
  // builder can show a running total and recurring charges never pile up silently.
  // Reuses the same summarize() the bill bar uses, so the number is consistent.
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    fetch(`/api/campaigns?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.campaigns) return
        const live = (j.campaigns as Array<{ status: string; draft: { items: LineItem[] } }>).filter((c) => c.status === 'shipped')
        // Count only the plans that actually drive the monthly total, so "across
        // N monthly plans" matches the $/mo figure (one-off plans add $0/mo).
        let perMonth = 0, recurring = 0
        for (const c of live) {
          try { const pm = summarize(c.draft.items).perMonth; if (pm > 0) { perMonth += pm; recurring++ } }
          catch { /* skip a malformed campaign */ }
        }
        setCommitment({ perMonth: Math.round(perMonth), count: recurring })
      })
      .catch(() => { /* no running total; per-plan price still shows */ })
    return () => { cancelled = true }
  }, [client?.id])

  const onClose = () => router.push('/dashboard/campaigns')
  // Returns true only when the campaign actually persisted, so the builder can
  // show a real confirm on success and an error+retry on failure instead of a
  // false "added". On success it deep-links to the saved campaign.
  const onCreate = async (payload: CreatePayload): Promise<boolean> => {
    if (!client?.id) return false
    try {
      const draft = draftFromBuilder({ ...payload, vals: applyProfile(applyList(payload.vals)) })
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, draft }),
      })
      if (!res.ok) return false
      // Land straight on the campaign's detail page: it is the combined
      // plan + in-review + edit + approve surface (editable pieces, live bill,
      // Approve & ship), so the owner reviews/edits/approves in one place
      // instead of a separate in-builder confirmation step.
      const { id } = (await res.json()) as { id?: string }
      // Always navigate away so the builder's saving screen can't hang: the new
      // campaign's detail page when we have its id, the Campaigns list otherwise.
      router.push(id ? `/dashboard/campaigns/${id}` : '/dashboard/campaigns')
      return true
    } catch {
      return false
    }
  }

  // Show the plan. For a system goal we show the deterministic plan instantly, then ask the
  // AI selection layer for the best mix for this owner's real situation and refine in place.
  // The AI never blocks the plan: any failure/slowness keeps the deterministic plan (busy just
  // guards the Confirm button while it tailors). The composer stays pure — it reads spec.aiMix.
  const handlePlan = async (p: PlanPayload) => {
    // A few catalog items ARE a brain goal under another id: reviewsplan → the 'reviews' system goal
    // (remaps the plan item too), promoevent → the 'promote-event' atom goal (plan item stays). The
    // plan keeps the catalog id; the route is asked for the brain vocabulary (resolveBrainGoal).
    const goalId = SYSTEM_GOAL_ALIAS[p.itemId] ?? p.itemId
    const brainGoal = resolveBrainGoal(goalId)
    const vals = applyProfile(applyList(p.vals))
    setPlan({ itemId: goalId, vals })
    setPlanOutcome(null)
    setPlanLead(null)
    setPlanReasons(null)
    setPlanDiagnosis(null)
    setPlanTailored(null)
    // HONESTY: the analyzing screen only plays when analysis actually runs. Template goals
    // compose deterministically with zero calls — playing "Analyzing your business" over
    // them was pure theater — so they go straight to the plan.
    if (!brainGoal || !client?.id) return
    setAnalyzing(true)
    setPlanBusy(true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)
    try {
      const budget = String(vals.budget ?? '')
      // The strategist diagnosis (constraint + bet) runs alongside the mix selection for the
      // four system goals; the analyzing screen absorbs both. Each fails soft on its own.
      const goalKey = DIAGNOSE_GOAL_KEY[goalId]
      const [mixRes, diagRes] = await Promise.allSettled([
        fetch(`/api/campaigns/plan-mix?clientId=${client.id}&goal=${encodeURIComponent(brainGoal)}&budget=${encodeURIComponent(budget)}`, { signal: ctrl.signal }),
        goalKey
          ? fetch('/api/campaigns/diagnose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: client.id, goalKey }), signal: ctrl.signal })
          : Promise.resolve(null),
      ])
      if (mixRes.status === 'fulfilled') {
        const j = (await mixRes.value.json().catch(() => ({}))) as { mix?: string[]; reasons?: Record<string, string>; source?: string; route?: string; outcome?: string; lead?: string; suggestedTier?: { tier?: string } }
        const next: Record<string, unknown> = { ...vals }
        if (Array.isArray(j.mix) && j.mix.length) next.aiMix = j.mix.join(',')
        // No budget entered → size the plan with the brain's suggested tier instead of defaulting to Standard.
        if (!budget.trim() && !String(vals.tier ?? '').trim() && j.suggestedTier?.tier) next.tier = j.suggestedTier.tier
        if (next.aiMix || next.tier) setPlan({ itemId: goalId, vals: next })
        if (typeof j.outcome === 'string') setPlanOutcome(j.outcome)
        // The cold-start reason the brain shaped the lead, e.g. "Led with reviews because your rating is 4.1…".
        if (typeof j.lead === 'string') setPlanLead(j.lead)
        // The AI's per-service reasons (partial map — dispose() adds/drops ids; cards fall back).
        if (j.reasons && typeof j.reasons === 'object') setPlanReasons(j.reasons)
        // Honest finish copy: "built around what we found" ONLY when the brain genuinely tailored
        // the mix. Safe-routed cold starts and rule fallbacks say what they are — a proven starter.
        // 'ai' = an event goal's AI pick (kept in the model's own order, no lift re-rank).
        setPlanTailored(j.source === 'ai+lift' || j.source === 'ai' || j.source === 'brain')
      } else {
        setPlanTailored(false)
      }
      if (diagRes.status === 'fulfilled' && diagRes.value) {
        const d = (await diagRes.value.json().catch(() => null)) as { diagnosis?: Diagnosis; source?: string } | null
        if (d?.diagnosis?.bindingConstraint && d.diagnosis.bet) {
          // Normalize at the network boundary: the server's coerce() guarantees these arrays,
          // but the UI must never crash on a drifted contract.
          const diag: Diagnosis = { ...d.diagnosis, skip: Array.isArray(d.diagnosis.skip) ? d.diagnosis.skip : [], evidence: Array.isArray(d.diagnosis.evidence) ? d.diagnosis.evidence : [] }
          setPlanDiagnosis({ diagnosis: diag, source: d.source === 'ai' ? 'ai' : 'rules' })
        }
      }
    } catch { setPlanTailored(false) /* keep the deterministic plan */ } finally {
      clearTimeout(timer); setPlanBusy(false)
    }
  }

  // Confirm the order: create the campaign with the owner's edited pieces + service
  // choices, then ship it (the team starts), and land on the live campaign.
  // Owner-facing copy when the confirm fails partway: the campaign is at most a saved
  // draft (status never flipped), so nothing was ordered and tapping Confirm again is safe.
  const SHIP_FAIL = "That didn't go through. Nothing was ordered. Try again."
  const onConfirm = async ({ draft, producerChoices, receipt }: { draft: CampaignDraft; producerChoices: Record<string, PieceProducer>; receipt: CampaignReceipt }) => {
    if (!client?.id) return
    setPlanBusy(true); setPlanError(null)
    const h = { 'Content-Type': 'application/json' }
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', headers: h, body: JSON.stringify({ clientId: client.id, draft }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not create the campaign')
      const { id } = (await res.json()) as { id?: string }
      if (!id) throw new Error('Could not create the campaign')
      // Both PATCHes must land before the receipt shows. The producer picks decide who
      // makes each piece (and what it bills), and the status flip IS the order: swallowing
      // a failure here would show "you're all set" over a campaign still sitting in draft.
      if (Object.keys(producerChoices).length) {
        const pr = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: { producer_choices: producerChoices } }) }).catch(() => null)
        if (!pr || !pr.ok) throw new Error(SHIP_FAIL)
      }
      const sr = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: { status: 'shipped', phase: 'monitor', shipped_at: new Date().toISOString() } }) }).catch(() => null)
      if (!sr || !sr.ok) throw new Error(SHIP_FAIL)
      // Show the "you're all set" receipt (with a handoff to setup) instead of jumping straight in.
      setConfirmed({ id, draft, receipt }); setPlanBusy(false)
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'Something went wrong'); setPlanBusy(false)
    }
  }

  // From the "you're all set" screen: head to the canonical "Get it ready" needs page, or skip to the campaign.
  const goToSetup = () => router.push(confirmed?.id ? `/dashboard/campaigns/${confirmed.id}/ready` : '/dashboard/campaigns')
  const goToCampaign = () => router.push(confirmed?.id ? `/dashboard/campaigns/${confirmed.id}` : '/dashboard/campaigns')

  return (
    <>
      <ApnoshCampaign
        restaurant={client?.name || 'your restaurant'}
        menu={menu}
        initialItem={initialItem}
        recommended={recommended}
        recsLoading={recsLoading}
        monthlyCommitment={commitment.perMonth}
        liveCount={commitment.count}
        monthlyCap={monthlyCap}
        hasList={hasList}
        profile={profile}
        onCreate={onCreate}
        onClose={onClose}
        onPlan={handlePlan}
      />
      {analyzing && plan && client?.id && (
        <PlanAnalyzing
          restaurant={client.name || 'your restaurant'}
          itemId={plan.itemId}
          profile={profile}
          goalLabel={goalPhrase(plan.itemId)}
          ready={!planBusy}
          tailored={planTailored}
          onDone={() => setAnalyzing(false)}
        />
      )}
      {plan && !analyzing && client?.id && (
        <CampaignPlanFlow
          itemId={plan.itemId}
          vals={plan.vals}
          restaurant={client.name || 'your restaurant'}
          menu={menu}
          busy={planBusy}
          error={planError}
          monthlyCap={monthlyCap}
          outcome={planOutcome}
          lead={planLead}
          reasons={planReasons}
          diagnosis={planDiagnosis?.diagnosis ?? null}
          diagnosisSource={planDiagnosis?.source ?? null}
          doneSetup={profile?.doneSetup ?? []}
          onConfirm={onConfirm}
          onBack={() => { setPlan(null); setPlanError(null); setPlanOutcome(null); setPlanLead(null); setPlanReasons(null); setPlanDiagnosis(null); setPlanTailored(null) }}
        />
      )}
      {confirmed && client?.id && (
        <OrderConfirmed
          restaurant={client.name || 'your restaurant'}
          orderId={confirmed.id}
          draft={confirmed.draft}
          receipt={confirmed.receipt}
          doneSetupIds={profile?.doneSetup ?? []}
          onSetup={goToSetup}
          onSkip={goToCampaign}
        />
      )}
    </>
  )
}
