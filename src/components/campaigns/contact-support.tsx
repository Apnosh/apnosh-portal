'use client'

/**
 * ContactSupport — the quiet door at the bottom of the campaign page. Opens a small form (bottom
 * sheet, same pattern as the creator marketplace) that SUBMITS for real: it creates a Support thread
 * in Messages via the existing createThread action, with the campaign named in the first message so
 * the team has context. No fake mailto, no dead end — the reply lands in Messages.
 */
import { useState } from 'react'
import { LifeBuoy, X, Check } from 'lucide-react'
import { C, DISPLAY, GRAD } from '@/components/campaigns/ui'
import { createThread } from '@/lib/actions'

export default function ContactSupport({ campaignName }: { campaignName: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function send() {
    if (!text.trim() || state === 'sending') return
    setState('sending')
    try {
      const r = await createThread('Support', `About "${campaignName}": ${text.trim()}`)
      if (!r.success) throw new Error(r.error)
      setState('sent')
      setText('')
    } catch { setState('error') }
  }
  const close = () => { setOpen(false); if (state !== 'idle') setState('idle') }

  return (
    <>
      <button onClick={() => setOpen(true)} className="cw-press" style={{ marginTop: 24, width: '100%', height: 48, borderRadius: 12, border: `1px solid ${C.line}`, cursor: 'pointer', background: '#fff', color: C.ink, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <LifeBuoy size={16} color={C.greenDk} /> Contact support
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(20,24,28,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }} onClick={close}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)', padding: '16px 16px calc(16px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, color: C.ink }}>Contact support</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>Tell us what you need. We reply in your Messages.</div>
              </div>
              <button onClick={close} aria-label="Close" style={{ background: C.bg, border: 'none', borderRadius: 16, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={16} color={C.ink} /></button>
            </div>

            {state === 'sent' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.greenSoft, color: C.greenDk, borderRadius: 12, padding: '13px 14px', fontSize: 13.5, fontWeight: 600 }}>
                <Check size={16} /> Sent. Your team replies in Messages.
              </div>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`What can we help with on "${campaignName}"?`}
                  rows={4}
                  style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 12px', fontSize: 13.5, color: C.ink, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
                />
                {state === 'error' && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>Could not send. Check your connection and try again.</div>}
                <button onClick={send} disabled={!text.trim() || state === 'sending'} className="cw-press" style={{ marginTop: 10, width: '100%', height: 48, borderRadius: 12, border: 'none', cursor: text.trim() ? 'pointer' : 'default', background: text.trim() ? GRAD : C.bg, color: text.trim() ? '#fff' : C.faint, fontSize: 15, fontWeight: 600, opacity: state === 'sending' ? 0.7 : 1 }}>
                  {state === 'sending' ? 'Sending…' : 'Send'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
