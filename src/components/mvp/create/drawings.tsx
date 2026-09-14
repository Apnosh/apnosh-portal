/**
 * THE DRAWINGS (owner 2026-09-14): every card on Create carries a small picture of what the
 * owner will HAVE when it is done, and the picture is specific to the card. "Menu on Google" is
 * their Google card with the menu section lit. "Find us" is the map with the pin on the door.
 * "Missed-call text back" is the missed call and the text that answers it. Each scene is drawn
 * in HTML from the owner's own name, rating and newest photo; the part the card changes wears
 * a ring in the stage colour (`.fx`). Nothing is invented: a line we do not know is a grey bar.
 *
 * Client-safe, no data fetching: the page passes what it has.
 */
import type { ReactNode } from 'react'

export type Scene =
  | 'google' | 'search' | 'directories' | 'apps' | 'chart'
  | 'site' | 'sitemenu' | 'order' | 'reserve' | 'sticky' | 'gift' | 'fix' | 'catering'
  | 'post' | 'story' | 'reel' | 'profile' | 'linkpage' | 'grid' | 'batch' | 'graphic' | 'photos' | 'creator' | 'ad' | 'ticket' | 'event' | 'calendar'
  | 'missed' | 'keyword' | 'dm' | 'waitlist' | 'email' | 'offer' | 'stamps' | 'review' | 'pin'
export type GoogleFocus = 'photos' | 'menu' | 'buttons' | 'qa' | 'products' | 'gpost' | 'reviews' | 'all' | 'none'

export interface DrawSpec { scene: Scene; focus?: GoogleFocus }

/** card id → what to draw. Anything not here falls back by channel (see sceneFor). */
export const DRAW_BY_ID: Record<string, DrawSpec> = {
  gbp: { scene: 'google', focus: 'photos' }, gmenu: { scene: 'google', focus: 'menu' }, friction: { scene: 'google', focus: 'buttons' },
  gattrs: { scene: 'google', focus: 'qa' }, gfindus: { scene: 'pin' }, gproducts: { scene: 'google', focus: 'products' },
  gpostbtn: { scene: 'google', focus: 'gpost' }, gpost: { scene: 'google', focus: 'gpost' }, gbpmgmt: { scene: 'google', focus: 'gpost' },
  localseo: { scene: 'search' }, reviewsplan: { scene: 'review' }, reviewsreply: { scene: 'review' }, measure: { scene: 'chart' },
  listings: { scene: 'directories' }, yelpapple: { scene: 'directories' }, appprofiles: { scene: 'apps' }, deliverymenu: { scene: 'apps' },
  website: { scene: 'site' }, 'creative-website': { scene: 'site' }, sitemenu: { scene: 'sitemenu' }, direct: { scene: 'order' },
  sitereserve: { scene: 'reserve' }, sitecall: { scene: 'sticky' }, sitegift: { scene: 'gift' }, giftcard: { scene: 'gift' }, sitefix: { scene: 'fix' },
  catering: { scene: 'catering' }, cateringengine: { scene: 'catering' },
  story: { scene: 'story' }, linksticker: { scene: 'story' }, reel: { scene: 'reel' }, edit: { scene: 'reel' }, 'creative-video': { scene: 'reel' },
  dish: { scene: 'post' }, tapposts: { scene: 'post' }, 'b-weekly': { scene: 'post' },
  graphic: { scene: 'graphic' }, design: { scene: 'graphic' }, 'creative-graphic': { scene: 'graphic' }, 'creative-print': { scene: 'graphic' }, 'creative-menu': { scene: 'graphic' }, 'creative-logo': { scene: 'graphic' }, 'creative-copy': { scene: 'graphic' },
  'creative-photos': { scene: 'photos' }, shoot: { scene: 'photos' },
  'creative-social': { scene: 'batch' }, socialmgmt: { scene: 'batch' }, launch: { scene: 'batch' },
  socialprofiles: { scene: 'profile' }, igbuttons: { scene: 'profile' }, 'b-social': { scene: 'profile' }, onelink: { scene: 'linkpage' }, pinned: { scene: 'grid' },
  creator: { scene: 'creator' }, 'creator-monthly': { scene: 'creator' },
  reach: { scene: 'ad' }, callads: { scene: 'ad' }, retarget: { scene: 'ad' }, 'creative-ads': { scene: 'ad' }, firstvisit: { scene: 'ad' },
  ticket: { scene: 'ticket' }, promoevent: { scene: 'event' }, barnights: { scene: 'event' }, seasonplan: { scene: 'calendar' }, trucklocation: { scene: 'pin' },
  missedcall: { scene: 'missed' }, 'b-answer': { scene: 'missed' }, textorder: { scene: 'keyword' }, dmhour: { scene: 'dm' }, waitlist: { scene: 'waitlist' },
  emaildeliver: { scene: 'email' }, earlyaccess: { scene: 'email' }, welcome: { scene: 'email' }, news: { scene: 'email' }, 'creative-email': { scene: 'email' },
  slowoffer: { scene: 'offer' }, winback: { scene: 'offer' }, birthday: { scene: 'offer' }, regulars: { scene: 'offer' }, nights: { scene: 'offer' },
  loyalty: { scene: 'stamps' },
  'b-google': { scene: 'google', focus: 'all' }, 'b-site': { scene: 'site' }, 'b-everywhere': { scene: 'directories' },
}

