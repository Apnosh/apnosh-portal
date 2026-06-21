'use client'

/**
 * "Re-sync to Google & website" — pushes the current saved business info out
 * again without changing it. Useful when info was entered before Google was
 * connected, or after a transient sync failure. Shown on the hub only when
 * there's somewhere to push to.
 */

import { useState } from 'react'
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { resyncBusinessInfo, type SaveResult } from './actions'
import { C } from '@/components/mvp/mvp-detail'

const AMBER = '#bd7e16'
const AMBER_DK = '#8a5a0c'

export default function ResyncButton() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  async function onClick() {
    setRunning(true)
    setResult(null)
    try {
      setResult(await resyncBusinessInfo())
    } catch {
      setResult({ ok: false, error: 'Could not sync', synced: { saved: false, google: 'failed', website: 'failed' } })
    } finally {
      setRunning(false)
    }
  }

  const g = result?.synced.google
  const w = result?.synced.website
  const googleMsg = g === 'ok' ? 'Updated on Google' : g === 'failed' ? 'Google did not update' : 'Google not connected'
  const websiteMsg = (w === 'committed' || w === 'queued') ? 'website rebuilding' : w === 'failed' ? 'website did not update' : 'no website connected'
  const anyFail = g === 'failed' || w === 'failed'

  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
      <button type="button" onClick={onClick} disabled={running} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: running ? 'default' : 'pointer' }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {running ? <Loader2 size={18} className="mvp-spin" /> : <RefreshCw size={18} />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{running ? 'Syncing...' : 'Re-sync to Google & website'}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>Push your current info out again</span>
        </span>
      </button>
      {result && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 14px', borderTop: `0.5px solid ${C.line}` }}>
          {anyFail ? <AlertCircle size={17} color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} /> : <CheckCircle2 size={17} color={C.greenDk} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span style={{ fontSize: 12.5, color: anyFail ? AMBER_DK : C.mute, lineHeight: 1.45 }}>{googleMsg}, {websiteMsg}.</span>
        </div>
      )}
    </div>
  )
}
