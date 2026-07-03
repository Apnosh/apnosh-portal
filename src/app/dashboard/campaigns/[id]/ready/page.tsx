'use client'

/**
 * Post-ship "A few things from you" setup page — the full-screen expansion of the amber setup card on
 * the campaign detail. It shows ONLY what THIS campaign's services actually need (derived server-side in
 * getCampaignReadiness + service-needs.ts): content inputs, shoot access, vendor/POS info, scheduling,
 * and computed actions. Needs already satisfied are shown done. Same 480 phone-column shell + amber
 * identity as the detail hero, so finishing setup here reads as one continuous part of the campaign;
 * once everything's in, the detail flips from "Needs you" to "In production". Per-field autosave.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Check, ClipboardList, Loader2 } from 'lucide-react'
import { C, DISPLAY, GRAD } from '@/components/campaigns/ui'
import { GROUP_ORDER, type ReadinessReport, type ReadinessItem } from '@/lib/campaigns/readiness-types'

// Amber = the "to-do" setup identity, shared with the detail hero's setup card. Green = done.
const AMBER_BG = '#FEF4E4'
const AMBER_FG = '#8A5A12'
const AMBER_GRAD = 'linear-gradient(135deg,#e0a13a,#b9760f)'

export default function ReadyPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [report, setReport] = useState<ReadinessReport | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [exec, setExec] = useState<Record<string, string>>({})
  const [savingField, setSavingField] = useState<string | null>(null)
  const seededRef = useRef(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/campaigns/${id}/readiness`, { cache: 'no-store' })
    if (!r.ok) { setState('error'); return }
    const j = await r.json()
    const rep = j.report as ReadinessReport | null
    if (!rep) { setState('error'); return }
    setReport(rep)
    // Seed local input state ONCE; never reseed over the owner's in-progress edits.
    if (!seededRef.current) {
      const seed: Record<string, string> = {}
      for (const it of rep.items) if (it.kind === 'input' && it.field) seed[it.field] = it.value ?? ''
      setExec(seed)
      seededRef.current = true
    }
    setState('ready')
  }, [id])
  useEffect(() => { load() }, [load])

  const saveField = useCallback(async (field: string, value: string, saveTo?: 'execution' | 'target_date') => {
    setSavingField(field)
    try {
      // go-live writes to the campaign's target_date column; everything else merges into execution jsonb.
      const body = saveTo === 'target_date' ? { fields: { target_date: value } } : { fields: { execution: { [field]: value } } }
      await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      await load()
    } finally { setSavingField(null) }
  }, [id, load])

  const back = () => router.push(`/dashboard/campaigns/${id}`)

  const shell = (children: React.ReactNode, footer?: React.ReactNode) => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', height: '100dvh' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
          <button onClick={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer', minWidth: 0 }}>
            <ChevronLeft size={18} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report?.campaignName ?? 'Campaign'}</span>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 28px' }}>{children}</div>
        {footer}
      </div>
    </div>
  )

  if (state === 'loading') return shell(<Center><Loader2 size={16} className="animate-spin" /> Loading…</Center>)
  if (state === 'error' || !report) return shell(<Center>Couldn&rsquo;t load this.</Center>)

  const actionsLeft = report.items.filter((i) => i.kind === 'action' && !i.skipped).length
  const pct = report.total > 0 ? Math.round((report.done / report.total) * 100) : 100
  const allDone = report.done >= report.total && actionsLeft === 0
  const groups = GROUP_ORDER
    .map((g) => ({ g, items: report.items.filter((i) => i.group === g) }))
    .filter((x) => x.items.length > 0)

  // Defer or restore a setup action ("Skip for now" / "Undo skip"). The full skipped-id list persists
  // to execution.setupSkipped, so a deferred connect-account step drops out of what blocks "all set".
  const skipAction = (actionId: string, skip: boolean) => {
    const current = report.items.filter((i) => i.skipped).map((i) => i.id)
    const next = skip ? Array.from(new Set([...current, actionId])) : current.filter((x) => x !== actionId)
    saveField('setupSkipped', next.join(','))
  }

  const footer = (
    <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: '#fff' }}>
      <button onClick={back} style={{ width: '100%', height: 48, borderRadius: 13, border: allDone ? 'none' : `1.5px solid ${C.line}`, cursor: 'pointer', background: allDone ? GRAD : '#fff', color: allDone ? '#fff' : C.ink, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {allDone ? <>You&rsquo;re all set. Back to your campaign <ChevronRight size={18} /></> : 'Back to your campaign'}
      </button>
      <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 8 }}>{allDone ? 'Your team can start now.' : 'Every answer saves as you go. Come back anytime.'}</div>
    </div>
  )

  return shell(
    <>
      {/* Amber setup hero — the full-screen version of the detail's "A few things from you" card. */}
      <div style={{ background: AMBER_BG, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ClipboardList size={18} color={AMBER_FG} />
          <h1 style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, color: AMBER_FG, margin: 0 }}>A few things from you</h1>
        </div>
        <p style={{ fontSize: 12.5, color: AMBER_FG, margin: '0 0 12px', lineHeight: 1.5 }}>Just what this plan needs, so it comes out great. Nothing is billed until a piece posts.</p>
        <div style={{ height: 7, borderRadius: 99, background: 'rgba(138,90,18,0.15)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: allDone ? C.green : AMBER_GRAD, transition: 'width .3s' }} />
        </div>
        <p style={{ fontSize: 11.5, color: AMBER_FG, margin: '6px 0 0', fontWeight: 600 }}>{allDone ? 'All set. Nothing else needed right now.' : `${report.done} of ${report.total} done${actionsLeft > 0 ? ` · ${actionsLeft} quick ${actionsLeft > 1 ? 'actions' : 'action'} left` : ''}`}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map(({ g, items }) => (
          <section key={g}>
            <SectionLabel>{g}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it) => it.kind === 'input' ? (
                <InputCard key={it.id} item={it} value={exec[it.field as string] ?? ''} saving={savingField === it.field}
                  onChange={(v) => setExec((e) => ({ ...e, [it.field as string]: v }))}
                  onSave={(v) => saveField(it.field as string, v, it.saveTo)} />
              ) : (
                <ActionCard key={it.id} item={it} onSkipToggle={() => skipAction(it.id, !it.skipped)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>,
    footer,
  )
}

function InputCard({ item, value, saving, onChange, onSave }: { item: ReadinessItem; value: string; saving: boolean; onChange: (v: string) => void; onSave: (v: string) => void }) {
  const filled = value.trim().length > 0
  const field = { width: '100%', border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 11px', fontSize: 13.5, color: C.ink, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }
  const todayISO = new Date().toISOString().slice(0, 10)
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
        <span style={{ width: 16, height: 16, borderRadius: 99, display: 'inline-grid', placeItems: 'center', background: filled ? C.green : 'transparent', border: filled ? 'none' : `1.5px solid ${C.faint}` }}>{filled && <Check size={11} color="#fff" strokeWidth={3} />}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{item.title}</span>
        {item.optional && <span style={{ fontSize: 10.5, color: C.faint }}>optional</span>}
        {saving && <span style={{ fontSize: 10.5, color: C.faint, marginLeft: 'auto' }}>saving…</span>}
      </div>
      <div style={{ fontSize: 12, color: C.mute, marginBottom: 8, lineHeight: 1.4 }}>{item.why}</div>
      {item.inputType === 'select' ? (
        <div style={{ display: 'flex', gap: 7 }}>
          {(item.options ?? []).map((opt) => {
            const on = value === opt
            return <button key={opt} onClick={() => { onChange(opt); onSave(opt) }} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1px solid ${on ? C.greenDk : C.line}`, background: on ? C.greenSoft : '#fff', color: on ? C.greenDk : C.mute, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>{opt}</button>
          })}
        </div>
      ) : item.inputType === 'date' ? (
        <input type="date" value={value} min={todayISO} onChange={(e) => onChange(e.target.value)} onBlur={(e) => { if (e.target.value !== (item.value ?? '')) onSave(e.target.value) }} style={field} />
      ) : item.inputType === 'textarea' ? (
        <textarea value={value} placeholder={item.placeholder} onChange={(e) => onChange(e.target.value)} onBlur={(e) => { if (e.target.value !== (item.value ?? '')) onSave(e.target.value) }} rows={2} style={field} />
      ) : (
        <input value={value} placeholder={item.placeholder} onChange={(e) => onChange(e.target.value)} onBlur={(e) => { if (e.target.value !== (item.value ?? '')) onSave(e.target.value) }} style={field} />
      )}
    </div>
  )
}

function ActionCard({ item, onSkipToggle }: { item: ReadinessItem; onSkipToggle: () => void }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, opacity: item.skipped ? 0.72 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{item.title}</div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>{item.skipped ? 'Skipped for now. Your team can still start, and you can do this anytime.' : item.why}</div>
        </div>
        {item.skipped
          ? <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: C.faint }}>Skipped</span>
          : <a href={item.href} style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff', background: C.ink, borderRadius: 10, padding: '8px 14px', textDecoration: 'none' }}>{item.actionLabel}</a>}
      </div>
      {item.skippable && (
        <button onClick={onSkipToggle} style={{ marginTop: 10, background: 'none', border: 'none', color: C.mute, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>{item.skipped ? 'Undo skip' : 'Skip for now'}</button>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, margin: '2px 2px 8px' }}>{children}</div>
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 14 }}>{children}</div>
}
