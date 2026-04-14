'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

// Shared form components used by reel, feed post, carousel, and story forms

export function FormSection({ title, subtitle, children, collapsible, defaultOpen = true, summary }: {
  title: string; subtitle?: string; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean; summary?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (!collapsible) {
    return (
      <div className="border-b border-ink-6 pb-5 last:border-0 last:pb-0">
        <div className="mb-3">
          <h3 className="text-[11px] font-bold text-ink uppercase tracking-wider">{title}</h3>
          {subtitle && <p className="text-[9px] text-ink-4 mt-0.5">{subtitle}</p>}
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    )
  }

  return (
    <div className="border-b border-ink-6 pb-5 last:border-0 last:pb-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 mb-3 group text-left"
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-ink-4 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-ink-4 flex-shrink-0" />
        }
        <h3 className="text-[11px] font-bold text-ink uppercase tracking-wider">{title}</h3>
        {!open && summary && <span className="text-[10px] text-ink-4 font-normal normal-case tracking-normal truncate">{summary}</span>}
      </button>
      {subtitle && open && <p className="text-[9px] text-ink-4 mt-0.5 mb-3 ml-5">{subtitle}</p>}
      {open && <div className="space-y-3">{children}</div>}
    </div>
  )
}

export function Field({ label, value, onChange, placeholder, type, multiline, rows, charCount }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; multiline?: boolean; rows?: number; charCount?: boolean
}) {
  return (
    <div>
      {label && <label className="text-[10px] text-ink-4 block mb-1">{label}</label>}
      {multiline ? (
        <div>
          <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? 3} className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30" />
          {charCount && value && <span className="text-[9px] text-ink-4">{value.length} chars</span>}
        </div>
      ) : (
        <input type={type ?? 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" />
      )}
    </div>
  )
}

export function ChipSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      {label && <label className="text-[10px] text-ink-4 block mb-1.5">{label}</label>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${value === o ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{o}</button>
        ))}
      </div>
    </div>
  )
}

export function ChipMulti({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      {label && <label className="text-[10px] text-ink-4 block mb-1.5">{label}</label>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${value.includes(o) ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{o}</button>
        ))}
      </div>
    </div>
  )
}
