'use client'

import { useEffect, useState } from 'react'
import {
  Save, Loader2, AlertTriangle, CheckCircle2, Plus, X,
  Utensils, GripVertical, ExternalLink, Info,
} from 'lucide-react'
import type { FoodMenu, MenuSection, MenuItem } from '@/lib/gbp-menu'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'
import { useClient } from '@/lib/client-context'
import ConnectEmptyState from '../connect-empty-state'

interface MenuApiResponse {
  menus: FoodMenu[]
  menuUrl: string
  structuredMenusAvailable: boolean
}

export default function MenuEditor() {
  const { client } = useClient()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [menus, setMenus] = useState<FoodMenu[]>([])
  const [menuUrl, setMenuUrl] = useState('')
  const [originalMenuUrl, setOriginalMenuUrl] = useState('')
  /* When false, the v4 API isn't available for this account yet —
     structured menu editor is hidden and only the URL field shows. */
  const [structuredAvailable, setStructuredAvailable] = useState(false)
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null)

  useEffect(() => {
    if (!client?.id) return
    getClientLocations(client.id).then(locs => {
      setLocations(locs)
      if (locs.length > 0 && !activeLocationId) {
        const primary = locs.find(l => l.is_primary) ?? locs[0]
        setActiveLocationId(primary.id)
      }
    }).catch(() => { /* leave empty */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id])
  const [original, setOriginal] = useState<FoodMenu[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [activeMenu, setActiveMenu] = useState(0)

  useEffect(() => {
    /* Defer fetching until we know which location to load. */
    if (locations.length > 1 && !activeLocationId) return
    async function load() {
      const q = activeLocationId ? `?locationId=${encodeURIComponent(activeLocationId)}` : ''
      setLoading(true)
      setLoadError(null)
      try {
        const [menuRes, statusRes] = await Promise.all([
          fetch(`/api/dashboard/listing/menu${q}`),
          fetch('/api/dashboard/gbp/status'),
        ])
        if (statusRes.ok) {
          const s = await statusRes.json() as { connected?: boolean }
          setConnected(s.connected !== false)
        }
        const body = await menuRes.json()
        if (!menuRes.ok) {
          setLoadError(body.error || `HTTP ${menuRes.status}`)
          return
        }
        const data = body as MenuApiResponse
        setMenus(data.menus)
        setOriginal(data.menus)
        setMenuUrl(data.menuUrl)
        setOriginalMenuUrl(data.menuUrl)
        setStructuredAvailable(data.structuredMenusAvailable)
      } catch (err) {
        setLoadError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [activeLocationId, locations.length])

  const hasMenuChanges = JSON.stringify(menus) !== JSON.stringify(original)
  const hasUrlChanges = menuUrl.trim() !== originalMenuUrl.trim()
  const hasChanges = hasMenuChanges || hasUrlChanges

  async function save() {
    if (!hasChanges) return
    setSaving(true)
    setSaveError(null)
    try {
      /* Always save the URL via v1. If structured editing is enabled
         and the user touched the menu, also save that via v4. */
      if (hasUrlChanges) {
        const res = await fetch('/api/dashboard/listing/menu', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ menuUrl, locationId: activeLocationId }),
        })
        const body = await res.json()
        if (!res.ok) {
          setSaveError(body.error || `HTTP ${res.status}`)
          return
        }
      }
      if (hasMenuChanges && structuredAvailable) {
        const res = await fetch('/api/dashboard/listing/menu', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ menus, locationId: activeLocationId }),
        })
        const body = await res.json()
        if (!res.ok) {
          setSaveError(body.error || `HTTP ${res.status}`)
          return
        }
      }
      setSavedAt(Date.now())
      setOriginal(menus)
      setOriginalMenuUrl(menuUrl)
      setTimeout(() => setSavedAt(s => (s && Date.now() - s >= 4000 ? null : s)), 4000)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function updateMenu(i: number, patch: Partial<FoodMenu>) {
    setMenus(prev => prev.map((m, j) => j === i ? { ...m, ...patch } : m))
  }

  function addMenu() {
    setMenus(prev => [...prev, { name: 'Untitled menu', sections: [] }])
    setActiveMenu(menus.length)
  }

  function removeMenu(i: number) {
    if (!confirm('Remove this entire menu? This is saved to your Google listing on Save.')) return
    setMenus(prev => prev.filter((_, j) => j !== i))
    setActiveMenu(0)
  }

  function addSection(menuI: number) {
    updateMenu(menuI, {
      sections: [
        ...(menus[menuI].sections),
        { name: 'New section', items: [] },
      ],
    })
  }

  function updateSection(menuI: number, secI: number, patch: Partial<MenuSection>) {
    updateMenu(menuI, {
      sections: menus[menuI].sections.map((s, j) => j === secI ? { ...s, ...patch } : s),
    })
  }

  function removeSection(menuI: number, secI: number) {
    updateMenu(menuI, {
      sections: menus[menuI].sections.filter((_, j) => j !== secI),
    })
  }

  function addItem(menuI: number, secI: number) {
    updateSection(menuI, secI, {
      items: [...menus[menuI].sections[secI].items, { name: '', description: '', price: '' }],
    })
  }

  function updateItem(menuI: number, secI: number, itemI: number, patch: Partial<MenuItem>) {
    updateSection(menuI, secI, {
      items: menus[menuI].sections[secI].items.map((it, k) => k === itemI ? { ...it, ...patch } : it),
    })
  }

  function removeItem(menuI: number, secI: number, itemI: number) {
    updateSection(menuI, secI, {
      items: menus[menuI].sections[secI].items.filter((_, k) => k !== itemI),
    })
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-ink-6 rounded" />
          <div className="h-12 bg-ink-6 rounded-xl" />
          <div className="h-32 bg-ink-6 rounded-xl" />
        </div>
      </div>
    )
  }

  if (loadError && connected === false) {
    return <ConnectEmptyState context="your menu" />
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* No back link -- sticky sub-nav has Overview */}
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Couldn&rsquo;t load your menu</p>
            <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">{loadError}</p>
          </div>
        </div>
      </div>
    )
  }

  const current = menus[activeMenu]

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-20 space-y-6">
      {/* Header -- matches the portal-wide page-title pattern */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Local SEO
          </p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
            <Utensils className="w-6 h-6 text-ink-4" />
            Menu
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">
            What customers see when they tap the Menu tab on your Google listing.
            {locations.length > 1 && (
              <span className="text-ink-4 text-xs"> · Editing one location at a time.</span>
            )}
          </p>
        </div>
        {locations.length > 1 && (
          <select
            value={activeLocationId ?? ''}
            onChange={e => setActiveLocationId(e.target.value || null)}
            className="text-[12px] font-medium text-ink-2 bg-white ring-1 ring-ink-6 hover:ring-ink-4 rounded-full px-3 py-1.5 focus:outline-none focus:ring-ink-3 flex-shrink-0"
          >
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.location_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Menu link — primary path, works without v4 approval. */}
      <div className="rounded-2xl border border-ink-6 bg-white p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Menu link</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Where the &ldquo;Menu&rdquo; button on your Google listing sends people. Most restaurants point this at their website&rsquo;s menu page or a PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={menuUrl}
            onChange={e => setMenuUrl(e.target.value)}
            placeholder="https://yourrestaurant.com/menu"
            className="flex-1 text-[13.5px] p-2.5 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {menuUrl.trim() && (
            <a
              href={menuUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink px-2 py-1.5"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Structured menu editor — only shows when v4 access is enabled.
         Until then, the URL above is the only menu surface. */}
      {!structuredAvailable && (
        <div className="rounded-2xl border border-ink-6 bg-bg-2/40 p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-ink-3 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-ink-2 leading-relaxed">
            <p className="font-semibold text-ink mb-0.5">Detailed menu items coming soon</p>
            <p className="text-ink-3">
              Building structured menus with sections, items, descriptions, and prices needs Google&rsquo;s legacy API, which is still being approved for your account. Until then, the menu link above is what customers see.
            </p>
          </div>
        </div>
      )}

      {structuredAvailable && (
        <>
          <div>
            <h2 className="text-sm font-semibold text-ink">Detailed menu</h2>
            <p className="text-xs text-ink-3 mt-0.5">Sections and items shown directly on the Menu tab.</p>
          </div>

          {/* Menu tabs (for restaurants with separate Lunch/Dinner menus) */}
          {menus.length > 0 && (
            <div className="flex items-center gap-1 border-b border-ink-6 overflow-x-auto">
              {menus.map((m, i) => (
                <button
                  key={i}
                  onClick={() => setActiveMenu(i)}
                  className={`relative px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                    i === activeMenu ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {m.name || 'Untitled menu'}
                  {i === activeMenu && (
                    <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand rounded-full" />
                  )}
                </button>
              ))}
              <button
                onClick={addMenu}
                className="ml-1 inline-flex items-center gap-1 px-2 py-1 text-[12px] text-ink-3 hover:text-ink"
              >
                <Plus className="w-3 h-3" />
                New menu
              </button>
            </div>
          )}

          {menus.length === 0 && (
            <div className="rounded-2xl border border-ink-6 bg-white p-8 text-center space-y-3">
              <Utensils className="w-8 h-8 text-ink-4 mx-auto" />
              <p className="text-sm font-medium text-ink">No detailed menu yet</p>
              <p className="text-xs text-ink-3 max-w-sm mx-auto">
                Add sections like Appetizers, Mains, Drinks — then items with prices.
              </p>
              <button
                onClick={addMenu}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark"
              >
                <Plus className="w-3.5 h-3.5" />
                Start a menu
              </button>
            </div>
          )}

          {current && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  value={current.name}
                  onChange={e => updateMenu(activeMenu, { name: e.target.value })}
                  placeholder="Menu name"
                  className="flex-1 text-lg font-semibold p-2 rounded-lg border border-transparent hover:border-ink-6 focus:border-ink-5 focus:outline-none focus:ring-2 focus:ring-brand/30 bg-transparent"
                />
                <button
                  onClick={() => removeMenu(activeMenu)}
                  className="text-[11px] text-ink-4 hover:text-rose-600"
                >
                  Delete menu
                </button>
              </div>

              {current.sections.map((section, secI) => (
                <div key={secI} className="rounded-2xl border border-ink-6 bg-white p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
                    <input
                      value={section.name}
                      onChange={e => updateSection(activeMenu, secI, { name: e.target.value })}
                      placeholder="Section name (e.g. Appetizers)"
                      className="flex-1 text-[14px] font-semibold p-1.5 rounded-md border border-transparent hover:border-ink-6 focus:border-ink-5 focus:outline-none focus:ring-2 focus:ring-brand/30 bg-transparent"
                    />
                    <button
                      onClick={() => removeSection(activeMenu, secI)}
                      className="text-ink-4 hover:text-rose-600"
                      title="Remove section"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {section.items.map((item, itemI) => (
                      <div key={itemI} className="grid grid-cols-12 gap-2 items-start">
                        <input
                          value={item.name}
                          onChange={e => updateItem(activeMenu, secI, itemI, { name: e.target.value })}
                          placeholder="Item name"
                          className="col-span-12 sm:col-span-4 text-[13px] p-2 rounded-md border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                        />
                        <input
                          value={item.description ?? ''}
                          onChange={e => updateItem(activeMenu, secI, itemI, { description: e.target.value })}
                          placeholder="Description (optional)"
                          className="col-span-10 sm:col-span-6 text-[13px] p-2 rounded-md border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                        />
                        <input
                          value={item.price ?? ''}
                          onChange={e => updateItem(activeMenu, secI, itemI, { price: e.target.value })}
                          placeholder="9.99"
                          inputMode="decimal"
                          className="col-span-1 text-[13px] p-2 rounded-md border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 text-right tabular-nums"
                        />
                        <button
                          onClick={() => removeItem(activeMenu, secI, itemI)}
                          className="col-span-1 text-ink-4 hover:text-rose-600 grid place-items-center pt-2.5"
                          title="Remove item"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addItem(activeMenu, secI)}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-dark hover:text-brand"
                    >
                      <Plus className="w-3 h-3" />
                      Add item
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={() => addSection(activeMenu)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-dashed border-ink-5 text-[12.5px] font-medium text-ink-3 hover:text-ink hover:border-ink-3"
              >
                <Plus className="w-3.5 h-3.5" />
                Add section
              </button>
            </div>
          )}
        </>
      )}

      {/* Sticky save bar */}
      <div className="sticky bottom-4 flex items-center justify-end gap-3 pt-2">
        {saveError && (
          <span className="text-xs text-rose-700 bg-white px-3 py-1.5 rounded-full ring-1 ring-rose-200">
            {saveError}
          </span>
        )}
        {savedAt && !saveError && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-white px-3 py-1.5 rounded-full ring-1 ring-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Saved to Google
          </span>
        )}
        <button
          onClick={save}
          disabled={!hasChanges || saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed shadow"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
