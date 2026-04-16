'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, Trash2, Pencil, X, Save, Globe } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { upsertWebsiteMetrics } from '@/lib/admin-data-actions'

interface MetricRow {
  id: string
  date: string
  visitors: number
  page_views: number
  sessions: number
  bounce_rate: number | null
  avg_session_duration: number | null
  mobile_pct: number | null
  traffic_sources: unknown
  top_pages: unknown
}

interface FormState {
  date: string
  visitors: string
  page_views: string
  sessions: string
  bounce_rate: string
  avg_session_duration: string
  mobile_pct: string
  traffic_sources: string
  top_pages: string
}

function makeBlankForm(): FormState {
  // Default to first of current month
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  return {
    date,
    visitors: '',
    page_views: '',
    sessions: '',
    bounce_rate: '',
    avg_session_duration: '',
    mobile_pct: '',
    traffic_sources: '',
    top_pages: '',
  }
}

function rowToForm(row: MetricRow): FormState {
  return {
    date: row.date,
    visitors: String(row.visitors || ''),
    page_views: String(row.page_views || ''),
    sessions: String(row.sessions || ''),
    bounce_rate: row.bounce_rate != null ? String(row.bounce_rate) : '',
    avg_session_duration: row.avg_session_duration != null ? String(row.avg_session_duration) : '',
    mobile_pct: row.mobile_pct != null ? String(row.mobile_pct) : '',
    traffic_sources: row.traffic_sources ? JSON.stringify(row.traffic_sources) : '',
    top_pages: row.top_pages ? JSON.stringify(row.top_pages) : '',
  }
}

function NumField({ label, value, onChange, placeholder, step }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; step?: string
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">{label}</label>
      <input
        type="number"
        step={step || '1'}
        min="0"
        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export default function WebsiteTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<MetricRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(makeBlankForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('website_metrics')
      .select('id, date, visitors, page_views, sessions, bounce_rate, avg_session_duration, mobile_pct, traffic_sources, top_pages')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .limit(24)
    setRows((data ?? []) as MetricRow[])
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  function startAdd() {
    setEditingId(null)
    setForm(makeBlankForm())
    setShowForm(true)
    setError(null)
  }

  function startEdit(row: MetricRow) {
    setEditingId(row.id)
    setForm(rowToForm(row))
    setShowForm(true)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    const res = await upsertWebsiteMetrics({
      client_id: clientId,
      date: form.date,
      visitors: form.visitors ? parseInt(form.visitors, 10) : 0,
      page_views: form.page_views ? parseInt(form.page_views, 10) : 0,
      sessions: form.sessions ? parseInt(form.sessions, 10) : 0,
      bounce_rate: form.bounce_rate ? parseFloat(form.bounce_rate) : undefined,
      avg_session_duration: form.avg_session_duration ? parseInt(form.avg_session_duration, 10) : undefined,
      mobile_pct: form.mobile_pct ? parseFloat(form.mobile_pct) : undefined,
      traffic_sources: form.traffic_sources || undefined,
      top_pages: form.top_pages || undefined,
    })

    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setShowForm(false)
    load()
  }

  const fmtNum = (n: number) => n.toLocaleString()
  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  if (loading) return <div className="text-sm text-ink-4 animate-pulse py-8 text-center">Loading website metrics...</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-3">Monthly website metrics. Enter data from Google Analytics or manually.</p>
        <button onClick={startAdd} className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> Add Month
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-brand/30 ring-1 ring-brand/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">{editingId ? 'Edit Month' : 'Add Month'}</h3>
            <button onClick={() => { setShowForm(false); setError(null) }} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">Month</label>
              <input type="date" className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <NumField label="Visitors" value={form.visitors} onChange={(v) => setForm((f) => ({ ...f, visitors: v }))} placeholder="5,000" />
            <NumField label="Page Views" value={form.page_views} onChange={(v) => setForm((f) => ({ ...f, page_views: v }))} placeholder="12,000" />
            <NumField label="Sessions" value={form.sessions} onChange={(v) => setForm((f) => ({ ...f, sessions: v }))} placeholder="6,500" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <NumField label="Bounce Rate (%)" value={form.bounce_rate} onChange={(v) => setForm((f) => ({ ...f, bounce_rate: v }))} placeholder="45" step="0.1" />
            <NumField label="Avg Session (sec)" value={form.avg_session_duration} onChange={(v) => setForm((f) => ({ ...f, avg_session_duration: v }))} placeholder="120" />
            <NumField label="Mobile (%)" value={form.mobile_pct} onChange={(v) => setForm((f) => ({ ...f, mobile_pct: v }))} placeholder="68" step="0.1" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">Traffic Sources</label>
              <input type="text" className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm" placeholder="Organic 60%, Social 20%, Direct 15%, Referral 5%" value={form.traffic_sources} onChange={(e) => setForm((f) => ({ ...f, traffic_sources: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">Top Pages</label>
              <input type="text" className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm" placeholder="/menu, /about, /catering" value={form.top_pages} onChange={(e) => setForm((f) => ({ ...f, top_pages: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-ink-3 rounded-lg">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-12">
          <Globe className="w-8 h-8 text-ink-5 mx-auto mb-2" />
          <p className="text-sm font-medium text-ink-3 mb-1">No website data yet</p>
          <p className="text-xs text-ink-4">Click "Add Month" to enter metrics from Google Analytics.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-6 bg-bg-2">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-4">Month</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-4">Visitors</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-4">Page Views</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-4">Sessions</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-4">Bounce</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-4">Mobile</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-4" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                  <td className="px-4 py-3 font-medium text-ink">{fmtDate(row.date)}</td>
                  <td className="px-4 py-3 text-right text-ink">{fmtNum(row.visitors)}</td>
                  <td className="px-4 py-3 text-right text-ink">{fmtNum(row.page_views)}</td>
                  <td className="px-4 py-3 text-right text-ink">{fmtNum(row.sessions)}</td>
                  <td className="px-4 py-3 text-right text-ink-3">{row.bounce_rate != null ? `${row.bounce_rate}%` : '--'}</td>
                  <td className="px-4 py-3 text-right text-ink-3">{row.mobile_pct != null ? `${row.mobile_pct}%` : '--'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(row)} className="text-ink-4 hover:text-brand transition-colors p-1">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
