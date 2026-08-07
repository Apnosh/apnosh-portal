import { redirect } from 'next/navigation'

// The Request Desk owns request creation now (type picker on the hub).
export default function NewRequestRedirect() {
  redirect('/dashboard/requests')
}
