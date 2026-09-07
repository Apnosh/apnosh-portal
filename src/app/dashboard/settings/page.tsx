'use client'

/**
 * Owner Settings — apnosh-mvp surface. Reached from More -> Settings.
 *
 * Kept lean and de-duplicated: Profile (name + verified email), Security
 * (password change with a current-password re-auth), and Content approvals
 * (the live auto-approve gate). Notification preferences and Connected accounts
 * link OUT to the dedicated screens that already own those flows, so the owner
 * never sees two doors to the same thing. Cancellation routes to the team
 * (managed-service model: 30 days notice), not a dead delete button.
 *
 * Note: there is no profiles.phone column, so no phone field here. The business
 * phone lives in Business info -> contact.
 *
 * Language (2026-09-07) is the one thing on this page that belongs to the BUSINESS rather than
 * the login: ten of the twenty owners in the walk speak Spanish at home, and the product only
 * ever spoke English at them. Saved to clients.preferred_language through the settings PATCH,
 * and applied to the screen the moment they tap, before the save comes back, because a language
 * picker that makes you wait to see the language is the wrong picker.
 */

import { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpPill, C } from '@/components/mvp/mvp-detail'
import { EditorField } from '../business-info/editor-shell'
import { useClient } from '@/lib/client-context'
import { useLang } from '@/components/mvp/mvp-language'
import { LANGS, LANG_LABEL, t as tRaw, type Lang } from '@/lib/i18n/t'


