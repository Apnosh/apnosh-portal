'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import {
  Star, ArrowLeft, Copy, Check, Download, ExternalLink, QrCode, Loader2, AlertTriangle,
} from 'lucide-react'

interface LinkData { placeId: string | null; reviewUrl: string | null; businessName: string }

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setDone(true)
      setTimeout(() => setDone(false), 1800)
    })
  }, [text])
  return (
    <button
      onClick={copy}
      className="bg-white border border-ink-6 text-ink-2 text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 hover:border-brand/40 transition-colors flex-shrink-0"
    >
      {done ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? 'Copied' : label}
    </button>
  )
}

export default function GetReviewsPage() {
  const [data, setData] = useState<LinkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/listing/review-link')
      .then(r => r.ok ? r.json() : null)
      .then((d: LinkData | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!data?.reviewUrl) return
    QRCode.toDataURL(data.reviewUrl, { width: 640, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(null))
  }, [data?.reviewUrl])

  const name = data?.businessName ?? 'your restaurant'
  const url = data?.reviewUrl ?? ''

  const templates = [
    {
      key: 'sms', label: 'Text message',
      body: `Thanks for visiting ${name}! If you enjoyed it, a 30-second Google review means the world to us 🙏 ${url}`,
    },
    {
      key: 'email', label: 'Email',
      body: `Hi there,\n\nThank you for choosing ${name}! We'd love to hear how it went. If you have a moment, a quick Google review helps other locals find us and means a lot to our team.\n\nLeave a review here: ${url}\n\nWith gratitude,\nThe ${name} team`,
    },
    {
      key: 'card', label: 'Table card / receipt',
      body: `Loved your meal? ⭐\nLeave ${name} a Google review — scan the code or visit:\n${url}`,
    },
  ]

  return (
    <div className="max-w-[760px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <Link href="/dashboard/local-seo/reviews" className="text-xs text-ink-3 hover:text-ink flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Reviews
        </Link>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Local SEO</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
          Get more reviews
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          Your one-tap Google review link and a printable QR code. The fastest way to lift your rating.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-8 flex items-center justify-center text-ink-3">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {!loading && !data?.reviewUrl && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-amber-900">We couldn&rsquo;t find your Google listing link yet</p>
            <p className="text-amber-900/85 mt-1">
              Connect your Google Business Profile, then hit <span className="font-medium">Sync now</span> on the
              Reviews page. Your review link and QR code will appear here.
            </p>
          </div>
        </div>
      )}

      {!loading && data?.reviewUrl && (
        <>
          {/* The link */}
          <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-5 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Your review link</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-bg-2 border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink-2 truncate">
                {url}
              </div>
              <CopyButton text={url} label="Copy link" />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white border border-ink-6 text-ink-2 text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 hover:border-brand/40 transition-colors flex-shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </a>
            </div>
            <p className="text-xs text-ink-4">
              Tapping this opens Google&rsquo;s &ldquo;write a review&rdquo; box for {name} straight away.
            </p>
          </div>

          {/* QR code */}
          <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 mb-3 flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5" /> Printable QR code
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="bg-white border border-ink-6 rounded-xl p-3 flex-shrink-0">
                {qr ? (
                  <img src={qr} alt="Google review QR code" className="w-40 h-40" />
                ) : (
                  <div className="w-40 h-40 flex items-center justify-center text-ink-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
                )}
              </div>
              <div className="space-y-3 text-center sm:text-left">
                <p className="text-sm text-ink-2 leading-relaxed">
                  Print it for tables, the counter, receipts, or takeout bags. Customers scan it and land
                  straight on your review page.
                </p>
                {qr && (
                  <a
                    href={qr}
                    download={`${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-google-review-qr.png`}
                    className="inline-flex bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-4 py-2 items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download QR (PNG)
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Share templates */}
          <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-5 space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Ready-to-send messages</div>
            <p className="text-xs text-ink-4 -mt-2">
              Send these to happy customers. The best time is right after a great meal.
            </p>
            {templates.map(t => (
              <div key={t.key} className="border border-ink-6 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">{t.label}</span>
                  <CopyButton text={t.body} />
                </div>
                <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{t.body}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-ink-4 leading-relaxed">
            Tip: never offer a discount or reward in exchange for a review — Google prohibits it and can suspend
            your listing. Just ask. Happy customers say yes more often than you&rsquo;d think.
          </p>
        </>
      )}
    </div>
  )
}
