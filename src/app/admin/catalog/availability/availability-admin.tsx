'use client'
/**
 * AvailabilityAdmin — the Availability tab editor. The admin publishes the team's real shoot calendar:
 * weekly open windows, how long a slot is, how many can run at once (capacity), a lead-time runway,
 * how far ahead to offer, and blackout dates. A LIVE preview shows the exact slots a client will see —
 * computed by the SAME pure engine (computeOpenSlots) the checkout picker uses, so there is never a
 * gap between what the admin publishes and what a client can book.
 *
 * Honesty by construction: the preview never invents a slot; an inactive/empty calendar shows nothing
 * and the client falls back to honest request-mode.
 */
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { computeOpenSlots } from '@/lib/campaigns/gates/availability'
import type { AvailabilityRule, Window } from '@/lib/campaigns/gates/types'

const WEEKDAYS: Array<{ key: string; label: string }> = [
  { key: '1', label: 'Mon' }, { key: '2', label: 'Tue' }, { key: '3', label: 'Wed' },
  { key: '4', label: 'Thu' }, { key: '5', label: 'Fri' }, { key: '6', label: 'Sat' }, { key: '0', label: 'Sun' },
]

const TZ_OPTIONS = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York']

interface Form {
  id: string | null
  gateKind: string
  label: string
  timezone: string
  weekly: Record<string, Window[]>
  exceptions: Record<string, Window[]>
  slotMinutes: number
  capacity: number
  leadTimeDays: number
  horizonDays: number
  active: boolean
}

function blankForm(): Form {
  return { id: null, gateKind: 'shoot', label: '', timezone: 'America/Los_Angeles', weekly: {}, exceptions: {}, slotMinutes: 120, capacity: 1, leadTimeDays: 3, horizonDays: 45, active: false }
}

function formFromRule(r: AvailabilityRule): Form {
  return { id: r.id, gateKind: r.gateKind, label: r.label ?? '', timezone: r.timezone, weekly: r.weekly ?? {}, exceptions: r.exceptions ?? {}, slotMinutes: r.slotMinutes, capacity: r.capacity, leadTimeDays: r.leadTimeDays, horizonDays: r.horizonDays, active: r.active }
}

/** Build the pure-engine rule from the current form so the preview matches production exactly. */
function ruleFromForm(f: Form): AvailabilityRule {
  return { id: f.id ?? 'preview', gateKind: f.gateKind, scopeKind: 'team', scopeId: null, label: f.label || null, timezone: f.timezone, weekly: f.weekly, exceptions: f.exceptions, slotMinutes: f.slotMinutes, capacity: f.capacity, leadTimeDays: f.leadTimeDays, horizonDays: f.horizonDays, active: true }
}

const HHMM = /^(\d{1,2}):(\d{2})$/
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const fmtTime = (hhmm: string) => {
  const m = HHMM.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}

