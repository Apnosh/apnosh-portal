/**
 * /work/shoots/[id] — shoot day brief + upload.
 *
 * Mobile-first detail view. Shows: location with tap-to-Maps, brief,
 * shot list checklist, contact tap-to-call, and an upload button.
 *
 * Phase 0 ships the read surface + a stub uploader (links to a future
 * /api/shoots/[id]/upload endpoint). File handling lands in Phase 2.5.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Clock, Phone, User, FileText, Upload, CheckSquare, Square } from 'lucide-react'
import { getMyCapabilities } from '@/lib/auth/capabilities'
import { requireCapability } from '@/lib/auth/require-capability'
import { getShootDetail } from '@/lib/work/get-shoots'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ShootDetailPage({ params }: PageProps) {
  const caps = await getMyCapabilities()
  const ok = caps.some(c => c.role === 'videographer' || c.role === 'photographer' || c.role === 'admin')
  if (!ok) await requireCapability('videographer')

  const { id } = await params
  const shoot = await getShootDetail(id)
  if (!shoot) notFound()

  const mapsHref = shoot.locationAddr
    ? `https://maps.apple.com/?q=${encodeURIComponent(shoot.locationAddr)}`
    : null
  const callHref = shoot.contactPhone ? `tel:${shoot.contactPhone.replace(/[^0-9+]/g, '')}` : null

  return (
    <div className="max-w-2xl mx-auto py-5 px-4">
      <Link
        href="/work/shoots"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All shoots
      </Link>

      <header className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">
          {shoot.clientName}
        </p>
        <h1 className="text-[24px] font-bold text-ink tracking-tight leading-tight mt-1">
          {shoot.title}
        </h1>
        <div className="flex items-center gap-2 mt-2 text-[13px] text-ink-3">
          <Clock className="w-4 h-4" />
          <span>{new Date(shoot.scheduledAt).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          <span className="text-ink-5">·</span>
          <span>{shoot.durationMin}m</span>
        </div>
      </header>

      {/* Location */}
      {(shoot.locationName || shoot.locationAddr) && (
        <Card icon={<MapPin className="w-4 h-4" />} title="Location">
          <p className="text-[14px] font-semibold text-ink leading-snug">{shoot.locationName}</p>
          {shoot.locationAddr && (
            <p className="text-[13px] text-ink-3 mt-0.5 leading-snug">{shoot.locationAddr}</p>
          )}
          {shoot.locationNotes && (
            <p className="text-[12px] text-ink-4 mt-2 leading-snug">{shoot.locationNotes}</p>
          )}
          {mapsHref && (
            <a
              href={mapsHref}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-700 hover:text-amber-800"
            >
              Open in Maps →
            </a>
          )}
        </Card>
      )}

      {/* Contact */}
      {(shoot.contactName || shoot.contactPhone) && (
        <Card icon={<User className="w-4 h-4" />} title="On-site contact">
          {shoot.contactName && <p className="text-[14px] font-semibold text-ink">{shoot.contactName}</p>}
          {callHref && (
            <a
              href={callHref}
              className="mt-2 inline-flex items-center gap-2 text-[13px] font-semibold text-amber-700"
            >
              <Phone className="w-3.5 h-3.5" />
              {shoot.contactPhone}
            </a>
          )}
        </Card>
      )}

      {/* Brief */}
      {Object.keys(shoot.brief).length > 0 && (
        <Card icon={<FileText className="w-4 h-4" />} title="Brief">
          <BriefBlock brief={shoot.brief} />
        </Card>
      )}

      {/* Shot list */}
      {shoot.shotList.length > 0 && (
        <Card icon={<CheckSquare className="w-4 h-4" />} title={`Shot list · ${shoot.shotList.length}`}>
          <ul className="space-y-2">
            {shoot.shotList.map((shot, i) => (
              <li key={i} className="flex items-start gap-2.5">
                {shot.done
                  ? <CheckSquare className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  : <Square className="w-4 h-4 text-ink-5 mt-0.5 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className={`text-[13px] leading-snug ${shot.done ? 'text-ink-4 line-through' : 'text-ink'}`}>
                    {shot.label}
                  </p>
                  {shot.notes && <p className="text-[11px] text-ink-4 mt-0.5">{shot.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Mood board */}
      {shoot.moodBoardUrls.length > 0 && (
        <Card icon={<FileText className="w-4 h-4" />} title="Mood board">
          <div className="grid grid-cols-3 gap-2">
            {shoot.moodBoardUrls.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noopener">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="aspect-square w-full object-cover rounded-lg" />
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Upload */}
      <div className="mt-6">
        <a
          href={`/api/shoots/${shoot.id}/upload`}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-ink text-white text-[14px] font-semibold py-3.5 hover:bg-ink-2 active:scale-[0.99] transition-all"
        >
          <Upload className="w-4 h-4" />
          Upload footage
        </a>
        <p className="text-[11px] text-ink-4 text-center mt-2">
          Upload when you wrap. Strategist gets notified automatically.
        </p>
      </div>

      {shoot.uploads.length > 0 && (
        <Card icon={<Upload className="w-4 h-4" />} title={`Uploaded · ${shoot.uploads.length}`}>
          <ul className="space-y-1">
            {shoot.uploads.map(u => (
              <li key={u.id} className="text-[12px] text-ink-3 truncate">
                <a href={u.storageUrl} className="hover:text-ink underline-offset-2 hover:underline">
                  {u.fileName}
                </a>
                <span className="text-ink-5"> · {new Date(u.uploadedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl border bg-white p-4 mb-3"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-center gap-2 mb-2.5 text-ink-3">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{title}</p>
      </div>
      {children}
    </section>
  )
}

function BriefBlock({ brief }: { brief: Record<string, unknown> }) {
  const entries = Object.entries(brief).filter(([, v]) => v != null && v !== '')
  if (entries.length === 0) return <p className="text-[12px] text-ink-4">No brief yet.</p>
  return (
    <dl className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">{k.replace(/_/g, ' ')}</dt>
          <dd className="text-[13px] text-ink leading-snug mt-0.5">{String(v)}</dd>
        </div>
      ))}
    </dl>
  )
}
