/**
 * /work/shoots — field roster for videographers + photographers.
 *
 * Mobile-first list of shoots crewed by the signed-in person. Grouped
 * into Today / This week / Later. Tap any row to go to the brief.
 *
 * Gated by videographer OR photographer capability (admins pass too).
 */

import Link from 'next/link'
import { Camera, MapPin, Clock, ChevronRight, CalendarDays } from 'lucide-react'
import { requireCapability } from '@/lib/auth/require-capability'
import { getMyCapabilities } from '@/lib/auth/capabilities'
import { getMyShoots, type FieldShoot } from '@/lib/work/get-shoots'

export const dynamic = 'force-dynamic'

export default async function ShootsListPage() {
  // Either capability is fine; check both manually.
  const caps = await getMyCapabilities()
  const ok = caps.some(c => c.role === 'videographer' || c.role === 'photographer' || c.role === 'visual_creator' || c.role === 'admin')
  if (!ok) await requireCapability('videographer') // triggers the redirect

  const shoots = await getMyShoots()
  const buckets = bucketShoots(shoots)

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100 flex-shrink-0">
            <Camera className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] leading-tight font-bold text-ink tracking-tight">
            Shoot day
          </h1>
        </div>
        <p className="text-[13px] text-ink-3 leading-relaxed ml-10">
          Tap a shoot to see the brief, location, and shot list. Upload footage when you wrap.
        </p>
      </header>

      {shoots.length === 0 && <EmptyState />}

      {buckets.today.length > 0 && (
        <Section title="Today" tone="warn" shoots={buckets.today} />
      )}
      {buckets.week.length > 0 && (
        <Section title="This week" tone="default" shoots={buckets.week} />
      )}
      {buckets.later.length > 0 && (
        <Section title="Later" tone="muted" shoots={buckets.later} />
      )}
    </div>
  )
}

function bucketShoots(all: FieldShoot[]) {
  const today: FieldShoot[] = []
  const week: FieldShoot[] = []
  const later: FieldShoot[] = []
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  for (const s of all) {
    const t = new Date(s.scheduledAt).getTime()
    const days = (t - now) / dayMs
    if (days < 1) today.push(s)
    else if (days < 7) week.push(s)
    else later.push(s)
  }
  return { today, week, later }
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3 ring-1 ring-amber-100">
        <CalendarDays className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">No shoots yet</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
        When a strategist books you, the shoot lands here with the brief and the address.
      </p>
    </div>
  )
}

function Section({ title, tone, shoots }: { title: string; tone: 'warn' | 'default' | 'muted'; shoots: FieldShoot[] }) {
  const toneClass =
    tone === 'warn' ? 'text-amber-700'
    : tone === 'muted' ? 'text-ink-4'
    : 'text-ink-3'
  return (
    <section className="mb-6">
      <h2 className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${toneClass} mb-2`}>
        {title}
      </h2>
      <ul className="space-y-2">
        {shoots.map(s => <ShootRow key={s.id} shoot={s} />)}
      </ul>
    </section>
  )
}

function ShootRow({ shoot }: { shoot: FieldShoot }) {
  return (
    <li>
      <Link
        href={`/work/shoots/${shoot.id}`}
        className="block rounded-xl border bg-white p-3.5 hover:shadow-sm transition-shadow active:scale-[0.99]"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              {shoot.isLead && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                  Lead
                </span>
              )}
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider">
                {shoot.clientName}
              </span>
            </div>
            <p className="text-[15px] font-semibold text-ink leading-snug truncate">
              {shoot.title}
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-[12px] text-ink-3">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {timeLabel(shoot.scheduledAt, shoot.durationMin)}
              </span>
              {shoot.locationName && (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="w-3.5 h-3.5" />
                  {shoot.locationName}
                </span>
              )}
            </div>
            {shoot.shotListCount > 0 && (
              <p className="text-[11px] text-ink-4 mt-1">{shoot.shotListCount} shots</p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-1" />
        </div>
      </Link>
    </li>
  )
}

function timeLabel(iso: string, durationMin: number): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return `${date} · ${time} · ${durationMin}m`
}
