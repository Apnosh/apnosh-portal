'use client'

/**
 * Post-ship "Get it ready" screen. The owner lands here after Approve & ship:
 * a focused checklist of what's left for the campaign to execute — inputs that
 * persist on the campaign and feed the creator brief, plus computed action items.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Check } from 'lucide-react'
import { C } from '@/components/campaigns/ui'
import type { ReadinessReport, ReadinessItem } from '@/lib/campaigns/readiness'

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
    // Seed the local input state ONCE; never reseed over the owner's in-progress
    // edits (a save reloads the report but the inputs stay locally authoritative).
    if (!seededRef.current) {
      const seed: Record<string, string> = {}
      for (const it of rep.items) if (it.kind === 'input' && it.field) seed[it.field] = it.value ?? ''
      setExec(seed)
      seededRef.current = true
    }
    setState('ready')
  }, [id])
  useEffect(() => { load() }, [load])

  const saveField = useCallback(async (field: string, value: string) => {
    setSavingField(field)
    try {
      // Send ONLY the changed key — the server merges it into the stored jsonb,
      // so a save never clobbers fields it didn't load.
      await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { execution: { [field]: value } } }) })
      await load() // refresh done/progress (does not reseed inputs)
    } finally { setSavingField(null) }
  }, [id, load])

  if (state === 'loading') return <Center>Loading…</Center>
  if (state === 'error' || !report) return <Center>Couldn’t load this.</Center>

  const inputs = report.items.filter((i) => i.kind === 'input')
  const actions = report.items.filter((i) => i.kind === 'action')
  const pct = report.total > 0 ? Math.round((report.done / report.total) * 100) : 100
  const allDone = report.done >= report.total && actions.length === 0

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 40 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${C.line}`, padding: '12px 16px' }}>
        <button onClick={() => router.push(`/dashboard/campaigns/${id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: C.mute, fontSize: 13, cursor: 'pointer', padding: 0 }}><ChevronLeft size={15} /> Campaign</button>
        <h1 style={{ marginTop: 4, fontSize: 19, fontWeight: 800, color: C.ink }}>Get it ready</h1>
        <p style={{ marginTop: 2, fontSize: 12.5, color: C.mute }}>A few things from you so this comes out great.</p>
        <div style={{ marginTop: 10, height: 6, borderRadius: 99, background: C.line, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: C.green, transition: 'width .3s' }} />
        </div>
        <p style={{ marginTop: 5, fontSize: 11.5, color: C.mute }}>{report.done} of {report.total} done{actions.length > 0 ? ` · ${actions.length} action${actions.length > 1 ? 's' : ''} left` : ''}</p>
      </header>

      <main style={{ maxWidth: 600, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {allDone && (
          <div style={{ background: C.greenSoft, border: `1px solid ${C.green}`, borderRadius: 14, padding: 16, textAlign: 'center', color: C.greenDk, fontWeight: 700, fontSize: 14 }}>✓ You’re all set — nothing else needed right now.</div>
        )}

        {inputs.length > 0 && (
          <section>
            <SectionLabel>Your inputs</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {inputs.map((it) => (
                <InputCard key={it.id} item={it} value={exec[it.field as string] ?? ''} saving={savingField === it.field}
                  onChange={(v) => setExec((e) => ({ ...e, [it.field as string]: v }))}
                  onSave={(v) => saveField(it.field as string, v)} />
              ))}
            </div>
          </section>
        )}

        {actions.length > 0 && (
          <section>
            <SectionLabel>Needs your action</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {actions.map((it) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{it.title}</div>
                    <div style={{ fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>{it.why}</div>
                  </div>
                  <a href={it.href} style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff', background: C.ink, borderRadius: 10, padding: '8px 14px', textDecoration: 'none' }}>{it.actionLabel}</a>
                </div>
              ))}
            </div>
          </section>
        )}

        <button onClick={() => router.push(`/dashboard/campaigns/${id}`)} style={{ marginTop: 6, alignSelf: 'center', background: 'none', border: 'none', color: C.mute, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Done for now →</button>
      </main>
    </div>
  )
}

function InputCard({ item, value, saving, onChange, onSave }: { item: ReadinessItem; value: string; saving: boolean; onChange: (v: string) => void; onSave: (v: string) => void }) {
  const filled = value.trim().length > 0
  const field = { width: '100%', border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 11px', fontSize: 13.5, color: C.ink, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
        <span style={{ width: 16, height: 16, borderRadius: 99, display: 'inline-grid', placeItems: 'center', background: filled ? C.green : 'transparent', border: filled ? 'none' : `1.5px solid ${C.faint}` }}>{filled && <Check size={11} color="#fff" strokeWidth={3} />}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{item.title}</span>
        {item.optional && <span style={{ fontSize: 10.5, color: C.faint }}>optional</span>}
        {saving && <span style={{ fontSize: 10.5, color: C.faint, marginLeft: 'auto' }}>saving…</span>}
      </div>
      <div style={{ fontSize: 12, color: C.mute, marginBottom: 8, lineHeight: 1.4 }}>{item.why}</div>
      {item.inputType === 'textarea'
        ? <textarea value={value} placeholder={item.placeholder} onChange={(e) => onChange(e.target.value)} onBlur={(e) => { if (e.target.value !== (item.value ?? '')) onSave(e.target.value) }} rows={2} style={field} />
        : <input value={value} placeholder={item.placeholder} onChange={(e) => onChange(e.target.value)} onBlur={(e) => { if (e.target.value !== (item.value ?? '')) onSave(e.target.value) }} style={field} />}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, margin: '2px 2px 8px' }}>{children}</div>
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: C.mute, fontSize: 14 }}>{children}</div>
}
