'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Check, Plus, Trash2, Eye, EyeOff } from 'lucide-react'

export interface ThemeRow {
  month: string
  themeName: string
  themeBlurb: string
  pillars: string[]
  keyDates: Array<{ date: string; label: string; note?: string }>
  status: 'planning' | 'shared' | 'archived'
  strategistNotes: string
}

export default function ThemesEditor({
  clientId, initialThemes,
}: {
  clientId: string
  initialThemes: ThemeRow[]
}) {
  const [themes, setThemes] = useState<ThemeRow[]>(initialThemes)

  function updateTheme(idx: number, patch: Partial<ThemeRow>) {
    setThemes(p => p.map((t, i) => i === idx ? { ...t, ...patch } : t))
  }

  return (
    <div className="space-y-8">
      {themes.map((t, i) => (
        <MonthCard
          key={t.month}
          clientId={clientId}
          theme={t}
          onChange={patch => updateTheme(i, patch)}
        />
      ))}
    </div>
  )
}

function MonthCard({
  clientId, theme, onChange,
}: {
  clientId: string
  theme: ThemeRow
  onChange: (patch: Partial<ThemeRow>) => void
}) {
  const router = useRouter()
  const [pillarInput, setPillarInput] = useState('')
  const [keyDateInput, setKeyDateInput] = useState({ date: '', label: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monthLabel = new Date(theme.month + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })

  function addPillar() {
    if (!pillarInput.trim()) return
    onChange({ pillars: [...theme.pillars, pillarInput.trim()] })
    setPillarInput('')
  }
  function removePillar(idx: number) {
    onChange({ pillars: theme.pillars.filter((_, i) => i !== idx) })
  }
  function addKeyDate() {
    if (!keyDateInput.date || !keyDateInput.label.trim()) return
    onChange({
      keyDates: [...theme.keyDates, {
        date: keyDateInput.date,
        label: keyDateInput.label.trim(),
        ...(keyDateInput.note.trim() ? { note: keyDateInput.note.trim() } : {}),
      }],
    })
    setKeyDateInput({ date: '', label: '', note: '' })
  }
  function removeKeyDate(idx: number) {
    onChange({ keyDates: theme.keyDates.filter((_, i) => i !== idx) })
  }

  async function save(asShared?: boolean) {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const payload = {
        clientId,
        month: theme.month,
        themeName: theme.themeName.trim(),
        themeBlurb: theme.themeBlurb.trim() || null,
        pillars: theme.pillars,
        keyDates: theme.keyDates,
        status: asShared ? 'shared' : theme.status,
        strategistNotes: theme.strategistNotes.trim() || null,
      }
      const res = await fetch('/api/admin/editorial-themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.text()) || `Server returned ${res.status}`)
      if (asShared) onChange({ status: 'shared' })
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const isShared = theme.status === 'shared'

  return (
    <div
      className="rounded-2xl border bg-white p-5 sm:p-6"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-[20px] font-bold text-ink tracking-tight">{monthLabel}</h2>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
          isShared ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {isShared ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
          {isShared ? 'Shared with client' : 'Planning (hidden)'}
        </span>
      </div>

      <div className="space-y-4">
        <Field label="Theme name">
          <input
            type="text"
            value={theme.themeName}
            onChange={(e) => onChange({ themeName: e.target.value })}
            placeholder="e.g. National Burger Month — turning the kimchi burger into a star"
            className="w-full rounded-xl border bg-white px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          />
        </Field>

        <Field label="Theme blurb" hint="Pitch the story to the client. They see this.">
          <textarea
            value={theme.themeBlurb}
            onChange={(e) => onChange({ themeBlurb: e.target.value })}
            rows={3}
            placeholder="May is National Burger Month and our newest signature is a clear hero..."
            className="w-full rounded-xl border bg-white px-4 py-2.5 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 resize-none"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          />
        </Field>

        <Field label="Content pillars" hint="3-5 tags. The lenses the month's content is built around.">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {theme.pillars.map((p, i) => (
              <span
                key={`${p}-${i}`}
                className="inline-flex items-center gap-1.5 text-[12px] bg-bg-2 text-ink-2 rounded-full pl-3 pr-1.5 py-1"
              >
                {p}
                <button
                  type="button"
                  onClick={() => removePillar(i)}
                  className="text-ink-4 hover:text-rose-700"
                  aria-label={`Remove ${p}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={pillarInput}
              onChange={(e) => setPillarInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPillar() } }}
              placeholder="e.g. hero dish, team, kitchen story"
              className="flex-1 rounded-xl border bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            />
            <button
              type="button"
              onClick={addPillar}
              className="inline-flex items-center gap-1 text-[12px] font-semibold bg-ink hover:bg-ink/90 text-white rounded-full px-3 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
        </Field>

        <Field label="Key dates" hint="Holidays, events, anything the month is built around.">
          {theme.keyDates.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {theme.keyDates.map((d, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg border bg-bg-2/40 px-3 py-2" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
                  <span className="text-[11px] text-ink-3 font-mono tabular-nums w-24">{d.date}</span>
                  <span className="text-[13px] font-medium text-ink flex-1 min-w-0 truncate">{d.label}</span>
                  {d.note && <span className="text-[11px] text-ink-3 italic max-w-[200px] truncate">{d.note}</span>}
                  <button
                    type="button"
                    onClick={() => removeKeyDate(i)}
                    className="text-ink-4 hover:text-rose-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-12 gap-2">
            <input
              type="date"
              value={keyDateInput.date}
              onChange={(e) => setKeyDateInput({ ...keyDateInput, date: e.target.value })}
              className="col-span-4 rounded-xl border bg-white px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            />
            <input
              type="text"
              value={keyDateInput.label}
              onChange={(e) => setKeyDateInput({ ...keyDateInput, label: e.target.value })}
              placeholder="Label (e.g. Mother's Day)"
              className="col-span-5 rounded-xl border bg-white px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            />
            <input
              type="text"
              value={keyDateInput.note}
              onChange={(e) => setKeyDateInput({ ...keyDateInput, note: e.target.value })}
              placeholder="Note"
              className="col-span-2 rounded-xl border bg-white px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            />
            <button
              type="button"
              onClick={addKeyDate}
              className="col-span-1 inline-flex items-center justify-center text-[12px] font-semibold bg-ink hover:bg-ink/90 text-white rounded-full px-2 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </Field>

        <Field label="Strategist notes (private)" hint="Only you see this. Not shared with the client.">
          <textarea
            value={theme.strategistNotes}
            onChange={(e) => onChange({ strategistNotes: e.target.value })}
            rows={2}
            placeholder="Owner wants to push the new patty hard; lean reels over carousel."
            className="w-full rounded-xl border bg-bg-2/40 px-4 py-2.5 text-[12px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 resize-none"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          />
        </Field>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-[12px] text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() => save(false)}
            disabled={saving || !theme.themeName.trim()}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-white border border-ink-6 hover:border-ink-4 text-ink rounded-full px-4 py-2 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3 text-emerald-600" /> : <Save className="w-3 h-3" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save draft'}
          </button>
          {!isShared && (
            <button
              onClick={() => save(true)}
              disabled={saving || !theme.themeName.trim()}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-4 py-2 transition-colors disabled:opacity-50"
            >
              <Eye className="w-3 h-3" />
              Share with client
            </button>
          )}
          {isShared && (
            <p className="text-[11px] text-ink-4 ml-2">
              Client sees this on their /dashboard/social/plan page.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <label className="text-[12px] font-semibold text-ink">{label}</label>
        {hint && <p className="text-[11px] text-ink-4 text-right max-w-md">{hint}</p>}
      </div>
      {children}
    </div>
  )
}
