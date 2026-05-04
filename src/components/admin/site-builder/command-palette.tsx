'use client'

/**
 * Cmd-K command palette — fuzzy-jump to any section, plus quick actions
 * (Open Design Studio, View History, Open Preview, Publish).
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import { Search, Layers, Wand2, History, ExternalLink, Sparkles, ArrowRight } from 'lucide-react'
import { SECTIONS } from './sections'
import type { SectionKey } from './sections'

export interface CommandAction {
  id: string
  label: string
  hint?: string
  shortcut?: string
  icon: 'section' | 'design' | 'history' | 'preview' | 'publish'
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  onJump: (sec: SectionKey) => void
  onOpenDesignStudio: () => void
  onOpenHistory: () => void
  onPreview: () => void
  onPublish: () => void
}

export default function CommandPalette({
  open, onClose, onJump, onOpenDesignStudio, onOpenHistory, onPreview, onPublish,
}: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const actions: CommandAction[] = useMemo(() => {
    const sectionActions: CommandAction[] = SECTIONS.map(s => ({
      id: `section:${s.key}`,
      label: `Go to ${s.title}`,
      hint: s.subtitle,
      icon: 'section',
      run: () => onJump(s.key),
    }))
    const quickActions: CommandAction[] = [
      { id: 'design', label: 'Open Design Studio',  hint: 'Generate, presets, fine-tune', icon: 'design',  shortcut: '⌘D', run: onOpenDesignStudio },
      { id: 'history', label: 'Publish history',    hint: 'View + revert past versions',  icon: 'history', run: onOpenHistory },
      { id: 'preview', label: 'Open preview tab',   hint: 'Full page in new tab',         icon: 'preview', run: onPreview },
      { id: 'publish', label: 'Publish now',        hint: 'Promote draft to live',        icon: 'publish', shortcut: '⌘↵', run: onPublish },
    ]
    return [...quickActions, ...sectionActions]
  }, [onJump, onOpenDesignStudio, onOpenHistory, onPreview, onPublish])

  const filtered = useMemo(() => {
    if (!query.trim()) return actions
    const q = query.toLowerCase()
    return actions.filter(a =>
      a.label.toLowerCase().includes(q) ||
      a.hint?.toLowerCase().includes(q),
    )
  }, [actions, query])

  // Keyboard nav
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(filtered.length - 1, a + 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const action = filtered[active]
        if (action) { action.run(); onClose() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, filtered, active])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed top-[12vh] left-1/2 -translate-x-1/2 w-[560px] max-w-[92vw] bg-white rounded-xl shadow-2xl z-50 overflow-hidden border border-ink-6">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-6">
          <Search className="w-4 h-4 text-ink-4" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0) }}
            placeholder="Type to search sections + actions…"
            className="flex-1 outline-none border-none text-sm bg-transparent placeholder:text-ink-4"
          />
          <kbd className="text-[10px] font-mono text-ink-4 bg-bg-2 border border-ink-6 rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-[420px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-ink-3">No matches</div>
          ) : (
            filtered.map((a, i) => {
              const isActive = i === active
              return (
                <button
                  key={a.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { a.run(); onClose() }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
                    isActive ? 'bg-brand text-white' : 'hover:bg-bg-2 text-ink'
                  }`}
                >
                  <CmdIcon kind={a.icon} active={isActive} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.label}</div>
                    {a.hint && <div className={`text-[11px] truncate ${isActive ? 'text-white/80' : 'text-ink-3'}`}>{a.hint}</div>}
                  </div>
                  {a.shortcut && (
                    <kbd className={`text-[10px] font-mono rounded px-1.5 py-0.5 ${isActive ? 'bg-white/20' : 'bg-bg-2 border border-ink-6 text-ink-4'}`}>
                      {a.shortcut}
                    </kbd>
                  )}
                  {isActive && !a.shortcut && <ArrowRight className="w-3 h-3 opacity-70" />}
                </button>
              )
            })
          )}
        </div>

        <footer className="px-4 py-2 border-t border-ink-6 bg-bg-2/50 flex items-center gap-3 text-[10px] text-ink-4">
          <span className="flex items-center gap-1"><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="font-mono">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="font-mono">esc</kbd> close</span>
        </footer>
      </div>
    </>
  )
}

function CmdIcon({ kind, active }: { kind: CommandAction['icon']; active: boolean }) {
  const cn = `w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-ink-3'}`
  switch (kind) {
    case 'section': return <Layers className={cn} />
    case 'design':  return <Wand2 className={cn} />
    case 'history': return <History className={cn} />
    case 'preview': return <ExternalLink className={cn} />
    case 'publish': return <Sparkles className={cn} />
  }
}
