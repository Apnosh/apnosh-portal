'use client'

/**
 * Bulk client import from Notion (or any CSV).
 *
 * Flow:
 *   1. Drop a CSV file (Notion export or any other source)
 *   2. Preview first 5 rows
 *   3. Map each CSV column to a clients-table field (auto-guess by name)
 *   4. Dry-run to see what would happen
 *   5. Commit for real
 *
 * The importer is intentionally flexible -- the admin maps Notion's
 * arbitrary column names to our canonical client fields in a single UI,
 * then the action handles all normalization + duplicate detection.
 */

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import {
  Upload, FileText, ArrowLeft, Loader2, CheckCircle2, AlertTriangle,
  X, ChevronRight, Download,
} from 'lucide-react'
import { importClientsFromCsv, type ImportClientRow, type ImportResult } from '@/lib/client-import-actions'

// ---------------------------------------------------------------------------
// Target fields on the clients table. Each has a friendly label + which
// CSV header keywords we auto-map to it. The admin can override any mapping.
// ---------------------------------------------------------------------------

interface TargetField {
  key: keyof ImportClientRow
  label: string
  required: boolean
  type: 'text' | 'number' | 'date' | 'tier' | 'status'
  guesses: RegExp[]
  description?: string
}

const TARGETS: TargetField[] = [
  { key: 'name',            label: 'Name',             required: true,  type: 'text',   guesses: [/^name$/i, /^client.?name/i, /^business.?name/i, /^company/i],            description: 'Restaurant / business name. Required.' },
  { key: 'email',           label: 'Email',            required: false, type: 'text',   guesses: [/email/i, /contact.*email/i],                                            description: 'Primary email. Used for billing + duplicate detection.' },
  { key: 'phone',           label: 'Phone',            required: false, type: 'text',   guesses: [/phone/i, /mobile/i, /tel/i] },
  { key: 'primary_contact', label: 'Primary contact',  required: false, type: 'text',   guesses: [/owner/i, /primary.?contact/i, /main.?contact/i, /contact.?name/i, /poc/i] },
  { key: 'website',         label: 'Website',          required: false, type: 'text',   guesses: [/website/i, /url/i, /web/i, /site/i] },
  { key: 'location',        label: 'Location',         required: false, type: 'text',   guesses: [/location/i, /city/i, /address/i, /state/i],                              description: 'City, state, or full address.' },
  { key: 'industry',        label: 'Industry',         required: false, type: 'text',   guesses: [/industry/i, /category/i, /type/i, /vertical/i] },
  { key: 'tier',            label: 'Tier',             required: false, type: 'tier',   guesses: [/tier/i, /plan/i, /level/i],                                              description: 'Basic / Standard / Pro / Internal. Free-form values are normalized.' },
  { key: 'monthly_rate',    label: 'Monthly rate',     required: false, type: 'number', guesses: [/monthly.?rate/i, /retainer/i, /rate/i, /amount.*mo/i, /fee/i],           description: 'Dollars per month (e.g. 850). Used for CRM only; Stripe subscription is authoritative once set up.' },
  { key: 'billing_status',  label: 'Billing status',   required: false, type: 'status', guesses: [/billing.?status/i, /status/i, /state/i] },
  { key: 'onboarding_date', label: 'Onboarding date',  required: false, type: 'date',   guesses: [/onboarding/i, /signed/i, /start.?date/i, /joined/i] },
  { key: 'notes',           label: 'Notes',            required: false, type: 'text',   guesses: [/notes/i, /description/i, /about/i, /bio/i, /summary/i] },
]

const TIER_NORMALIZATION: Record<string, ImportClientRow['tier']> = {
  basic: 'Basic', standard: 'Standard', pro: 'Pro', premium: 'Pro', internal: 'Internal',
}
const STATUS_NORMALIZATION: Record<string, ImportClientRow['billing_status']> = {
  active: 'active', live: 'active', ongoing: 'active',
  paused: 'paused', pause: 'paused', hold: 'paused',
  cancelled: 'cancelled', canceled: 'cancelled', offboarded: 'cancelled', churn: 'cancelled', churned: 'cancelled',
  past_due: 'past_due', overdue: 'past_due', late: 'past_due',
}

// Special: 'skip' means don't import this column.
const SKIP_KEY = '__skip__'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

