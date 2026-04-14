'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Camera, Scissors, ClipboardList, Clipboard, ClipboardCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateProductionField } from '@/lib/content-engine/actions'
import EditableField from '@/components/content-engine/editable-field'
import EditableList from '@/components/content-engine/editable-list'

interface ProductionItem {
  id: string
  concept_title: string
  content_type: string
  platform: string
  filming_batch: string | null
  script: string | null
  hook: string | null
  shot_list: Array<{ shot_number: number; description: string }> | null
  props: string[] | null
  location_notes: string | null
  music_direction: string | null
  estimated_duration: string | null
  caption: string | null
  hashtags: string[] | null
  editor_notes: string | null
  platform_specs: Record<string, string> | null
  scheduled_date: string
}

type ProdTab = 'filming' | 'editor' | 'props'

const BATCH_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-800 border-blue-200',
  B: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  C: 'bg-orange-100 text-orange-800 border-orange-200',
  D: 'bg-purple-100 text-purple-800 border-purple-200',
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-4 hover:text-ink transition-colors" title="Copy to clipboard">
      {copied ? <><ClipboardCheck className="w-3 h-3 text-brand" /> Copied</> : <><Clipboard className="w-3 h-3" /> {label ?? 'Copy'}</>}
    </button>
  )
}

export default function ProductionView({ cycleId, clientId }: { cycleId: string; clientId: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<ProductionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ProdTab>('filming')

  const saveField = async (itemId: string, field: string, value: unknown) => {
    await updateProductionField(itemId, field, value)
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, [field]: value } : i))
  }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('filming_batch').order('sort_order')
    setItems((data ?? []) as ProductionItem[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>
  if (items.length === 0) return <div className="text-center py-16 text-sm text-ink-3">No production items yet. Generate and approve briefs first.</div>

  // Group by batch
  const batches = new Map<string, ProductionItem[]>()
  for (const item of items) {
    const batch = item.filming_batch ?? 'Unassigned'
    if (!batches.has(batch)) batches.set(batch, [])
    batches.get(batch)!.push(item)
  }

  // Master prop list
  const allProps = new Map<string, Set<string>>()
  for (const item of items) {
    if (item.props) {
      const batch = item.filming_batch ?? 'Unassigned'
      if (!allProps.has(batch)) allProps.set(batch, new Set())
      for (const p of item.props) allProps.get(batch)!.add(p)
    }
  }

  const videoItems = items.filter((i) => ['reel', 'video', 'short_form_video'].includes(i.content_type) && i.script)

  const tabs: Array<{ key: ProdTab; label: string; icon: typeof Camera }> = [
    { key: 'filming', label: 'Filming Schedule', icon: Camera },
    { key: 'editor', label: 'Editor Packages', icon: Scissors },
    { key: 'props', label: 'Master Prop List', icon: ClipboardList },
  ]

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === t.key ? 'bg-ink text-white' : 'bg-bg-2 text-ink-3 hover:bg-ink-6'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Filming Schedule */}
      {tab === 'filming' && (
        <div className="space-y-6">
          {[...batches.entries()].map(([batch, batchItems]) => (
            <div key={batch}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-bold px-2 py-1 rounded border ${BATCH_COLORS[batch] ?? 'bg-ink-6 text-ink-3 border-ink-5'}`}>
                  Session {batch}
                </span>
                <span className="text-xs text-ink-3">{batchItems.length} items</span>
              </div>
              <div className="space-y-2">
                {batchItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl border border-ink-6 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink text-white capitalize">{item.content_type.replace('_', ' ')}</span>
                      <span className="text-sm font-semibold text-ink">{item.concept_title}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      <div>
                        <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Location</label>
                        <EditableField value={item.location_notes ?? ''} onSave={(v) => saveField(item.id, 'location_notes', v)} placeholder="Set location..." />
                      </div>
                      <div className="flex gap-4 text-xs text-ink-3">
                        {item.shot_list && <span>{item.shot_list.length} shots</span>}
                        {item.estimated_duration && <span>{item.estimated_duration}</span>}
                        {item.props && <span>{item.props.length} props</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Packages */}
      {tab === 'editor' && (
        <div className="space-y-4">
          {videoItems.length === 0 ? (
            <div className="text-center py-12 text-sm text-ink-3">No video content to edit.</div>
          ) : videoItems.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink text-white capitalize">{item.content_type.replace('_', ' ')}</span>
                <span className="text-xs text-ink-3">{item.platform} · {item.platform_specs?.aspect_ratio ?? '9:16'}</span>
                {item.estimated_duration && <span className="text-xs text-ink-3">· {item.estimated_duration}</span>}
              </div>
              <h3 className="text-sm font-bold text-ink mb-3">{item.concept_title}</h3>

              {item.script && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Script</span>
                    <CopyButton text={item.script} />
                  </div>
                  <pre className="text-xs text-ink-2 whitespace-pre-wrap mt-1 bg-bg-2 p-3 rounded-lg">{item.script}</pre>
                </div>
              )}

              {item.caption && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Caption</span>
                    <CopyButton text={item.caption} />
                  </div>
                  <pre className="text-xs text-ink-2 whitespace-pre-wrap mt-1">{item.caption}</pre>
                </div>
              )}

              {item.hashtags && item.hashtags.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Hashtags</span>
                    <CopyButton text={item.hashtags.join(' ')} />
                  </div>
                  <p className="text-xs text-ink-3">{item.hashtags.join(' ')}</p>
                </div>
              )}

              {item.music_direction && (
                <div className="mb-3">
                  <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Music</span>
                  <EditableField value={item.music_direction} onSave={(v) => saveField(item.id, 'music_direction', v)} displayClassName="text-xs text-ink-2" />
                </div>
              )}

              {item.editor_notes && (
                <div>
                  <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Editor Notes</span>
                  <EditableField value={item.editor_notes} onSave={(v) => saveField(item.id, 'editor_notes', v)} type="textarea" displayClassName="text-xs text-ink-2" rows={3} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Master Prop List */}
      {tab === 'props' && (
        <div className="space-y-4">
          {allProps.size === 0 ? (
            <div className="text-center py-12 text-sm text-ink-3">No props listed. Add props in the Briefs tab.</div>
          ) : [...allProps.entries()].map(([batch, props]) => (
            <div key={batch} className="bg-white rounded-xl border border-ink-6 p-4">
              <div className={`inline-block text-xs font-bold px-2 py-1 rounded border mb-3 ${BATCH_COLORS[batch] ?? 'bg-ink-6 text-ink-3 border-ink-5'}`}>
                Session {batch}
              </div>
              <EditableList
                items={[...props]}
                onSave={async () => { /* Props are per-item, this is a view only */ }}
                variant="checkboxes"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
