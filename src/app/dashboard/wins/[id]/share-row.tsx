'use client'

/**
 * The two things an owner can do with a win: send it, or print it.
 *
 * SEND uses the phone's own share sheet (navigator.share) when there is one, because that is the
 * button that lands the card in WhatsApp where their family already is. On a desktop there is no
 * share sheet, so the same button copies the link and says so.
 *
 * The link is minted on the server the first time (POST /api/dashboard/wins/share), which is also
 * where shared_at is stamped. Before migration 260 the server answers with no link; the button
 * then says the honest thing rather than handing out an address that does not exist.
 *
 * PRINT is the image. There is no PNG renderer in this app (no @vercel/og, no satori, and the two
 * fonts have no file in the repo to embed), so the card is real HTML in the real fonts and the
 * browser makes the picture: "save as PDF" on a desktop, the print sheet on a phone.
 */

import { useState } from 'react'
import { Printer, Share2, Link2, Check } from 'lucide-react'
import { useLang } from '@/components/mvp/mvp-language'

const BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px',
  borderRadius: 99, border: '1px solid #e6e6ea', background: '#fff', color: '#1d1d1f',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
}

export default function ShareRow({ clientId, cardKey, title }: { clientId: string; cardKey: string; title: string }) {
  const { T } = useLang()
  const [state, setState] = useState<'idle' | 'copied' | 'nolink'>('idle')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/wins/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, cardKey }),
      })
      const j = await res.json() as { url?: string | null }
      if (!j?.url) { setState('nolink'); return }
      const url = `${window.location.origin}${j.url}`
      if (navigator.share) {
        await navigator.share({ title, url }).catch(() => { /* they backed out of the sheet */ })
        setState('idle')
      } else {
        await navigator.clipboard.writeText(url)
        setState('copied')
        window.setTimeout(() => setState('idle'), 2000)
      }
    } catch {
      setState('nolink')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rpt-hide">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={send} disabled={busy} style={{ ...BTN, borderColor: '#4abd98', color: '#0f6e56' }}>
          {state === 'copied' ? <Check size={15} color="#2e9a78" /> : <Share2 size={15} color="#2e9a78" />}
          {state === 'copied' ? T('Link copied') : T('Show someone')}
        </button>
        <button onClick={() => window.print()} style={BTN}>
          <Printer size={15} color="#2e9a78" /> {T('Print or save as PDF')}
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: '#8e8e93', marginTop: 10, lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 5 }}>
        <Link2 size={12} color="#aeaeb2" />
        {state === 'nolink'
          ? T('The share link is not on yet. A small database update turns it on.')
          : T('Anyone with the link sees this card and nothing else about your business.')}
      </div>
    </div>
  )
}
