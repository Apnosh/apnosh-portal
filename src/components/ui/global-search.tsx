'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Users, FileText, ShoppingBag, MessageSquare, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SearchResult {
  type: 'client' | 'agreement' | 'order' | 'message'
  id: string
  title: string
  subtitle: string
  href: string
}

const TYPE_ICONS = {
  client: Users,
  agreement: FileText,
  order: ShoppingBag,
  message: MessageSquare,
}

const TYPE_COLORS = {
  client: 'bg-blue-50 text-blue-600',
  agreement: 'bg-purple-50 text-purple-600',
  order: 'bg-amber-50 text-amber-600',
  message: 'bg-emerald-50 text-emerald-600',
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Keyboard shortcut: Cmd+K or Ctrl+K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
        setResults([])
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
        setResults([])
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    const supabase = createClient()
    const term = `%${q}%`
    const items: SearchResult[] = []

    const [clients, agreements, orders, threads] = await Promise.all([
      supabase.from('businesses').select('id, name, primary_contact_name').ilike('name', term).limit(5),
      supabase.from('agreements').select('id, agreement_type, status, businesses(name)').ilike('agreement_type', term).limit(5),
      supabase.from('orders').select('id, service_name, businesses(name)').ilike('service_name', term).limit(5),
      supabase.from('message_threads').select('id, subject, businesses(name)').ilike('subject', term).limit(5),
    ])

    clients.data?.forEach((c) => items.push({
      type: 'client', id: c.id, title: c.name, subtitle: c.primary_contact_name || 'Client',
      href: `/admin/clients/${c.id}`,
    }))

    agreements.data?.forEach((a: Record<string, unknown>) => {
      const biz = Array.isArray(a.businesses) ? a.businesses[0] : a.businesses
      items.push({
        type: 'agreement', id: a.id as string,
        title: `${(biz as Record<string, string>)?.name || 'Agreement'} - ${a.agreement_type}`,
        subtitle: `Status: ${a.status}`,
        href: '/admin/agreements',
      })
    })

    orders.data?.forEach((o: Record<string, unknown>) => {
      const biz = Array.isArray(o.businesses) ? o.businesses[0] : o.businesses
      items.push({
        type: 'order', id: o.id as string, title: o.service_name as string,
        subtitle: (biz as Record<string, string>)?.name || 'Order',
        href: `/admin/orders/${o.id}`,
      })
    })

    threads.data?.forEach((t: Record<string, unknown>) => {
      const biz = Array.isArray(t.businesses) ? t.businesses[0] : t.businesses
      items.push({
        type: 'message', id: t.id as string, title: t.subject as string,
        subtitle: (biz as Record<string, string>)?.name || 'Message',
        href: '/admin/messages',
      })
    })

    setResults(items)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => search(query), 250)
    return () => clearTimeout(timeout)
  }, [query, search])

  const handleSelect = (href: string) => {
    setOpen(false)
    setQuery('')
    setResults([])
    router.push(href)
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ink-6 bg-bg-2 text-sm text-ink-4 hover:border-ink-5 transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline text-[10px] font-medium text-ink-5 bg-white border border-ink-6 rounded px-1.5 py-0.5 ml-2">
          ⌘K
        </kbd>
      </button>

      {/* Search modal */}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh] px-4">
          <div className="absolute inset-0 bg-black/30" />
          <div ref={containerRef} className="relative bg-white rounded-2xl border border-ink-6 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 border-b border-ink-6">
              <Search className="w-4 h-4 text-ink-4 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients, orders, messages..."
                className="flex-1 py-3.5 text-sm text-ink bg-transparent outline-none placeholder:text-ink-4"
              />
              {query && (
                <button onClick={() => { setQuery(''); setResults([]) }} className="text-ink-4 hover:text-ink">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Results */}
            {query.length >= 2 && (
              <div className="max-h-[320px] overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-sm text-ink-4 text-center">Searching...</div>
                ) : results.length === 0 ? (
                  <div className="p-4 text-sm text-ink-4 text-center">No results for &ldquo;{query}&rdquo;</div>
                ) : (
                  <ul className="py-2">
                    {results.map((r) => {
                      const Icon = TYPE_ICONS[r.type]
                      const color = TYPE_COLORS[r.type]
                      return (
                        <li key={`${r.type}-${r.id}`}>
                          <button
                            onClick={() => handleSelect(r.href)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bg-2 transition-colors text-left"
                          >
                            <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-ink truncate">{r.title}</p>
                              <p className="text-xs text-ink-4 truncate">{r.subtitle}</p>
                            </div>
                            <span className="text-[10px] text-ink-5 uppercase font-medium">{r.type}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}

            {!query && (
              <div className="p-4 text-sm text-ink-4 text-center">
                Type to search across clients, orders, agreements, and messages.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
