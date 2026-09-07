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
import { PROMISE_BY_CARD, promiseSentence } from '@/lib/promises/registry'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Check, Search, Sparkles, X, Megaphone, Ticket, Tag, Moon, MapPin, Heart, Star, ShoppingCart, Users, Share2, Eye, Lightbulb, MousePointerClick, DoorOpen, Repeat, Loader2, Compass, Image as ImageIcon, Store, Camera, Video, Mail, PenLine, Gift, Clock, Wrench, BarChart3 } from 'lucide-react'
import MvpShell from '../mvp-shell'
import TopRow from '../top-row'
import { useClient } from '@/lib/client-context'
import { gradOf, hueOf, tint, type HueKey } from '../hues'
import { Mark } from '../mark'
import { GOALS, FILTERS, GUIDE_QS, SETUP_IDS, SITUATION_GOAL, hasFreeLane, isBuyable, lanesFor, matchWord, searchCards, shelfCard, shelfCards, starterPicks, type FilterKey, type ShelfCard, type ShelfGoal, type ShelfStage } from '@/lib/campaigns/data/shelf'
import { CHIP_ORDER, liveForChip, laterForChip, shelfForChip, shelfTitle } from '@/lib/campaigns/data/chip-shelf'
import { notSellableReason } from '@/lib/campaigns/data/catalog-availability'
import { liveAlternativesFor } from '@/lib/campaigns/data/live-alternatives'
import { REPLY_PROMISE } from '@/lib/reply-promise'
import { CONTACT_KEY, firstName } from '../people-row'
import { BUDGET_CHIPS } from '@/app/(auth)/onboarding/full/data'
import { budgetCapForChip, NO_CAP_BUDGET_CHIPS } from '@/lib/goals/defaults'
import { SHAPE_LABEL, DEFAULT_SHAPE, type ShelfShape } from '@/lib/clients/shape'
import { useLang } from '../mvp-language'

