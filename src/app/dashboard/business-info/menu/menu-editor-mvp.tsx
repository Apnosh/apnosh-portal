'use client'

/**
 * Mobile Menu editor on the menu_items table — the live source the website
 * renders from. Reuses the tested menu-actions (create/update/delete), each of
 * which fires the website deploy hook, so edits reach the site. Pushing the
 * same menu to Google's structured menu (gated v4 foodMenus) is a follow-up.
 */

import { useState } from 'react'
import { Plus, ChevronRight, Loader2, Trash2 } from 'lucide-react'
import {
  createMyMenuItem, updateMyMenuItem, deleteMyMenuItem, type MenuItem,
} from '@/lib/dashboard/menu-actions'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C, DISPLAY } from '@/components/mvp/mvp-detail'
import { EditorField, EditorTextArea, MvpToggle } from '../editor-shell'

interface Draft {
  id?: string
  category: string
  name: string
  price: string
  description: string
  isAvailable: boolean
  kind: 'item' | 'modifier'
}

function priceLabel(cents: number | null): string {
  if (cents == null) return ''
  return `$${(cents / 100).toFixed(2)}`
}

export default function MvpMenuEditor({ initial }: { initial: MenuItem[] }) {
  const [items, setItems] = useState<MenuItem[]>(initial)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categories = [...new Set(items.map(i => i.category))]

  function openNew() {
    setError(null)
    setEditing({ category: categories[0] ?? '', name: '', price: '', description: '', isAvailable: true, kind: 'item' })
  }
  function openEdit(it: MenuItem) {
    setError(null)
    setEditing({ id: it.id, category: it.category, name: it.name, price: it.priceCents != null ? (it.priceCents / 100).toFixed(2) : '', description: it.description ?? '', isAvailable: it.isAvailable, kind: it.kind })
  }

  async function saveDraft() {
    if (!editing) return
    const priceStr = editing.price.trim()
    if (priceStr && isNaN(Number(priceStr))) { setError('Enter a valid price, like 8.99'); return }
    setSaving(true); setError(null)
    const input = {
      category: editing.category.trim(),
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      priceCents: priceStr ? Math.round(Number(priceStr) * 100) : null,
      isAvailable: editing.isAvailable,
      kind: editing.kind,
    }
    try {
      if (editing.id) {
        const res = await updateMyMenuItem(editing.id, input)
        if (!res.success) { setError(res.error); return }
        setItems(prev => prev.map(i => (i.id === res.data.id ? res.data : i)))
      } else {
        const res = await createMyMenuItem(input)
        if (!res.success) { setError(res.error); return }
        setItems(prev => [...prev, res.data])
      }
      setEditing(null)
    } catch {
      setError('Could not save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function removeDraft() {
    if (!editing?.id) return
    if (!confirm(`Remove "${editing.name}" from your menu?`)) return
    setSaving(true); setError(null)
    try {
      const res = await deleteMyMenuItem(editing.id)
      if (!res.success) { setError(res.error); return }
      const removedId = editing.id
      setItems(prev => prev.filter(i => i.id !== removedId))
      setEditing(null)
    } catch {
      setError('Could not remove the item.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = !!editing && editing.name.trim().length > 0 && editing.category.trim().length > 0

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Menu" subtitle="What customers browse on your website. Edits publish to your site." backHref="/dashboard/business-info" backLabel="Business info" />}>
      <div style={{ background: C.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ flex: 1, padding: '14px 14px 12px' }}>
          {items.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px dashed rgba(74,189,152,0.32)', borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>No menu items yet</div>
              <div style={{ fontSize: 12.5, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>Add your dishes so customers can browse them on your website.</div>
            </div>
          ) : (
            categories.map(cat => (
              <div key={cat} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 6px 7px' }}>{cat}</div>
                <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                  {items.filter(i => i.category === cat).map((it, i) => (
                    <div key={it.id}>
                      {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 14 }} />}
                      <button type="button" onClick={() => openEdit(it)} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, opacity: it.isAvailable ? 1 : 0.5 }}>{it.name}{!it.isAvailable && <span style={{ fontSize: 12, fontWeight: 500, color: C.faint, marginLeft: 8 }}>Hidden</span>}</span>
                          {it.description && <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.description}</span>}
                        </span>
                        {it.priceCents != null && <span style={{ flexShrink: 0, fontSize: 14.5, fontWeight: 600, color: C.ink }}>{priceLabel(it.priceCents)}</span>}
                        <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `0.5px solid ${C.line}`, padding: '10px 14px calc(12px + env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={openNew} style={{ width: '100%', height: 48, borderRadius: 14, border: 'none', background: C.green, color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Plus size={18} /> Add item
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#fff', borderBottom: `0.5px solid ${C.line}` }}>
            <button type="button" onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: C.mute, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', padding: '4px 2px' }}>Cancel</button>
            <span style={{ fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: DISPLAY }}>{editing.id ? 'Edit item' : 'Add item'}</span>
            <button type="button" onClick={saveDraft} disabled={!canSave || saving} style={{ background: 'none', border: 'none', color: (!canSave || saving) ? C.faint : C.greenDk, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: (!canSave || saving) ? 'default' : 'pointer', padding: '4px 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving && <Loader2 size={15} className="mvp-spin" />}Save
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
            <EditorField label="Item name" value={editing.name} onChange={v => setEditing(e => e && { ...e, name: v })} placeholder="Spicy pork bulgogi" />
            <EditorField label="Price" value={editing.price} onChange={v => setEditing(e => e && { ...e, price: v })} placeholder="14.00" inputMode="decimal" hint="Leave blank to hide the price." />
            <EditorField label="Category" value={editing.category} onChange={v => setEditing(e => e && { ...e, category: v })} placeholder="Mains" hint="Group items under headings like Appetizers, Mains, Drinks." />
            <EditorTextArea label="Description" value={editing.description} onChange={v => setEditing(e => e && { ...e, description: v })} placeholder="What's in it, what makes it good..." rows={3} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <span style={{ flex: 1, fontSize: 15, color: C.ink }}>Show on your menu</span>
              <MvpToggle on={editing.isAvailable} onClick={() => setEditing(e => e && { ...e, isAvailable: !e.isAvailable })} label="Show on menu" />
            </div>

            {editing.id && (
              <button type="button" onClick={removeDraft} disabled={saving} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#fff', border: `1px solid ${C.coralSoft}`, borderRadius: 12, padding: '12px', fontSize: 14.5, fontWeight: 600, color: C.coral, fontFamily: 'inherit', cursor: 'pointer' }}>
                <Trash2 size={16} /> Remove item
              </button>
            )}

            {error && <p style={{ fontSize: 13, color: C.coral, textAlign: 'center', margin: '14px 4px 0' }}>{error}</p>}
          </div>
        </div>
      )}
    </MvpShell>
  )
}
