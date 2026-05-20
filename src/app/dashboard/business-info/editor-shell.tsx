'use client'

/**
 * Shared pieces for the focused business-info editors (Hours, Special
 * hours, Contact). Each editor manages its own fields, then uses the
 * SaveBar + SuccessScreen here so the save/sync UX is identical
 * everywhere.
 */

import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react'
import type { SaveResult } from './actions'

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
