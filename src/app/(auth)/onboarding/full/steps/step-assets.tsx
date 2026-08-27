'use client'

import { type ReactNode, useRef } from 'react'
import { type OnboardingData } from '../data'
import { Question, FieldLabel, Input, Hint } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  onLogoUpload: (file: File) => void
  onPhotosUpload: (files: FileList) => void
}

export default function StepAssets({ data, update, nav, onLogoUpload, onPhotosUpload }: Props) {
  const logoRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <Question title="Got any brand materials?" subtitle="Logo, photos, colors, whatever you have. All optional. Just continue if nothing is handy, and add it anytime later. With these, the graphics we make match your brand from day one." />
      <div className="mt-4 space-y-4">
        {/* Logo upload */}
        <button
          type="button"
          onClick={() => logoRef.current?.click()}
          className="w-full rounded-[14px] px-6 py-5 text-center transition-all cursor-pointer"
          style={{ border: '2px dashed #e6e6ea', background: '#f5f5f7' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4abd98'; e.currentTarget.style.background = '#f0faf6' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e6e6ea'; e.currentTarget.style.background = '#f5f5f7' }}
        >
          <div className="text-sm font-medium" style={{ color: '#48484a' }}>Upload your logo</div>
          <div className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>PNG or SVG works best</div>
          <input
            ref={logoRef}
            type="file"
            accept=".png,.svg,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onLogoUpload(file)
            }}
          />
        </button>
        {!!data.logo_name && (
          <div className="text-[13px] font-medium" style={{ color: '#0f6e56' }}>
            ✓ {data.logo_name}
          </div>
        )}

        {/* Photos upload */}
        <button
          type="button"
          onClick={() => photosRef.current?.click()}
          className="w-full rounded-[14px] px-6 py-5 text-center transition-all cursor-pointer"
          style={{ border: '2px dashed #e6e6ea', background: '#f5f5f7' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4abd98'; e.currentTarget.style.background = '#f0faf6' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e6e6ea'; e.currentTarget.style.background = '#f5f5f7' }}
        >
          <div className="text-sm font-medium" style={{ color: '#48484a' }}>Upload brand photos</div>
          <div className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>Your space, products, team, up to 20</div>
          <input
            ref={photosRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) onPhotosUpload(e.target.files)
            }}
          />
        </button>
        {data.photo_count > 0 && (
          <div className="text-[13px] font-medium" style={{ color: '#0f6e56' }}>
            ✓ {data.photo_count} photo{data.photo_count !== 1 ? 's' : ''}
          </div>
        )}

        {/* Brand colors */}
        <div>
          <FieldLabel>Brand colors (optional)</FieldLabel>
          <div className="flex items-center gap-2.5 mb-3">
            <input
              type="color"
              value={data.color1 || '#ffffff'}
              onChange={(e) => update('color1', e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer flex-shrink-0 p-0"
              style={{ border: '1.5px solid #e6e6ea' }}
            />
            <Input
              value={data.color1}
              onChange={(v) => update('color1', v)}
              placeholder="Primary color hex"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="color"
              value={data.color2 || '#ffffff'}
              onChange={(e) => update('color2', e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer flex-shrink-0 p-0"
              style={{ border: '1.5px solid #e6e6ea' }}
            />
            <Input
              value={data.color2}
              onChange={(v) => update('color2', v)}
              placeholder="Secondary color hex"
            />
          </div>
          <Hint>Don't know your colors? No worries, we'll figure it out.</Hint>
          <div className="text-[13px] mt-2" style={{ color: '#777' }}>
            No logo yet?{' '}
            <a href="/dashboard/requests?type=logo" target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: '#0f6e56' }}>
              Have one made →
            </a>
          </div>
        </div>

        {/* Brand drive */}
        <div>
          <FieldLabel>Have a shared drive or folder with brand materials?</FieldLabel>
          <Input
            value={data.brand_drive}
            onChange={(v) => update('brand_drive', v)}
            placeholder="Paste a Google Drive, Dropbox, or any link"
          />
          <Hint>If you have logos, photos, guidelines, or fonts stored somewhere, drop the link here and we'll grab what we need.</Hint>
        </div>
      </div>
      {nav}
    </>
  )
}
