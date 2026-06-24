'use client'

/**
 * The owner's creative-control choice (campaigns.creative_control): how hands-on
 * they want to be with the idea. Shown before ship — it decides whether the AI
 * brief reaches the creator directly, waits for a concept OK, or is the owner's
 * to write. The idea itself is written for them either way.
 */
import { C } from '@/components/campaigns/ui'

const MODES: { key: string; label: string; desc: string }[] = [
  { key: 'handoff', label: 'Just handle it', desc: 'We write the brief and the creator runs with it. You approve the final piece.' },
  { key: 'approve_concept', label: 'Run the idea by me first', desc: 'You OK the concept before the creator produces anything.' },
  { key: 'owner_directs', label: 'I’ll write the direction', desc: 'You write the brief yourself; the creator executes it.' },
]

export default function CreativeControl({ value, onChange, disabled }: { value: string; onChange: (mode: string) => void; disabled?: boolean }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 2 }}>Who steers the creative?</div>
      <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 10 }}>The idea is written for you either way — this is just how hands-on you want to be.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MODES.map((m) => {
          const on = value === m.key
          return (
            <button
              key={m.key}
              disabled={disabled}
              onClick={() => onChange(m.key)}
              style={{ textAlign: 'left', background: on ? C.greenSoft : '#fff', border: `1px solid ${on ? C.green : C.line}`, borderRadius: 12, padding: '10px 12px', cursor: disabled ? 'default' : 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 16, height: 16, borderRadius: 99, border: `2px solid ${on ? C.green : C.faint}`, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>{on && <span style={{ width: 8, height: 8, borderRadius: 99, background: C.green }} />}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{m.label}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.mute, marginTop: 3, marginLeft: 24, lineHeight: 1.4 }}>{m.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
