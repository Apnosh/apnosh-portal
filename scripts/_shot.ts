/* Local-only: signs in as the OWNER's admin account via a one-time magic link (no password),
   then screenshots the REAL Insights page from the local dev server through Chrome DevTools. */
import { config } from 'dotenv'
config({ path: '/Users/mjbutler35/Documents/GitHub/apnosh-portal/.env.local' })
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const OUT = process.env.OUT_DIR!
const PATHS = (process.env.PATHS || '/dashboard/insights').split(',')
const W = Number(process.env.SHOT_W || 520)
async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const { createServerClient } = await import('@supabase/ssr')
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'admin@apnosh.com' })
  if (le || !link) throw new Error('link: ' + le?.message)
  const js = createClient(URL_, ANON)
  const { data: v, error: ve } = await js.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
  if (ve || !v.session) throw new Error('verify: ' + ve?.message)
  const jar: Record<string, string> = {}
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => { for (const { name, value } of l) jar[name] = value } } })
  await ssr.auth.setSession({ access_token: v.session.access_token, refresh_token: v.session.refresh_token })
  console.log('session ok, cookies:', Object.keys(jar).length)

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${OUT}/cdp-profile`, '--remote-debugging-port=9333', `--window-size=${W},1000`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  await sleep(5000)
  const list = await fetch('http://127.0.0.1:9333/json').then((r) => r.json()) as { webSocketDebuggerUrl: string; type: string }[]
  const page = list.find((t) => t.type === 'page')!
  const WS = (await import('ws')).default
  const ws = new WS(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.on('open', r))
  let id = 0; const pending = new Map<number, (v: any) => void>()
  ws.on('message', (m: any) => { const j = JSON.parse(String(m)); if (j.id && pending.has(j.id)) { pending.get(j.id)!(j.result); pending.delete(j.id) } })
  const send = (method: string, params: any = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Network.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: Number(process.env.SHOT_H || 1000), deviceScaleFactor: 2, mobile: W < 700 })
  await send('Network.setCookies', { cookies: Object.entries(jar).map(([name, value]) => ({ name, value, domain: 'localhost', path: '/' })) })
  for (const p of PATHS) {
    await send('Page.navigate', { url: `http://localhost:3111${p}` })
    await sleep(Number(process.env.WAIT_MS || 14000))
    // optional: type into the first textarea and press the Continue button, then wait for the result
    if (process.env.TYPE_TEXT) {
      await send('Runtime.evaluate', { expression: `(() => { const t = document.querySelector('textarea'); if (!t) return 'no textarea'; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ${JSON.stringify(process.env.TYPE_TEXT)}); t.dispatchEvent(new Event('input', { bubbles: true })); return 'typed' })()`, returnByValue: true }).then((r) => console.log('type:', r.result?.value))
      await sleep(600)
      await send('Runtime.evaluate', { expression: `(() => { const b = [...document.querySelectorAll('button')].find((x) => /^continue$/i.test(x.textContent.trim())); if (!b) return 'no button'; b.click(); return 'clicked' })()`, returnByValue: true }).then((r) => console.log('click:', r.result?.value))
      await sleep(Number(process.env.AFTER_MS || 15000))
    }
    // optional: click buttons by exact text (comma list, in order), then a bar by selector
    if (process.env.CLICK_TEXT) {
      for (const t of process.env.CLICK_TEXT.split(',')) {
        const r = await send('Runtime.evaluate', { expression: `(() => { const b = [...document.querySelectorAll('button,a')].find((x) => x.textContent.trim() === ${JSON.stringify(t.trim())}); if (!b) return 'no button ' + ${JSON.stringify(t.trim())}; b.click(); return 'clicked ' + ${JSON.stringify(t.trim())} })()`, returnByValue: true })
        console.log('CLICK:', r.result?.value); await sleep(Number(process.env.CLICK_MS || 1500))
      }
    }
    if (process.env.CLICK_SEL) {
      const r = await send('Runtime.evaluate', { expression: `(() => { const els = document.querySelectorAll(${JSON.stringify(process.env.CLICK_SEL)}); const i = ${Number(process.env.CLICK_NTH || 0)}; const el = els[i]; if (!el) return 'no el (' + els.length + ')'; el.click(); return 'clicked ' + i + ' of ' + els.length })()`, returnByValue: true })
      console.log('CLICKSEL:', r.result?.value); await sleep(1200)
    }
    if (process.env.DUMP_OVERLAY) {
      const r = await send('Runtime.evaluate', { expression: `(() => { const out = []; const walk = (n) => { if (!n) return; if (n.shadowRoot) walk(n.shadowRoot); if (n.querySelectorAll) n.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); }); if (n.textContent && /Import trace/.test(n.textContent) && n.children && n.children.length < 3) out.push(n.textContent); }; walk(document); return out.join(' || ').slice(0, 2500) || document.documentElement.innerText.slice(0, 400) })()`, returnByValue: true })
      console.log('OVERLAY:', String(r.result?.value).replace(/\s+/g, ' ').slice(0, 1800))
    }
    if (process.env.SCROLL_BOTTOM) {
      const r = await send('Runtime.evaluate', { expression: `(() => { const el = document.querySelector('.mvp-frame-scroll'); if (!el) return 'no scroller'; el.scrollTop = el.scrollHeight; return 'scrolled ' + el.scrollTop + ' of ' + (el.scrollHeight - el.clientHeight) })()`, returnByValue: true })
      console.log('SCROLL:', r.result?.value); await sleep(1200)
    }
    // optional: scroll the app scroller to a fixed offset (comma list aligned with PATHS)
    if (process.env.SCROLL_TO) {
      const y = Number(process.env.SCROLL_TO.split(',')[PATHS.indexOf(p)] ?? process.env.SCROLL_TO.split(',')[0])
      const r = await send('Runtime.evaluate', { expression: `(() => { const sel = ${JSON.stringify(process.env.SCROLL_SEL || '.mvp-frame-scroll')}; const el = sel === 'auto' ? [...document.querySelectorAll('div')].filter((d) => /auto|scroll/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 40).sort((a, b) => b.scrollHeight - a.scrollHeight)[0] : document.querySelector(sel); if (!el) return 'no scroller'; el.scrollTop = ${y}; return 'scrolled to ' + el.scrollTop + ' of ' + el.scrollHeight })()`, returnByValue: true })
      console.log('SCROLLTO:', r.result?.value); const cls = await send('Runtime.evaluate', { expression: `document.querySelector('.mvp-frame')?.className`, returnByValue: true }); console.log('FRAME:', cls.result?.value); await sleep(Number(process.env.SCROLL_MS || 1200))
    }
    if (process.env.EVAL_JS) {
      const r = await send('Runtime.evaluate', { expression: process.env.EVAL_JS, returnByValue: true, awaitPromise: true })
      console.log('EVAL:', JSON.stringify(r.result?.value ?? r.exceptionDetails?.text ?? r))
    }
    if (process.env.DUMP_TEXT) {
      const r = await send('Runtime.evaluate', { expression: `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600)`, returnByValue: true })
      console.log('TEXT:', r.result?.value)
    }
    const m = await send('Page.getLayoutMetrics')
    const h = Math.min(6000, Math.ceil(m.cssContentSize?.height ?? m.contentSize?.height ?? 1000))
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: h, scale: 1 } })
    const name = p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'))
    console.log('saved', name, W, 'x', h)
  }
  ws.close(); chrome.kill()
  await js.auth.signOut()
}
main().catch((e) => { console.error(e); process.exit(1) })
