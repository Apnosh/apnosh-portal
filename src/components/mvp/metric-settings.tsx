'use client'
/**
 * Choose your metrics (owner ask 2026-08-18): every summed metric across all five
 * stages, one switch each. Switches are display-only — we keep collecting
 * everything — so flipping a metric back on brings its whole history with it.
 * Metrics whose source is not connected show a plain hint instead of a dead switch.
 *
 * 2026-09-04: it is now its OWN SCREEN (/dashboard/insights/metrics) — no nav
 * bar, one Done button pinned to the bottom — instead of a sheet over the graph.
 * `MetricSettingsButton` is kept for its callers and simply links there.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { listMetricToggles, setMetricToggle, type MetricToggleGroup } from '@/lib/metric-prefs-actions'
import { C, DISPLAY } from '@/components/mvp/mvp-detail'

const HREF = '/dashboard/insights/metrics'

export function MetricSettingsButton({ compact = false }: { onChanged?: () => void; compact?: boolean }) {
  return compact ? (
    <Link href={HREF} aria-label="Choose your metrics" title="Choose your metrics" style={{ width: 36, height: 36, borderRadius: 99, background: 'rgba(240,241,240,0.72)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', border: '1px solid rgba(255,255,255,0.75)', boxShadow: '0 1px 3px rgba(0,0,0,.06)', color: C.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}>
      <SlidersHorizontal size={16} />
    </Link>
  ) : (
    <Link href={HREF} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, margin: '10px auto 0', width: 'fit-content', background: 'rgba(240,241,240,0.72)', border: '1px solid rgba(255,255,255,0.75)', color: C.mute, borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
      <SlidersHorizontal size={14} /> Choose your metrics
    </Link>
  )
}

/* the five stages' hues — same as the Insights page, so the list reads like the graphs */
const STAGE_HUE: Record<number, string> = { 1: '#2e9a78', 2: '#3d8ed8', 3: '#7a5fd6', 4: '#dd9a1c', 5: '#1fa39a' }

export function MetricSettingsPage() {
  const router = useRouter()
  const { client } = useClient()
  const clientId = client?.id || undefined
  const [groups, setGroups] = useState<MetricToggleGroup[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    listMetricToggles(clientId).then(setGroups).catch(() => setGroups([]))
  }, [clientId])

  async function flip(gi: number, pi: number, ii: number) {
    if (!groups) return
    const item = groups[gi].providers[pi].items[ii]
    const next = groups.map((g, a) => a !== gi ? g : {
      ...g,
      providers: g.providers.map((pr, b) => b !== pi ? pr : {
        ...pr,
        items: pr.items.map((it, c) => c !== ii ? it : { ...it, enabled: !it.enabled }),
      }),
    })
    setGroups(next)
    setTouched(true)
    const r = await setMetricToggle(item.id, !item.enabled, clientId)
    if (!r.success) {
      setErr(r.error)
      setGroups(groups) // roll the optimistic flip back
    }
  }

  const done = () => {
    // a fresh Insights mount refetches, so a changed switch shows up on return
    if (touched) window.location.assign('/dashboard/insights')
    else router.push('/dashboard/insights')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: '#fff', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '22px 18px calc(110px + env(safe-area-inset-bottom))' }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, letterSpacing: '-.01em', lineHeight: 1.1 }}>Choose your metrics</div>
        <div style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5, margin: '8px 0 6px' }}>
          What shows and counts on your dashboard. Everything keeps being tracked, so switching a metric back on brings its history with it.
        </div>
        {err && (
          <div style={{ background: C.coralSoft, borderRadius: 12, padding: '9px 12px', marginTop: 12, fontSize: 12.5, color: '#8a2f28' }}>{err}</div>
        )}
        {!groups ? (
          <div style={{ textAlign: 'center', color: C.mute, fontSize: 13.5, padding: '40px 0' }}>Loading…</div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.mute, fontSize: 13.5, padding: '40px 0' }}>Could not load your metrics. Try again in a moment.</div>
        ) : groups.map((g, gi) => {
          const hue = STAGE_HUE[g.stage] ?? C.green
          return (
            <div key={g.stage} style={{ marginTop: 22 }}>
              {/* stage header — the list reads the way the funnel reads, in its colour */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 10px' }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: hue, flexShrink: 0 }} />
                <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em' }}>{g.stageLabel}</span>
              </div>
              {g.providers.map((pr, pi) => (
                <div key={pr.providerLabel} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.mute, padding: '0 4px 6px' }}>{pr.providerLabel}</div>
                  <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)' }}>
                    {pr.items.map((it, ii) => (
                      <div key={it.id}>
                        {ii > 0 && <div style={{ height: '0.5px', background: 'rgba(0,0,0,.07)', marginLeft: 14 }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: it.available ? C.ink : C.faint }}>{it.label}</span>
                            {(it.optional || !it.available) && (
                              <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1, lineHeight: 1.4 }}>
                                {it.available ? 'Optional' : it.hint}
                              </span>
                            )}
                          </span>
                          {it.available ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={it.enabled}
                              aria-label={it.label}
                              onClick={() => flip(gi, pi, ii)}
                              style={{ flexShrink: 0, width: 46, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer', background: it.enabled ? hue : '#d8dade', position: 'relative', transition: 'background .15s', padding: 0 }}
                            >
                              <span style={{ position: 'absolute', top: 3, left: it.enabled ? 21 : 3, width: 22, height: 22, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .15s' }} />
                            </button>
                          ) : (
                            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: '.03em' }}>—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {/* the one way out, pinned to the bottom: Done (switches save as you flip) */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', background: 'rgba(255,255,255,.86)', backdropFilter: 'saturate(180%) blur(18px)', WebkitBackdropFilter: 'saturate(180%) blur(18px)', borderTop: '1px solid rgba(0,0,0,.05)' }}>
        <button type="button" onClick={done} style={{ width: '100%', height: 52, borderRadius: 999, border: 'none', background: C.greenDk, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 18px rgba(46,154,120,.28)' }}>
          Done
        </button>
      </div>
    </div>
  )
}
