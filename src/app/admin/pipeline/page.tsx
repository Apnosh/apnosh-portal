'use client'

import { useState } from 'react'
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, Filter,
  Clock, AlertTriangle, Calendar, User, X
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Status = 'new' | 'in_progress' | 'internal_review' | 'client_review' | 'approved' | 'scheduled'
type Priority = 'Normal' | 'High' | 'Urgent'
type ServiceType = 'Social Media' | 'Video' | 'Website' | 'Email' | 'Branding' | 'SEO'

interface Card {
  id: string
  title: string
  client: string
  service: ServiceType
  assignee: { name: string; initials: string; color: string }
  due: string          // ISO date string
  priority: Priority
  status: Status
}

/* ------------------------------------------------------------------ */
/*  Column config                                                      */
/* ------------------------------------------------------------------ */

const columns: { key: Status; label: string; dot: string; bg: string }[] = [
  { key: 'new',             label: 'New',             dot: 'bg-amber-400',  bg: 'bg-amber-50' },
  { key: 'in_progress',     label: 'In Progress',     dot: 'bg-blue-500',   bg: 'bg-blue-50' },
  { key: 'internal_review', label: 'Internal Review',  dot: 'bg-purple-500', bg: 'bg-purple-50' },
  { key: 'client_review',   label: 'Client Review',   dot: 'bg-orange-500', bg: 'bg-orange-50' },
  { key: 'approved',        label: 'Approved',        dot: 'bg-green-500',  bg: 'bg-green-50' },
  { key: 'scheduled',       label: 'Scheduled',       dot: 'bg-teal-500',   bg: 'bg-teal-50' },
]

/* ------------------------------------------------------------------ */
/*  Team members                                                       */
/* ------------------------------------------------------------------ */

const team = [
  { name: 'Sarah K.',  initials: 'SK', color: 'bg-rose-100 text-rose-700' },
  { name: 'Mike R.',   initials: 'MR', color: 'bg-blue-100 text-blue-700' },
  { name: 'Alex T.',   initials: 'AT', color: 'bg-violet-100 text-violet-700' },
  { name: 'Jordan L.', initials: 'JL', color: 'bg-amber-100 text-amber-700' },
]

/* ------------------------------------------------------------------ */
/*  Mock data (15 cards)                                               */
/* ------------------------------------------------------------------ */

const initialCards: Card[] = [
  // New (3)
  { id: 'c1',  title: '4x Instagram Feed Posts',        client: 'Casa Priya',       service: 'Social Media', assignee: team[0], due: '2026-03-26', priority: 'Normal',  status: 'new' },
  { id: 'c2',  title: 'Brand Guidelines PDF',           client: 'Vesta Bakery',     service: 'Branding',     assignee: team[2], due: '2026-03-28', priority: 'High',    status: 'new' },
  { id: 'c3',  title: 'Google Ads Setup',               client: 'Peak Fitness',     service: 'SEO',          assignee: team[1], due: '2026-03-25', priority: 'Urgent',  status: 'new' },

  // In Progress (3)
  { id: 'c4',  title: 'Promo Video 30s Cut',            client: 'Lumina Boutique',  service: 'Video',        assignee: team[1], due: '2026-03-22', priority: 'High',    status: 'in_progress' },
  { id: 'c5',  title: 'Weekly Story Templates',         client: 'Golden Wok',       service: 'Social Media', assignee: team[0], due: '2026-03-27', priority: 'Normal',  status: 'in_progress' },
  { id: 'c6',  title: 'Landing Page Redesign',          client: 'Peak Fitness',     service: 'Website',      assignee: team[2], due: '2026-03-24', priority: 'High',    status: 'in_progress' },

  // Internal Review (3)
  { id: 'c7',  title: 'March Newsletter',               client: 'Casa Priya',       service: 'Email',        assignee: team[3], due: '2026-03-23', priority: 'Normal',  status: 'internal_review' },
  { id: 'c8',  title: 'Logo Concepts v2',               client: 'Bloom Studio',     service: 'Branding',     assignee: team[2], due: '2026-03-25', priority: 'Normal',  status: 'internal_review' },
  { id: 'c9',  title: 'TikTok Reel Batch',              client: 'Vesta Bakery',     service: 'Video',        assignee: team[1], due: '2026-03-21', priority: 'Urgent',  status: 'internal_review' },

  // Client Review (2)
  { id: 'c10', title: 'Homepage Mockup',                client: 'Lumina Boutique',  service: 'Website',      assignee: team[2], due: '2026-03-24', priority: 'High',    status: 'client_review' },
  { id: 'c11', title: '8x Carousel Posts',              client: 'Golden Wok',       service: 'Social Media', assignee: team[0], due: '2026-03-29', priority: 'Normal',  status: 'client_review' },

  // Approved (2)
  { id: 'c12', title: 'SEO Audit Report',               client: 'Peak Fitness',     service: 'SEO',          assignee: team[3], due: '2026-03-26', priority: 'Normal',  status: 'approved' },
  { id: 'c13', title: 'Welcome Email Sequence',         client: 'Bloom Studio',     service: 'Email',        assignee: team[3], due: '2026-03-25', priority: 'High',    status: 'approved' },

  // Scheduled (2)
  { id: 'c14', title: 'Product Launch Video',           client: 'Casa Priya',       service: 'Video',        assignee: team[1], due: '2026-03-30', priority: 'Normal',  status: 'scheduled' },
  { id: 'c15', title: 'Spring Campaign Posts',          client: 'Lumina Boutique',  service: 'Social Media', assignee: team[0], due: '2026-03-31', priority: 'Normal',  status: 'scheduled' },
  { id: 'c16', title: 'Blog SEO Optimization',          client: 'Vesta Bakery',     service: 'SEO',          assignee: team[3], due: '2026-04-01', priority: 'Normal',  status: 'scheduled' },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const serviceColors: Record<ServiceType, string> = {
  'Social Media': 'bg-pink-50 text-pink-700 border-pink-200',
  'Video':        'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Website':      'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Email':        'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Branding':     'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  'SEO':          'bg-lime-50 text-lime-700 border-lime-200',
}

const priorityBadge: Record<Priority, string | null> = {
  'Normal': null,
  'High':   'bg-orange-100 text-orange-700 border-orange-300',
  'Urgent': 'bg-red-100 text-red-700 border-red-300',
}

function dueInfo(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const due = new Date(dateStr); due.setHours(0,0,0,0)
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'text-red-600',   icon: 'overdue' as const }
  if (diff === 0) return { label: 'Due today',                  cls: 'text-amber-600', icon: 'today' as const }
  return            { label: `Due in ${diff}d`,                 cls: 'text-ink-4',     icon: 'upcoming' as const }
}

