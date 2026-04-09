'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, Trash2, Pencil, X, Save, BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { upsertSocialMetrics, deleteSocialMetrics } from '@/lib/admin-data-actions'
import type { SocialMetricsRow, SocialPlatform } from '@/types/database'

const PLATFORM_OPTIONS: { value: SocialPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'google_business', label: 'Google Business' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitter', label: 'Twitter' },
]

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface FormState {
  platform: SocialPlatform
  month: number
  year: number
  posts_published: string
  posts_planned: string
  total_reach: string
  total_impressions: string
  total_engagement: string
  likes: string
  comments: string
  shares: string
  saves: string
  followers_count: string
  followers_change: string
  top_post_url: string
  top_post_caption: string
  top_post_engagement: string
  top_post_image_url: string
  notes: string
}

function makeBlankForm(): FormState {
  const now = new Date()
  return {
    platform: 'instagram',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    posts_published: '',
    posts_planned: '',
    total_reach: '',
    total_impressions: '',
    total_engagement: '',
    likes: '',
    comments: '',
    shares: '',
    saves: '',
    followers_count: '',
    followers_change: '',
    top_post_url: '',
    top_post_caption: '',
    top_post_engagement: '',
    top_post_image_url: '',
    notes: '',
  }
}

function rowToForm(row: SocialMetricsRow): FormState {
  return {
    platform: row.platform,
    month: row.month,
    year: row.year,
    posts_published: String(row.posts_published),
    posts_planned: String(row.posts_planned),
    total_reach: String(row.total_reach),
    total_impressions: String(row.total_impressions),
    total_engagement: String(row.total_engagement),
    likes: String(row.likes),
    comments: String(row.comments),
    shares: String(row.shares),
    saves: String(row.saves),
    followers_count: String(row.followers_count),
    followers_change: String(row.followers_change),
    top_post_url: row.top_post_url ?? '',
    top_post_caption: row.top_post_caption ?? '',
    top_post_engagement: row.top_post_engagement != null ? String(row.top_post_engagement) : '',
    top_post_image_url: row.top_post_image_url ?? '',
    notes: row.notes ?? '',
  }
}

function num(s: string): number {
  const n = parseInt(s, 10)
  return Number.isNaN(n) ? 0 : n
}

