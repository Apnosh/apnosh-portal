'use client'

/**
 * Bulk GBP backfill page -- one upload covers every managed location.
 *
 * Flow:
 *   1. Admin drops the Looker Studio CSV (1 file, all locations, all days)
 *   2. Client-side parser normalizes columns -> LookerGbpRow[]
 *   3. Server previews -> which locations matched which clients
 *   4. Admin confirms -> server upserts into gbp_metrics
 *
 * Looker Studio CSV column names vary based on the report config.
 * We fuzzy-match them at parse time so admins can use whatever
 * column order / labels come out of their report.
 */

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, FileSpreadsheet, Check, AlertCircle, Users, AlertTriangle } from 'lucide-react'
import {
  previewBackfill,
  runBackfill,
  type LookerGbpRow,
  type BackfillPreview,
} from '@/lib/gbp-backfill-actions'

// ---------------------------------------------------------------------------
// CSV header -> logical field. Patterns are case-insensitive and match
// Looker Studio's default Business Profile connector headers as well as
// common renames.
// ---------------------------------------------------------------------------

type Field =
  | 'date' | 'location_name'
  | 'impressions_search_mobile' | 'impressions_search_desktop'
  | 'impressions_maps_mobile'   | 'impressions_maps_desktop'
  | 'impressions_total'
  | 'website_clicks' | 'calls' | 'directions' | 'conversations' | 'bookings'
  | 'photo_views' | 'photo_count' | 'post_views' | 'post_clicks'

