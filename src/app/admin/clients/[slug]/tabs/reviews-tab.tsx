'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, Trash2, Pencil, X, Save, Star, Flag, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createReview, updateReview, deleteReview, upsertReviewSnapshot } from '@/lib/admin-data-actions'
import type { Review, ReviewSource } from '@/types/database'

const SOURCE_OPTIONS: { value: ReviewSource; label: string }[] = [
  { value: 'google', label: 'Google' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tripadvisor', label: 'TripAdvisor' },
  { value: 'other', label: 'Other' },
]

interface FormState {
  source: ReviewSource
  rating: string
  author_name: string
  author_avatar_url: string
  review_text: string
  review_url: string
  response_text: string
  responded_at: string
  flagged: boolean
  flag_reason: string
  posted_at: string
}

function makeBlankForm(): FormState {
  return {
    source: 'google',
    rating: '5',
    author_name: '',
    author_avatar_url: '',
    review_text: '',
    review_url: '',
    response_text: '',
    responded_at: '',
    flagged: false,
    flag_reason: '',
    posted_at: new Date().toISOString().slice(0, 10),
  }
}

function reviewToForm(r: Review): FormState {
  return {
    source: r.source,
    rating: String(r.rating),
    author_name: r.author_name ?? '',
    author_avatar_url: r.author_avatar_url ?? '',
    review_text: r.review_text ?? '',
    review_url: r.review_url ?? '',
    response_text: r.response_text ?? '',
    responded_at: r.responded_at ? r.responded_at.slice(0, 10) : '',
    flagged: r.flagged,
    flag_reason: r.flag_reason ?? '',
    posted_at: r.posted_at.slice(0, 10),
  }
}

export default function ReviewsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()

  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(makeBlankForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSnapshot, setShowSnapshot] = useState(false)
  const [snapshot, setSnapshot] = useState({ platform: 'google', rating_avg: '', review_count: '', date: new Date().toISOString().slice(0, 10) })
  const [snapshotSaving, setSnapshotSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('client_id', clientId)
      .order('posted_at', { ascending: false })

    setReviews((data ?? []) as Review[])
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  function startAdd() {
    setEditingId(null)
    setForm(makeBlankForm())
    setShowForm(true)
    setError(null)
  }

  function startEdit(r: Review) {
    setEditingId(r.id)
    setForm(reviewToForm(r))
    setShowForm(true)
    setError(null)
  }

  function cancel() {
    setShowForm(false)
    setEditingId(null)
    setError(null)
  }

  async function handleSnapshotSave() {
    if (!snapshot.rating_avg || !snapshot.review_count) return
    setSnapshotSaving(true)
    const res = await upsertReviewSnapshot({
      client_id: clientId,
      platform: snapshot.platform,
      date: snapshot.date,
      rating_avg: parseFloat(snapshot.rating_avg),
      review_count: parseInt(snapshot.review_count, 10),
    })
    setSnapshotSaving(false)
    if (res.success) {
      setShowSnapshot(false)
      setSnapshot({ platform: 'google', rating_avg: '', review_count: '', date: new Date().toISOString().slice(0, 10) })
    } else {
      setError(res.error)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    const payload = {
      client_id: clientId,
      source: form.source,
      rating: parseFloat(form.rating),
      author_name: form.author_name || null,
      author_avatar_url: form.author_avatar_url || null,
      review_text: form.review_text || null,
      review_url: form.review_url || null,
      response_text: form.response_text || null,
      responded_at: form.responded_at ? new Date(form.responded_at).toISOString() : null,
      responded_by: form.response_text ? 'admin' : null,
      flagged: form.flagged,
      flag_reason: form.flagged ? (form.flag_reason || null) : null,
      posted_at: new Date(form.posted_at).toISOString(),
    }

    const result = editingId
      ? await updateReview(editingId, payload)
      : await createReview(payload)

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
    if (!confirm('Delete this review?')) return
    const result = await deleteReview(id)
    if (result.success) await load()
    else setError(result.error)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-3">
          Reviews from Google, Yelp, and other platforms. Entered here, shown to the client on their Reviews page.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSnapshot(true)}
            className="text-sm font-medium text-ink-3 hover:text-ink border border-ink-5 rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
          >
            <Star className="w-4 h-4" />
            Log Snapshot
          </button>
          <button
            onClick={startAdd}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Review
          </button>
        </div>
      </div>

      {showSnapshot && (
        <div className="bg-white rounded-xl border border-amber-200 ring-1 ring-amber-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Log Review Snapshot</h3>
            <button onClick={() => setShowSnapshot(false)} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-ink-4">Quick-log the headline numbers from a review platform. No individual reviews needed.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">Platform</label>
              <select className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm" value={snapshot.platform} onChange={(e) => setSnapshot((s) => ({ ...s, platform: e.target.value }))}>
                {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">Avg Rating</label>
              <input type="number" step="0.1" min="1" max="5" className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm" placeholder="4.5" value={snapshot.rating_avg} onChange={(e) => setSnapshot((s) => ({ ...s, rating_avg: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">Total Reviews</label>
              <input type="number" min="0" className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm" placeholder="287" value={snapshot.review_count} onChange={(e) => setSnapshot((s) => ({ ...s, review_count: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1 block">Date</label>
              <input type="date" className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm" value={snapshot.date} onChange={(e) => setSnapshot((s) => ({ ...s, date: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleSnapshotSave} disabled={snapshotSaving || !snapshot.rating_avg || !snapshot.review_count} className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 transition-colors">
              {snapshotSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Snapshot
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-brand/30 ring-1 ring-brand/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              {editingId ? 'Edit Review' : 'Add Review'}
            </h3>
            <button onClick={cancel} className="text-ink-4 hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Source / Rating / Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Source</label>
              <select
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value as ReviewSource }))}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white"
              >
                {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Rating</label>
              <select
                value={form.rating}
                onChange={e => setForm(f => ({ ...f, rating: e.target.value }))}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white"
              >
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3">3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Posted Date</label>
              <input
                type="date"
                value={form.posted_at}
                onChange={e => setForm(f => ({ ...f, posted_at: e.target.value }))}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          {/* Author */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Author Name</label>
              <input
                type="text"
                value={form.author_name}
                onChange={e => setForm(f => ({ ...f, author_name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Review URL</label>
              <input
                type="text"
                value={form.review_url}
                onChange={e => setForm(f => ({ ...f, review_url: e.target.value }))}
                placeholder="https://..."
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Review Text</label>
            <textarea
              value={form.review_text}
              onChange={e => setForm(f => ({ ...f, review_text: e.target.value }))}
              rows={3}
              placeholder="What the customer wrote..."
              className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 resize-none"
            />
          </div>

          {/* Response */}
          <div className="border-t border-ink-6 pt-4 space-y-3">
            <h4 className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Our Response (optional)
            </h4>
            <textarea
              value={form.response_text}
              onChange={e => setForm(f => ({ ...f, response_text: e.target.value }))}
              rows={2}
              placeholder="What we replied..."
              className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 resize-none"
            />
            <div>
              <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Response Date</label>
              <input
                type="date"
                value={form.responded_at}
                onChange={e => setForm(f => ({ ...f, responded_at: e.target.value }))}
                className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          {/* Flag */}
          <div className="border-t border-ink-6 pt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.flagged}
                onChange={e => setForm(f => ({ ...f, flagged: e.target.checked }))}
                className="rounded border-ink-6"
              />
              <Flag className="w-3.5 h-3.5 text-amber-600" />
              Flag this review for follow-up
            </label>
            {form.flagged && (
              <input
                type="text"
                value={form.flag_reason}
                onChange={e => setForm(f => ({ ...f, flag_reason: e.target.value }))}
                placeholder="Why is this flagged?"
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4"
              />
            )}
          </div>

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
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Star className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No reviews yet</p>
          <p className="text-xs text-ink-4 mt-1">Click &ldquo;Add Review&rdquo; to enter the first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map(r => (
            <div key={r.id} className={`bg-white rounded-xl border p-4 ${r.flagged ? 'border-amber-300' : 'border-ink-6'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink">{r.author_name || 'Anonymous'}</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(i => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(r.rating) ? 'fill-amber-400 text-amber-400' : 'text-ink-5'}`} />
                      ))}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-bg-2 text-ink-3 capitalize">{r.source}</span>
                    {r.flagged && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1">
                        <Flag className="w-2.5 h-2.5" /> Flagged
                      </span>
                    )}
                    <span className="text-[10px] text-ink-4">
                      {new Date(r.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {r.review_text && (
                    <p className="text-xs text-ink-2 mt-2 line-clamp-2">{r.review_text}</p>
                  )}
                  {r.response_text && (
                    <div className="mt-2 pl-3 border-l-2 border-brand-tint">
                      <p className="text-[10px] text-brand-dark font-medium uppercase tracking-wide">Our response</p>
                      <p className="text-xs text-ink-2 mt-0.5 line-clamp-2">{r.response_text}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(r)} className="text-ink-4 hover:text-brand-dark transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="text-ink-4 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
