import { redirect } from 'next/navigation'

// The requests concept folded into Messages (owner↔team chat).
export default function NewRequestRedirect() {
  redirect('/dashboard/messages')
}
