'use client'

/**
 * Lightweight context for asset upload — passes a single async upload
 * callback through nested fields so the AssetField can render a real file
 * input without each leaf needing supabase client wiring.
 */

import { createContext, useContext, type ReactNode } from 'react'

export type UploadAssetFn = (file: File) => Promise<{ url: string } | { error: string }>

const UploadContext = createContext<UploadAssetFn | null>(null)

export function UploadProvider({ children, upload }: { children: ReactNode; upload: UploadAssetFn }) {
  return <UploadContext.Provider value={upload}>{children}</UploadContext.Provider>
}

export function useUploadAsset(): UploadAssetFn | null {
  return useContext(UploadContext)
}
