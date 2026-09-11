'use client'

/**
 * Create (owner 2026-09-05, the round-4 design built out).
 *
 * Browse: a describe-it box on top, a goal rail, then shelves in three sizes: quick asks (small),
 * campaigns (standard), the programs we run monthly (big), and the setups (rows). Search reads
 * plain words with four filters. Guide me asks three questions and hands back a starter shelf with
 * a why for each pick. A product page says what it costs, when, what you do, where it shows up,
 * what you get, and what happens after you order. Order hands off to the builder that already
 * exists (/campaigns/new/build), the Request Desk for creative asks, or the design order.
 *
 * Honest by construction: cards that are not fully built wear "Coming soon" and do not sell.
 * Every price, turnaround and availability comes from the same modules the builder uses.
 */
import { PROMISE_BY_CARD, promiseSentence, renderPromiseSentence } from '@/lib/promises/registry'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Check, Search, Sparkles, X, Megaphone, Ticket, Tag, Moon, MapPin, Heart, Star, ShoppingCart, Users, Share2, Eye, Lightbulb, MousePointerClick, DoorOpen, Repeat, Loader2, Compass, Image as ImageIcon, Store, Camera, Video, Mail, PenLine, Gift, Clock, Wrench, BarChart3, TrendingUp, Target } from 'lucide-react'
import MvpShell from '../mvp-shell'
import TopRow from '../top-row'
import { useClient } from '@/lib/client-context'
import { gradOf, hueOf, tint, type HueKey } from '../hues'
import { Mark } from '../mark'
import { GOALS, FILTERS, GUIDE_QS, SITUATION_GOAL, isBuyable, matchWord, searchCards, shelfCard, shelfCards, starterPicks, type FilterKey, type ShelfCard, type ShelfGoal, type ShelfStage } from '@/lib/campaigns/data/shelf'
import { CHIP_ORDER, liveForChip, shelfForChip } from '@/lib/campaigns/data/chip-shelf'
import { notSellableReason } from '@/lib/campaigns/data/catalog-availability'
import { REPLY_PROMISE_SENTENCE } from '@/lib/reply-promise'
import { hrefFor, firstName, type OrderPerson } from '../people-row'
import { DEFAULT_SHAPE, type ShelfShape } from '@/lib/clients/shape'
import { useLang } from '../mvp-language'

