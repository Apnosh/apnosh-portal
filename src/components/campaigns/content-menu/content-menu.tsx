'use client'

/**
 * The Content Menu — order a campaign like takeout. Three views over a single client-side
 * cart: the MENU (tappable piece cards), the CART (grocery-list review with the Shoot Day
 * grouping + melting visit surcharge), and the COST breakdown. Persists only at ship/save,
 * so the legacy detail page stays untouched and shows the post-ship state.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Minus, Trash2, Loader2, Camera, Sparkles, Rocket } from 'lucide-react'
import { C, GRAD, money } from '@/components/campaigns/ui'
import { campaignBill, shootDaysFromLines, SOLO_VISIT_SURCHARGE_CENTS } from '@/lib/campaigns/catalog'
import { summarize, type CampaignDraft } from '@/lib/campaigns/types'
import type { SavedCampaign } from '@/lib/campaigns/view'
import { MENU_GROUPS, PIECE_BY_TYPE, pieceNeedsVisit, type PieceTypeDef } from '@/lib/campaigns/content-menu/manifest'
import AddPieceModal, { TYPE_ICON } from './add-piece-modal'
import { cartToLineItems, lineItemsToCart, type CartLine } from './cart'

const SUR = SOLO_VISIT_SURCHARGE_CENTS / 100

const handlerLabel = (p: CartLine['producer']) => (p === 'team' ? 'Your team' : p === 'creator' ? 'A creator' : 'You')

export default function ContentMenu({ restaurant, menuItems, clientId, draftId, seed, initialName, onExit }: { restaurant: string; menuItems: string[]; clientId: string; draftId?: string; seed?: CartLine[]; initialName?: string; onExit?: () => void }) {
  const router = useRouter()
  const [cart, setCart] = useState<CartLine[]>(seed ?? [])
  // Seeded from a picked campaign → land on the cart to review; otherwise start at the menu.
  const [view, setView] = useState<'menu' | 'cart' | 'cost'>(seed && seed.length ? 'cart' : 'menu')
  const exit = onExit ?? (() => router.push('/dashboard/campaigns'))
  const [modal, setModal] = useState<{ def: PieceTypeDef; editing?: CartLine } | null>(null)
  const [name, setName] = useState(initialName ?? '')
  const [busy, setBusy] = useState(false)
  const [undo, setUndo] = useState<CartLine | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)   // synchronous guard so a double-tap can't create twice

  // Resume a saved draft: load its pieces back into the cart and update it in place on
  // save/ship (instead of creating a second campaign).
  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    fetch(`/api/campaigns/${draftId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const c = j?.campaign as SavedCampaign | undefined
        if (cancelled || !c || c.status === 'shipped') return   // never re-edit a shipped campaign here
        setName(c.draft.name)
        setCart(lineItemsToCart(c.draft.items))
        setView('cart')
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [draftId])

  const lines = useMemo(() => cartToLineItems(cart), [cart])
  const bill = useMemo(() => campaignBill(lines), [lines])
  const shootDays = useMemo(() => shootDaysFromLines(lines), [lines])
  const onSiteCount = shootDays[0]?.onSiteCount ?? 0
  const solo = onSiteCount === 1

  const shootCart = cart.filter((l) => pieceNeedsVisit(l.type, l.brief) && l.producer !== 'diy')
  const restCart = cart.filter((l) => !(pieceNeedsVisit(l.type, l.brief) && l.producer !== 'diy'))

  function addOrUpdate(line: CartLine) {
    setCart((c) => { const i = c.findIndex((x) => x.id === line.id); if (i >= 0) { const n = [...c]; n[i] = line; return n } return [...c, line] })
    setModal(null)
  }
  function removeLine(id: string) { setCart((c) => { const f = c.find((x) => x.id === id); if (f) setUndo(f); return c.filter((x) => x.id !== id) }) }
  function setQty(id: string, qty: number) { setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: Math.max(1, qty) } : x))) }

  async function persist(ship: boolean) {
    if (inFlight.current || !cart.length) return
    inFlight.current = true
    setBusy(true); setError(null)
    const campName = name.trim() || `${restaurant} campaign`
    const items = cartToLineItems(cart)
    try {
      let id = draftId
      if (id) {
        // Resumed draft → update its pieces + name in place.
        const r = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, fields: { name: campName } }) })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save')
      } else {
        const draft: CampaignDraft = { id: crypto.randomUUID(), name: campName, intent: 'one-off', path: 'ai', phase: 'build', budgetMonthly: 0, planned: true, items }
        const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, draft }) })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save')
        id = (await res.json() as { id?: string }).id
      }
      if (ship && id) {
        await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { status: 'shipped', phase: 'monitor', shipped_at: new Date().toISOString() } }) }).catch(() => {})
      }
      router.push(id ? `/dashboard/campaigns/${id}` : '/dashboard/campaigns')   // stays in-flight through nav
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong'); setBusy(false); inFlight.current = false
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: C.bg, display: 'flex', flexDirection: 'column', height: '100dvh', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>

        {view === 'menu' && <MenuView restaurant={restaurant} cart={cart} bill={bill} onOpen={(def) => setModal({ def })} onBack={() => (cart.length ? setView('cart') : exit())} onReview={() => setView('cart')} />}
        {view === 'cart' && <CartView name={name} setName={setName} restaurant={restaurant} shootCart={shootCart} restCart={restCart} onSiteCount={onSiteCount} solo={solo} bill={bill} busy={busy} error={error} undo={undo} onUndo={() => { if (undo) { setCart((c) => [...c, undo]); setUndo(null) } }} onEdit={(l) => setModal({ def: PIECE_BY_TYPE[l.type], editing: l })} onRemove={removeLine} onQty={setQty} onAddMore={() => setView('menu')} onBack={exit} onCost={() => setView('cost')} onShip={() => persist(true)} onSave={() => persist(false)} />}
        {view === 'cost' && <CostView cart={cart} bill={bill} shootDays={shootDays} solo={solo} onSiteCount={onSiteCount} busy={busy} onBack={() => setView('cart')} onShip={() => persist(true)} />}

        {modal && <AddPieceModal def={modal.def} menuItems={menuItems} editing={modal.editing} onSubmit={addOrUpdate} onClose={() => setModal(null)} />}
      </div>
    </div>
  )
}

/* ── Menu view ─────────────────────────────────────────────── */
function MenuView({ restaurant, cart, bill, onOpen, onBack, onReview }: { restaurant: string; cart: CartLine[]; bill: ReturnType<typeof campaignBill>; onOpen: (d: PieceTypeDef) => void; onBack: () => void; onReview: () => void }) {
  return (
    <>
      <Header onBack={onBack} title="Build a campaign" sub={restaurant} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 16px 110px' }}>
        {MENU_GROUPS.map((g) => (
          <div key={g.key} style={{ marginTop: 14 }}>
            <SectionLabel>{g.label}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {g.defs.map((d) => {
                const Icon = TYPE_ICON[d.type]
                const tag = d.onSiteAlways ? 'on-site' : d.captureToggle ? 'on-site option' : 'instant'
                return (
                  <button key={d.type} onClick={() => onOpen(d)} style={cardStyle}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={19} color={C.mute} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{d.label}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: d.onSiteAlways ? '#9a5a00' : C.faint, background: d.onSiteAlways ? 'rgba(245,170,70,0.16)' : C.bg, borderRadius: 5, padding: '2px 5px' }}>{tag}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.does}</div>
                    </div>
                    <span style={{ fontSize: 13.5, color: C.mute, flexShrink: 0 }}>{money(d.price)}</span>
                    <Plus size={17} color={C.faint} style={{ flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {cart.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))', background: '#fff', borderTop: `1px solid ${C.line}` }}>
          <button onClick={onReview} style={{ width: '100%', background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            Review · {cart.reduce((n, l) => n + l.qty, 0)} {cart.reduce((n, l) => n + l.qty, 0) === 1 ? 'piece' : 'pieces'} · {money(bill.oneTimeOnDelivery)}
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </>
  )
}

/* ── Cart view ─────────────────────────────────────────────── */
function CartView(p: {
  name: string; setName: (s: string) => void; restaurant: string
  shootCart: CartLine[]; restCart: CartLine[]; onSiteCount: number; solo: boolean
  bill: ReturnType<typeof campaignBill>; busy: boolean; error: string | null; undo: CartLine | null; onUndo: () => void
  onEdit: (l: CartLine) => void; onRemove: (id: string) => void; onQty: (id: string, q: number) => void
  onAddMore: () => void; onBack: () => void; onCost: () => void; onShip: () => void; onSave: () => void
}) {
  const empty = p.shootCart.length + p.restCart.length === 0
  return (
    <>
      <Header onBack={p.onBack} title="Your campaign" sub={`${p.shootCart.length + p.restCart.length} pieces`} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 150px' }}>
        <input value={p.name} onChange={(e) => p.setName(e.target.value)} placeholder={`${p.restaurant} campaign`} style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', fontSize: 15, fontWeight: 600, border: `1px solid ${C.line}`, borderRadius: 12, color: C.ink, background: '#fff', marginBottom: 14, outline: 'none' }} />

        {empty && <div style={{ textAlign: 'center', color: C.faint, fontSize: 13, padding: '40px 0' }}>Your campaign is empty. Add a piece to start.</div>}

        {p.shootCart.length > 0 && (
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', background: C.bg, borderBottom: `1px solid ${C.line}` }}>
              <Camera size={17} color={C.mute} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Your shoot · {p.onSiteCount} {p.onSiteCount === 1 ? 'piece' : 'pieces'}</div><div style={{ fontSize: 11, color: C.faint }}>one visit</div></div>
            </div>
            {p.shootCart.map((l) => <Row key={l.id} line={l} onEdit={p.onEdit} onRemove={p.onRemove} onQty={p.onQty} />)}
            {p.solo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', background: 'rgba(245,170,70,0.10)', borderTop: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 12.5, color: '#9a5a00', flex: 1 }}><b>Solo visit · +{money(SUR)}</b><br /><span style={{ fontSize: 11 }}>Add one more on-site piece and the visit is free.</span></span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', background: C.greenSoft, borderTop: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 12.5, color: C.greenDk }}>Batched — one visit for {p.onSiteCount} pieces. You skip the {money(SUR)} solo-visit fee.</span>
              </div>
            )}
          </div>
        )}

        {p.restCart.length > 0 && (
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '9px 13px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, background: C.bg, borderBottom: `1px solid ${C.line}` }}>Ready now · no visit needed</div>
            {p.restCart.map((l) => <Row key={l.id} line={l} onEdit={p.onEdit} onRemove={p.onRemove} onQty={p.onQty} />)}
          </div>
        )}

        <button onClick={p.onAddMore} style={{ width: '100%', background: '#fff', border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: 13, fontWeight: 600, fontSize: 13.5, color: C.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Plus size={16} /> Add more pieces</button>

        {p.undo && <button onClick={p.onUndo} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: C.greenDk, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Undo remove</button>}
      </div>

      {!empty && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: '#fff', borderTop: `1px solid ${C.line}` }}>
          {p.error && <div style={{ color: C.red, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>{p.error}</div>}
          <button onClick={p.onCost} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px 10px' }}>
            <span style={{ fontSize: 12.5, color: C.greenDk, fontWeight: 600 }}>See full cost</span>
            <span style={{ fontSize: 14, color: C.ink }}><b>{money(p.bill.oneTimeOnDelivery)}</b> on delivery{p.bill.perMonth > 0 ? ` · ${money(p.bill.perMonth)}/mo` : ''}</span>
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={p.onSave} disabled={p.busy} style={{ flex: '0 0 auto', minWidth: 96, background: '#fff', color: C.ink, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Save</button>
            <button onClick={p.onShip} disabled={p.busy} style={{ flex: 1, background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: p.busy ? 0.7 : 1 }}>
              {p.busy ? <Loader2 size={17} className="animate-spin" /> : <Rocket size={17} />} Ship it
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 8 }}>Nothing is charged now. Each piece bills only when it ships.</div>
        </div>
      )}
    </>
  )
}

function Row({ line, onEdit, onRemove, onQty }: { line: CartLine; onEdit: (l: CartLine) => void; onRemove: (id: string) => void; onQty: (id: string, q: number) => void }) {
  const def = PIECE_BY_TYPE[line.type]
  const Icon = TYPE_ICON[line.type]
  const free = line.producer === 'diy'
  const dish = line.brief.featuring?.trim()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderTop: `1px solid ${C.line}` }}>
      <button onClick={() => onEdit(line)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
        <Icon size={18} color={C.faint} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def?.label?.replace(/^An? /, '') ?? line.type}{dish ? ` · ${dish}` : ''}</div>
          <div style={{ fontSize: 11, color: C.faint }}>{handlerLabel(line.producer)}</div>
        </div>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button onClick={() => onQty(line.id, line.qty - 1)} disabled={line.qty <= 1} aria-label="Less" style={qtyBtn}><Minus size={13} /></button>
        <span style={{ fontSize: 13, minWidth: 16, textAlign: 'center', color: C.ink }}>{line.qty}</span>
        <button onClick={() => onQty(line.id, line.qty + 1)} aria-label="More" style={qtyBtn}><Plus size={13} /></button>
      </div>
      <span style={{ fontSize: 13, color: free ? C.green : C.mute, flexShrink: 0, minWidth: 38, textAlign: 'right' }}>{free ? 'Free' : money(def.price * line.qty)}</span>
      <button onClick={() => onRemove(line.id)} aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, padding: 2, flexShrink: 0 }}><Trash2 size={15} /></button>
    </div>
  )
}

/* ── Cost view ─────────────────────────────────────────────── */
function CostView({ cart, bill, shootDays, solo, onSiteCount, busy, onBack, onShip }: { cart: CartLine[]; bill: ReturnType<typeof campaignBill>; shootDays: ReturnType<typeof shootDaysFromLines>; solo: boolean; onSiteCount: number; busy: boolean; onBack: () => void; onShip: () => void }) {
  const base = summarize(cartToLineItems(cart))
  return (
    <>
      <Header onBack={onBack} title="Full cost" sub="every line, nothing hidden" />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 120px' }}>
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '4px 14px' }}>
          {cart.map((l) => {
            const def = PIECE_BY_TYPE[l.type]
            const free = l.producer === 'diy'
            return (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: `1px solid ${C.bg}`, fontSize: 13.5 }}>
                <span style={{ color: C.ink }}>{def?.label?.replace(/^An? /, '')}{l.brief.featuring ? ` · ${l.brief.featuring}` : ''} <span style={{ color: C.faint }}>· {handlerLabel(l.producer)}{l.qty > 1 ? ` · ×${l.qty}` : ''}</span></span>
                <span style={{ color: free ? C.green : C.ink, flexShrink: 0 }}>{free ? 'Free' : money(def.price * l.qty)}</span>
              </div>
            )
          })}
          {/* the visit line */}
          {onSiteCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: `1px solid ${C.bg}`, fontSize: 13.5 }}>
              <span style={{ color: C.ink }}>Visit <span style={{ color: C.faint }}>· {onSiteCount} on-site {onSiteCount === 1 ? 'piece' : 'pieces'}, one trip</span></span>
              <span style={{ color: solo ? '#9a5a00' : C.green, flexShrink: 0 }}>{solo ? `+${money(SUR)}` : 'Free'}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 0 11px', fontSize: 15, fontWeight: 700 }}>
            <span style={{ color: C.ink }}>On delivery</span>
            <span style={{ color: C.ink }}>{money(bill.oneTimeOnDelivery)}</span>
          </div>
          {bill.perMonth > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0 11px', fontSize: 13.5, color: C.mute }}>
              <span>Then each month</span><span>{money(bill.perMonth)}/mo</span>
            </div>
          )}
        </div>
        {!solo && onSiteCount >= 2 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, color: C.greenDk, background: C.greenSoft, borderRadius: 10, padding: '10px 12px' }}>
            <Sparkles size={15} /> Batched: {onSiteCount} on-site pieces share one visit, so there&rsquo;s no {money(SUR)} solo-visit fee.
          </div>
        )}
        {base.optedOutSaved > 0 && <div style={{ fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 12 }}>You skipped {money(base.optedOutSaved)} of pieces you don&rsquo;t need.</div>}
        <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>Charged once each, when it ships. Nothing now.</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))', background: '#fff', borderTop: `1px solid ${C.line}` }}>
        <button onClick={onShip} disabled={busy} style={{ width: '100%', background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Rocket size={17} />} Ship it · {money(bill.oneTimeOnDelivery)}
        </button>
      </div>
    </>
  )
}

/* ── shared bits ─────────────────────────────────────────────── */
function Header({ onBack, title, sub }: { onBack: () => void; title: string; sub?: string }) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${C.line}`, background: '#fff' }}>
      <button onClick={onBack} aria-label="Back" style={{ display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: C.mute, cursor: 'pointer', padding: 0 }}><ChevronLeft size={22} /></button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.faint }}>{sub}</div>}
      </div>
    </div>
  )
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, margin: '0 0 9px 2px' }}>{children}</div>
}
const cardStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 11, width: '100%', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 13, padding: '11px 13px', cursor: 'pointer', textAlign: 'left' }
const qtyBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.mute, padding: 0 }