export default function MetricsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()

  const [rows, setRows] = useState<SocialMetricsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(makeBlankForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('social_metrics')
      .select('*')
      .eq('client_id', clientId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .order('platform', { ascending: true })

    setRows((data ?? []) as SocialMetricsRow[])
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  function startAdd() {
    setEditingId(null)
    setForm(makeBlankForm())
    setShowForm(true)
    setError(null)
  }

  function startEdit(row: SocialMetricsRow) {
    setEditingId(row.id)
    setForm(rowToForm(row))
    setShowForm(true)
    setError(null)
  }

  function cancel() {
    setShowForm(false)
    setEditingId(null)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    const result = await upsertSocialMetrics({
      client_id: clientId,
      platform: form.platform,
      month: form.month,
      year: form.year,
      posts_published: num(form.posts_published),
      posts_planned: num(form.posts_planned),
      total_reach: num(form.total_reach),
      total_impressions: num(form.total_impressions),
      total_engagement: num(form.total_engagement),
      likes: num(form.likes),
      comments: num(form.comments),
      shares: num(form.shares),
      saves: num(form.saves),
      followers_count: num(form.followers_count),
      followers_change: num(form.followers_change),
      top_post_url: form.top_post_url || null,
      top_post_caption: form.top_post_caption || null,
      top_post_engagement: form.top_post_engagement ? num(form.top_post_engagement) : null,
      top_post_image_url: form.top_post_image_url || null,
      notes: form.notes || null,
    })

    setSaving(false)

    if (result.success) {
      setShowForm(false)
      setEditingId(null)
      await load()
    } else {
      setError(result.error)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this metrics snapshot?')) return
    const result = await deleteSocialMetrics(id)
    if (result.success) await load()
    else setError(result.error)
  }

  const yearOptions = [2024, 2025, 2026, 2027]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-3">
            Monthly performance snapshots per platform. Entered here, shown to the client on their Social Performance page.
          </p>
        </div>
        <button
          onClick={startAdd}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Snapshot
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-brand/30 ring-1 ring-brand/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              {editingId ? 'Edit Snapshot' : 'Add Snapshot'}
            </h3>
            <button onClick={cancel} className="text-ink-4 hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Platform / Month / Year */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Platform</label>
              <select
                value={form.platform}
                onChange={e => setForm(f => ({ ...f, platform: e.target.value as SocialPlatform }))}
                disabled={!!editingId}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white disabled:bg-bg-2 disabled:text-ink-3"
              >
                {PLATFORM_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Month</label>
              <select
                value={form.month}
                onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))}
                disabled={!!editingId}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white disabled:bg-bg-2 disabled:text-ink-3"
              >
                {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Year</label>
              <select
                value={form.year}
                onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                disabled={!!editingId}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white disabled:bg-bg-2 disabled:text-ink-3"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Volume */}
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Posts published" value={form.posts_published} onChange={v => setForm(f => ({ ...f, posts_published: v }))} />
            <NumField label="Posts planned" value={form.posts_planned} onChange={v => setForm(f => ({ ...f, posts_planned: v }))} />
          </div>

          {/* Reach / engagement */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <NumField label="Total reach" value={form.total_reach} onChange={v => setForm(f => ({ ...f, total_reach: v }))} />
            <NumField label="Impressions" value={form.total_impressions} onChange={v => setForm(f => ({ ...f, total_impressions: v }))} />
            <NumField label="Total engagement" value={form.total_engagement} onChange={v => setForm(f => ({ ...f, total_engagement: v }))} />
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumField label="Likes" value={form.likes} onChange={v => setForm(f => ({ ...f, likes: v }))} />
            <NumField label="Comments" value={form.comments} onChange={v => setForm(f => ({ ...f, comments: v }))} />
            <NumField label="Shares" value={form.shares} onChange={v => setForm(f => ({ ...f, shares: v }))} />
            <NumField label="Saves" value={form.saves} onChange={v => setForm(f => ({ ...f, saves: v }))} />
          </div>

          {/* Followers */}
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Followers count" value={form.followers_count} onChange={v => setForm(f => ({ ...f, followers_count: v }))} />
            <NumField label="Followers change this month" value={form.followers_change} onChange={v => setForm(f => ({ ...f, followers_change: v }))} />
          </div>

          {/* Top post */}
          <div className="border-t border-ink-6 pt-4 space-y-3">
            <h4 className="text-xs font-semibold text-ink">Top Post (optional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Post URL" value={form.top_post_url} onChange={v => setForm(f => ({ ...f, top_post_url: v }))} placeholder="https://..." />
              <TextField label="Image URL" value={form.top_post_image_url} onChange={v => setForm(f => ({ ...f, top_post_image_url: v }))} placeholder="https://..." />
            </div>
            <TextareaField label="Caption" value={form.top_post_caption} onChange={v => setForm(f => ({ ...f, top_post_caption: v }))} rows={2} />
            <NumField label="Engagement on this post" value={form.top_post_engagement} onChange={v => setForm(f => ({ ...f, top_post_engagement: v }))} />
          </div>

          {/* Notes */}
          <TextareaField label="Internal notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={2} />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-6">
            <button onClick={cancel} className="text-sm text-ink-3 hover:text-ink transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <BarChart3 className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No metrics snapshots yet</p>
          <p className="text-xs text-ink-4 mt-1">Click &ldquo;Add Snapshot&rdquo; to enter your first month of data.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-2 border-b border-ink-6">
                  <th className="text-left py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Period</th>
                  <th className="text-left py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Platform</th>
                  <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Reach</th>
                  <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Engagement</th>
                  <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Followers</th>
                  <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Posts</th>
                  <th className="text-right py-2.5 px-4 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                    <td className="py-3 px-4 text-ink font-medium">{MONTH_NAMES[row.month - 1]} {row.year}</td>
                    <td className="py-3 px-4 text-ink-2 capitalize">{row.platform.replace('_', ' ')}</td>
                    <td className="py-3 px-4 text-right text-ink">{row.total_reach.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-ink">{row.total_engagement.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-ink">
                      {row.followers_count.toLocaleString()}
                      {row.followers_change !== 0 && (
                        <span className={`ml-1 text-[10px] ${row.followers_change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          ({row.followers_change > 0 ? '+' : ''}{row.followers_change})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-ink">
                      {row.posts_published}
                      {row.posts_planned > 0 && <span className="text-ink-4">/{row.posts_planned}</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startEdit(row)} className="text-ink-4 hover:text-brand-dark transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(row.id)} className="text-ink-4 hover:text-red-500 transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0"
        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
      />
    </div>
  )
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
      />
    </div>
  )
}

function TextareaField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
      />
    </div>
  )
}
