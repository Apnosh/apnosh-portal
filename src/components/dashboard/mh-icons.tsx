'use client'

/* Shared inline icons + sparkline for the mobile home (ported from the
   approved preview). Stroke icons render via dangerouslySetInnerHTML so
   we keep the exact preview paths. */

export const MH_ICONS: Record<string, string> = {
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.26a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>',
  cursor: '<path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  reply: '<path d="M9 17 4 12l5-5"/><path d="M4 12h11a4 4 0 0 1 4 4v2"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1.1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8"/>',
  trenddown: '<path d="M22 17 13.5 8.5l-5 5L2 7"/><path d="M16 17h6v-6"/>',
  calplus: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
}

export function MhIcon({ name, className, sw = 1.8 }: { name: string; className?: string; sw?: number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: MH_ICONS[name] ?? '' }} />
  )
}

export function MhSpark({ vals, dir }: { vals: number[]; dir: 'up' | 'down' }) {
  const w = 58, h = 30
  const min = Math.min(...vals), max = Math.max(...vals), rg = Math.max(max - min, 0.0001)
  const pts = vals.map((v, i) => ({ x: (i * w) / (vals.length - 1), y: (h - 3) - ((v - min) / rg) * (h - 6) }))
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ')
  const area = d + ` L ${w} ${h} L 0 ${h} Z`
  const col = dir === 'down' ? 'var(--drop)' : 'var(--brand)'
  const fc = dir === 'down' ? 'rgba(194,69,61,0.12)' : 'rgba(74,189,152,0.14)'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" preserveAspectRatio="none">
      <path d={area} fill={fc} />
      <path d={d} stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
