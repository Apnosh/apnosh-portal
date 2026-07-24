'use client'

/**
 * Client-side image prep for creator uploads. Downscales + compresses a picked File into a JPEG
 * data URL that fits under a byte budget, so it slips through a Next.js Server Action (default 1MB
 * body limit) AND keeps the public storefront fast to load. Browser-only (uses Image + canvas);
 * only import this from client components.
 *
 * Why not upload the File straight to Storage from the browser? The `vendor-portfolio` bucket is
 * admin-write-only at the RLS layer, so a creator's direct upload would be denied. Instead we hand
 * a small data URL to a server action that writes with the service-role client (which bypasses
 * Storage RLS after an ownership check). Downscaling here is what makes that data URL small enough.
 */

export interface DownscaleOpts {
  /** Longest edge, in px. The image is scaled to fit; never scaled up. */
  maxDim: number
  /** Hard ceiling on the encoded bytes. Quality (then size) steps down until the output fits. */
  maxBytes: number
}

// Budgets are set so the base64 payload (~1.37x the byte count) stays comfortably under the 1MB
// server-action limit: 550KB -> ~750KB base64, 400KB -> ~550KB. Quality stays high in practice
// because a 1800px JPEG of a photo is usually well under these anyway.
export const AVATAR_PREP: DownscaleOpts = { maxDim: 640, maxBytes: 400_000 }
export const COVER_PREP: DownscaleOpts = { maxDim: 1800, maxBytes: 550_000 }
export const PHOTO_PREP: DownscaleOpts = { maxDim: 1800, maxBytes: 550_000 }

/** Approx byte size of a base64 data URL's payload. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Math.floor((b64.length * 3) / 4)
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image. Try another photo.')) }
    img.src = url
  })
}

/**
 * Returns a JPEG data URL that fits both maxDim and maxBytes. Throws a friendly Error if the file
 * is not an image the browser can decode.
 */
export async function fileToDownscaledDataUrl(file: File, opts: DownscaleOpts): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file (JPG, PNG, or WebP).')
  const img = await loadImage(file)

  const scale = Math.min(1, opts.maxDim / Math.max(img.width, img.height))
  let w = Math.max(1, Math.round(img.width * scale))
  let h = Math.max(1, Math.round(img.height * scale))

  const draw = (width: number, height: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser could not process that image.')
    ctx.drawImage(img, 0, 0, width, height)
    return canvas
  }

  // Step quality down first (cheap), then shrink 15% and retry, until under the byte budget.
  let canvas = draw(w, h)
  for (let i = 0; i < 8; i++) {
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const dataUrl = canvas.toDataURL('image/jpeg', q)
      if (dataUrlBytes(dataUrl) <= opts.maxBytes) return dataUrl
    }
    w = Math.max(1, Math.round(w * 0.85)); h = Math.max(1, Math.round(h * 0.85))
    canvas = draw(w, h)
  }
  // Last resort: smallest tried, lowest quality (still valid, just soft).
  return canvas.toDataURL('image/jpeg', 0.5)
}
