'use client'

/**
 * Bulk GBP backfill page.
 *
 * Accepts MULTIPLE files in one go. Each file can be:
 *   - GMB Insights "Local Reports" CSV from Business Profile Manager
 *     (aggregate over the report range — date is read from filename)
 *   - Looker Studio GBP daily CSV (per-day rows)
 *
 * Format is auto-detected via parseGbpCsvAuto. Rows from every file
 * are pooled, previewed against the client roster, and upserted in
 * one shot.
 */

import { useCallback, useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, FileSpreadsheet, Check, AlertCircle, Users, AlertTriangle, X, Building2, EyeOff } from 'lucide-react'
import {
  previewBackfill,
  runBackfill,
  applyLocationAssignments,
  type LookerGbpRow,
  type BackfillPreview,
  type LocationAssignment,
} from '@/lib/gbp-backfill-actions'
import { parseGbpCsvAuto } from '@/lib/gbp-csv-parser'

interface ParsedFile {
  filename: string
  rows: LookerGbpRow[]
  format: 'gmb_aggregate' | 'looker_daily' | 'unknown'
  errors: string[]
  dateFirst?: string
  dateLast?: string
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export default function BackfillPage() {
  const [files, setFiles] = useState<ParsedFile[]>([])
  const [preview, setPreview] = useState<BackfillPreview | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  // Admin's pending decisions for the "needs assignment" bucket
  const [decisions, setDecisions] = useState<Record<string, { action: 'assign' | 'skip'; clientId: string }>>({})

  // Whenever a fresh preview lands, pre-seed decisions with the suggested
  // client (best fuzzy guess). Admin can change or override.
  useEffect(() => {
    if (!preview) return
    const initial: Record<string, { action: 'assign' | 'skip'; clientId: string }> = {}
    for (const loc of preview.needsAssignment) {
      initial[loc.id] = {
        action: loc.suggestedClientId ? 'assign' : 'skip',
        clientId: loc.suggestedClientId ?? '',
      }
    }
    setDecisions(initial)
  }, [preview])

  const allRows = files.flatMap(f => f.rows)
  const totalRows = allRows.length

  const handleFiles = useCallback(async (incoming: FileList | File[]) => {
    setResult(null); setPreview(null)
    const list = Array.from(incoming)
    const parsed: ParsedFile[] = []

    for (const file of list) {
      try {
        const text = await readFileAsText(file)
        const out = parseGbpCsvAuto(text, file.name)
        const dates = out.rows.map(r => r.date).sort()
        parsed.push({
          filename: file.name,
          rows: out.rows,
          format: out.format,
          errors: out.errors,
          dateFirst: dates[0],
          dateLast: dates[dates.length - 1],
        })
      } catch (e) {
        parsed.push({
          filename: file.name,
          rows: [],
          format: 'unknown',
          errors: [(e as Error).message],
        })
      }
    }

    setFiles(prev => [...prev, ...parsed])
  }, [])

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
    setPreview(null)
  }

  const runPreview = useCallback(async () => {
    if (allRows.length === 0) return
    setBusy(true)
    const res = await previewBackfill(allRows)
    setBusy(false)
    if (res.success) setPreview(res.data)
    else setResult({ ok: false, msg: res.error })
  }, [allRows])

