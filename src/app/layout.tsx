import type { Metadata, Viewport } from 'next'
import { Inter, Playfair_Display, DM_Sans } from 'next/font/google'
import './globals.css'
import './m-home.css'
import './m-inbox.css'
import './m-plan.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' })

/* Viewport config lives in its own export per the Next 16 Metadata API.
   maximumScale = 5 (not 1) preserves the pinch-to-zoom accessibility
   affordance — locking at 1 violates WCAG 1.4.10. viewportFit='cover'
   lets future iOS notch / safe-area handling work with env(safe-area-*). */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#4abd98',
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Apnosh — Client Portal',
  description: 'Manage your marketing, approve content, and track results — all in one place.',
  /* Prevent iOS from auto-linking phone numbers / emails / addresses
     that appear in the UI (e.g., a customer review or a vendor profile
     contact line). The dashboard surfaces these as visual content, not
     calling/email actions, so the auto-tel: / mailto: rewrites are
     unwanted. */
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${dmSans.variable} h-full`}>
      <body className="font-[family-name:var(--font-inter)] bg-bg text-ink min-h-full">{children}</body>
    </html>
  )
}
