'use client'
/**
 * CampaignsContentAdmin — the campaign content CMS (Phase C1). The list shows all
 * store campaigns from the in-code CAMPAIGN_CONTENT record with an "edited" badge
 * where a DB override row exists. Clicking one opens the edit form: every content
 * field, a hero image upload, per-field reset (empty = code default), a whole-
 * campaign reset, and a "Draft with AI" button that fills suggestions the admin
 * still reviews and saves. Saves go through /api/admin/catalog-content/:id.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CAMPAIGN_CONTENT, type CampaignContent } from '@/lib/campaigns/data/campaign-content'
import { contentFor, type ContentOverride, type ContentOverrideMap } from '@/lib/campaigns/data/content-overrides'

type Faq = { q: string; a: string }
type FormState = {
  title: string; tagline: string; description: string; promise: string; why: string;
  expectation: string; heroImage: string; bestFor: string; faq: Faq[]
}

const FIELDS: { key: keyof Omit<FormState, 'faq' | 'heroImage'>; label: string; hint: string; rows?: number }[] = [
  { key: 'title', label: 'Title', hint: 'The card and product page title.' },
  { key: 'tagline', label: 'Tagline', hint: 'The one-line card subtitle.' },
  { key: 'promise', label: 'Promise', hint: 'The one-line headline under the title.' },
  { key: 'description', label: 'Description', hint: 'What this campaign is and does, 1-2 plain sentences.', rows: 3 },
  { key: 'why', label: 'Why it matters', hint: 'Why this matters for a local restaurant owner. No numbers.', rows: 3 },
  { key: 'expectation', label: 'Expectation', hint: 'One small, honest sentence about how results tend to land.', rows: 2 },
  { key: 'bestFor', label: 'Best for', hint: 'Optional: who this fits.' },
]

function formFromOverride(o: ContentOverride | undefined): FormState {
  return {
    title: o?.title ?? '', tagline: o?.tagline ?? '', description: o?.description ?? '',
    promise: o?.promise ?? '', why: o?.why ?? '', expectation: o?.expectation ?? '',
    heroImage: o?.heroImage ?? '', bestFor: o?.bestFor ?? '',
    faq: (o?.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
  }
}

export function CampaignsContentAdmin({ initialOverrides }: { initialOverrides: ContentOverrideMap }) {
  const [overrides, setOverrides] = useState<ContentOverrideMap>(initialOverrides)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)

  const ids = useMemo(() => Object.keys(CAMPAIGN_CONTENT), [])
  const flash = (msg: string, bad = false) => { setToast({ msg, bad }); setTimeout(() => setToast(null), 3600) }

  const open = (id: string) => { setEditId(id); setForm(formFromOverride(overrides[id])) }
  const close = () => { setEditId(null); setForm(null) }
  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))

  async function save() {
    if (!editId || !form) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/catalog-content/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { flash(j?.error || 'Save failed', true); return }
      setOverrides((m) => {
        const next = { ...m }
        const o = (j?.override ?? {}) as ContentOverride
        if (Object.keys(o).length) next[editId] = o; else delete next[editId]
        return next
      })
      flash('Saved. The store picks this up within about 30 minutes.')
      close()
    } finally { setBusy(false) }
  }

  async function resetAll() {
    if (!editId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/catalog-content/${editId}`, { method: 'DELETE' })
      const j = await res.json().catch(() => null)
      if (!res.ok) { flash(j?.error || 'Reset failed', true); return }
      setOverrides((m) => { const next = { ...m }; delete next[editId]; return next })
      flash('Back to the code defaults.')
      close()
    } finally { setBusy(false) }
  }

  async function draftWithAi() {
    if (!editId) return
    setDrafting(true)
    try {
      const res = await fetch('/api/admin/catalog-content/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: editId }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.draft) { flash(j?.error || 'Could not write a draft right now.', true); return }
      set({ description: j.draft.description, why: j.draft.why, expectation: j.draft.expectation })
      flash('Draft filled in. Review it, edit it, then save.')
    } finally { setDrafting(false) }
  }

  async function uploadHero(file: File) {
    if (!editId) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/admin/catalog-content/upload?itemId=${editId}`, { method: 'POST', body: fd })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.url) { flash(j?.error || 'Upload failed', true); return }
      set({ heroImage: j.url as string })
      flash('Image uploaded. Save to put it on the page.')
    } finally { setUploading(false) }
  }

  const base: CampaignContent | null = editId ? CAMPAIGN_CONTENT[editId as keyof typeof CAMPAIGN_CONTENT] ?? null : null

  return (
    <div className="max-w-[980px] mx-auto px-4 lg:px-6 pt-6 pb-24 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">Campaign content</h1>
          <p className="text-[13px] text-ink-3 mt-1">
            {ids.length} campaigns. Edit the words and photo a campaign sells with. Empty fields keep the code default.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-bg-2 p-1">
          <Link href="/admin/catalog" className="text-[12.5px] font-medium rounded-md px-3 py-1.5 text-ink-3 hover:text-ink">Services</Link>
          <span className="text-[12.5px] font-semibold rounded-md px-3 py-1.5 bg-white text-ink shadow-sm">Campaigns</span>
        </div>
      </div>

      {!editId && (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          {ids.map((id) => {
            const merged = contentFor(id, overrides)!
            const edited = !!overrides[id] && Object.keys(overrides[id]).length > 0
            return (
              <button key={id} onClick={() => open(id)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                {merged.heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={merged.heroImage} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-bg-2 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium text-ink truncate">{merged.title}</div>
                  <div className="text-[11px] text-ink-4 truncate"><span className="font-mono">{id}</span> · {merged.tagline}</div>
                </div>
                {edited && <span className="text-[10px] font-bold uppercase tracking-wide text-brand-dark bg-brand/10 rounded px-1.5 py-0.5 shrink-0">Edited</span>}
              </button>
            )
          })}
        </div>
      )}

      {editId && form && base && (
        <div className="bg-white rounded-xl border border-ink-6 p-4 lg:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <button onClick={close} className="text-[12px] font-medium text-ink-3 hover:text-ink">&larr; All campaigns</button>
              <h2 className="text-[19px] font-semibold text-ink mt-1">{base.title}</h2>
              <p className="text-[12px] text-ink-4 font-mono">{editId}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={draftWithAi} disabled={drafting || busy} className="text-[12.5px] font-semibold rounded-lg px-3 py-2 bg-bg-2 text-ink hover:bg-ink-7">
                {drafting ? 'Writing…' : 'Draft with AI'}
              </button>
              <button onClick={resetAll} disabled={busy} className="text-[12.5px] font-medium rounded-lg px-3 py-2 text-red-700 hover:bg-red-50">
                Reset campaign
              </button>
              <button onClick={save} disabled={busy} className="text-[13px] font-semibold rounded-lg px-4 py-2 bg-brand text-white">
                {busy ? 'Working…' : 'Save'}
              </button>
            </div>
          </div>
          <p className="text-[12px] text-ink-3 -mt-2">
            The gray ghost text is the code default. Leave a field empty to keep it. Clear a field to go back to it.
          </p>

          {/* Hero image */}
          <div>
            <div className="text-[12px] font-semibold text-ink mb-1.5">Hero image</div>
            <div className="flex items-center gap-3">
              {form.heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.heroImage} alt="Hero" className="w-24 h-24 rounded-2xl object-cover border border-ink-6" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-bg-2 border border-ink-6 flex items-center justify-center text-[11px] text-ink-4 text-center px-2">
                  {base.heroImage ? 'Code default photo' : 'No photo (drawn art shows)'}
                </div>
              )}
              <div className="space-y-1.5">
                <label className={'inline-block text-[12.5px] font-semibold rounded-lg px-3 py-2 cursor-pointer ' + (uploading ? 'bg-bg-2 text-ink-3' : 'bg-bg-2 text-ink hover:bg-ink-7')}>
                  {uploading ? 'Uploading…' : 'Upload photo'}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadHero(f); e.target.value = '' }} />
                </label>
                {form.heroImage && (
                  <button onClick={() => set({ heroImage: '' })} className="block text-[12px] text-ink-3 hover:text-ink">Use default</button>
                )}
                <p className="text-[11px] text-ink-4">JPG, PNG or WebP, up to 8MB.</p>
              </div>
            </div>
          </div>

          {/* Text fields */}
          {FIELDS.map(({ key, label, hint, rows }) => {
            const defaultVal = (base[key] ?? '') as string
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-semibold text-ink">{label}</label>
                  {form[key] !== '' && (
                    <button onClick={() => set({ [key]: '' } as Partial<FormState>)} className="text-[11px] text-ink-3 hover:text-ink">Use default</button>
                  )}
                </div>
                {rows ? (
                  <textarea rows={rows} value={form[key]} placeholder={defaultVal || hint}
                    onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)}
                    className="w-full text-[13.5px] text-ink rounded-lg border border-ink-6 bg-white px-3 py-2 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
                ) : (
                  <input type="text" value={form[key]} placeholder={defaultVal || hint}
                    onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)}
                    className="w-full text-[13.5px] text-ink rounded-lg border border-ink-6 bg-white px-3 py-2 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
                )}
                <p className="text-[11px] text-ink-4 mt-1">{hint}</p>
              </div>
            )
          })}

          {/* FAQ */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] font-semibold text-ink">FAQ</label>
              <button onClick={() => set({ faq: [...form.faq, { q: '', a: '' }] })} className="text-[11px] font-medium text-brand-dark hover:underline">Add a question</button>
            </div>
            {form.faq.length === 0 && (
              <p className="text-[12px] text-ink-4">
                {base.faq?.length ? `Using the ${base.faq.length} code-default question${base.faq.length === 1 ? '' : 's'}.` : 'No questions yet.'}
              </p>
            )}
            <div className="space-y-2">
              {form.faq.map((f, i) => (
                <div key={i} className="rounded-lg border border-ink-6 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input type="text" value={f.q} placeholder="Question"
                      onChange={(e) => set({ faq: form.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })}
                      className="flex-1 text-[13px] text-ink rounded-md border border-ink-6 px-2.5 py-1.5 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
                    <button onClick={() => set({ faq: form.faq.filter((_, j) => j !== i) })} className="text-[11px] text-red-700 hover:underline shrink-0">Remove</button>
                  </div>
                  <textarea rows={2} value={f.a} placeholder="Answer"
                    onChange={(e) => set({ faq: form.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
                    className="w-full text-[13px] text-ink rounded-md border border-ink-6 px-2.5 py-1.5 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-[13px] font-medium rounded-lg px-4 py-2.5 shadow-lg ' + (toast.bad ? 'bg-red-600 text-white' : 'bg-ink text-white')}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
