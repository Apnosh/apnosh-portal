'use client'

/**
 * Menu management UI for the dashboard.
 *
 * Restaurants update menus constantly -- prices change, items rotate,
 * categories get reorganized. The previous flow required a change
 * request for every adjustment; this lets clients self-serve.
 *
 * Each row is a menu item OR modifier (sauces, toppings, milk options).
 * Modifiers render the same way -- some have prices (truffle oil +$2),
 * some don't.
 *
 * Save fires the deploy hook, so the customer site rebuilds within ~30s.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  UtensilsCrossed, Plus, Edit3, Trash2, Star, X, Loader2, CheckCircle2,
} from 'lucide-react'
import {
  createMyMenuItem, updateMyMenuItem, deleteMyMenuItem,
  type MenuItem, type MenuItemKind,
} from '@/lib/dashboard/menu-actions'

interface Props {
  initialItems: MenuItem[]
}

export default function MenuEditor({ initialItems }: Props) {
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const router = useRouter()

  // Group by category, preserving order from the server (which is by category alpha,
  // then display_order, then name).
  const byCategory = new Map<string, MenuItem[]>()
  for (const item of initialItems) {
    const arr = byCategory.get(item.category) ?? []
    arr.push(item)
    byCategory.set(item.category, arr)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[15px] font-bold text-ink flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-ink-3" /> Menu
          </h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Update prices, add items, mark featured. Changes go live on your site.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="px-3 py-1.5 rounded-md bg-ink text-white text-xs font-medium hover:bg-ink/90 inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add item
        </button>
      </div>

      {byCategory.size === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-6 bg-white p-6 text-center text-sm text-ink-3">
          No menu items yet. Add your first one to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(byCategory.entries()).map(([category, items]) => (
            <CategorySection key={category} category={category} items={items} onEdit={setEditing} />
          ))}
        </div>
      )}

      {editing && (
        <ItemModal
          item={editing === 'new' ? null : editing}
          existingCategories={Array.from(byCategory.keys())}
          onClose={() => setEditing(null)}
          onSaved={msg => {
            setEditing(null)
            setToast(msg)
            setTimeout(() => setToast(null), 6000)
            router.refresh()
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 bg-ink text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-sm"
        >
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          <span className="text-sm">{toast}</span>
        </div>
      )}
    </section>
  )
}

// ─── Category section ──────────────────────────────────────────────

function CategorySection({
  category, items, onEdit,
}: {
  category: string
  items: MenuItem[]
  onEdit: (item: MenuItem) => void
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-4 mb-2">
        {category}
        <span className="ml-2 font-normal text-ink-4 normal-case tracking-normal">
          ({items.length})
        </span>
      </h3>
      <ul className="rounded-xl border border-ink-6 bg-white divide-y divide-ink-6">
        {items.map(item => (
          <li key={item.id} className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-ink">{item.name}</span>
                {item.isFeatured && (
                  <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                    <Star className="w-2.5 h-2.5" /> Featured
                  </span>
                )}
                {item.kind === 'modifier' && (
                  <span className="text-[10px] uppercase tracking-wide text-ink-3 bg-bg-2 border border-ink-6 px-1.5 py-0.5 rounded">
                    Modifier
                  </span>
                )}
                {!item.isAvailable && (
                  <span className="text-[10px] uppercase tracking-wide text-ink-3 bg-bg-2 border border-ink-6 px-1.5 py-0.5 rounded">
                    Hidden
                  </span>
                )}
              </div>
              {item.description && (
                <p className="text-xs text-ink-3 mt-0.5">{item.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {item.priceCents !== null && (
                <span className="text-sm font-medium text-ink tabular-nums">
                  ${(item.priceCents / 100).toFixed(2).replace(/\.00$/, '')}
                </span>
              )}
              <button
                onClick={() => onEdit(item)}
                className="px-2.5 py-1.5 rounded-md border border-ink-6 text-xs font-medium hover:bg-bg-2 inline-flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" /> Edit
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Edit / create modal ───────────────────────────────────────────

function ItemModal({
  item, existingCategories, onClose, onSaved,
}: {
  item: MenuItem | null               // null = creating new
  existingCategories: string[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isNew = item === null
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState(item?.category ?? existingCategories[0] ?? '')
  const [kind, setKind] = useState<MenuItemKind>(item?.kind ?? 'item')
  const [description, setDescription] = useState(item?.description ?? '')
  const [priceDollars, setPriceDollars] = useState(
    item?.priceCents != null ? (item.priceCents / 100).toString() : '',
  )
  const [photoUrl, setPhotoUrl] = useState(item?.photoUrl ?? '')
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true)
  const [isFeatured, setIsFeatured] = useState(item?.isFeatured ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const canSave = name.trim() && category.trim() && !busy

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    const priceCents = priceDollars.trim()
      ? Math.round(parseFloat(priceDollars) * 100)
      : null

    const input = {
      name,
      category,
      kind,
      description: description.trim() || null,
      priceCents,
      photoUrl: photoUrl.trim() || null,
      isAvailable,
      isFeatured,
    }

    const res = isNew
      ? await createMyMenuItem(input)
      : await updateMyMenuItem(item!.id, input)
    setBusy(false)
    if (res.success) {
      startTransition(() => onSaved(`"${name}" ${isNew ? 'added' : 'updated'}.`))
    } else {
      setError(res.error)
    }
  }

  const handleDelete = async () => {
    if (!item || isNew) return
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    const res = await deleteMyMenuItem(item.id)
    setBusy(false)
    if (res.success) {
      startTransition(() => onSaved(`"${item.name}" removed.`))
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-6">
          <h3 className="text-base font-semibold text-ink">
            {isNew ? 'Add menu item' : `Edit ${item?.name}`}
          </h3>
          <button onClick={onClose} className="text-ink-3 hover:text-ink shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="The Traditional"
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
              autoFocus
            />
          </Field>

          <Field label="Category" hint="Group on the menu (Banh Mi, Boba, Sauces...)">
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              list="menu-categories"
              placeholder="Banh Mi"
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
            />
            <datalist id="menu-categories">
              {existingCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind" hint="Modifier = sauce, topping, milk option">
              <select
                value={kind}
                onChange={e => setKind(e.target.value as MenuItemKind)}
                className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
              >
                <option value="item">Item</option>
                <option value="modifier">Modifier</option>
              </select>
            </Field>

            <Field label="Price ($)" hint="Leave blank if no fixed price">
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceDollars}
                onChange={e => setPriceDollars(e.target.value)}
                placeholder="12.00"
                className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Pickled carrots, daikon, cilantro, jalapeño"
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Photo URL (optional)">
            <input
              type="url"
              value={photoUrl}
              onChange={e => setPhotoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
            />
          </Field>

          <div className="flex items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={e => setIsAvailable(e.target.checked)}
                className="rounded"
              />
              Available
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={e => setIsFeatured(e.target.checked)}
                className="rounded"
              />
              <Star className="w-3.5 h-3.5 text-amber-500" /> Featured
            </label>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-ink-6 bg-bg-2">
          {!isNew ? (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-md border border-ink-6 text-sm text-ink-3 hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-2 rounded-md bg-ink text-white text-sm font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {busy
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <CheckCircle2 className="w-4 h-4" />}
              {isNew ? 'Add item' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-3 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-ink-4 mt-1">{hint}</p>}
    </div>
  )
}
