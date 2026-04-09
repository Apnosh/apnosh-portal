import { redirect } from 'next/navigation'

export default function NewRequestRedirect() {
  redirect('/dashboard/social/requests/new')
}
