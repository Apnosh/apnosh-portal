'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, FileText, Eye, Edit3, Check, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { saveAgreementTemplate } from '@/lib/actions'

interface Template {
  id: string
  name: string
  type: string
  version: number
  content: string
  is_active: boolean
  created_at: string
}

const PLACEHOLDERS = [
  'client_legal_name', 'client_dba_clause', 'client_entity_type', 'client_address',
  'service_scope', 'monthly_rate', 'payment_due_day', 'payment_terms',
  'late_fee_terms', 'notice_period', 'effective_date', 'termination_terms',
  'governing_state', 'ip_ownership_terms', 'signer_name', 'signature_date',
]

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchTemplates = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('agreement_templates')
      .select('*')
      .order('created_at', { ascending: false })
    setTemplates((data as Template[]) || [])
    setLoading(false)
  }

  useEffect(() => { fetchTemplates() }, [])

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    const result = await saveAgreementTemplate({
      id: editing.id || undefined,
      name: editing.name,
      type: editing.type,
      content: editing.content,
      is_active: editing.is_active,
    })
    if (result.success) {
      setEditing(null)
      fetchTemplates()
    } else {
      alert(result.error)
    }
    setSaving(false)
  }

  const insertPlaceholder = (ph: string) => {
    if (!editing) return
    setEditing({ ...editing, content: editing.content + `{{${ph}}}` })
  }

  const sampleData: Record<string, string> = {
    client_legal_name: 'Sunrise Bakery LLC',
    client_dba_clause: ', doing business as "Sunrise Bakery"',
    client_entity_type: 'Washington limited liability company',
    client_address: '123 Main St, Seattle, WA 98101',
    service_scope: 'Social media management (Instagram, Facebook, Google Business Profile), content creation (12 posts/month), monthly analytics reporting',
    monthly_rate: '$1,499.00',
    payment_due_day: '1st',
    payment_terms: 'Net 10 via ACH or credit card through the Apnosh Client Portal',
    late_fee_terms: '$25 flat fee per occurrence',
    notice_period: '30 days',
    effective_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    termination_terms: 'Either party may terminate with 30 days written notice. Client pays for all services rendered through termination date.',
    governing_state: 'Washington',
    ip_ownership_terms: 'All work product created by Agency for Client shall become the property of Client upon full payment. Agency retains the right to display work in its portfolio.',
    signer_name: 'John Smith',
    signature_date: new Date().toLocaleDateString(),
  }

  const renderPreview = (content: string) => {
    let rendered = content
    for (const [key, value] of Object.entries(sampleData)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), `**${value}**`)
    }
    return rendered
  }

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setEditing(null)}
            className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to templates
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreview(!preview)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                preview ? 'bg-brand-tint text-brand-dark' : 'border border-ink-6 text-ink-3 hover:bg-bg-2'
              }`}
            >
              <Eye className="w-4 h-4 inline mr-1" /> {preview ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>

        {/* Template metadata */}
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Template Name</label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Type</label>
              <select
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="master_service_agreement">Master Service Agreement</option>
                <option value="scope_amendment">Scope Amendment</option>
                <option value="addendum">Addendum</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.is_active}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-ink-6 text-brand focus:ring-brand/30"
                />
                Set as active default
              </label>
            </div>
          </div>
        </div>

        {/* Placeholder toolbar */}
        {!preview && (
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <p className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2">Insert Variable</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((ph) => (
                <button
                  key={ph}
                  onClick={() => insertPlaceholder(ph)}
                  className="px-2 py-1 rounded text-[11px] font-mono bg-bg-2 border border-ink-6 text-ink-3 hover:bg-brand-tint hover:text-brand-dark hover:border-brand/30 transition-colors"
                >
                  {`{{${ph}}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Editor / Preview */}
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          {preview ? (
            <div className="p-6 sm:p-8 prose prose-sm max-w-none">
              <div
                dangerouslySetInnerHTML={{
                  __html: renderPreview(editing.content)
                    .replace(/\n/g, '<br />')
                    .replace(/^# (.+)/gm, '<h1>$1</h1>')
                    .replace(/^## (.+)/gm, '<h2>$1</h2>')
                    .replace(/^### (.+)/gm, '<h3>$1</h3>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/---/g, '<hr />')
                }}
              />
            </div>
          ) : (
            <textarea
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              className="w-full min-h-[600px] p-6 text-sm font-mono text-ink bg-white border-0 focus:outline-none resize-y"
              placeholder="Write your agreement template using markdown. Use {{placeholder}} for dynamic values."
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/agreements"
            className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to agreements
          </Link>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Agreement Templates</h1>
          <p className="text-ink-3 text-sm mt-1">Create and manage reusable contract templates.</p>
        </div>
        <button
          onClick={() => setEditing({
            id: '',
            name: '',
            type: 'master_service_agreement',
            version: 1,
            content: '',
            is_active: false,
            created_at: '',
          })}
          className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {loading ? (
        <div className="h-48 bg-ink-6 rounded-xl animate-pulse" />
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
          <FileText className="w-10 h-10 text-ink-4 mx-auto mb-3" />
          <p className="text-ink-3 text-sm">No templates yet.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-ink-6 p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-ink">{t.name}</h3>
                  {t.is_active && (
                    <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Active</span>
                  )}
                  <span className="text-[10px] text-ink-4">v{t.version}</span>
                </div>
                <p className="text-xs text-ink-4 mt-0.5">
                  {t.type === 'master_service_agreement' ? 'Master Service Agreement' : t.type === 'scope_amendment' ? 'Scope Amendment' : 'Addendum'}
                  {' · '}Created {new Date(t.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setEditing(t)}
                className="px-3 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-3 hover:bg-bg-2 transition-colors flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
