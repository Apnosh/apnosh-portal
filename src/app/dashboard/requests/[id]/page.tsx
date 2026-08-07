import { redirect } from 'next/navigation'

// Requests live on the desk hub (each row expands in place), so the id is dropped.
export default function RequestDetailRedirect() {
  redirect('/dashboard/requests')
}
