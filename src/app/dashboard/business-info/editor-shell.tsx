'use client'

/**
 * Shared pieces for the focused business-info editors (Hours, Special
 * hours, Contact). Each editor manages its own fields, then uses the
 * SaveBar + SuccessScreen here so the save/sync UX is identical
 * everywhere.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react'
import type { SaveResult } from './actions'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C, DISPLAY } from '@/components/mvp/mvp-detail'

export function EditorHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter()
  return (
    <div className="px-4 pt-4 pb-3 bg-white border-b border-ink-6">
      <button onClick={() => router.push('/dashboard/business-info')} className="inline-flex items-center gap-1 text-[12px] text-ink-3 active:text-ink mb-2">
        <ArrowLeft className="w-3.5 h-3.5" /> Business info
      </button>
      <h1 className="text-[24px] font-semibold text-ink leading-tight">{title}</h1>
      {subtitle && <p className="text-[12.5px] text-ink-3 mt-0.5">{subtitle}</p>}
    </div>
  )
}

export function SaveBar({ saving, onSave, label = 'Save & sync' }: { saving: boolean; onSave: () => void; label?: string }) {
  return (
    <div className="sticky bottom-0 bg-white border-t border-ink-6 px-4 py-3 safe-bottom">
      <button
        onClick={onSave}
        disabled={saving}
        className="w-full bg-brand text-white rounded-full py-3.5 text-[15px] font-semibold active:bg-brand-dark disabled:opacity-60 inline-flex items-center justify-center gap-2 min-h-[52px]"
      >
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving & syncing...</> : label}
      </button>
    </div>
  )
}

export function SuccessScreen({ result, onEditAgain }: { result: SaveResult; onEditAgain: () => void }) {
  const router = useRouter()
  return (
    <div className="max-w-lg mx-auto px-4 pt-10 pb-20 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-50 mx-auto mb-4 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
      </div>
      <h1 className="text-[22px] font-semibold text-ink mb-1">Saved</h1>
      <p className="text-[13px] text-ink-3 mb-6">Here&apos;s where your change went:</p>
      <div className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 text-left overflow-hidden">
        <SyncRow ok label="Your Apnosh records" detail="Saved" />
        <SyncRow
          ok={result.synced.google === 'ok'}
          warn={result.synced.google === 'failed'}
          skipped={result.synced.google === 'skipped'}
          label="Google Business Profile"
          detail={result.synced.google === 'ok' ? 'Synced live'
            : result.synced.google === 'failed' ? (result.googleError ?? 'Sync failed')
            : 'Not connected'}
        />
        <SyncRow
          ok={result.synced.website === 'committed' || result.synced.website === 'queued'}
          warn={result.synced.website === 'failed'}
          skipped={result.synced.website === 'skipped'}
          label="Your website"
          detail={result.synced.website === 'committed' ? 'Rebuilding now'
            : result.synced.website === 'queued' ? 'Updating shortly'
            : result.synced.website === 'failed' ? (result.websiteError ?? 'Sync failed')
            : 'Not connected'}
        />
      </div>
      <div className="flex gap-2 mt-6">
        <button onClick={onEditAgain} className="flex-1 bg-white border border-ink-6 rounded-full py-3 text-[14px] font-semibold text-ink-2 active:bg-ink-7">Edit again</button>
        <button onClick={() => router.push('/dashboard/business-info')} className="flex-1 bg-ink text-white rounded-full py-3 text-[14px] font-semibold active:bg-ink-2">Done</button>
      </div>
    </div>
  )
}

export function SyncRow({ ok, warn, skipped, label, detail }: { ok?: boolean; warn?: boolean; skipped?: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {warn ? <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        : skipped ? <span className="w-5 h-5 rounded-full bg-ink-7 flex-shrink-0" />
        : <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${ok ? 'text-emerald-600' : 'text-ink-4'}`} />}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-ink">{label}</p>
        <p className={`text-[12px] ${warn ? 'text-amber-700' : 'text-ink-3'}`}>{detail}</p>
      </div>
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
      <p className="text-[12.5px] text-rose-800">{message}</p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * apnosh-mvp editor shell. New design language (inline styles + C tokens),
 * rendered full-screen inside MvpShell with a back-to-hub header and a sticky
 * green save bar. On save it shows MvpSavedView — the visible, trustworthy
 * "here's what updated on Google and your website" confirmation. Editors are
 * migrated onto this one at a time; the legacy pieces above stay for the rest.
 * ────────────────────────────────────────────────────────────────── */

const AMBER = '#bd7e16'
const AMBER_DK = '#8a5a0c'