export function AvailabilityAdmin({ initialRules }: { initialRules: AvailabilityRule[] }) {
  const [rules, setRules] = useState<AvailabilityRule[]>(initialRules)
  const [form, setForm] = useState<Form>(initialRules[0] ? formFromRule(initialRules[0]) : blankForm())
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [newBlackout, setNewBlackout] = useState('')

  const preview = useMemo(() => computeOpenSlots(ruleFromForm(form), [], new Date().toISOString(), 40), [form])
  const previewByDay = useMemo(() => {
    const m = new Map<string, typeof preview>()
    for (const s of preview) { const a = m.get(s.date) ?? []; a.push(s); m.set(s.date, a) }
    return [...m.entries()]
  }, [preview])

  const flash = (text: string, bad?: boolean) => { setMsg({ text, bad }); setTimeout(() => setMsg(null), 4000) }

  function setWeekly(dayKey: string, wins: Window[]) {
    setForm((f) => ({ ...f, weekly: { ...f.weekly, [dayKey]: wins } }))
  }
  function addWindow(dayKey: string) {
    setWeekly(dayKey, [...(form.weekly[dayKey] ?? []), { start: '09:00', end: '12:00' }])
  }
  function editWindow(dayKey: string, i: number, patch: Partial<Window>) {
    const wins = [...(form.weekly[dayKey] ?? [])]; wins[i] = { ...wins[i], ...patch }; setWeekly(dayKey, wins)
  }
  function removeWindow(dayKey: string, i: number) {
    setWeekly(dayKey, (form.weekly[dayKey] ?? []).filter((_, j) => j !== i))
  }
  function addBlackout() {
    const d = newBlackout.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return flash('Pick a valid date to close.', true)
    setForm((f) => ({ ...f, exceptions: { ...f.exceptions, [d]: [] } })); setNewBlackout('')
  }
  function removeBlackout(d: string) {
    setForm((f) => { const ex = { ...f.exceptions }; delete ex[d]; return { ...f, exceptions: ex } })
  }

  function save(overrides?: Partial<Form>) {
    const body = { ...form, ...overrides }
    start(async () => {
      const url = body.id ? `/api/admin/availability/${body.id}` : '/api/admin/availability'
      const method = body.id ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
      const j = res ? await res.json().catch(() => ({})) : {}
      if (!res || !res.ok) return flash(j.error || 'Save failed', true)
      const saved = j.rule as Record<string, unknown>
      // Re-fetch the canonical list so ids + coercion match the server.
      const listRes = await fetch('/api/admin/availability').then((r) => r.json()).catch(() => ({ rules: [] }))
      const list = (listRes.rules ?? []) as AvailabilityRule[]
      setRules(list)
      const savedId = (saved?.id as string) || body.id
      const match = list.find((r) => r.id === savedId)
      if (match) setForm(formFromRule(match))
      flash(body.active ? 'Saved — calendar is live' : 'Saved')
    })
  }

  function toggleActive() {
    if (!form.id) return flash('Save the calendar first, then turn it on.', true)
    save({ active: !form.active })
  }

  function del() {
    if (!form.id) { setForm(blankForm()); return }
    if (!window.confirm('Delete this calendar? Confirmed bookings keep their times; new picks stop.')) return
    start(async () => {
      const res = await fetch(`/api/admin/availability/${form.id}`, { method: 'DELETE' }).catch(() => null)
      if (!res || !res.ok) return flash('Delete failed', true)
      const list = rules.filter((r) => r.id !== form.id)
      setRules(list); setForm(list[0] ? formFromRule(list[0]) : blankForm()); flash('Deleted')
    })
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-24 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">Catalog</h1>
          <p className="text-[13px] text-ink-3 mt-1">Publish the team&apos;s real shoot calendar. Clients can only pick slots that actually exist, so a shoot date is firm at checkout.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-bg-2 p-1 mr-1">
            <Link href="/admin/catalog" className="text-[12.5px] font-medium rounded-md px-3 py-1.5 text-ink-3 hover:text-ink">Services</Link>
            <Link href="/admin/catalog/campaigns" className="text-[12.5px] font-medium rounded-md px-3 py-1.5 text-ink-3 hover:text-ink">Campaigns</Link>
            <span className="text-[12.5px] font-semibold rounded-md px-3 py-1.5 bg-white text-ink shadow-sm">Availability</span>
          </div>
        </div>
      </div>

      {msg && <div className={'text-[13px] rounded-lg px-3 py-2 ' + (msg.bad ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{msg.text}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-5">
        {/* ── rule list ── */}
        <div className="rounded-xl border border-ink-6 overflow-hidden h-max">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-ink-6 bg-bg-2/40">
            <span className="text-[12px] font-semibold text-ink-3 uppercase tracking-wide">Calendars</span>
            <button onClick={() => setForm(blankForm())} className="text-[12.5px] font-semibold text-brand">＋ New</button>
          </div>
          {rules.length === 0 && <div className="px-3 py-4 text-[12.5px] text-ink-3">No calendar yet. Create one to start.</div>}
          {rules.map((r) => (
            <button key={r.id} onClick={() => setForm(formFromRule(r))} className={'w-full text-left px-3 py-2.5 border-b border-ink-6 last:border-0 hover:bg-bg-2/50 ' + (form.id === r.id ? 'bg-bg-2/60' : '')}>
              <div className="flex items-center gap-2">
                <span className={'w-2 h-2 rounded-full shrink-0 ' + (r.active ? 'bg-emerald-500' : 'bg-ink-6')} />
                <span className="text-[13px] font-medium text-ink">{r.label || `${r.gateKind} calendar`}</span>
              </div>
              <div className="text-[11.5px] text-ink-3 mt-0.5 ml-4">{r.active ? 'Live' : 'Draft'} · {r.gateKind} · cap {r.capacity}</div>
            </button>
          ))}
        </div>

        {/* ── editor ── */}
        <div className="rounded-xl border border-ink-6 p-4 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={'text-[12px] font-semibold rounded-full px-2.5 py-1 ' + (form.active ? 'bg-emerald-100 text-emerald-700' : 'bg-bg-2 text-ink-3')}>{form.active ? 'Live' : 'Draft'}</span>
              <span className="text-[13px] text-ink-3">Gate: {form.gateKind}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleActive} disabled={pending} className={'text-[12.5px] font-semibold rounded-lg px-3 py-1.5 border ' + (form.active ? 'border-ink-6 text-ink-3 bg-white' : 'border-emerald-600 bg-emerald-600 text-white')}>{form.active ? 'Turn off' : 'Turn on'}</button>
              <button onClick={() => save()} disabled={pending} className="text-[12.5px] font-semibold rounded-lg px-3.5 py-1.5 bg-ink text-white disabled:opacity-50">{pending ? 'Saving…' : (form.id ? 'Save' : 'Create')}</button>
              {form.id && <button onClick={del} disabled={pending} className="text-[12.5px] font-medium rounded-lg px-2.5 py-1.5 text-red-600">Delete</button>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-medium text-ink-3">Name (internal)</span>
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="On-site shoots" className="mt-1 w-full text-[13px] rounded-lg border border-ink-6 px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-ink-3">Time zone</span>
              <select value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} className="mt-1 w-full text-[13px] rounded-lg border border-ink-6 px-3 py-2 bg-white">
                {TZ_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          {/* weekly windows */}
          <div>
            <div className="text-[12px] font-semibold text-ink-3 uppercase tracking-wide mb-2">Open windows</div>
            <div className="space-y-2">
              {WEEKDAYS.map(({ key, label }) => (
                <div key={key} className="flex items-start gap-3">
                  <div className="w-10 text-[13px] font-medium text-ink pt-2">{label}</div>
                  <div className="flex-1 space-y-1.5">
                    {(form.weekly[key] ?? []).length === 0 && <div className="text-[12.5px] text-ink-3 py-1.5">Closed</div>}
                    {(form.weekly[key] ?? []).map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="time" value={w.start} onChange={(e) => editWindow(key, i, { start: e.target.value })} className="text-[13px] rounded-lg border border-ink-6 px-2 py-1.5" />
                        <span className="text-ink-3">–</span>
                        <input type="time" value={w.end} onChange={(e) => editWindow(key, i, { end: e.target.value })} className="text-[13px] rounded-lg border border-ink-6 px-2 py-1.5" />
                        <button onClick={() => removeWindow(key, i)} className="text-[12px] text-red-600 px-1">Remove</button>
                      </div>
                    ))}
                    <button onClick={() => addWindow(key)} className="text-[12.5px] font-medium text-brand">＋ Add window</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* dials */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-[12px] font-medium text-ink-3">Slot length (min)</span>
              <input type="number" min={15} step={15} value={form.slotMinutes} onChange={(e) => setForm((f) => ({ ...f, slotMinutes: Number(e.target.value) }))} className="mt-1 w-full text-[13px] rounded-lg border border-ink-6 px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-ink-3">Capacity / slot</span>
              <input type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} className="mt-1 w-full text-[13px] rounded-lg border border-ink-6 px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-ink-3">Lead time (biz days)</span>
              <input type="number" min={0} value={form.leadTimeDays} onChange={(e) => setForm((f) => ({ ...f, leadTimeDays: Number(e.target.value) }))} className="mt-1 w-full text-[13px] rounded-lg border border-ink-6 px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-ink-3">Offer ahead (days)</span>
              <input type="number" min={1} value={form.horizonDays} onChange={(e) => setForm((f) => ({ ...f, horizonDays: Number(e.target.value) }))} className="mt-1 w-full text-[13px] rounded-lg border border-ink-6 px-3 py-2" />
            </label>
          </div>

          {/* blackout dates */}
          <div>
            <div className="text-[12px] font-semibold text-ink-3 uppercase tracking-wide mb-2">Blackout dates (closed)</div>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.keys(form.exceptions).filter((d) => (form.exceptions[d] ?? []).length === 0).sort().map((d) => (
                <span key={d} className="inline-flex items-center gap-1.5 text-[12.5px] rounded-full bg-bg-2 px-2.5 py-1">
                  {fmtDay(d)} <button onClick={() => removeBlackout(d)} className="text-ink-3 hover:text-red-600">✕</button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input type="date" value={newBlackout} onChange={(e) => setNewBlackout(e.target.value)} className="text-[13px] rounded-lg border border-ink-6 px-3 py-1.5" />
              <button onClick={addBlackout} className="text-[12.5px] font-medium text-brand">＋ Close this day</button>
            </div>
          </div>
        </div>

        {/* ── live preview ── */}
        <div className="rounded-xl border border-ink-6 p-4 h-max">
          <div className="text-[12px] font-semibold text-ink-3 uppercase tracking-wide">What a client sees</div>
          <p className="text-[11.5px] text-ink-3 mt-1">The exact open slots, live. Bookings fill them; blackouts + lead time already applied.</p>
          <div className="mt-3 space-y-3 max-h-[520px] overflow-y-auto">
            {previewByDay.length === 0 && <div className="text-[12.5px] text-ink-3">No open slots yet — add windows, or the lead time/blackouts close everything in range.</div>}
            {previewByDay.map(([day, slots]) => (
              <div key={day}>
                <div className="text-[12.5px] font-semibold text-ink">{fmtDay(day)}</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {slots.map((s, i) => (
                    <span key={i} className="text-[12px] rounded-lg border border-ink-6 px-2 py-1 text-ink-3">
                      {fmtTime(s.start)}{s.remaining > 1 ? <span className="text-ink-4"> ·{s.remaining}</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-ink-4 mt-3">Times shown in {form.timezone}.</div>
        </div>
      </div>
    </div>
  )
}
