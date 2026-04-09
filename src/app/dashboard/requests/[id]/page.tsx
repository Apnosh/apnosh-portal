import { redirect } from 'next/navigation'

export default async function RequestDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/dashboard/social/requests/${id}`)
}
