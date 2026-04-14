'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Check, BarChart3, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface NoteState {
  text: string
  lastUpdated: string | null
  saving: boolean
  saved: boolean
}

export default function DashboardNotesTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [visibility, setVisibility] = useState<NoteState>({ text: '', lastUpdated: null, saving: false, saved: false })
  const [footTraffic, setFootTraffic] = useState<NoteState>({ text: '', lastUpdated: null, saving: false, saved: false })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('am_notes')
      .select('view_type, note_text, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (data) {
      const vis = data.find((r) => r.view_type === 'visibility')
      const ft = data.find((r) => r.view_type === 'foot_traffic')
      if (vis) setVisibility((s) => ({ ...s, text: vis.note_text, lastUpdated: vis.created_at }))
      if (ft) setFootTraffic((s) => ({ ...s, text: ft.note_text, lastUpdated: ft.created_at }))
    }
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  const handleSave = async (viewType: 'visibility' | 'foot_traffic') => {
    const state = viewType === 'visibility' ? visibility : footTraffic
    const setState = viewType === 'visibility' ? setVisibility : setFootTraffic
    if (!state.text.trim()) return

    setState((s) => ({ ...s, saving: true }))

    // Get current admin user info
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    const fullName = profile?.full_name || 'Admin'
    const initials = fullName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

    await supabase.from('am_notes').insert({
      client_id: clientId,
      am_user_id: user.id,
      am_name: fullName,
      am_initials: initials,
      view_type: viewType,
      note_text: state.text.trim(),
    })

    setState((s) => ({
      ...s,
      saving: false,
      saved: true,
      lastUpdated: new Date().toISOString(),
    }))
    setTimeout(() => setState((s) => ({ ...s, saved: false })), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-ink-6 rounded-xl animate-pulse" />
        <div className="h-32 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-ink mb-1">Dashboard Notes</h3>
        <p className="text-xs text-ink-3">
          These notes appear on the client's dashboard overview. One per view.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Visibility note */}
        <NoteCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Visibility view"
          state={visibility}
          onChange={(text) => setVisibility((s) => ({ ...s, text }))}
          onSave={() => handleSave('visibility')}
        />

        {/* Foot Traffic note */}
        <NoteCard
          icon={<MapPin className="w-4 h-4" />}
          label="Foot Traffic view"
          state={footTraffic}
          onChange={(text) => setFootTraffic((s) => ({ ...s, text }))}
          onSave={() => handleSave('foot_traffic')}
        />
      </div>
    </div>
  )
}

function NoteCard({
  icon,
  label,
  state,
  onChange,
  onSave,
}: {
  icon: React.ReactNode
  label: string
  state: NoteState
  onChange: (text: string) => void
  onSave: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-ink-3">{icon}</div>
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">{label}</span>
      </div>

      <textarea
        value={state.text}
        onChange={(e) => onChange(e.target.value)}
        maxLength={300}
        rows={4}
        placeholder="Write a note for the client's dashboard..."
        className="w-full text-sm text-ink rounded-lg border border-ink-6 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
      />

      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-ink-4">
          {state.text.length}/300
          {state.lastUpdated && (
            <> &middot; Last saved {new Date(state.lastUpdated).toLocaleDateString()}</>
          )}
        </span>
        <button
          onClick={onSave}
          disabled={state.saving || !state.text.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-white hover:bg-ink-2 transition-colors disabled:opacity-40"
        >
          {state.saved ? (
            <><Check className="w-3 h-3" /> Saved</>
          ) : state.saving ? (
            'Saving...'
          ) : (
            <><Save className="w-3 h-3" /> Save</>
          )}
        </button>
      </div>
    </div>
  )
}
