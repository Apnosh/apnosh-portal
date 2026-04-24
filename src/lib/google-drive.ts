/**
 * Google Drive helpers.
 *
 * Single-integration model: there's one `integrations` row per provider
 * (`google_drive`) that holds the Apnosh team's token. Every client
 * shares it — individual clients just link a folder_id.
 *
 * Token lifecycle:
 *   - access_token lasts ~1 hour, refresh_token is long-lived
 *   - getValidAccessToken() refreshes if expired and persists the new
 *     access_token back to the integrations row
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  iconLink?: string
  thumbnailLink?: string
  webViewLink: string
  modifiedTime: string
  size?: string
  parents?: string[]
}

/**
 * Pull a Drive folder ID out of a URL or raw ID string.
 *   https://drive.google.com/drive/folders/1abc  → 1abc
 *   https://drive.google.com/drive/u/0/folders/1abc?usp=sharing → 1abc
 *   1abc (raw ID) → 1abc
 */
export function extractFolderId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const m = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  // If the whole string looks like a Drive ID (20-40 chars of base64ish), accept it
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed)) return trimmed
  return null
}

/**
 * Refresh an access token using the refresh_token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to refresh Drive token')
  }
  return {
    access_token: data.access_token as string,
    expires_in: data.expires_in as number,
  }
}

/**
 * List direct-children files in a Drive folder.
 */
export async function listFilesInFolder(
  accessToken: string,
  folderId: string,
  pageSize = 100,
): Promise<DriveFile[]> {
  const q = `'${folderId}' in parents and trashed = false`
  const fields = 'files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,size,parents)'
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=${pageSize}&orderBy=folder,name`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Drive list failed')
  }
  return (data.files ?? []) as DriveFile[]
}

/**
 * Fetch the text content of a Google Doc. Returns plain text (no
 * formatting). For other types returns null.
 */
export async function exportGoogleDocAsText(
  accessToken: string,
  fileId: string,
): Promise<string | null> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return await res.text()
}

/**
 * Download a binary/text file from Drive as a string. Use this for
 * non-Google-native files (CSV, txt, etc.) where we want the raw bytes.
 */
export async function downloadFileAsText(
  accessToken: string,
  fileId: string,
): Promise<string | null> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return await res.text()
}

/**
 * Human-friendly label for a MIME type.
 */
export function describeMime(mime: string): { label: string; category: 'doc' | 'sheet' | 'slides' | 'image' | 'video' | 'pdf' | 'folder' | 'other' } {
  if (mime === 'application/vnd.google-apps.folder') return { label: 'Folder', category: 'folder' }
  if (mime === 'application/vnd.google-apps.document') return { label: 'Doc', category: 'doc' }
  if (mime === 'application/vnd.google-apps.spreadsheet') return { label: 'Sheet', category: 'sheet' }
  if (mime === 'application/vnd.google-apps.presentation') return { label: 'Slides', category: 'slides' }
  if (mime === 'application/pdf') return { label: 'PDF', category: 'pdf' }
  if (mime.startsWith('image/')) return { label: 'Image', category: 'image' }
  if (mime.startsWith('video/')) return { label: 'Video', category: 'video' }
  return { label: mime.split('/').pop() ?? 'File', category: 'other' }
}
