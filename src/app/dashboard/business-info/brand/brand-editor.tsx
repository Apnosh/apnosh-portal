'use client'

/**
 * Brand & audience (mvp). Edits ONLY the brand + audience columns on the
 * businesses row via a partial Supabase update, so the other ~25 profile
 * fields are left untouched (no full-row rewrite, no data loss). Reuses the
 * exact load coercions from the legacy /dashboard/profile editor and the same
 * non-blocking brand→client-profile sync. The legacy editor stays for the
 * advanced sections (competitors, marketing history).
 */

import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpSaveBar, C } from '@/components/mvp/mvp-detail'
import { EditorField, EditorTextArea } from '../editor-shell'

type Colors = { primary: string; secondary: string }

function coerceColors(c: unknown): Colors {
  if (!c) return { primary: '', secondary: '' }
  if (typeof c === 'object' && !Array.isArray(c) && (c as { primary?: string }).primary !== undefined) {
    const o = c as { primary?: string; secondary?: string }
    return { primary: o.primary || '', secondary: o.secondary || '' }
  }
  if (Array.isArray(c)) return { primary: c[0] || '', secondary: c[1] || '' }
  if (typeof c === 'string') {
    try { const arr = JSON.parse(c); return { primary: arr[0] || '', secondary: arr[1] || '' } } catch { return { primary: '', secondary: '' } }
  }
  return { primary: '', secondary: '' }
}

function keyOf(o: Record<string, unknown>): string {
  return JSON.stringify(o)
}

