'use client'

/**
 * Design Studio drawer — slide-over panel that hosts the Design Studio
 * panel content. Triggered from the top bar, accessible from any
 * section, doesn't take form space.
 */

import { X, Wand2 } from 'lucide-react'
import DesignStudioPanel from './design-studio-panel'
import type { Brand } from '@/lib/site-schemas/shared'

interface Props {
  brand: Brand
  businessContext: { displayName: string; tagline?: string; vertical: string }
  open: boolean
  onClose: () => void
  onApply: (patch: Partial<Brand>) => void
}

export default function DesignStudioDrawer({
  brand, businessContext, open, onClose, onApply,
}: Props) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 w-[520px] max-w-[90vw] bg-white border-l border-ink-6 shadow-2xl z-50 flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-ink-6 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold text-ink">Design Studio</h3>
              <p className="text-[11px] text-ink-3 mt-0.5">Generate, pick a preset, or fine-tune tokens. Live preview to your right.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <DesignStudioPanel
            brand={brand}
            businessContext={businessContext}
            onApply={onApply}
          />
        </div>
      </aside>
    </>
  )
}