  const handleConfirm = async () => {
    if (!preview) return
    if (allRows.length === 0) return

    // Validate: every needs-assignment location must have a decision
    const assignments: LocationAssignment[] = []
    for (const loc of preview.needsAssignment) {
      const d = decisions[loc.id]
      if (!d) {
        setResult({ ok: false, msg: `Missing decision for "${loc.locationName}"` })
        return
      }
      if (d.action === 'assign' && !d.clientId) {
        setResult({ ok: false, msg: `Pick a client for "${loc.locationName}" or mark it as Skip` })
        return
      }
      assignments.push({
        locationId: loc.id,
        action: d.action,
        clientId: d.action === 'assign' ? d.clientId : undefined,
      })
    }

    setBusy(true)

    // Step 1: persist the admin's decisions
    if (assignments.length > 0) {
      const ar = await applyLocationAssignments(assignments)
      if (!ar.success) {
        setBusy(false)
        setResult({ ok: false, msg: ar.error })
        return
      }
    }

    // Step 2: import the metrics
    const fname = files.length === 1 ? files[0].filename : `${files.length} files combined`
    const res = await runBackfill({ rows: allRows, filename: fname, source: 'manual_upload' })
    setBusy(false)
    if (res.success) {
      const willImportClients = new Set(preview.willImport.map(l => l.clientId)).size
      const newlyAssigned = assignments.filter(a => a.action === 'assign').length
      setResult({
        ok: true,
        msg: `Imported ${res.data.imported} rows across ${willImportClients + newlyAssigned} location${willImportClients + newlyAssigned === 1 ? '' : 's'}.` +
          (res.data.skipped > 0 ? ` ${res.data.skipped} rows skipped (locations marked skip).` : '') +
          (res.data.unmatched > 0 ? ` ${res.data.unmatched} rows unmatched.` : ''),
      })
      setFiles([]); setPreview(null); setDecisions({})
    } else {
      setResult({ ok: false, msg: res.error })
    }
  }

