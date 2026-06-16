import { redirect } from 'next/navigation'

// The redesigned home now lives at /dashboard; this old review URL just
// forwards there so existing links keep working.
export default function MvpHomeRedirect() {
  redirect('/dashboard')
}