function statusLabel(s: Status) {
  return columns.find(c => c.key === s)?.label ?? s
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PipelinePage() {
  const [cards, setCards] = useState<Card[]>(initialCards)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [teamFilter, setTeamFilter] = useState('All')
  const [serviceFilter, setServiceFilter] = useState('All')

  /* Filter logic */
  const filtered = cards.filter(c => {
    if (teamFilter !== 'All' && c.assignee.name !== teamFilter) return false
    if (serviceFilter !== 'All' && c.service !== serviceFilter) return false
    return true
  })

  const overdueCount = filtered.filter(c => {
    const d = new Date(c.due); d.setHours(0,0,0,0)
    const t = new Date(); t.setHours(0,0,0,0)
    return d < t
  }).length

  /* Move card to adjacent column */
  const moveCard = (id: string, direction: 'left' | 'right') => {
    setCards(prev => prev.map(c => {
      if (c.id !== id) return c
      const idx = columns.findIndex(col => col.key === c.status)
      const next = direction === 'right' ? idx + 1 : idx - 1
      if (next < 0 || next >= columns.length) return c
      return { ...c, status: columns[next].key }
    }))
    setExpandedId(null)
  }

  /* ---------------------------------------------------------------- */
  /*  Board view                                                       */
  /* ---------------------------------------------------------------- */

  const BoardView = () => (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-6 lg:px-6 snap-x">
      {columns.map(col => {
        const colCards = filtered.filter(c => c.status === col.key)
        return (
          <div key={col.key} className="flex-shrink-0 w-[280px] lg:w-[calc((100%-60px)/6)] min-w-[260px] flex flex-col snap-start">
            {/* Column header */}
            <div className={`rounded-t-xl ${col.bg} px-3 py-2.5 flex items-center gap-2`}>
              <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
              <span className="text-sm font-semibold text-ink">{col.label}</span>
              <span className="ml-auto text-xs font-medium text-ink-4 bg-white/70 rounded-full px-2 py-0.5">{colCards.length}</span>
            </div>

            {/* Card list */}
            <div className="flex-1 bg-ink-6/50 rounded-b-xl p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)] min-h-[200px]">
              {colCards.length === 0 && (
                <div className="text-center text-xs text-ink-4 py-8">No items</div>
              )}
              {colCards.map(card => {
                const due = dueInfo(card.due)
                const isExpanded = expandedId === card.id
                const colIdx = columns.findIndex(c => c.key === card.status)
                return (
                  <div
                    key={card.id}
                    className={`bg-white rounded-lg border transition-all cursor-pointer ${
                      isExpanded ? 'border-brand shadow-md' : 'border-ink-6 hover:border-ink-5 hover:shadow-sm'
                    }`}
                    onClick={() => setExpandedId(isExpanded ? null : card.id)}
                  >
                    <div className="p-3 space-y-2.5">
                      {/* Service tag + priority */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${serviceColors[card.service]}`}>
                          {card.service}
                        </span>
                        {priorityBadge[card.priority] && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${priorityBadge[card.priority]}`}>
                            {card.priority}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <div className="text-sm font-medium text-ink leading-snug">{card.title}</div>

                      {/* Client */}
                      <div className="text-xs text-ink-3">{card.client}</div>

                      {/* Assignee + due */}
                      <div className="flex items-center justify-between pt-1 border-t border-ink-6">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-5 h-5 rounded-full ${card.assignee.color} flex items-center justify-center text-[8px] font-bold`}>
                            {card.assignee.initials}
                          </div>
                          <span className="text-[11px] text-ink-3">{card.assignee.name}</span>
                        </div>
                        <div className={`flex items-center gap-1 text-[11px] font-medium ${due.cls}`}>
                          {due.icon === 'overdue' && <AlertTriangle className="w-3 h-3" />}
                          {due.icon === 'today' && <Clock className="w-3 h-3" />}
                          {due.icon === 'upcoming' && <Calendar className="w-3 h-3" />}
                          {due.label}
                        </div>
                      </div>
                    </div>

                    {/* Expanded: move buttons */}
                    {isExpanded && (
                      <div className="border-t border-ink-6 px-3 py-2 flex items-center justify-between bg-bg-2 rounded-b-lg">
                        <button
                          disabled={colIdx === 0}
                          onClick={e => { e.stopPropagation(); moveCard(card.id, 'left') }}
                          className="flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Move Left
                        </button>
                        <button
                          disabled={colIdx === columns.length - 1}
                          onClick={e => { e.stopPropagation(); moveCard(card.id, 'right') }}
                          className="flex items-center gap-1 text-xs font-medium text-brand-dark hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          Move Right <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  /* ---------------------------------------------------------------- */
  /*  List view                                                        */
  /* ---------------------------------------------------------------- */

  const statusDot: Record<Status, string> = {
    new: 'bg-amber-400', in_progress: 'bg-blue-500', internal_review: 'bg-purple-500',
    client_review: 'bg-orange-500', approved: 'bg-green-500', scheduled: 'bg-teal-500',
  }

  const ListView = () => (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-6">
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Title</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Client</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Assigned To</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Status</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Due Date</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Priority</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
              .map(card => {
                const due = dueInfo(card.due)
                return (
                  <tr key={card.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${serviceColors[card.service]}`}>
                          {card.service}
                        </span>
                        <span className="font-medium text-ink">{card.title}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-3">{card.client}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-5 h-5 rounded-full ${card.assignee.color} flex items-center justify-center text-[8px] font-bold`}>
                          {card.assignee.initials}
                        </div>
                        <span className="text-ink-2 text-xs">{card.assignee.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${statusDot[card.status]}`} />
                        <span className="text-xs font-medium text-ink-2">{statusLabel(card.status)}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`flex items-center gap-1 text-xs font-medium ${due.cls}`}>
                        {due.icon === 'overdue' && <AlertTriangle className="w-3 h-3" />}
                        {due.icon === 'today' && <Clock className="w-3 h-3" />}
                        {due.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {priorityBadge[card.priority] ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${priorityBadge[card.priority]}`}>
                          {card.priority}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-4">Normal</span>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Production Pipeline</h1>
          <p className="text-ink-3 text-sm mt-1">Track deliverables from order to publish.</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-ink-3">{filtered.length} items</span>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <AlertTriangle className="w-3 h-3" /> {overdueCount} overdue
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Team filter */}
        <div className="relative">
          <select
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
            className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-1.5 text-xs text-ink-2 font-medium focus:outline-none focus:border-brand cursor-pointer"
          >
            <option value="All">All Team</option>
            {team.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          <User className="w-3 h-3 text-ink-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Service filter */}
        <div className="relative">
          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-1.5 text-xs text-ink-2 font-medium focus:outline-none focus:border-brand cursor-pointer"
          >
            <option value="All">All Services</option>
            {(['Social Media', 'Video', 'Website', 'Email', 'Branding', 'SEO'] as ServiceType[]).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Filter className="w-3 h-3 text-ink-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Active filter tags */}
        {(teamFilter !== 'All' || serviceFilter !== 'All') && (
          <button
            onClick={() => { setTeamFilter('All'); setServiceFilter('All') }}
            className="flex items-center gap-1 text-[11px] text-ink-4 hover:text-red-500 transition-colors"
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center border border-ink-6 rounded-lg overflow-hidden">
          <button
            onClick={() => setView('board')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'board' ? 'bg-ink text-white' : 'bg-white text-ink-3 hover:text-ink'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Board
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'list' ? 'bg-ink text-white' : 'bg-white text-ink-3 hover:text-ink'
            }`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
        </div>
      </div>

      {/* Content */}
      {view === 'board' ? <BoardView /> : <ListView />}
    </div>
  )
}
