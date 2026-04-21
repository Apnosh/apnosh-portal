'use client'

/**
 * Apply a task template to a client. Opens from the Tasks card on the
 * client overview ("Apply template" button).
 *
 * A template is a named bundle of task specs. Applying it creates N
 * tasks for this client in one shot, with due dates computed from each
 * item's `offset_days` relative to now.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Loader2, CheckCircle2, AlertTriangle, Sparkles, User, Briefcase, Clock,
} from 'lucide-react'

interface TemplateItem {
  title: string
  body?: string
  offset_days?: number
  assignee_type?: 'admin' | 'client'
  visible_to_client?: boolean
}

interface Template {
  id: string
  slug: string
  name: string
  description: string | null
  items: TemplateItem[]
}

interface Props {
  clientId: string
  onClose: () => void
  onApplied: () => void
}

export default function ApplyTemplateModal({ clientId, onClose, onApplied }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error: e } = await supabase
      .from('task_templates')
      .select('id, slug, name, description, items')
      .order('name')
    if (e) { setError(e.message); setLoading(false); return }
    setTemplates((data ?? []) as Template[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function apply() {
    if (!selected) return
    const template = templates.find(t => t.id === selected)
    if (!template) return

    setApplying(true); setError(null)
    const supabase = createClient()
    const now = Date.now()

    const rows = template.items.map(item => {
      const offset = item.offset_days ?? 0
      const dueAt = offset > 0 ? new Date(now + offset * 86400000).toISOString() : null
      return {
        client_id: clientId,
        title: item.title,
        body: item.body ?? null,
        due_at: dueAt,
        assignee_type: item.assignee_type ?? 'admin',
        visible_to_client: item.visible_to_client ?? (item.assignee_type === 'client'),
        source: 'template',
      }
    })

    const { error: insertErr } = await supabase.from('client_tasks').insert(rows)
    setApplying(false)
    if (insertErr) { setError(insertErr.message); return }
    onApplied()
  }

  const current = templates.find(t => t.id === selected) ?? null

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full my-8 overflow-hidden">
        <div className="flex items-start justify-between p-4 border-b border-ink-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-tint text-brand-dark flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Apply template</h2>
              <p className="text-[11px] text-ink-4 mt-0.5">Creates a batch of tasks at once. Each one is editable afterward.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-ink-4" />
          </div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-ink-3">No templates yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[220px_1fr] gap-0 min-h-[320px]">
            {/* Template list */}
            <div className="border-r border-ink-6 bg-bg-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-ink-6 last:border-0 ${
                    selected === t.id ? 'bg-white' : 'hover:bg-white/50'
                  }`}
                >
                  <div className="text-[13px] font-medium text-ink">{t.name}</div>
                  <div className="text-[11px] text-ink-4 mt-0.5">{t.items.length} tasks</div>
                </button>
              ))}
            </div>

            {/* Preview */}
            <div className="p-4 max-h-[440px] overflow-y-auto">
              {!current ? (
                <p className="text-[12px] text-ink-4 text-center py-8">Select a template to preview.</p>
              ) : (
                <>
                  {current.description && (
                    <p className="text-[12px] text-ink-3 mb-3">{current.description}</p>
                  )}
                  <div className="space-y-1.5">
                    {current.items.map((item, i) => {
                      const isClient = item.assignee_type === 'client'
                      const Icon = isClient ? User : Briefcase
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-2 p-2 rounded-md border border-ink-6"
                        >
                          <Icon className="w-3 h-3 text-ink-4 mt-1 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] text-ink leading-snug">{item.title}</div>
                            {item.body && (
                              <div className="text-[11px] text-ink-4 mt-0.5 line-clamp-1">{item.body}</div>
                            )}
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ink-4">
                              <span>{isClient ? 'Client' : 'Us'}</span>
                              {typeof item.offset_days === 'number' && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" />
                                  Due in {item.offset_days}d
                                </span>
                              )}
                              {item.visible_to_client && !isClient && (
                                <span className="text-blue-600">shown to client</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mx-4 my-2 flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-6 bg-bg-2">
          <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink px-3">Cancel</button>
          <button
            type="button"
            onClick={apply}
            disabled={!selected || applying}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {current ? `Apply ${current.items.length} tasks` : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
