'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Save, Loader2, AlertTriangle, CheckCircle2, Plus, X,
  Utensils, GripVertical,
} from 'lucide-react'
import type { FoodMenu, MenuSection, MenuItem } from '@/lib/gbp-menu'
import ConnectEmptyState from '../connect-empty-state'

export default function MenuEditor() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [menus, setMenus] = useState<FoodMenu[]>([])
  const [original, setOriginal] = useState<FoodMenu[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [activeMenu, setActiveMenu] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const [menuRes, statusRes] = await Promise.all([
          fetch('/api/dashboard/listing/menu'),
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
        const data = body as { menus: FoodMenu[] }
        setMenus(data.menus)
        setOriginal(data.menus)
      } catch (err) {
        setLoadError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const hasChanges = JSON.stringify(menus) !== JSON.stringify(original)

  async function save() {
    if (!hasChanges) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/dashboard/listing/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menus }),
      })
      const body = await res.json()
      if (!res.ok) {
        setSaveError(body.error || `HTTP ${res.status}`)
        return
      }
      setSavedAt(Date.now())
      setOriginal(menus)
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
        <Link href="/dashboard/local-seo" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Local SEO
        </Link>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Couldn&rsquo;t load your menu</p>
            <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">{loadError}</p>
            <p className="text-xs text-amber-900/70 mt-2">
              Try clicking <strong>Sync now</strong> on Connected Accounts. If your listing has
              no menu set up on Google yet, you can create the first one below.
            </p>
            <button
              onClick={() => { setMenus([{ name: 'Main menu', sections: [] }]); setLoadError(null); setLoading(false) }}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand hover:bg-brand-dark"
            >
              <Plus className="w-3.5 h-3.5" />
              Start a new menu
            </button>
          </div>
        </div>
      </div>
    )
  }

  const current = menus[activeMenu]

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/local-seo" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Local SEO
        </Link>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center ring-1 ring-emerald-100">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink">Menu</h1>
            <p className="text-sm text-ink-3 mt-1">
              What customers see when they tap the Menu tab on your Google listing.
            </p>
          </div>
        </div>
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

      {/* Empty state */}
      {menus.length === 0 && (
        <div className="rounded-2xl border border-ink-6 bg-white p-8 text-center space-y-3">
          <Utensils className="w-8 h-8 text-ink-4 mx-auto" />
          <p className="text-sm font-medium text-ink">No menu yet</p>
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

      {/* Active menu */}
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
                      className="col-span-4 text-[13px] p-2 rounded-md border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                    <input
                      value={item.description ?? ''}
                      onChange={e => updateItem(activeMenu, secI, itemI, { description: e.target.value })}
                      placeholder="Description (optional)"
                      className="col-span-6 text-[13px] p-2 rounded-md border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
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
          {saving ? 'Saving…' : 'Save menu'}
        </button>
      </div>
    </div>
  )
}
