'use client'

/**
 * Choose your metrics (owner ask 2026-08-18): the setting under the graphs.
 * =========================================================================
 * One sheet, every summed metric across all five stages, one switch each.
 * Switches are display-only — we keep collecting everything — so flipping a
 * metric back on brings its whole history with it. Metrics whose source is
 * not connected show a plain hint instead of a dead switch.
 */

import { useEffect, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { listMetricToggles, setMetricToggle, type MetricToggleGroup } from '@/lib/metric-prefs-actions'
import { C } from '@/components/mvp/mvp-detail'

export function MetricSettingsButton({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '10px auto 0', border: `1px solid ${C.line}`, background: '#fff', color: C.mute, borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
      >
        <SlidersHorizontal size={14} /> Choose your metrics
      </button>
      {open && (
        <MetricSettingsSheet
          onDirty={() => setTouched(true)}
          onClose={() => {
            setOpen(false)
            if (touched) { setTouched(false); onChanged?.() }
          }}
        />
      )}
    </>
  )
}

function MetricSettingsSheet({ onClose, onDirty }: { onClose: () => void; onDirty: () => void }) {
  const { client } = useClient()
  const clientId = client?.id || undefined
  const [groups, setGroups] = useState<MetricToggleGroup[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

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
    onDirty()
    const r = await setMetricToggle(item.id, !item.enabled, clientId)
    if (!r.success) {
      setErr(r.error)
      setGroups(groups) // roll the optimistic flip back
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,20,17,0.42)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: "'Inter',system-ui,sans-serif" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, maxHeight: '86vh', background: C.bg, borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', borderBottom: `0.5px solid ${C.line}` }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: C.ink }}>Choose your metrics</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.mute, cursor: 'pointer', display: 'flex', padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 28px' }}>
          <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, margin: '0 2px 14px' }}>
            Pick what shows and counts on your dashboard. We keep tracking everything in the
            background, so switching a metric back on brings its history with it.
          </div>
          {err && (
            <div style={{ background: '#fdeeee', border: '0.5px solid #f1c7c3', borderRadius: 12, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: '#8a2f28' }}>{err}</div>
          )}
          {!groups ? (
            <div style={{ textAlign: 'center', color: C.mute, fontSize: 13.5, padding: '30px 0' }}>Loading…</div>
          ) : groups.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.mute, fontSize: 13.5, padding: '30px 0' }}>Could not load your metrics. Try again in a moment.</div>
          ) : groups.map((g, gi) => (
            <div key={g.stage} style={{ marginBottom: 22 }}>
              {/* stage section header — the sheet reads the way the funnel reads */}
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, padding: '0 2px 9px' }}>{g.stageLabel}</div>
              {g.providers.map((pr, pi) => (
                <div key={pr.providerLabel} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 4px 6px' }}>{pr.providerLabel}</div>
                  <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                    {pr.items.map((it, ii) => (
                      <div key={it.id}>
                        {ii > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 14 }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
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
                              onClick={() => flip(gi, pi, ii)}
                              style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer', background: it.enabled ? C.green : '#d8dade', position: 'relative', transition: 'background .15s' }}
                            >
                              <span style={{ position: 'absolute', top: 3, left: it.enabled ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .15s' }} />
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
          ))}
        </div>
      </div>
    </div>
  )
}
