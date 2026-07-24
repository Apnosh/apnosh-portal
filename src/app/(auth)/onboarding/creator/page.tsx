'use client'

/**
 * Guided freelancer onboarding — the creator side of the fork. A person who picked "Freelancer" on
 * the role step lands here (already signed in). Mirrors the business onboarding: the same phased,
 * one-card-at-a-time feel, reusing its UI kit. Phases: You → Skills → Profile → Work → Finish.
 *
 * On finish it calls completeCreatorOnboarding, which makes them a creator (vendor + login) with
 * their skills, service area, bio, style tags, portfolio links, and an optional first package, then
 * drops them in the creator app (pending an admin review). Draft is kept in localStorage so an
 * abandoned setup resumes where they left off.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Question, OptionCard, ChipGroup, Input, TextArea, FieldLabel, Hint } from '../full/ui'
import { CREATOR_SKILLS, categoriesForSkills } from '@/lib/marketplace/creator-skills'
import { productsForCraft, productById } from '@/lib/marketplace/creative-catalog'
import { CREATOR_AGREEMENT_VERSION } from '@/lib/marketplace/creator-agreement'
import { completeCreatorOnboarding } from './actions'

const PHASES = ['You', 'Skills', 'Profile', 'Work', 'Finish'] as const
const STYLE_TAGS = ['Bright', 'Moody', 'Minimal', 'Editorial', 'Warm', 'Bold', 'Natural light', 'Cinematic', 'Clean', 'Playful', 'Cozy', 'High-end'] as const

interface CData {
  name: string
  skills: string[]
  area: string
  bio: string
  styleTags: string[]
  links: string[]
  offerId: string
  offerCustomTitle: string
  price: string
  agreed: boolean
}
const INITIAL: CData = { name: '', skills: [], area: 'WA', bio: '', styleTags: [], links: ['', '', ''], offerId: '', offerCustomTitle: '', price: '', agreed: false }
const DRAFT_KEY = 'apnosh-creator-onboarding'

export default function CreatorOnboarding() {
  const router = useRouter()
  const [screen, setScreen] = useState(0)
  const [data, setData] = useState<CData>(INITIAL)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Restore / persist a local draft so an abandoned setup isn't lost.
  useEffect(() => {
    try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) setData({ ...INITIAL, ...JSON.parse(raw) }) } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)) } catch { /* ignore */ }
  }, [data])

  const set = <K extends keyof CData>(k: K, v: CData[K]) => setData((d) => ({ ...d, [k]: v }))
  const toggleSkill = (id: string) => setData((d) => ({ ...d, skills: d.skills.includes(id) ? d.skills.filter((x) => x !== id) : [...d.skills, id] }))
  const toggleTag = (t: string) => setData((d) => ({ ...d, styleTags: d.styleTags.includes(t) ? d.styleTags.filter((x) => x !== t) : [...d.styleTags, t] }))

  const areaTokens = data.area.split(',').map((s) => s.trim()).filter(Boolean)
  const priceNum = Number(data.price)
  const offerReady = data.offerId === '' || (priceNum > 0 && (data.offerId !== 'custom' || !!data.offerCustomTitle.trim()))
  const canContinue = [
    !!data.name.trim(),
    data.skills.length > 0 && areaTokens.length > 0,
    !!data.bio.trim(),
    offerReady,
    data.agreed,
  ][screen]

  // Products across the crafts the picked skills map to, plus a custom option.
  const offerProducts = [...new Set(categoriesForSkills(data.skills))].flatMap((c) => productsForCraft(c))

  async function finish() {
    setSubmitting(true); setError('')
    const offer = data.offerId
      ? {
          productId: data.offerId === 'custom' ? null : data.offerId,
          customTitle: data.offerId === 'custom' ? data.offerCustomTitle.trim() : '',
          category: data.offerId === 'custom' ? (categoriesForSkills(data.skills)[0] ?? 'other') : (productById(data.offerId)?.craft ?? 'other'),
          priceDollars: priceNum || 0,
        }
      : null
    const res = await completeCreatorOnboarding({
      name: data.name.trim(),
      skills: data.skills,
      serviceArea: areaTokens.map((s) => s.toUpperCase()),
      bio: data.bio.trim(),
      styleTags: data.styleTags,
      portfolioLinks: data.links.map((l) => l.trim()).filter(Boolean),
      offer,
      agreementVersion: CREATOR_AGREEMENT_VERSION,
    })
    if (!res.ok) { setError(res.error ?? 'Could not finish setup. Try again.'); setSubmitting(false); return }
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    router.push('/creator/storefront')
    router.refresh()
  }

  function goNext() { if (screen < PHASES.length - 1) setScreen((s) => s + 1); else finish() }
  function goBack() { if (screen > 0) setScreen((s) => s - 1); else router.push('/onboarding/full') }

  return (
    <div style={{ minHeight: '100dvh', background: '#fafafa', display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 460, margin: '0 auto', padding: '0 18px', flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        {/* progress */}
        <header style={{ paddingTop: 26, paddingBottom: 14 }}>
          <div style={{ height: 4, borderRadius: 99, background: '#ececec', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((screen + 1) / PHASES.length) * 100}%`, background: '#4abd98', borderRadius: 99, transition: 'width .3s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0f6e56', letterSpacing: '.02em' }}>{PHASES[screen]}</span>
            <span style={{ fontSize: 12, color: '#aaa' }}>Step {screen + 1} of {PHASES.length}</span>
          </div>
        </header>

        <main style={{ flex: 1, paddingBottom: 8 }}>
          {screen === 0 && (
            <>
              <Question title="What's your name?" subtitle="Your name or studio, however restaurants should see you" />
              <div className="mt-4"><Input value={data.name} onChange={(v) => set('name', v)} placeholder="Your name or studio" autoFocus /></div>
            </>
          )}

          {screen === 1 && (
            <>
              <Question title="What do you do?" subtitle="Pick everything you offer. You can sell across all of them." />
              <div className="grid grid-cols-2 gap-2.5 mt-4 mb-4">
                {CREATOR_SKILLS.map((s) => (
                  <OptionCard key={s.id} selected={data.skills.includes(s.id)} onClick={() => toggleSkill(s.id)}>
                    <div className="text-xl mb-1.5">{s.emoji}</div>
                    <div className="text-sm font-semibold mb-0.5" style={{ color: data.skills.includes(s.id) ? '#0f6e56' : '#111' }}>{s.label}</div>
                    <div className="text-xs leading-snug" style={{ color: '#999' }}>{s.desc}</div>
                  </OptionCard>
                ))}
              </div>
              <FieldLabel>Where you work (state codes)</FieldLabel>
              <Input value={data.area} onChange={(v) => set('area', v)} placeholder="WA" />
              <Hint>2-letter codes like WA or OR. Add a few with commas.</Hint>
            </>
          )}

          {screen === 2 && (
            <>
              <Question title="Tell restaurants about you" subtitle="A short bio in your voice, and the look of your work" />
              <div className="mt-4">
                <FieldLabel>Your bio</FieldLabel>
                <TextArea value={data.bio} onChange={(v) => set('bio', v)} placeholder="What you shoot, who you love working with, what makes your work yours." rows={4} />
              </div>
              <div className="mt-4">
                <FieldLabel>Your style (pick any)</FieldLabel>
                <ChipGroup options={STYLE_TAGS} selected={data.styleTags} onToggle={toggleTag} />
              </div>
            </>
          )}

          {screen === 3 && (
            <>
              <Question title="Your first offering" subtitle="Add one thing you sell and your price. You can add more later." />
              <div className="grid grid-cols-1 gap-2.5 mt-4 mb-3">
                {offerProducts.map((p) => (
                  <OptionCard key={p.id} selected={data.offerId === p.id} onClick={() => set('offerId', data.offerId === p.id ? '' : p.id)}>
                    <div className="text-sm font-semibold mb-0.5" style={{ color: data.offerId === p.id ? '#0f6e56' : '#111' }}>{p.name}</div>
                    <div className="text-xs leading-snug" style={{ color: '#999' }}>{p.summary}</div>
                  </OptionCard>
                ))}
                <OptionCard selected={data.offerId === 'custom'} onClick={() => set('offerId', data.offerId === 'custom' ? '' : 'custom')}>
                  <div className="text-sm font-semibold mb-0.5" style={{ color: data.offerId === 'custom' ? '#0f6e56' : '#111' }}>Something else</div>
                  <div className="text-xs leading-snug" style={{ color: '#999' }}>Name your own service</div>
                </OptionCard>
              </div>

              {data.offerId === 'custom' && (
                <div className="mb-3"><FieldLabel>What do you call it?</FieldLabel><Input value={data.offerCustomTitle} onChange={(v) => set('offerCustomTitle', v)} placeholder="e.g. Menu photo shoot" /></div>
              )}
              {data.offerId !== '' && (
                <div className="mb-4"><FieldLabel>Your starting price ($)</FieldLabel><Input value={data.price} onChange={(v) => set('price', v.replace(/[^0-9.]/g, ''))} placeholder="e.g. 400" type="text" /></div>
              )}

              <div className="mt-2">
                <FieldLabel>Links to your work (optional)</FieldLabel>
                {data.links.map((l, i) => (
                  <div key={i} className="mb-2">
                    <Input value={l} onChange={(v) => set('links', data.links.map((x, j) => (j === i ? v : x)))} placeholder="Instagram, site, or reel link" />
                  </div>
                ))}
              </div>
            </>
          )}

          {screen === 4 && (
            <>
              <Question title="You're almost in" subtitle="One last thing, then your creator workspace opens" />
              <div className="mt-4 rounded-[12px] p-4" style={{ background: 'white', border: '1.5px solid #eee' }}>
                <Recap label="Name" value={data.name.trim() || '—'} />
                <Recap label="Skills" value={data.skills.map((id) => CREATOR_SKILLS.find((s) => s.id === id)?.label).filter(Boolean).join(', ') || '—'} />
                <Recap label="Works in" value={areaTokens.map((s) => s.toUpperCase()).join(', ') || '—'} />
              </div>
              <label className="flex items-start gap-2 cursor-pointer mt-4">
                <input type="checkbox" checked={data.agreed} onChange={(e) => set('agreed', e.target.checked)} className="mt-0.5" />
                <span className="text-[12px] leading-relaxed" style={{ color: '#777' }}>
                  I agree to the{' '}
                  <Link href="/creator-terms" target="_blank" className="font-medium" style={{ color: '#0f6e56' }}>Creator Agreement</Link>
                  {' '}and{' '}
                  <Link href="/privacy" target="_blank" className="font-medium" style={{ color: '#0f6e56' }}>Privacy Policy</Link>.
                </span>
              </label>
              <Hint>New creators are reviewed before going live in the store. You can build your profile and packages right away.</Hint>
            </>
          )}

          {error && <div className="mt-4 text-[13px] rounded-[10px] px-3 py-2" style={{ background: '#fdeeee', border: '1px solid #f3c9c6', color: '#b3403a' }}>{error}</div>}
        </main>

        {/* nav */}
        <footer style={{ display: 'flex', gap: 10, padding: '12px 0 calc(18px + env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={goBack} disabled={submitting}
            className="rounded-[10px] px-5 py-3 text-[14px] font-medium transition-all"
            style={{ border: '1.5px solid #e0e0e0', background: 'white', color: '#555' }}>
            Back
          </button>
          <button type="button" onClick={goNext} disabled={!canContinue || submitting}
            className="flex-1 rounded-[10px] px-5 py-3 text-[14px] font-semibold transition-all"
            style={{ background: !canContinue || submitting ? '#bfe7da' : '#4abd98', color: 'white', cursor: !canContinue || submitting ? 'default' : 'pointer' }}>
            {submitting ? 'Setting up…' : screen === PHASES.length - 1 ? 'Finish setup' : 'Continue'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[12px]" style={{ color: '#999' }}>{label}</span>
      <span className="text-[13px] font-medium text-right" style={{ color: '#333' }}>{value}</span>
    </div>
  )
}
