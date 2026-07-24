'use client'

/**
 * The creator's shop editor (/creator/account/profile) — the header of their storefront: cover
 * photo, profile photo, name, bio, skills, style, where they work, and links. This is what a
 * restaurant sees at the top of their public page. Photos upload the moment they're picked (their
 * own server action); the Save button saves the text fields. Reuses the onboarding UI kit so it
 * feels like the guided setup. Writes via updateMyProfile + uploadMyAvatar/uploadMyCover (all
 * vendor-scoped).
 */

import { useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, ImagePlus, Loader2, Plus, X, Link2 } from 'lucide-react'
import { Question, OptionCard, ChipGroup, Input, TextArea, FieldLabel, Hint } from '@/app/(auth)/onboarding/full/ui'
import { CREATOR_SKILLS } from '@/lib/marketplace/creator-skills'
import { updateMyProfile, uploadMyAvatar, uploadMyCover, type MyProfile } from '@/lib/marketplace/creator-store-actions'
import { fileToDownscaledDataUrl, AVATAR_PREP, COVER_PREP } from '@/lib/marketplace/creator-image'

const STYLE_TAGS = ['Bright', 'Moody', 'Minimal', 'Editorial', 'Warm', 'Bold', 'Natural light', 'Cinematic', 'Clean', 'Playful', 'Cozy', 'High-end'] as const

const GREEN = '#4abd98'
const GREEN_DK = '#0f6e56'

