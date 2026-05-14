'use client'

/**
 * Microsoft Clarity card.
 *
 * Clarity is free and covers:
 *   - Click heatmaps (where do people tap)
 *   - Scroll heatmaps (how far down they scroll)
 *   - Session recordings (full playback of individual visits)
 *   - Rage click + dead click detection
 *   - Form abandonment by field
 *
 * Setup is a one-line script the client pastes into their site;
 * we just store the project ID and deep-link the dashboard.
 */

import { useState } from 'react'
import { Eye, ExternalLink, Code, Copy, Check, Save, Loader2 } from 'lucide-react'

interface Props {
  clientId: string
  initialProjectId: string | null
}

export default function ClarityCard({ clientId, initialProjectId }: Props) {
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const [savedProjectId, setSavedProjectId] = useState(initialProjectId)
  const [editing, setEditing] = useState(!initialProjectId)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const snippet = projectId
    ? `<!-- Microsoft Clarity -->
<script type="text/javascript">
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "${projectId.trim()}");
</script>`
    : ''

  async function save() {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/clarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, projectId: projectId.trim() }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setSavedProjectId(projectId.trim() || null)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function copySnippet() {
    void navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="rounded-2xl border border-ink-6 bg-white p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Heatmaps & session recordings</h2>
          </div>
          <p className="text-[12.5px] text-ink-3 mt-0.5">
            Microsoft Clarity. Free. Captures where visitors click, how far they scroll, and where they get stuck on forms.
          </p>
        </div>
        {savedProjectId && !editing && (
          <a
            href={`https://clarity.microsoft.com/projects/view/${savedProjectId}/dashboard`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-brand-dark"
          >
            <ExternalLink className="w-3 h-3" />
            Open Clarity dashboard
          </a>
        )}
      </div>

      {!savedProjectId || editing ? (
        <SetupForm
          projectId={projectId}
          onChange={setProjectId}
          onSave={save}
          saving={saving}
          error={error}
          snippet={snippet}
          copied={copied}
          onCopy={copySnippet}
          onCancel={savedProjectId ? () => { setEditing(false); setProjectId(savedProjectId) } : undefined}
        />
      ) : (
        <ConfiguredView
          projectId={savedProjectId}
          onEdit={() => setEditing(true)}
        />
      )}
    </section>
  )
}

function SetupForm({
  projectId, onChange, onSave, saving, error, snippet, copied, onCopy, onCancel,
}: {
  projectId: string
  onChange: (v: string) => void
  onSave: () => void
  saving: boolean
  error: string | null
  snippet: string
  copied: boolean
  onCopy: () => void
  onCancel?: () => void
}) {
  return (
    <div className="space-y-4">
      <ol className="space-y-3 text-[12.5px] text-ink-2">
        <li>
          <span className="font-semibold text-ink">1. Create a free Clarity account</span> at{' '}
          <a href="https://clarity.microsoft.com" target="_blank" rel="noreferrer" className="text-brand-dark hover:underline">
            clarity.microsoft.com
          </a>
          . Add your site URL as a new project. Microsoft will show you a 10-character project ID.
        </li>
        <li>
          <span className="font-semibold text-ink">2. Paste your project ID below</span>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={projectId}
              onChange={e => onChange(e.target.value)}
              placeholder="e.g. ahkx8z2pq3"
              className="flex-1 max-w-xs text-[13px] font-mono p-2 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <button
              onClick={onSave}
              disabled={saving || !projectId.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
            {onCancel && (
              <button onClick={onCancel} className="text-[12px] text-ink-3 hover:text-ink">Cancel</button>
            )}
          </div>
          {error && <p className="mt-1.5 text-[11px] text-rose-700">{error}</p>}
        </li>
        {projectId.trim() && (
          <li>
            <span className="font-semibold text-ink">3. Add this snippet to your site</span> in the
            <code className="font-mono mx-1 text-[11.5px] bg-bg-2 px-1 rounded">{'<head>'}</code> of every page.
            <div className="mt-2 relative">
              <pre className="text-[10.5px] font-mono bg-ink-1 text-ink-7 p-3 rounded-lg overflow-auto leading-relaxed">{snippet}</pre>
              <button
                onClick={onCopy}
                className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] text-white bg-ink-3 hover:bg-ink-2"
              >
                {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-ink-4">
              Data starts flowing in 1-2 hours. No restart, no rebuild — just paste and save.
            </p>
          </li>
        )}
      </ol>
    </div>
  )
}

function ConfiguredView({ projectId, onEdit }: { projectId: string; onEdit: () => void }) {
  const features = [
    { icon: '🔥', title: 'Click heatmaps', desc: 'See where every visitor tapped or clicked on each page.' },
    { icon: '📜', title: 'Scroll depth', desc: 'How far down the page people read before bouncing.' },
    { icon: '🎬', title: 'Session recordings', desc: 'Watch real visitors navigate your site (replay only — no audio, no PII).' },
    { icon: '✍️', title: 'Form abandonment', desc: 'Which form field made visitors give up. Where the booking flow leaks.' },
    { icon: '😤', title: 'Rage + dead clicks', desc: 'Identifies confused visitors clicking buttons that don\'t work.' },
  ]
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-ink-2">
        Project ID <code className="font-mono text-[11px] bg-bg-2 px-1.5 py-0.5 rounded">{projectId}</code>
        {' '}is connected. Click <strong>Open Clarity dashboard</strong> above to view recordings and heatmaps.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {features.map(f => (
          <li key={f.title} className="rounded-xl bg-bg-2/40 p-3 text-[12px]">
            <p className="font-semibold text-ink mb-0.5">{f.icon} {f.title}</p>
            <p className="text-ink-3 leading-relaxed">{f.desc}</p>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 text-[11px] text-ink-4">
        <button onClick={onEdit} className="inline-flex items-center gap-1 hover:text-ink">
          <Code className="w-3 h-3" />
          Edit project ID
        </button>
      </div>
    </div>
  )
}