const C = { ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', fill: '#f5f5f7', mint: '#4abd98', mintDk: '#2e9a78', mintSoft: '#eaf7f3', amberInk: '#8a5a0c', amberBg: '#fbf3e4' }
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GLASS: React.CSSProperties = { background: 'rgba(240,241,240,0.72)', border: '1px solid rgba(255,255,255,0.75)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)' }
const CARD_SHADOW = '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)'

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
.cr .crow .w{display:block;font-size:12.5px;color:#6e6e73;line-height:1.35;margin-top:3px;-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
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
`
/**
 * THE ONE OPEN DECISION ON THIS PAGE, and it is the owner's.
 *
 * The shelf's Order pills and row glyphs wear the per-goal hue map (hues.ts, owner-approved
 * 2026-09-04: purple newfaces, blue reviews, teal event). The same file's first paragraph says
 * chrome stays mint, and the v8 mockup the twenty owners actually scored is mint and ink only.
 * Both readings are defensible and only the owner can settle it, so nothing is changed here:
 * false keeps the hues that are live today, true paints every row's glyph and button mint and
 * leaves the goal colour to the section dot. Flip this one line, look at both, then keep one.
 */
const SHELF_CHROME_MINT = false

/* a card's colour, as CSS variables the classes read */
const hv = (k: HueKey): React.CSSProperties => ({ ['--c1' as string]: hueOf(k)[0], ['--c2' as string]: hueOf(k)[1], ['--t1' as string]: tint(k, 0.16), ['--sh' as string]: tint(k, 0.4, 1) } as React.CSSProperties)

type View = { name: 'browse' } | { name: 'search' } | { name: 'guide' } | { name: 'product'; id: string }

interface Signals { views30d?: number; actions30d?: { directions: number; calls: number; websiteClicks: number }; rating?: number; ratingCount?: number; unrepliedReviews?: number; listingGaps?: string[] }
interface Describe { ok: boolean; reason?: string; situation: string | null; summary: string; unsupported: string[]; when?: string | null }
/** The four facts about THIS client the shelf is drawn from (/api/campaigns/shelf-context). */
interface ShelfCtx { goals: string[]; monthlyBudget: number | null; shape: ShelfShape; hasGoogle: boolean }

/* One glyph and one colour per goal chip, the same pair the owner saw on the setup tiles and
 * the same hue family the cards wear. Keys are the exact GOAL_CHIPS strings (stored values). */
const CHIP_HUE: Record<string, HueKey> = {
  'More customers on slow days': 'nights',
  'More foot traffic overall': 'newfaces',
  'Build local awareness': 'brand',
  'Promote a specific offering': 'announce',
  'Grow social following': 'catering',
  'Improve online reputation': 'reviews',
  'Launch something new': 'announce',
  'Stay top of mind': 'regulars',
  'Compete with nearby businesses': 'newfaces',
  'More bookings or orders': 'online',
  'Turn first-timers into regulars': 'regulars',
  'Grow catering orders': 'catering',
  'Better photos of my food': 'event',
  'Reach a younger crowd': 'brand',
}
/** What the "For you" shelf is called for this shape, in the owner's words (from the mockups). */
const SHELF_TITLE_FOR_SHAPE: Record<ShelfShape, string> = {
  storefront: 'For you',
  truck: 'For a truck',
  delivery_only: 'For delivery only',
  two_locations: 'For this shop',
  catering: 'For catering',
  seasonal: 'For the season',
}
const money = (n: number) => `$${n.toLocaleString()}`
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
  /* null = the owner has not touched it, so the section opens on its own when the list is short
     (v8: a five-row roadmap is a roadmap; a fifteen-row one is a wall). Reset to null on every
     chip change, because the next goal's list is a different length. */
  const [showLater, setShowLater] = useState<boolean | null>(null)
  const [budgetSheet, setBudgetSheet] = useState(false)
  /** The people who are on this client's live orders, for the bottom door. Empty is a fine
   *  answer: the door then says Get help, which is a real place, and never invents a name. */
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([])

  useEffect(() => {
    if (!clientId) return
    let live = true
    fetch(`/api/dashboard/why-signals?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setSignals(j as Signals) }).catch(() => {})
    fetch(`/api/campaigns/shelf-context?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setCtx(j as ShelfCtx) }).catch(() => {})
    fetch(`/api/dashboard/people?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && Array.isArray(j?.people)) setPeople(j.people as { id: string; name: string; role: string }[]) }).catch(() => {})
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
  const cap = ctx?.monthlyBudget ?? null
  /** What this card asks for on the first payment (the one-time amount, or the first month). */
  const firstPayment = useCallback((id: string) => shelfCard(id)?.priceN ?? 0, [])
  const liveIds = useMemo(() => liveForChip(activeChip, shape), [activeChip, shape])
  const underCap = useMemo(() => liveIds.filter((id) => cap == null || firstPayment(id) <= cap), [liveIds, cap, firstPayment])
  const overCap = useMemo(() => liveIds.filter((id) => cap != null && firstPayment(id) > cap), [liveIds, cap, firstPayment])
  const laterIds = useMemo(() => laterForChip(activeChip, shape), [activeChip, shape])

  const setBudget = async (chipLabel: string | null) => {
    const value = chipLabel ? budgetCapForChip(chipLabel) : null
    const before = ctx?.monthlyBudget ?? null
    setCtx((c) => (c ? { ...c, monthlyBudget: value } : c))
    setBudgetSheet(false)
    if (!clientId) return
    try {
      const r = await fetch(`/api/campaigns/shelf-context?clientId=${clientId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthlyBudget: value }),
      })
      // The route now 404s when the update matched no row. Put the old number back rather than
      // leaving a shelf drawn at a cap that was never saved and reverts on the next load.
      if (!r.ok) setCtx((c) => (c ? { ...c, monthlyBudget: before } : c))
    } catch { setCtx((c) => (c ? { ...c, monthlyBudget: before } : c)) }
  }

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
        <div className="body"><div className="t">{c.title}</div><div className="p">{buy ? <>{c.price} <span>· {c.ready}</span></> : <span>{T('Not on sale yet')}</span>}</div></div>
      </button>
    )
  }
  /* row: a setup */
  const SetupRow = ({ c }: { c: ShelfCard }) => { const Icon = iconFor(c); const isDone = done.has(c.id); const buy = isBuyable(c); const why = whyNow(c)
    return (
      <button type="button" onClick={() => open(c)} className={`row press${buy ? '' : ' dim'}`} style={hv(c.goal)}>
        <span className={`st${isDone ? ' done' : ''}`}>{isDone && <Check size={13} strokeWidth={3} />}</span>
        <Mark hue={c.goal} size={34}><Icon size={18} /></Mark>
        <span className="tx"><span className="t" style={{ display: 'block', textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1 }}>{c.title}</span>{(why || !buy) && <span className={`s${why && buy ? ' why' : ''}`} style={{ display: 'block' }}>{buy ? why : T('Coming soon')}</span>}</span>
        <span className="r"><b>{isDone ? T('Done') : buy ? c.price : ''}</b></span>
        <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
      </button>
    )
  }
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
      if (c) { setChip(c); setShowLater(null) }
    } catch { setRead({ ok: false, reason: 'no-answer', situation: null, summary: '', unsupported: [] }) }
    setReading(false)
  }
  /* The four example sentences. They are TRANSLATED before they are shown and before they are
     dropped in the box, because what an owner reads has to be what they would send. */
  const EXAMPLES: [ShelfGoal, string][] = [['event', 'Halloween party Oct 31, want it packed'], ['announce', 'New fall menu lands Sep 18'], ['nights', 'Tuesdays are dead, fill them'], ['catering', 'Get office lunch orders']]
  const SayBox = () => (
    <div className="say">
      <div className="in">
        <div className="eyebrow"><Sparkles /><span className="aur">{T('Describe what you want to do')}</span></div>
        <textarea ref={askRef} className="ta" value={ask} onChange={(e) => setAsk(e.target.value)} rows={3} placeholder={T('Say it in a sentence. A date, a dish, a slow night…')} />
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
                  <div style={{ marginTop: 6 }}>{picks.map((c) => { const I = iconFor(c); return <button key={c.id} type="button" onClick={() => open(c)} className="row" style={{ ...hv(c.goal), padding: '7px 2px' }}><Mark hue={c.goal} size={30}><I size={16} /></Mark><span className="tx"><span className="t" style={{ display: 'block', fontSize: 14 }}>{c.title}</span></span><span className="r"><b style={{ fontSize: 13 }}>{c.price}</b></span><ChevronRight size={15} color={C.faint} /></button> })}</div>
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
      </div>
    </div>
  )

  const Examples = () => (
    <div className="ex cc-scroll" style={{ margin: '10px 16px 0' }}>
      {EXAMPLES.map(([g, t]) => { const k: HueKey = g === 'foryou' ? 'mint' : g; const words = T(t)
        return <button key={t} type="button" onClick={() => { setAsk(words); askRef.current?.focus() }} style={{ color: hueOf(k)[1], background: tint(k, 0.16) }}>{words}</button> })}
    </div>
  )
  /* ── the door at the bottom ──
   * The rule from Move 6: name a person only when a real person is on this client's live work.
   * Then the door is that person's own thread. Otherwise it is Get help, with the one promise
   * the whole product makes. No stock face, no phone number we do not answer. */
  const Fallback = () => {
    const p = people[0]
    const who = p ? firstName(p.name) : null
    const href = p ? `/dashboard/messages?to=${CONTACT_KEY[p.role] ?? 'strategist'}` : '/dashboard/get-help'
    return (
      <div className="ask">
        <div style={{ fontWeight: 600, color: C.ink, marginBottom: 2 }}>{who ? T('Nothing fit? Ask {name}.', { name: who }) : T('Nothing fit? Ask us.')}</div>
        <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 8, lineHeight: 1.4 }}>
          {who ? T('{name} is already on your work. A real person replies {promise}.', { name: who, promise: T(REPLY_PROMISE) }) : T('A real person replies {promise}.', { promise: T(REPLY_PROMISE) })}
        </div>
        <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, background: C.fill, padding: '0 6px 0 14px', textDecoration: 'none', color: C.ink, fontSize: 14, fontWeight: 600 }}>
          {who ? T('Message {name}', { name: who }) : T('Get help')}
          <span style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, background: gradOf('mint'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowRight size={15} /></span>
        </Link>
      </div>
    )
  }
  const AskBox = () => (
    <div className="ask">
      <div style={{ fontWeight: 600, color: C.ink, marginBottom: 6 }}>{T('Not seeing it? Ask for anything')}</div>
      <Link href="/dashboard/requests?type=other" style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, background: C.fill, padding: '0 6px 0 14px', textDecoration: 'none', color: C.faint, fontSize: 14 }}>{T('Tell us what you need')}<span style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, background: gradOf('mint'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowRight size={15} /></span></Link>
    </div>
  )

  /* ── the goal rail ──
   * The fourteen chips the owner was actually asked in setup, in their own words, with the
   * ones they picked first. It used to be ten goals keyed in different words entirely, so
   * nothing an owner said in setup could reach this page. Existing filter-chip styling; the
   * budget chip is the same pill with a dashed edge when it has never been answered. */
  const Rail = () => (
    <div className="filters cc-scroll" style={{ paddingTop: 6, paddingBottom: 4 }}>
      {/* No cap is no cap. The top chip ("Over $2,500/mo") and "Not sure yet" both leave
          monthly_budget null, and this pill never prints a number the owner did not say. */}
      <button type="button" onClick={() => setBudgetSheet(true)} className="fch" style={cap == null ? { border: '1.5px dashed #d9d9de', background: '#fff', color: C.mute } : undefined}>
        {cap == null ? T('Set a budget') : T('Up to {amount} to start', { amount: money(cap) })}
      </button>
      {ctx && <span className="fch" style={{ background: '#fff', color: C.mute, cursor: 'default' }}>{T(SHAPE_LABEL[shape].title)}</span>}
    </div>
  )
  const GoalRail = () => {
    const mine = ctx?.goals ?? []
    const ordered = [...mine, ...CHIP_ORDER.filter((c) => !mine.includes(c))]
    return (
      <div className="filters cc-scroll" style={{ paddingTop: 10 }}>
        {ordered.map((c) => {
          const on = c === activeChip
          return <button key={c} type="button" onClick={() => { setChip(c); setShowLater(null) }} className={`fch${on ? ' on' : ''}`}>{T(c)}</button>
        })}
      </div>
    )
  }

  /* ── views ── */
  const cards = shelfCards()
  const SearchBar = ({ live }: { live?: boolean }) => live ? (
    <div style={{ ...GLASS, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 14px' }}>
      <Search size={16} color={C.faint} />
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={T('Search campaigns')} style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontSize: 14, color: C.ink, fontFamily: 'inherit', outline: 'none' }} />
      {q && <button type="button" onClick={() => setQ('')} aria-label={T('Clear')} style={{ width: 26, height: 26, borderRadius: 13, border: 'none', background: '#e3e6e5', color: C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={13} /></button>}
    </div>
  ) : (
    <button type="button" onClick={() => go({ name: 'search' })} style={{ ...GLASS, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', width: '100%', color: C.faint, fontSize: 14, cursor: 'text', fontFamily: 'inherit' }}><Search size={16} /> {T('Search campaigns')}</button>
  )

  /* ONE SHELF CARD, the v8 shape the twenty owners read:
       glyph · title · why (their own number, when one fired) · what the work is ·
       the price with its time word · the button, then the lane ladder where a card has
       three lanes, then the count line from the ledger registry.
     Nothing here is invented: the why comes from their numbers, the what from the card's own
     plain words, the ladder from the setup-card engine, the count from PROMISE_BY_CARD. A card
     with no promise spec prints NO count line rather than a made-up one. */
  const ShelfRow = ({ id, reason, softReason }: { id: string; reason?: string | null; /** the reason is the no-numbers-yet line, not a finding about them */ softReason?: boolean }) => {
    const c = cards[id]
    if (!c) return null
    const Icon = iconFor(c)
    const free = hasFreeLane(c.id)
    const price = c.price === 'Quote' && free ? T('Free') : c.price
    // The time word under the price. A monthly card says what monthly means; everything else
    // says when it is ready. "Fee inside" is true: chargedPriceLabel folds the service fee in.
    const monthly = c.price.includes('/mo') && !c.price.includes('+')
    const priceSub = monthly ? T('monthly, cancel any time') : c.price === 'Quote' ? c.ready : `${c.ready} · ${T('fee inside')}`
    const lanes = lanesFor(c.id)
    const count = promiseSentence(PROMISE_BY_CARD[c.id] ?? [])
    // The glyph and the Order button take the card's goal colour, or mint, per the switch above.
    const chrome: HueKey = SHELF_CHROME_MINT ? 'mint' : c.goal
    return (
      <div className="crow" style={hv(chrome)}>
        <div className="top">
          <button type="button" onClick={() => open(c)} className="press" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 0, padding: 0, textAlign: 'left', font: 'inherit', color: C.ink, cursor: 'pointer' }}>
            <Mark hue={chrome} size={38}><Icon size={19} /></Mark>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="t">{c.title}</span>
              {/* Amber is a finding from their own numbers. The no-numbers-yet line is not one, so it
                  wears the plain grey instead. */}
              {reason && <span className={`why${softReason ? ' none' : ''}`}>{reason}</span>}
              <span className="w">{c.plain || c.get[0]}</span>
              <span className="pl">{price}{price !== T('Free') && free ? T(', or free, you do it') : ''} <span>· {priceSub}</span></span>
            </span>
          </button>
          {/* The button matches the price. A desk card with a real price is an order, not an ask:
              only a card that genuinely has no price ('Quote') says Ask. */}
          <button type="button" className="btn hue" style={{ height: 34, padding: '0 14px', flex: 'none', marginTop: 2 }} onClick={() => order(c)}>{free && c.price === 'Quote' ? T('Start') : c.handoff.kind === 'request' && c.price === 'Quote' ? T('Ask') : T('Order')}</button>
        </div>
        {lanes.length > 0 && (
          <div className="lanes">
            {lanes.map((l) => <div key={l.kind}><b>{T(l.price)}</b><span>{T(l.what)}</span></div>)}
          </div>
        )}
        {count && <div className="count">{count}</div>}
      </div>
    )
  }

  const browse = () => {
    /* The reason line is their own number where one exists. Where Google has never reported a
       day there is no number to state, so the FIRST card says so plainly instead of a card
       going out with a hollow zero on it. Said once, on the first row, not fourteen times. */
    const nothingYet = ctx && !ctx.hasGoogle ? T('We do not have your Google numbers yet. This is the first step.') : null
    const setupRows = SETUP_IDS.map((id) => cards[id]).filter((c): c is ShelfCard => !!c && isBuyable(c))
    return (
      <>
        <SayBox />
        <Examples />
        {/* The goal rail sits UNDER the say box and the examples, the v8 order the twenty owners
            read. It used to be pinned in the header above them, which pushed the first shelf row
            off a 520px screen. The budget and shape chips stay in the header: they are facts about
            this account that every price on the page is drawn at, not a choice you scroll to. */}
        <GoalRail />

        <Sec t={T(SHELF_TITLE_FOR_SHAPE[shape])} s={`${T(ctx?.hasGoogle ? 'From your own numbers' : 'No numbers yet')} · ${T('{n} you can order today', { n: underCap.length })}`} hue={CHIP_HUE[activeChip] ?? 'mint'} />
        {underCap.length === 0 ? (
          <div style={{ padding: '0 16px', color: C.mute, fontSize: 13.5, lineHeight: 1.5 }}>
            <b style={{ color: C.ink }}>{T('Nothing here yet for this one.')}</b> {T('Everything we could do for it is below, with the reason it is not ready.')}
          </div>
        ) : (
          <div style={{ padding: '0 12px' }}>{underCap.map((id, i) => { const own = cards[id] ? whyNow(cards[id]) : null
              return <ShelfRow key={id} id={id} reason={own ?? (i === 0 ? nothingYet : null)} softReason={!own} /> })}</div>
        )}

        {overCap.length > 0 && cap != null && (
          <>
            <Sec t={T('Above {amount} to start', { amount: money(cap) })} s={T('{n} more, once you raise it', { n: overCap.length })} hue="amber" />
            <div style={{ padding: '0 12px' }}>
              {overCap.map((id) => { const c = cards[id]; if (!c) return null
                return (
                  <div key={id} className="row" style={hv('amber')}>
                    <button type="button" onClick={() => open(c)} className="press" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 0, padding: 0, textAlign: 'left', font: 'inherit', color: C.ink, cursor: 'pointer' }}>
                      <span className="tx"><span className="t" style={{ display: 'block' }}>{c.title}</span><span className="s" style={{ display: 'block' }}>{c.price} · {c.ready}</span></span>
                    </button>
                    <button type="button" className="btn ghost" style={{ height: 34, padding: '0 14px', flex: 'none' }} onClick={() => setBudgetSheet(true)}>{T('Raise budget')}</button>
                  </div>
                ) })}
            </div>
          </>
        )}

        {laterIds.length > 0 && (() => {
          const openLater = showLater ?? laterIds.length <= 5
          return (
          <div style={{ margin: '18px 16px 0' }}>
            <button type="button" onClick={() => setShowLater(!openLater)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 16, border: 'none', background: C.fill, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: C.ink }}>{T('Coming later for this goal')} · {laterIds.length}</span>
              <ChevronDown size={16} color={C.faint} style={{ transform: openLater ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
            </button>
            {openLater && (
              <div style={{ padding: '6px 2px 0' }}>
                {laterIds.map((id) => {
                  const title = cards[id]?.title ?? shelfTitle(id)
                  /* Where something LIVE does the same job, the row says so with its price and the
                     button orders that instead of promising a note one day. liveAlternativesFor
                     only ever returns ids that pass the same sellable law the shelf reads, so this
                     detour can never point at another closed door. */
                  const alt = cards[liveAlternativesFor(id, undefined, 1)[0] ?? '']
                  return (
                  <div key={id} className="row" style={{ alignItems: 'flex-start' }}>
                    <span className="tx">
                      <span className="t" style={{ display: 'block', fontSize: 14 }}>{title}</span>
                      <span className="s" style={{ display: 'block', whiteSpace: 'normal', lineHeight: 1.35, color: C.mute }}>
                        {notSellableReason(id)}{alt ? ` ${T('{title} is {price} today.', { title: alt.title, price: alt.price })}` : ''}
                      </span>
                    </span>
                    {alt
                      ? <button type="button" className="btn ghost" style={{ height: 32, padding: '0 12px', flex: 'none', fontSize: 13 }} onClick={() => order(alt)}>{T('Order that instead')}</button>
                      : <Link href={`/dashboard/messages?to=strategist&draft=${encodeURIComponent(`I want ${title} when it is ready.`)}`} className="btn ghost" style={{ height: 32, padding: '0 12px', flex: 'none', textDecoration: 'none', fontSize: 13 }}>{T('Tell me when')}</Link>}
                  </div>
                ) })}
              </div>
            )}
          </div>
          )
        })()}

        {/* "2 of 5", from the same set the tick on each row reads: the setup cards this client has
            actually ordered (a shipped campaign carrying that card's id). Never a guess. */}
        <Sec t={T('Set up once')} s={T('{n} of {total} done', { n: setupRows.filter((c) => done.has(c.id)).length, total: setupRows.length })} hue="newfaces" more={() => { setFilters((f) => ({ ...f, kind: 'setup' })); go({ name: 'search' }) }} />
        <div style={{ padding: '0 12px' }}>{setupRows.map((c) => <SetupRow key={c.id} c={c} />)}</div>

        <div style={{ margin: '18px 16px 0' }}>
          <button type="button" onClick={() => go({ name: 'guide' })} className="press" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 18, border: 'none', background: '#fff', boxShadow: CARD_SHADOW, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
            <Mark hue="mint" size={38}><Compass size={22} /></Mark>
            <span style={{ flex: 1 }}><span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 15.5, fontWeight: 600, color: C.ink }}>{T('Not sure? Guide me')}</span><span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>{T('Three questions, then three picks')}</span></span>
            <ChevronRight size={17} color={C.faint} />
          </button>
        </div>
        <Fallback />
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
                <span className="r">{buy ? <><b>{c.price}</b><span>{c.ready}</span></> : <span>{T('Not on sale yet')}</span>}</span>
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
          return <button key={c.id} type="button" onClick={() => open(c)} className="row press" style={hv(c.goal)}><Mark hue={c.goal} size={36}><Icon size={18} /></Mark><span className="tx"><span className="t" style={{ display: 'block', fontWeight: 600 }}>{c.title}</span><span className="s" style={{ display: 'block', whiteSpace: 'normal', lineHeight: 1.35 }}>{why}</span></span><span className="r"><b>{c.price}</b></span></button> })}</div>
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
          {buy && <div><b>{c.price}</b><span>{T('price')}</span></div>}
          <div><b>{c.ready}</b><span>{T('ready in')}</span></div><div><b>{T(c.you)}</b><span>{T('you do')}</span></div><div><b>{c.channels.length}</b><span>{T(c.channels.length === 1 ? 'channel' : 'channels')}</span></div>
        </div>
        {!buy && <div style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 12, background: C.fill, fontSize: 12.5, color: C.mute, lineHeight: 1.4 }}>{notSellableReason(c.id)}</div>}
        {(() => { const ps = buy ? promiseSentence(PROMISE_BY_CARD[c.id] ?? []) : null; return ps ? <div className="pp-count" style={{ margin: '0 16px 4px', padding: '10px 12px', borderRadius: 12, background: 'rgba(46,154,120,.08)', fontSize: 12.5, color: '#1c6b52', lineHeight: 1.4 }}>{ps}</div> : null })()}
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
          <div className="p" style={buy ? undefined : { fontSize: 15 }}>{buy ? c.price : T('Not on sale yet')}<span>{buy ? `${c.cadence} · ${T(c.you).toLowerCase()} · ${c.ready}` : T('We will tell you the day it opens')}</span></div>
          {buy
            ? <button type="button" className="btn hue" onClick={() => order(c)}>{T(c.handoff.kind === 'request' && c.price === 'Quote' ? 'Ask for a quote' : 'Order')} <ArrowRight size={15} /></button>
            : <Link href={`/dashboard/messages?to=strategist&draft=${encodeURIComponent(`I want ${c.title} when it is ready.`)}`} className="btn ghost" style={{ textDecoration: 'none' }}>{T('Tell me when')}</Link>}
        </div></div>
      </div>
    )
  }

  /* ── the budget sheet ──
   * The same six answers onboarding asks, in the same words, so setting it here and setting it
   * there are one thing. Saved straight to businesses.monthly_budget. */
  const budgetSheetUI = budgetSheet ? (
    <>
      <div onClick={() => setBudgetSheet(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.28)', zIndex: 40 }} />
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41, display: 'flex', justifyContent: 'center' }}>
        {/* Six answers plus their sub-lines run past the bottom of a short phone, so the sheet
            caps at 80% of the window and scrolls inside itself, keeping the last chip reachable
            above the home bar. */}
        <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '22px 22px 0 0', padding: '10px 16px calc(18px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.line, margin: '0 auto 12px' }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink }}>{T('What feels right to start?')}</div>
          <div style={{ fontSize: 12.5, color: C.mute, margin: '2px 0 8px' }}>{T('You can change it any time. Nothing is charged now.')}</div>
          {BUDGET_CHIPS.map((b) => { const on = cap != null && budgetCapForChip(b) === cap
            const noCap = NO_CAP_BUDGET_CHIPS.includes(b)
            return (
              <button key={b} type="button" onClick={() => setBudget(noCap ? null : b)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                <span style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${on ? C.mintDk : C.line}`, background: on ? C.mintDk : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>{on && <Check size={12} strokeWidth={3} />}</span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: on ? 700 : 500, color: C.ink }}>{T(b)}
                  {/* Both of these set no cap, so the row says what happens instead of leaving
                      the owner to guess at a ceiling we would have invented. */}
                  {noCap && <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: C.mute, marginTop: 1 }}>{T('No cap set. Everything shows.')}</span>}
                </span>
              </button>
            ) })}
        </div>
      </div>
    </>
  ) : null

  /* ── the filter sheet ── */
  const FilterSheet = () => sheet ? (
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

  const title = view.name === 'guide' ? T('Guide me') : view.name === 'product' ? (cards[view.id]?.title ?? 'Create') : null
  const backTo = view.name === 'browse' ? undefined : '/dashboard/campaigns/new'
  return (
    <MvpShell active="create" header={
      <div style={{ flexShrink: 0, background: '#fff' }}>
        <div style={{ padding: '0 0 2px' }}><TopRow back={backTo} middle={view.name === 'search' ? <SearchBar live /> : view.name === 'browse' ? <SearchBar /> : <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textAlign: 'center' }}>{title}</span>} /></div>
        {view.name === 'browse' && <div className="cr"><style>{CREATE_CSS}</style><Rail /></div>}
      </div>
    }>
      <div className="cr" style={{ background: '#fff', minHeight: '100%', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <style>{CREATE_CSS}</style>
        {view.name === 'browse' && browse()}
        {view.name === 'search' && search()}
        {view.name === 'guide' && guide()}
        {view.name === 'product' && product(view.id)}
      </div>
      <FilterSheet />
      {budgetSheetUI}
      {view.name !== 'browse' && view.name !== 'product' && (
        <button type="button" onClick={back} aria-label={T('Back')} style={{ display: 'none' }}><ChevronLeft /></button>
      )}
    </MvpShell>
  )
}
