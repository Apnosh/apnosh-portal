'use client'

import { useState, useRef, useEffect } from 'react'
import { MapPin, ChevronDown, Check } from 'lucide-react'
import { locationLabel, type ClientLocation } from '@/lib/dashboard/get-client-locations'

interface LocationSelectorProps {
  locations: ClientLocation[]
  selectedLocationId: string | null           // null = "All locations"
  onChange: (locationId: string | null) => void
  className?: string
}

/**
 * Dropdown that lets multi-location clients switch which location they're
 * viewing. Hidden entirely when the client has 0 or 1 locations.
 *
 * Controlled component -- parent owns the selected ID (typically via URL
 * searchParams) so selection survives reloads and is shareable via link.
 */
export default function LocationSelector({
  locations,
  selectedLocationId,
  onChange,
  className = '',
}: LocationSelectorProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Hide selector entirely when multi-location isn't relevant
  if (locations.length <= 1) return null

  const selected = selectedLocationId
    ? locations.find(l => l.id === selectedLocationId) ?? null
    : null

  const buttonLabel = selected ? locationLabel(selected) : 'All locations'

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 bg-white border border-ink-6 rounded-lg px-3 py-2 text-sm font-medium text-ink hover:border-ink-4 transition-colors"
      >
        <MapPin className="w-3.5 h-3.5 text-ink-4" />
        <span>{buttonLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[240px] bg-white border border-ink-6 rounded-lg shadow-lg overflow-hidden z-10">
          <button
            onClick={() => { onChange(null); setOpen(false) }}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-2 flex items-center justify-between ${selectedLocationId === null ? 'bg-brand-tint/30 text-brand-dark font-medium' : 'text-ink'}`}
          >
            <span className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-ink-4" />
              All locations
            </span>
            {selectedLocationId === null && <Check className="w-3.5 h-3.5 text-brand-dark" />}
          </button>
          <div className="h-px bg-ink-6/50" />
          {locations.map(loc => {
            const isSelected = selectedLocationId === loc.id
            const label = locationLabel(loc)
            const sublabel = loc.city && loc.state && label !== `${loc.city}, ${loc.state}`
              ? `${loc.city}, ${loc.state}`
              : null
            return (
              <button
                key={loc.id}
                onClick={() => { onChange(loc.id); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-2 flex items-center justify-between ${isSelected ? 'bg-brand-tint/30 text-brand-dark font-medium' : 'text-ink'}`}
              >
                <div className="min-w-0">
                  <div className="truncate">{label}{loc.is_primary ? ' · primary' : ''}</div>
                  {sublabel && (
                    <div className="text-[11px] text-ink-4 truncate">{sublabel}</div>
                  )}
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-brand-dark flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
