'use client'

import { use } from 'react'
import { ClientRequestDetail } from '@/components/dashboard/request-detail'

export default function WebsiteRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <ClientRequestDetail requestId={id} backHref="/dashboard/website/requests" />
}
