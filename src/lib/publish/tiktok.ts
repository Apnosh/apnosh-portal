/**
 * Publish to TikTok.
 *
 * Requires TikTok Content Posting API + approved app.
 * Currently a stub — will be activated once the TikTok app is approved.
 */

export interface TikTokPublishResult {
  success: boolean
  postId?: string
  error?: string
}

export async function publishToTikTok(
  _token: string,
  _text: string,
  _videoUrl?: string | null,
): Promise<TikTokPublishResult> {
  // TODO: Implement once TikTok app review is approved
  return {
    success: false,
    error: 'TikTok publishing is not yet available. The app is pending review.',
  }
}
