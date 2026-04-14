'use client'

import { useState, useEffect } from 'react'
import { Camera, Scissors, Palette, Pen } from 'lucide-react'
import { getTeamMembers, getClientTeamDefaults, setClientTeamDefault } from '@/lib/content-engine/task-actions'

const ROLES = [
  { key: 'videographer', label: 'Videographer', icon: Camera },
  { key: 'editor', label: 'Editor', icon: Scissors },
  { key: 'designer', label: 'Designer', icon: Palette },
  { key: 'copywriter', label: 'Copywriter', icon: Pen },
]

interface TeamDefaultsSectionProps {
  clientId: string
}

export default function TeamDefaultsSection({ clientId }: TeamDefaultsSectionProps) {
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [defaults, setDefaults] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      getTeamMembers(),
      getClientTeamDefaults(clientId),
    ]).then(([members, defs]) => {
      setTeamMembers(members)
      const map: Record<string, string> = {}
      defs.forEach((d) => { map[d.role] = d.team_member_id })
      setDefaults(map)
      setLoaded(true)
    })
  }, [clientId])

  const handleChange = async (role: string, memberId: string) => {
    const val = memberId || null
    setDefaults((prev) => {
      const next = { ...prev }
      if (val) next[role] = val
      else delete next[role]
      return next
    })
    await setClientTeamDefault(clientId, role, val)
  }

  if (!loaded) return null

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-bold text-ink mb-1">Team Defaults</h3>
        <p className="text-[10px] text-ink-4">Auto-assign team members when new content is created.</p>
      </div>
      <div className="space-y-2">
        {ROLES.map(({ key, label, icon: Icon }) => {
          const membersForRole = teamMembers.filter((m) => m.role === key)
          return (
            <div key={key} className="flex items-center gap-3">
              <Icon className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
              <span className="text-xs font-medium text-ink w-24 flex-shrink-0">{label}</span>
              <select
                value={defaults[key] ?? ''}
                onChange={(e) => handleChange(key, e.target.value)}
                className="flex-1 text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="">Unassigned</option>
                {membersForRole.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
                {membersForRole.length === 0 && (
                  <option disabled>No {label.toLowerCase()}s in team</option>
                )}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
