'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { FileDropZone, ColumnMapper, ImportPreview } from '@/components/analytics'
import { parseFile, autoDetectMapping, extractDatesFromRows, extractDateFromFilename, buildGBPRow, METRIC_FIELDS } from '@/lib/gbp-data'
import type { Business, GBPMetricField, GBPMonthlyData } from '@/types/database'
import type { ParsedSheet } from '@/lib/gbp-data'

type Step = 'upload' | 'mapping' | 'preview' | 'done'

export default function AdminUploadPage() {
  const { toast } = useToast()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [selectedBizId, setSelectedBizId] = useState('')
  const [loading, setLoading] = useState(true)

  // Upload flow state
  const [step, setStep] = useState<Step>('upload')
  const [parsed, setParsed] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<Record<string, GBPMetricField | '__skip'>>({})
  const [dates, setDates] = useState<{ month: number; year: number }[]>([])
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)

  // Fetch businesses
  useEffect(() => {
    const supabase = createClient()
    supabase.from('businesses').select('*').order('name').then(({ data }) => {
      const biz = (data as Business[]) || []
      setBusinesses(biz)
      if (biz.length > 0) setSelectedBizId(biz[0].id)
      setLoading(false)
    })
  }, [])

  // Handle file selection
  async function handleFile(file: File) {
    if (!selectedBizId) {
      toast('Please select a client first.', 'warning')
      return
    }
    try {
      setFileName(file.name)
      const sheet = await parseFile(file)
      setParsed(sheet)

      // Auto-detect column mapping
      const autoMap = autoDetectMapping(sheet.headers)
      setMapping(autoMap)

      // Extract dates from rows, fall back to filename
      let rowDates = extractDatesFromRows(sheet.rows)
      if (rowDates.length === 0) {
        const fileDt = extractDateFromFilename(file.name)
        if (fileDt) {
          rowDates = sheet.rows.map(() => fileDt)
        }
      }
      // Pad dates if fewer than rows
      while (rowDates.length < sheet.rows.length) {
        rowDates.push(rowDates[rowDates.length - 1] || { month: 1, year: 2024 })
      }
      setDates(rowDates)

      // Check if any non-skip mappings were found
      const hasMapping = Object.values(autoMap).some(v => v !== '__skip')
      if (hasMapping) {
        setStep('preview')
      } else {
        setStep('mapping')
      }
    } catch (err) {
      toast(`Failed to read file: ${(err as Error).message}`, 'error')
    }
  }

  // Handle mapping confirmation
  function handleMappingSave(newMapping: Record<string, GBPMetricField | '__skip'>) {
    setMapping(newMapping)
    setStep('preview')
  }

  // Build preview rows
  const previewRows = useMemo(() => {
    if (!parsed) return []
    return parsed.rows.map((row, i) => {
      const date = dates[i] || { month: 1, year: 2024 }
      const built = buildGBPRow(row, mapping, selectedBizId, date)
      return { ...built, month: date.month, year: date.year } as unknown as Record<string, number> & { month: number; year: number }
    })
  }, [parsed, mapping, dates, selectedBizId])

  const activeMetrics = useMemo(() => {
    return METRIC_FIELDS
      .filter(f => f.value !== '__skip')
      .map(f => f.value as GBPMetricField)
  }, [])

  // Save to Supabase
  async function handleConfirm() {
    if (!parsed || !selectedBizId) return
    setSaving(true)
    try {
      const supabase = createClient()
      const rows = parsed.rows.map((row, i) => {
        const date = dates[i] || { month: 1, year: 2024 }
        return buildGBPRow(row, mapping, selectedBizId, date)
      })

      const { error } = await supabase
        .from('gbp_monthly_data')
        .upsert(rows as unknown as GBPMonthlyData[], {
          onConflict: 'business_id,year,month',
        })

      if (error) throw new Error(error.message)

      toast(`Imported ${rows.length} month${rows.length !== 1 ? 's' : ''} of data.`, 'success')
      setStep('done')
    } catch (err) {
      toast(`Import failed: ${(err as Error).message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setStep('upload')
    setParsed(null)
    setMapping({})
    setDates([])
    setFileName('')
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="h-64 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/analytics" className="p-2 rounded-lg hover:bg-ink-6 transition-colors">
          <ArrowLeft className="w-5 h-5 text-ink-3" />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Upload GBP Data</h1>
          <p className="text-ink-3 text-sm mt-0.5">Import Google Business Profile metrics from a spreadsheet.</p>
        </div>
      </div>

      {/* Client selector */}
      <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-5">
        <label className="block text-sm font-medium text-ink-2 mb-2">Select client</label>
        <select
          value={selectedBizId}
          onChange={e => setSelectedBizId(e.target.value)}
          disabled={step !== 'upload'}
          className="w-full bg-white border border-ink-6 rounded-xl px-4 py-2.5 text-sm text-ink disabled:opacity-60"
        >
          <option value="">Choose a client...</option>
          {businesses.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <FileDropZone onFile={handleFile} disabled={!selectedBizId} />
      )}

      {/* Step: Column Mapping */}
      {step === 'mapping' && parsed && (
        <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-base text-ink mb-3">Map columns</h2>
          <p className="text-sm text-ink-4 mb-4">File: {fileName}</p>
          <ColumnMapper
            headers={parsed.headers}
            initialMapping={mapping}
            onSave={handleMappingSave}
          />
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-[family-name:var(--font-display)] text-base text-ink">Review import</h2>
            <button
              onClick={() => setStep('mapping')}
              className="text-xs text-brand-dark hover:underline"
            >
              Edit mapping
            </button>
          </div>
          <p className="text-sm text-ink-4 mb-4">File: {fileName}</p>
          <ImportPreview
            rows={previewRows}
            activeMetrics={activeMetrics}
            onConfirm={handleConfirm}
            onCancel={handleReset}
            saving={saving}
          />
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-12 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-2">Import complete</h2>
          <p className="text-sm text-ink-3 mb-6">Your data is ready to view.</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleReset}
              className="px-5 py-2.5 rounded-xl border border-ink-6 text-sm font-medium text-ink-3 hover:bg-white/50 transition-colors"
            >
              Upload more
            </button>
            <Link
              href={`/admin/analytics/${selectedBizId}`}
              className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
            >
              View analytics
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
