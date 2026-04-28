'use client'

/**
 * Client-facing site management UI.
 *
 * Three sections:
 *  1. Site status card (which backend, published?, link to public site)
 *  2. Quick updates (hours / menu item / promo / event / closure / info)
 *     -- each opens a modal with the existing admin form, but submits via
 *     the client-auth createMyUpdate server action
 *  3. Recent updates list (last 10)
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Globe, ExternalLink, Clock, ListPlus, Tag, CalendarDays, AlertCircle, FileText,
  Loader2, X, CheckCircle2, ArrowRight,
} from 'lucide-react'
import { createMyUpdate, type MySiteOverview, type MyLocation } from '@/lib/dashboard/my-site-actions'
import { useLocationContext } from '@/lib/dashboard/location-context'
import HoursEditor from '@/components/admin/updates/hours-editor'
import MenuItemForm from '@/components/admin/updates/menu-item-form'
import PromotionForm from '@/components/admin/updates/promotion-form'
import EventForm from '@/components/admin/updates/event-form'
import ClosureForm from '@/components/admin/updates/closure-form'
import type {
  WeeklyHours, DayKey, HoursPayload, MenuItemPayload,
  PromotionPayload, EventPayload, ClosurePayload, UpdateType,
} from '@/lib/updates/types'

interface Props {
  overview: MySiteOverview
  locations: MyLocation[]
}

type QuickAction = 'hours' | 'menu_item' | 'promotion' | 'event' | 'closure'

const ACTION_META: Record<QuickAction, { label: string; sub: string; Icon: typeof Clock }> = {
  hours:      { label: 'Update hours',  sub: 'Change weekly hours', Icon: Clock },
  menu_item:  { label: 'Add menu item', sub: 'New dish or drink',   Icon: ListPlus },
  promotion:  { label: 'Run a promo',   sub: 'Discount or special', Icon: Tag },
  event:      { label: 'Add event',     sub: 'Live music, party',   Icon: CalendarDays },
  closure:    { label: 'Mark closure',  sub: 'Holiday or unplanned', Icon: AlertCircle },
}

const QUICK_ACTION_KEYS: QuickAction[] = ['hours', 'menu_item', 'promotion', 'event', 'closure']

export default function SiteManager({ overview, locations }: Props) {
  const router = useRouter()
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null)
  const [toast, setToast] = useState<{ msg: string } | null>(null)

  const siteLabel: Record<MySiteOverview['site']['siteType'], string> = {
    none: 'No site connected',
    apnosh_generated: 'Apnosh-built site',
    apnosh_custom: 'Custom Apnosh site',
    external_repo: 'Connected site',
  }

  return (
    <div className="space-y-6">
      {/* Site status card */}
      <div className="rounded-xl border border-ink-6 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-ink-3" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{siteLabel[overview.site.siteType]}</p>
              <p className="text-xs text-ink-3 mt-0.5">
                {overview.site.siteType === 'none'
                  ? 'Ask your account manager to set one up.'
                  : overview.site.isPublished || overview.site.siteType === 'external_repo'
                    ? 'Live and connected.'
                    : 'Not published yet.'}
              </p>
            </div>
          </div>
          {overview.site.publicUrl && (
            <Link
              href={overview.site.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-ink shrink-0"
            >
              View site <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Quick updates */}
      <section>
        <h2 className="text-[15px] font-bold text-ink mb-3">Quick updates</h2>
        <p className="text-xs text-ink-3 mb-3">
          Changes here push to your website, Google, and connected platforms automatically.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_ACTION_KEYS
            .filter(k => overview.selfServeTypes.includes(k))
            .map(key => {
            const meta = ACTION_META[key]
            const Icon = meta.Icon
            return (
              <button
                key={key}
                onClick={() => setActiveAction(key)}
                disabled={key === 'hours' && locations.length === 0}
                className="text-left rounded-xl border border-ink-6 bg-white p-4 hover:border-ink/30 hover:shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-9 h-9 rounded-lg bg-bg-2 flex items-center justify-center mb-2">
                  <Icon className="w-4 h-4 text-ink-3" />
                </div>
                <div className="text-sm font-medium text-ink">{meta.label}</div>
                <div className="text-xs text-ink-4 mt-0.5">{meta.sub}</div>
              </button>
            )
          })}
        </div>

        <div className="mt-3 text-xs text-ink-3">
          Need bigger changes (new section, copy rewrite, design tweak)?{' '}
          <Link href="/dashboard/website/requests/new" className="text-brand hover:underline">
            Send a change request <ArrowRight className="inline w-3 h-3" />
          </Link>
        </div>
      </section>

      {/* Recent updates */}
      <section>
        <h2 className="text-[15px] font-bold text-ink mb-3">Recent updates</h2>
        {overview.recentUpdates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-6 bg-white p-6 text-center text-sm text-ink-3">
            No updates yet.
          </div>
        ) : (
          <ul className="rounded-xl border border-ink-6 bg-white divide-y divide-ink-6">
            {overview.recentUpdates.map(u => (
              <li key={u.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-3 shrink-0">
                    {u.type}
                  </span>
                  <span className="text-ink truncate">{u.summary ?? 'Update'}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill status={u.status} />
                  <span className="text-xs text-ink-4">{relTime(u.publishedAt ?? '')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeAction && (
        <QuickEditModal
          action={activeAction}
          locations={locations}
          onClose={() => setActiveAction(null)}
          onSuccess={() => {
            const meta = ACTION_META[activeAction]
            setActiveAction(null)
            setToast({ msg: `${meta.label.replace(/^./, c => c.toUpperCase())} published. Live across your connected platforms.` })
            setTimeout(() => setToast(null), 6000)
            router.refresh()
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 bg-ink text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-sm animate-in fade-in slide-in-from-bottom-2"
        >
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  )
}

// ─── Quick edit modal ────────────────────────────────────────────

function QuickEditModal({
  action, locations, onClose, onSuccess,
}: {
  action: QuickAction
  locations: MyLocation[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Pull the currently-selected location from the global selector so the
  // modal opens with the user's existing context (if they're scoped to
  // Mountlake Terrace globally, that's the default for new updates too).
  const { selectedLocationId } = useLocationContext()

  // Whether this update type ALLOWS an "All locations" option.
  // Hours are per-location only; everything else can be brand-wide.
  const supportsAllLocations = action !== 'hours'

  // Per-form state, all initialized to defaults
  // For 'hours' we must pick one specific location; default to global selection
  // or first location. For other types, null = "All locations".
  const [locationId, setLocationId] = useState<string | null>(() => {
    if (action === 'hours') return selectedLocationId ?? locations[0]?.id ?? ''
    return selectedLocationId
  })
  const [hours, setHours] = useState<WeeklyHours>(() => buildDefaultHours(locations[0]))
  const [menuItem, setMenuItem] = useState<MenuItemPayload>(buildDefaultMenuItem)
  const [promotion, setPromotion] = useState<PromotionPayload>(buildDefaultPromotion)
  const [event, setEvent] = useState<EventPayload>(buildDefaultEvent)
  const [closure, setClosure] = useState<ClosurePayload>(buildDefaultClosure)

  const handleSubmit = async () => {
    setBusy(true)
    setError(null)

    let payload: HoursPayload | MenuItemPayload | PromotionPayload | EventPayload | ClosurePayload
    let summary = ''
    let locId: string | null = null

    // locId carries the user's "Apply to" choice. null = all locations.
    locId = locationId ?? null

    switch (action) {
      case 'hours':
        if (!locId) { setError('Pick a location'); setBusy(false); return }
        payload = { scope: 'regular', weekly: hours }
        summary = 'Hours updated'
        break
      case 'menu_item':
        payload = menuItem
        summary = `Menu: ${menuItem.item.name || 'new item'}`
        break
      case 'promotion':
        payload = promotion
        summary = `Promo: ${promotion.name || 'new promotion'}`
        break
      case 'event':
        payload = event
        summary = `Event: ${event.name || 'new event'}`
        break
      case 'closure':
        payload = closure
        summary = closure.reason ? `Closure: ${closure.reason}` : 'Closure'
        break
    }

    const res = await createMyUpdate({
      type: action as UpdateType,
      payload,
      summary,
      locationId: locId,
    })
    setBusy(false)

    if (res.success) {
      startTransition(onSuccess)
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-6">
          <h3 className="text-base font-semibold text-ink">{ACTION_META[action].label}</h3>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Apply-to picker: shown whenever the client has multiple locations.
              Hours must target one specific location; everything else can be
              brand-wide ("All locations") or scoped to a single store. */}
          {locations.length > 1 && (
            <div className="mb-4">
              <label className="text-xs font-medium text-ink-3 block mb-1">Apply to</label>
              <select
                value={locationId ?? '__all__'}
                onChange={e => setLocationId(e.target.value === '__all__' ? null : e.target.value)}
                className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
              >
                {supportsAllLocations && (
                  <option value="__all__">All locations</option>
                )}
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-ink-4 mt-1">
                {action === 'hours'
                  ? 'Hours are per-location. Pick which one this change applies to.'
                  : locationId
                    ? `Only the ${locations.find(l => l.id === locationId)?.name} listing will receive this update.`
                    : 'This update will be published for every connected location.'}
              </p>
            </div>
          )}

          {action === 'hours' && <HoursEditor weekly={hours} onChange={setHours} />}
          {action === 'menu_item' && <MenuItemForm payload={menuItem} onChange={setMenuItem} />}
          {action === 'promotion' && <PromotionForm payload={promotion} onChange={setPromotion} />}
          {action === 'event' && <EventForm payload={event} onChange={setEvent} />}
          {action === 'closure' && <ClosureForm payload={closure} onChange={setClosure} />}

          {error && (
            <div className="mt-3 text-sm rounded-md px-3 py-2 bg-red-50 text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-ink-6 bg-bg-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-md border border-ink-6 text-sm text-ink-3 hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-ink text-white text-sm font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <CheckCircle2 className="w-4 h-4" />}
            {busy ? 'Publishing…' : 'Publish update'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:      'bg-gray-50 text-gray-600 border-gray-200',
    review:     'bg-yellow-50 text-yellow-700 border-yellow-200',
    scheduled:  'bg-blue-50 text-blue-700 border-blue-200',
    publishing: 'bg-blue-50 text-blue-700 border-blue-200',
    published:  'bg-green-50 text-green-700 border-green-200',
    failed:     'bg-red-50 text-red-700 border-red-200',
    cancelled:  'bg-gray-50 text-gray-500 border-gray-200',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${map[status] ?? map.draft}`}>
      {status}
    </span>
  )
}

function relTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ─── Default payloads ───────────────────────────────────────────

function buildDefaultHours(loc?: MyLocation): WeeklyHours {
  const days: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const empty = Object.fromEntries(days.map(d => [d, [{ open: '09:00', close: '17:00' }]])) as WeeklyHours
  if (!loc?.hours) return empty
  const existing = loc.hours as Partial<WeeklyHours>
  return {
    mon: existing.mon ?? empty.mon,
    tue: existing.tue ?? empty.tue,
    wed: existing.wed ?? empty.wed,
    thu: existing.thu ?? empty.thu,
    fri: existing.fri ?? empty.fri,
    sat: existing.sat ?? empty.sat,
    sun: existing.sun ?? empty.sun,
  }
}

function buildDefaultMenuItem(): MenuItemPayload {
  return {
    action: 'add',
    item: { name: '', description: '', allergens: [], dietary: [] },
  }
}

function buildDefaultPromotion(): PromotionPayload {
  const today = new Date().toISOString()
  const oneWeek = new Date(Date.now() + 7 * 86400_000).toISOString()
  return {
    name: '',
    description: '',
    discount_type: 'percent',
    discount_value: 10,
    valid_from: today,
    valid_until: oneWeek,
  }
}

function buildDefaultEvent(): EventPayload {
  const tomorrow = new Date(Date.now() + 86400_000).toISOString()
  const tomorrowEnd = new Date(Date.now() + 86400_000 + 2 * 3600_000).toISOString()
  return {
    name: '',
    description: '',
    start_at: tomorrow,
    end_at: tomorrowEnd,
  }
}

function buildDefaultClosure(): ClosurePayload {
  const today = new Date().toISOString()
  return {
    kind: 'planned',
    starts_at: today,
    ends_at: today,
    reason: '',
  }
}
