'use client'

import { use } from 'react'
import { ClientRequestDetail } from '@/components/dashboard/request-detail'

export default function SocialRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <ClientRequestDetail requestId={id} backHref="/dashboard/social/requests" />
}
