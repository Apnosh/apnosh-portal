'use client'

/**
 * Internal notes card for the client overview sidebar.
 *
 * Auto-saves on blur. Replaces the Notes panel that used to live inside
 * the "Edit details" accordion -- admins need these notes visible by
 * default, not hidden behind an expand toggle.
 */

import { useEffect, useState } from 'react'
import { Loader2, StickyNote } from 'lucide-react'

interface Props {
  value: string | null
  onSave: (value: string | null) => Promise<void>
}

export default function NotesCard({ value, onSave }: Props) {
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  async function handleBlur() {
    const normalized = draft.trim() || null
    if (normalized === (value ?? null)) return
    setSaving(true)
    try {
      await onSave(normalized)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide inline-flex items-center gap-1.5">
          <StickyNote className="w-3 h-3" />
          Internal notes
          <span className="text-ink-5 font-normal normal-case tracking-normal text-[10px] ml-1">admin-only</span>
        </h3>
        {saving && (
          <span className="text-[10px] text-ink-4 inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving
          </span>
        )}
      </div>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleBlur}
        placeholder="Anything the team should know about this client that doesn't belong on an interaction log..."
        rows={4}
        className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none leading-relaxed"
      />
    </div>
  )
}
