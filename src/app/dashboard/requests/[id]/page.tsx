import { redirect } from 'next/navigation'

// The requests concept folded into Messages (owner↔team chat).
// The per-request detail page no longer exists, so the id is dropped.
export default function RequestDetailRedirect() {
  redirect('/dashboard/messages')
}