export function MvpEditorShell({ title, subtitle, saving, dirty = true, onSave, saveLabel = 'Save', syncTargets = 'Google and your website', result, onEditAgain, children }: {
  title: string
  subtitle?: string
  saving: boolean
  dirty?: boolean
  /** Receives whether the "Update ..." toggle was on when Save was tapped. */
  onSave: (sync: boolean) => void
  saveLabel?: string
  /** What the sync toggle says it updates (default "Google and your website"). */
  syncTargets?: string
  result?: SaveResult | null
  onEditAgain?: () => void
  children: React.ReactNode
}) {
  const [sync, setSync] = useState(true)
  const saved = !!result?.synced.saved
  const off = !dirty || saving
  return (
    <MvpShell active="more" header={<MvpDetailHeader title={title} subtitle={subtitle} backHref="/dashboard/business-info" backLabel="Business info" />}>
      {saved && result ? (
        <MvpSavedView result={result} synced={sync} onEditAgain={onEditAgain} />
      ) : (
        <div style={{ background: C.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
          <div style={{ flex: 1, padding: '16px 14px 14px' }}>{children}</div>
          <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `0.5px solid ${C.line}`, padding: '10px 14px calc(12px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '2px 2px 11px' }}>
              <span style={{ fontSize: 13.5, color: C.ink, fontWeight: 500 }}>Update {syncTargets}</span>
              <MvpToggle on={sync} onClick={() => setSync(s => !s)} label="Sync on save" />
            </div>
            <button type="button" onClick={() => onSave(sync)} disabled={off} style={{ width: '100%', height: 48, borderRadius: 14, border: 'none', background: off ? '#bfe7da' : C.green, color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'inherit', cursor: off ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {saving && <Loader2 size={18} className="mvp-spin" />}{saveLabel}
            </button>
          </div>
        </div>
      )}
    </MvpShell>
  )
}

function MvpSavedView({ result, synced, onEditAgain }: { result: SaveResult; synced: boolean; onEditAgain?: () => void }) {
  const router = useRouter()
  const g = result.synced.google
  const w = result.synced.website
  const gState: 'ok' | 'warn' | 'skip' = !synced ? 'skip' : g === 'ok' ? 'ok' : g === 'failed' ? 'warn' : 'skip'
  const gDetail = !synced ? 'Syncing was off' : g === 'ok' ? 'Updated live' : g === 'failed' ? (result.googleError ?? 'Could not update') : 'Not connected'
  const wState: 'ok' | 'warn' | 'skip' = !synced ? 'skip' : (w === 'committed' || w === 'queued') ? 'ok' : w === 'failed' ? 'warn' : 'skip'
  const wDetail = !synced ? 'Syncing was off' : w === 'committed' ? 'Rebuilding now' : w === 'queued' ? 'Updating shortly' : w === 'failed' ? (result.websiteError ?? 'Could not update') : 'No site connected'
  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '28px 18px 28px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '6px auto 14px' }}>
        <CheckCircle2 size={32} color={C.greenDk} />
      </div>
      <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: DISPLAY }}>Saved</div>
      <div style={{ textAlign: 'center', fontSize: 13.5, color: C.mute, margin: '4px 0 18px' }}>{synced ? "Here's what updated" : 'Saved to your records only'}</div>

      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        <MvpSyncRow state="ok" label="Your Apnosh records" detail="Saved" />
        <div style={{ height: '0.5px', background: C.line, marginLeft: 48 }} />
        <MvpSyncRow state={gState} label="Google Business Profile" detail={gDetail} />
        <div style={{ height: '0.5px', background: C.line, marginLeft: 48 }} />
        <MvpSyncRow state={wState} label="Your website" detail={wDetail} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        {onEditAgain && (
          <button type="button" onClick={onEditAgain} style={{ flex: 1, height: 46, borderRadius: 13, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Edit again</button>
        )}
        <button type="button" onClick={() => router.push('/dashboard/business-info')} style={{ flex: 1, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Done</button>
      </div>
    </div>
  )
}

function MvpSyncRow({ state, label, detail }: { state: 'ok' | 'warn' | 'skip'; label: string; detail: string }) {
  const icon = state === 'warn'
    ? <AlertCircle size={20} color={AMBER} />
    : state === 'skip'
      ? <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${C.line}`, display: 'inline-block' }} />
      : <CheckCircle2 size={20} color={C.greenDk} />
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
      <span style={{ flexShrink: 0, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{label}</div>
        <div style={{ fontSize: 12.5, color: state === 'warn' ? AMBER_DK : C.mute, marginTop: 1 }}>{detail}</div>
      </div>
    </div>
  )
}

export function EditorField({ label, value, onChange, type = 'text', placeholder, hint, inputMode }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
  inputMode?: 'text' | 'tel' | 'url' | 'email' | 'numeric'
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mvp-input"
        style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none' }}
      />
      {hint && <p style={{ fontSize: 11.5, color: C.faint, margin: '6px 2px 0', lineHeight: 1.45 }}>{hint}</p>}
    </div>
  )
}

export function EditorTextArea({ label, value, onChange, placeholder, rows = 5, hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  hint?: string
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mvp-input"
        style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none', resize: 'none', lineHeight: 1.5 }}
      />
      {hint && <p style={{ fontSize: 11.5, color: C.faint, margin: '6px 2px 0', lineHeight: 1.45 }}>{hint}</p>}
    </div>
  )
}

// iOS-style toggle, green when on. Used by Hours, Special hours, and the
// upcoming service-option editors.
export function MvpToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} style={{ position: 'relative', width: 46, height: 28, borderRadius: 99, border: 'none', background: on ? C.green : '#d6d6db', flexShrink: 0, cursor: 'pointer', transition: 'background .15s', padding: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: 2, width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'transform .15s', transform: on ? 'translateX(18px)' : 'translateX(0)' }} />
    </button>
  )
}

// Compact styled native time/date input for the mvp editors.
export function MvpTimeInput({ value, onChange, type = 'time' }: { value: string; onChange: (v: string) => void; type?: 'time' | 'date' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="mvp-input"
      style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 9, padding: '7px 9px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none' }}
    />
  )
}
