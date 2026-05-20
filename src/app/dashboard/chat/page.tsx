/**
 * /dashboard/chat — AI tab landing.
 *
 * This route exists so the mobile bottom tab bar's "AI" item has a
 * stable, prefetchable href that we can highlight as active. The
 * actual UI is the floating AgentChat panel mounted in the dashboard
 * layout, which we trigger via the ?chat=open deep-link.
 *
 * Behavior:
 *   - Browser hits /dashboard/chat
 *   - Server redirects to /dashboard?chat=open
 *   - AgentChat (in layout) reads ?chat=open and slides in
 *   - User sees the chat overlay on top of the Today page
 *
 * In a future iteration we'll likely build a full-screen chat view
 * here for mobile rather than overlay-on-Today, but the floating
 * panel is the same UX the desktop has and "good enough" for now.
 */

import { redirect } from 'next/navigation'

export default function ChatTabPage() {
  redirect('/dashboard?chat=open')
}
