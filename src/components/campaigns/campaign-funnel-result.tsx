'use client'

/**
 * CampaignFunnelResult — binds the CampaignFunnel visualization to a REAL saved
 * campaign. It hydrates the funnel from the campaign's line items (grouped by
 * stage) and, when the plan is still editable, persists every toggle back onto
 * those line items via PATCH /api/campaigns/:id — so adding/removing a play in
 * the funnel adds/removes a real, priced LineItem on the campaign.
 *
 * Persistence is a DELTA over the load-time baseline (itemsForSelection), never
 * a rebuild, so a line the funnel doesn't surface (foundation setup, an
 * untouched stage) is preserved. A shipped campaign is read-only.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import CampaignFunnel from '@/components/mvp/campaign-funnel'
import { FUNNEL_TEMPLATE, itemsForSelection, type FunnelData } from '@/lib/campaigns/funnel-plays'

type Props = Pick<FunnelData, 'campaignId' | 'campaignName' | 'kicker' | 'editable' | 'pieces' | 'initialSelected' | 'initialItems'>

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function CampaignFunnelResult({ campaignId, campaignName, kicker, editable, pieces, initialSelected, initialItems, clientId }: Props & { clientId?: string }) {
  const [save, setSave] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The owner's real average check, if they set it in Insights (same localStorage key the
  // Insights funnel uses) — projections use their number instead of the generic example.
  const [avgCheck, setAvgCheck] = useState<number | null>(null)
  useEffect(() => {
    if (!clientId) return
    try {
      const t = localStorage.getItem(`apnosh.funnel.ticket.${clientId}`)
      if (t != null && t !== '') setAvgCheck(Number(t) || null)
    } catch { /* no storage — the generic example stands */ }
  }, [clientId])

  const persist = useCallback((selected: Record<string, string[]>) => {
    if (!editable) return
    if (timer.current) clearTimeout(timer.current)
    setSave('saving')
    timer.current = setTimeout(async () => {
      try {
        const items = itemsForSelection(initialItems, selected)
        const r = await fetch(`/api/campaigns/${campaignId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        })
        setSave(r.ok ? 'saved' : 'error')
      } catch {
        setSave('error')
      }
    }, 500)
  }, [editable, initialItems, initialSelected, campaignId])

  const intro = editable
    ? 'Each stage is a magnet. Add the plays that drive it and watch the example funnel, and your real plan, respond live. The numbers are an example, not your numbers.'
    : 'This campaign has shipped. This is the plan that ran, stage by stage. Real numbers show as they come in.'

  return (
    <div>
      <CampaignFunnel
        campaignName={campaignName}
        kicker={kicker}
        intro={intro}
        currency="$"
        stages={FUNNEL_TEMPLATE}
        pieces={pieces}
        initialSelected={initialSelected}
        readOnly={!editable}
        moneyMode={editable ? 'example' : 'gathering'}
        spendPerHead={avgCheck}
        onChange={persist}
      />
      {editable && <SaveNote state={save} />}
    </div>
  )
}

function SaveNote({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  const map: Record<Exclude<SaveState, 'idle'>, { text: string; color: string }> = {
    saving: { text: 'Saving your plan…', color: '#6e6e73' },
    saved: { text: 'Saved to your campaign', color: '#2e9a78' },
    error: { text: 'Could not save — try again', color: '#b23b3b' },
  }
  const { text, color } = map[state]
  return (
    <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, fontWeight: 600, color }}>{text}</div>
  )
}