export default function BrandEditor() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)

  const [voiceWords, setVoiceWords] = useState<string[]>([])
  const [voiceInput, setVoiceInput] = useState('')
  const [tone, setTone] = useState('')
  const [doNots, setDoNots] = useState('')
  const [primary, setPrimary] = useState('')
  const [secondary, setSecondary] = useState('')
  const [fonts, setFonts] = useState('')
  const [styleNotes, setStyleNotes] = useState('')
  const [audience, setAudience] = useState('')
  const [ageRange, setAgeRange] = useState('')
  const [location, setLocation] = useState('')
  const [problem, setProblem] = useState('')

  const [originalKey, setOriginalKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function currentKey() {
    return keyOf({ voiceWords, tone, doNots, primary, secondary, fonts, styleNotes, audience, ageRange, location, problem })
  }

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadError('Sign in to edit your brand.'); setLoading(false); return }
      const { data, error } = await supabase
        .from('businesses')
        .select('id, brand_voice_words, brand_tone, brand_do_nots, brand_colors, fonts, style_notes, target_audience, target_age_range, target_location, target_problem')
        .eq('owner_id', user.id)
        .maybeSingle()
      if (error || !data) { setLoadError('Could not load your brand profile.'); setLoading(false); return }
      const vw = Array.isArray(data.brand_voice_words)
        ? data.brand_voice_words as string[]
        : (typeof data.brand_voice_words === 'string' && data.brand_voice_words ? String(data.brand_voice_words).split(',').map(s => s.trim()).filter(Boolean) : [])
      const colors = coerceColors(data.brand_colors)
      setBusinessId(data.id as string)
      setVoiceWords(vw)
      setTone(data.brand_tone || '')
      setDoNots(data.brand_do_nots || '')
      setPrimary(colors.primary)
      setSecondary(colors.secondary)
      setFonts(data.fonts || '')
      setStyleNotes(data.style_notes || '')
      setAudience(data.target_audience || '')
      setAgeRange(data.target_age_range || '')
      setLocation(data.target_location || '')
      setProblem(data.target_problem || '')
      setOriginalKey(keyOf({
        voiceWords: vw, tone: data.brand_tone || '', doNots: data.brand_do_nots || '',
        primary: colors.primary, secondary: colors.secondary, fonts: data.fonts || '', styleNotes: data.style_notes || '',
        audience: data.target_audience || '', ageRange: data.target_age_range || '', location: data.target_location || '', problem: data.target_problem || '',
      }))
      setLoading(false)
    })()
  }, [])

  const dirty = !loading && currentKey() !== originalKey

  function addWord() {
    const w = voiceInput.trim()
    if (w && !voiceWords.includes(w)) setVoiceWords(prev => [...prev, w])
    setVoiceInput(''); setSaved(false)
  }
  function removeWord(w: string) { setVoiceWords(prev => prev.filter(x => x !== w)); setSaved(false) }

  async function onSave() {
    if (!businessId) return
    setSaving(true); setSaveError(null)
    const supabase = createClient()
    const { error } = await supabase.from('businesses').update({
      brand_voice_words: voiceWords,
      brand_tone: tone.trim() || null,
      brand_do_nots: doNots.trim() || null,
      brand_colors: { primary, secondary },
      fonts: fonts.trim() || null,
      style_notes: styleNotes.trim() || null,
      target_audience: audience.trim() || null,
      target_age_range: ageRange.trim() || null,
      target_location: location.trim() || null,
      target_problem: problem.trim() || null,
    }).eq('id', businessId)
    if (error) { setSaveError(error.message); setSaving(false); return }
    import('@/lib/crm-sync').then(({ syncBusinessToClientProfile }) => syncBusinessToClientProfile(businessId)).catch(() => {})
    setOriginalKey(currentKey())
    setSaved(true)
    setSaving(false)
  }

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Brand & audience" subtitle="How you sound and who you serve. Guides your content." backHref="/dashboard/more" backLabel="More" />}>
      <div style={{ background: C.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ flex: 1, padding: '16px 14px 14px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: C.mute, fontSize: 14, padding: '40px 0' }}>Loading...</div>
          ) : loadError ? (
            <div style={{ background: '#fdeeee', border: '0.5px solid #f1c7c3', borderRadius: 14, padding: '14px', fontSize: 13, color: '#8a2f28', lineHeight: 1.5 }}>{loadError}</div>
          ) : (
            <>
              <SectionHead>Brand</SectionHead>

              <div style={{ marginBottom: 16 }}>
                <Label>Brand voice words</Label>
                {voiceWords.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 8 }}>
                    {voiceWords.map(w => (
                      <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.greenSoft, color: C.greenDk, borderRadius: 99, padding: '5px 8px 5px 11px', fontSize: 13, fontWeight: 600 }}>
                        {w}
                        <button type="button" onClick={() => removeWord(w)} aria-label={`Remove ${w}`} style={{ background: 'none', border: 'none', color: C.greenDk, cursor: 'pointer', display: 'flex', padding: 0 }}><X size={13} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  className="mvp-input"
                  value={voiceInput}
                  onChange={e => setVoiceInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addWord() } }}
                  placeholder="Add a word, like warm or bold"
                  style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none' }}
                />
                <p style={{ fontSize: 11.5, color: C.faint, margin: '6px 2px 0', lineHeight: 1.45 }}>Press enter to add each one. A few words for how you sound.</p>
              </div>

              <EditorField label="Tone" value={tone} onChange={v => { setTone(v); setSaved(false) }} placeholder="Friendly and confident" hint="A short phrase for your overall vibe." />
              <EditorTextArea label="Things to avoid" value={doNots} onChange={v => { setDoNots(v); setSaved(false) }} placeholder="Words, claims, or styles to stay away from" rows={2} />

              <div style={{ marginBottom: 16 }}>
                <Label>Brand colors</Label>
                <ColorRow label="Primary" value={primary} onChange={v => { setPrimary(v); setSaved(false) }} />
                <ColorRow label="Secondary" value={secondary} onChange={v => { setSecondary(v); setSaved(false) }} />
              </div>

              <EditorField label="Fonts" value={fonts} onChange={v => { setFonts(v); setSaved(false) }} placeholder="e.g. Poppins, Georgia" />
              <EditorTextArea label="Style notes" value={styleNotes} onChange={v => { setStyleNotes(v); setSaved(false) }} placeholder="Anything else about your look and feel" rows={2} />

              <SectionHead>Who you serve</SectionHead>
              <EditorTextArea label="Your customers" value={audience} onChange={v => { setAudience(v); setSaved(false) }} placeholder="Who comes in, and who you want more of" rows={2} />
              <EditorField label="Age range" value={ageRange} onChange={v => { setAgeRange(v); setSaved(false) }} placeholder="e.g. 25 to 45" />
              <EditorField label="Where they are" value={location} onChange={v => { setLocation(v); setSaved(false) }} placeholder="Neighborhoods or areas you draw from" />
              <EditorTextArea label="What you solve for them" value={problem} onChange={v => { setProblem(v); setSaved(false) }} placeholder="The craving or need you meet" rows={2} />

              {saveError && <p style={{ fontSize: 13, color: C.coral, margin: '6px 4px 0' }}>{saveError}</p>}
            </>
          )}
        </div>
        {!loading && !loadError && (
          <MvpSaveBar onClick={onSave} label="Save" disabled={!dirty} saving={saving} hint={saved && !dirty ? 'Saved' : undefined} />
        )}
      </div>
    </MvpShell>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 2px 9px', marginTop: 6 }}>{children}</div>
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>{children}</label>
}
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 13.5, color: C.ink, width: 78, flexShrink: 0 }}>{label}</span>
      <span style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.line}`, background: value || '#fff', flexShrink: 0 }} />
      <input className="mvp-input" value={value} onChange={e => onChange(e.target.value)} placeholder="#1d1d1f" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none' }} />
    </div>
  )
}
