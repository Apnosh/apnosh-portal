'use client'

/**
 * Admin UI for the unified updates system.
 * Two sections: create form (top) + history list (below).
 *
 * MVP scope: hours updates only. Other update types (menu items,
 * promotions, events, closures) plug in by adding their own form
 * components and rendering them based on the selected type.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Clock, CheckCircle2, AlertCircle, Loader2, ChevronDown,
  ChevronRight, RefreshCw, Globe, MapPin, Mail, MessageSquare, Share2, Camera,
} from 'lucide-react'
import { createUpdate, publishUpdate, retryFanout } from '@/lib/updates/actions'
import type {
  UpdateRecord, UpdateFanoutRecord, FanoutTarget, WeeklyHours, DayKey,
  HoursPayload, ClosurePayload, MenuItemPayload, PromotionPayload, EventPayload, UpdateType,
} from '@/lib/updates/types'
import { DEFAULT_TARGETS } from '@/lib/updates/types'
import HoursEditor from './hours-editor'
import ClosureForm from './closure-form'
import MenuItemForm from './menu-item-form'
import PromotionForm from './promotion-form'
import EventForm from './event-form'

interface Location {
  id: string
  name: string
  address: string | null
  hours: Record<string, unknown> | null
  specialHours: unknown[]
  storeCode: string
}

interface Props {
  clientId: string
  clientName: string
  clientSlug: string
  locations: Location[]
  initialUpdates: UpdateRecord[]
  initialFanouts: Record<string, UpdateFanoutRecord[]>
}

const TARGET_LABELS: Record<FanoutTarget, { label: string; Icon: typeof Globe }> = {
  gbp:       { label: 'Google Business', Icon: MapPin },
  yelp:      { label: 'Yelp',           Icon: MessageSquare },
  facebook:  { label: 'Facebook',       Icon: Share2 },
  instagram: { label: 'Instagram',      Icon: Camera },
  website:   { label: 'Website',        Icon: Globe },
  email:     { label: 'Email',          Icon: Mail },
  sms:       { label: 'SMS',            Icon: MessageSquare },
  pos:       { label: 'POS',            Icon: MessageSquare },
}

export default function UpdatesView({
  clientId, clientName, locations, initialUpdates, initialFanouts,
}: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(initialUpdates.length === 0)

  const [selectedLocation, setSelectedLocation] = useState<string>(locations[0]?.id ?? '')
  const [updateType, setUpdateType] = useState<UpdateType>('hours')
  const [weekly, setWeekly] = useState<WeeklyHours>(() => buildDefaultHours(locations[0]))
  const [closure, setClosure] = useState<ClosurePayload>(() => buildDefaultClosure())
  const [menuItem, setMenuItem] = useState<MenuItemPayload>(() => buildDefaultMenuItem())
  const [promotion, setPromotion] = useState<PromotionPayload>(() => buildDefaultPromotion())
  const [event, setEvent] = useState<EventPayload>(() => buildDefaultEvent())
  const [targets, setTargets] = useState<FanoutTarget[]>(DEFAULT_TARGETS.hours)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()
  const [resultMessage, setResultMessage] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleSubmit = async () => {
    if (!selectedLocation) {
      setResultMessage({ ok: false, msg: 'Pick a location first' })
      return
    }
    setBusy(true)
    setResultMessage(null)

    let payload: HoursPayload | ClosurePayload | MenuItemPayload | PromotionPayload | EventPayload
    let summary: string
    if (updateType === 'hours') {
      payload = { scope: 'regular', weekly } as HoursPayload
      summary = 'Updated regular hours'
    } else if (updateType === 'closure') {
      // Validate closure
      if (!closure.starts_at || !closure.ends_at) {
        setBusy(false)
        setResultMessage({ ok: false, msg: 'Pick a closure date range' })
        return
      }
      payload = closure
      summary = `${closure.kind === 'emergency' ? 'Emergency closure' : 'Closure'}: ${closure.reason || 'no reason given'}`
    } else if (updateType === 'menu_item') {
      if (!menuItem.item.name) {
        setBusy(false)
        setResultMessage({ ok: false, msg: 'Menu item name is required' })
        return
      }
      payload = menuItem
      summary = `${menuItem.action === 'add' ? 'New' : menuItem.action === 'update' ? 'Updated' : 'Removed'} menu item: ${menuItem.item.name}`
    } else if (updateType === 'promotion') {
      if (!promotion.name || !promotion.valid_from || !promotion.valid_until) {
        setBusy(false)
        setResultMessage({ ok: false, msg: 'Promotion needs a name and valid date range' })
        return
      }
      payload = promotion
      summary = `Promotion: ${promotion.name}`
    } else if (updateType === 'event') {
      if (!event.name || !event.start_at || !event.end_at) {
        setBusy(false)
        setResultMessage({ ok: false, msg: 'Event needs a name and start/end time' })
        return
      }
      payload = event
      summary = `Event: ${event.name}`
    } else {
      setBusy(false)
      setResultMessage({ ok: false, msg: 'Type not implemented yet' })
      return
    }

    const created = await createUpdate({
      clientId,
      locationId: selectedLocation,
      type: updateType,
      payload,
      targets,
      summary,
    })

    if (!created.success) {
      setBusy(false)
      setResultMessage({ ok: false, msg: created.error })
      return
    }

    const published = await publishUpdate(created.data.id)
    setBusy(false)
    if (published.success) {
      const successCount = published.data.fanoutResults.filter(r => r.status === 'success').length
      const skipCount = published.data.fanoutResults.filter(r => r.status === 'skipped').length
      const failCount = published.data.fanoutResults.filter(r => r.status === 'failed').length
      const parts: string[] = []
      if (successCount > 0) parts.push(`${successCount} succeeded`)
      if (failCount > 0) parts.push(`${failCount} failed`)
      if (skipCount > 0) parts.push(`${skipCount} skipped`)
      setResultMessage({
        ok: failCount === 0,
        msg: `Update created. ${parts.join(', ') || 'no targets'}.`,
      })
      setShowCreate(false)
      startTransition(() => router.refresh())
    } else {
      setResultMessage({ ok: false, msg: published.error })
    }
  }

  return (
    <div className="space-y-6">
      {resultMessage && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl ${
            resultMessage.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
          }`}
        >
          {resultMessage.ok
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
            : <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />}
          <p className="text-sm">{resultMessage.msg}</p>
        </div>
      )}

      {/* ── Create form (collapsible) ───────────────────────────── */}
      {showCreate ? (
        <div className="rounded-xl border border-ink-6 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">New update</h2>
            <button onClick={() => setShowCreate(false)} className="text-xs text-ink-3 hover:text-ink">
              Cancel
            </button>
          </div>

          {/* Location picker */}
          {locations.length > 1 && (
            <div>
              <label className="text-xs font-medium text-ink-3 block mb-1">Location</label>
              <select
                value={selectedLocation}
                onChange={e => {
                  setSelectedLocation(e.target.value)
                  setWeekly(buildDefaultHours(locations.find(l => l.id === e.target.value)))
                }}
                className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
              >
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Type picker */}
          <div>
            <label className="text-xs font-medium text-ink-3 block mb-1">Type</label>
            <select
              value={updateType}
              onChange={e => {
                const t = e.target.value as UpdateType
                setUpdateType(t)
                setTargets(DEFAULT_TARGETS[t])
              }}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
            >
              <option value="hours">Hours change</option>
              <option value="closure">Closure (planned or emergency)</option>
              <option value="menu_item">Menu item</option>
              <option value="promotion">Promotion (deal, happy hour, LTO)</option>
              <option value="event">Event (dinner, tasting, live music)</option>
              {/* Future: asset, info */}
            </select>
          </div>

          {/* Type-specific form */}
          {updateType === 'hours' && (
            <HoursEditor weekly={weekly} onChange={setWeekly} />
          )}
          {updateType === 'closure' && (
            <ClosureForm payload={closure} onChange={setClosure} />
          )}
          {updateType === 'menu_item' && (
            <MenuItemForm payload={menuItem} onChange={setMenuItem} />
          )}
          {updateType === 'promotion' && (
            <PromotionForm payload={promotion} onChange={setPromotion} />
          )}
          {updateType === 'event' && (
            <EventForm payload={event} onChange={setEvent} />
          )}

          {/* Targets */}
          <div>
            <label className="text-xs font-medium text-ink-3 block mb-2">Push to</label>
            <div className="flex flex-wrap gap-2">
              {(['gbp', 'yelp', 'facebook', 'website'] as FanoutTarget[]).map(t => {
                const active = targets.includes(t)
                const { label, Icon } = TARGET_LABELS[t]
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTargets(prev =>
                      active ? prev.filter(x => x !== t) : [...prev, t]
                    )}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-brand text-white border-brand'
                        : 'bg-white text-ink-3 border-ink-5 hover:border-ink-4'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={busy || targets.length === 0}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {busy ? 'Publishing...' : `Publish to ${targets.length} place${targets.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink-2"
        >
          <Plus className="w-4 h-4" /> New update
        </button>
      )}

      {/* ── History ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-ink mb-3">
          History {initialUpdates.length > 0 && <span className="text-ink-3 font-normal">({initialUpdates.length})</span>}
        </h2>
        {initialUpdates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-5 p-8 text-center">
            <Clock className="w-8 h-8 text-ink-4 mx-auto mb-3" />
            <p className="text-sm text-ink-3 mb-1">No updates yet for {clientName}</p>
            <p className="text-xs text-ink-4">Create your first update to push operational changes everywhere at once.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {initialUpdates.map(u => (
              <UpdateRow
                key={u.id}
                update={u}
                fanouts={initialFanouts[u.id] ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Single update row ─────────────────────────────────────────

function UpdateRow({ update, fanouts }: { update: UpdateRecord; fanouts: UpdateFanoutRecord[] }) {
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState<FanoutTarget | null>(null)

  const handleRetry = async (target: FanoutTarget) => {
    setRetrying(target)
    await retryFanout(update.id, target)
    setRetrying(null)
  }

  const successCount = fanouts.filter(f => f.status === 'success').length
  const failedCount = fanouts.filter(f => f.status === 'failed').length

  return (
    <div className="rounded-lg border border-ink-6 bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-bg-2/50"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-ink-4 mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-ink-4 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-ink capitalize">{update.type.replace('_', ' ')}</span>
            <span className="text-ink-3">·</span>
            <span className="text-ink-3 truncate">{update.summary ?? 'No summary'}</span>
          </div>
          <div className="text-xs text-ink-4 mt-0.5">
            {new Date(update.createdAt).toLocaleString()}
          </div>
        </div>
        <StatusPill update={update} successCount={successCount} failedCount={failedCount} total={fanouts.length} />
      </button>

      {open && (
        <div className="border-t border-ink-6 px-4 py-3 space-y-2 bg-bg-2/30">
          {fanouts.length === 0 ? (
            <p className="text-xs text-ink-3">No fanout targets recorded.</p>
          ) : (
            fanouts.map(f => (
              <FanoutRow
                key={f.id}
                fanout={f}
                onRetry={() => handleRetry(f.target)}
                isRetrying={retrying === f.target}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({
  update, successCount, failedCount, total,
}: { update: UpdateRecord; successCount: number; failedCount: number; total: number }) {
  if (update.status === 'published' && failedCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium">
        <CheckCircle2 className="w-2.5 h-2.5" /> Published
      </span>
    )
  }
  if (update.status === 'failed' || failedCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-medium">
        <AlertCircle className="w-2.5 h-2.5" /> {successCount}/{total} succeeded
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ink-6 text-ink-3 text-[10px] font-medium capitalize">
      {update.status}
    </span>
  )
}

function FanoutRow({
  fanout, onRetry, isRetrying,
}: { fanout: UpdateFanoutRecord; onRetry: () => void; isRetrying: boolean }) {
  const { label, Icon } = TARGET_LABELS[fanout.target]
  const statusColor = {
    success: 'text-emerald-600', failed: 'text-red-500', in_progress: 'text-ink-3',
    pending: 'text-ink-3', skipped: 'text-ink-4', rate_limited: 'text-amber-600',
  }[fanout.status]
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-ink-4" />
        <span className="font-medium">{label}</span>
        <span className={statusColor + ' capitalize'}>{fanout.status.replace('_', ' ')}</span>
        {fanout.errorMessage && (
          <span className="text-ink-3 truncate max-w-md" title={fanout.errorMessage}>
            · {fanout.errorMessage}
          </span>
        )}
      </div>
      {fanout.status === 'failed' && (
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex items-center gap-1 text-ink-3 hover:text-ink"
        >
          {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Retry
        </button>
      )}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────

function buildDefaultHours(loc: Location | undefined): WeeklyHours {
  const empty: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
  if (!loc?.hours) return seedTypicalHours()
  const existing = loc.hours as Partial<WeeklyHours>
  const days: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  for (const d of days) {
    if (Array.isArray(existing[d])) empty[d] = existing[d]!
  }
  return empty
}

function seedTypicalHours(): WeeklyHours {
  // Typical restaurant: closed Mon, 11-22 Tue-Sat, 11-21 Sun
  return {
    mon: [],
    tue: [{ open: '11:00', close: '22:00' }],
    wed: [{ open: '11:00', close: '22:00' }],
    thu: [{ open: '11:00', close: '22:00' }],
    fri: [{ open: '11:00', close: '23:00' }],
    sat: [{ open: '11:00', close: '23:00' }],
    sun: [{ open: '11:00', close: '21:00' }],
  }
}

function buildDefaultClosure(): ClosurePayload {
  // Default to "tomorrow, all day" -- common case for next-day announcements
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const dayAfter = new Date(tomorrow)
  dayAfter.setDate(dayAfter.getDate() + 1)
  return {
    starts_at: tomorrow.toISOString(),
    ends_at: dayAfter.toISOString(),
    kind: 'planned',
    reason: '',
    customer_message: '',
  }
}

function buildDefaultMenuItem(): MenuItemPayload {
  return {
    action: 'add',
    item: {
      name: '',
      description: '',
      availability: 'always',
    },
  }
}

function buildDefaultPromotion(): PromotionPayload {
  // Default to "starts today, ends in 7 days"
  const now = new Date()
  const ends = new Date(now)
  ends.setDate(ends.getDate() + 7)
  return {
    name: '',
    description: '',
    discount_type: 'percent',
    valid_from: now.toISOString(),
    valid_until: ends.toISOString(),
  }
}

function buildDefaultEvent(): EventPayload {
  // Default: 7 days from now, 7-9pm
  const start = new Date()
  start.setDate(start.getDate() + 7)
  start.setHours(19, 0, 0, 0)
  const end = new Date(start)
  end.setHours(21, 0, 0, 0)
  return {
    name: '',
    description: '',
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  }
}
