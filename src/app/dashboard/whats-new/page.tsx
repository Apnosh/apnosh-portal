'use client'
/**
 * /dashboard/whats-new — the latest changes, one line each, newest first (owner 2026-09-05).
 * Kept by hand: add a line when something owners can see ships. Plain words only.
 */
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C, DISPLAY } from '@/components/mvp/mvp-detail'
import { gradOf } from '@/components/mvp/hues'
import { NEWS } from '@/lib/whats-new'

export default function WhatsNewPage() {
  return (
    <MvpShell active="more" header={<MvpDetailHeader title="What's new" subtitle="The latest changes" />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '10px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {NEWS.map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 2px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: gradOf(n.hue), flexShrink: 0, marginTop: 6 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 15.5, fontWeight: 600, color: C.ink }}>{n.title}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: C.faint, flexShrink: 0 }}>{n.date}</span>
              </div>
              <div style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5, marginTop: 2 }}>{n.body}</div>
            </div>
          </div>
        ))}
      </div>
    </MvpShell>
  )
}
