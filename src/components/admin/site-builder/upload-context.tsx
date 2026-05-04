'use client'

/**
 * Asset context — passes upload callback + library opener through nested
 * fields so AssetField can render real file input + "browse library"
 * without each leaf needing wiring.
 */

import { createContext, useContext, type ReactNode } from 'react'

export type UploadAssetFn = (file: File) => Promise<{ url: string } | { error: string }>
export type OpenLibraryFn = (onPick: (url: string) => void) => void

interface AssetCtxValue {
  upload: UploadAssetFn | null
  openLibrary: OpenLibraryFn | null
}

const AssetCtx = createContext<AssetCtxValue>({ upload: null, openLibrary: null })

export function UploadProvider({
  children, upload, openLibrary,
}: {
  children: ReactNode
  upload: UploadAssetFn
  openLibrary?: OpenLibraryFn
}) {
  return <AssetCtx.Provider value={{ upload, openLibrary: openLibrary ?? null }}>{children}</AssetCtx.Provider>
}

export function useUploadAsset(): UploadAssetFn | null {
  return useContext(AssetCtx).upload
}

export function useOpenLibrary(): OpenLibraryFn | null {
  return useContext(AssetCtx).openLibrary
}
