import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow loading social post thumbnails from Meta's CDNs. We use
  // unoptimized={true} on <Image> for these so Next.js doesn't proxy them
  // (Meta URLs are signed + short-lived; proxying would cache stale URLs),
  // but remotePatterns is still required as a domain allow-list.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: 'instagram.com' },
      { protocol: 'https', hostname: 'www.instagram.com' },
    ],
  },
};

export default nextConfig;