export default function SettingsPage() {
  const [loading, setLoading] = useState(true)

  // Profile
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [initials, setInitials] = useState('U')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Security
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Language — the business's, not the login's
  const { client, isAdmin } = useClient()
  const { lang, setLang, T, preview } = useLang()
  const [langMsg, setLangMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function pickLanguage(next: Lang) {
    if (next === lang) return
    // Staff previewing with ?lang= are READING somebody else's business. Tapping the other
    // language here must not save onto their row, so for staff it does nothing at all.
    if (isAdmin) return
    // The screen switches first. The save is what makes it stick on the next device.
    setLang(next)
    setLangMsg(null)
    if (!client?.id) return
    try {
      const r = await fetch('/api/dashboard/more', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, language: next }),
      })
      const j = await r.json().catch(() => ({}))
      setLangMsg(r.ok && j?.ok ? { ok: true, text: t2(next, 'Saved.') } : { ok: false, text: t2(next, 'Could not save. Try again.') })
    } catch {
      setLangMsg({ ok: false, text: t2(next, 'Could not save. Try again.') })
    }
  }

  useEffect(() => {
    async function run() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase.from('profiles').select('full_name, email, phone').eq('id', user.id).single()
      const name = profile?.full_name || ''
      setFullName(name)
      setPhone(((profile as { phone?: string | null } | null)?.phone ?? '') as string)
      setEmail(profile?.email || user.email || '')
      setInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U')

      setLoading(false)
    }
    run()
  }, [])

  async function handleSaveProfile() {
    setProfileSaving(true); setProfileMsg(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setProfileSaving(false); return }
    const { error } = await supabase.from('profiles').update({ full_name: fullName, phone: phone.trim() || null }).eq('id', user.id)
    if (error) setProfileMsg({ ok: false, text: error.message })
    else { setProfileMsg({ ok: true, text: T('Saved.') }); setInitials(fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U') }
    setProfileSaving(false)
  }

  async function handleChangePassword() {
    setPwMsg(null)
    if (!currentPw) { setPwMsg({ ok: false, text: T('Enter your current password.') }); return }
    if (!newPw || newPw !== confirmPw) { setPwMsg({ ok: false, text: T('The new passwords do not match.') }); return }
    if (newPw.length < 8) { setPwMsg({ ok: false, text: T('The new password needs at least 8 characters.') }); return }
    setPwSaving(true)
    const supabase = createClient()
    // Re-auth: verify the current password before changing it.
    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPw })
    if (reauthErr) { setPwMsg({ ok: false, text: T('That current password is not right.') }); setPwSaving(false); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setPwMsg({ ok: false, text: error.message })
    else { setPwMsg({ ok: true, text: T('Password updated.') }); setCurrentPw(''); setNewPw(''); setConfirmPw('') }
    setPwSaving(false)
  }

  const btn = (busy: boolean): React.CSSProperties => ({ width: '100%', height: 44, marginTop: 14, borderRadius: 12, border: 'none', background: busy ? '#bfe7da' : C.green, color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 })

  return (
    <MvpShell active="more" header={<MvpDetailHeader title={T('Your profile')} subtitle={T('Your name, phone, email and password')} />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {loading ? (
          <div style={{ marginTop: 4 }}>
            {[140, 180, 200].map((h, i) => <div key={i} style={{ height: h, background: '#ececef', borderRadius: 16, marginBottom: 14, animation: 'mvpPulse 1.2s ease-in-out infinite' }} />)}
            <style>{`@keyframes mvpPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
          </div>
        ) : (
          <>
            {/* Profile */}
            <MvpGroup title={T('About you')} hue="mint">
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                  <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>{initials}</span>
                  <span style={{ fontSize: 12.5, color: C.mute }}>{T('Avatar comes from your login.')}</span>
                </div>
                <EditorField label={T('Your name')} value={fullName} onChange={setFullName} placeholder={T('Your name')} />
                <EditorField label={T('Phone')} value={phone} onChange={setPhone} placeholder="(206) 555-0100" />
                <div style={{ marginBottom: 4 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>{T('Email')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#f5f5f7', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px' }}>
                    <span style={{ fontSize: 15, color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
                    <MvpPill tone="good" label={T('Verified')} />
                  </div>
                </div>
                {profileMsg && <Msg msg={profileMsg} />}
                <button type="button" onClick={handleSaveProfile} disabled={profileSaving} style={btn(profileSaving)}>
                  {profileSaving && <Loader2 size={16} className="mvp-spin" />}{T('Save')}
                </button>
              </div>
            </MvpGroup>

            {/* Language — the business's language, saved on the client row. Two options, each
                written in its own language, because that is the only label a reader can be sure
                of. The honest note under them says the translation is not finished yet. */}
            <MvpGroup title={T('Language')} hue="nights">
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 13.5, color: C.mute, marginBottom: 12 }}>{T('Pick the language you want to read.')}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {LANGS.map((l) => {
                    const on = l === lang
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => pickLanguage(l)}
                        aria-pressed={on}
                        disabled={isAdmin}
                        style={{ flex: 1, height: 46, borderRadius: 12, cursor: isAdmin ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: on ? 700 : 500, color: on ? '#fff' : C.ink, background: on ? C.green : '#fff', border: `1px solid ${on ? C.green : C.line}` }}
                      >
                        {LANG_LABEL[l]}
                      </button>
                    )
                  })}
                </div>
                {/* Staff, previewing with ?lang= on the URL. Says so, so nobody thinks they just
                    changed what this owner reads — they did not, and cannot from here. */}
                {isAdmin && preview && (
                  <div style={{ fontSize: 12.5, color: C.mute, marginTop: 10, lineHeight: 1.45, fontWeight: 600 }}>
                    {T('Previewing in {language} (not saved)', { language: LANG_LABEL[lang] })}
                  </div>
                )}
                <div style={{ fontSize: 12.5, color: C.mute, marginTop: 10, lineHeight: 1.45 }}>{T('Some screens are still in English. We are working on the rest.')}</div>
                {langMsg && <Msg msg={langMsg} />}
              </div>
            </MvpGroup>

            {/* Security */}
            <MvpGroup title={T('Password')} hue="grey">
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 12 }}>{T('Change password')}</div>
                <PwField label={T('Current password')} value={currentPw} onChange={setCurrentPw} show={showCurrent} onToggle={() => setShowCurrent((v) => !v)} placeholder={T('Current password')} showLabel={T('Show password')} hideLabel={T('Hide password')} />
                <PwField label={T('New password')} value={newPw} onChange={setNewPw} show={showNew} onToggle={() => setShowNew((v) => !v)} placeholder={T('At least 8 characters')} showLabel={T('Show password')} hideLabel={T('Hide password')} />
                <PwField label={T('Confirm new password')} value={confirmPw} onChange={setConfirmPw} show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} placeholder={T('Re-enter new password')} showLabel={T('Show password')} hideLabel={T('Hide password')} />
                {pwMsg && <Msg msg={pwMsg} />}
                <button type="button" onClick={handleChangePassword} disabled={pwSaving} style={btn(pwSaving)}>
                  {pwSaving && <Loader2 size={16} className="mvp-spin" />}{T('Update password')}
                </button>
              </div>
            </MvpGroup>

            {/* Approvals, dark mode, alerts, connected accounts and pause/cancel moved to Your settings,
                Connected accounts and Plan and billing (owner 2026-09-05). This page is login only. */}
          </>
        )}
      </div>
    </MvpShell>
  )
}

/** The save message must read in the language they just picked, not the one they just left. */
function t2(lang: Lang, key: string): string { return tRaw(key, lang) }

function Msg({ msg }: { msg: { ok: boolean; text: string } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: msg.ok ? C.greenSoft : C.coralSoft, color: msg.ok ? C.greenDk : C.coral, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>
      {msg.text}
    </div>
  )
}


function PwField({ label, value, onChange, show, onToggle, placeholder, showLabel, hideLabel }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder?: string; showLabel: string; hideLabel: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mvp-input"
          style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 44px 12px 14px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none' }}
        />
        <button type="button" onClick={onToggle} aria-label={show ? hideLabel : showLabel}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.faint, cursor: 'pointer', padding: 4, display: 'flex' }}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}
