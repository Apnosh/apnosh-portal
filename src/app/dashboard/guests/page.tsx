'use client'

/**
 * /dashboard/guests — the owner's guest list (the send rail's audience).
 *
 * One job: get real, permissioned email addresses into guest_contacts and be
 * honest about who left. Paste-anything import (we pull the email addresses
 * out), a count that means something, and per-guest remove. Unsubscribed
 * guests stay visible but marked — they are never emailed again and never
 * silently deleted.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Users } from 'lucide-react'
import { DESK, paperGround, DeskKeyframes } from '@/components/campaigns/desk/ui'

interface Contact {
  id: string
  email: string
  name: string | null
  unsubscribed_at: string | null
  created_at: string
}

const EMAIL_RE = /[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']{2,}/g

export default function GuestsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/audience')
      const d = await r.json().catch(() => ({}))
      setContacts(Array.isArray(d.contacts) ? d.contacts : [])
    } catch {
      setContacts([])
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const active = useMemo(() => contacts.filter((c) => !c.unsubscribed_at), [contacts])
  const pasted = useMemo(() => [...new Set((paste.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))], [paste])

  const importPasted = async () => {
    if (!pasted.length || busy) return
    setBusy(true)
    setNote(null)
    try {
      const r = await fetch('/api/audience', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contacts: pasted.map((email) => ({ email })) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'Import failed. Try again.')
      setNote(`Added ${d.added ?? 0} new ${d.added === 1 ? 'guest' : 'guests'}.`)
      setPaste('')
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Import failed. Try again.')
    }
    setBusy(false)
  }

  const remove = async (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id))
    await fetch('/api/audience', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => load())
  }

  const label = { fontFamily: DESK.mono, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: DESK.mute }

  return (
    <div style={{ ...paperGround, minHeight: '100dvh', padding: '22px 16px 90px' }}>
      <DeskKeyframes />
      <button
        type="button"
        onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/dashboard/more')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: '2px 0', marginBottom: 8, cursor: 'pointer', fontFamily: DESK.body, fontSize: 14, fontWeight: 600, color: DESK.ink2 }}
      >
        <ChevronLeft size={16} /> Back
      </button>
      <div style={label}>Your guest list</div>
      <h1 style={{ fontFamily: DESK.disp, fontSize: 24, color: DESK.ink, margin: '6px 0 4px', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Users size={20} style={{ color: DESK.mintDeep }} />
        {loading ? 'Guests' : `${active.length} ${active.length === 1 ? 'guest' : 'guests'}`}
      </h1>
      <p style={{ fontFamily: DESK.body, fontSize: 13.5, color: DESK.ink2, margin: '0 0 16px', lineHeight: 1.5 }}>
        Email campaigns go to this list. Only add people who gave you their email. Every email carries an unsubscribe link, and we honor it forever.
      </p>

      <div style={{ background: DESK.card, border: `1.5px solid ${DESK.line}`, borderRadius: 14, padding: 14, marginBottom: 18 }}>
        <div style={{ ...label, marginBottom: 8 }}>Add guests</div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={3}
          placeholder="Paste emails here, any format. We pull out the addresses."
          style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${DESK.line}`, borderRadius: 11, padding: '10px 12px', fontFamily: DESK.body, fontSize: 13.5, color: DESK.ink, background: '#FDFCF8', outline: 'none', resize: 'vertical', lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button
            type="button"
            disabled={!pasted.length || busy}
            onClick={() => { void importPasted() }}
            style={{
              height: 42, padding: '0 20px', borderRadius: 21, border: 'none',
              background: pasted.length && !busy ? DESK.grad : '#E7E4DB',
              color: pasted.length && !busy ? '#fff' : DESK.mute,
              fontFamily: DESK.disp, fontSize: 14, fontWeight: 700,
              cursor: pasted.length && !busy ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Adding...' : pasted.length ? `Add ${pasted.length} ${pasted.length === 1 ? 'guest' : 'guests'}` : 'Add guests'}
          </button>
          {note && <span style={{ fontFamily: DESK.body, fontSize: 12.5, color: DESK.mintDeep }}>{note}</span>}
        </div>
      </div>

      {loading ? (
        <div style={{ fontFamily: DESK.body, fontSize: 13, color: DESK.mute, padding: '8px 2px' }}>Loading...</div>
      ) : contacts.length === 0 ? (
        <div style={{ fontFamily: DESK.body, fontSize: 13, color: DESK.mute, padding: '8px 2px' }}>
          Nobody yet. Paste your list above to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {contacts.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: DESK.card, border: `1px solid ${DESK.line}`, borderRadius: 12, padding: '10px 13px' }}>
              <span style={{ flex: 1, minWidth: 0, fontFamily: DESK.body, fontSize: 13.5, color: c.unsubscribed_at ? DESK.mute : DESK.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.email}
              </span>
              {c.unsubscribed_at && (
                <span style={{ flexShrink: 0, fontFamily: DESK.mono, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: DESK.amber, background: DESK.amberWash, borderRadius: 999, padding: '4px 9px' }}>
                  Unsubscribed
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${c.email}`}
                onClick={() => { void remove(c.id) }}
                style={{ flexShrink: 0, border: 'none', background: 'none', color: DESK.mute, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
