/**
 * Full-screen loading frame for /dashboard/insights, matching MvpInsights so
 * the click registers instantly without flashing the old desktop skeleton.
 */
export default function InsightsLoading() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, height: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '12px 12px 12px 16px', borderBottom: '1px solid #e6e6ea' }}>
          <div style={{ fontFamily: "'Cal Sans','Inter',sans-serif", fontWeight: 600, fontSize: 18, color: '#1d1d1f' }}>Insights</div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6e6e73', fontSize: 14 }}>Loading your numbers&hellip;</div>
      </div>
    </div>
  )
}
