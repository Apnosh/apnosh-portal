'use client'
/**
 * /dashboard/tell-a-friend — the owner's code, the link, and where each friend got to.
 *
 * THE PAGE IS NOT A DOOR. It draws the loop only when /api/referrals/me says the switch is on AND
 * this owner has had a promise counted; otherwise it says the one honest sentence and stops. The
 * server decides both, so opening the URL by hand gets an owner nothing.
 *
 * Kit only: the mvp-detail rows and pills, the mint from mvp-theme, Inter. Every string goes
 * through T() — the whole screen is in the manifest (src/lib/i18n/keys.ts, screen 'referral') and
 * scripts/verify-i18n.ts reads this file to prove there is no English left loose on it.
 */
import { useCallback, useEffect, useState } from 'react'
import { Share2, Copy, Check, Users } from 'lucide-react'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpRow, MvpEmpty, MvpPill, MvpToggle, C } from '@/components/mvp/mvp-detail'
import { useClient } from '@/lib/client-context'
import { useLang } from '@/components/mvp/mvp-language'
import { creditWords, friendWord, referralLink, REFERRAL_CREDIT_CENTS, type ReferralStatus } from '@/lib/referrals/model'

interface Friend { id: string; name: string; status: ReferralStatus; createdAt: string; voidReason?: string | null }
interface State {
  enabled: boolean; eligible: boolean; code: string | null
  friends: Friend[]; creditCents: number; featured: boolean; slug: string | null
}

const TONE: Record<ReferralStatus, 'good' | 'warn' | 'neutral'> = {
  signed_up: 'neutral', first_order_paid: 'warn', credited: 'good', void: 'neutral',
}

export default function TellAFriendPage() {
  const { client } = useClient()
  const { T } = useLang()
  const [state, setState] = useState<State | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const amount = creditWords(REFERRAL_CREDIT_CENTS)

  useEffect(() => {
    const id = client?.id
    if (!id) return
    let alive = true
    fetch(`/api/referrals/me?clientId=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setState(j as State) })
      .catch(() => { if (alive) setState({ enabled: false, eligible: false, code: null, friends: [], creditCents: 0, featured: false, slug: null }) })
    return () => { alive = false }
  }, [client?.id])

  const link = state?.code ? referralLink(state.code, typeof window === 'undefined' ? undefined : window.location.origin) : ''

  const share = useCallback(async () => {
    if (!link) return
    try {
      // The phone's own share sheet when there is one; the clipboard when there is not. Both end
      // with the owner holding the link — no third path, no "open this in another app".
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { /* they cancelled the sheet, or the browser said no to the clipboard */ }
  }, [link])

  const toggleFeatured = useCallback(async () => {
    const id = client?.id
    if (!id || !state) return
    setSaving(true)
    setSaved('')
    try {
      const r = await fetch('/api/referrals/featured', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id, on: !state.featured }),
      })
      if (!r.ok) throw new Error('no')
      setState({ ...state, featured: !state.featured })
      setSaved(T('Saved.'))
    } catch {
      setSaved(T('Could not save. Try again.'))
    } finally { setSaving(false) }
  }, [client?.id, state, T])

  return (
    <MvpShell active="more" header={<MvpDetailHeader title={T('Tell a friend')} subtitle={T('Give {amount}, get {amount}.', { amount })} />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '10px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {!state && <div style={{ fontSize: 13, color: C.mute, padding: '8px 4px' }}>{T('Loading…')}</div>}

        {/* TWO DIFFERENT "no", and they must not share a sentence. The loop being SHUT is not the
            same as this owner not having a counted number yet, and telling somebody their orders
            will open a door that does not exist is a promise we cannot keep. */}
        {state && !state.enabled && (
          <MvpEmpty icon={<Users size={20} />} title={T('Not open yet')} text={T('This is not running yet.')} />
        )}
        {state && state.enabled && !state.eligible && (
          <MvpEmpty
            icon={<Users size={20} />}
            title={T('Not yet')}
            text={T('This opens once one of your orders has its number.')}
          />
        )}

        {state && state.enabled && state.eligible && (
          <>
            <div style={{ background: '#eaf7f3', border: '1px solid rgba(74,189,152,0.30)', borderRadius: 16, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12.5, color: '#1c6b52', fontWeight: 600 }}>{T('Your code')}</div>
              <div style={{ fontFamily: "'Cal Sans','Inter',system-ui,sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: '.12em', color: '#1d1d1f', margin: '4px 0 6px' }}>
                {state.code ?? '—'}
              </div>
              <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45 }}>
                {T('They get {amount} off their first order. You get {amount} when their first order gets its number.', { amount })}
              </div>
              <button
                onClick={share}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 11, border: 'none',
                  background: '#2e9a78', color: '#fff', borderRadius: 999, padding: '9px 16px',
                  fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {copied ? <Check size={15} /> : <Share2 size={15} />}
                {copied ? T('Copied') : T('Send this link')}
              </button>
            </div>

            {state.creditCents > 0 && (
              <MvpGroup title={T('Your credit')} hue="mint">
                <MvpRow
                  icon={<Copy size={18} />}
                  hue="mint"
                  label={T('{amount} on your account', { amount: creditWords(state.creditCents) })}
                  sub={T('It comes off your next order.')}
                />
              </MvpGroup>
            )}

            <MvpGroup title={T('Your friends')} hue="nights">
              {state.friends.length === 0 && (
                <MvpEmpty icon={<Users size={20} />} text={T('Nobody yet. Send your link to one owner you like.')} />
              )}
              {state.friends.map((f) => (
                <MvpRow
                  key={f.id}
                  icon={<Users size={18} />}
                  hue="nights"
                  label={f.name || T('A friend')}
                  right={<MvpPill tone={TONE[f.status]} label={T(friendWord(f.status, f.voidReason))} dot />}
                />
              ))}
            </MvpGroup>

            <MvpGroup title={T('Your page')} hue="grey">
              <MvpRow
                icon={<Users size={18} />}
                hue="grey"
                label={T('Show my page')}
                sub={T('Other owners see your name and your counted numbers. Nothing else.')}
                right={<MvpToggle on={state.featured} onClick={toggleFeatured} label={T('Show my page')} />}
              />
              {state.featured && state.slug && (
                <MvpRow icon={<Share2 size={18} />} hue="grey" label={T('See my page')} href={`/owners/${state.slug}`} external />
              )}
            </MvpGroup>
            {(saving || saved) && <div style={{ fontSize: 12, color: C.mute, padding: '0 4px' }}>{saving ? T('Saving...') : saved}</div>}
          </>
        )}
      </div>
    </MvpShell>
  )
}
