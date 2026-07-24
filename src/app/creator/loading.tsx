/**
 * Instant loading skeleton for every creator screen. Before this, the creator routes had no
 * loading.tsx, so tapping a tab froze on the old screen until the server render + its data
 * round-trips finished ("buttons take forever"). This Suspense fallback shows immediately on
 * navigation (and lets the bottom-nav Links prefetch), so switching tabs feels instant.
 *
 * It fills the layout's scroll frame (the header + bottom nav persist), matching the card look.
 */
export default function CreatorLoading() {
  return (
    <div style={{ background: '#f5f5f7', minHeight: '100%', padding: '16px 14px 32px', boxSizing: 'border-box' }}>
      <style>{`
        @keyframes csk-pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        .csk { background: #e9e9ee; border-radius: 8px; animation: csk-pulse 1.2s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .csk { animation: none } }
      `}</style>
      <div className="csk" style={{ height: 26, width: 150, marginBottom: 8 }} />
      <div className="csk" style={{ height: 13, width: 220, marginBottom: 20, opacity: 0.7 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: '#fff', border: '0.5px solid #e6e6ea', borderRadius: 16, padding: '14px 16px', marginBottom: 11 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="csk" style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="csk" style={{ height: 14, width: '55%', marginBottom: 8 }} />
              <div className="csk" style={{ height: 11, width: '35%', opacity: 0.7 }} />
            </div>
          </div>
          <div className="csk" style={{ height: 34, width: 128, borderRadius: 12, marginTop: 14 }} />
        </div>
      ))}
    </div>
  )
}