  return (
    <div className="max-w-4xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-6">
        <ArrowLeft className="w-4 h-4" /> Admin home
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1">GBP Bulk Backfill</h1>
        <p className="text-sm text-ink-3">
          Drop one or many CSVs from Google Business Profile Manager (Actions → Download → Insights) or Looker Studio. Each location is routed to the right client by business name automatically.
        </p>
      </div>

      {result && (
        <div className={`flex items-start gap-3 p-4 rounded-xl mb-6 ${result.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
          {result.ok ? <Check className="w-5 h-5 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />}
          <p className="text-sm">{result.msg}</p>
        </div>
      )}

      {/* Dropzone -- always visible so admin can drop additional files */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-6 ${dragOver ? 'border-brand bg-brand-tint' : 'border-ink-5 hover:border-ink-4'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
        }}
      >
        <Upload className="w-8 h-8 text-ink-4 mx-auto mb-3" />
        <p className="text-sm font-medium text-ink mb-1">Drop one or many CSVs here</p>
        <p className="text-xs text-ink-3 mb-3">monthly Insights exports, Looker daily exports — mix and match</p>
        <label className="inline-block cursor-pointer px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink-2">
          Choose files
          <input
            type="file"
            multiple
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={e => {
              if (e.target.files?.length) handleFiles(e.target.files)
            }}
          />
        </label>
      </div>

      {/* Parsed-files list */}
      {files.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-ink">
              {files.length} file{files.length === 1 ? '' : 's'} parsed · {totalRows.toLocaleString()} rows total
            </h2>
            {!preview && (
              <button
                onClick={runPreview}
                disabled={busy || totalRows === 0}
                className="px-4 py-1.5 bg-brand text-white text-xs font-medium rounded-lg hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? 'Matching...' : 'Preview match'}
              </button>
            )}
          </div>
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-bg-2 border-b border-ink-6">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-ink-3">File</th>
                  <th className="text-left px-3 py-2 font-medium text-ink-3">Format</th>
                  <th className="text-left px-3 py-2 font-medium text-ink-3">Date</th>
                  <th className="text-right px-3 py-2 font-medium text-ink-3">Rows</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={i} className="border-b border-ink-6 last:border-0">
                    <td className="px-3 py-2 truncate max-w-xs" title={f.filename}>
                      <FileSpreadsheet className="inline w-3 h-3 mr-1 text-ink-4" />
                      {f.filename}
                    </td>
                    <td className="px-3 py-2">
                      {f.format === 'gmb_aggregate' && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">GMB monthly</span>}
                      {f.format === 'looker_daily' && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Looker daily</span>}
                      {f.format === 'unknown' && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">Unknown</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-3">
                      {f.dateFirst === f.dateLast ? f.dateFirst : `${f.dateFirst} → ${f.dateLast}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{f.rows.length}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeFile(i)} className="text-ink-3 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview output -- three buckets */}
      {preview && (
        <div className="space-y-4">
          {/* Needs assignment: per-location dropdown */}
          {preview.needsAssignment.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h2 className="text-sm font-bold text-amber-800">
                  Needs assignment ({preview.needsAssignment.length})
                </h2>
              </div>
              <p className="text-xs text-ink-3 mb-4">
                These Google Business Profile locations are new. Pick which client owns each, or skip
                permanently if it&apos;s not a client. Your choice is saved — future imports route
                automatically.
              </p>
              <div className="space-y-3">
                {preview.needsAssignment.map(loc => {
                  const d = decisions[loc.id] ?? { action: 'skip', clientId: '' }
                  return (
                    <div key={loc.id} className="border border-ink-6 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-ink truncate" title={loc.locationName}>
                            {loc.locationName}
                          </div>
                          {loc.address && (
                            <div className="text-xs text-ink-3 truncate">{loc.address}</div>
                          )}
                          <div className="text-xs text-ink-3 mt-0.5">
                            <code className="font-mono text-[10px]">{loc.storeCode}</code> · {loc.rowCount} rows
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <select
                          value={d.action === 'assign' ? d.clientId : '__skip__'}
                          onChange={e => {
                            const v = e.target.value
                            if (v === '__skip__') {
                              setDecisions(prev => ({ ...prev, [loc.id]: { action: 'skip', clientId: '' } }))
                            } else {
                              setDecisions(prev => ({ ...prev, [loc.id]: { action: 'assign', clientId: v } }))
                            }
                          }}
                          className="flex-1 px-3 py-1.5 text-xs border border-ink-5 rounded-lg"
                        >
                          <option value="">— Pick a client —</option>
                          {preview.clients.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}{loc.suggestedClientId === c.id ? '  ← suggested' : ''}
                            </option>
                          ))}
                          <option value="__skip__">⊘ Skip (not my client, ignore forever)</option>
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Will import: already-mapped locations */}
          {preview.willImport.length > 0 && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-emerald-600" />
                <h2 className="text-sm font-bold">
                  Will import ({preview.willImport.length} location{preview.willImport.length === 1 ? '' : 's'})
                </h2>
              </div>
              <div className="space-y-1.5">
                {preview.willImport.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg bg-bg-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                      <span className="font-medium truncate" title={m.locationName}>{m.locationName}</span>
                      <span className="text-ink-3 shrink-0"> → {m.clientName}</span>
                    </div>
                    <div className="text-xs text-ink-3 shrink-0">{m.rowCount} rows</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Will skip: previously-marked-skip locations */}
          {preview.willSkip.length > 0 && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="flex items-center gap-3 mb-3">
                <EyeOff className="w-5 h-5 text-ink-4" />
                <h2 className="text-sm font-bold text-ink-3">
                  Permanently skipped ({preview.willSkip.length})
                </h2>
              </div>
              <p className="text-xs text-ink-3 mb-2">
                These locations were marked &ldquo;not a client&rdquo; in a previous import.
              </p>
              <ul className="text-sm">
                {preview.willSkip.map(s => (
                  <li key={s.id} className="text-ink-3 py-0.5">{s.locationName}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={busy || (preview.willImport.length === 0 && preview.needsAssignment.length === 0)}
              className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? 'Importing...' : `Import ${preview.totalRows.toLocaleString()} rows`}
            </button>
            <button
              onClick={() => { setFiles([]); setPreview(null); setDecisions({}) }}
              className="px-5 py-2.5 border border-ink-5 text-sm font-medium rounded-lg hover:bg-bg-2"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