const C = { ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', fill: '#f5f5f7', mint: '#4abd98', mintDk: '#2e9a78', mintSoft: '#eaf7f3', amberInk: '#8a5a0c', amberBg: '#fbf3e4' }
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GLASS: React.CSSProperties = { background: 'rgba(240,241,240,0.72)', border: '1px solid rgba(255,255,255,0.75)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)' }

const GOAL_ICON: Record<ShelfGoal, typeof Megaphone> = { foryou: Sparkles, announce: Megaphone, event: Ticket, deal: Tag, nights: Moon, newfaces: MapPin, regulars: Heart, reviews: Star, online: ShoppingCart, catering: Users, brand: Share2 }
const STAGE_ICON: Record<ShelfStage, typeof Eye> = { Awareness: Eye, Interest: Lightbulb, Actions: MousePointerClick, Orders: DoorOpen, Retention: Repeat }
const STAGE_HUE: Record<ShelfStage, HueKey> = { Awareness: 'mint', Interest: 'nights', Actions: 'newfaces', Orders: 'amber', Retention: 'brand' }
const KIND_ICON: Record<string, typeof Store> = { design: ImageIcon, 'creative-graphic': ImageIcon, 'creative-social': Share2, 'creative-video': Video, 'creative-photos': Camera, 'creative-copy': PenLine, 'creative-email': Mail, 'creative-print': Ticket, 'creative-logo': Sparkles, 'creative-website': Store, 'creative-ads': Megaphone, 'creative-menu': Tag, 'creative-other': Wrench, story: ImageIcon, gpost: Store, dish: Camera, reel: Video, graphic: ImageIcon, edit: Video, earlyaccess: Mail, slowoffer: Tag, winback: Heart, promoevent: Ticket, launch: Tag, ticket: Ticket, creator: Users, catering: Users, reviewsplan: Star, giftcard: Gift, shoot: Camera, gbp: Store, listings: MapPin, socialprofiles: Share2, measure: BarChart3, emaildeliver: Mail, deliverymenu: ShoppingCart, friction: ShoppingCart, direct: ShoppingCart, website: Store, localseo: MapPin, pos: ShoppingCart, welcome: Mail, birthday: Gift, news: Mail, loyalty: Heart, nights: Moon, firstvisit: MapPin, regulars: Heart, reach: Megaphone, reviewsreply: Star, socialmgmt: Share2, gbpmgmt: Store }
const iconFor = (c: ShelfCard) => KIND_ICON[c.id] ?? GOAL_ICON[c.goal]
const YOU_ICON: Record<string, typeof Check> = { Nothing: Check, Approve: Eye, 'Show up': Users }


const CREATE_CSS = `
.cr .cc-scroll::-webkit-scrollbar{display:none}
.cr .g{--c1:#4abd98;--c2:#2e9a78}
/* the goal rail: orbs */
.cr .rail{display:flex;gap:6px;overflow-x:auto;padding:6px 12px 8px;scrollbar-width:none}
.cr .orb{flex:none;width:66px;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:10.5px;font-weight:600;color:#6e6e73;text-align:center;line-height:1.15;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}
.cr .orb i{width:48px;height:36px;display:grid;place-items:center;color:var(--c2);transition:transform .15s}
.cr .orb i svg{width:24px;height:24px}
.cr .orb::after{content:"";width:22px;height:3px;border-radius:2px;background:transparent;margin-top:2px}
.cr .orb.on::after{background:linear-gradient(135deg,var(--c1),var(--c2))}
.cr .orb.on{color:var(--c2)}
.cr .orb.on i{transform:scale(1.1)}
/* the describe box */
.cr .say{margin:8px 16px 0;padding:2px;border-radius:22px;background:linear-gradient(135deg,#4abd98,#5ba8e8 45%,#9a5bf0);box-shadow:0 10px 30px rgba(74,189,152,.18)}
.cr .say .in{background:#fff;border-radius:20px;padding:14px 14px 12px}
.cr .eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#6e6e73}
.cr .eyebrow svg{width:13px;height:13px;color:#2e9a78}
.cr .aur{background:linear-gradient(90deg,#2e9a78,#3b6fd4,#6a39de);-webkit-background-clip:text;background-clip:text;color:transparent}
.cr .say .ta{display:block;width:100%;min-height:84px;margin-top:8px;border:0;outline:0;resize:none;background:none;font-family:'Cal Sans','Inter',sans-serif;font-size:19px;line-height:1.35;color:#1d1d1f;padding:0;box-sizing:border-box}
.cr .say .ta::placeholder{color:#aeaeb2}
.cr .ex{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.cr .ex button{flex:none;font-size:12px;font-weight:600;border:0;border-radius:999px;padding:6px 10px;cursor:pointer;white-space:nowrap;font-family:inherit}
.cr .say .foot{display:flex;align-items:center;gap:8px;margin-top:8px}
.cr .say .hint{flex:1;font-size:12px;color:#aeaeb2}
/* buttons */
.cr .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 16px;border-radius:19px;border:0;font-family:'Cal Sans','Inter',sans-serif;font-size:14px;font-weight:600;color:#fff;background:linear-gradient(135deg,#4abd98,#2e9a78);box-shadow:0 6px 16px rgba(46,154,120,.4);cursor:pointer;white-space:nowrap}
.cr .btn.hue{background:linear-gradient(135deg,var(--c1),var(--c2));box-shadow:0 6px 16px var(--sh)}
.cr .btn.ghost{background:#f5f5f7;color:#1d1d1f;box-shadow:none}
.cr .btn.block{width:100%;height:46px}
.cr .btn:disabled{background:#e3e6e5;box-shadow:none;cursor:default}
/* sections + shelves */
.cr .sec{display:flex;align-items:flex-end;justify-content:space-between;padding:22px 16px 12px}
.cr .sec h2{margin:0;font-family:'Cal Sans','Inter',sans-serif;font-weight:600;font-size:19px;color:#1d1d1f;letter-spacing:-.01em}
.cr .sec h2 .dot{display:inline-block;width:8px;height:8px;border-radius:4px;background:linear-gradient(135deg,var(--c1),var(--c2));margin:0 8px 2px 0;vertical-align:middle}
.cr .sec .sub{font-size:13px;color:#6e6e73;margin-top:2px}
.cr .sec .more{color:#aeaeb2;display:flex;align-items:center;padding-bottom:4px;background:none;border:0;cursor:pointer}
.cr .shelf{display:flex;gap:12px;overflow-x:auto;padding:2px 16px 8px;scrollbar-width:none}
.cr .facts{display:flex;gap:0;margin-top:2px}
.cr .facts div{flex:1;min-width:0}
.cr .facts div:first-child{flex:1.6}
.cr .facts div:first-child b{white-space:normal;line-height:1.15}
.cr .facts b{display:block;font-size:12px;font-weight:600;color:#1d1d1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:normal}
.cr .facts span{font-size:10.5px;color:#aeaeb2}
.cr .facts div+div{border-left:1px solid #e6e6ea;padding-left:7px;margin-left:7px}
.cr .facts div:last-child{flex:1.2}
.cr .press{transition:transform .15s}
.cr .press:active{transform:scale(.97)}
.cr .card{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04),0 6px 20px rgba(0,0,0,.05);border:0;padding:0;text-align:left;cursor:pointer;font-family:inherit;color:#1d1d1f;overflow:hidden;display:flex;flex-direction:column;position:relative}
.cr .card.dim{opacity:.72}
.cr .tile{background:linear-gradient(135deg,var(--c1),var(--c2));color:#fff;position:relative;overflow:hidden}
.cr .tile::after{content:"";position:absolute;right:-25%;bottom:-60%;width:80%;aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.12)}
.cr .glass{width:48px;height:48px;display:grid;place-items:center;color:#fff;position:relative}
.cr .pill-w{font-size:10px;font-weight:700;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.92);color:var(--c2);display:inline-flex;align-items:center;gap:4px;position:relative;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.cr .pill-w svg{width:10px;height:10px;flex:none}
.cr .pill-w.amber{color:#8a5a0c}
.cr .pill-w.grey{color:#6e6e73}
/* mini */
.cr .mini{flex:none;width:112px;border-radius:16px}
.cr .mini .tile{height:62px;display:grid;place-items:center}
.cr .mini .tile svg{width:26px;height:26px;position:relative}
.cr .mini .body{padding:8px 10px 10px}
.cr .mini .t{font-family:'Cal Sans','Inter',sans-serif;font-size:12.5px;line-height:1.2;font-weight:600}
.cr .mini .p{font-size:11.5px;color:#2e9a78;font-weight:600;margin-top:4px;font-variant-numeric:normal}
.cr .mini .p span{color:#aeaeb2;font-weight:500}
/* standard */
.cr .pc{flex:none;width:212px;border-radius:18px}
.cr .pc .tile{height:100px;display:block}
.cr .pc .tile .glass{position:absolute;top:8px;left:6px}
.cr .pc .tile svg{width:30px;height:30px}
.cr .pc .tile .mv{position:absolute;left:10px;bottom:8px}
.cr .pc .tile .badge{position:absolute;top:8px;left:60px;right:8px;display:flex;justify-content:flex-end}
.cr .pc .body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.cr .pc .t{font-family:'Cal Sans','Inter',sans-serif;font-size:15px;line-height:1.2;font-weight:600}
.cr .pc .s{font-size:12px;color:#6e6e73;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cr .pc .proof{font-size:11px;color:#aeaeb2;display:flex;align-items:center;gap:5px;margin-top:auto;padding-top:4px}
.cr .pc .proof svg{width:11px;height:11px;color:var(--c2)}
/* big */
.cr .big{margin:0 16px 12px;border-radius:20px;width:calc(100% - 32px)}
.cr .big .tile{height:118px;display:flex;align-items:flex-end;padding:12px 14px}
.cr .big .tile::after{right:-10%;top:-60%;bottom:auto;width:60%}
.cr .big .tile .glass{position:absolute;top:12px;left:10px;width:44px;height:44px}
.cr .big .tile .glass svg{width:28px;height:28px}
.cr .big .tile .badge{position:absolute;top:14px;right:14px}
.cr .big .tile .t{font-family:'Cal Sans','Inter',sans-serif;font-size:19px;font-weight:600;position:relative;text-shadow:0 1px 8px rgba(0,0,0,.15)}
.cr .big .body{padding:12px 14px 14px}
.cr .big .s{font-size:13px;color:#6e6e73;line-height:1.4}
.cr .big .facts{margin-top:10px}
.cr .big .facts b{font-size:14px}
.cr .big .month{margin-top:12px;padding-top:10px;border-top:1px solid #e6e6ea}
.cr .big .month .k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#aeaeb2;margin-bottom:6px}
.cr .big .month ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
.cr .big .month li{display:flex;gap:8px;font-size:12.5px;color:#1d1d1f}
.cr .big .month li::before{content:"";width:6px;height:6px;border-radius:3px;background:linear-gradient(135deg,var(--c1),var(--c2));flex:none;margin-top:6px}
/* rows */
.cr .row{display:flex;align-items:center;gap:12px;padding:8px 4px;width:100%;background:none;border:0;text-align:left;cursor:pointer;font-family:inherit;color:#1d1d1f;border-radius:12px}
.cr .row .st{width:22px;height:22px;border-radius:11px;border:1.5px solid #e6e6ea;flex:none;display:grid;place-items:center;color:#fff}
.cr .row .st.done{background:#2e9a78;border-color:#2e9a78}
.cr .row .tx{flex:1;min-width:0}
.cr .row .t{font-size:15px;font-weight:500}
.cr .row .s{font-size:12px;color:#6e6e73;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr .row .s.why{color:#8a5a0c}
.cr .row .r{flex:none;text-align:right}
.cr .row .r b{display:block;font-family:'Cal Sans','Inter',sans-serif;font-size:14px;font-weight:600;font-variant-numeric:normal}
.cr .row .r span{font-size:11px;color:#aeaeb2}
/* a shelf card: title, why, what, price + Order, the lane ladder, the count line (v8) */
.cr .crow{padding:11px 4px}
.cr .crow + .crow{border-top:1px solid #e6e6ea}
.cr .crow .top{display:flex;align-items:flex-start;gap:12px}
.cr .crow .t{display:block;font-size:15px;font-weight:600;line-height:1.25}
.cr .crow .why{display:block;font-size:12.5px;color:#8a5a0c;line-height:1.35;margin-top:2px}
.cr .crow .why.none{color:#6e6e73}
.cr .crow .w{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;color:#6e6e73;line-height:1.35;margin-top:3px}
.cr .crow .pl{display:block;font-size:12.5px;font-weight:600;color:#1d1d1f;margin-top:5px}
.cr .crow .pl span{font-weight:500;color:#aeaeb2}
.cr .lanes{display:flex;flex-direction:column;gap:5px;margin:9px 0 0 50px}
.cr .lanes div{display:flex;gap:9px;font-size:11.5px;color:#6e6e73;line-height:1.35}
.cr .lanes b{flex:none;min-width:66px;color:#2e9a78;font-weight:700}
.cr .count{margin:9px 0 0 50px;padding:7px 9px;border-radius:10px;background:rgba(46,154,120,.08);color:#1c6b52;font-size:11.5px;line-height:1.35}
/* filters */
.cr .filters{display:flex;gap:6px;overflow-x:auto;padding:4px 16px 8px;scrollbar-width:none}
.cr .fch{flex:none;height:34px;padding:0 12px;border-radius:17px;background:#f5f5f7;font-size:12.5px;font-weight:600;color:#1d1d1f;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;border:0;cursor:pointer;font-family:inherit}
.cr .fch svg{width:13px;height:13px}
.cr .fch.on{background:#1d1d1f;color:#fff}
.cr .hintbar{margin:0 16px;padding:10px 12px;border-radius:12px;background:#eaf7f3;color:#2e9a78;font-size:12.5px;display:flex;gap:8px;align-items:center}
.cr .hintbar svg{width:14px;height:14px;flex:none}
.cr .ask{margin:18px 16px 0;padding:14px;border-radius:18px;border:1.5px dashed #d9d9de}
/* guide */
.cr .guide{margin:8px 16px 0;padding:16px;border-radius:20px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04),0 6px 20px rgba(0,0,0,.05)}
.cr .prog{display:flex;gap:4px;margin-bottom:12px}
.cr .prog i{flex:1;height:4px;border-radius:2px;background:#e6e6ea}
.cr .prog i.on{background:linear-gradient(135deg,#4abd98,#2e9a78)}
.cr .q{font-family:'Cal Sans','Inter',sans-serif;font-size:20px;line-height:1.2;font-weight:600}
.cr .qs{font-size:13px;color:#6e6e73;margin-top:4px}
.cr .opts{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.cr .opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:#f5f5f7;width:100%;border:0;text-align:left;cursor:pointer;font-family:inherit;color:#1d1d1f}
.cr .opt .rr{width:20px;height:20px;border-radius:10px;border:2px solid #d9d9de;flex:none;display:grid;place-items:center}
.cr .opt.on{background:#eaf7f3;box-shadow:inset 0 0 0 1.5px #4abd98}
.cr .opt.on .rr{background:#2e9a78;border-color:#2e9a78}
.cr .opt.on .rr::after{content:"";width:8px;height:8px;border-radius:4px;background:#fff}
.cr .opt .t{font-weight:600;font-size:14px}
.cr .opt .s{font-size:12px;color:#6e6e73}
.cr .path{margin:14px 16px 0;padding:14px;border-radius:20px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04),0 6px 20px rgba(0,0,0,.05)}
.cr .path .k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#aeaeb2}
.cr .path ol{margin:10px 0 0;padding:0;list-style:none;display:flex;flex-direction:column}
.cr .path li{display:flex;gap:12px;align-items:flex-start;position:relative;padding-bottom:12px}
.cr .path li::before{content:"";position:absolute;left:13px;top:28px;bottom:0;width:2px;background:#e6e6ea}
.cr .path li:last-child::before{display:none}
.cr .path li .b{width:28px;height:28px;display:grid;place-items:center;color:var(--c2);flex:none;background:#fff;position:relative}
.cr .path li .b svg{width:18px;height:18px}
.cr .path li .tx{flex:1;padding-top:3px}
.cr .path li .t{font-weight:600;font-size:14px}
.cr .path li .n{font-size:12px;font-weight:600;color:var(--c2);margin-top:2px}
.cr .path li.weak .t::after{content:"weakest";font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;background:#fbeaea;color:#c92d32;margin-left:8px;vertical-align:middle}
/* product */
.cr .pp-hero{margin:4px 16px 0;height:170px;border-radius:22px;position:relative;overflow:hidden;color:#fff;display:flex;align-items:flex-end;padding:16px;background:linear-gradient(135deg,var(--c1),var(--c2))}
.cr .pp-hero::after{content:"";position:absolute;right:-10%;top:-50%;width:70%;aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.12)}
.cr .pp-hero .glass{position:absolute;top:14px;left:12px;width:52px;height:52px}
.cr .pp-hero .glass svg{width:32px;height:32px}
.cr .pp-hero .mv{position:absolute;top:18px;right:16px}
.cr .pp-hero .mv svg{width:12px;height:12px}
.cr .pp-hero h1{margin:0;font-family:'Cal Sans','Inter',sans-serif;font-weight:600;font-size:26px;position:relative;text-shadow:0 1px 10px rgba(0,0,0,.15);line-height:1.1}
.cr .pp-hero .why{position:relative;font-size:13px;opacity:.95;margin-top:4px}
.cr .pp-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 16px 0}
.cr .pp-facts div{background:#f5f5f7;border-radius:14px;padding:10px 8px;text-align:center;min-width:0}
.cr .pp-facts b{display:block;font-family:'Cal Sans','Inter',sans-serif;font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:normal}
.cr .pp-facts span{font-size:10.5px;color:#6e6e73}
.cr .pp-sec{padding:20px 16px 0}
.cr .pp-sec h2{margin:0 0 6px;font-family:'Cal Sans','Inter',sans-serif;font-weight:600;font-size:17px;letter-spacing:-.01em}
.cr .pp-sec p{margin:0;font-size:14px;color:#1d1d1f;line-height:1.5}
.cr .get{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.cr .get li{display:flex;gap:10px;font-size:13.5px;color:#1d1d1f;align-items:flex-start}
.cr .get li i{width:18px;height:18px;color:var(--c2);flex:none;display:grid;place-items:center;margin-top:1px}
.cr .get li i svg{width:14px;height:14px}
.cr .tl{margin:10px 0 0;padding:0;list-style:none}
.cr .tl li{display:flex;gap:12px;position:relative;padding-bottom:12px}
.cr .tl li::before{content:"";position:absolute;left:5px;top:18px;bottom:0;width:2px;background:#e6e6ea}
.cr .tl li:last-child::before{display:none}
.cr .tl li i{width:12px;height:12px;border-radius:6px;background:linear-gradient(135deg,var(--c1),var(--c2));flex:none;margin-top:4px;box-shadow:0 0 0 3px var(--t1)}
.cr .tl li i.you{background:#d99a1e;box-shadow:0 0 0 3px #fbf3e4}
.cr .tl .d{font-size:11px;font-weight:700;color:#aeaeb2;width:56px;flex:none;padding-top:2px}
.cr .tl .t{font-size:13.5px;color:#1d1d1f}
.cr .tl .t b{font-weight:600}
.cr .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.cr .chips span{font-size:12px;font-weight:600;color:#1d1d1f;background:#f5f5f7;border-radius:999px;padding:5px 10px}
.cr .sticky{position:fixed;left:0;right:0;bottom:calc(82px + env(safe-area-inset-bottom));display:flex;justify-content:center;pointer-events:none;z-index:5}
.cr .sticky .in{pointer-events:auto;width:calc(100% - 32px);max-width:448px;display:flex;align-items:center;gap:12px;padding:12px 16px 12px;border-radius:24px;background:rgba(255,255,255,.86);backdrop-filter:saturate(180%) blur(16px);-webkit-backdrop-filter:saturate(180%) blur(16px);box-shadow:0 10px 30px rgba(0,0,0,.12);border:1px solid rgba(255,255,255,.75)}
.cr .sticky .p{font-family:'Cal Sans','Inter',sans-serif;font-size:20px;font-weight:600;flex:1;min-width:0;font-variant-numeric:normal}
.cr .sticky .p span{display:block;font-family:Inter,system-ui,sans-serif;font-size:11.5px;color:#6e6e73;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr .sticky .btn{height:46px;padding:0 20px}
/* the Canva-shaped Create (owner 2026-09-11): describe, quick request, then browse */
.cr .say2{padding:12px 14px}
.cr .say2 .ta{display:block;width:100%;min-height:58px;margin-top:6px;border:0;outline:0;resize:none;background:none;font-family:'Inter',system-ui,sans-serif;font-size:15px;line-height:1.45;color:#1d1d1f;padding:0;box-sizing:border-box}
.cr .say2 .ta::placeholder{color:#aeaeb2}
.cr .say2 .foot{display:flex;align-items:center;gap:8px;margin-top:6px}
.cr .say2 .hint{flex:1;font-size:12px;color:#aeaeb2}
.cr .qgrid{display:grid;grid-template-rows:repeat(2,auto);grid-auto-flow:column;grid-auto-columns:64px;gap:10px 8px;overflow-x:auto;padding:2px 16px 6px;scrollbar-width:none}
.cr .qt{width:64px;display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}
.cr .qt .ic{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;color:var(--c2);background:var(--t1)}
.cr .qt .ic svg{width:23px;height:23px;stroke-width:2}
.cr .qt span:last-child{font-size:10.5px;font-weight:600;text-align:center;line-height:1.2;color:#1d1d1f}
.cr .browse{margin:22px 16px 0}
.cr .stages{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-top:8px}
/* stage tabs: a coloured OUTLINE, not a tinted fill, so they read as a different kind of thing
   from the quick-request tiles above them (owner 2026-09-11). Picked = the outline filled in. */
.cr .stg{--c1:#4abd98;--c2:#2e9a78;--sh:#2e9a7866;flex:none;font-size:12.5px;font-weight:700;padding:7px 12px;border-radius:99px;border:1.5px solid var(--c2);color:var(--c2);white-space:nowrap;background:#fff;display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-family:inherit;transition:transform .15s,background .15s}
.cr .stg i{width:7px;height:7px;border-radius:99px;background:var(--c2);display:inline-block}
.cr .stg.on{background:var(--c2);color:#fff;box-shadow:0 6px 14px var(--sh)}
.cr .stg.on i{background:rgba(255,255,255,.9)}
.cr .srch{margin-top:10px;width:100%;display:flex;align-items:center;gap:8px;height:42px;padding:0 14px;border-radius:999px;background:#f5f5f7;border:0;color:#6e6e73;font-size:14.5px;cursor:text;font-family:inherit;text-align:left}
.cr .srch svg{color:#2e9a78;flex:none}
/* the one door at the bottom */
.cr .door{margin:22px 16px 0;padding:16px;border-radius:20px;background:linear-gradient(135deg,#eaf7f3,#f2f9f6 60%,#f5f5f7)}
.cr .door .dt{font-family:'Cal Sans','Inter',sans-serif;font-size:17px;font-weight:600;color:#1d1d1f;letter-spacing:-.01em}
.cr .door .ds{font-size:12.5px;color:#6e6e73;margin-top:4px;line-height:1.45}
.cr .door .da{display:flex;gap:8px;margin-top:12px}
.cr .door .da .btn{flex:1;height:40px}
.cr .door .da .btn.ghost{background:#fff}
.cr .pc.wide{width:280px}
.cr .pc .pl{display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:4px;font-size:12.5px}
.cr .pc .pl b{font-weight:700;color:#1d1d1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr .pc .pl span{color:#aeaeb2;font-size:11.5px}
.cr .pc .pl em{margin-left:auto;font-style:normal;font-weight:600;font-size:9.5px;padding:2px 7px;border-radius:99px;background:var(--t1);color:var(--c2);display:inline-flex;align-items:center;gap:4px;white-space:nowrap;flex:none}
.cr .pc .pl em i{width:5px;height:5px;border-radius:99px;background:var(--c2)}
`
/* a card's colour, as CSS variables the classes read */
const hv = (k: HueKey): React.CSSProperties => ({ ['--c1' as string]: hueOf(k)[0], ['--c2' as string]: hueOf(k)[1], ['--t1' as string]: tint(k, 0.16), ['--sh' as string]: tint(k, 0.4, 1) } as React.CSSProperties)

type View = { name: 'browse' } | { name: 'search' } | { name: 'guide' } | { name: 'product'; id: string }

interface Signals { views30d?: number; actions30d?: { directions: number; calls: number; websiteClicks: number }; rating?: number; ratingCount?: number; unrepliedReviews?: number; listingGaps?: string[] }
interface Describe { ok: boolean; reason?: string; situation: string | null; summary: string; unsupported: string[]; when?: string | null }
/** The four facts about THIS client the shelf is drawn from (/api/campaigns/shelf-context). */
interface ShelfCtx { goals: string[]; monthlyBudget: number | null; shape: ShelfShape; hasGoogle: boolean }

/* The describe box reads a situation and lands on a shelf goal; the shelf is keyed by the
 * owner's chip now, so this is the one bridge between the two vocabularies. */
const CHIP_FOR_GOAL: Record<ShelfGoal, string> = {
  foryou: 'More foot traffic overall',
  announce: 'Launch something new',
  event: 'Promote a specific offering',
  deal: 'More customers on slow days',
  nights: 'More customers on slow days',
  newfaces: 'More foot traffic overall',
  regulars: 'Turn first-timers into regulars',
  reviews: 'Improve online reputation',
  online: 'More bookings or orders',
  catering: 'Grow catering orders',
  brand: 'Build local awareness',
}

export default function CreatePage() {
  const router = useRouter()
  const params = useSearchParams()
  const { client } = useClient()
  const { T } = useLang()
  /* The price as the owner reads it. Every real price is a number and travels as it is; the ONE
     card price that is a WORD is 'Quote', and it was the last English left on a Spanish shelf. */
  const priceWord = (p: string) => (p === 'Quote' ? T('Quote') : p)
  const clientId = client?.id
  // the view lives in the URL so back works and a product can be shared
  const view: View = useMemo(() => {
    const item = params.get('item'); if (item) return { name: 'product', id: item }
    const v = params.get('view'); if (v === 'search') return { name: 'search' }; if (v === 'guide') return { name: 'guide' }
    return { name: 'browse' }
  }, [params])
  const go = useCallback((v: View) => {
    const qs = new URLSearchParams(params.toString()); qs.delete('item'); qs.delete('view')
    if (v.name === 'product') qs.set('item', v.id); else if (v.name !== 'browse') qs.set('view', v.name)
    router.push(`/dashboard/campaigns/new${qs.toString() ? `?${qs}` : ''}`)
  }, [params, router])
  const back = () => router.back()

  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ budget: 'any', you: 'any', speed: 'any', kind: 'any' })
  const [sheet, setSheet] = useState<FilterKey | null>(null)
  const [signals, setSignals] = useState<Signals | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [ctx, setCtx] = useState<ShelfCtx | null>(null)
  /** The chip whose shelf is showing. Null until the client's own goals arrive. */
  const [chip, setChip] = useState<string | null>(null)
  /* the Canva-shaped browse (owner 2026-09-11): which stage the rails are filtered to (null =
     For you, everything). The location, budget and sort chips were tried and cut the same day:
     the stage is the one filter an owner reaches for. */
  const [stage, setStage] = useState<ShelfStage | null>(null)
  /** The people who are on this client's live orders, for the bottom door. Empty is a fine
   *  answer: the door then says Get help, which is a real place, and never invents a name. */
  const [people, setPeople] = useState<OrderPerson[]>([])

  useEffect(() => {
    if (!clientId) return
    let live = true
    fetch(`/api/dashboard/why-signals?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setSignals(j as Signals) }).catch(() => {})
    fetch(`/api/campaigns/shelf-context?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setCtx(j as ShelfCtx) }).catch(() => {})
    fetch(`/api/dashboard/people?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && Array.isArray(j?.people)) setPeople(j.people as OrderPerson[]) }).catch(() => {})
    fetch(`/api/campaigns?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!live || !Array.isArray(j?.campaigns)) return
      const ids = new Set<string>()
      for (const c of j.campaigns as Array<{ status: string; draft?: { sourceCatalogId?: string; sourceCatalogIds?: string[] } }>) {
        if (c.status !== 'shipped') continue
        if (c.draft?.sourceCatalogId) ids.add(c.draft.sourceCatalogId)
        for (const x of c.draft?.sourceCatalogIds ?? []) ids.add(x)
      }
      setDone(ids)
    }).catch(() => {})
    return () => { live = false }
  }, [clientId])

  /* ── the owner's own shelf ──
   * The chip they picked in setup opens the page. Until their goals arrive we show the second
   * chip ("More foot traffic overall"), because it is the one whose shelf is true for anyone. */
  const shape: ShelfShape = ctx?.shape ?? DEFAULT_SHAPE
  const activeChip = chip ?? ctx?.goals[0] ?? CHIP_ORDER[1]
  /** What this card asks for on the first payment (the one-time amount, or the first month). */
  const liveIds = useMemo(() => liveForChip(activeChip, shape), [activeChip, shape])


  /* why-now lines from the account's own numbers */
  const whyNow = useCallback((c: ShelfCard): string | null => {
    const s = signals; if (!s) return null
    if ((c.id === 'reviewsreply' || c.id === 'reviewsplan') && s.unrepliedReviews) return T('{n} reviews are waiting for a reply', { n: s.unrepliedReviews })
    if (c.id === 'reviewsplan' && s.rating != null && s.rating < 4.3) return T('You are at {r} stars', { r: s.rating.toFixed(1) })
    if ((c.id === 'gbp' || c.id === 'listings') && s.listingGaps?.length) return T(s.listingGaps.length === 1 ? '{n} thing on your listing needs fixing' : '{n} things on your listing need fixing', { n: s.listingGaps.length })
    if (c.id === 'gpost' && s.views30d) return T('{n} people saw your listing this month', { n: s.views30d.toLocaleString() })
    if (c.id === 'friction' && s.actions30d && s.actions30d.directions > 0) return T('{n} people asked for directions this month', { n: s.actions30d.directions })
    return null
  }, [signals, T])

  const open = (c: ShelfCard) => go({ name: 'product', id: c.id })
  const order = (c: ShelfCard) => {
    if (!isBuyable(c)) return
    if (c.handoff.kind === 'request') router.push(`/dashboard/requests?type=${c.handoff.type}`)
    else if (c.handoff.kind === 'design') router.push('/dashboard/design/order')
    else router.push(`/dashboard/campaigns/new/build?template=${c.handoff.id}&view=build`)
  }

  /* ── pieces ── */
  const Coming = () => <span className="pill-w grey">{T('Coming soon')}</span>
  /* small: a quick ask */
  const Mini = ({ c }: { c: ShelfCard }) => { const Icon = iconFor(c); const buy = isBuyable(c)
    return (
      <button type="button" onClick={() => open(c)} className={`card mini press${buy ? '' : ' dim'}`} style={hv(c.goal)}>
        <div className="tile"><Icon />{!buy && <span style={{ position: 'absolute', top: 6, left: 6 }}><Coming /></span>}</div>
        {/* A held card prints NO price and NO ready time. Both are offers, and there is
            nothing to offer yet. Same rule as the product page's fact strip. */}
        <div className="body"><div className="t">{c.title}</div><div className="p">{buy ? <>{priceWord(c.price)} <span>· {T(c.ready)}</span></> : <span>{T('Not on sale yet')}</span>}</div></div>
      </button>
    )
  }
  /* row: a setup */
  const Sec = ({ t, s, hue, more }: { t: string; s?: string; hue: HueKey; more?: () => void }) => (
    <div className="sec" style={hv(hue)}>
      <div><h2><span className="dot" />{t}</h2>{s && <div className="sub">{s}</div>}</div>
      {more && <button type="button" onClick={more} className="more" aria-label={T('See all')}><ChevronRight size={18} /></button>}
    </div>
  )
  const Shelf = ({ children }: { children: React.ReactNode }) => <div className="shelf cc-scroll">{children}</div>

  /* ── the describe-it box ── */
  const [ask, setAsk] = useState('')
  const [reading, setReading] = useState(false)
  const [read, setRead] = useState<Describe | null>(null)
  const askRef = useRef<HTMLTextAreaElement>(null)
  const describe = async () => {
    const text = ask.trim(); if (!text || reading) return
    setReading(true); setRead(null)
    try {
      const r = await fetch('/api/campaigns/describe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, clientId }) })
      const j = await r.json().catch(() => ({}))
      const res = (j?.result ?? j) as { situation?: string | null; summary?: string; unsupported?: string[]; when?: string | null }
      setRead({ ok: r.ok && j?.ok !== false, reason: j?.reason, situation: res?.situation ?? null, summary: res?.summary ?? '', unsupported: Array.isArray(res?.unsupported) ? res.unsupported : [], when: res?.when ?? null })
      // Steer the chip rail, which is what draws the shelf now.
      const c = res?.situation ? CHIP_FOR_GOAL[SITUATION_GOAL[res.situation]] : null
      if (c) setChip(c)
    } catch { setRead({ ok: false, reason: 'no-answer', situation: null, summary: '', unsupported: [] }) }
    setReading(false)
  }
  /* ── the describe-it box (owner 2026-09-11, the Canva-shaped Create) ──
     A hairline card in the kit: a kicker, the words, one ink arrow. The read-back underneath is
     exactly what it was. Rendered as a VALUE, not an inner component: a component declared
     inside the page is a new type on every keystroke, and React remounts it, which drops the
     caret out of the box mid-word. */
  const sayBox = (
    <div className="say"><div className="in say2">
      <div className="eyebrow"><Sparkles /><span className="aur">{T('Describe it')}</span></div>
      <textarea ref={askRef} className="ta" value={ask} onChange={(e) => setAsk(e.target.value)} rows={2} placeholder={T('What do you want to do? A video for the new dish, Labor Day hours, more people in on Tuesdays…')} />
      <div className="foot">
        <span className="hint">{T('We read it and suggest a plan. You can change anything.')}</span>
        <button type="button" className="btn" onClick={describe} disabled={!ask.trim() || reading} style={{ height: 36 }}>{reading ? <Loader2 size={15} className="mvp-spin" /> : <ArrowRight size={15} />}{reading ? T('Reading') : T('Plan it')}</button>
      </div>
        {read && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
            {read.ok && read.situation ? (() => {
              const g = SITUATION_GOAL[read.situation] ?? 'announce'
              const picks = liveForChip(CHIP_FOR_GOAL[g] ?? CHIP_ORDER[1], shape).map((id) => shelfCard(id)).filter((c): c is ShelfCard => !!c).slice(0, 3)
              const GI = GOAL_ICON[g]
              return (
                <div style={hv(g)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Mark hue={g} size={36}><GI size={20} /></Mark><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: C.ink }}>{GOALS.find((x) => x.id === g)?.label}</div>{read.summary && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 1 }}>{read.summary}</div>}</div></div>
                  {read.unsupported.length > 0 && <div style={{ fontSize: 12, color: C.amberInk, background: C.amberBg, borderRadius: 10, padding: '7px 10px', marginTop: 8 }}>{T('We do not do {list} yet. Everything else is below.', { list: read.unsupported.join(', ') })}</div>}
                  <div style={{ marginTop: 6 }}>{picks.map((c) => { const I = iconFor(c); return <button key={c.id} type="button" onClick={() => open(c)} className="row" style={{ ...hv(c.goal), padding: '7px 2px' }}><Mark hue={c.goal} size={30}><I size={16} /></Mark><span className="tx"><span className="t" style={{ display: 'block', fontSize: 14 }}>{c.title}</span></span><span className="r"><b style={{ fontSize: 13 }}>{priceWord(c.price)}</b></span><ChevronRight size={15} color={C.faint} /></button> })}</div>
                  {picks[0] && <button type="button" className="btn hue block" style={{ marginTop: 6 }} onClick={() => order(picks[0])}>{T('Build this')} <ArrowRight size={15} /></button>}
                </div>
              )
            })() : (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{T('We could not read that one.')}</div>
                <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>{T('Pick a goal above and we show the best ways, or send your words to your strategist and a person reads them.')}</div>
                <Link href={`/dashboard/messages?to=strategist&draft=${encodeURIComponent(ask)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 13, fontWeight: 700, color: C.mintDk, textDecoration: 'none' }}>{T('Send it to your strategist')} <ArrowRight size={14} /></Link>
              </div>
            )}
          </div>
        )}
    </div></div>
  )
  /* ── the door at the bottom ──
   * The rule from Move 6: name a person only when a real person is on this client's live work.
   * Then the door is that person's own thread. Otherwise it is Get help, with the one promise
   * the whole product makes. No stock face, no phone number we do not answer. */
  /* ── the one door at the bottom (owner 2026-09-11: Guide me and Ask us were two cards saying
     the same thing). One card, two ways out: three questions, or a person. The person is named
     only when a real one is on this client's live work (Move 6); otherwise it is Get help. */
  const helpDoor = (() => {
    const p = people[0]
    const who = p ? firstName(p.name) : null
    const href = p ? hrefFor(p) : '/dashboard/get-help'
    return (
      <div className="door">
        <div className="dt">{T('Not sure what to pick?')}</div>
        <div className="ds">{who ? `${T('{name} is already on your work.', { name: who })} ` : ''}{T(REPLY_PROMISE_SENTENCE)}</div>
        <div className="da">
          <button type="button" className="btn" onClick={() => go({ name: 'guide' })}><Compass size={15} /> {T('Guide me')}</button>
          <Link href={href} className="btn ghost" style={{ textDecoration: 'none' }}>{who ? T('Message {name}', { name: who }) : T('Ask a person')}</Link>
        </div>
      </div>
    )
  })()
  const AskBox = () => (
    <div className="ask">
      <div style={{ fontWeight: 600, color: C.ink, marginBottom: 6 }}>{T('Not seeing it? Ask for anything')}</div>
      <Link href="/dashboard/requests?type=other" style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, background: C.fill, padding: '0 6px 0 14px', textDecoration: 'none', color: C.mute, fontSize: 14 }}>{T('Tell us what you need')}<span style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, background: gradOf('mint'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowRight size={15} /></span></Link>
    </div>
  )

  /* ── views ── */
  const cards = shelfCards()
  const searchBar = (
    <div style={{ ...GLASS, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 14px' }}>
      <Search size={16} color={C.faint} />
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={T('Search campaigns')} style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontSize: 14, color: C.ink, fontFamily: 'inherit', outline: 'none' }} />
      {q && <button type="button" onClick={() => setQ('')} aria-label={T('Clear')} style={{ width: 26, height: 26, borderRadius: 13, border: 'none', background: '#e3e6e5', color: C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={13} /></button>}
    </div>
  )

  /* ── quick request (owner 2026-09-11): the fifteen things owners do most, two rows that scroll
     sideways. Every tile is a door to something real: a live screen, a card's own page, or the
     describe box with the first words typed. A tile whose card is not on the shelf is dropped,
     so nothing here opens onto "that one is not on the shelf". */
  type Quick = { t: string; I: typeof PenLine; to: { ask: true } | { href: string } | { card: string }; hue?: HueKey }
  const QUICK_ALL: Quick[] = [
    { hue: 'announce', t: T('Announce'), I: Megaphone, to: { ask: true } },
    { hue: 'newfaces', t: T('Hours'), I: Clock, to: { href: '/dashboard/business-info/hours' } },
    { hue: 'brand', t: T('Post'), I: PenLine, to: { href: '/dashboard/post' } },
    { hue: 'event', t: T('Boost'), I: TrendingUp, to: { href: '/dashboard/boost' } },
    { hue: 'reviews', t: T('Reviews'), I: Star, to: { href: '/dashboard/review-replies' } },
    { t: T('Graphic'), I: ImageIcon, to: { card: 'creative-graphic' } },
    { t: T('Video'), I: Video, to: { card: 'creative-video' } },
    { t: T('Photos'), I: Camera, to: { card: 'creative-photos' } },
    { t: T('Menu'), I: Tag, to: { card: 'creative-menu' } },
    { t: T('Website'), I: Store, to: { card: 'creative-website' } },
    { t: T('Influencers'), I: Users, to: { card: 'creator' } },
    { t: T('Ads'), I: Target, to: { card: cards.reach ? 'reach' : 'creative-ads' } },
    { t: T('Event'), I: Ticket, to: { card: 'promoevent' } },
    { t: T('Deal'), I: Tag, to: { card: 'slowoffer' } },
    { t: T('Email'), I: Mail, to: { card: 'creative-email' } },
  ]
  const QUICK = QUICK_ALL.filter((x) => !('card' in x.to) || !!cards[x.to.card])
  function quickGo(x: Quick) {
    if ('ask' in x.to) { setAsk(T('Announce something: ')); askRef.current?.focus(); return }
    if ('href' in x.to) { router.push(x.to.href); return }
    const c = cards[x.to.card]; if (c) open(c)
  }

  /* ── the browse block: the five stages, then search ──
     The stage is the filter every rail reads, with the stage's own Insights colour as its dot.
     Buyable cards first in every rail, then the coming-soon ones. */
  const STAGES: ShelfStage[] = ['Awareness', 'Interest', 'Actions', 'Orders', 'Retention']
  const sorted = (list: ShelfCard[]) => [...list.filter(isBuyable), ...list.filter((c) => !isBuyable(c))]
  const fits = (c: ShelfCard) => stage == null || c.stage === stage
  const browseBlock = (
    <div className="browse">
      <div className="stages cc-scroll">
        <button type="button" className={`stg${stage == null ? ' on' : ''}`} onClick={() => setStage(null)}>{T('For you')}</button>
        {STAGES.map((s) => <button key={s} type="button" className={`stg${stage === s ? ' on' : ''}`} onClick={() => setStage(s)} style={hv(STAGE_HUE[s])}><i />{T(s)}</button>)}
      </div>
      <button type="button" className="srch" onClick={() => go({ name: 'search' })}><Search size={16} /> {T('Search campaigns and services')}</button>
    </div>
  )

  /* ── a picture card (the standard `.pc` card, wearing the card's goal hue and a stage tag) ──
     The tag is why the page exists: the owner reads which number this moves on every card, not
     only behind a stage tab. A done setup wears Done; a held card wears Coming soon and no price. */
  const pc = (c: ShelfCard, wide?: boolean) => { const Icon = iconFor(c); const buy = isBuyable(c); const isDone = done.has(c.id); const why = whyNow(c)
    return (
      <button key={c.id} type="button" onClick={() => open(c)} className={`card pc press${buy ? '' : ' dim'}${wide ? ' wide' : ''}`} style={hv(c.goal)}>
        <div className="tile"><span className="glass"><Icon /></span>{(!buy || isDone) && <span className="badge">{isDone ? <span className="pill-w"><Check strokeWidth={3} /> {T('Done')}</span> : <Coming />}</span>}</div>
        <div className="body">
          <div className="t">{c.title}</div>
          <div className="s">{why ?? c.plain}</div>
          <div className="pl">{buy ? <b>{priceWord(c.price)}</b> : <span>{T('Not on sale yet')}</span>}<em style={hv(STAGE_HUE[c.stage])}><i />{T(c.stage)}</em></div>
        </div>
      </button>
    )
  }
  const rail = ({ t, s, list, hue, kind }: { t: string; s?: string; list: ShelfCard[]; hue: HueKey; kind?: string }) => list.length === 0 ? null : (
    <>
      <Sec t={t} s={s} hue={hue} more={kind && list.length > 8 ? () => { setFilters((f) => ({ ...f, kind })); go({ name: 'search' }) } : undefined} />
      <Shelf>{list.slice(0, 8).map((c) => pc(c, list.length === 1))}</Shelf>
    </>
  )

  const browse = () => {
    const all = Object.values(cards).filter(fits)
    const rec = sorted(liveIds.map((id) => cards[id]).filter((c): c is ShelfCard => !!c && fits(c) && isBuyable(c)))
    const of = (f: (c: ShelfCard) => boolean) => sorted(all.filter(f))
    /* Five kinds of thing, not five stages: a creative is one piece made, a campaign is several
       against a date, a setup is something you have fixed once, a program runs every month, and
       people come in. They differ in what happens after the tap, which is what a category means. */
    const creatives = of((c) => c.kind === 'quick')
    const campaigns = of((c) => c.kind === 'campaign' && c.id !== 'creator')
    const setups = of((c) => c.kind === 'setup')
    const monthly = of((c) => c.kind === 'program')
    const people = of((c) => c.id === 'creator')
    const empty = [rec, creatives, campaigns, setups, monthly, people].every((l) => l.length === 0)
    return (
      <>
        {sayBox}
        <div className="sec" style={{ paddingTop: 18, paddingBottom: 10 }}><div><h2>{T('Quick request')}</h2></div></div>
        <div className="qgrid cc-scroll">{QUICK.map((x) => { const I = x.I; return <button key={x.t} type="button" className="qt press" onClick={() => quickGo(x)} style={hv(x.hue ?? ('card' in x.to ? cards[x.to.card]?.goal ?? 'mint' : 'mint'))}><span className="ic"><I /></span><span>{x.t}</span></button> })}</div>
        {browseBlock}
        {empty && <div style={{ padding: '18px 16px 0', color: C.mute, fontSize: 13.5, lineHeight: 1.5 }}><b style={{ color: C.ink }}>{T('Nothing fits those filters yet.')}</b> {T('Pick another stage.')}</div>}
        {rail({ t: T('Recommended for you'), list: rec, hue: stage ? STAGE_HUE[stage] : 'mint' })}
        {rail({ t: T('Creatives'), list: creatives, hue: 'brand', kind: 'quick' })}
        {rail({ t: T('Campaigns'), list: campaigns, hue: 'event', kind: 'campaign' })}
        {rail({ t: T('Setup'), list: setups, hue: 'newfaces', kind: 'setup' })}
        {rail({ t: T('Every month'), list: monthly, hue: 'nights', kind: 'program' })}
        {rail({ t: T('People'), list: people, hue: 'catering' })}

        {helpDoor}
        <div style={{ height: 24 }} />
      </>
    )
  }

  const search = () => {
    const hits = searchCards(q).filter((c) => (Object.keys(FILTERS) as FilterKey[]).every((k) => FILTERS[k].test(c, filters[k])))
    const active = (Object.keys(FILTERS) as FilterKey[]).filter((k) => filters[k] !== 'any')
    return (
      <>
        <div className="filters cc-scroll">
          {(Object.keys(FILTERS) as FilterKey[]).map((k) => { const on = filters[k] !== 'any'; const lab = on ? FILTERS[k].opts.find((o) => o[0] === filters[k])![1] : FILTERS[k].label
            return <button key={k} type="button" onClick={() => setSheet(k)} className={`fch${on ? ' on' : ''}`}>{lab}<ChevronDown /></button> })}
          {active.length > 0 && <button type="button" onClick={() => setFilters({ budget: 'any', you: 'any', speed: 'any', kind: 'any' })} className="fch" style={{ color: C.mute }}>Clear {active.length}</button>}
        </div>
        {!q && <div className="hintbar"><Lightbulb />{T('Plain words work: try flyer, menu photos, TikTok, Yelp, coupons')}</div>}
        <div style={{ padding: '16px 16px 6px', fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink }}>{T(hits.length === 1 ? '{n} result' : '{n} results', { n: hits.length })}{q ? ` ${T('for “{q}”', { q })}` : ''}</div>
        {hits.length === 0 ? (
          <div style={{ padding: '20px 16px', color: C.mute, fontSize: 13.5, lineHeight: 1.5 }}><b style={{ color: C.ink }}>{T('Nothing matches yet.')}</b> {T('Loosen a filter, or just tell us what you need.')}</div>
        ) : (
          <div style={{ padding: '0 12px' }}>
            {hits.map((c) => { const Icon = iconFor(c); const mw = matchWord(c, q); const buy = isBuyable(c)
              return <button key={c.id} type="button" onClick={() => open(c)} className={`row press${buy ? '' : ' dim'}`} style={hv(c.goal)}>
                <Mark hue={c.goal} size={34}><Icon size={18} /></Mark>
                <span className="tx"><span className="t" style={{ display: 'block' }}>{c.title}</span><span className="s" style={{ display: 'block' }}>{!buy ? T('Coming soon') : mw ? T('matches “{word}”', { word: mw }) : c.sub || c.plain}</span></span>
                {/* No price on a held card, here either. The search row was the last place a
                    coming-soon card still carried one, which read as a thing you could buy. */}
                <span className="r">{buy ? <><b>{priceWord(c.price)}</b><span>{c.ready}</span></> : <span>{T('Not on sale yet')}</span>}</span>
              </button> })}
          </div>
        )}
        <AskBox />
        <div style={{ height: 24 }} />
      </>
    )
  }

  const [answers, setAnswers] = useState<string[]>([])
  const guide = () => {
    const step = answers.length
    const s = signals
    const path: [string, string, typeof Eye, string, HueKey][] = [
      ['found', T('Found'), Eye, s?.views30d ? T('{n} saw your listing this month', { n: s.views30d.toLocaleString() }) : T('How many people see you'), 'mint'],
      ['tempt', T('Tempted'), Lightbulb, s?.rating ? T('{r} stars · {n} reviews', { r: s.rating.toFixed(1), n: s.ratingCount ?? 0 }) : T('What they think when they look'), 'nights'],
      ['slow', T('Come in'), DoorOpen, s?.actions30d ? T('{n} asked for directions', { n: s.actions30d.directions }) : T('Who actually comes'), 'amber'],
      ['back', T('Come back'), Repeat, T('Who comes twice'), 'brand'],
    ]
    const weak = answers[0] ?? null
    const Path = ({ k }: { k: string }) => (
      <div className="path"><div className="k">{k}</div><ol>{path.map(([id, t, I, n, hue]) => <li key={id} className={weak === id ? 'weak' : ''} style={hv(hue)}><span className="b"><I /></span><div className="tx"><div className="t">{t}</div><div className="n">{n}</div></div></li>)}</ol></div>
    )
    if (step < GUIDE_QS.length) {
      const qq = GUIDE_QS[step]
      return (
        <div style={{ paddingBottom: 24 }}>
          <div className="guide">
            <div className="prog">{GUIDE_QS.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
            <div className="q">{qq.q}</div><div className="qs">{qq.s}</div>
            <div className="opts">{qq.opts.map(([v, t, sub]) => <button key={v} type="button" onClick={() => setAnswers((a) => [...a, v])} className="opt press"><span className="rr" /><span style={{ flex: 1 }}><span className="t" style={{ display: 'block' }}>{t}</span>{sub && <span className="s" style={{ display: 'block' }}>{sub}</span>}</span></button>)}</div>
            {step > 0 && <button type="button" onClick={() => setAnswers((a) => a.slice(0, -1))} style={{ marginTop: 12, border: 'none', background: 'none', color: C.mute, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>{T('Back a step')}</button>}
          </div>
          <Path k={T('How a guest reaches you')} />
        </div>
      )
    }
    const [hurt, you, bud] = answers
    const picks = starterPicks(hurt, you, bud)
    const stage = path.find((p) => p[0] === hurt) ?? path[0]
    const total = picks.reduce((t, c) => t + c.priceN, 0)
    return (
      <div style={{ paddingBottom: 24 }}>
        <div style={{ padding: '10px 16px 0' }}>
          <div className="eyebrow" style={{ ...hv(stage[4]), color: hueOf(stage[4])[1], background: tint(stage[4], 0.16), borderRadius: 999, padding: '5px 10px' }}>{T('Where it sits:')} {stage[1]} · {stage[3]}</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: C.ink, marginTop: 8, lineHeight: 1.1 }}>{T('Your starter shelf')}</div>
          <div style={{ fontSize: 13.5, color: C.mute, marginTop: 4 }}>{T('Three picks that fit what you said. About {amount} to start.', { amount: total ? `$${total.toLocaleString()}` : T('a quote') })}</div>
        </div>
        <div style={{ padding: '12px 12px 0' }}>{picks.map((c) => { const Icon = iconFor(c); const why = whyNow(c) ?? c.plain.split('.')[0]
          return <button key={c.id} type="button" onClick={() => open(c)} className="row press" style={hv(c.goal)}><Mark hue={c.goal} size={36}><Icon size={18} /></Mark><span className="tx"><span className="t" style={{ display: 'block', fontWeight: 600 }}>{c.title}</span><span className="s" style={{ display: 'block', whiteSpace: 'normal', lineHeight: 1.35 }}>{why}</span></span><span className="r"><b>{priceWord(c.price)}</b></span></button> })}</div>
        <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {picks[0] && <button type="button" className="btn block" onClick={() => order(picks[0])}>{T('Start with the first one')} <ArrowRight size={15} /></button>}
          <button type="button" onClick={() => setAnswers([])} style={{ border: 'none', background: 'none', color: C.mute, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{T('Start over')}</button>
        </div>
        <Path k={T('Why these three')} />
      </div>
    )
  }

  const product = (id: string) => {
    const c = cards[id]
    if (!c) return <div style={{ padding: 30, textAlign: 'center', color: C.mute }}>{T('That one is not on the shelf.')} <button type="button" onClick={() => go({ name: 'browse' })} style={{ border: 'none', background: 'none', color: C.mintDk, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>{T('Back to Create')}</button></div>
    const Icon = iconFor(c); const SI = STAGE_ICON[c.stage]; const buy = isBuyable(c); const YI = YOU_ICON[c.you] ?? Check
    const TL: [string, string, boolean][] = c.kind === 'setup'
      ? [[T('Day 0'), T('You order. We read what you already have.'), false], [T('Day 1'), T('We start the work and send you anything we need.'), false], [T('Day 3'), T('You check the result. One tap, or a note.'), true], [c.ready, T('Done, and on your Home.'), false]]
      : c.kind === 'program'
        ? [[T('Day 0'), T('You order. We read your menu, photos and calendar.'), false], [T('Week 1'), T('The first pieces land for your OK.'), true], [T('Every week'), T('New pieces go out on the plan.'), false], [T('Monthly'), T('A read of what moved, on Insights.'), false]]
        : [[T('Day 0'), T('You order. We read your menu, photos and calendar.'), false], [T('Day 1'), T('We draft it.'), false], [T('Day 2'), T('You approve in Inbox. One tap, or a note.'), true], [c.ready, T('It goes out.'), false]]
    /* What else is on the shelves this card sits on, and only what can be bought: a "goes well
       with" row full of coming-soon cards is a shop window of empty boxes. */
    const goesWith = [...new Set(CHIP_ORDER.filter((ch) => shelfForChip(ch, shape).includes(c.id)).flatMap((ch) => liveForChip(ch, shape)))]
      .filter((x) => x !== c.id).map((x) => cards[x]).filter((x): x is ShelfCard => !!x).slice(0, 4)
    const why = whyNow(c)
    return (
      <div style={{ ...hv(c.goal), paddingBottom: 100 }}>
        <div className="pp-hero">
          <span className="glass"><Icon /></span>
          <span className="pill-w mv"><SI /> {T('Moves {stage}', { stage: T(c.stage) })}</span>
          <div style={{ position: 'relative' }}><h1>{c.title}</h1>{why && buy && <div className="why">{why}</div>}{!buy && <div className="why"><span className="pill-w grey">{T('Coming soon')}</span></div>}</div>
        </div>
        {/* A coming-soon card prints NO price. A price is an offer, and there is nothing to
            offer yet; the reason takes its place. */}
        <div className="pp-facts">
          {buy && <div><b>{priceWord(c.price)}</b><span>{T('price')}</span></div>}
          <div><b>{c.ready}</b><span>{T('ready in')}</span></div><div><b>{T(c.you)}</b><span>{T('you do')}</span></div><div><b>{c.channels.length}</b><span>{T(c.channels.length === 1 ? 'channel' : 'channels')}</span></div>
        </div>
        {!buy && <div style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 12, background: C.fill, fontSize: 12.5, color: C.mute, lineHeight: 1.4 }}>{notSellableReason(c.id)}</div>}
        {(() => { const ps = buy ? renderPromiseSentence(promiseSentence(PROMISE_BY_CARD[c.id] ?? []), T) : null; return ps ? <div className="pp-count" style={{ margin: '0 16px 4px', padding: '10px 12px', borderRadius: 12, background: 'rgba(46,154,120,.08)', fontSize: 12.5, color: '#1c6b52', lineHeight: 1.4 }}>{ps}</div> : null })()}
        <div className="pp-sec"><h2>{T('In plain words')}</h2><p>{c.plain}</p></div>
        <div className="pp-sec"><h2>{T('What you get')}</h2><ul className="get">{c.get.map((g) => <li key={g}><i><Check strokeWidth={3} /></i>{g}</li>)}</ul></div>
        <div className="pp-sec"><h2>{T('What happens after you order')}</h2>
          <ul className="tl">{TL.map(([d, t, you], i) => <li key={i}><i className={you ? 'you' : ''} /><span className="d">{d}</span><span className="t">{you ? <b>{t}</b> : t}</span></li>)}</ul>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.mute }}><YI size={14} color="#d99a1e" /> {T('Amber is you. Everything else is us.')}</div>
        </div>
        <div className="pp-sec"><h2>{T('Where it shows up')}</h2><div className="chips">{c.channels.map((x) => <span key={x}>{x}</span>)}</div></div>
        {goesWith.length > 0 && (<><Sec t={T('Goes well with')} hue={c.goal} /><Shelf>{goesWith.map((x) => <Mini key={x.id} c={x} />)}</Shelf></>)}
        <div className="sticky"><div className="in">
          {/* No price and no Order on a card that cannot be bought. The bar says what it is
              waiting on and offers the one thing that is real: telling us you want it. */}
          <div className="p" style={buy ? undefined : { fontSize: 15 }}>{buy ? priceWord(c.price) : T('Not on sale yet')}<span>{buy ? `${c.cadence} · ${T(c.you).toLowerCase()} · ${c.ready}` : T('We will tell you the day it opens')}</span></div>
          {buy
            ? <button type="button" className="btn hue" onClick={() => order(c)}>{T(c.handoff.kind === 'request' && c.price === 'Quote' ? 'Ask for a quote' : 'Order')} <ArrowRight size={15} /></button>
            : <Link href={`/dashboard/messages?to=strategist&draft=${encodeURIComponent(`I want ${c.title} when it is ready.`)}`} className="btn ghost" style={{ textDecoration: 'none' }}>{T('Tell me when')}</Link>}
        </div></div>
      </div>
    )
  }



  /* ── the filter sheet ── */
  const filterSheetUI = sheet ? (
    <>
      <div onClick={() => setSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.28)', zIndex: 40 }} />
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '22px 22px 0 0', padding: '10px 16px calc(18px + env(safe-area-inset-bottom))' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.line, margin: '0 auto 12px' }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink, marginBottom: 8 }}>{FILTERS[sheet].label}</div>
          {FILTERS[sheet].opts.map(([v, t, s]) => { const on = filters[sheet] === v
            return <button key={v} type="button" onClick={() => { setFilters((f) => ({ ...f, [sheet]: v })); setSheet(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}><span style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${on ? C.mintDk : C.line}`, background: on ? C.mintDk : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>{on && <Check size={12} strokeWidth={3} />}</span><span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15, fontWeight: on ? 700 : 500, color: C.ink }}>{t}</span>{s && <span style={{ display: 'block', fontSize: 12.5, color: C.mute }}>{s}</span>}</span></button> })}
        </div>
      </div>
    </>
  ) : null

  const title = view.name === 'guide' ? T('Guide me') : view.name === 'product' ? (cards[view.id]?.title ?? T('Create')) : T('Create')
  const backTo = view.name === 'browse' ? undefined : '/dashboard/campaigns/new'
  return (
    <MvpShell active="create" header={
      <div style={{ flexShrink: 0, background: '#fff' }}>
        <div style={{ padding: '0 0 2px' }}><TopRow back={backTo} middle={view.name === 'search' ? searchBar : <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textAlign: 'center' }}>{title}</span>} /></div>
      </div>
    }>
      <div className="cr" style={{ background: '#fff', minHeight: '100%', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <style>{CREATE_CSS}</style>
        {view.name === 'browse' && browse()}
        {view.name === 'search' && search()}
        {view.name === 'guide' && guide()}
        {view.name === 'product' && product(view.id)}
      </div>
      {filterSheetUI}
      {view.name !== 'browse' && view.name !== 'product' && (
        <button type="button" onClick={back} aria-label={T('Back')} style={{ display: 'none' }}><ChevronLeft /></button>
      )}
    </MvpShell>
  )
}
