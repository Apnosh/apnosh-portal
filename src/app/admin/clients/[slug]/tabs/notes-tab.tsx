'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Save, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import type { AmClientNote } from '@/types/database'

export default function NotesTab({ clientId }: { clientId: string }) {
  const supabase = createClient()

  const [notes, setNotes] = useState<AmClientNote[]>([])
  const [loading, setLoading] = useState(true)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('am_client_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    setNotes((data ?? []) as AmClientNote[])
    // Pre-fill editor with the latest note
    if (data && data.length > 0 && !activeNoteId) {
      setEditText(data[0].note_text)
      setActiveNoteId(data[0].id)
    }
    setLoading(false)
  }, [clientId, supabase, activeNoteId])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['am_client_notes'] as never[], load)

  async function handleSave() {
    setSaving(true)
    if (activeNoteId) {
      // Update existing
      await supabase
        .from('am_client_notes')
        .update({ note_text: editText.trim(), updated_at: new Date().toISOString() })
        .eq('id', activeNoteId)
    } else {
      // Resolve team_member_id for current user
      const { data: { user } } = await supabase.auth.getUser()
      let teamMemberId: string | null = null
      if (user) {
        const { data: tm } = await supabase
          .from('team_members')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        teamMemberId = tm?.id ?? null
      }

      const { data: inserted } = await supabase
        .from('am_client_notes')
        .insert({
          client_id: clientId,
          note_text: editText.trim(),
          created_by: teamMemberId,
        })
        .select('id')
        .single()

      if (inserted) setActiveNoteId(inserted.id)
    }
    setSaving(false)
    load()
  }

  async function handleNew() {
    setActiveNoteId(null)
    setEditText('')
  }

  async function handleDelete(id: string) {
    await supabase.from('am_client_notes').delete().eq('id', id)
    if (activeNoteId === id) { setActiveNoteId(null); setEditText('') }
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Account Manager Notes</h2>
          <p className="text-xs text-ink-4 mt-0.5">
            The latest note is shown on the client&apos;s Social Overview page.
          </p>
        </div>
        <button
          onClick={handleNew}
          className="text-xs text-brand hover:text-brand-dark font-medium flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> New note
        </button>
      </div>

      {/* Editor */}
      <div className="bg-white rounded-xl border border-ink-6 p-4 space-y-3">
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          placeholder="Write a note that the client will see on their Social Media overview..."
          rows={5}
          className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-ink-4">
            {activeNoteId ? 'Editing existing note' : 'Creating new note'}
          </p>
          <button
            onClick={handleSave}
            disabled={saving || !editText.trim()}
            className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-4 py-1.5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Past notes */}
      {notes.length > 0 && (
        <div>
          <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2">Previous notes</h3>
          <div className="space-y-2">
            {notes.map(note => (
              <div
                key={note.id}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
                  activeNoteId === note.id ? 'border-brand/40 ring-1 ring-brand/20' : 'border-ink-6 hover:border-ink-5'
                }`}
                onClick={() => { setActiveNoteId(note.id); setEditText(note.note_text) }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-2 line-clamp-2">{note.note_text}</p>
                    <p className="text-[10px] text-ink-4 mt-1">
                      {new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(note.id) }}
                    className="text-ink-4 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-ink-4 animate-spin" />
        </div>
      )}
    </div>
  )
}
