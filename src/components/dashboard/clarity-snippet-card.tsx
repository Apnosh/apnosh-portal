'use client'

/**
 * Reusable card that shows the Clarity tracking snippet for the
 * current client + a copy button + platform-specific install
 * instructions. Designed to drop into both the website setup wizard
 * and the heatmaps page when the snippet isn't detected.
 */

import { useState } from 'react'
import { Copy, Check, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

export default function ClaritySnippetCard({
  snippet,
  projectId,
  variant = 'standalone',
}: {
  snippet: string
  projectId: string
  variant?: 'standalone' | 'banner'
}) {
  const [copied, setCopied] = useState(false)
  const [showHow, setShowHow] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className={[
      'rounded-xl border',
      variant === 'banner' ? 'border-rose-200 bg-rose-50/40' : 'border-ink-6 bg-white',
      'p-4 space-y-3',
    ].join(' ')}>
      <div>
        <h3 className="text-[14px] font-semibold text-ink">
          {variant === 'banner' ? 'Heatmaps + recordings need the Clarity snippet on your site' : 'Install the Clarity snippet on your site'}
        </h3>
        <p className="text-[12.5px] text-ink-3 mt-1">
          Until this snippet is live on <strong>your website&apos;s {'<head>'}</strong>, Microsoft Clarity records nothing — and heatmaps + session replays stay empty. Paste once, then run a verification check.
        </p>
      </div>

      {/* The code block */}
      <div className="relative">
        <pre className="bg-ink text-white/90 rounded-lg p-3 pr-12 text-[10.5px] leading-relaxed overflow-x-auto font-mono">
          {snippet}
        </pre>
        <button
          onClick={copy}
          className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold bg-white/15 text-white hover:bg-white/25"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Where to paste — collapsible */}
      <div>
        <button
          onClick={() => setShowHow(s => !s)}
          className="text-[12px] font-medium text-brand hover:text-brand-dark inline-flex items-center gap-1"
        >
          {showHow ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Where to paste this on common platforms
        </button>
        {showHow && (
          <div className="mt-2 space-y-2 text-[12px] text-ink-2 bg-bg-2 rounded-lg p-3">
            <Platform name="Squarespace">
              Settings → Advanced → <strong>Code Injection</strong> → <strong>Header</strong>. Paste, Save. Live immediately.
            </Platform>
            <Platform name="Wix">
              Settings → Advanced → <strong>Custom Code</strong> → Add Custom Code → Place in <strong>Head</strong>. Apply to <em>All pages</em>. Save.
            </Platform>
            <Platform name="WordPress">
              Install the <strong>Insert Headers and Footers</strong> plugin (or use your theme&apos;s Custom Code section). Paste in the <strong>Header</strong> field. Save.
            </Platform>
            <Platform name="Shopify">
              Online Store → Themes → Actions → <strong>Edit Code</strong> → <code>theme.liquid</code>. Paste just before <code className="font-mono">{'</head>'}</code>. Save.
            </Platform>
            <Platform name="Webflow">
              Project Settings → Custom Code → <strong>Head Code</strong>. Paste, Save Changes, Publish.
            </Platform>
            <Platform name="Custom / other">
              Add to your site&apos;s shared <code className="font-mono">{'<head>'}</code> template. If you use Google Tag Manager, you can also publish a Custom HTML tag with this snippet.
            </Platform>
          </div>
        )}
      </div>

      {/* Verification CTA */}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <form action="/api/dashboard/clarity-verify" method="POST" className="inline">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-brand-dark"
          >
            I&apos;ve installed it — verify now
          </button>
        </form>
        <a
          href={`https://clarity.microsoft.com/projects/view/${projectId}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-ink-3 hover:text-ink inline-flex items-center gap-1"
        >
          Open Clarity project <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

function Platform({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{name}</span>
      <p className="text-[12px] text-ink-2 mt-0.5 leading-relaxed">{children}</p>
    </div>
  )
}
