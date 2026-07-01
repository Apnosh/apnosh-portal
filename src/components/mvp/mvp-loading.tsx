/**
 * Full-screen loading skeleton that mirrors the MvpShell frame (grey backdrop,
 * centered phone-width white column, a faint top bar + a few shimmer blocks).
 * Used as the loading.tsx for every owner mvp route so navigation no longer
 * flashes the old desktop column before the real screen mounts — the skeleton
 * and the page share the same shape, so it's a seamless swap.
 */
export default function MvpLoading() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ width: '100%', maxWidth: 480, height: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        {/* top bar */}
        <div style={{ flexShrink: 0, height: 52, borderBottom: '1px solid #e6e6ea', display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px' }}>
          <span className="mvp-skel" style={{ width: 30, height: 30, borderRadius: '50%' }} />
          <span className="mvp-skel" style={{ width: 130, height: 15, borderRadius: 6 }} />
          <span style={{ flex: 1 }} />
          <span className="mvp-skel" style={{ width: 24, height: 24, borderRadius: '50%' }} />
          <span className="mvp-skel" style={{ width: 24, height: 24, borderRadius: '50%' }} />
        </div>
        {/* content */}
        <div style={{ flex: 1, background: '#f5f5f7', padding: '16px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 16 }}>
            <span className="mvp-skel" style={{ height: 62, borderRadius: 16, display: 'block' }} />
            <span className="mvp-skel" style={{ height: 62, borderRadius: 16, display: 'block' }} />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="mvp-skel" style={{ display: 'block', height: 60, borderRadius: 16, marginBottom: 12 }} />
          ))}
        </div>
      </div>
      <style>{`.mvp-skel{background:#e7e7ec;animation:mvpskel 1.2s ease-in-out infinite}@keyframes mvpskel{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  )
}