/** The scene for a card not in the table, from the channels it goes out on. */
export function sceneFor(id: string, channels: string[]): DrawSpec {
  const hit = DRAW_BY_ID[id]
  if (hit) return hit
  const ch = channels.join(' ').toLowerCase()
  if (/^google/.test(ch)) return { scene: 'google', focus: 'all' }
  if (/^your site/.test(ch)) return { scene: 'site' }
  if (/instagram|tiktok|facebook|social|print|photo|everywhere|anything/.test(ch)) return { scene: 'post' }
  if (/email|text/.test(ch)) return { scene: 'email' }
  if (/google|yelp|apple|bing|maps|doordash|uber|grubhub/.test(ch)) return { scene: 'google', focus: 'all' }
  return { scene: 'post' }
}

export interface DrawProps {
  spec: DrawSpec
  /** the owner's business name */
  name: string
  /** "4.7 · 312 reviews" when known, else a plain word */
  rating: string
  /** the "now" state for a before/after: greyed, the thing missing */
  now?: boolean
  t: (s: string) => string
}

const Bar = ({ w = '70%' }: { w?: string }) => <b className="bar" style={{ width: w }} />

export function Drawing({ spec, name, rating, now = false, t }: DrawProps): ReactNode {
  /* the photo slots are drawn, not fetched (owner 2026-09-14): a plate, a bowl, a drink, a table, in
     warm tones, so no one else's post and no words end up on a card */
  const v = `p${((spec.scene.length + (spec.focus?.length ?? 0)) % 4) + 1}`
  const ph = <div className={`ph ${v}`} />
  const fx = (k: GoogleFocus) => (!now && (spec.focus === k || spec.focus === 'all') ? ' fx' : '')
  const cls = `dw ${spec.scene}${now ? ' now' : ''}`
  switch (spec.scene) {
    case 'google': {
      const f = spec.focus ?? 'none'
      /* a card about one section of the listing shows a shorter photo strip, so the section it lights is in view */
      const compact = f === 'menu' || f === 'qa' || f === 'products' || f === 'gpost'
      return (
        <div className={`${cls}${compact ? ' compact' : ''}`}>
          <div className={`strip${fx('photos')}`}>{ph}<div className="ph2 food p2" /><div className="ph3 food p3" /></div>
          <div className="nm">{name}</div><div className="mt">{rating}</div>
          {now && f === 'buttons' ? <div className="btns dim"><i>{t('Directions')}</i><i>{t('Website')}</i></div>
            : <div className={`btns${fx('buttons')}`}><i>{t('Menu')}</i><i className="on">{t('Order')}</i><i className="on">{t('Reserve')}</i><i>{t('Call')}</i></div>}
          {f === 'menu' || f === 'all' ? (now ? <div className="nomenu">{t('No menu added')}</div> : <div className={`menu${fx('menu')}`}><div><Bar w="62%" /><b className="pr">$13</b></div><div><Bar w="48%" /><b className="pr">$11</b></div></div>) : null}
          {f === 'qa' ? (now ? <div className="nomenu">{t('4 questions, no answer')}</div> : <div className={`qa${fx('qa')}`}><div><span>{t('Do you have parking?')}</span><em>{t('Yes, behind the building.')}</em></div><div><span>{t('Kids welcome?')}</span><em>{t('Always.')}</em></div></div>) : null}
          {f === 'products' ? <div className={`prods${fx('products')}`}><div className="pd"><i /><span>{t('Catering')}</span></div><div className="pd"><i /><span>{t('Gift cards')}</span></div><div className="pd"><i /><span>{t('Private room')}</span></div></div> : null}
          {f === 'gpost' ? <div className={`gpost${fx('gpost')}`}><i /><div><Bar w="80%" /><Bar w="55%" /><em>{t('Order online')}</em></div></div> : null}
        </div>
      )
    }
    case 'search':
      return <div className={cls}><div className="sbar"><i /><span>{t('food near me')}</span></div><div className="res fx"><div className="nm">{name}</div><div className="mt">{rating}</div></div><div className="res"><Bar w="50%" /><Bar w="35%" /></div><div className="res"><Bar w="55%" /><Bar w="30%" /></div></div>
    case 'directories':
      return <div className={cls}>{[['Yelp', '#d32323'], ['Apple Maps', '#1d1d1f'], ['Bing', '#008373'], ['TripAdvisor', '#34e0a1']].map(([n, c]) => <div key={n} className="dir fx"><i style={{ background: c }} /><div><b>{name}</b><span>{t('Same hours · phone · menu')}</span></div><em>{t('Order')}</em></div>)}</div>
    case 'apps':
      return <div className={cls}><div className="apph"><i /><b>{name}</b><span>{t('4.8 · 25 min · $0 fee')}</span></div>{ph}<div className="row2"><Bar w="60%" /><b className="pr">$13</b></div><div className="row2"><Bar w="45%" /><b className="pr">$11</b></div><div className="tip fx">{t('Order direct and save 15%')}</div></div>
    case 'chart':
      return <div className={cls}><div className="nm">{t('Where people come from')}</div><div className="bars">{[30, 45, 38, 60, 52, 74, 88].map((h, i) => <i key={i} style={{ height: `${h}%` }} className={i === 6 ? 'fx' : ''} />)}</div><div className="mt">{t('Google · Instagram · your site')}</div></div>
    case 'site': case 'sitemenu': case 'order': case 'reserve': case 'sticky': case 'gift': case 'fix': case 'catering': {
      const nav = <div className="nav"><b>{name}</b><span>{t('Menu')}</span><span className={spec.scene === 'site' ? 'fx' : ''}>{t('Order')}</span><span className={spec.scene === 'site' ? 'fx' : ''}>{t('Reserve')}</span></div>
      const body = spec.scene === 'sitemenu' ? <div className="mlist fx"><div><Bar w="55%" /><b className="pr">$13</b></div><div><Bar w="70%" /><b className="pr">$11</b></div><div><Bar w="40%" /><b className="pr">$9</b></div></div>
        : spec.scene === 'order' ? <div className="ordr">{ph}<em className="fx">{t('Order direct')}</em><span>{t('No app fees')}</span></div>
        : spec.scene === 'reserve' ? <div className="slots fx"><span>6:30</span><span className="on">7:00</span><span>7:30</span><span>8:00</span></div>
        : spec.scene === 'sticky' ? <>{ph}<div className="stk fx"><span>{t('Call')}</span><span>{t('Directions')}</span><span>{t('Order')}</span></div></>
        : spec.scene === 'gift' ? <div className="gc fx"><b>{name}</b><span>{t('Gift card')}</span><em>$50</em></div>
        : spec.scene === 'fix' ? <div className="chk">{[t('Order button works'), t('Hours match Google'), t('Loads in 1.2s'), t('No dead links')].map((x, i) => <div key={i} className={i < 3 ? 'ok' : 'fx'}><i />{x}</div>)}</div>
        : spec.scene === 'catering' ? <div className="form fx"><b>{t('Catering for your office')}</b><Bar w="80%" /><Bar w="60%" /><em>{t('Get a quote')}</em></div>
        : ph
      return <div className={`dw web${now ? ' now' : ''}`}><div className="bar3"><i /><i /><i /></div>{nav}{body}</div>
    }
    case 'post':
      return <div className={cls}><div className="hd"><i />{name}</div>{ph}<div className="cap"><Bar w="60%" /><em className="fx">{t('Reserve')}</em></div></div>
    case 'story':
      return <div className={cls}><div className="prog"><i /><i /><i /></div><div className="stick fx">{t('Book Friday')}</div></div>
    case 'reel':
      return <div className={cls}><i className="play" /><div className="cap">{t('Popcorn chicken, 4 ways')}</div><div className="side"><i /><i /><i /></div></div>
    case 'profile':
      return <div className={cls}><div className="top"><i /><div><b>{name}</b><span>{t('312 posts · 2,140 followers')}</span></div></div><div className="pb fx"><span>{t('Order food')}</span><span>{t('Reserve')}</span><span>{t('Call')}</span></div><div className="g3"><i /><i /><i /></div></div>
    case 'linkpage':
      return <div className={cls}><i className="av" /><b>{name}</b>{[t('Order'), t('Reserve'), t('Menu'), t('Directions')].map((x, i) => <span key={i} className={i === 0 ? 'fx' : ''}>{x}</span>)}</div>
    case 'grid':
      return <div className={cls}>{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} className={i < 3 ? 'pin fx' : ''}>{i < 3 && <em>{[t('Menu'), t('Hours'), t('How to order')][i]}</em>}</i>)}</div>
    case 'batch':
      return <div className={cls}>{[0, 1, 2].map((i) => <div key={i} className={`pc${i}`}><div className="hd"><i />{name}</div><div className="ph" /><Bar w="50%" /></div>)}</div>
    case 'graphic':
      return <div className={cls}><div className="poster fx"><span>{t('Taco Tuesday')}</span><b>{t('Half price, all night')}</b><em>{name}</em></div></div>
    case 'photos':
      return <div className={cls}>{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</div>
    case 'creator':
      return <div className={cls}><div className="hd"><i className="cr" />@seattle.eats<span>{t('40k nearby')}</span></div>{ph}<div className="cap"><Bar w="70%" /><em>{t('at {name}').replace('{name}', name)}</em></div></div>
    case 'ad':
      return <div className={cls}><div className="hd"><i />{name}<span>{t('Sponsored')}</span></div>{ph}<div className="cap"><Bar w="55%" /><em className="fx">{t('Call')}</em><em className="fx">{t('Directions')}</em></div></div>
    case 'ticket':
      return <div className={cls}><div className="stub"><b>{t('Sat')}</b><span>21</span></div><div className="bd"><b>{t('Dumpling night at {name}').replace('{name}', name)}</b><span>{t('7 pm · 24 seats')}</span><em className="fx">{t('Get a seat · $45')}</em></div></div>
    case 'event':
      return <div className={cls}><div className="poster fx"><div className="wash" /><span>{t('Friday')}</span><b>{t('Live music, late menu')}</b><em>{name}</em></div></div>
    case 'calendar':
      return <div className={cls}><div className="mo">{t('October')}</div><div className="days">{Array.from({ length: 21 }, (_, i) => <i key={i} className={[3, 9, 17].includes(i) ? 'fx' : ''} />)}</div><div className="mt">{t('3 pushes planned')}</div></div>
    case 'missed':
      return <div className={cls}><div className="call"><i /><div><b>{t('Missed call')}</b><span>{t('2 min ago')}</span></div></div><div className="bub fx">{t('Sorry we missed you. Menu and ordering here, and we will call you back.')}</div></div>
    case 'keyword':
      return <div className={cls}><div className="bub me">{t('MENU')}</div><div className="bub fx">{t('Here is our menu, and a table is one tap away.')}</div></div>
    case 'dm':
      return <div className={cls}><div className="bub">{t('Do you have a table for 6 tonight?')}</div><div className="bub me fx">{t('We do. 7:30 works. Want it?')}</div><div className="stamp">{t('Answered in 4 min')}</div></div>
    case 'waitlist':
      return <div className={cls}><div className="nm">{t('Waitlist')}</div>{[['Priya', '2', t('Ready')], ['Marcus', '4', '8 min'], ['Lee', '3', '15 min']].map(([n, p, w], i) => <div key={n} className={`wl${i === 0 ? ' fx' : ''}`}><b>{n}</b><span>{t('party of {n}').replace('{n}', p)}</span><em>{w}</em></div>)}</div>
    case 'email':
      return <div className={cls}><div className="inbox"><i /><span>{t('Inbox')}</span></div><div className="mail fx"><b>{name}</b><span>{t('This week: a new dish, and Friday is live music')}</span></div><div className="mail"><Bar w="40%" /><Bar w="70%" /></div></div>
    case 'offer':
      return <div className={cls}><div className="coupon fx"><span>{t('Tuesdays only')}</span><b>{t('Free dessert with any two mains')}</b><em>{name}</em></div></div>
    case 'stamps':
      return <div className={cls}><b className="nm">{t('{name} regulars').replace('{name}', name)}</b><div className="st9">{Array.from({ length: 8 }, (_, i) => <i key={i} className={i < 5 ? 'on' : ''} />)}</div><div className="mt fx">{t('3 more for a free meal')}</div></div>
    case 'review':
      return <div className={cls}><div className="who">{t('A guest')} · {t('5 stars')}</div><div className="tx"><Bar w="90%" /><Bar w="60%" /></div>{now ? <div className="rep dim">{t('No reply · 9 days')}</div> : <div className="rep fx"><b>{name}</b> {t('Thank you. Come say hi next time.')}</div>}</div>
    case 'pin':
      return <div className={cls}><div className="map"><i className="rd h" /><i className="rd v" /><span className="pin fx" /></div><div className="cap"><b>{name}</b><span>{t('Entrance on the corner · parking behind')}</span></div></div>
  }
}

