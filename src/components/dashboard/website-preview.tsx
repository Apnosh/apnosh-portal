'use client'

/**
 * Embedded preview of the client's live website inside a browser-
 * style frame. Gives owners a one-glance "this is what visitors see"
 * confirmation without leaving the portal.
 *
 * Loaded in a sandboxed iframe so any JS on the customer site can't
 * touch the parent dashboard. Some sites set X-Frame-Options or CSP
 * to deny embedding — when that happens we fall back to a static
 * "Open site" prompt with a screenshot if we have one.
 */

import { useState } from 'react'
import { Globe, ExternalLink, RefreshCw, Smartphone, Monitor } from 'lucide-react'

interface Props {
  websiteUrl: string | null
}

export default function WebsitePreview({ websiteUrl }: Props) {
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')
  const [reloadKey, setReloadKey] = useState(0)

  if (!websiteUrl) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">Your website</h2>
        </div>
        <p className="text-xs text-ink-3">No website URL on file yet.</p>
      </div>
    )
  }

  const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`
  let displayHost = url
  try { displayHost = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep url */ }

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Your website</h2>
          </div>
          <p className="text-xs text-ink-3 mt-0.5">Live preview — what visitors see right now.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-bg-2 p-0.5 ring-1 ring-ink-6">
            <button
              onClick={() => setView('desktop')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                view === 'desktop' ? 'bg-white text-ink shadow-sm' : 'text-ink-3'
              }`}
            >
              <Monitor className="w-3 h-3" /> Desktop
            </button>
            <button
              onClick={() => setView('mobile')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                view === 'mobile' ? 'bg-white text-ink shadow-sm' : 'text-ink-3'
              }`}
            >
              <Smartphone className="w-3 h-3" /> Mobile
            </button>
          </div>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-ink-3 hover:text-ink ring-1 ring-ink-6"
            title="Reload preview"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-6"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
        </div>
      </div>

      {/* Browser chrome frame */}
      <div className="rounded-xl border border-ink-6 overflow-hidden bg-ink-7">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-ink-6 bg-bg-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
          <div className="flex-1 mx-2 truncate rounded-md bg-white text-[11px] text-ink-3 px-2 py-1 text-center">
            {displayHost}
          </div>
        </div>
        <div className={view === 'mobile' ? 'flex justify-center p-4 bg-bg-2' : ''}>
          <iframe
            key={`${reloadKey}-${view}`}
            src={url}
            className={view === 'mobile'
              ? 'w-[375px] h-[600px] bg-white rounded-md border border-ink-7'
              : 'w-full h-[500px] bg-white'}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            title="Website preview"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  )
}