export default function ProfileEditor({ initial }: { initial: MyProfile }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [bio, setBio] = useState(initial.bio)
  const [skills, setSkills] = useState<string[]>(initial.skills)
  const [area, setArea] = useState(initial.serviceArea.join(', '))
  const [tags, setTags] = useState<string[]>(initial.styleTags)
  const [links, setLinks] = useState<string[]>(initial.portfolioLinks)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // Photos live in their own state because they save on pick, not on the Save button.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl)
  const [coverUrl, setCoverUrl] = useState<string | null>(initial.coverUrl)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const [photoErr, setPhotoErr] = useState('')
  const avatarInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)

  const toggleSkill = (id: string) => setSkills((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const toggleTag = (t: string) => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))
  const setLinkAt = (i: number, v: string) => setLinks((ls) => ls.map((l, idx) => (idx === i ? v : l)))
  const addLink = () => setLinks((ls) => [...ls, ''])
  const removeLink = (i: number) => setLinks((ls) => ls.filter((_, idx) => idx !== i))
  const areaTokens = area.split(',').map((s) => s.trim()).filter(Boolean)
  const canSave = !!name.trim() && skills.length > 0 && areaTokens.length > 0 && !saving

  async function onPickCover(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setPhotoErr(''); setCoverBusy(true)
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, COVER_PREP)
      const res = await uploadMyCover(dataUrl)
      if (!res.ok) { setPhotoErr(res.error); setCoverBusy(false); return }
      setCoverUrl(res.url); setCoverBusy(false)
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : 'Could not add that photo.'); setCoverBusy(false)
    }
  }

  async function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setPhotoErr(''); setAvatarBusy(true)
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, AVATAR_PREP)
      const res = await uploadMyAvatar(dataUrl)
      if (!res.ok) { setPhotoErr(res.error); setAvatarBusy(false); return }
      setAvatarUrl(res.url); setAvatarBusy(false)
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : 'Could not add that photo.'); setAvatarBusy(false)
    }
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await updateMyProfile({
        name: name.trim(), bio: bio.trim(), skills,
        serviceArea: areaTokens.map((s) => s.toUpperCase()), styleTags: tags,
        portfolioLinks: links.map((s) => s.trim()).filter(Boolean),
      })
      if (!res.ok) { setError(res.error ?? 'Could not save. Try again.'); setSaving(false); return }
      setSaved(true); setSaving(false); router.refresh()
    } catch {
      setError('That took too long. Try again.'); setSaving(false)
    }
  }

  const initials = (name.trim() || 'You').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  return (
    <div style={{ background: '#fafafa', minHeight: '100%', paddingBottom: 40, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '0 18px' }}>
        <div style={{ paddingTop: 14, paddingBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/creator/account" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: GREEN_DK, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            <ArrowLeft size={17} /> Account
          </Link>
          {initial.bookable
            ? <span style={{ fontSize: 12, fontWeight: 700, color: GREEN_DK, background: '#eaf7f3', border: '1px solid #b9e3d5', borderRadius: 999, padding: '3px 10px' }}>Live</span>
            : <span style={{ fontSize: 12, fontWeight: 700, color: '#8a5a0c', background: '#fbf3e4', border: '1px solid #f0e0b8', borderRadius: 999, padding: '3px 10px' }}>Under review</span>}
        </div>
        <Question title="Your shop" subtitle="This is what restaurants see when they find you." />

        {/* Shop header preview — cover + profile photo, exactly like the public page. */}
        <div style={{ marginTop: 8 }}>
          <input ref={coverInput} type="file" accept="image/*" onChange={onPickCover} style={{ display: 'none' }} />
          <input ref={avatarInput} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: 'none' }} />

          <div style={{ position: 'relative' }}>
            {/* Cover */}
            <button type="button" onClick={() => coverInput.current?.click()} disabled={coverBusy}
              style={{
                display: 'block', width: '100%', height: 148, borderRadius: 16, border: 'none', padding: 0, cursor: coverBusy ? 'default' : 'pointer',
                background: coverUrl ? `center/cover no-repeat url("${coverUrl}")` : 'linear-gradient(135deg, #eaf7f3, #d6efe6)',
                position: 'relative', overflow: 'hidden',
              }}>
              {!coverUrl && !coverBusy && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: GREEN_DK, fontSize: 13, fontWeight: 600 }}>
                  <ImagePlus size={16} /> Add a cover photo
                </span>
              )}
              {coverBusy && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.5)' }}><Loader2 size={20} className="animate-spin" color={GREEN_DK} /></span>}
              {coverUrl && !coverBusy && (
                <span style={{ position: 'absolute', right: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 11px' }}>
                  <Camera size={13} /> Change
                </span>
              )}
            </button>

            {/* Profile photo, overlapping the cover */}
            <div style={{ position: 'absolute', left: 14, bottom: -34 }}>
              <button type="button" onClick={() => avatarInput.current?.click()} disabled={avatarBusy}
                style={{ position: 'relative', width: 86, height: 86, borderRadius: '50%', border: '4px solid #fafafa', padding: 0, cursor: avatarBusy ? 'default' : 'pointer', overflow: 'hidden', background: avatarUrl ? `center/cover no-repeat url("${avatarUrl}")` : GREEN, boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
                {!avatarUrl && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'white', fontSize: 26, fontWeight: 700 }}>{initials}</span>}
                {avatarBusy && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.55)' }}><Loader2 size={18} className="animate-spin" color={GREEN_DK} /></span>}
                <span style={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: '50%', background: GREEN_DK, border: '2px solid #fafafa', display: 'grid', placeItems: 'center' }}>
                  <Camera size={14} color="white" />
                </span>
              </button>
            </div>
          </div>
          <div style={{ height: 40 }} />
          {photoErr && <div className="text-[13px] rounded-[10px] px-3 py-2" style={{ background: '#fdeeee', border: '1px solid #f3c9c6', color: '#b3403a' }}>{photoErr}</div>}
          <Hint>Tap the cover or photo to change it. Wide, bright shots of your work look best.</Hint>
        </div>

        <div style={{ marginTop: 18 }}>
          <FieldLabel>Your name</FieldLabel>
          <Input value={name} onChange={setName} placeholder="Your name or studio" />
        </div>
        <div style={{ marginTop: 16 }}>
          <FieldLabel>Your bio</FieldLabel>
          <TextArea value={bio} onChange={setBio} placeholder="What you shoot, who you love working with, what makes your work yours." rows={4} />
        </div>
        <div style={{ marginTop: 16 }}>
          <FieldLabel>What you do</FieldLabel>
          <div className="grid grid-cols-2 gap-2.5">
            {CREATOR_SKILLS.map((s) => (
              <OptionCard key={s.id} selected={skills.includes(s.id)} onClick={() => toggleSkill(s.id)}>
                <div className="text-xl mb-1.5">{s.emoji}</div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: skills.includes(s.id) ? GREEN_DK : '#111' }}>{s.label}</div>
                <div className="text-xs leading-snug" style={{ color: '#999' }}>{s.desc}</div>
              </OptionCard>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <FieldLabel>Where you work (state codes)</FieldLabel>
          <Input value={area} onChange={setArea} placeholder="WA" />
          <Hint>2-letter codes like WA or OR. Add a few with commas.</Hint>
        </div>
        <div style={{ marginTop: 16 }}>
          <FieldLabel>Your style</FieldLabel>
          <ChipGroup options={STYLE_TAGS} selected={tags} onToggle={toggleTag} />
        </div>

        {/* Links to work off-platform (Instagram, a portfolio site, etc). */}
        <div style={{ marginTop: 16 }}>
          <FieldLabel>Links to your work</FieldLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {links.map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}><Input value={l} onChange={(v: string) => setLinkAt(i, v)} placeholder="instagram.com/yourwork" /></div>
                <button type="button" onClick={() => removeLink(i)} aria-label="Remove link"
                  style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: '1px solid #e6e6ea', background: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#8a8a8e' }}>
                  <X size={16} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addLink}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', color: GREEN_DK, fontSize: 14, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
              <Plus size={16} /> {links.length ? 'Add another link' : 'Add a link'}
            </button>
          </div>
          {links.length > 0 && <Hint>These show as buttons on your page. <Link2 size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> We add https for you.</Hint>}
        </div>

        {error && <div className="mt-4 text-[13px] rounded-[10px] px-3 py-2" style={{ background: '#fdeeee', border: '1px solid #f3c9c6', color: '#b3403a' }}>{error}</div>}
        {saved && !error && <div className="mt-4 text-[13px] rounded-[10px] px-3 py-2" style={{ background: '#eaf7f3', border: '1px solid #b9e3d5', color: GREEN_DK }}>Saved.</div>}

        <button type="button" onClick={save} disabled={!canSave}
          className="w-full rounded-[10px] px-5 py-3 text-[14px] font-semibold mt-5"
          style={{ background: !canSave ? '#bfe7da' : GREEN, color: 'white', cursor: !canSave ? 'default' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
