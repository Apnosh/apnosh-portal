'use client'

import { type ReactNode, useRef } from 'react'
import { type OnboardingData } from '../data'
import { Question, FieldLabel, Input } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  onLogoUpload: (file: File) => void
  onPhotosUpload: (files: FileList) => void
}

// Renders below Connect on the Launch screen, so this Question stays small:
// one hero per screen.
export default function StepAssets({ data, update, nav, onLogoUpload, onPhotosUpload }: Props) {
  const logoRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <Question small title="Brand materials" subtitle="All optional. Your designers use these to make work that looks like you. The more you add, the better and faster it gets." />
      <div className="mt-4 space-y-4">
        {/* Logo upload */}
        <button
          type="button"
          onClick={() => logoRef.current?.click()}
          className="w-full rounded-[14px] px-6 py-5 text-center transition-all cursor-pointer"
          style={{ border: '2px dashed #e6e6ea', background: '#f5f5f7' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4abd98'; e.currentTarget.style.background = '#eaf7f3' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e6e6ea'; e.currentTarget.style.background = '#f5f5f7' }}
        >
          <div className="text-sm font-medium" style={{ color: '#6e6e73' }}>Upload your logo</div>
          <div className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>PNG or SVG</div>
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
          <div className="text-[13px] font-medium" style={{ color: '#1c6b52' }}>
            ✓ {data.logo_name}
          </div>
        )}

        {/* Photos upload */}
        <button
          type="button"
          onClick={() => photosRef.current?.click()}
          className="w-full rounded-[14px] px-6 py-5 text-center transition-all cursor-pointer"
          style={{ border: '2px dashed #e6e6ea', background: '#f5f5f7' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4abd98'; e.currentTarget.style.background = '#eaf7f3' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e6e6ea'; e.currentTarget.style.background = '#f5f5f7' }}
        >
          <div className="text-sm font-medium" style={{ color: '#6e6e73' }}>Upload brand photos</div>
          <div className="text-xs mt-0.5" style={{ color: '#6e6e73' }}>Up to 20</div>
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
          <div className="text-[13px] font-medium" style={{ color: '#1c6b52' }}>
            ✓ {data.photo_count} photo{data.photo_count !== 1 ? 's' : ''}
          </div>
        )}

        {/* Brand colors */}
        <div>
          <FieldLabel>Brand colors</FieldLabel>
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
          <div className="text-[13px] mt-2" style={{ color: '#777' }}>
            No logo yet?{' '}
            <a href="/dashboard/requests?type=logo" target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: '#1c6b52' }}>
              Have one made →
            </a>
          </div>
        </div>

        {/* Brand links — as many as they have, stored newline-joined in
            brand_drive so every existing reader keeps working. */}
        <div>
          <FieldLabel>Brand links <span style={{ color: '#aeaeb2', fontWeight: 400 }}>(optional)</span></FieldLabel>
          {(data.brand_drive ? data.brand_drive.split('\n') : ['']).map((link, i, all) => (
            <div key={i} className="mb-2">
              <Input
                value={link}
                onChange={(v) => {
                  const next = [...all]; next[i] = v
                  update('brand_drive', next.filter((x, xi) => x.trim() || xi === next.length - 1).join('\n'))
                }}
                placeholder={i === 0 ? 'Google Drive, Dropbox, your site...' : 'Another link'}
                type="url"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => update('brand_drive', (data.brand_drive ? data.brand_drive + '\n' : '\n'))}
            className="text-[12.5px] font-semibold"
            style={{ background: 'none', border: 'none', color: '#1c6b52', cursor: 'pointer', padding: 0 }}
          >
            + Add another link
          </button>
        </div>
      </div>
      {nav}
    </>
  )
}
