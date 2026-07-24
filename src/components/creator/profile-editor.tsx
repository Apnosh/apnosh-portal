'use client'

/**
 * The creator's profile editor (/creator/account/profile) — the first surface that lets a creator
 * change their profile after onboarding (name, bio, skills, service area, style). Reuses the
 * onboarding UI kit so it looks like the guided setup. Writes via updateMyProfile (vendor-scoped).
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Question, OptionCard, ChipGroup, Input, TextArea, FieldLabel, Hint } from '@/app/(auth)/onboarding/full/ui'
import { CREATOR_SKILLS } from '@/lib/marketplace/creator-skills'
import { updateMyProfile, type MyProfile } from '@/lib/marketplace/creator-store-actions'

const STYLE_TAGS = ['Bright', 'Moody', 'Minimal', 'Editorial', 'Warm', 'Bold', 'Natural light', 'Cinematic', 'Clean', 'Playful', 'Cozy', 'High-end'] as const

export default function ProfileEditor({ initial }: { initial: MyProfile }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [bio, setBio] = useState(initial.bio)
  const [skills, setSkills] = useState<string[]>(initial.skills)
  const [area, setArea] = useState(initial.serviceArea.join(', '))
  const [tags, setTags] = useState<string[]>(initial.styleTags)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const toggleSkill = (id: string) => setSkills((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const toggleTag = (t: string) => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))
  const areaTokens = area.split(',').map((s) => s.trim()).filter(Boolean)
  const canSave = !!name.trim() && skills.length > 0 && areaTokens.length > 0 && !saving

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await updateMyProfile({ name: name.trim(), bio: bio.trim(), skills, serviceArea: areaTokens.map((s) => s.toUpperCase()), styleTags: tags })
      if (!res.ok) { setError(res.error ?? 'Could not save. Try again.'); setSaving(false); return }
      setSaved(true); setSaving(false); router.refresh()
    } catch {
      setError('That took too long. Try again.'); setSaving(false)
    }
  }

  return (
    <div style={{ background: '#fafafa', minHeight: '100%', paddingBottom: 32, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '0 18px' }}>
        <div style={{ paddingTop: 14, paddingBottom: 6 }}>
          <Link href="/creator/account" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0f6e56', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            <ArrowLeft size={17} /> Account
          </Link>
        </div>
        <Question title="Edit profile" subtitle="Update how restaurants see you" />

        <div style={{ marginTop: 16 }}>
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
                <div className="text-sm font-semibold mb-0.5" style={{ color: skills.includes(s.id) ? '#0f6e56' : '#111' }}>{s.label}</div>
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

        {error && <div className="mt-4 text-[13px] rounded-[10px] px-3 py-2" style={{ background: '#fdeeee', border: '1px solid #f3c9c6', color: '#b3403a' }}>{error}</div>}
        {saved && !error && <div className="mt-4 text-[13px] rounded-[10px] px-3 py-2" style={{ background: '#eaf7f3', border: '1px solid #b9e3d5', color: '#0f6e56' }}>Saved.</div>}

        <button type="button" onClick={save} disabled={!canSave}
          className="w-full rounded-[10px] px-5 py-3 text-[14px] font-semibold mt-5"
          style={{ background: !canSave ? '#bfe7da' : '#4abd98', color: 'white', cursor: !canSave ? 'default' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
