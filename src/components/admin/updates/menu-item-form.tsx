'use client'

/**
 * Menu item form for the unified updates system.
 *
 * Supports add / update / remove actions. For MVP this is announcement-
 * only: the update creates posts on Instagram / Facebook / GBP to tell
 * customers about the menu change. Future: a real menu_items table on
 * the location so the website's <Menu /> component can render the full
 * current menu from source of truth.
 */

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { MenuItemPayload } from '@/lib/updates/types'

interface Props {
  payload: MenuItemPayload
  onChange: (next: MenuItemPayload) => void
}

const COMMON_ALLERGENS = ['gluten', 'dairy', 'eggs', 'nuts', 'peanuts', 'soy', 'shellfish', 'fish', 'sesame']
const COMMON_DIETARY = ['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'keto', 'halal', 'kosher']

export default function MenuItemForm({ payload, onChange }: Props) {
  const setItem = (next: Partial<MenuItemPayload['item']>) => {
    onChange({ ...payload, item: { ...payload.item, ...next } })
  }

  return (
    <div>
      <label className="text-xs font-medium text-ink-3 block mb-2">Menu item</label>

      {/* Action toggle */}
      <div className="flex gap-2 mb-3">
        {(['add', 'update', 'remove'] as const).map(a => (
          <button
            key={a}
            type="button"
            onClick={() => onChange({ ...payload, action: a })}
            className={`flex-1 px-3 py-1.5 text-xs rounded-lg border capitalize transition-colors ${
              payload.action === a
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-ink-3 border-ink-5 hover:border-ink-4'
            }`}
          >
            {a === 'add' ? 'New item' : a === 'update' ? 'Update' : 'Remove'}
          </button>
        ))}
      </div>

      {/* Name + Price */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="col-span-2">
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Name</label>
          <input
            type="text"
            value={payload.item.name}
            placeholder="Spicy Tonkotsu Ramen"
            onChange={e => setItem({ name: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Price ($)</label>
          <input
            type="number"
            step="0.01"
            value={payload.item.price ? (payload.item.price / 100).toFixed(2) : ''}
            placeholder="14.50"
            onChange={e => setItem({ price: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
      </div>

      {/* Description */}
      <div className="mb-3">
        <label className="text-[10px] font-medium text-ink-3 block mb-1">Description</label>
        <textarea
          value={payload.item.description ?? ''}
          placeholder="Rich pork bone broth, house-made noodles, soft-boiled egg, charred bamboo..."
          rows={2}
          onChange={e => setItem({ description: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg resize-none"
        />
      </div>

      {/* Category + Availability */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Category</label>
          <input
            type="text"
            value={payload.item.category ?? ''}
            placeholder="Mains"
            onChange={e => setItem({ category: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Availability</label>
          <select
            value={payload.item.availability ?? 'always'}
            onChange={e => setItem({ availability: e.target.value as MenuItemPayload['item']['availability'] })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          >
            <option value="always">Always</option>
            <option value="lunch">Lunch only</option>
            <option value="dinner">Dinner only</option>
            <option value="limited_time">Limited time</option>
          </select>
        </div>
      </div>

      {/* LTO end date */}
      {payload.item.availability === 'limited_time' && (
        <div className="mb-3">
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Available until</label>
          <input
            type="date"
            value={payload.item.available_until?.slice(0, 10) ?? ''}
            onChange={e => setItem({ available_until: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
      )}

      {/* Photo URL */}
      <div className="mb-3">
        <label className="text-[10px] font-medium text-ink-3 block mb-1">Photo URL <span className="text-ink-4">(optional)</span></label>
        <input
          type="url"
          value={payload.item.photoUrl ?? ''}
          placeholder="https://..."
          onChange={e => setItem({ photoUrl: e.target.value || undefined })}
          className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
        />
      </div>

      {/* Allergens + Dietary tags */}
      <div className="grid grid-cols-2 gap-3">
        <TagPicker
          label="Allergens"
          options={COMMON_ALLERGENS}
          selected={payload.item.allergens ?? []}
          onChange={a => setItem({ allergens: a })}
        />
        <TagPicker
          label="Dietary"
          options={COMMON_DIETARY}
          selected={payload.item.dietary ?? []}
          onChange={d => setItem({ dietary: d })}
        />
      </div>
    </div>
  )
}

function TagPicker({
  label, options, selected, onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? options : options.slice(0, 5)
  return (
    <div>
      <label className="text-[10px] font-medium text-ink-3 block mb-1">{label}</label>
      <div className="flex flex-wrap gap-1">
        {visible.map(t => {
          const active = selected.includes(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(active ? selected.filter(x => x !== t) : [...selected, t])}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                active
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-ink-3 border-ink-5 hover:border-ink-4'
              }`}
            >
              {t.replace('_', ' ')}
              {active && <X className="inline w-2.5 h-2.5 ml-0.5" />}
            </button>
          )
        })}
        {!showAll && options.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="px-2 py-0.5 text-[10px] text-ink-3 hover:text-ink"
          >
            <Plus className="inline w-2.5 h-2.5" /> {options.length - 5} more
          </button>
        )}
      </div>
    </div>
  )
}
