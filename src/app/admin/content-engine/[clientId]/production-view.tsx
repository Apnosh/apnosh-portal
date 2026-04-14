'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Camera, Scissors, ClipboardList, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ProductionItem {
  id: string
  concept_title: string
  content_type: string
  platform: string
  filming_batch: string | null
  script: string | null
  hook: string | null
  shot_list: Array<{ shot_number: number; description: string; setup_notes: string; angle: string }> | null
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

export default function ProductionView({ cycleId, clientId }: { cycleId: string; clientId: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<ProductionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ProdTab>('filming')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('filming_batch', { ascending: true })
      .order('sort_order', { ascending: true })
    setItems((data ?? []) as ProductionItem[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>
  }

  if (items.length === 0) {
    return <div className="text-center py-16 text-sm text-ink-3">No production items yet. Generate and approve briefs first.</div>
  }

  // Group by filming batch
  const batches = new Map<string, ProductionItem[]>()
  for (const item of items) {
    const batch = item.filming_batch ?? 'Unassigned'
    if (!batches.has(batch)) batches.set(batch, [])
    batches.get(batch)!.push(item)
  }

  // Master prop list — deduplicated
  const allProps = new Map<string, Set<string>>()
  for (const item of items) {
    if (item.props) {
      const batch = item.filming_batch ?? 'Unassigned'
      if (!allProps.has(batch)) allProps.set(batch, new Set())
      for (const p of item.props) allProps.get(batch)!.add(p)
    }
  }

  const videoItems = items.filter((i) => i.content_type === 'reel' && i.script)

  const tabs: Array<{ key: ProdTab; label: string; icon: typeof Camera }> = [
    { key: 'filming', label: 'Filming Schedule', icon: Camera },
    { key: 'editor', label: 'Editor Packages', icon: Scissors },
    { key: 'props', label: 'Master Prop List', icon: ClipboardList },
  ]

  return (
    <div className="space-y-5">
      {/* Tab selector */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              tab === t.key ? 'bg-ink text-white' : 'bg-bg-2 text-ink-3 hover:bg-ink-6'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
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
                <span className="text-xs text-ink-3">
                  {batchItems.length} item{batchItems.length > 1 ? 's' : ''}
                  {batchItems[0]?.location_notes && ` · ${batchItems[0].location_notes.split('.')[0]}`}
                </span>
              </div>
              <div className="space-y-2">
                {batchItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl border border-ink-6 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink text-white capitalize">
                        {item.content_type.replace('_', ' ')}
                      </span>
                      <span className="text-sm font-semibold text-ink">{item.concept_title}</span>
                    </div>
                    {item.script && (
                      <p className="text-xs text-ink-3 mb-2 line-clamp-2">
                        {item.script.split('\n').slice(0, 2).join(' ')}
                      </p>
                    )}
                    <div className="flex gap-4 text-[10px] text-ink-4">
                      {item.shot_list && <span>{item.shot_list.length} shots</span>}
                      {item.estimated_duration && <span>{item.estimated_duration}</span>}
                      {item.props && <span>{item.props.length} props</span>}
                      {item.location_notes && <span>{item.location_notes.split('.')[0]}</span>}
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
          ) : (
            videoItems.map((item) => (
              <div key={item.id} className="bg-white rounded-xl border border-ink-6 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink text-white capitalize">
                    {item.content_type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-ink-3">{item.platform} · {item.platform_specs?.aspect_ratio ?? '9:16'}</span>
                  {item.estimated_duration && <span className="text-xs text-ink-3">· {item.estimated_duration}</span>}
                </div>
                <h3 className="text-sm font-bold text-ink mb-3">{item.concept_title}</h3>

                {item.script && (
                  <div className="mb-3">
                    <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Script</span>
                    <pre className="text-xs text-ink-2 whitespace-pre-wrap mt-1 bg-bg-2 p-3 rounded-lg">{item.script}</pre>
                  </div>
                )}

                {item.music_direction && (
                  <div className="mb-3">
                    <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Music Direction</span>
                    <p className="text-xs text-ink-2 mt-1">{item.music_direction}</p>
                  </div>
                )}

                {item.editor_notes && (
                  <div className="mb-3">
                    <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Editor Notes</span>
                    <p className="text-xs text-ink-2 mt-1">{item.editor_notes}</p>
                  </div>
                )}

                {item.caption && (
                  <div className="mb-3">
                    <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Caption</span>
                    <pre className="text-xs text-ink-2 whitespace-pre-wrap mt-1">{item.caption}</pre>
                  </div>
                )}

                {item.hashtags && item.hashtags.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Hashtags</span>
                    <p className="text-xs text-ink-3 mt-1">{item.hashtags.join(' ')}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Master Prop List */}
      {tab === 'props' && (
        <div className="space-y-4">
          {allProps.size === 0 ? (
            <div className="text-center py-12 text-sm text-ink-3">No props listed.</div>
          ) : (
            [...allProps.entries()].map(([batch, props]) => (
              <div key={batch} className="bg-white rounded-xl border border-ink-6 p-4">
                <div className={`inline-block text-xs font-bold px-2 py-1 rounded border mb-3 ${BATCH_COLORS[batch] ?? 'bg-ink-6 text-ink-3 border-ink-5'}`}>
                  Session {batch}
                </div>
                <ul className="text-sm text-ink-2 space-y-1">
                  {[...props].map((p, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-ink-4 rounded-full flex-shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
