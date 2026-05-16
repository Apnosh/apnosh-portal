'use client'

import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight, Eye, Code } from 'lucide-react'
import type { DigestSnippet } from '@/lib/admin/weekly-digest'

export default function DigestCard({ digest }: { digest: DigestSnippet }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'preview' | 'text' | 'html'>('preview')
  const [copied, setCopied] = useState<'text' | 'html' | null>(null)

  function copy(kind: 'text' | 'html') {
    const content = kind === 'text' ? digest.textBody : digest.htmlBody
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-2/40 transition-colors text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-ink-4" /> : <ChevronRight className="w-4 h-4 text-ink-4" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13.5px] font-semibold text-ink">{digest.clientName}</span>
            {digest.isBeta && (
              <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                beta
              </span>
            )}
            {digest.ownerEmails.length > 0 && (
              <span className="text-[11px] text-ink-3 font-mono truncate">
                · {digest.ownerEmails.join(', ')}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-3 flex items-center gap-2 flex-wrap">
            <span>{digest.conversationsCount} conv</span>
            <span>·</span>
            <span>{digest.toolsRun.reduce((s, t) => s + t.count, 0)} tool runs</span>
            {digest.postsPublished > 0 && <><span>·</span><span>{digest.postsPublished} posts</span></>}
            {digest.openSuggestions > 0 && <><span>·</span><span className="text-amber-700">{digest.openSuggestions} open suggestion{digest.openSuggestions === 1 ? '' : 's'}</span></>}
            {(digest.ownerThumbsUp + digest.ownerThumbsDown) > 0 && (
              <><span>·</span><span>{digest.ownerThumbsUp} 👍 / {digest.ownerThumbsDown} 👎</span></>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-ink-6">
          <div className="flex items-center gap-1 px-3 py-2 border-b border-ink-6 bg-bg-2/30">
            <TabBtn active={mode === 'preview'} onClick={() => setMode('preview')} icon={<Eye className="w-3 h-3" />} label="Preview" />
            <TabBtn active={mode === 'text'} onClick={() => setMode('text')} icon={<Code className="w-3 h-3" />} label="Plain text" />
            <TabBtn active={mode === 'html'} onClick={() => setMode('html')} icon={<Code className="w-3 h-3" />} label="HTML" />
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => copy('text')}
                className="text-[11px] font-medium px-2 py-1 rounded-md bg-bg-2 text-ink-3 hover:bg-ink-7 hover:text-ink-2 inline-flex items-center gap-1"
              >
                {copied === 'text' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                Copy text
              </button>
              <button
                onClick={() => copy('html')}
                className="text-[11px] font-medium px-2 py-1 rounded-md bg-bg-2 text-ink-3 hover:bg-ink-7 hover:text-ink-2 inline-flex items-center gap-1"
              >
                {copied === 'html' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                Copy HTML
              </button>
            </div>
          </div>
          <div className="p-4">
            {mode === 'preview' && (
              <div className="border border-ink-7 rounded-lg p-4 bg-white" dangerouslySetInnerHTML={{ __html: digest.htmlBody }} />
            )}
            {mode === 'text' && (
              <pre className="text-[12.5px] text-ink-2 whitespace-pre-wrap font-mono leading-relaxed">{digest.textBody}</pre>
            )}
            {mode === 'html' && (
              <pre className="text-[11.5px] text-ink-3 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">{digest.htmlBody}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        'text-[11px] font-medium px-2 py-1 rounded-md inline-flex items-center gap-1',
        active ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink',
      ].join(' ')}
    >
      {icon} {label}
    </button>
  )
}
