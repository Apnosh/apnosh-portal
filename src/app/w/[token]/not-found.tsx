/**
 * /w/<token> — the answer when there is no card behind the link.
 *
 * A real 404. The page used to return 200 with these words on it, which told every crawler,
 * scanner and link checker that a made-up token is a page that exists — and told anyone probing
 * tokens nothing apart from the same 200 they get for a real one. The status is the honest signal
 * and it costs nothing.
 *
 * ENGLISH, on purpose. Every other surface draws in the owner's language, and here there is no
 * owner: the token matched nothing, so there is no client to read a language from. Guessing one
 * from the reader's browser would be a guess about a stranger.
 */

import { t } from '@/lib/i18n/t'

export default function WinNotFound() {
  const T = (k: string) => t(k, 'en')
  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f7', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 560, padding: '28px 18px 40px' }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: '38px 22px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f' }}>{T('This link does not work')}</div>
          <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 6, lineHeight: 1.5 }}>
            {T('It may have been cut short, or the card was taken down. Ask for it again.')}
          </div>
          <div style={{ marginTop: 16 }}>
            <a href="https://apnosh.com" style={{ fontSize: 12.5, fontWeight: 600, color: '#6e6e73', textDecoration: 'none' }}>
              {T('Made with Apnosh')}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
