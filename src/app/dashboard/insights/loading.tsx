/**
 * Full-screen loading frame for /dashboard/insights, matching MvpInsights so
 * the click registers instantly without flashing the old desktop skeleton.
 */
export default function InsightsLoading() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#fff', maxWidth: 480, margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '12px 12px 12px 16px', borderBottom: '1px solid #e6e6ea' }}>
        <div style={{ fontFamily: "'Cal Sans','Inter',sans-serif", fontWeight: 600, fontSize: 18, color: '#1d1d1f' }}>Insights</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6e6e73', fontSize: 14 }}>Loading your numbers&hellip;</div>
    </div>
  )
}
