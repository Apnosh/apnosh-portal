'use client'

import { useState } from 'react'
import {
  X, Camera, MapPin, Users, Shirt, Wrench, Check, Clock,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { advanceStage } from '@/lib/content-engine/task-actions'

interface ContentItem { id: string; [key: string]: unknown }

const s = (val: unknown): string => (val as string) ?? ''

interface FilmingDayPanelProps {
  date: string
  items: ContentItem[]
  onClose: () => void
  onStageUpdate: (itemId: string, field: string, value: string) => void
}

export default function FilmingDayPanel({ date, items, onClose, onStageUpdate }: FilmingDayPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id ?? null)

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // Master prep lists (deduplicated)
  const allProps = new Set<string>()
  const allLocations = new Set<string>()
  const allPeople = new Set<string>()
  const allWardrobe: string[] = []
  const allEquipment = new Set<string>()

  items.forEach((item) => {
    const props = (item.props as string[]) ?? []
    props.forEach((p) => allProps.add(p))
    if (s(item.location_notes)) allLocations.add(s(item.location_notes))
    if (s(item.who_on_camera)) allPeople.add(s(item.who_on_camera))
    if (s(item.wardrobe_notes)) allWardrobe.push(`${s(item.who_on_camera) || 'TBD'}: ${s(item.wardrobe_notes)}`)
    if (s(item.equipment_notes)) allEquipment.add(s(item.equipment_notes))
  })

  const handleMarkFilmed = async (itemId: string) => {
    const result = await advanceStage(itemId, 'filming', 'filmed')
    if (result.success) onStageUpdate(itemId, 'filming_status', 'filmed')
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-lg overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-ink-6 bg-orange-50">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Camera className="w-4 h-4 text-orange-600" />
              <h2 className="text-sm font-bold text-ink">Filming Session</h2>
            </div>
            <p className="text-xs text-ink-3">{dateLabel}</p>
            <p className="text-[10px] text-ink-4 mt-0.5">{items.length} video{items.length !== 1 ? 's' : ''} &middot; Est. ~{Math.ceil(items.length * 0.6)} hours</p>
          </div>
          <button onClick={onClose} className="p-1 text-ink-4 hover:text-ink rounded-lg hover:bg-bg-2"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Master prep list */}
        <div className="bg-bg-2 rounded-lg p-3 space-y-2">
          <h3 className="text-[10px] font-bold text-ink-3 uppercase tracking-wider">Master Prep List</h3>

          {allProps.size > 0 && (
            <PrepRow icon={<Wrench className="w-3 h-3" />} label="Props & products">
              {[...allProps].map((p) => (<span key={p} className="text-[10px] bg-white text-ink-2 px-2 py-0.5 rounded border border-ink-6">{p}</span>))}
            </PrepRow>
          )}

          {allLocations.size > 0 && (
            <PrepRow icon={<MapPin className="w-3 h-3" />} label="Locations">
              {[...allLocations].map((l) => (<span key={l} className="text-xs text-ink-2">{l}</span>))}
            </PrepRow>
          )}

          {allPeople.size > 0 && (
            <PrepRow icon={<Users className="w-3 h-3" />} label="On camera">
              {[...allPeople].map((p) => (<span key={p} className="text-xs text-ink-2">{p}</span>))}
            </PrepRow>
          )}

          {allWardrobe.length > 0 && (
            <PrepRow icon={<Shirt className="w-3 h-3" />} label="Wardrobe">
              {allWardrobe.map((w, i) => (<span key={i} className="text-xs text-ink-2">{w}</span>))}
            </PrepRow>
          )}

          {allEquipment.size > 0 && (
            <PrepRow icon={<Wrench className="w-3 h-3" />} label="Equipment">
              {[...allEquipment].map((e) => (<span key={e} className="text-xs text-ink-2">{e}</span>))}
            </PrepRow>
          )}

          {allProps.size === 0 && allLocations.size === 0 && allPeople.size === 0 && (
            <p className="text-[10px] text-ink-4 italic">No prep details set yet. Add them in Content Details.</p>
          )}
        </div>

        {/* Filming order */}
        <div>
          <h3 className="text-[10px] font-bold text-ink-3 uppercase tracking-wider mb-2">Filming Order</h3>
          <div className="space-y-2">
            {items.map((item, idx) => {
              const isExpanded = expandedId === item.id
              const isFilmed = s(item.filming_status) === 'filmed'
              const beats = (item.script_beats as Array<{ beat_number: number; visual: string; audio_text: string }>) ?? []
              const framework = s(item.script_framework)

              return (
                <div key={item.id} className={`rounded-lg border ${isFilmed ? 'border-emerald-200 bg-emerald-50/50' : 'border-ink-6 bg-white'}`}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="text-[10px] font-bold text-ink-3 w-4 flex-shrink-0">{idx + 1}</span>
                    {isFilmed ? <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                    <span className="text-xs font-semibold text-ink flex-1 truncate">{s(item.concept_title)}</span>
                    {framework && <span className="text-[9px] text-ink-4 bg-bg-2 px-1.5 py-0.5 rounded capitalize">{framework.replace(/_/g, ' ')}</span>}
                    {!!item.estimated_duration && <span className="text-[9px] text-ink-4">{s(item.estimated_duration)}</span>}
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-ink-4" /> : <ChevronRight className="w-3 h-3 text-ink-4" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t border-ink-6/50 pt-2">
                      {/* Hooks */}
                      {!!(item.visual_hook || item.audio_hook || item.hook) && (
                        <div className="bg-brand-tint/30 rounded-lg p-2.5 border-l-[3px] border-l-brand">
                          {!!item.visual_hook && <p className="text-xs"><strong className="text-ink-3">Visual:</strong> {s(item.visual_hook)}</p>}
                          {!!(item.audio_hook || item.hook) && <p className="text-xs"><strong className="text-ink-3">Audio:</strong> {s(item.audio_hook || item.hook)}</p>}
                        </div>
                      )}

                      {/* Script beats */}
                      {beats.length > 0 && (
                        <div>
                          <label className="text-[9px] text-ink-4 font-semibold uppercase tracking-wider block mb-1">Script</label>
                          <div className="space-y-1">
                            {beats.map((b) => (
                              <div key={b.beat_number} className="flex gap-2 text-xs">
                                <span className="font-bold text-ink-3 w-4 text-right flex-shrink-0">#{b.beat_number}</span>
                                <span className="font-medium text-ink flex-1">{b.visual}</span>
                                <span className="text-ink-4 flex-1">{b.audio_text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Free-form script */}
                      {!beats.length && !!item.script && (
                        <div>
                          <label className="text-[9px] text-ink-4 font-semibold uppercase tracking-wider block mb-1">Script</label>
                          <pre className="text-xs text-ink-2 whitespace-pre-wrap bg-bg-2 rounded p-2">{s(item.script)}</pre>
                        </div>
                      )}

                      {/* Props for this video */}
                      {(item.props as string[])?.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] text-ink-4">Props:</span>
                          {(item.props as string[]).map((p) => (<span key={p} className="text-[10px] bg-bg-2 px-1.5 py-0.5 rounded">{p}</span>))}
                        </div>
                      )}

                      {/* Mark as filmed */}
                      {!isFilmed && (
                        <button
                          onClick={() => handleMarkFilmed(item.id)}
                          className="w-full text-xs font-semibold text-white bg-brand px-3 py-2 rounded-lg hover:bg-brand-dark transition-colors"
                        >
                          Mark as filmed
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function PrepRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-ink-4">{icon}</span>
        <span className="text-[9px] font-semibold text-ink-4 uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1 ml-5">{children}</div>
    </div>
  )
}