const PATTERNS: Array<{ field: Field; re: RegExp }> = [
  { field: 'date', re: /^(date|day|period|metric\s*date)$/i },
  { field: 'location_name', re: /^(business[_\s]*name|location[_\s]*name|location|name)$/i },

  { field: 'impressions_search_mobile', re: /search.*mobile|mobile.*search/i },
  { field: 'impressions_search_desktop', re: /search.*desktop|desktop.*search/i },
  { field: 'impressions_maps_mobile', re: /maps.*mobile|mobile.*maps/i },
  { field: 'impressions_maps_desktop', re: /maps.*desktop|desktop.*maps/i },
  { field: 'impressions_total', re: /^(total[_\s]*impressions?|impressions?[_\s]*total|views?|total[_\s]*views?)$/i },

  { field: 'website_clicks', re: /website/i },
  { field: 'calls', re: /^(calls?|phone[_\s]*calls?|call[_\s]*clicks?)$/i },
  { field: 'directions', re: /direction/i },
  { field: 'conversations', re: /conversation|message/i },
  { field: 'bookings', re: /booking/i },

  { field: 'photo_views', re: /photo[_\s]*view/i },
  { field: 'photo_count', re: /photo[_\s]*count|photos?$/i },
  { field: 'post_views', re: /post[_\s]*view/i },
  { field: 'post_clicks', re: /post[_\s]*click/i },
]

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  return lines.map(line => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue }
      current += ch
    }
    cells.push(current.trim())
    return cells
  })
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (mdy) {
    const [, m, d, y] = mdy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // YYYYMMDD (Looker often outputs this)
  const ymd = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function parseIntLoose(v: string | undefined): number {
  if (!v) return 0
  const n = parseInt(v.replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

interface ParsedFile {
  rows: LookerGbpRow[]
  headerToField: Record<string, Field>
  totalRows: number
  errors: string[]
  filename: string
}

function parseLookerCsv(text: string, filename: string): ParsedFile {
  const rawRows = parseCSV(text)
  if (rawRows.length < 2) return { rows: [], headerToField: {}, totalRows: 0, errors: ['File has no data rows'], filename }

  const headers = rawRows[0]
  const headerToField: Record<string, Field> = {}
  const fieldIdx: Partial<Record<Field, number>> = {}

  headers.forEach((h, i) => {
    const match = PATTERNS.find(p => p.re.test(h.trim()))
    if (match && fieldIdx[match.field] === undefined) {
      headerToField[h] = match.field
      fieldIdx[match.field] = i
    }
  })

  if (fieldIdx.date === undefined) {
    return { rows: [], headerToField, totalRows: 0, errors: ['Could not find a date column. Headers: ' + headers.join(', ')], filename }
  }
  if (fieldIdx.location_name === undefined) {
    return { rows: [], headerToField, totalRows: 0, errors: ['Could not find a business/location name column. Headers: ' + headers.join(', ')], filename }
  }

  const rows: LookerGbpRow[] = []
  const errors: string[] = []

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    const rawDate = row[fieldIdx.date!]
    const date = normalizeDate(rawDate)
    const loc = row[fieldIdx.location_name!]?.trim()
    if (!date || !loc) {
      if (errors.length < 5) errors.push(`Row ${i + 1}: missing date or location`)
      continue
    }

    const get = (f: Field) => fieldIdx[f] !== undefined ? parseIntLoose(row[fieldIdx[f]!]) : 0

    rows.push({
      date,
      location_name: loc,
      impressions_search_mobile: get('impressions_search_mobile'),
      impressions_search_desktop: get('impressions_search_desktop'),
      impressions_maps_mobile: get('impressions_maps_mobile'),
      impressions_maps_desktop: get('impressions_maps_desktop'),
      impressions_total: fieldIdx.impressions_total !== undefined ? get('impressions_total') : undefined,
      website_clicks: get('website_clicks'),
      calls: get('calls'),
      directions: get('directions'),
      conversations: get('conversations'),
      bookings: get('bookings'),
      photo_views: get('photo_views'),
      photo_count: get('photo_count'),
      post_views: get('post_views'),
      post_clicks: get('post_clicks'),
    })
  }

  return { rows, headerToField, totalRows: rawRows.length - 1, errors, filename }
}

// ---------------------------------------------------------------------------

export default function BackfillPage() {
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [preview, setPreview] = useState<BackfillPreview | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleFile = useCallback((file: File) => {
    setResult(null); setPreview(null)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      const p = parseLookerCsv(text, file.name)
      setParsed(p)
      if (p.rows.length > 0) {
        setBusy(true)
        const res = await previewBackfill(p.rows)
        setBusy(false)
        if (res.success) setPreview(res.data)
        else setResult({ ok: false, msg: res.error })
      }
    }
    reader.readAsText(file)
  }, [])

  const handleConfirm = async () => {
    if (!parsed) return
    setBusy(true)
    const res = await runBackfill({ rows: parsed.rows, filename: parsed.filename, source: 'looker_csv' })
    setBusy(false)
    if (res.success) {
      setResult({ ok: true, msg: `Imported ${res.data.imported} rows across ${preview?.locationsMatched.length ?? 0} clients. ${res.data.unmatched > 0 ? `${res.data.unmatched} unmatched rows skipped.` : ''}` })
      setParsed(null); setPreview(null)
    } else {
      setResult({ ok: false, msg: res.error })
    }
  }

  const mappedFields = useMemo(
    () => parsed ? Object.values(parsed.headerToField) : [],
    [parsed]
  )

  return (
    <div className="max-w-4xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-6">
        <ArrowLeft className="w-4 h-4" /> Admin home
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1">GBP Bulk Backfill</h1>
        <p className="text-sm text-ink-3">
          Upload one CSV export from Looker Studio covering every location. Rows are routed to each client automatically by business name.
        </p>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`flex items-start gap-3 p-4 rounded-xl mb-6 ${result.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
          {result.ok ? <Check className="w-5 h-5 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />}
          <p className="text-sm">{result.msg}</p>
        </div>
      )}

      {/* Dropzone */}
      {!parsed && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? 'border-brand bg-brand-tint' : 'border-ink-5 hover:border-ink-4'}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
        >
          <Upload className="w-10 h-10 text-ink-4 mx-auto mb-4" />
          <p className="text-sm font-medium text-ink mb-1">Drop the Looker Studio CSV here</p>
          <p className="text-xs text-ink-3 mb-4">one file, every location, every day</p>
          <label className="inline-block cursor-pointer px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink-2">
            Choose file
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
        </div>
      )}

      {/* Parsed + preview */}
      {parsed && (
        <div className="space-y-6">
          {parsed.errors.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm">
              <strong>Parser warnings:</strong>
              <ul className="mt-2 list-disc list-inside space-y-1">
                {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="w-5 h-5 text-brand" />
              <h2 className="text-sm font-bold">Parse summary</h2>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-ink-3">File:</span> <span className="font-medium">{parsed.filename}</span></div>
              <div><span className="text-ink-3">Rows:</span> <span className="font-medium">{parsed.rows.length.toLocaleString()}</span></div>
              <div><span className="text-ink-3">Fields mapped:</span> <span className="font-medium">{mappedFields.length}</span></div>
            </div>
          </div>

          {busy && !preview && (
            <div className="text-sm text-ink-3">Matching locations to clients...</div>
          )}

          {preview && (
            <>
              <div className="bg-white rounded-xl border border-ink-6 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-5 h-5 text-brand" />
                  <h2 className="text-sm font-bold">Matched locations ({preview.locationsMatched.length})</h2>
                </div>
                <div className="space-y-2">
                  {preview.locationsMatched.map(m => (
                    <div key={m.locationName} className="flex items-center justify-between p-3 rounded-lg bg-bg-2 text-sm">
                      <div>
                        <span className="font-medium">{m.locationName}</span>
                        <span className="text-ink-3"> → {m.clientName}</span>
                      </div>
                      <div className="text-xs text-ink-3">
                        {m.rowCount} rows · {m.dateFirst} → {m.dateLast}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {preview.locationsUnmatched.length > 0 && (
                <div className="bg-white rounded-xl border border-amber-200 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <h2 className="text-sm font-bold text-amber-800">Unmatched locations ({preview.locationsUnmatched.length})</h2>
                  </div>
                  <p className="text-xs text-ink-3 mb-3">
                    These names didn&apos;t match any client. Either add the client first, or rename the client in Supabase so the business name aligns, then re-upload.
                  </p>
                  <ul className="space-y-1 text-sm">
                    {preview.locationsUnmatched.map(u => (
                      <li key={u.locationName} className="flex justify-between py-1">
                        <span className="font-medium">{u.locationName}</span>
                        <span className="text-ink-3 text-xs">{u.rowCount} rows will be skipped</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleConfirm}
                  disabled={busy || preview.locationsMatched.length === 0}
                  className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark disabled:opacity-50"
                >
                  {busy ? 'Importing...' : `Import ${preview.locationsMatched.reduce((a, m) => a + m.rowCount, 0).toLocaleString()} rows`}
                </button>
                <button
                  onClick={() => { setParsed(null); setPreview(null) }}
                  className="px-5 py-2.5 border border-ink-5 text-sm font-medium rounded-lg hover:bg-bg-2"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
