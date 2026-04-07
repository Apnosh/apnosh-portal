'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileSpreadsheet } from 'lucide-react'

interface FileDropZoneProps {
  onFile: (file: File) => void
  accept?: string
  disabled?: boolean
}

export function FileDropZone({ onFile, accept = '.xlsx,.csv', disabled }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile, disabled])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }, [disabled])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${
        dragging
          ? 'border-brand bg-brand-tint/30 scale-[1.01]'
          : disabled
            ? 'border-ink-6 bg-bg-2/50 cursor-not-allowed opacity-60'
            : 'border-ink-5 bg-white/40 hover:border-brand/40 hover:bg-white/60'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        className="hidden"
        disabled={disabled}
      />
      <div className="flex flex-col items-center gap-3">
        {dragging ? (
          <FileSpreadsheet className="w-10 h-10 text-brand" />
        ) : (
          <Upload className="w-10 h-10 text-ink-4" />
        )}
        <div>
          <p className="text-sm font-medium text-ink-2">
            {dragging ? 'Drop your file here' : 'Drag and drop your file here'}
          </p>
          <p className="text-xs text-ink-4 mt-1">or click to browse. Supports .xlsx and .csv</p>
        </div>
      </div>
    </div>
  )
}