export default function ImportClientsPage() {
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<string, keyof ImportClientRow | typeof SKIP_KEY>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Map preview rows (first 5) through the current column mapping so the
  // admin can see exactly what will be sent to the import action.
  const mappedPreview = useMemo(() => {
    if (!csv) return []
    return csv.rows.slice(0, 5).map(row => mapRow(row, mapping))
  }, [csv, mapping])

  function handleFile(file: File) {
    setError(null)
    setResult(null)
    setDryRunResult(null)
    setFileName(file.name)

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (parsed) => {
        const headers = parsed.meta.fields ?? []
        const rows = parsed.data ?? []
        setCsv({ headers, rows })

        // Auto-guess mapping based on header name
        const initial: Record<string, keyof ImportClientRow | typeof SKIP_KEY> = {}
        for (const header of headers) {
          const target = TARGETS.find(t => t.guesses.some(re => re.test(header)))
          initial[header] = target ? target.key : SKIP_KEY
        }
        setMapping(initial)
      },
      error: (err) => setError(`Could not parse CSV: ${err.message}`),
    })
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function runImport(dryRun: boolean) {
    if (!csv) return
    setSubmitting(true); setError(null)
    const mappedRows = csv.rows.map(r => mapRow(r, mapping))
    const r = await importClientsFromCsv(mappedRows, { dryRun, skipDuplicates: true })
    setSubmitting(false)
    if (!r.success) {
      setError(r.error)
    } else if (dryRun) {
      setDryRunResult(r.data)
    } else {
      setResult(r.data)
      setDryRunResult(null)
    }
  }

  const hasName = useMemo(
    () => Object.values(mapping).some(v => v === 'name'),
    [mapping],
  )

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to clients
      </Link>

      <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink mb-1">Import clients</h1>
      <p className="text-sm text-ink-3 mb-6">
        Bulk-upload a CSV (e.g. a Notion database export). You&apos;ll map Notion&apos;s columns to Apnosh fields
        before the import runs. Duplicates by slug or email are skipped automatically.
      </p>

      {/* Step 1: Upload */}
      {!csv && (
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-ink-6 rounded-xl p-10 text-center hover:border-brand/40 hover:bg-brand-tint/30 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink mb-1">Drop a CSV here or click to select</p>
          <p className="text-xs text-ink-4">Notion export, spreadsheet CSV, anything with a header row</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Step 2: Mapping */}
      {csv && (
        <div className="space-y-6">
          {/* File summary */}
          <div className="flex items-center justify-between bg-white border border-ink-6 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-ink-4" />
              <span className="text-sm font-medium text-ink">{fileName}</span>
              <span className="text-[11px] text-ink-4">{csv.rows.length} rows</span>
            </div>
            <button
              onClick={() => { setCsv(null); setFileName(null); setMapping({}); setResult(null); setDryRunResult(null) }}
              className="text-xs text-ink-3 hover:text-red-700 inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          </div>

          {/* Column mapping */}
          {!result && (
            <div>
              <h2 className="text-sm font-semibold text-ink mb-3">Map your columns</h2>
              <div className="bg-white border border-ink-6 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-bg-2 border-b border-ink-6">
                      <th className="px-4 py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">CSV column</th>
                      <th className="px-4 py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Maps to</th>
                      <th className="px-4 py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Sample value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csv.headers.map(header => {
                      const sample = csv.rows.find(r => r[header] !== '' && r[header] !== undefined)?.[header] ?? ''
                      const current = mapping[header] ?? SKIP_KEY
                      return (
                        <tr key={header} className="border-b border-ink-6 last:border-0">
                          <td className="px-4 py-2 text-sm text-ink font-medium">{header || <span className="italic text-ink-4">(empty)</span>}</td>
                          <td className="px-4 py-2">
                            <select
                              value={current}
                              onChange={e => setMapping(m => ({ ...m, [header]: e.target.value as keyof ImportClientRow | typeof SKIP_KEY }))}
                              className="w-full px-2 py-1 text-sm border border-ink-6 rounded bg-white"
                            >
                              <option value={SKIP_KEY}>— Skip this column —</option>
                              {TARGETS.map(t => (
                                <option key={t.key} value={t.key}>
                                  {t.label}{t.required ? ' *' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 text-[12px] text-ink-3 max-w-[260px] truncate">{sample}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {!hasName && (
                <p className="text-[12px] text-amber-700 mt-2">
                  One column must map to <strong>Name</strong> before import.
                </p>
              )}
            </div>
          )}

          {/* Preview */}
          {!result && mappedPreview.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink mb-3">Preview (first 5 rows)</h2>
              <div className="bg-white border border-ink-6 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-bg-2 border-b border-ink-6">
                      <th className="px-3 py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Name</th>
                      <th className="px-3 py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Email</th>
                      <th className="px-3 py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Phone</th>
                      <th className="px-3 py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Location</th>
                      <th className="px-3 py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Tier</th>
                      <th className="px-3 py-2 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedPreview.map((row, i) => (
                      <tr key={i} className="border-b border-ink-6 last:border-0">
                        <td className="px-3 py-2 text-[13px] text-ink font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-[13px] text-ink-2">{row.email ?? '—'}</td>
                        <td className="px-3 py-2 text-[13px] text-ink-2">{row.phone ?? '—'}</td>
                        <td className="px-3 py-2 text-[13px] text-ink-2">{row.location ?? '—'}</td>
                        <td className="px-3 py-2 text-[13px] text-ink-2">{row.tier ?? '—'}</td>
                        <td className="px-3 py-2 text-[13px] text-ink-2 text-right">{row.monthly_rate ? '$' + row.monthly_rate : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dry run result */}
          {dryRunResult && !result && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Dry-run result
              </h3>
              <p className="text-[13px] text-blue-800">
                Would insert <strong>{dryRunResult.inserted}</strong>, skip <strong>{dryRunResult.skipped}</strong>,
                fail <strong>{dryRunResult.failed}</strong> out of <strong>{dryRunResult.total}</strong> rows.
              </p>
              {dryRunResult.skippedRows.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[12px] text-blue-700 cursor-pointer">Why skipped? ({dryRunResult.skippedRows.length})</summary>
                  <ul className="mt-1 ml-4 list-disc text-[12px] text-blue-800">
                    {dryRunResult.skippedRows.map((s, i) => (
                      <li key={i}>Row {s.row} ({s.name}): {s.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
              {dryRunResult.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[12px] text-red-700 cursor-pointer">Would fail ({dryRunResult.errors.length})</summary>
                  <ul className="mt-1 ml-4 list-disc text-[12px] text-red-700">
                    {dryRunResult.errors.map((e, i) => (
                      <li key={i}>Row {e.row} ({e.name}): {e.error}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Final result */}
          {result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-emerald-900 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Import complete
              </h3>
              <p className="text-[13px] text-emerald-800 mb-2">
                <strong>{result.inserted}</strong> inserted, <strong>{result.skipped}</strong> skipped as duplicates,
                <strong> {result.failed}</strong> failed out of <strong>{result.total}</strong> total.
              </p>
              {result.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[12px] text-red-700 cursor-pointer">Errors ({result.errors.length})</summary>
                  <ul className="mt-1 ml-4 list-disc text-[12px] text-red-700">
                    {result.errors.map((e, i) => (
                      <li key={i}>Row {e.row} ({e.name}): {e.error}</li>
                    ))}
                  </ul>
                </details>
              )}
              <Link href="/admin/clients" className="inline-flex items-center gap-1 text-sm text-brand hover:text-brand-dark font-medium mt-3">
                View imported clients <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Actions */}
          {!result && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => runImport(true)}
                disabled={!hasName || submitting}
                className="px-4 py-2 border border-ink-6 rounded-lg text-sm font-medium text-ink-2 hover:bg-bg-2 disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Dry run
              </button>
              <button
                onClick={() => runImport(false)}
                disabled={!hasName || submitting}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import for real
              </button>
            </div>
          )}
        </div>
      )}

      {/* Help */}
      <div className="mt-10 pt-6 border-t border-ink-6">
        <h3 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-2">How to export from Notion</h3>
        <ol className="text-[12px] text-ink-3 space-y-1 list-decimal list-inside">
          <li>Open your Notion database of clients</li>
          <li>Click the <strong>•••</strong> menu in the top right of the database</li>
          <li>Click <strong>Export</strong></li>
          <li>Choose <strong>Format: CSV</strong></li>
          <li>Drop the downloaded file above</li>
        </ol>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row mapping helper -- applied during preview + before send to server action.
// ---------------------------------------------------------------------------

function mapRow(
  raw: Record<string, string>,
  mapping: Record<string, keyof ImportClientRow | typeof SKIP_KEY>,
): ImportClientRow {
  const row: Partial<ImportClientRow> = {}

  for (const [header, target] of Object.entries(mapping)) {
    if (target === SKIP_KEY) continue
    const value = raw[header]
    if (value === undefined || value === null || value === '') continue

    const trimmed = String(value).trim()

    switch (target) {
      case 'monthly_rate': {
        // Parse dollar amount, allowing $, commas, "$1,234", "1234.56"
        const num = parseFloat(trimmed.replace(/[$,]/g, ''))
        if (Number.isFinite(num)) row.monthly_rate = num
        break
      }
      case 'tier': {
        const normalized = TIER_NORMALIZATION[trimmed.toLowerCase()]
        if (normalized) row.tier = normalized
        break
      }
      case 'billing_status': {
        const normalized = STATUS_NORMALIZATION[trimmed.toLowerCase()]
        if (normalized) row.billing_status = normalized
        break
      }
      case 'onboarding_date': {
        // Accept any date format JS Date can parse
        const d = new Date(trimmed)
        if (!isNaN(d.getTime())) row.onboarding_date = d.toISOString().split('T')[0]
        break
      }
      default: {
        // Plain text fields
        row[target] = trimmed as never
      }
    }
  }

  return row as ImportClientRow
}
