'use client'

import { useState, useCallback, use } from 'react'
import Link from 'next/link'
import { Upload, FileSpreadsheet, Check, AlertCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { importGbpData, type GbpImportRow } from './actions'

interface ParsedData {
  rows: GbpImportRow[]
  columnMap: Record<string, string>
  dateRange: { first: string; last: string }
  locationNames: string[]
  preview: GbpImportRow[]
}

// Column header fuzzy matching
const COLUMN_PATTERNS: Record<string, RegExp> = {
  date: /^(date|day|period)$/i,
  directions: /^(directions?|direction\s*requests?)$/i,
  calls: /^(calls?|phone\s*calls?|call\s*clicks?)$/i,
  website_clicks: /^(website|website\s*clicks?|website\s*visits?)$/i,
  search_views: /^(searches?|search\s*views?|views?|total\s*searches?|total\s*views?)$/i,
  location_name: /^(business\s*name|location|location\s*name|name)$/i,
}

function parseDate(raw: string): string | null {
  if (!raw) return null
  // Try ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // Try MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (mdy) {
    const [, m, d, y] = mdy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Try DD/MM/YYYY (if day > 12, assume DD/MM)
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy && parseInt(dmy[1]) > 12) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Try Date constructor as last resort
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  return lines.map((line) => {
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

function autoMapColumns(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const header of headers) {
    for (const [field, pattern] of Object.entries(COLUMN_PATTERNS)) {
      if (pattern.test(header.trim())) {
        map[field] = header
        break
      }
    }
  }
  return map
}

export default function ImportGbpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [parsed, setParsed] = useState<ParsedData | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Resolve client_id from slug on mount
  useState(() => {
    const supabase = createClient()
    supabase
      .from('clients')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setClientId(data.id)
          setClientName(data.name)
        }
      })
  })

  const handleFile = useCallback((file: File) => {
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const rows = parseCSV(text)
      if (rows.length < 2) {
        setResult({ success: false, message: 'File has no data rows' })
        return
      }

      const headers = rows[0]
      const columnMap = autoMapColumns(headers)

      if (!columnMap.date) {
        setResult({ success: false, message: 'Could not find a date column. Headers found: ' + headers.join(', ') })
        return
      }

      const dateIdx = headers.indexOf(columnMap.date)
      const dirIdx = columnMap.directions ? headers.indexOf(columnMap.directions) : -1
      const callIdx = columnMap.calls ? headers.indexOf(columnMap.calls) : -1
      const clickIdx = columnMap.website_clicks ? headers.indexOf(columnMap.website_clicks) : -1
      const searchIdx = columnMap.search_views ? headers.indexOf(columnMap.search_views) : -1
      const locIdx = columnMap.location_name ? headers.indexOf(columnMap.location_name) : -1

      const dataRows: GbpImportRow[] = []
      const errors: string[] = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const rawDate = row[dateIdx]
        const date = parseDate(rawDate)
        if (!date) {
          errors.push(`Row ${i + 1}: invalid date "${rawDate}"`)
          continue
        }

        dataRows.push({
          date,
          directions: dirIdx >= 0 ? parseInt(row[dirIdx]) || 0 : 0,
          calls: callIdx >= 0 ? parseInt(row[callIdx]) || 0 : 0,
          website_clicks: clickIdx >= 0 ? parseInt(row[clickIdx]) || 0 : 0,
          search_views: searchIdx >= 0 ? parseInt(row[searchIdx]) || 0 : 0,
          location_name: locIdx >= 0 ? row[locIdx] || undefined : undefined,
        })
      }

      if (dataRows.length === 0) {
        setResult({ success: false, message: 'No valid rows found. ' + errors.slice(0, 3).join('; ') })
        return
      }

      const dates = dataRows.map((r) => r.date).sort()
      const locations = [...new Set(dataRows.map((r) => r.location_name).filter(Boolean))] as string[]

      setParsed({
        rows: dataRows,
        columnMap,
        dateRange: { first: dates[0], last: dates[dates.length - 1] },
        locationNames: locations.length ? locations : [clientName || 'Default'],
        preview: dataRows.slice(0, 5),
      })
    }
    reader.readAsText(file)
  }, [clientName])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleImport = async () => {
    if (!parsed || !clientId) return
    setImporting(true)
    const res = await importGbpData(clientId, parsed.rows)
    if (res.success) {
      setResult({ success: true, message: `${res.data?.imported} days imported for ${parsed.locationNames.join(', ')}, ${parsed.dateRange.first} to ${parsed.dateRange.last}` })
      setParsed(null)
    } else {
      setResult({ success: false, message: res.error || 'Import failed' })
    }
    setImporting(false)
  }

  return (
    <div className="max-w-3xl">
      <Link
        href={`/admin/clients/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {clientName || 'client'}
      </Link>

      <h1 className="text-xl font-bold text-ink mb-1">Import GBP Data</h1>
      <p className="text-sm text-ink-3 mb-6">
        Upload a CSV export from Google Business Profile performance reports.
      </p>

      {/* Result message */}
      {result && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl mb-6 ${result.success ? 'bg-brand-tint border border-brand/20' : 'bg-red-50 border border-red-200'}`}
        >
          {result.success ? (
            <Check className="w-5 h-5 text-brand-dark flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-sm">{result.message}</p>
        </div>
      )}

      {/* File upload dropzone */}
      {!parsed && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? 'border-brand bg-brand-tint' : 'border-ink-5 hover:border-ink-4'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="w-10 h-10 text-ink-4 mx-auto mb-4" />
          <p className="text-sm font-medium text-ink mb-1">
            Drag and drop a CSV file here
          </p>
          <p className="text-xs text-ink-3 mb-4">or</p>
          <label className="inline-block cursor-pointer px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink-2 transition-colors">
            Choose file
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </label>
        </div>
      )}

      {/* Preview */}
      {parsed && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="w-5 h-5 text-brand" />
              <h2 className="text-sm font-bold">Import Preview</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-ink-3">Rows:</span>{' '}
                <span className="font-medium">{parsed.rows.length}</span>
              </div>
              <div>
                <span className="text-ink-3">Date range:</span>{' '}
                <span className="font-medium">{parsed.dateRange.first} to {parsed.dateRange.last}</span>
              </div>
              <div>
                <span className="text-ink-3">Location{parsed.locationNames.length > 1 ? 's' : ''}:</span>{' '}
                <span className="font-medium">{parsed.locationNames.join(', ')}</span>
              </div>
              <div>
                <span className="text-ink-3">Columns mapped:</span>{' '}
                <span className="font-medium">{Object.keys(parsed.columnMap).join(', ')}</span>
              </div>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-6 bg-bg-2">
                    <th className="text-left px-4 py-2 font-medium text-ink-3">Date</th>
                    <th className="text-right px-4 py-2 font-medium text-ink-3">Directions</th>
                    <th className="text-right px-4 py-2 font-medium text-ink-3">Calls</th>
                    <th className="text-right px-4 py-2 font-medium text-ink-3">Website</th>
                    <th className="text-right px-4 py-2 font-medium text-ink-3">Search</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.preview.map((row, i) => (
                    <tr key={i} className="border-b border-ink-6 last:border-0">
                      <td className="px-4 py-2">{row.date}</td>
                      <td className="px-4 py-2 text-right">{row.directions}</td>
                      <td className="px-4 py-2 text-right">{row.calls}</td>
                      <td className="px-4 py-2 text-right">{row.website_clicks}</td>
                      <td className="px-4 py-2 text-right">{row.search_views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 5 && (
              <div className="px-4 py-2 text-xs text-ink-3 border-t border-ink-6">
                Showing 5 of {parsed.rows.length} rows
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Import ${parsed.rows.length} rows`}
            </button>
            <button
              onClick={() => setParsed(null)}
              className="px-5 py-2.5 border border-ink-5 text-sm font-medium rounded-lg hover:bg-bg-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