/* Drawn at base size 12px; card and sheet scale the whole thing with `font-size` on `.dw`. */
export const DRAW_CSS = `
.cr .dw{background:#fff;color:#1d1d1f;border-radius:1em;overflow:hidden;font-size:12px;width:100%;position:relative;box-shadow:0 .7em 2em rgba(0,0,0,.12);font-family:'Inter',system-ui,sans-serif;line-height:1.3}
.cr .dw.now{filter:grayscale(1);opacity:.7}
.cr .dw .bar{display:block;height:.5em;border-radius:.3em;background:#e6e6ea}
.cr .dw .ph{height:5.5em}
.cr .dw .ph,.cr .dw .food,.cr .dw.google .strip .ph2,.cr .dw.google .strip .ph3,.cr .dw.google .pd i,.cr .dw.google .gpost i,.cr .dw.profile .top i,.cr .dw.profile .g3 i,.cr .dw.grid i,.cr .dw.photos i,.cr .dw.linkpage .av,.cr .dw.story,.cr .dw.reel,.cr .dw.event .poster{background-color:#e9c9a6;background-image:radial-gradient(circle at 28% 38%,rgba(214,86,52,.95) 0%,rgba(214,86,52,0) 48%),radial-gradient(circle at 72% 30%,rgba(243,182,72,.9) 0%,rgba(243,182,72,0) 45%),radial-gradient(circle at 60% 78%,rgba(126,168,84,.85) 0%,rgba(126,168,84,0) 42%),radial-gradient(circle at 18% 85%,rgba(255,240,214,.9) 0%,rgba(255,240,214,0) 40%),linear-gradient(160deg,#f4dcc2,#d9a97f);background-size:cover;background-position:center}
.cr .dw .ph.p2,.cr .dw .food.p2,.cr .dw.grid i:nth-child(2),.cr .dw.photos i:nth-child(2),.cr .dw.photos i:nth-child(5){background-color:#6b4a35;background-image:radial-gradient(circle at 40% 45%,rgba(240,196,106,.95) 0%,rgba(240,196,106,0) 46%),radial-gradient(circle at 75% 70%,rgba(201,71,58,.8) 0%,rgba(201,71,58,0) 40%),radial-gradient(circle at 15% 80%,rgba(127,176,94,.7) 0%,rgba(127,176,94,0) 38%),linear-gradient(160deg,#8a5d42,#3d2a20)}
.cr .dw .ph.p3,.cr .dw .food.p3,.cr .dw.grid i:nth-child(3),.cr .dw.photos i:nth-child(3),.cr .dw.photos i:nth-child(6){background-color:#d9e3c3;background-image:radial-gradient(circle at 35% 40%,rgba(109,160,74,.9) 0%,rgba(109,160,74,0) 46%),radial-gradient(circle at 70% 35%,rgba(255,245,220,.95) 0%,rgba(255,245,220,0) 40%),radial-gradient(circle at 62% 80%,rgba(230,120,70,.8) 0%,rgba(230,120,70,0) 42%),linear-gradient(160deg,#eef2df,#bcd2a4)}
.cr .dw .ph.p4,.cr .dw .food.p4,.cr .dw.grid i:nth-child(4),.cr .dw.photos i:nth-child(4){background-color:#c9a27f;background-image:radial-gradient(circle at 50% 50%,rgba(255,236,210,.95) 0%,rgba(255,236,210,0) 42%),radial-gradient(circle at 20% 30%,rgba(120,72,45,.85) 0%,rgba(120,72,45,0) 45%),radial-gradient(circle at 82% 75%,rgba(120,72,45,.85) 0%,rgba(120,72,45,0) 45%),linear-gradient(160deg,#e3c8a8,#a97c58)}
.cr .dw .fx{box-shadow:0 0 0 2px var(--c2),0 0 0 6px var(--t1)!important;border-radius:.5em}
.cr .dw .pr{font-weight:600;font-size:.85em;flex:none;margin-left:.6em}
.cr .dw .nm{font-weight:700;font-size:1.1em;padding:.6em .9em 0}
.cr .dw .mt{font-size:.8em;color:#6e6e73;padding:.15em .9em .5em}
/* google */
.cr .dw.google .strip{display:flex;gap:.2em;height:5em;margin:0 0 0}
.cr .dw.google .strip .ph{flex:2;height:100%}
.cr .dw.google .strip .ph2,.cr .dw.google .strip .ph3{flex:1}
.cr .dw.google .strip.fx{border-radius:0;margin:3px 3px 0}
.cr .dw.google.compact .strip{height:3.2em}
.cr .dw.google.compact .btns{display:none}
.cr .dw.google .btns{display:flex;gap:.4em;padding:0 .9em .6em;flex-wrap:wrap}
.cr .dw.google .btns.fx{margin:0 .5em .6em;padding:.3em .4em;flex-wrap:nowrap}
.cr .dw.google .btns i{font-style:normal;border:1px solid #d0d0d4;border-radius:99px;padding:.25em .7em;font-size:.85em;font-weight:600;color:#1a73e8;white-space:nowrap}
.cr .dw.google .btns.fx i.on{background:#1a73e8;color:#fff;border-color:#1a73e8}
.cr .dw.google .btns.dim i{color:#9a9aa0}
.cr .dw.google .menu{display:flex;flex-direction:column;gap:.45em;margin:0 .6em .7em;padding:.4em .4em}
.cr .dw.google .menu>div{display:flex;align-items:center}
.cr .dw.google .nomenu{padding:.1em .9em .8em;font-size:.85em;color:#b0b0b5;font-style:italic}
.cr .dw.google .qa{margin:0 .6em .7em;padding:.4em .5em;display:flex;flex-direction:column;gap:.35em}
.cr .dw.google .qa span{display:block;font-size:.8em;font-weight:600}
.cr .dw.google .qa em{display:block;font-size:.78em;color:#6e6e73;font-style:normal}
.cr .dw.google .prods{display:flex;gap:.4em;margin:0 .6em .7em;padding:.4em}
.cr .dw.google .pd{flex:1;min-width:0}
.cr .dw.google .pd i{display:block;height:2.6em;border-radius:.4em}
.cr .dw.google .pd span{display:block;font-size:.72em;font-weight:600;margin-top:.3em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr .dw.google .gpost{display:flex;gap:.6em;margin:0 .6em .7em;padding:.4em;align-items:center}
.cr .dw.google .gpost i{width:3.2em;height:3.2em;border-radius:.4em;flex:none}
.cr .dw.google .gpost>div{flex:1;display:flex;flex-direction:column;gap:.35em}
.cr .dw.google .gpost em{font-style:normal;align-self:flex-start;font-size:.75em;font-weight:700;color:#1a73e8}
/* search */
.cr .dw.search{padding:.7em}
.cr .dw.search .sbar{display:flex;align-items:center;gap:.5em;border:1px solid #d0d0d4;border-radius:99px;padding:.4em .8em;font-size:.85em;color:#1d1d1f}
.cr .dw.search .sbar i{width:.9em;height:.9em;border-radius:99px;border:2px solid #6e6e73}
.cr .dw.search .res{margin-top:.6em;padding:.2em .4em;display:flex;flex-direction:column;gap:.35em}
.cr .dw.search .res .nm,.cr .dw.search .res .mt{padding:0}
/* directories */
.cr .dw.directories{padding:.5em .6em;display:flex;flex-direction:column;gap:.35em}
.cr .dw.directories .dir{display:flex;align-items:center;gap:.5em;padding:.3em .4em}
.cr .dw.directories .dir i{width:1.4em;height:1.4em;border-radius:.35em;flex:none}
.cr .dw.directories .dir div{flex:1;min-width:0}
.cr .dw.directories .dir b{display:block;font-size:.8em}
.cr .dw.directories .dir span{display:block;font-size:.68em;color:#6e6e73;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr .dw.directories .dir em{font-style:normal;font-size:.7em;font-weight:700;color:var(--c2)}
/* apps */
.cr .dw.apps .apph{display:flex;align-items:center;gap:.5em;padding:.6em .8em .4em}
.cr .dw.apps .apph i{width:1.6em;height:1.6em;border-radius:.4em;background:#ff3008}
.cr .dw.apps .apph b{font-size:.95em}.cr .dw.apps .apph span{font-size:.72em;color:#6e6e73;margin-left:auto}
.cr .dw.apps .ph{height:4em}
.cr .dw.apps .row2{display:flex;align-items:center;padding:.35em .8em 0}
.cr .dw.apps .tip{margin:.5em .6em .6em;padding:.35em .5em;font-size:.75em;font-weight:700;color:var(--c2);background:var(--t1)}
/* chart */
.cr .dw.chart .bars{display:flex;align-items:flex-end;gap:.35em;height:5em;padding:.4em .9em 0}
.cr .dw.chart .bars i{flex:1;border-radius:.3em .3em 0 0;background:var(--t1)}
.cr .dw.chart .bars i.fx{background:var(--c2)}
/* web */
.cr .dw.web .bar3{display:flex;gap:.3em;padding:.5em .7em;background:#f0f0f2}
.cr .dw.web .bar3 i{width:.55em;height:.55em;border-radius:99px;background:#cfcfd4}
.cr .dw.web .nav{display:flex;gap:.7em;align-items:center;padding:.6em .8em;font-size:.85em}
.cr .dw.web .nav b{font-size:1.05em;margin-right:auto}
.cr .dw.web .nav span{color:#6e6e73;padding:.1em .3em}
.cr .dw.web .nav span.fx{color:var(--c2);font-weight:700}
.cr .dw.web .ph{height:4.4em}
.cr .dw.web .mlist{margin:0 .8em .8em;padding:.4em .5em;display:flex;flex-direction:column;gap:.5em}
.cr .dw.web .mlist>div{display:flex;align-items:center}
.cr .dw.web .ordr{position:relative}
.cr .dw.web .ordr .ph{height:5em}
.cr .dw.web .ordr em{position:absolute;left:.8em;bottom:1.7em;font-style:normal;background:var(--c2);color:#fff;font-weight:700;font-size:.8em;padding:.4em .9em;border-radius:99px}
.cr .dw.web .ordr span{position:absolute;left:.9em;bottom:.5em;font-size:.68em;color:#fff;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.cr .dw.web .slots{display:flex;gap:.4em;margin:0 .8em .9em;padding:.4em}
.cr .dw.web .slots span{flex:1;text-align:center;font-size:.8em;font-weight:600;border:1px solid #d0d0d4;border-radius:.5em;padding:.4em 0}
.cr .dw.web .slots span.on{background:var(--c2);color:#fff;border-color:var(--c2)}
.cr .dw.web .stk{display:flex;gap:.4em;margin:.5em .6em .6em;padding:.35em}
.cr .dw.web .stk span{flex:1;text-align:center;font-size:.75em;font-weight:700;background:#1d1d1f;color:#fff;border-radius:99px;padding:.4em 0}
.cr .dw.web .gc{margin:.6em .8em .9em;padding:.8em;border-radius:.7em;background:linear-gradient(135deg,var(--c1),var(--c2));color:#fff;display:flex;flex-direction:column}
.cr .dw.web .gc b{font-size:.95em}.cr .dw.web .gc span{font-size:.7em;opacity:.85}.cr .dw.web .gc em{font-style:normal;font-size:1.4em;font-weight:700;margin-top:.5em;align-self:flex-end}
.cr .dw.web .chk{display:flex;flex-direction:column;gap:.35em;padding:.3em .8em .8em}
.cr .dw.web .chk div{display:flex;align-items:center;gap:.5em;font-size:.78em;padding:.15em .3em}
.cr .dw.web .chk i{width:1em;height:1em;border-radius:99px;border:1.5px solid #d0d0d4;flex:none}
.cr .dw.web .chk .ok i{background:#2e9a78;border-color:#2e9a78}
.cr .dw.web .form{margin:.5em .8em .9em;padding:.6em;display:flex;flex-direction:column;gap:.45em}
.cr .dw.web .form b{font-size:.85em}.cr .dw.web .form em{font-style:normal;align-self:flex-start;font-size:.75em;font-weight:700;background:var(--c2);color:#fff;padding:.35em .8em;border-radius:99px}
/* post / ad / creator */
.cr .dw.post .hd,.cr .dw.ad .hd,.cr .dw.creator .hd,.cr .dw.batch .hd{display:flex;align-items:center;gap:.5em;padding:.55em .7em;font-weight:600;font-size:.85em}
.cr .dw.post .hd i,.cr .dw.ad .hd i,.cr .dw.creator .hd i,.cr .dw.batch .hd i{width:1.3em;height:1.3em;border-radius:99px;background:linear-gradient(45deg,#f9a,#c5f)}
.cr .dw.creator .hd i.cr{background:linear-gradient(45deg,#ffd27a,#ff7a59)}
.cr .dw.ad .hd span,.cr .dw.creator .hd span{margin-left:auto;font-size:.75em;color:#6e6e73;font-weight:500}
.cr .dw.post .ph,.cr .dw.ad .ph,.cr .dw.creator .ph{height:6.5em}
.cr .dw.post .cap,.cr .dw.ad .cap,.cr .dw.creator .cap{display:flex;align-items:center;gap:.5em;padding:.6em .7em .7em}
.cr .dw.post .cap .bar,.cr .dw.ad .cap .bar,.cr .dw.creator .cap .bar{flex:1}
.cr .dw.post .cap em,.cr .dw.ad .cap em{font-style:normal;background:#1d1d1f;color:#fff;padding:.3em .7em;border-radius:99px;font-weight:700;font-size:.78em;flex:none}
.cr .dw.creator .cap em{font-style:normal;font-size:.75em;font-weight:700;color:var(--c2);flex:none}
/* story / reel */
.cr .dw.story,.cr .dw.reel{width:8.5em;height:14em;margin:0 auto}
.cr .dw.story .prog{display:flex;gap:.25em;padding:.5em .5em 0}
.cr .dw.story .prog i{flex:1;height:.22em;border-radius:99px;background:rgba(255,255,255,.55)}
.cr .dw.story .prog i:first-child{background:#fff}
.cr .dw.story .stick{position:absolute;left:50%;bottom:2.2em;transform:translateX(-50%) rotate(-4deg);background:#fff;color:#1d1d1f;font-weight:700;font-size:.8em;padding:.45em .9em;border-radius:.6em;white-space:nowrap}
.cr .dw.reel .play{position:absolute;left:50%;top:44%;width:0;height:0;border-left:1.2em solid rgba(255,255,255,.92);border-top:.8em solid transparent;border-bottom:.8em solid transparent;transform:translate(-40%,-50%)}
.cr .dw.reel .cap{position:absolute;left:.6em;right:2.4em;bottom:.6em;color:#fff;font-size:.75em;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,.6)}
.cr .dw.reel .side{position:absolute;right:.5em;bottom:.6em;display:flex;flex-direction:column;gap:.5em}
.cr .dw.reel .side i{width:1em;height:1em;border-radius:99px;background:rgba(255,255,255,.85)}
/* profile */
.cr .dw.profile .top{display:flex;align-items:center;gap:.6em;padding:.7em .8em .4em}
.cr .dw.profile .top i{width:2.6em;height:2.6em;border-radius:99px;flex:none}
.cr .dw.profile .top b{display:block;font-size:.9em}.cr .dw.profile .top span{font-size:.7em;color:#6e6e73}
.cr .dw.profile .pb{display:flex;gap:.35em;margin:.3em .6em .5em;padding:.3em}
.cr .dw.profile .pb span{flex:1;text-align:center;font-size:.7em;font-weight:700;background:#efefef;border-radius:.4em;padding:.4em 0}
.cr .dw.profile .g3{display:flex;gap:.15em}
.cr .dw.profile .g3 i{flex:1;height:2.6em}
/* linkpage */
.cr .dw.linkpage{padding:.8em .8em .7em;display:flex;flex-direction:column;align-items:center;gap:.4em;background:var(--t1)}
.cr .dw.linkpage .av{width:2.4em;height:2.4em;border-radius:99px}
.cr .dw.linkpage b{font-size:.85em;margin-bottom:.2em}
.cr .dw.linkpage span{width:100%;text-align:center;font-size:.75em;font-weight:700;background:#fff;border-radius:99px;padding:.4em 0}
/* grid */
.cr .dw.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.15em;padding:.15em}
.cr .dw.grid i{display:block;aspect-ratio:1;position:relative;border-radius:.2em}
.cr .dw.grid i.pin em{position:absolute;left:.3em;bottom:.3em;font-style:normal;font-size:.6em;font-weight:700;background:#fff;padding:.2em .5em;border-radius:99px}
/* batch */
.cr .dw.batch{background:none;box-shadow:none;overflow:visible;height:11em}
.cr .dw.batch>div{position:absolute;width:62%;background:#fff;border-radius:.8em;box-shadow:0 .5em 1.5em rgba(0,0,0,.14);overflow:hidden;padding-bottom:.6em}
.cr .dw.batch .pc0{left:0;top:.6em;transform:rotate(-5deg);z-index:2}.cr .dw.batch .pc1{left:22%;top:0;z-index:3}.cr .dw.batch .pc2{right:0;top:.8em;transform:rotate(5deg);z-index:1}
.cr .dw.batch .ph{height:4.4em}.cr .dw.batch .bar{margin:.5em .6em 0}
/* graphic / event */
.cr .dw.graphic,.cr .dw.event{background:none;box-shadow:none;overflow:visible;display:flex;justify-content:center}
.cr .dw .poster{width:8.5em;height:11em;border-radius:.6em;background:linear-gradient(160deg,var(--c1),var(--c2));color:#fff;padding:.9em;display:flex;flex-direction:column;box-shadow:0 .7em 2em rgba(0,0,0,.18);position:relative;overflow:hidden}
.cr .dw .poster .wash{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.65))}
.cr .dw .poster>*{position:relative}
.cr .dw .poster span{font-size:.7em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9}
.cr .dw .poster b{font-size:1.15em;line-height:1.1;margin-top:auto}
.cr .dw .poster em{font-style:normal;font-size:.7em;margin-top:.4em;opacity:.9}
/* photos */
.cr .dw.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:.25em;padding:.25em;background:#1d1d1f}
.cr .dw.photos i{display:block;aspect-ratio:1;border-radius:.25em}
/* ticket */
.cr .dw.ticket{display:flex}
.cr .dw.ticket .stub{width:4em;background:var(--c2);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;border-right:2px dashed rgba(255,255,255,.6)}
.cr .dw.ticket .stub b{font-size:.7em;text-transform:uppercase;letter-spacing:.08em}.cr .dw.ticket .stub span{font-size:1.8em;font-weight:700;line-height:1}
.cr .dw.ticket .bd{flex:1;padding:.7em .8em;display:flex;flex-direction:column;gap:.3em}
.cr .dw.ticket .bd b{font-size:.85em}.cr .dw.ticket .bd span{font-size:.72em;color:#6e6e73}.cr .dw.ticket .bd em{font-style:normal;align-self:flex-start;font-size:.72em;font-weight:700;background:#1d1d1f;color:#fff;padding:.35em .7em;border-radius:99px;margin-top:.2em}
/* calendar */
.cr .dw.calendar{padding:.7em .8em}
.cr .dw.calendar .mo{font-weight:700;font-size:.9em;margin-bottom:.4em}
.cr .dw.calendar .days{display:grid;grid-template-columns:repeat(7,1fr);gap:.25em}
.cr .dw.calendar .days i{display:block;aspect-ratio:1;border-radius:.3em;background:#f0f0f2}
.cr .dw.calendar .days i.fx{background:var(--c2)}
.cr .dw.calendar .mt{padding:.5em 0 0}
/* messages */
.cr .dw.missed,.cr .dw.keyword,.cr .dw.dm{background:none;box-shadow:none;overflow:visible;display:flex;flex-direction:column;gap:.5em;padding:.2em}
.cr .dw .bub{background:#e9e9eb;color:#1d1d1f;padding:.6em .9em;border-radius:1.2em;border-bottom-left-radius:.35em;font-size:.85em;line-height:1.35;max-width:90%;align-self:flex-start}
.cr .dw .bub.me{background:var(--c2);color:#fff;align-self:flex-end;border-radius:1.2em;border-bottom-right-radius:.35em}
.cr .dw.missed .call{display:flex;align-items:center;gap:.6em;background:#fff;border-radius:.8em;padding:.5em .8em;box-shadow:0 .4em 1.2em rgba(0,0,0,.1);align-self:stretch}
.cr .dw.missed .call i{width:1.6em;height:1.6em;border-radius:99px;background:#ec1528}
.cr .dw.missed .call b{display:block;font-size:.85em}.cr .dw.missed .call span{font-size:.7em;color:#6e6e73}
.cr .dw.dm .stamp{align-self:flex-end;font-size:.68em;color:#6e6e73;font-weight:600}
/* waitlist */
.cr .dw.waitlist{padding:0 0 .4em}
.cr .dw.waitlist .wl{display:flex;align-items:center;gap:.5em;padding:.4em .9em;font-size:.8em}
.cr .dw.waitlist .wl b{width:4em}.cr .dw.waitlist .wl span{color:#6e6e73;flex:1}.cr .dw.waitlist .wl em{font-style:normal;font-weight:700}
.cr .dw.waitlist .wl.fx{margin:0 .5em;padding:.4em .4em;color:var(--c2)}
/* email */
.cr .dw.email{padding:.6em .7em}
.cr .dw.email .inbox{display:flex;align-items:center;gap:.4em;font-size:.72em;font-weight:700;color:#6e6e73;margin-bottom:.4em}
.cr .dw.email .inbox i{width:.8em;height:.8em;border-radius:99px;background:#2e9a78}
.cr .dw.email .mail{padding:.45em .5em;display:flex;flex-direction:column;gap:.3em}
.cr .dw.email .mail b{font-size:.85em}.cr .dw.email .mail span{font-size:.75em;color:#6e6e73;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* offer */
.cr .dw.offer{background:none;box-shadow:none;overflow:visible;display:flex;justify-content:center}
.cr .dw.offer .coupon{width:100%;max-width:14em;border-radius:.8em;background:#fff;border:2px dashed var(--c2);padding:.8em .9em;display:flex;flex-direction:column;gap:.3em}
.cr .dw.offer .coupon span{font-size:.68em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--c2)}
.cr .dw.offer .coupon b{font-size:.95em;line-height:1.15}.cr .dw.offer .coupon em{font-style:normal;font-size:.7em;color:#6e6e73}
/* stamps */
.cr .dw.stamps{padding:.7em .8em}
.cr .dw.stamps .nm{padding:0;font-size:.9em}
.cr .dw.stamps .st9{display:grid;grid-template-columns:repeat(4,1fr);gap:.35em;margin:.5em 0}
.cr .dw.stamps .st9 i{display:block;aspect-ratio:1;border-radius:99px;border:1.5px dashed #d0d0d4}
.cr .dw.stamps .st9 i.on{background:var(--c2);border-color:var(--c2)}
.cr .dw.stamps .mt{padding:.2em .3em;font-weight:700;color:var(--c2)}
/* review */
.cr .dw.review{padding:.8em .9em}
.cr .dw.review .who{font-weight:700;font-size:.9em}
.cr .dw.review .tx{display:flex;flex-direction:column;gap:.4em;padding:.5em 0 .6em}
.cr .dw.review .rep{font-size:.82em;background:#f5f5f7;border-radius:.6em;padding:.5em .6em;line-height:1.35}
.cr .dw.review .rep.dim{color:#c0392b;background:#fdecea}
/* pin */
.cr .dw.pin .map{height:6.5em;background:#eef3ee;position:relative;overflow:hidden}
.cr .dw.pin .map .rd{position:absolute;background:#fff}
.cr .dw.pin .map .rd.h{left:0;right:0;top:55%;height:1.2em}
.cr .dw.pin .map .rd.v{top:0;bottom:0;left:38%;width:1em}
.cr .dw.pin .map .pin{position:absolute;left:46%;top:32%;width:1.4em;height:1.4em;border-radius:50% 50% 50% 0;background:var(--c2);transform:rotate(-45deg)}
.cr .dw.pin .cap{padding:.6em .9em .7em}
.cr .dw.pin .cap b{display:block;font-size:.9em}.cr .dw.pin .cap span{font-size:.72em;color:#6e6e73}
`
