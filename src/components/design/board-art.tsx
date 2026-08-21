'use client'

/**
 * BOARD ART — a bespoke miniature illustration for every graphic type (owner
 * call 2026-08-21: "it's just colors, make it customized"). Each type gets its
 * own tiny line-art scene, drawn in ink with the group's color as the accent,
 * so a tile looks like the graphic it makes, not a swatch. Pure inline SVG:
 * crisp at any size, zero assets, themed by props.
 */

import type { DesignJobId } from '@/lib/design/design-read'

const INK = '#33403A'

export function BoardArt({ id, dot }: { id: DesignJobId; dot: string }) {
  const common = { width: '100%', height: '100%' } as const
  const s = { stroke: INK, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const a = { ...s, stroke: dot }
  const fillA = { fill: dot, opacity: 0.55 }

  switch (id) {
    case 'story-behind': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="21" y="6" width="30" height="30" rx="2" transform="rotate(-4 36 21)" {...s} />
        <rect x="25.5" y="10" width="21" height="15" rx="1" transform="rotate(-4 36 18)" {...fillA} stroke="none" />
        <path d="M20 45h32M26 50h20" {...a} />
      </svg>)
    case 'team-spotlight': return (
      <svg viewBox="0 0 72 52" style={common}>
        <circle cx="22" cy="18" r="6" {...s} /><path d="M12 40c1-8 6-11 10-11s9 3 10 11" {...s} />
        <circle cx="50" cy="18" r="6" {...a} /><path d="M40 40c1-8 6-11 10-11s9 3 10 11" {...a} />
      </svg>)
    case 'behind-scenes': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="14" y="18" width="44" height="26" rx="3" {...s} />
        <path d="M14 24l44-8-2-8-44 8z" {...s} />
        <path d="M20 14l6 7M32 12l6 7M44 10l6 7" {...a} />
      </svg>)
    case 'before-after': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="8" y="12" width="22" height="28" rx="3" {...s} opacity="0.45" />
        <rect x="42" y="12" width="22" height="28" rx="3" {...a} />
        <path d="M32 26h8M37 22l4 4-4 4" {...s} />
      </svg>)
    case 'guest-love': return (
      <svg viewBox="0 0 72 52" style={common}>
        <path d="M10 40h34" {...s} opacity="0.5" /><path d="M10 46h22" {...s} opacity="0.5" />
        <text x="8" y="26" fontSize="26" fill={INK} fontFamily="Georgia,serif">“</text>
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${26 + i * 9} 12l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-2-3.3 2 .8-3.7-2.8-2.5 3.7-.4z`} {...fillA} stroke="none" />
        ))}
      </svg>)
    case 'milestone': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="18" y="26" width="36" height="18" rx="3" {...s} />
        <path d="M18 34h36" {...s} opacity="0.4" />
        <path d="M28 26v-8M36 26v-10M44 26v-8" {...a} />
        <circle cx="28" cy="15" r="1.8" {...fillA} stroke="none" /><circle cx="36" cy="13" r="1.8" {...fillA} stroke="none" /><circle cx="44" cy="15" r="1.8" {...fillA} stroke="none" />
      </svg>)
    case 'community': return (
      <svg viewBox="0 0 72 52" style={common}>
        <path d="M36 42s-16-9.5-16-20a9 9 0 0 1 16-5.6A9 9 0 0 1 52 22c0 10.5-16 20-16 20z" {...a} />
        <path d="M14 46h44" {...s} opacity="0.45" />
      </svg>)
    case 'new-menu': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="18" y="6" width="36" height="42" rx="3" {...s} />
        <path d="M24 15h14M24 23h24M24 31h24M24 39h18" {...s} opacity="0.5" />
        <circle cx="46" cy="15" r="2" {...fillA} stroke="none" />
      </svg>)
    case 'new-item': return (
      <svg viewBox="0 0 72 52" style={common}>
        <circle cx="36" cy="28" r="16" {...s} /><circle cx="36" cy="28" r="9" {...a} />
        <path d="M54 8l1.4 3.6L59 13l-3.6 1.4L54 18l-1.4-3.6L49 13l3.6-1.4z" {...fillA} stroke="none" />
      </svg>)
    case 'announcement': return (
      <svg viewBox="0 0 72 52" style={common}>
        <path d="M14 22v8l6 2 4 12 6-2-3-9 15 5V10L20 20z" {...s} />
        <path d="M50 16l8-6M52 24l10-2M50 30l8 4" {...a} />
      </svg>)
    case 'press': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="12" y="8" width="48" height="36" rx="3" {...s} />
        <rect x="18" y="14" width="20" height="7" {...fillA} stroke="none" />
        <path d="M18 27h36M18 32h36M18 37h24" {...s} opacity="0.5" />
        <path d="M44 17h10" {...s} opacity="0.5" />
      </svg>)
    case 'collab': return (
      <svg viewBox="0 0 72 52" style={common}>
        <circle cx="28" cy="26" r="13" {...s} /><circle cx="44" cy="26" r="13" {...a} />
      </svg>)
    case 'catering': return (
      <svg viewBox="0 0 72 52" style={common}>
        <path d="M18 36a18 18 0 0 1 36 0" {...s} /><circle cx="36" cy="14" r="2.4" {...fillA} stroke="none" />
        <path d="M12 40h48" {...a} />
      </svg>)
    case 'holiday-hours': return (
      <svg viewBox="0 0 72 52" style={common}>
        <circle cx="36" cy="26" r="17" {...s} />
        <path d="M36 15v11l8 5" {...a} />
      </svg>)
    case 'carousel': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="8" y="12" width="14" height="24" rx="2" {...s} opacity="0.35" />
        <rect x="50" y="12" width="14" height="24" rx="2" {...s} opacity="0.35" />
        <rect x="25" y="8" width="22" height="30" rx="3" {...a} />
        <circle cx="31" cy="45" r="1.8" {...fillA} stroke="none" /><circle cx="36" cy="45" r="1.8" fill={INK} opacity="0.4" /><circle cx="41" cy="45" r="1.8" fill={INK} opacity="0.4" />
      </svg>)
    case 'tips': return (
      <svg viewBox="0 0 72 52" style={common}>
        <circle cx="36" cy="20" r="11" {...a} />
        <path d="M32 34h8M33 39h6" {...s} />
        <path d="M36 4v3M52 9l-2 2M20 9l2 2" {...s} opacity="0.6" />
      </svg>)
    case 'faq': return (
      <svg viewBox="0 0 72 52" style={common}>
        <path d="M10 10h30v16H22l-6 6v-6h-6z" {...s} />
        <path d="M34 28h28v14H50l5 6-9-6H34z" {...a} />
        <text x="20" y="22" fontSize="11" fontWeight="700" fill={INK} fontFamily="Inter,sans-serif">?</text>
      </svg>)
    case 'poll': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="12" y="14" width="40" height="8" rx="4" {...fillA} stroke="none" />
        <rect x="12" y="30" width="24" height="8" rx="4" fill={INK} opacity="0.3" />
        <circle cx="58" cy="18" r="3" {...a} /><circle cx="42" cy="34" r="3" {...s} opacity="0.5" />
      </svg>)
    case 'countdown': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="10" y="14" width="15" height="22" rx="2.5" {...s} />
        <rect x="29" y="14" width="15" height="22" rx="2.5" {...a} />
        <rect x="48" y="14" width="15" height="22" rx="2.5" {...s} />
        <path d="M14 42h44" {...s} opacity="0.4" />
      </svg>)
    case 'recap': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="12" y="8" width="22" height="17" rx="2" {...s} opacity="0.6" />
        <rect x="38" y="8" width="22" height="17" rx="2" {...fillA} stroke="none" />
        <rect x="12" y="29" width="22" height="17" rx="2" {...fillA} stroke="none" />
        <rect x="38" y="29" width="22" height="17" rx="2" {...s} opacity="0.6" />
      </svg>)
    case 'weekly-special': return (
      <svg viewBox="0 0 72 52" style={common}>
        <path d="M20 10h22l12 12v20a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z" {...s} />
        <circle cx="40" cy="18" r="2.6" {...a} />
        <path d="M26 40l16-14" {...a} /><circle cx="28" cy="28" r="2.6" {...a} /><circle cx="41" cy="38" r="2.6" {...a} />
      </svg>)
    case 'happy-hour': return (
      <svg viewBox="0 0 72 52" style={common}>
        <path d="M14 10l10 12v14M14 10h20l-10 12M24 36h-7m7 0h7" {...s} transform="rotate(-8 24 24)" />
        <path d="M58 10L48 22v14M58 10H38l10 12M48 36h-7m7 0h7" {...a} transform="rotate(8 48 24)" />
        <circle cx="36" cy="8" r="1.7" {...fillA} stroke="none" /><circle cx="32" cy="4" r="1.3" {...fillA} stroke="none" /><circle cx="40" cy="4" r="1.3" {...fillA} stroke="none" />
      </svg>)
    case 'hiring': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="18" y="14" width="36" height="30" rx="3" {...s} />
        <path d="M30 14v-4a6 6 0 0 1 12 0v4" {...s} />
        <circle cx="30" cy="27" r="4" {...a} />
        <path d="M40 25h10M40 31h10M24 38h24" {...s} opacity="0.5" />
      </svg>)
    case 'gift-cards': return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="12" y="14" width="48" height="28" rx="4" {...s} />
        <path d="M36 14v28M12 26h48" {...a} />
        <path d="M36 14c-4-8-14-6-12 0 1.6 4 8 2 12 0zm0 0c4-8 14-6 12 0-1.6 4-8 2-12 0z" {...a} />
      </svg>)
    case 'referral': return (
      <svg viewBox="0 0 72 52" style={common}>
        <circle cx="18" cy="16" r="6" {...s} /><path d="M8 38c1-8 5.5-11 10-11s9 3 10 11" {...s} />
        <circle cx="54" cy="16" r="6" {...a} /><path d="M44 38c1-8 5.5-11 10-11s9 3 10 11" {...a} />
        <path d="M30 22h12M38 18l4 4-4 4" {...a} />
      </svg>)
    default: return (
      <svg viewBox="0 0 72 52" style={common}>
        <rect x="14" y="8" width="44" height="36" rx="4" {...s} strokeDasharray="5 5" opacity="0.6" />
        <path d="M36 18v16M28 26h16" {...a} />
      </svg>)
  }
}
