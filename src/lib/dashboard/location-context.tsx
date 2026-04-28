'use client'

/**
 * Per-client location selection that persists across pages.
 *
 * The dashboard supports clients with N locations (Yellow Bee plans 3 stores;
 * a chain might have 50). Most pages -- analytics, the manage-site editor,
 * update forms -- need to know "which location is the user looking at?"
 *
 * Storage layers:
 *   - URL searchParam ?location=<id>  -- shareable links, survives reload
 *   - localStorage  -- remembers last choice across sessions
 *   - In-memory state -- the live source of truth
 *
 * On mount we hydrate from URL first, then localStorage. On change we update
 * both. Pages that need the selection consume the hook and re-fetch as needed.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { ClientLocation } from './location-helpers'

interface LocationContextValue {
  locations: ClientLocation[]
  selectedLocationId: string | null              // null = "All locations"
  selectedLocation: ClientLocation | null
  setSelectedLocationId: (id: string | null) => void
  loading: boolean
}

const LocationContext = createContext<LocationContextValue>({
  locations: [],
  selectedLocationId: null,
  selectedLocation: null,
  setSelectedLocationId: () => {},
  loading: true,
})

const STORAGE_KEY_PREFIX = 'apnosh.selectedLocation:'

export function LocationProvider({
  clientId,
  locations,
  children,
}: {
  clientId: string | null
  locations: ClientLocation[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const storageKey = clientId ? `${STORAGE_KEY_PREFIX}${clientId}` : null

  // Hydrate selection from URL → localStorage → null (all locations)
  const [selectedLocationId, setSelectedLocationIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const fromUrl = searchParams.get('location')
    if (fromUrl) return fromUrl
    if (storageKey) {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) return stored
    }
    return null
  })

  const [loading, setLoading] = useState(true)

  // Validate the selection against the available locations on each change.
  // Stale IDs (e.g. a deleted location) should fall back to "all".
  useEffect(() => {
    if (selectedLocationId && !locations.some(l => l.id === selectedLocationId)) {
      setSelectedLocationIdState(null)
      if (storageKey) window.localStorage.removeItem(storageKey)
    }
    setLoading(false)
  }, [locations, selectedLocationId, storageKey])

  const setSelectedLocationId = useCallback((id: string | null) => {
    setSelectedLocationIdState(id)
    if (storageKey) {
      if (id) window.localStorage.setItem(storageKey, id)
      else window.localStorage.removeItem(storageKey)
    }
    // Reflect in URL so links stay shareable
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('location', id)
    else params.delete('location')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams, storageKey])

  const selectedLocation = selectedLocationId
    ? locations.find(l => l.id === selectedLocationId) ?? null
    : null

  return (
    <LocationContext.Provider
      value={{
        locations,
        selectedLocationId,
        selectedLocation,
        setSelectedLocationId,
        loading,
      }}
    >
      {children}
    </LocationContext.Provider>
  )
}

export function useLocationContext() {
  return useContext(LocationContext)
}
