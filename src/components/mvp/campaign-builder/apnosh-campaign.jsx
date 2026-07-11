"use client";
/* eslint-disable */
import React, { useState, useRef, useEffect } from "react";
import BottomNav from "../bottom-nav";
import AppHeader from "../app-header";
import { priceLabel, ITEM_PRICES } from "@/lib/campaigns/builder/item-prices";
import { isProTier } from "@/lib/entitlements";
import { serviceById, cadenceOf, plainNameOf } from "@/lib/campaigns/catalog";
import { etaLabelFor, SERVICE_TURNAROUND } from "@/lib/campaigns/data/service-turnaround";
import { CREATE_CATALOG, STAGE_TAG_LABEL } from "@/lib/campaigns/data/create-catalog";
import { pdpCopy } from "@/lib/campaigns/data/create-catalog-content";
import { whyFor } from "@/lib/campaigns/data/why-for";
import { whatYouGet } from "@/lib/campaigns/builder/what-you-get";
import { getMarketingCalendar, daysUntil } from "@/lib/dashboard/marketing-calendar";

/* ============================================================
   Apnosh Portal — Campaign builder
   Step 1: "What do you want to do?" goal picker
   Self-contained, clickable mobile preview.
   ============================================================ */

const TOKENS = {
  ink: "#181b1a",
  sub: "#9aa19d",
  faint: "#b8beba",
  line: "#ededec",
  card: "#ffffff",
  mint: "#4abd98",
  mintDark: "#2e9a78",
  mintTint: "#eaf7f3",
  dash: "#d8ddda",
  pageBg: "#2b2d31",
};

/* Per-goal gradients (135deg, light -> deep) */
const G = {
  launch: ["#f6a23a", "#ee4c2c"],
  event: ["#34b6ae", "#2e73b6"],
  deal: ["#c6d24f", "#5fae3e"],
  nearby: ["#9a5bf0", "#6a39de"],
  loyalty: ["#f7c948", "#f0922f"],
  nights: ["#5ba8e8", "#3b6fd4"],
  orders: ["#6fd06a", "#34a76a"],
  reviews: ["#8089ff", "#5b53d6"],
  catering: ["#c85b7c", "#9c3a6a"],
  winback: ["#f57f97", "#e85f7c"],
  firstvisit: ["#23c0b6", "#0f97a8"],
};
const grad = (k) => `linear-gradient(135deg, ${G[k][0]} 0%, ${G[k][1]} 100%)`;

/* ---------- Illustrations (white-on-gradient, hand-drawn) ---------- */
const Ill = {
  firstvisit: (
    <svg viewBox="0 0 88 60" width="64" fill="none">
      <circle cx="40" cy="23" r="9" fill="#fff" />
      <path d="M24 49 a16 16 0 0 1 32 0 Z" fill="#fff" />
      <circle cx="59" cy="20" r="8.5" fill="#fff" />
      <path d="M59 15.8 v8.4 M54.8 20 h8.4" stroke="#0f97a8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  launch: (
    <svg viewBox="0 0 88 60" width="76" fill="none">
      <rect x="14" y="9" width="60" height="42" rx="7" fill="#fff" />
      <rect x="22" y="18" width="26" height="5" rx="2.5" fill="#3fb98f" />
      <rect x="54" y="15" width="15" height="9" rx="4.5" fill="#2fa57c" />
      <text x="61.5" y="21.6" textAnchor="middle" fontSize="5.4" fontWeight="800" fill="#fff" fontFamily="Inter, sans-serif">NEW</text>
      <rect x="22" y="29" width="44" height="4.4" rx="2.2" fill="#e2e2e2" />
      <rect x="22" y="38" width="36" height="4.4" rx="2.2" fill="#e2e2e2" />
    </svg>
  ),
  event: (
    <svg viewBox="0 0 88 60" width="70" fill="none">
      <rect x="20" y="13" width="48" height="38" rx="6" fill="#fff" />
      <rect x="20" y="13" width="48" height="11" rx="6" fill="#dfe7ef" />
      <rect x="30" y="9" width="4.5" height="9" rx="2.25" fill="#fff" />
      <rect x="53.5" y="9" width="4.5" height="9" rx="2.25" fill="#fff" />
      {[0, 1, 2, 3].map((c) =>
        [0, 1].map((r) => (
          <rect key={c + "-" + r} x={27 + c * 9} y={29 + r * 9} width="6" height="6" rx="1.6"
            fill={c === 2 && r === 1 ? "#2e8fb0" : "#dfe4e9"} />
        ))
      )}
    </svg>
  ),
  deal: (
    <svg viewBox="0 0 88 60" width="78" fill="none">
      <path d="M22 15 h44 a4 4 0 0 1 4 4 v5.5 a3.2 3.2 0 0 0 0 9 v5.5 a4 4 0 0 1-4 4 H22 a4 4 0 0 1-4-4 v-5.5 a3.2 3.2 0 0 0 0-9 v-5.5 a4 4 0 0 1 4-4 z" fill="#fff" />
      <text x="44" y="33" textAnchor="middle" fontSize="14" fontWeight="800" fill="#5aa83c" fontFamily="Inter, sans-serif" letterSpacing="-0.5">20%</text>
      <text x="44" y="43" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#7cb653" fontFamily="Inter, sans-serif" letterSpacing="1.5">OFF</text>
    </svg>
  ),
  nearby: (
    <svg viewBox="0 0 88 60" width="68" fill="none">
      <circle cx="44" cy="30" r="20" stroke="#fff" strokeWidth="1.4" opacity="0.28" />
      <circle cx="44" cy="30" r="13" stroke="#fff" strokeWidth="1.4" opacity="0.45" />
      <path d="M44 16 c-6.2 0-11 4.8-11 10.9 C33 35 44 46 44 46 s11-11 11-19.1 C55 20.8 50.2 16 44 16 z" fill="#fff" />
      <circle cx="44" cy="27" r="4.2" fill={G.nearby[1]} />
    </svg>
  ),
  loyalty: (
    <svg viewBox="0 0 88 60" width="64" fill="none">
      <path d="M44 16 a14 14 0 1 1 -13.2 9.3" stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M44 11 l1.5 9 -8.5 -2.4 z" fill="#fff" />
      <path d="M44 28.5 c-2.4-3-7-1.6-7 1.7 0 2.9 3.9 5.2 7 7.8 3.1-2.6 7-4.9 7-7.8 0-3.3-4.6-4.7-7-1.7z" fill="#fff" />
    </svg>
  ),
  nights: (
    <svg viewBox="0 0 88 60" width="68" fill="none">
      <path d="M55 13 a12 12 0 1 0 10 19 a9.6 9.6 0 0 1-10-19 z" fill="#fff" />
      <circle cx="36" cy="34" r="5.6" fill="#fff" />
      <path d="M25 50 c0-6.5 4.9-10.5 11-10.5 s11 4 11 10.5 z" fill="#fff" />
      <circle cx="51" cy="38" r="4.6" fill="#fff" opacity="0.78" />
      <path d="M43.5 50 c0-5 3.6-8 7.5-8 s7.5 3 7.5 8 z" fill="#fff" opacity="0.78" />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 88 60" width="76" fill="none">
      <path d="M20 38 l3-9 a4 4 0 0 1 3.7-2.6 h22 l8 8 h6 a3 3 0 0 1 3 3 v2.6 a2 2 0 0 1-2 2 H22 a2 2 0 0 1-2-2 z" fill="#fff" />
      <path d="M30 26.4 h14 l6 6 H30 z" fill={G.orders[1]} opacity="0.32" />
      <circle cx="31" cy="44" r="4.6" fill="#fff" stroke={G.orders[1]} strokeWidth="2.4" />
      <circle cx="56" cy="44" r="4.6" fill="#fff" stroke={G.orders[1]} strokeWidth="2.4" />
    </svg>
  ),
  reviews: (
    <svg viewBox="0 0 88 60" width="72" fill="none">
      <rect x="16" y="11" width="56" height="38" rx="7" fill="#fff" />
      {[26, 35, 44, 53, 62].map((x) => (
        <path key={x} transform={`translate(${x},23)`} d="M0 -3.6 L0.91 -1.25 L3.42 -1.11 L1.47 0.48 L2.11 2.91 L0 1.55 L-2.11 2.91 L-1.47 0.48 L-3.42 -1.11 L-0.91 -1.25 Z" fill="#f6b01e" />
      ))}
      <rect x="24" y="33" width="40" height="3.6" rx="1.8" fill="#e6e6e6" />
      <rect x="24" y="40" width="27" height="3.6" rx="1.8" fill="#e6e6e6" />
    </svg>
  ),
  catering: (
    <svg viewBox="0 0 88 60" width="72" fill="none">
      <circle cx="44" cy="16.5" r="3" fill="#fff" />
      <path d="M22 41 A22 18 0 0 1 66 41 Z" fill="#fff" />
      <ellipse cx="44" cy="43.5" rx="27" ry="4.4" fill="#fff" />
      <path d="M22 41 A22 18 0 0 1 66 41" fill="none" stroke={G.catering[1]} strokeWidth="1.4" opacity="0.25" />
    </svg>
  ),
  winback: (
    <svg viewBox="0 0 88 60" width="60" fill="none">
      <path d="M44 49 C27 39.5 21.5 31.5 21.5 24 A11.5 11.5 0 0 1 44 19.5 A11.5 11.5 0 0 1 66.5 24 C66.5 31.5 61 39.5 44 49 Z" fill="#fff" />
    </svg>
  ),
};

/* ---------- Goal data ---------- */
const COMING_UP = [
  { id: "launch", title: "Feature an item", sub: "Spotlight something you sell, new or a favorite." },
  { id: "event", title: "Promote an event", sub: "Fill seats for trivia, live music, a themed night." },
  { id: "deal", title: "Run a deal", sub: "A discount or special to bring people in." },
];
const BIGGER = [
  { id: "nearby", title: "Reach nearby", sub: "Get found by hungry people close to you." },
  { id: "loyalty", title: "Increase loyalty", sub: "Turn first-timers into regulars who come back." },
  { id: "nights", title: "Fill your slow nights", sub: "Bring guests in on your quietest nights." },
  { id: "orders", title: "More online orders", sub: "Win more delivery and pickup orders." },
];
const GOALS = [...COMING_UP, ...BIGGER];
const goalById = (id) => GOALS.find((g) => g.id === id);

const money = (n) => "$" + n.toLocaleString("en-US");
const BUDGETS = [400, 800, 1500, 3000];

/* Each goal resolves to a drafted plan: the one-line answer (with an
   optional editable subject), an honest headline number, the pieces
   inside, and timing. Detail is opt-in, not a gate. */
const PLAN = {
  launch: {
    eyebrow: "Featured item", pre: "feature ", subject: "an item", post: "",
    hero: 50, unit: "guests try it", daily: "about 4 a day for two weeks",
    weeks: 2, skipped: 1, saved: 365,
    sentence: [
      "We'll feature ",
      { id: "subject", kind: "menu", ph: "an item", sugg: [{ l: "Maple oat latte", p: "$5.75" }, { l: "Harvest grain bowl", p: "$13.50" }, { l: "Local berry galette", p: "$6.00" }] },
      " ", { id: "timing", kind: "chips", ph: "right away", opts: ["right away", "on a set date"], dateOpt: "on a set date" },
      ", tell people it's ", { id: "angle", kind: "chips", custom: true, customPh: "or type your own reason", ph: "brand new", opts: ["brand new", "seasonal", "only here for a limited time", "our own version of a classic", "made with a local partner", "a fan favorite, back"] },
      ", and ", { id: "assets", kind: "toggle", ph: "use your own photos", opts: ["use your own photos", "book a quick shoot"], lean: 0, paid: 1, inboxOpt: "use your own photos" },
      { id: "offer", kind: "add", addLabel: "Add an offer", clause: (v) => `, plus ${v}`, opts: ["a discount", "a free sample", "buy one, get one free"], optional: true },
      ".",
    ],
    inside: [
      { n: "Spotlight post", t: "Included" },
      { n: "A short reel or photo", t: "From $90", lean: "Included", amt: 90, asset: true },
      { n: "Email and text to your list", t: "Included" },
      { n: "A follow-up post mid-week", t: "Included" },
      { n: "Auto-reply to questions", t: "Included" },
    ],
  },
  event: {
    eyebrow: "Event push", pre: "fill the room for ", subject: "your event", post: "",
    hero: 40, unit: "RSVPs and walk-ins", daily: "a steady build over two weeks",
    weeks: 2, skipped: 1, saved: 250,
    sentence: [
      { id: "when", kind: "datetime", ph: "On a date" },
      ", we'll have ",
      { id: "subject", kind: "text", custom: true, ph: "your event", sugg: ["a coffee tasting", "a local maker pop-up", "a wine and cheese night", "a latte art class"] },
      ", entry is ", { id: "rsvp", kind: "chips", ph: "first come, first serve", opts: [{ c: "first come, first serve", s: "first come, first serve" }, { c: "reserve a table", s: "by table reservation" }, { c: "buy tickets", s: "ticketed" }] },
      { id: "turnout", kind: "add", text: true, short: true, addLabel: "Add how many guests you want", ph: "a number, like 40", clause: (v) => `, aiming for ${v}`, optional: true },
      { id: "details", kind: "add", text: true, addLabel: "Add any other details", ph: "who's performing, a partner to tag, prizes, drink specials, 21+", clause: (v) => `, plus ${v}`, optional: true },
      ".",
    ],
    inside: [
      { n: "Save-the-date post", t: "Included" },
      { n: "Event flyer", t: "Included" },
      { n: "Email and text invite", t: "Included" },
      { n: "Day-before reminder", t: "Included" },
      { n: "Auto-reply with details", t: "Included" },
    ],
  },
  deal: {
    eyebrow: "Limited-time offer", pre: "run ", subject: "a deal", post: "",
    hero: 60, unit: "guests redeem it", daily: "spread across the run",
    weeks: 2, skipped: 1, saved: 200,
    sentence: [
      "We'll run ",
      { id: "subject", kind: "text", editSugg: true, ph: "a deal", sugg: ["$5 off a $30 market order", "buy one coffee, get one free", "a free pastry with any latte", "20% off prepared foods after 3pm", "10% off your first online order"] },
      " ", { id: "duration", kind: "daterange", ph: "for two weeks" },
      { id: "limits", kind: "add", text: true, addLabel: "Add any limits", ph: "dine-in only, one per customer, lunch only, 4-6pm only", clause: (v) => `, ${v}`, optional: true },
      { id: "code", kind: "add", text: true, short: true, addLabel: "Add a redemption code", ph: "like TACO20 or SAVE10", clause: (v) => `, with code ${v}`, optional: true },
      ".",
    ],
    inside: [
      { n: "Announcement post", t: "Included" },
      { n: "The deal graphic", t: "Included" },
      { n: "Email and text to your list", t: "Included" },
      { n: "Reminder before it ends", t: "Included" },
      { n: "Auto-reply with the details", t: "Included" },
    ],
  },
  nearby: {
    eyebrow: "Get discovered", pre: "get found by people nearby", subject: null, post: "",
    hero: 2000, unit: "new people reached", daily: "a few thousand nearby over the month",
    weeks: 4, ongoing: true, skipped: 1, saved: 365,
    sentence: [
      "We'll help ",
      { id: "who", kind: "chips", ph: "people nearby", opts: ["people nearby", "the lunch crowd", "families"] },
      " find you, showing off ", { id: "assets", kind: "toggle", ph: "your photos", opts: ["your photos", "a quick shoot"], lean: 0 }, ".",
    ],
    inside: [
      { n: "Google profile tune-up", t: "Included" },
      { n: "Local posts each week", t: "Included" },
      { n: "A reel for discovery", t: "From $90", lean: "Included", amt: 90, asset: true },
      { n: "Paid local boost", t: "Ad spend" },
      { n: "Reply to every new review", t: "Included" },
    ],
  },
  nights: {
    eyebrow: "Slow-night push", pre: "bring guests in on ", subject: "your slow nights", post: "",
    hero: 30, unit: "more covers a week", daily: "aimed at your quietest nights",
    weeks: 4, ongoing: true, skipped: 0, saved: 0,
    sentence: [
      "We'll bring guests in on ",
      { id: "subject", kind: "chips", ph: "your slow nights", opts: ["Mondays and Tuesdays", "Tuesdays and Wednesdays", "Sundays"] },
      " ", { id: "offer", kind: "chips", ph: "with a small deal", opts: ["with a small deal", "with no discount"] }, ".",
    ],
    inside: [
      { n: "A slow-night offer", t: "Included" },
      { n: "Post the night before", t: "Included" },
      { n: "Text your nearby regulars", t: "Included" },
      { n: "Auto-reply to questions", t: "Included" },
    ],
  },
  loyalty: {
    eyebrow: "Loyalty", pre: "bring ", subject: "your regulars", post: " back more often",
    hero: 25, unit: "extra visits a month", daily: "a steady nudge to people you know",
    weeks: 4, ongoing: true, skipped: 1, saved: 130,
    sentence: [
      "We'll bring ",
      { id: "subject", kind: "chips", ph: "your regulars", opts: ["your regulars", "first-timers", "everyone"] },
      " back with ", { id: "reward", kind: "chips", ph: "a simple reward", opts: ["a points reward", "a free item", "a birthday treat"] }, ".",
    ],
    inside: [
      { n: "Welcome and thank-you texts", t: "Included" },
      { n: "A simple rewards setup", t: "Included" },
      { n: "Birthday treat automation", t: "Included" },
      { n: "Win-back text for quiet guests", t: "Included" },
    ],
  },
  orders: {
    eyebrow: "Online orders", pre: "win more ", subject: "online orders", post: "",
    hero: 35, unit: "more orders a month", daily: "steady growth in online orders",
    weeks: 4, ongoing: true, skipped: 1, saved: 90,
    sentence: [
      "We'll win more ",
      { id: "subject", kind: "chips", ph: "online orders", opts: ["delivery orders", "pickup orders", "both"] },
      " using ", { id: "assets", kind: "toggle", ph: "your photos", opts: ["your photos", "a quick shoot"], lean: 0 }, ".",
    ],
    inside: [
      { n: "Delivery profile tune-up", t: "Included" },
      { n: "A craveable food photo", t: "From $90", lean: "Included", amt: 90, asset: true },
      { n: "Order-online posts", t: "Included" },
      { n: "Text your list a pickup offer", t: "Included" },
    ],
  },
};

/* Outcome-driven goals (distinct from the campaign Mad-Libs) */
const GOAL = {
  nights: {
    title: "Fill your slow nights",
    intro: "A few quick things only you know. We'll build the plan from there.",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    draws: [
      { id: "deal", label: "A deal or a freebie", hint: "A set price, a free side, that kind of thing" },
      { id: "dish", label: "A special dish that night", hint: "Something they can only get then" },
      { id: "event", label: "Something happening", hint: "Music, trivia, a tasting" },
      { id: "auto", label: "Not sure, you pick for me", hint: "We'll choose what tends to work best" },
    ],
    details: {
      deal: { q: "What's the deal?", opts: ["A set price", "A free item with a meal", "Money off", "Buy one, get one"] },
      dish: { q: "Which dish?", opts: ["Maple oat latte", "Harvest grain bowl", "Local berry galette"] },
      event: { q: "What kind?", opts: ["Live music", "Trivia night", "A tasting", "A short class"] },
    },
    inside: [
      { n: "A post each week about it", t: "Included" },
      { n: "A reminder the day before", t: "Included" },
      { n: "A fresh idea once a month", t: "Included" },
      { n: "We answer questions for you", t: "Included" },
    ],
  },
};

/* Direct single-part path options (the "just need one thing" shortcut) */
const DIRECT = [
  { id: "post", title: "A social media post", sub: "One post for Instagram or Facebook.", icon: "post" },
  { id: "graphic", title: "A designed graphic", sub: "A flyer or graphic to share or print.", icon: "graphic" },
  { id: "reel", title: "A short reel", sub: "A quick video for Instagram or TikTok.", icon: "reel" },
  { id: "offer", title: "A special offer", sub: "A coupon or limited-time deal.", icon: "offer" },
  { id: "reply", title: "An auto-reply", sub: "Reply to messages or reviews for you.", icon: "reply" },
];

/* ---------- Small UI atoms ---------- */
function StatusBar({ dark }) {
  const c = dark ? "#fff" : "#0c0c0c";
  return (
    <div style={{ height: 54, position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 17, left: 28, fontSize: 15, fontWeight: 600, color: c, fontFamily: "Inter, sans-serif", letterSpacing: 0.2 }}>9:41</div>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-46%)", width: 118, height: 33, background: "#000", borderRadius: 20 }} />
      <div style={{ position: "absolute", top: 19, right: 24, display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="18" height="12" viewBox="0 0 18 12" fill={c}><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none"><path d="M8.5 2.2c2.6 0 5 1 6.8 2.7M8.5 6c1.5 0 2.9.6 4 1.6M3.7 4.9C5.1 3.6 6.7 2.9 8.5 2.9" stroke={c} strokeWidth="1.5" strokeLinecap="round" /><circle cx="8.5" cy="10" r="1.3" fill={c} /></svg>
        <svg width="25" height="13" viewBox="0 0 25 13" fill="none"><rect x="0.5" y="0.5" width="21" height="12" rx="3.2" stroke={c} opacity="0.4" /><rect x="2" y="2" width="17" height="9" rx="1.8" fill={c} /><rect x="22.5" y="4" width="1.8" height="5" rx="0.9" fill={c} opacity="0.4" /></svg>
      </div>
    </div>
  );
}

function CircleBtn({ children, onClick, dark }) {
  return (
    <button onClick={onClick} style={{
      width: 38, height: 38, borderRadius: 19, border: "none", cursor: "pointer",
      background: dark ? "rgba(255,255,255,0.22)" : "#efeeec",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      WebkitTapHighlightColor: "transparent",
    }}>{children}</button>
  );
}

function GoalCard({ goal, onClick }) {
  const [press, setPress] = useState(false);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPress(true)}
      onPointerUp={() => setPress(false)}
      onPointerLeave={() => setPress(false)}
      style={{
        textAlign: "left", border: `1px solid ${TOKENS.line}`, background: TOKENS.card,
        borderRadius: 18, padding: 12, cursor: "pointer", width: "100%",
        boxShadow: press ? "0 1px 3px rgba(0,0,0,0.05)" : "0 1px 2px rgba(20,30,26,0.04), 0 10px 22px rgba(20,30,26,0.05)",
        transform: press ? "scale(0.975)" : "scale(1)", transition: "transform 140ms ease, box-shadow 140ms ease",
        display: "flex", flexDirection: "column", WebkitTapHighlightColor: "transparent",
      }}>
      <div style={{
        height: 92, borderRadius: 13, background: grad(goal.id),
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 11,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08)`,
      }}>{Ill[goal.id]}</div>
      <div style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 15.5, color: TOKENS.ink, lineHeight: 1.15, marginBottom: 5 }}>{goal.title}</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, lineHeight: 1.32 }}>{goal.sub}</div>
    </button>
  );
}

function ElseCard({ onClick }) {
  const [press, setPress] = useState(false);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPress(true)}
      onPointerUp={() => setPress(false)}
      onPointerLeave={() => setPress(false)}
      style={{
        textAlign: "left", border: `1.5px dashed ${TOKENS.dash}`, background: "#fcfdfc",
        borderRadius: 18, padding: 12, cursor: "pointer", width: "100%",
        transform: press ? "scale(0.975)" : "scale(1)", transition: "transform 140ms ease",
        display: "flex", flexDirection: "column", WebkitTapHighlightColor: "transparent",
      }}>
      <div style={{ height: 92, borderRadius: 13, background: "#f4f6f5", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 11 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#aab0ac" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
      </div>
      <div style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 15.5, color: TOKENS.ink, lineHeight: 1.15, marginBottom: 5 }}>Something else</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, lineHeight: 1.32 }}>Tell us in your own words</div>
    </button>
  );
}

/* small icons for direct path */
const SectionLabel = ({ children }) => (
  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1.3, color: TOKENS.faint, textTransform: "uppercase", margin: "24px 0 11px" }}>{children}</div>
);
const DirIcon = {
  post: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.2" fill={TOKENS.mintDark} /></svg>,
  graphic: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 15l5-5 4 4 3-3 6 6" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>,
  reel: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M3 8h18M8 3l2 5M14 3l2 5" /><path d="M10 12.5v3.5l3-1.75z" fill={TOKENS.mintDark} /></svg>,
  offer: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-6.2-6.2a2 2 0 0 1-.58-1.6L4.2 5.4a2 2 0 0 1 1.8-1.8l7.4-.4a2 2 0 0 1 1.6.58l5.6 5.6a2 2 0 0 1 0 2.8z" /><circle cx="8.5" cy="8.5" r="1.4" fill={TOKENS.mintDark} /></svg>,
  reply: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-6A8.4 8.4 0 1 1 21 11.5z" /><path d="M8 11h8M8 14h5" /></svg>,
};

/* ============================================================
   Screen: Goal picker
   ============================================================ */
function Picker({ onClose, onPick, onSomethingElse, onDirect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 20px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 22 }}>
          <CircleBtn onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: TOKENS.faint }}>Campaign</div>
        </div>

        <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 27, lineHeight: 1.08, color: TOKENS.ink, margin: "0 0 6px", letterSpacing: -0.3 }}>
          What do you want to do?
        </h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub, lineHeight: 1.4, margin: "0 0 4px" }}>
          Tell us what you're working on and we'll build the whole plan, ready to approve.
        </p>

        <SectionLabel>Something coming up</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {COMING_UP.map((g) => <GoalCard key={g.id} goal={g} onClick={() => onPick(g.id)} />)}
          <ElseCard onClick={onSomethingElse} />
        </div>

        <SectionLabel>An ongoing goal</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {BIGGER.map((g) => <GoalCard key={g.id} goal={g} onClick={() => onPick(g.id)} />)}
        </div>

        {/* Direct path link */}
        <button onClick={onDirect} style={{
          marginTop: 16, width: "100%", background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "4px 0",
          WebkitTapHighlightColor: "transparent",
        }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: TOKENS.mintDark }}>Just need one specific thing?</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Screen: Something else (free-text request + log)
   ============================================================ */
function SomethingElse({ onBack, restaurant, onApprove, onMarketer }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const taRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => taRef.current && taRef.current.focus(), 250); return () => clearTimeout(t); }, []);

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    const entry = { text: body, restaurant, ts: Date.now() };
    try {
      if (typeof window !== "undefined" && window.storage) {
        await window.storage.set("apnosh:request:" + entry.ts, JSON.stringify(entry), false);
      }
    } catch (e) { /* fall back silently; demo continues */ }
    setSent(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 22 }}>
          <CircleBtn onClick={onBack}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: TOKENS.faint }}>Something else</div>
        </div>

        {!sent ? (
          <>
            <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 24, lineHeight: 1.12, color: TOKENS.ink, margin: "0 0 10px", letterSpacing: -0.2 }}>
              Tell us in your own words
            </h1>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.sub, lineHeight: 1.45, margin: "0 0 18px" }}>
              Describe what you want, the way you'd say it out loud. We'll turn it into a first draft you can approve or hand to a marketer.
            </p>
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Example: I want to do a fundraiser night where part of every check goes to the local food bank."
              style={{
                width: "100%", minHeight: 150, resize: "none", borderRadius: 16,
                border: `1px solid ${TOKENS.line}`, background: "#fff", padding: 16,
                fontFamily: "Inter, sans-serif", fontSize: 14.5, lineHeight: 1.5, color: TOKENS.ink,
                outline: "none", boxShadow: "0 1px 2px rgba(20,30,26,0.04)", boxSizing: "border-box",
              }}
            />
            <div style={{ flex: 1 }} />
            <button onClick={submit} disabled={!text.trim()} style={{
              width: "100%", height: 54, borderRadius: 27, border: "none", marginTop: 18,
              cursor: text.trim() ? "pointer" : "default",
              background: text.trim() ? TOKENS.mint : "#cfe7dd",
              color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16.5,
              transition: "background 150ms ease", WebkitTapHighlightColor: "transparent",
            }}>Build it</button>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 24, lineHeight: 1.12, color: TOKENS.ink, margin: "0 0 8px", letterSpacing: -0.2 }}>Here's a first draft</h1>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub, lineHeight: 1.45, margin: "0 0 18px" }}>
              Built from what you described. Nothing goes out until you approve it.
            </p>
            <div style={{ background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 14, padding: "13px 15px", marginBottom: 16 }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 600, letterSpacing: 1, color: TOKENS.faint, textTransform: "uppercase", marginBottom: 6 }}>What you asked for</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.ink, lineHeight: 1.45 }}>{text.trim()}</div>
            </div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: TOKENS.ink, marginBottom: 10 }}>What we'll make</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 4 }}>
              {["An announcement post", "A short reel or photo", "Email and text to your list", "Auto-reply to questions about it"].map((n) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 11, background: TOKENS.mintTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink }}>{n}</span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.faint, lineHeight: 1.45, margin: "14px 0 0" }}>
              A first pass to react to. Approve it and we set it up, or hand it to a marketer to refine.
            </div>
            <div style={{ flex: 1, minHeight: 18 }} />
            <button onClick={onApprove} style={{
              width: "100%", height: 54, borderRadius: 27, border: "none", marginTop: 16, cursor: "pointer",
              background: TOKENS.mint, color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16.5, WebkitTapHighlightColor: "transparent",
            }}>This looks right</button>
            <button onClick={onMarketer} style={{
              width: "100%", height: 50, borderRadius: 25, border: `1.5px solid ${TOKENS.line}`, marginTop: 10, cursor: "pointer",
              background: "#fff", color: TOKENS.ink, fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 15, WebkitTapHighlightColor: "transparent",
            }}>Hand it to a marketer</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Screen: Direct single-part path
   ============================================================ */
function Direct({ onBack, onPickPart }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 22 }}>
          <CircleBtn onClick={onBack}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: TOKENS.faint }}>One thing</div>
        </div>
        <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 24, lineHeight: 1.12, color: TOKENS.ink, margin: "0 0 8px", letterSpacing: -0.2 }}>
          What do you need?
        </h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.sub, lineHeight: 1.45, margin: "0 0 20px" }}>
          Pick one thing and we'll make just that. No full campaign.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {DIRECT.map((d) => (
            <button key={d.id} onClick={() => onPickPart(d.id)} style={{
              width: "100%", textAlign: "left", cursor: "pointer", background: "#fff",
              border: `1px solid ${TOKENS.line}`, borderRadius: 15, padding: "13px 15px",
              display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 2px rgba(20,30,26,0.04)",
              WebkitTapHighlightColor: "transparent",
            }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: TOKENS.mintTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{DirIcon[d.icon]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 15, color: TOKENS.ink }}>{d.title}</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, marginTop: 1 }}>{d.sub}</div>
              </div>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={TOKENS.faint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Shared confirmation
   ============================================================ */
/* While the plan is being saved to the owner's account. Replaces the old
   fire-and-forget save that showed "added" before the write confirmed. */
function SavingScreen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
        <div style={{ width: 52, height: 52, borderRadius: 26, border: `4px solid ${TOKENS.mintTint}`, borderTopColor: TOKENS.mintDark, animation: "aspin 0.8s linear infinite", marginBottom: 22 }} />
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 19, fontWeight: 600, color: TOKENS.ink }}>Saving your plan</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.sub, marginTop: 6 }}>Just a moment.</div>
      </div>
    </div>
  );
}

/* Shown only when the save actually fails, so the owner never sees a false
   "added". Nothing was charged; they can retry or go back to the plan. */
function SaveError({ onRetry, onBack }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ paddingTop: 4, marginBottom: 22 }}>
          <CircleBtn onClick={onBack}>
            <svg width="15" height="15" viewBox="0 0 24 24" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" fill="none"><path d="M15 18l-6-6 6-6" /></svg>
          </CircleBtn>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 8px 30px" }}>
          <div style={{ width: 74, height: 74, borderRadius: 37, background: "#fdecec", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#d6453f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></svg>
          </div>
          <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 23, color: TOKENS.ink, margin: "0 0 11px", letterSpacing: -0.2 }}>We could not save that</h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, color: TOKENS.sub, lineHeight: 1.5, margin: 0, maxWidth: 290 }}>Something went wrong on our end and your plan was not saved. Nothing was charged. Please try again.</p>
          <button onClick={onRetry} style={{
            width: "100%", maxWidth: 320, height: 52, borderRadius: 26, border: "none",
            background: TOKENS.mint, color: "#fff", cursor: "pointer", marginTop: 28,
            fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16, WebkitTapHighlightColor: "transparent",
          }}>Try again</button>
          <button onClick={onBack} style={{
            width: "100%", maxWidth: 320, height: 48, marginTop: 10, borderRadius: 24, border: `1.5px solid ${TOKENS.line}`,
            background: "#fff", color: TOKENS.ink, cursor: "pointer",
            fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 14.5, WebkitTapHighlightColor: "transparent",
          }}>Back to plan</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Scroll wheel column (Apple clock style) + toggle switch
   ============================================================ */
function WheelCol({ items, value, onChange, fmt }) {
  const ref = useRef(null);
  const H = 38;
  useEffect(() => {
    const idx = items.indexOf(value);
    if (ref.current && idx >= 0) ref.current.scrollTop = idx * H;
  }, []);
  const handle = () => {
    const el = ref.current;
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / H)));
      if (items[idx] !== value) onChange(items[idx]);
    }, 90);
  };
  return (
    <div ref={ref} onScroll={handle} className="wheelcol" style={{ height: H * 5, overflowY: "scroll", scrollSnapType: "y mandatory", scrollbarWidth: "none", flex: 1 }}>
      <div style={{ height: H * 2 }} />
      {items.map((it) => (
        <div key={it} style={{ height: H, scrollSnapAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 21, fontWeight: 600, color: it === value ? TOKENS.ink : "#cdd1ce", transition: "color 120ms ease" }}>{fmt ? fmt(it) : it}</div>
      ))}
      <div style={{ height: H * 2 }} />
    </div>
  );
}

function Switch({ on, onToggle, c1 }) {
  return (
    <button onClick={onToggle} style={{ width: 48, height: 28, borderRadius: 14, border: "none", cursor: "pointer", background: on ? c1 : "#d8dcd9", position: "relative", padding: 0, transition: "background 160ms ease", WebkitTapHighlightColor: "transparent", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: 11, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left 160ms ease" }} />
    </button>
  );
}

/* ============================================================
   Screen: Intake  (the substance — only plan-shaping questions)
   ============================================================ */
function Intake({ goalId, presets, onBack, onBuild, onStrategist }) {
  const p = PLAN[goalId];
  const c1 = G[goalId][1];
  const blanks = p.sentence.filter((s) => typeof s !== "string");
  const subjectBlank = blanks.find((b) => b.id === "subject");
  const addBlanks = blanks.filter((b) => b.kind === "add");
  const ocv = (o) => (typeof o === "string" ? o : o.c);
  const hjoin = (arr) => arr.length <= 1 ? (arr[0] || "") : arr.length === 2 ? `${arr[0]} and ${arr[1]}` : `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmtD = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dowName = (i) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i];
  const dowSet = (days) => days === "all" ? null : days === "weekdays" ? [1, 2, 3, 4, 5] : days === "weekends" ? [0, 6] : days;
  const patternPhrase = (days) => {
    if (days === "all") return "";
    if (days === "weekdays") return "on weekdays ";
    if (days === "weekends") return "on weekends ";
    const arr = [...days].sort((a, b) => a - b);
    return arr.length ? `on ${hjoin(arr.map((i) => dowName(i) + "s"))} ` : "";
  };
  const composeRange = (s, e) => { if (!s || !e) return ""; return s.toDateString() === today0().toDateString() ? `through ${fmtD(e)}` : `${fmtD(s)} to ${fmtD(e)}`; };
  const composeOngoing = (s) => (!s || s.toDateString() === today0().toDateString() ? "until you stop it" : `from ${fmtD(s)} until you stop it`);
  const composeDur = (s, e, ongoing, days) => {
    if (ongoing) return (patternPhrase(days) + composeOngoing(s)).trim();
    if (s && !e) return `on ${fmtD(s)}`;
    return (patternPhrase(days) + composeRange(s, e)).trim();
  };
  const defStart = today0(), defEnd = addDays(today0(), 13);
  const init = {};
  blanks.forEach((b) => {
    if (b.kind === "daterange") init[b.id] = composeDur(defStart, defEnd, false, "all");
    else init[b.id] = (b.kind === "chips" || b.kind === "toggle") ? ocv(b.opts[b.lean || 0]) : "";
  });
  if (presets) {
    blanks.forEach((b) => {
      if (b.kind === "datetime" && presets.date) {
        const t = presets.time ? `${presets.time.h}:${presets.time.m} ${presets.time.ap.toUpperCase()}` : "7:00 PM";
        init[b.id] = `On ${presets.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${t}`;
      }
      if (b.kind === "daterange" && presets.durStart && presets.durEnd) {
        init[b.id] = composeDur(presets.durStart, presets.durEnd, false, "all");
      }
    });
    if (presets.ans) Object.assign(init, presets.ans);
  }
  const sayOf = (b, val) => {
    if (!b.opts || typeof b.opts[0] === "string") return val;
    const o = b.opts.find((x) => x.c === val);
    return o && o.s != null ? o.s : val;
  };

  const [ans, setAns] = useState(init);
  const [active, setActive] = useState((presets && presets.ans && presets.ans.subject) ? null : (subjectBlank && (subjectBlank.kind === "menu" || subjectBlank.kind === "text") ? "subject" : null));
  const [cal, setCal] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = (presets && presets.date) || (presets && presets.durStart) || new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selDate, setSelDate] = useState((presets && presets.date) || null);
  const [durStart, setDurStart] = useState((presets && presets.durStart) || defStart);
  const [durEnd, setDurEnd] = useState((presets && presets.durEnd) || defEnd);
  const [durOngoing, setDurOngoing] = useState(false);
  const [durDays, setDurDays] = useState("all");
  const [startH, setStartH] = useState(presets && presets.time ? presets.time.h : 7);
  const [startM, setStartM] = useState(presets && presets.time ? presets.time.m : "00");
  const [startAP, setStartAP] = useState(presets && presets.time ? presets.time.ap : "pm");
  const [endH, setEndH] = useState(9);
  const [endM, setEndM] = useState("00");
  const [endAP, setEndAP] = useState("pm");
  const [evRec, setEvRec] = useState(presets && presets.rec ? presets.rec : "once");
  const [timeOpen, setTimeOpen] = useState(null);
  const isPreset = (b, val) => b.opts ? b.opts.some((o) => (typeof o === "string" ? o : o.c) === val) : false;
  const compact = (h, mm, ap) => (mm === "00" ? `${h}${ap}` : `${h}:${mm}${ap}`);
  const rng = (sH, sM, sAP, eH, eM, eAP) => `${compact(sH, sM, sAP)}-${compact(eH, eM, eAP)}`;
  const pillFmt = (h, mm, ap) => `${h}:${mm} ${ap.toUpperCase()}`;
  const inRef = useRef(null);
  useEffect(() => { if (active && inRef.current) inRef.current.focus(); }, [active]);

  const choose = (id, v) => { setAns((a) => ({ ...a, [id]: v })); setActive(null); setCal(false) };
  const openBlank = (id) => {
    const b = blanks.find((x) => x.id === id);
    const customDate = b && b.dateOpt && ans[id] && !b.opts.includes(ans[id]);
    setActive(id); setCal(!!customDate);
  };
  const pickDate = (d) => { setSelDate(d); choose("timing", "on " + d.toLocaleDateString("en-US", { month: "long", day: "numeric" })); };
  const composeWhen = (id, d, time, rec) => {
    const wd = d.toLocaleDateString("en-US", { weekday: "long" });
    const ord = ["1st", "2nd", "3rd", "4th", "5th"][Math.ceil(d.getDate() / 7) - 1];
    let v;
    if (rec === "week") v = `Every ${wd} at ${time}`;
    else if (rec === "biweek") v = `Every other ${wd} at ${time}`;
    else if (rec === "month") v = `On the ${ord} ${wd} of each month at ${time}`;
    else v = `On ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
    setAns((a) => ({ ...a, [id]: v }));
  };
  const reqKinds = ["menu", "text", "datetime", "offer"];
  const ready = blanks.filter((b) => reqKinds.includes(b.kind)).every((b) => ans[b.id] && ans[b.id].toString().trim().length > 0);

  const calGrid = (onPick, rStart, rEnd, activeDow, openEnd) => {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const lead = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cells = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
    const atFloor = y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth());
    const isRange = rStart !== undefined;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button disabled={atFloor} onClick={() => setCalMonth(new Date(y, m - 1, 1))} style={{ width: 30, height: 30, borderRadius: 15, border: "none", background: atFloor ? "transparent" : "#f3f4f3", cursor: atFloor ? "default" : "pointer", opacity: atFloor ? 0.3 : 1 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "auto" }}><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: TOKENS.ink }}>{calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
          <button onClick={() => setCalMonth(new Date(y, m + 1, 1))} style={{ width: 30, height: 30, borderRadius: 15, border: "none", background: "#f3f4f3", cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "auto" }}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 600, color: TOKENS.faint, padding: "2px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const d = new Date(y, m, day);
            const past = d < today;
            const hasPattern = isRange && activeDow != null && rStart && (rEnd || openEnd);
            if (hasPattern) {
              const inWin = d >= rStart && (openEnd || d <= rEnd);
              const match = activeDow.includes(d.getDay());
              const active = inWin && match;
              const dimDay = inWin && !match;
              const bound = inWin && (d.toDateString() === rStart.toDateString() || (rEnd && d.toDateString() === rEnd.toDateString()));
              return (
                <button key={i} disabled={past} onClick={() => onPick(d)} style={{ height: 36, borderRadius: 10, border: "none", cursor: past ? "default" : "pointer", background: active ? c1 : dimDay ? TOKENS.mintTint : "transparent", boxShadow: bound && !active ? `inset 0 0 0 1.5px ${c1}` : "none", color: active ? "#fff" : past ? "#cfd3d0" : dimDay ? TOKENS.faint : TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: active ? 700 : 500, WebkitTapHighlightColor: "transparent" }}>{day}</button>
              );
            }
            const isS = isRange && rStart && d.toDateString() === rStart.toDateString();
            const isE = isRange && rEnd && d.toDateString() === rEnd.toDateString();
            const between = isRange && rStart && ((rEnd && d > rStart && d < rEnd) || (openEnd && d > rStart));
            const sel = isRange ? (isS || isE) : (selDate && d.toDateString() === selDate.toDateString());
            const rad = isS && openEnd ? "10px 0 0 10px" : isS && isE ? 10 : isS ? "10px 0 0 10px" : isE ? "0 10px 10px 0" : between ? 0 : 10;
            return (
              <button key={i} disabled={past} onClick={() => onPick(d)} style={{ height: 36, borderRadius: rad, border: "none", cursor: past ? "default" : "pointer", background: sel ? c1 : between ? TOKENS.mintTint : "transparent", color: sel ? "#fff" : past ? "#cfd3d0" : TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: sel ? 700 : 500, WebkitTapHighlightColor: "transparent" }}>{day}</button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderEditor = (b) => {
    if (b.kind === "menu" || b.kind === "text") {
      return (
        <div style={{ marginTop: 18, background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${TOKENS.line}`, borderRadius: 12, padding: "0 12px", height: 46, marginBottom: b.kind === "menu" ? 10 : 12 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#aab0ac" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <input ref={inRef} value={ans[b.id]} onChange={(e) => setAns((a) => ({ ...a, [b.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter" && ans[b.id].trim()) setActive(null); }}
              placeholder={b.kind === "menu" ? "Search your menu, or type a new item" : "Type it, or tap one below"}
              style={{ flex: 1, border: "none", outline: "none", fontFamily: "Inter, sans-serif", fontSize: 14.5, color: TOKENS.ink, background: "transparent" }} />
            {ans[b.id].trim() && <button onClick={() => setActive(null)} style={{ border: "none", background: c1, color: "#fff", borderRadius: 16, padding: "5px 12px", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Done</button>}
          </div>
          {b.kind === "menu" ? (
            <div>
              {b.sugg.map((s) => (
                <button key={s.l} onClick={() => choose(b.id, s.l)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", borderTop: `1px solid ${TOKENS.line}`, padding: "11px 2px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink }}>{s.l}</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub }}>{s.p}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {b.sugg.map((s) => (
                <button key={s} onClick={() => b.editSugg ? (setAns((a) => ({ ...a, [b.id]: s })), inRef.current && inRef.current.focus()) : choose(b.id, s)} style={{ cursor: "pointer", borderRadius: 20, padding: "8px 13px", border: `1px solid ${TOKENS.line}`, background: "#fff", color: TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, WebkitTapHighlightColor: "transparent" }}>{s}</button>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (b.kind === "daterange") {
      const recompute = (s, e, ong, days) => setAns((a) => ({ ...a, [b.id]: composeDur(s, e, ong, days) }));
      const onDay = (d) => {
        if (durOngoing) { setDurStart(d); recompute(d, null, true, durDays); return; }
        if (!durStart || (durStart && durEnd)) { setDurStart(d); setDurEnd(null); }
        else if (d < durStart) { setDurStart(d); setDurEnd(null); }
        else { setDurEnd(d); recompute(durStart, d, false, durDays); }
      };
      const toggleOngoing = () => {
        if (durOngoing) { setDurOngoing(false); const s = durStart || defStart, e = addDays(s, 13); setDurEnd(e); recompute(s, e, false, durDays); }
        else { setDurOngoing(true); const s = durStart || defStart; setDurStart(s); recompute(s, null, true, durDays); }
      };
      const setDays = (v) => { setDurDays(v); recompute(durStart, durEnd, durOngoing, v); };
      const toggleDow = (i) => {
        const cur = Array.isArray(durDays) ? durDays : [];
        const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
        setDurDays(next); recompute(durStart, durEnd, durOngoing, next);
      };
      const patterns = [["all", "Every day"], ["weekdays", "Weekdays"], ["weekends", "Weekends"], ["pick", "Pick days"]];
      const isPick = Array.isArray(durDays);
      const curKey = isPick ? "pick" : durDays;
      const patternSet = durDays !== "all";
      const ready = durOngoing ? !!durStart : (!!durStart && (patternSet ? (!!durEnd && (!isPick || durDays.length > 0)) : true));
      const hint = durOngoing
        ? (durStart ? `Starts ${fmtD(durStart)}, no end date` : "Pick the start date")
        : (durStart && durEnd ? `${fmtD(durStart)} to ${fmtD(durEnd)}`
          : durStart ? (patternSet ? "Now pick the end date" : `Just ${fmtD(durStart)}. Tap another day for a range.`)
          : "Pick the start date");
      return (
        <div style={{ marginTop: 18, background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginBottom: 10 }}>{durOngoing ? "When does it start?" : "Tap the first and last day"}</div>
          {calGrid(onDay, durStart, durOngoing ? null : durEnd, dowSet(durDays), durOngoing)}
          <div style={{ marginTop: 14, borderTop: `1px solid ${TOKENS.line}`, paddingTop: 14 }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginBottom: 9 }}>Which days?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {patterns.map(([k, lbl]) => {
                const on = curKey === k;
                return <button key={k} onClick={() => setDays(k === "pick" ? (isPick ? durDays : []) : k)} style={{ cursor: "pointer", borderRadius: 18, padding: "7px 13px", border: `1px solid ${on ? c1 : TOKENS.line}`, background: on ? c1 : "#fff", color: on ? "#fff" : TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>{lbl}</button>;
              })}
            </div>
            {isPick && (
              <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                {["S", "M", "T", "W", "T", "F", "S"].map((lbl, i) => {
                  const on = durDays.includes(i);
                  return <button key={i} onClick={() => toggleDow(i)} style={{ flex: 1, height: 38, borderRadius: 10, cursor: "pointer", border: `1px solid ${on ? c1 : TOKENS.line}`, background: on ? c1 : "#fff", color: on ? "#fff" : TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>{lbl}</button>;
                })}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, borderTop: `1px solid ${TOKENS.line}`, paddingTop: 14 }}>
            <div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: TOKENS.ink }}>No end date</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginTop: 1 }}>Runs until you stop it</div>
            </div>
            <Switch on={durOngoing} onToggle={toggleOngoing} c1={c1} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, borderTop: `1px solid ${TOKENS.line}`, paddingTop: 12 }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: ready ? TOKENS.ink : TOKENS.sub }}>{hint}</span>
            <button onClick={() => { if (ready) { recompute(durStart, durEnd, durOngoing, durDays); setActive(null); } }} disabled={!ready} style={{ border: "none", background: ready ? c1 : "#e7e9e8", color: ready ? "#fff" : "#b4bab6", borderRadius: 18, padding: "9px 18px", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 13.5, fontWeight: 600, cursor: ready ? "pointer" : "default", WebkitTapHighlightColor: "transparent" }}>Set</button>
          </div>
        </div>
      );
    }
    if (b.kind === "datetime") {
      const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      const mins = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
      const isRepeat = evRec !== "once";
      const dow = selDate ? selDate.toLocaleDateString("en-US", { weekday: "long" }) : null;
      const ord = selDate ? ["1st", "2nd", "3rd", "4th", "5th"][Math.ceil(selDate.getDate() / 7) - 1] : null;
      const composeNow = (sH, sM, sAP, eH, eM, eAP, rec) => { if (selDate) composeWhen(b.id, selDate, rng(sH, sM, sAP, eH, eM, eAP), rec); };
      const wheelUI = (hV, hC, mV, mC, aV, aC) => (
        <div style={{ position: "relative", marginTop: 8 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: 38, background: TOKENS.mintTint, borderRadius: 10, pointerEvents: "none" }} />
          <div style={{ display: "flex", position: "relative", alignItems: "stretch" }}>
            <WheelCol items={hours} value={hV} onChange={hC} />
            <div style={{ display: "flex", alignItems: "center", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 21, fontWeight: 600, color: TOKENS.ink }}>:</div>
            <WheelCol items={mins} value={mV} onChange={mC} />
            <WheelCol items={["am", "pm"]} value={aV} onChange={aC} fmt={(t) => t.toUpperCase()} />
          </div>
        </div>
      );
      const timeRow = (label, which, h, mm, ap) => {
        const open = timeOpen === which;
        return (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0" }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 600, color: TOKENS.ink }}>{label}</span>
            <button onClick={() => setTimeOpen(open ? null : which)} style={{ border: "none", cursor: "pointer", borderRadius: 9, padding: "7px 13px", background: open ? TOKENS.mintTint : "#f0f1f0", color: open ? TOKENS.mintDark : TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>{pillFmt(h, mm, ap)}</button>
          </div>
        );
      };
      return (
        <div style={{ marginTop: 18, background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
          <style>{`.wheelcol::-webkit-scrollbar{display:none}`}</style>
          {calGrid((d) => { setSelDate(d); composeWhen(b.id, d, rng(startH, startM, startAP, endH, endM, endAP), evRec); })}
          <div style={{ borderTop: `1px solid ${TOKENS.line}`, marginTop: 12, paddingTop: 4 }}>
            {timeRow("Start time", "start", startH, startM, startAP)}
            {timeOpen === "start" && wheelUI(
              startH, (v) => { setStartH(v); composeNow(v, startM, startAP, endH, endM, endAP, evRec); },
              startM, (v) => { setStartM(v); composeNow(startH, v, startAP, endH, endM, endAP, evRec); },
              startAP, (v) => { setStartAP(v); composeNow(startH, startM, v, endH, endM, endAP, evRec); },
            )}
            <div style={{ height: 1, background: TOKENS.line }} />
            {timeRow("End time", "end", endH, endM, endAP)}
            {timeOpen === "end" && wheelUI(
              endH, (v) => { setEndH(v); composeNow(startH, startM, startAP, v, endM, endAP, evRec); },
              endM, (v) => { setEndM(v); composeNow(startH, startM, startAP, endH, v, endAP, evRec); },
              endAP, (v) => { setEndAP(v); composeNow(startH, startM, startAP, endH, endM, v, evRec); },
            )}
          </div>
          <div style={{ borderTop: `1px solid ${TOKENS.line}`, marginTop: 8, paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 600, color: TOKENS.ink }}>Repeats</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginTop: 2 }}>{isRepeat ? "A recurring event" : "A one-time event"}</div>
              </div>
              <Switch on={isRepeat} c1={c1} onToggle={() => { const nr = isRepeat ? "once" : "week"; setEvRec(nr); composeNow(startH, startM, startAP, endH, endM, endAP, nr); }} />
            </div>
            {isRepeat && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {[
                  { val: "week", title: "Every week", mean: dow ? `on ${dow}s` : "on the same weekday" },
                  { val: "biweek", title: "Every 2 weeks", mean: dow ? `every other ${dow}` : "every other week" },
                  { val: "month", title: "Every month", mean: ord && dow ? `on the ${ord} ${dow}` : "same weekday each month" },
                ].map((r) => {
                  const on = evRec === r.val;
                  return (
                    <button key={r.val} onClick={() => { setEvRec(r.val); composeNow(startH, startM, startAP, endH, endM, endAP, r.val); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", cursor: "pointer", borderRadius: 13, padding: "11px 13px", border: `1.5px solid ${on ? c1 : TOKENS.line}`, background: on ? TOKENS.mintTint : "#fff", WebkitTapHighlightColor: "transparent" }}>
                      <div>
                        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: TOKENS.ink }}>{r.title}</div>
                        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginTop: 2 }}>{r.mean}</div>
                      </div>
                      <div style={{ width: 21, height: 21, borderRadius: 11, flexShrink: 0, border: on ? "none" : `1.5px solid #d4d8d5`, background: on ? c1 : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button onClick={() => setActive(null)} disabled={!selDate} style={{ width: "100%", marginTop: 16, height: 46, borderRadius: 23, border: "none", cursor: selDate ? "pointer" : "default", background: selDate ? c1 : "#e7e9e8", color: selDate ? "#fff" : "#b4bab6", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>
            {selDate ? "Set the date" : "Pick a day above"}
          </button>
        </div>
      );
    }
    if (b.kind === "add" && b.text) {
      const has = ans[b.id] && ans[b.id].trim();
      return (
        <div style={{ marginTop: 18, background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
          {b.short ? (
            <input ref={inRef} value={ans[b.id]} onChange={(e) => setAns((a) => ({ ...a, [b.id]: e.target.value }))} inputMode="numeric"
              onKeyDown={(e) => { if (e.key === "Enter" && ans[b.id].trim()) setActive(null); }}
              placeholder={b.ph || b.addLabel.replace(/^Add /, "")}
              style={{ width: "100%", border: `1px solid ${TOKENS.line}`, borderRadius: 12, padding: "12px 13px", fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink, outline: "none", boxSizing: "border-box" }} />
          ) : (
            <textarea ref={inRef} value={ans[b.id]} onChange={(e) => setAns((a) => ({ ...a, [b.id]: e.target.value }))}
              placeholder={b.ph || b.addLabel.replace(/^Add /, "")} rows={3}
              style={{ width: "100%", border: `1px solid ${TOKENS.line}`, borderRadius: 12, padding: "11px 12px", fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink, outline: "none", resize: "none", boxSizing: "border-box", lineHeight: 1.5 }} />
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button onClick={() => choose(b.id, "")} style={{ border: "none", background: "none", color: TOKENS.sub, fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px 10px" }}>{has ? "Remove" : "Cancel"}</button>
            <button onClick={() => has && setActive(null)} disabled={!has} style={{ border: "none", background: has ? c1 : "#e7e9e8", color: has ? "#fff" : "#b4bab6", borderRadius: 18, padding: "8px 18px", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, cursor: has ? "pointer" : "default" }}>Done</button>
          </div>
        </div>
      );
    }
    // chips / toggle / add(opts)
    const isCustomDate = b.dateOpt && ans[b.id] && !b.opts.includes(ans[b.id]);
    return (
      <div style={{ marginTop: 18, background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {b.opts.map((o) => {
            const v = typeof o === "string" ? o : o.c;
            const isDate = b.dateOpt === v;
            const on = isDate ? (cal || isCustomDate) : ans[b.id] === v;
            const label = isDate && isCustomDate ? ans[b.id] : v;
            return <button key={v} onClick={() => (isDate ? setCal(true) : choose(b.id, v))} style={{ cursor: "pointer", borderRadius: 22, padding: "10px 15px", border: `1.5px solid ${on ? c1 : TOKENS.line}`, background: on ? c1 : "#fff", color: on ? "#fff" : TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>{label}</button>;
          })}
          {b.kind === "add" && ans[b.id] && (
            <button onClick={() => choose(b.id, "")} style={{ cursor: "pointer", borderRadius: 22, padding: "10px 15px", border: "none", background: "none", color: TOKENS.sub, fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600 }}>Remove</button>
          )}
        </div>
        {b.custom && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${TOKENS.line}`, paddingTop: 12, display: "flex", gap: 9, alignItems: "center" }}>
            <input value={isPreset(b, ans[b.id]) ? "" : ans[b.id]} onChange={(e) => setAns((a) => ({ ...a, [b.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter" && ans[b.id].trim()) setActive(null); }} placeholder={b.customPh || "or type your own"}
              style={{ flex: 1, height: 42, border: `1px solid ${TOKENS.line}`, borderRadius: 12, padding: "0 13px", fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink, outline: "none", boxSizing: "border-box" }} />
            {!isPreset(b, ans[b.id]) && ans[b.id] && ans[b.id].trim() && <button onClick={() => setActive(null)} style={{ border: "none", background: c1, color: "#fff", borderRadius: 16, padding: "7px 13px", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Done</button>}
          </div>
        )}
        {b.dateOpt && cal && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${TOKENS.line}`, paddingTop: 12 }}>
            {calGrid((d) => pickDate(d))}
          </div>
        )}
      </div>
    );
  };

  const activeBlank = active ? blanks.find((b) => b.id === active) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: grad(goalId), position: "relative" }}>
      <StatusBar dark />
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 22px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 26 }}>
          <CircleBtn onClick={onBack} dark>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 18, fontWeight: 600, color: "#fff" }}>{goalById(goalId).title}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" /></svg>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, letterSpacing: 1.4, color: "rgba(255,255,255,0.92)", textTransform: "uppercase" }}>Here's what we'll do</span>
        </div>

        {/* the editable sentence */}
        <div style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 27, lineHeight: 1.4, letterSpacing: -0.3 }}>
          {p.sentence.map((seg, i) => {
            if (typeof seg === "string") return <span key={i} style={{ color: active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.92)", transition: "color 200ms ease" }}>{seg}</span>;
            if (seg.kind === "add") {
              if (!ans[seg.id]) return null;
              const isActive = active === seg.id;
              return <span key={i} onClick={() => openBlank(seg.id)} style={{ cursor: "pointer", color: active && !isActive ? "rgba(255,255,255,0.5)" : "#fff", textDecoration: "underline", textDecorationThickness: 2, textUnderlineOffset: 4, textDecorationColor: isActive ? "#fff" : "rgba(255,255,255,0.7)" }}>{seg.clause(ans[seg.id])}</span>;
            }
            const isArr = Array.isArray(ans[seg.id]);
            const filled = isArr ? ans[seg.id].length > 0 : (ans[seg.id] && ans[seg.id].toString().trim().length > 0);
            const isActive = active === seg.id;
            const label = filled ? (isArr ? hjoin(ans[seg.id]) : sayOf(seg, ans[seg.id])) : seg.ph;
            return (
              <span key={i} onClick={() => openBlank(seg.id)} style={{
                cursor: "pointer",
                color: isActive ? "#fff" : active ? "rgba(255,255,255,0.5)" : "#fff",
                textDecoration: "underline",
                textDecorationStyle: filled ? "solid" : "dashed",
                textDecorationThickness: 2, textUnderlineOffset: 4,
                textDecorationColor: isActive ? "#fff" : "rgba(255,255,255,0.7)",
                opacity: filled ? 1 : 0.92, transition: "color 200ms ease",
              }}>{label}</span>
            );
          })}
        </div>

        {activeBlank && renderEditor(activeBlank)}

        {/* optional add-ons only (e.g. a launch offer) */}
        {addBlanks.some((b) => !ans[b.id]) && (
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center" }}>
            {addBlanks.filter((b) => !ans[b.id]).map((b) => (
              <button key={b.id} onClick={() => openBlank(b.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", borderRadius: 22, padding: "9px 14px", border: "1.5px dashed rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.08)", color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>{b.addLabel}
              </button>
            ))}
          </div>
        )}

      </div>
      <div style={{ flexShrink: 0, padding: "12px 22px 20px" }}>
        <button onClick={() => ready && onBuild(ans)} disabled={!ready} style={{
          width: "100%", height: 54, borderRadius: 27, border: "none", cursor: ready ? "pointer" : "default",
          background: ready ? "#fff" : "rgba(255,255,255,0.45)", color: ready ? c1 : "#fff",
          fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16.5,
          WebkitTapHighlightColor: "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "background 150ms ease",
        }}>
          Build my plan
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ready ? c1 : "#fff"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Screen: Proposed plan  (the spine: situation -> plan -> approve)
   Detail (pieces, pricing, budget) is opt-in, not a gate.
   ============================================================ */
function TierTag({ t }) {
  const included = t === "Included";
  return (
    <span style={{
      fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
      color: included ? TOKENS.mintDark : "#8a908c", background: included ? TOKENS.mintTint : "#f1f2f1",
    }}>{t}</span>
  );
}

function ProposedPlan({ goalId, restaurant, answers = {}, onBack, onApprove, onStrategist }) {
  const p = PLAN[goalId];
  const c1 = G[goalId][1];
  const assetQ = p.sentence.find((s) => typeof s !== "string" && s.id === "assets");
  const paidIdx = assetQ ? (assetQ.paid != null ? assetQ.paid : (assetQ.opts ? assetQ.opts.length - 1 : -1)) : -1;
  const paidOpt = assetQ && assetQ.opts ? assetQ.opts[paidIdx] : null;
  let pieces, saved, skipped;
  {
    const leanChosen = !assetQ || answers.assets == null || answers.assets !== paidOpt;
    const assetPiece = p.inside.find((pc) => pc.asset);
    pieces = p.inside.map((pc) => (pc.asset ? { ...pc, t: leanChosen ? pc.lean : pc.t } : pc));
    saved = p.saved + (leanChosen && assetPiece ? assetPiece.amt : 0);
    skipped = p.skipped + (leanChosen && assetPiece ? 1 : 0);
  }
  if (answers.offer) pieces.push({ n: "A launch offer to drive trial", t: "Included" });
  if (answers.code) pieces.push({ n: `Track redemptions with code ${answers.code}`, t: "Included" });
  const dealOngoing = (answers.duration || "").includes("until you stop it");
  if (dealOngoing) pieces = pieces.map((pc) => (pc.n === "Reminder before it ends" ? { n: "A weekly reminder while it runs", t: "Included" } : pc));
  const featNew = goalId === "launch" && /\bnew\b/.test(answers.angle || "brand new");
  if (featNew) pieces = [{ n: "Teaser post before it drops", t: "Included" }, ...pieces, { n: "Menu update", t: "Included" }];
  const heroNum = (answers.turnout && /\d/.test(answers.turnout)) ? parseInt(answers.turnout.replace(/\D/g, ""), 10) : p.hero;
  const whenStr = answers.when || "";
  const isMonthly = whenStr.includes("of each month");
  const isBiweekly = whenStr.startsWith("Every other");
  const recurring = isMonthly || whenStr.startsWith("Every ");
  const cadence = isMonthly ? "month" : isBiweekly ? "2 weeks" : "week";
  const launchGroup = [
    { n: "Announcement post", t: "Included" },
    { n: "The event flyer", t: "Included" },
    { n: "Email and text to your list", t: "Included" },
  ];
  const ongoingGroup = [
    { n: `A reminder post every ${cadence}`, t: "Included" },
    { n: `A story every ${cadence} to stay visible`, t: "Included" },
    { n: "Auto-reply with the details", t: "Included" },
  ];
  if (recurring) pieces = [...launchGroup, ...ongoingGroup];
  const [ready, setReady] = useState(false);
  const [subject, setSubject] = useState(answers.subject || p.subject);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState(800);
  const [showBudget, setShowBudget] = useState(false);
  const inRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => setReady(true), 1150); return () => clearTimeout(t); }, []);
  useEffect(() => { if (editing && inRef.current) inRef.current.focus(); }, [editing]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff", position: "relative" }}>
      {/* loading cover */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 5, background: grad(goalId),
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18,
        opacity: ready ? 0 : 1, pointerEvents: ready ? "none" : "auto", transition: "opacity 380ms ease",
      }}>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 21, color: "#fff", letterSpacing: -0.2 }}>Building your plan</div>
        <div style={{ display: "flex", gap: 7 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 9, height: 9, borderRadius: 5, background: "#fff", animation: "apndot 1s ease-in-out infinite", animationDelay: i * 0.16 + "s" }} />)}
        </div>
      </div>

      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 20px 26px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 18 }}>
          <CircleBtn onClick={onBack}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: TOKENS.faint }}>{goalById(goalId).title}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: c1 }} />
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, letterSpacing: 1.1, color: c1, textTransform: "uppercase" }}>{p.eyebrow}</span>
        </div>

        <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 25, lineHeight: 1.16, color: TOKENS.ink, margin: "0 0 18px", letterSpacing: -0.3 }}>
          Here's your plan to {p.pre}
          {p.subject !== null && (
            editing ? (
              <input ref={inRef} value={subject} onChange={(e) => setSubject(e.target.value)}
                onBlur={() => setEditing(false)} onKeyDown={(e) => { if (e.key === "Enter") setEditing(false); }}
                style={{ font: "inherit", color: c1, border: "none", borderBottom: `2px solid ${c1}`, background: "transparent", outline: "none", width: Math.max(6, subject.length + 1) + "ch", padding: 0 }} />
            ) : (
              <span onClick={() => setEditing(true)} style={{ color: c1, textDecoration: "underline", textDecorationThickness: 2, textUnderlineOffset: 3, cursor: "text" }}>{subject}</span>
            )
          )}
          {p.post}.
        </h1>

        {/* hero number */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 2 }}>
          <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 54, lineHeight: 1, color: c1, letterSpacing: -1.5 }}>{heroNum.toLocaleString("en-US")}</span>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: TOKENS.ink }}>{p.unit}</span>
        </div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub, marginBottom: 20 }}>{recurring ? `every ${cadence}, with a bigger push to launch it` : p.daily}</div>

        {/* calm summary */}
        <div style={{ border: `1px solid ${TOKENS.line}`, borderRadius: 16, padding: "14px 16px", marginBottom: 18, background: "#fff", boxShadow: "0 1px 2px rgba(20,30,26,0.03)" }}>
          <SummaryRow icon="layers" text={recurring ? `${launchGroup.length} pieces to launch, then ${ongoingGroup.length} every ${cadence}` : dealOngoing ? `${pieces.length} pieces, running until you stop it` : `${pieces.length} pieces over ${p.weeks} weeks`} />
          <div style={{ height: 1, background: TOKENS.line, margin: "11px 0" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SummaryRow icon="wallet" text={<>Within your <b style={{ color: TOKENS.ink }}>{money(budget)}/mo</b> plan</>} />
            <button onClick={() => setShowBudget((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: c1, WebkitTapHighlightColor: "transparent" }}>{showBudget ? "Done" : "Adjust"}</button>
          </div>
          {showBudget && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 7, marginTop: 11 }}>
              {BUDGETS.map((b) => {
                const on = budget === b;
                return <button key={b} onClick={() => setBudget(b)} style={{ cursor: "pointer", borderRadius: 11, padding: "9px 2px", background: on ? c1 : "#fff", border: `1px solid ${on ? c1 : TOKENS.line}`, fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 12.5, color: on ? "#fff" : TOKENS.ink, WebkitTapHighlightColor: "transparent" }}>{money(b)}</button>;
              })}
            </div>
          )}
          <div style={{ height: 1, background: TOKENS.line, margin: "11px 0" }} />
          {recurring
            ? <SummaryRow icon="repeat" text={<>Runs every {cadence} until you stop it. <b style={{ color: TOKENS.ink }}>Pause or end anytime.</b></>} />
            : dealOngoing
            ? <SummaryRow icon="repeat" text={<>Runs until you stop it. <b style={{ color: TOKENS.ink }}>Pause or end anytime.</b></>} />
            : <SummaryRow icon="ship" text="Charged only when each piece ships. Nothing now." />}
        </div>

        {assetQ && assetQ.inboxOpt && (Array.isArray(answers.assets) ? answers.assets.includes(assetQ.inboxOpt) : answers.assets === assetQ.inboxOpt) && (
          <div style={{ display: "flex", alignItems: "center", gap: 11, background: TOKENS.mintTint, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.ink, lineHeight: 1.4 }}>Added to your inbox: <b>upload your photos</b> when you have them.</span>
          </div>
        )}

        {(answers.rsvp === "reserve a table" || answers.rsvp === "buy tickets") && (
          <div style={{ display: "flex", alignItems: "center", gap: 11, background: TOKENS.mintTint, borderRadius: 14, padding: "12px 14px", marginBottom: 18 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.ink, lineHeight: 1.4 }}>Added to your inbox: <b>add your {answers.rsvp === "buy tickets" ? "ticket" : "reservation"} link</b>, or we'll set one up for you.</span>
          </div>
        )}

        {/* primary */}
        <button onClick={() => onApprove(budget, pieces.length)} style={{
          width: "100%", height: 54, borderRadius: 27, border: "none", cursor: "pointer", background: TOKENS.mint, color: "#fff",
          fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16.5, WebkitTapHighlightColor: "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          This looks right
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
        </button>

        {/* opt-in detail */}
        <button onClick={() => setOpen((v) => !v)} style={{ marginTop: 16, width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "4px 0", WebkitTapHighlightColor: "transparent" }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: TOKENS.sub }}>See what's inside</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TOKENS.sub} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }}><path d="M6 9l6 6 6-6" /></svg>
        </button>

        {open && (
          <div style={{ marginTop: 12 }}>
            {!recurring && skipped > 0 && (
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.mintDark, background: TOKENS.mintTint, borderRadius: 12, padding: "10px 13px", lineHeight: 1.4, marginBottom: 12 }}>
                We skipped {skipped} thing{skipped > 1 ? "s" : ""} you already have, saving you {money(saved)}.
              </div>
            )}
            {recurring ? (
              <div>
                {[["To launch it", launchGroup], [`Every ${cadence} after`, ongoingGroup]].map(([label, grp]) => (
                  <div key={label} style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: TOKENS.faint, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                    {grp.map((piece, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 2px", borderBottom: i < grp.length - 1 ? `1px solid ${TOKENS.line}` : "none" }}>
                        <span style={{ width: 7, height: 7, borderRadius: 4, background: c1, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.ink }}>{piece.n}</span>
                        <TierTag t={piece.t} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {pieces.map((piece, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 2px", borderBottom: i < pieces.length - 1 ? `1px solid ${TOKENS.line}` : "none" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: c1, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.ink }}>{piece.n}</span>
                    <TierTag t={piece.t} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 18 }} />
        <button onClick={onStrategist} style={{ width: "100%", marginTop: 18, background: "#f6f7f6", border: `1px solid ${TOKENS.line}`, borderRadius: 14, padding: "13px 15px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, WebkitTapHighlightColor: "transparent" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /></svg>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 14.5, color: TOKENS.ink }}>Want a marketer to take it over?</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginTop: 1 }}>We'll hand them this draft to refine and run. You still approve it.</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.faint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ icon, text }) {
  const ic = {
    layers: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />,
    wallet: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M16 12h3" /></>,
    ship: <><path d="M3 12l2-7h14l2 7" /><path d="M3 12v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></>,
    repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  }[icon];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#aab0ac" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ic}</svg>
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.sub, lineHeight: 1.35 }}>{text}</span>
    </div>
  );
}

/* ============================================================
   Screen: Brief your strategist  (the relief path)
   ============================================================ */
function StrategistBrief({ restaurant, onBack, onSent }) {
  const [want, setWant] = useState("");
  const [avoid, setAvoid] = useState("");
  const [call, setCall] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 20 }}>
          <CircleBtn onClick={onBack}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: TOKENS.faint }}>Hand it to a marketer</div>
        </div>
        <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 24, lineHeight: 1.12, color: TOKENS.ink, margin: "0 0 9px", letterSpacing: -0.2 }}>Hand it to a marketer</h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub, lineHeight: 1.45, margin: "0 0 20px" }}>
          They get this whole draft, plus {restaurant}'s goal and budget. Add anything else and a real person refines it, then sends it back for you to approve, usually within a few hours.
        </p>

        <label style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: TOKENS.ink, marginBottom: 8 }}>Anything you really want included?</label>
        <textarea value={want} onChange={(e) => setWant(e.target.value)} placeholder="e.g. push our new brunch menu, get more weeknight covers"
          style={{ width: "100%", minHeight: 84, resize: "none", borderRadius: 14, border: `1px solid ${TOKENS.line}`, background: "#fff", padding: 14, fontFamily: "Inter, sans-serif", fontSize: 14, lineHeight: 1.45, color: TOKENS.ink, outline: "none", boxSizing: "border-box", marginBottom: 18 }} />

        <label style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: TOKENS.ink, marginBottom: 8 }}>Anything to avoid?</label>
        <textarea value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="e.g. no TikTok, we don't discount"
          style={{ width: "100%", minHeight: 70, resize: "none", borderRadius: 14, border: `1px solid ${TOKENS.line}`, background: "#fff", padding: 14, fontFamily: "Inter, sans-serif", fontSize: 14, lineHeight: 1.45, color: TOKENS.ink, outline: "none", boxSizing: "border-box", marginBottom: 16 }} />

        <button onClick={() => setCall((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 11, background: "none", border: "none", cursor: "pointer", padding: "2px 0 0", WebkitTapHighlightColor: "transparent" }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${call ? TOKENS.mint : "#cfd4d1"}`, background: call ? TOKENS.mint : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {call && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
          </span>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.ink }}>Add a free 15-minute call before they draft</span>
        </button>

        <div style={{ flex: 1, minHeight: 22 }} />
        <button onClick={onSent} style={{ width: "100%", height: 54, borderRadius: 27, border: "none", cursor: "pointer", background: TOKENS.mint, color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16.5, WebkitTapHighlightColor: "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          Hand it over
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Screen: Express order  (the direct one-thing path destination)
   ============================================================ */
const PART_META = {
  post: { price: 60, days: "~3 days", measure: "Reach & saves", why: "A single strong post keeps you in feeds this week." },
  graphic: { price: 40, days: "~3 days", measure: "Shares & prints", why: "A clean graphic works on social and on the wall." },
  reel: { price: 120, days: "~5 days", measure: "Reach & profile visits", why: "Short video is the top discovery surface for younger diners." },
  offer: { price: 0, days: "~2 days", measure: "Redemptions", why: "A simple offer gives people a reason to come this week." },
  reply: { price: 0, days: "~2 days", measure: "Response rate", why: "Fast replies to messages and reviews win bookings." },
};
function ExpressOrder({ partId, onBack, onOrder }) {
  const part = DIRECT.find((d) => d.id === partId);
  const m = PART_META[partId];
  const [qty, setQty] = useState(1);
  const total = m.price * qty;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 16 }}>
          <CircleBtn onClick={onBack}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: TOKENS.faint }}>One thing</div>
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 20, padding: "5px 12px", marginBottom: 14 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={TOKENS.mintDark}><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></svg>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: TOKENS.mintDark }}>Express order · charged once on delivery</span>
        </div>

        <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 23, lineHeight: 1.12, color: TOKENS.ink, margin: "0 0 16px", letterSpacing: -0.2 }}>{part.title}</h1>

        <div style={{ background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 15.5, color: TOKENS.ink }}>{part.title}</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, marginTop: 2 }}>{part.sub} · {m.days}</div>
            </div>
            <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16, color: TOKENS.ink, whiteSpace: "nowrap" }}>{m.price === 0 ? "Included" : money(m.price)}</div>
          </div>
          <div style={{ height: 1, background: TOKENS.line, margin: "13px 0" }} />
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.mintDark, marginBottom: 6 }}><b>We measure:</b> {m.measure}</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, lineHeight: 1.4, marginBottom: 14 }}><b style={{ color: TOKENS.ink }}>Why this:</b> {m.why}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.ink }}>How many?</span>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ width: 30, height: 30, borderRadius: 15, border: `1px solid ${TOKENS.line}`, background: "#fff", cursor: "pointer", fontSize: 18, color: TOKENS.ink, lineHeight: 1 }}>−</button>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: TOKENS.ink, minWidth: 16, textAlign: "center" }}>{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} style={{ width: 30, height: 30, borderRadius: 15, border: `1px solid ${TOKENS.line}`, background: "#fff", cursor: "pointer", fontSize: 18, color: TOKENS.ink, lineHeight: 1 }}>+</button>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 22 }} />
        <button onClick={() => onOrder(total)} style={{ width: "100%", height: 54, borderRadius: 27, border: "none", cursor: "pointer", background: TOKENS.ink, color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16.5, WebkitTapHighlightColor: "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {total === 0 ? "Order it" : `Order for ${money(total)}`}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Screen: Ongoing goal (outcome-driven, not a campaign)
   ============================================================ */
function GoalNights({ goalId, restaurant, onBack, onApprove, onStrategist }) {
  const g = GOAL[goalId];
  const c1 = G[goalId][1];
  const [step, setStep] = useState("intake");
  const [nights, setNights] = useState([]);
  const [draw, setDraw] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailOther, setDetailOther] = useState(false);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [budget, setBudget] = useState(800);
  const [showBudget, setShowBudget] = useState(false);
  const [open, setOpen] = useState(false);

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const join = (arr) => arr.length <= 1 ? (arr[0] || "those nights") : arr.length === 2 ? `${arr[0]} and ${arr[1]}` : `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
  const nightsTxt = join(nights);
  const toggleNight = (d) => setNights((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => g.days.indexOf(a) - g.days.indexOf(b)));
  const pickDraw = (id) => { setDraw(id); setDetail(null); setDetailOther(false); setCustom(""); };
  const ready = nights.length > 0 && draw;

  const isEvent = draw === "event";
  const watchLine = draw === "dish" ? "How many people order it each week."
    : isEvent ? "How many people come each week."
    : "How many people use it each week.";
  const measureNote = isEvent
    ? "We count who comes each week, so the number is real, not a guess."
    : "It runs with a code people show, so the count is real, not a guess.";

  if (step === "intake") {
    const chip = (on) => ({ cursor: "pointer", borderRadius: 22, padding: "9px 15px", border: `1.5px solid ${on ? "#fff" : "rgba(255,255,255,0.35)"}`, background: on ? "#fff" : "rgba(255,255,255,0.1)", color: on ? c1 : "#fff", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, WebkitTapHighlightColor: "transparent" });
    const inputStyle = { marginTop: 10, width: "100%", boxSizing: "border-box", height: 46, borderRadius: 12, border: "none", padding: "0 15px", fontFamily: "Inter, sans-serif", fontSize: 14.5, color: TOKENS.ink, outline: "none" };
    const QLabel = ({ n, sub }) => (
      <div style={{ marginTop: 26 }}>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 17.5, color: "#fff", marginBottom: 3 }}>{n}</div>
        {sub && <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "rgba(255,255,255,0.78)", marginBottom: 13 }}>{sub}</div>}
      </div>
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: grad(goalId), position: "relative" }}>
        <StatusBar dark />
        <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 24px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 18 }}>
            <CircleBtn onClick={onBack} dark>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </CircleBtn>
            <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 18, fontWeight: 600, color: "#fff" }}>{g.title}</div>
          </div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.5 }}>{g.intro}</div>

          {/* Q1 nights */}
          <QLabel n="When is it quietest?" sub="Pick the nights you'd most like to fill." />
          <div style={{ display: "flex", gap: 5 }}>
            {g.days.map((d) => {
              const on = nights.includes(d);
              return <button key={d} onClick={() => toggleNight(d)} style={{ flex: 1, height: 44, borderRadius: 11, cursor: "pointer", border: `1.5px solid ${on ? "#fff" : "rgba(255,255,255,0.35)"}`, background: on ? "#fff" : "rgba(255,255,255,0.1)", color: on ? c1 : "#fff", fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, WebkitTapHighlightColor: "transparent", padding: 0 }}>{d.slice(0, 1)}</button>;
            })}
          </div>

          {/* Q2 draw */}
          <QLabel n="What could bring people in?" sub="Pick what fits your place. We build around it." />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.draws.filter((o) => o.id !== "auto").map((o) => {
              const on = draw === o.id;
              return (
                <button key={o.id} onClick={() => pickDraw(o.id)} style={{ textAlign: "left", cursor: "pointer", borderRadius: 14, padding: "13px 15px", border: `1.5px solid ${on ? "#fff" : "rgba(255,255,255,0.3)"}`, background: on ? "#fff" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: 12, WebkitTapHighlightColor: "transparent" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, fontWeight: 600, color: on ? c1 : "#fff" }}>{o.label}</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: on ? "#7d8a85" : "rgba(255,255,255,0.7)", marginTop: 2 }}>{o.hint}</div>
                  </div>
                  <div style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, border: `2px solid ${on ? c1 : "rgba(255,255,255,0.5)"}`, background: on ? c1 : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>}
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "13px 2px 11px" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.22)" }} />
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.22)" }} />
          </div>
          {(() => {
            const on = draw === "auto";
            return (
              <button onClick={() => pickDraw("auto")} style={{ width: "100%", textAlign: "left", cursor: "pointer", borderRadius: 14, padding: "12px 15px", border: `1.5px ${on ? "solid" : "dashed"} ${on ? "#fff" : "rgba(255,255,255,0.45)"}`, background: on ? "#fff" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 12, WebkitTapHighlightColor: "transparent" }}>
                <div style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: on ? c1 : "rgba(255,255,255,0.92)" }}>I'm not sure, you pick what brings them in</div>
                <div style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, border: `2px solid ${on ? c1 : "rgba(255,255,255,0.45)"}`, background: on ? c1 : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>}
                </div>
              </button>
            );
          })()}

          {/* Q3 contextual detail (depends on the draw) */}
          {draw && draw !== "auto" && g.details[draw] && (
            <>
              <QLabel n={g.details[draw].q} sub="Pick one, or skip and we'll decide." />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[...g.details[draw].opts, "Something else"].map((o) => {
                  const isOther = o === "Something else";
                  const on = isOther ? detailOther : detail === o;
                  return <button key={o} onClick={() => { if (isOther) { setDetailOther(true); setDetail(custom || ""); } else { setDetail(detail === o ? null : o); setDetailOther(false); } }} style={chip(on)}>{o}</button>;
                })}
              </div>
              {detailOther && <input autoFocus value={custom} onChange={(e) => { setCustom(e.target.value); setDetail(e.target.value); }} placeholder="Type it" style={inputStyle} />}
            </>
          )}
          {draw === "auto" && (
            <div style={{ marginTop: 22, display: "flex", alignItems: "flex-start", gap: 9 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "rgba(255,255,255,0.8)", lineHeight: 1.45 }}>No problem. We'll choose what tends to work best for nights like yours.</span>
            </div>
          )}

          {/* Q4 optional open note */}
          {!showNote ? (
            <button onClick={() => setShowNote(true)} style={{ alignSelf: "flex-start", marginTop: 24, display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", borderRadius: 22, padding: "9px 15px", border: "1.5px dashed rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Anything else we should know?
            </button>
          ) : (
            <>
              <QLabel n="Anything else we should know?" sub="Optional. A heads-up, a quirk, or something you've tried before." />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Like: we tried a deal once and it stayed quiet. Or: keep it simple." rows={3} style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: "none", padding: "12px 15px", fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink, outline: "none", resize: "none", lineHeight: 1.5 }} />
            </>
          )}
        </div>
        <div style={{ flexShrink: 0, padding: "12px 22px 20px" }}>
          <button onClick={() => ready && setStep("plan")} disabled={!ready} style={{ width: "100%", height: 54, borderRadius: 27, border: "none", cursor: ready ? "pointer" : "default", background: ready ? "#fff" : "rgba(255,255,255,0.4)", color: ready ? c1 : "rgba(255,255,255,0.8)", fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent" }}>
            Build my plan
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ready ? c1 : "rgba(255,255,255,0.8)"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>
    );
  }

  let leadTxt;
  if (draw === "dish") leadTxt = detail ? `Your ${detail} as the special` : "A nightly special dish";
  else if (draw === "deal") leadTxt = detail || "A deal";
  else if (draw === "event") leadTxt = detail || "Something happening";
  else leadTxt = "A weekly special";
  const planLine = `${leadTxt} on ${nightsTxt}, and we'll spread the word every week.`;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 14px" }}>
        <div style={{ paddingTop: 4, marginBottom: 16 }}>
          <CircleBtn onClick={() => setStep("intake")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: c1 }} />
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, letterSpacing: 1.1, color: c1, textTransform: "uppercase" }}>Your plan</span>
        </div>
        <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 25, lineHeight: 1.16, color: TOKENS.ink, margin: "0 0 10px", letterSpacing: -0.3 }}>Here's how we'll fill your slow nights</h1>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.sub, marginBottom: 8, lineHeight: 1.5 }}>{planLine}</div>
        {note ? <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub, marginBottom: 20, lineHeight: 1.5 }}>We'll keep in mind: <span style={{ color: TOKENS.ink }}>{note}</span></div> : <div style={{ marginBottom: 12 }} />}

        <div style={{ border: `1px solid ${TOKENS.line}`, borderRadius: 16, padding: "15px 16px", marginBottom: 16, background: "#fff", boxShadow: "0 1px 2px rgba(20,30,26,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c1} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 9l-5 5-3-3-4 4" /></svg>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: c1, textTransform: "uppercase" }}>How you'll know it's working</span>
          </div>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 17, fontWeight: 600, color: TOKENS.ink, marginBottom: 4 }}>{watchLine}</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.sub, lineHeight: 1.5 }}>{measureNote} It starts at zero and goes up as people use it.</div>
        </div>

        <div style={{ border: `1px solid ${TOKENS.line}`, borderRadius: 16, padding: "14px 16px", marginBottom: 18, background: "#fff", boxShadow: "0 1px 2px rgba(20,30,26,0.03)" }}>
          <SummaryRow icon="layers" text={`We make and post everything, every week`} />
          <div style={{ height: 1, background: TOKENS.line, margin: "11px 0" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SummaryRow icon="wallet" text={<>Within your <b style={{ color: TOKENS.ink }}>{money(budget)}/mo</b></>} />
            <button onClick={() => setShowBudget((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: c1, WebkitTapHighlightColor: "transparent" }}>{showBudget ? "Done" : "Change"}</button>
          </div>
          {showBudget && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 7, marginTop: 11 }}>
              {BUDGETS.map((b) => {
                const on = budget === b;
                return <button key={b} onClick={() => setBudget(b)} style={{ cursor: "pointer", borderRadius: 11, padding: "9px 2px", background: on ? c1 : "#fff", border: `1px solid ${on ? c1 : TOKENS.line}`, fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 12.5, color: on ? "#fff" : TOKENS.ink, WebkitTapHighlightColor: "transparent" }}>{money(b)}</button>;
              })}
            </div>
          )}
          <div style={{ height: 1, background: TOKENS.line, margin: "11px 0" }} />
          <SummaryRow icon="repeat" text={<>Runs every week until you stop it. <b style={{ color: TOKENS.ink }}>Pause or end anytime.</b></>} />
        </div>

        <button onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: "2px 2px 0" }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: TOKENS.ink }}>See what we do each week</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TOKENS.sub} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }}><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {open && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
            {g.inside.map((pc, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${TOKENS.line}`, borderRadius: 13, padding: "11px 13px" }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.ink }}>{pc.n}</span>
                <TierTag t={pc.t} />
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 20, background: TOKENS.mintTint, borderRadius: 16, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-6A8.4 8.4 0 1 1 21 11.5z" /></svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.mintDark, fontWeight: 600, lineHeight: 1.45 }}>Want a marketer to take it over?</div>
            <button onClick={onStrategist} style={{ marginTop: 7, background: "#fff", border: "none", borderRadius: 16, padding: "8px 14px", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: TOKENS.mintDark, cursor: "pointer" }}>Hand it to a marketer</button>
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: "12px 20px 22px", borderTop: `1px solid ${TOKENS.line}`, background: "#fff" }}>
        <button onClick={() => onApprove(budget, g.inside.length)} style={{ width: "100%", height: 52, borderRadius: 26, border: "none", cursor: "pointer", background: c1, color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>Start this plan</button>
      </div>
    </div>
  );
}

/* ============================================================
   Phone frame + router
   ============================================================ */
/* ============================================================
   Screen: Create hub (entry) — slide-up sheet over Home
   ============================================================ */
const CREATE_CARDS = [
  { id: "launch", title: "Feature an item", sub: "New or a favorite" },
  { id: "event", title: "Promote an event or date", sub: "A night, a holiday, a tasting" },
  { id: "deal", title: "Run a deal", sub: "A discount or special" },
];
const RUNNING_GOALS = [
  { id: "nights", name: "Fill slow nights" },
  { id: "loyalty", name: "Turn first-timers into regulars" },
  { id: "nearby", name: "Get discovered by new locals" },
];

function NavIcon({ name, color }) {
  const p = {
    home: <><path d="M3 11l9-8 9 8" /><path d="M5.5 9.5V20h13V9.5" /></>,
    calendar: <><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3.5 9.5h17" /></>,
    inbox: <><path d="M3 13h5l1.6 2.6h4.8L20 13" /><path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z" /></>,
    more: <path d="M4 7h16M4 12h16M4 17h16" />,
  }[name];
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p}</svg>;
}

function Nav({ onCreate, onHome, onCampaigns, active = "home" }) {
  const cell = (key, label, icon, onClick) => {
    const on = active === key;
    return (
      <button key={key} onClick={onClick} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: onClick ? "pointer" : "default", padding: 0, WebkitTapHighlightColor: "transparent" }}>
        <NavIcon name={icon} color={on ? TOKENS.mintDark : "#b3b9b5"} />
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 600, color: on ? TOKENS.mintDark : "#aeb4b0" }}>{label}</span>
      </button>
    );
  };
  return (
    <div style={{ flexShrink: 0, height: 74, borderTop: `1px solid ${TOKENS.line}`, background: "#fff", display: "flex", alignItems: "center", padding: "0 4px 12px" }}>
      {cell("home", "Home", "home", onHome)}
      {cell("campaigns", "Campaigns", "calendar", onCampaigns)}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <button onClick={onCreate} style={{ width: 54, height: 54, borderRadius: 27, border: "none", cursor: "pointer", background: `linear-gradient(150deg, ${TOKENS.mint}, ${TOKENS.mintDark})`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: -20, boxShadow: `0 8px 18px ${TOKENS.mintDark}55`, WebkitTapHighlightColor: "transparent" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 600, color: "#aeb4b0", marginTop: 2 }}>Create</span>
      </div>
      {cell("inbox", "Inbox", "inbox", undefined)}
      {cell("more", "More", "more", undefined)}
    </div>
  );
}

function HomeBase({ onCreate, restaurant, onCampaigns }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fbfcfb" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: TOKENS.sub, marginBottom: 4 }}>{restaurant}</div>
        <h1 style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 26, color: TOKENS.ink, margin: "0 0 18px", letterSpacing: -0.4 }}>Good morning</h1>
        <div style={{ background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 1px 2px rgba(20,30,26,0.03)" }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: TOKENS.mintDark, textTransform: "uppercase", marginBottom: 6 }}>This week</div>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 17, fontWeight: 600, color: TOKENS.ink }}>2 posts going out, 1 needs your okay</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 16, padding: 16, boxShadow: "0 1px 2px rgba(20,30,26,0.03)" }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub }}>World Emoji Day, in 4 weeks</div>
        </div>
      </div>
      <Nav onCreate={onCreate} onCampaigns={onCampaigns} active="home" />
    </div>
  );
}

function CreateList({ planState, onPick, onSomethingElse, onDirect, onPlan }) {
  return (
    <div style={{ padding: "6px 20px 28px" }}>
      <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 27, lineHeight: 1.12, color: TOKENS.ink, margin: "4px 0 20px", letterSpacing: -0.4 }}>What do you want to do?</h1>

      {planState === "new" ? (
        <button onClick={onPlan} style={{ display: "block", textAlign: "left", width: "100%", border: "none", cursor: "pointer", background: grad("nights"), borderRadius: 22, padding: "22px 20px", boxShadow: `0 12px 30px ${G.nights[1]}44`, marginBottom: 28, WebkitTapHighlightColor: "transparent" }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </div>
          <div style={{ marginTop: 15, fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1.3, color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>We noticed</div>
          <div style={{ marginTop: 6, fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 23, fontWeight: 600, color: "#fff", lineHeight: 1.18 }}>You don't have an ongoing plan running yet</div>
          <div style={{ marginTop: 18, height: 50, borderRadius: 25, background: "#fff", color: G.nights[1], fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={G.nights[1]} strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Set up a new plan
          </div>
        </button>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 20, padding: "16px 18px", boxShadow: "0 6px 22px rgba(20,40,32,0.07)", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: 5, background: TOKENS.mint, boxShadow: `0 0 0 3px ${TOKENS.mintTint}` }} />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, color: TOKENS.mintDark, textTransform: "uppercase" }}>Your ongoing plans</span>
            </div>
            <button onClick={onPlan} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: TOKENS.mintDark, WebkitTapHighlightColor: "transparent" }}>Manage</button>
          </div>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 18, fontWeight: 600, color: TOKENS.ink, marginBottom: 13 }}>3 plans, running every week</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {RUNNING_GOALS.map((g) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: grad(g.id), flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: TOKENS.ink }}>{g.name}</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: TOKENS.mint, textTransform: "uppercase", letterSpacing: 0.6 }}>Live</span>
              </div>
            ))}
          </div>
          <button onClick={onPlan} style={{ width: "100%", marginTop: 16, height: 44, borderRadius: 22, border: `1.5px solid ${TOKENS.line}`, cursor: "pointer", background: "#fff", color: TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, WebkitTapHighlightColor: "transparent" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Set up a new plan
          </button>
        </div>
      )}

      <h2 style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 18, fontWeight: 600, color: TOKENS.ink, margin: "0 0 4px" }}>Run a campaign</h2>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.sub, lineHeight: 1.5, margin: "0 0 15px" }}>A one-off promotion, built in minutes. Your menu and data fill in the details, and you can hand it to a marketer anytime.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {CREATE_CARDS.map((c) => (
          <GoalCard key={c.id} goal={c} onClick={() => onPick(c.id)} />
        ))}
        <ElseCard onClick={onSomethingElse} />
      </div>

      <button onClick={onDirect} style={{ width: "100%", marginTop: 18, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: "#f4f6f5", border: "none", borderRadius: 16, padding: "14px 15px", textAlign: "left", WebkitTapHighlightColor: "transparent" }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TOKENS.sub} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.2" /><path d="M3 9.5h18M8 5v14" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: TOKENS.ink }}>Order one piece of content</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginTop: 1 }}>A single reel, post, or email. No full campaign.</div>
        </div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOKENS.faint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}

function CreateHub({ restaurant, onCampaigns, openSheet, onOpenPlan, onSeeAll }) {
  const [open, setOpen] = useState(openSheet === undefined ? true : openSheet);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
      <StatusBar />
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <HomeBase onCreate={() => setOpen(true)} onCampaigns={onCampaigns} restaurant={restaurant} />
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(16,18,21,0.5)", zIndex: 5 }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 10, background: "#fff", borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: "0 -10px 40px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 6 }}>
              <div style={{ width: 38, height: 5, borderRadius: 3, background: "#dfe3e1", margin: "9px auto 2px" }} />
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 16px 12px" }}>
                <button onClick={() => setOpen(false)} style={{ position: "absolute", left: 14, width: 36, height: 36, borderRadius: 18, border: "none", background: "#f1f3f2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
                <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 18, fontWeight: 600, color: TOKENS.ink }}>Create</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                <PlanBrowse restaurant={restaurant} onOpen={onOpenPlan} onSeeAll={onSeeAll} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
/* ============================================================
   Screen: New ongoing plan — pick a goal (by funnel stage)
   ============================================================ */
const ONGOING_GROUPS = [
  { label: "Get found", items: [
    { id: "nearby", title: "Reach new locals", sub: "Get in front of nearby people who haven't been" },
    { id: "reviews", title: "Boost reviews and rating", sub: "More fresh reviews, a higher star" },
  ] },
  { label: "Bring people in", items: [
    { id: "firstvisit", title: "Win first-time visits", sub: "Give new people a reason to come in" },
    { id: "nights", title: "Fill your slow nights", sub: "Drive guests on your quiet days" },
    { id: "orders", title: "Win more online orders", sub: "More delivery and pickup" },
    { id: "catering", title: "Catering and big orders", sub: "Land group and office orders" },
  ] },
  { label: "Keep them coming back", items: [
    { id: "loyalty", title: "Turn first-timers into regulars", sub: "Win the all-important second visit" },
    { id: "winback", title: "Win back past guests", sub: "Reach people who haven't been in a while" },
  ] },
];
const ongoingById = (id) => ONGOING_GROUPS.flatMap((g) => g.items).find((i) => i.id === id);

function PlanPicker({ onBack, onPick }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 20 }}>
          <CircleBtn onClick={onBack}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: TOKENS.faint }}>New plan</div>
        </div>
        <h1 style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 26, lineHeight: 1.1, color: TOKENS.ink, margin: "0 0 8px", letterSpacing: -0.4 }}>What do you want to grow?</h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub, lineHeight: 1.45, margin: "0 0 4px" }}>Pick what matters right now. As your place grows your goals will change, and you can run a few of these at once.</p>
        {ONGOING_GROUPS.map((grp) => (
          <div key={grp.label}>
            <SectionLabel>{grp.label}</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {grp.items.map((g) => <GoalCard key={g.id} goal={g} onClick={() => onPick(g.id)} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanStub({ goalId, onBack }) {
  const g = ongoingById(goalId) || { title: "This plan" };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <StatusBar />
      <div style={{ padding: "4px 20px 0" }}>
        <CircleBtn onClick={onBack}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </CircleBtn>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 30px 40px" }}>
        <div style={{ width: 128, height: 86, borderRadius: 16, background: grad(goalId), display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>{Ill[goalId]}</div>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 23, fontWeight: 600, color: TOKENS.ink, marginBottom: 10 }}>{g.title}</div>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.sub, lineHeight: 1.55, maxWidth: 290, margin: 0 }}>This builder opens here. It works like Fill your slow nights: a few quick questions only you can answer, then your weekly plan, ready to approve.</p>
        <div style={{ marginTop: 18, fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.faint }}>Demo. Fill your slow nights is the one fully built so far.</div>
      </div>
    </div>
  );
}
/* ============================================================
   Screen: Campaigns list  (the saved, trackable work)
   ============================================================ */
const STATUS_META = {
  approve: { label: "Needs your okay", bg: "#fdf1dd", fg: "#c0801c" },
  marketer: { label: "With your marketer", bg: "#eef0ff", fg: "#5b53d6" },
  live: { label: "Live", bg: "#eaf7f3", fg: "#2e9a78" },
  draft: { label: "Draft", bg: "#eef0ee", fg: "#8a908c" },
};
const STATUS_ORDER = { approve: 0, marketer: 1, live: 2, draft: 3 };
const CAMP_SEED = [];
const campById = (id) => CAMP_SEED.find((x) => x.id === id);

function StatusChip({ status }) {
  const s = STATUS_META[status] || {};
  return <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: s.fg, background: s.bg, borderRadius: 8, padding: "4px 8px", whiteSpace: "nowrap" }}>{s.label}</span>;
}

function CampaignCard({ c, onOpen }) {
  return (
    <button onClick={() => onOpen(c.id)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13, background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 16, padding: "13px 14px", cursor: "pointer", WebkitTapHighlightColor: "transparent", boxShadow: "0 1px 2px rgba(20,30,26,0.03)" }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: c.type ? gType(c.type) : grad(c.goal), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.itemId ? <Art id={c.itemId} size={30} /> : null}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: TOKENS.faint, textTransform: "uppercase" }}>{c.kind === "plan" ? "Plan" : "Campaign"}</div>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15.5, fontWeight: 600, color: TOKENS.ink, margin: "2px 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.line}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 9, flexShrink: 0 }}>
        <StatusChip status={c.status} />
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOKENS.faint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>
    </button>
  );
}

function Campaigns({ items = [], onHome, onCreate, onCampaigns, onOpen }) {
  const sorted = [...items].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const needs = sorted.filter((c) => c.status === "approve").length;
  const empty = sorted.length === 0;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fbfcfb" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 20px" }}>
        <h1 style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 26, color: TOKENS.ink, margin: "8px 0 4px", letterSpacing: -0.4 }}>Campaigns</h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub, lineHeight: 1.45, margin: "0 0 18px" }}>{empty ? "Everything you run will show up here." : needs > 0 ? `${needs} ${needs === 1 ? "thing needs" : "things need"} your okay. Nothing goes out until you approve it.` : "Everything you're running, in one place."}</p>
        {empty ? (
          <div style={{ marginTop: 60, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 20px" }}>
            <div style={{ width: 78, height: 78, borderRadius: 22, background: TOKENS.mintTint, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2.5v3M16 2.5v3" /><path d="M8.5 14.5l2.2 2.2 4-4.4" /></svg>
            </div>
            <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 19, fontWeight: 600, color: TOKENS.ink, marginBottom: 7 }}>No campaigns yet</div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.sub, lineHeight: 1.55, maxWidth: 270, margin: "0 0 22px" }}>Pick a plan and we'll build it for you. Once you add it, it lands right here.</p>
            <button onClick={onCreate} style={{ height: 48, padding: "0 24px", borderRadius: 24, border: "none", cursor: "pointer", background: TOKENS.mint, color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>Browse plans</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {sorted.map((c) => <CampaignCard key={c.id} c={c} onOpen={onOpen} />)}
          </div>
        )}
      </div>
      <Nav active="campaigns" onHome={onHome} onCreate={onCreate} onCampaigns={onCampaigns} />
    </div>
  );
}

function CampaignDetail({ camp, onBack }) {
  const c = camp || { name: "This", goal: "nights", status: "draft", kind: "campaign" };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <StatusBar />
      <div style={{ padding: "4px 20px 0" }}>
        <CircleBtn onClick={onBack}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </CircleBtn>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 30px 40px" }}>
        <div style={{ width: 128, height: 84, borderRadius: 16, background: c.type ? gType(c.type) : grad(c.goal), display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>{c.itemId ? <Art id={c.itemId} size={48} /> : Ill[c.goal]}</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.9, color: TOKENS.faint, textTransform: "uppercase", marginBottom: 6 }}>{c.kind === "plan" ? "Plan" : "Campaign"}</div>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 23, fontWeight: 600, color: TOKENS.ink, marginBottom: 12 }}>{c.name}</div>
        <StatusChip status={c.status} />
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.sub, lineHeight: 1.55, maxWidth: 290, margin: "16px 0 0" }}>This opens the {c.kind === "plan" ? "plan" : "campaign"}, where you see each piece, approve what's waiting, and check what's scheduled. The detail view is the next thing to build.</p>
      </div>
    </div>
  );
}
/* ============================================================
   PLAN CATALOG  (DoorDash-style browse)
   ============================================================ */
const TYPE_G = {
  plan: ["#3ec79a", "#2e9a78"],
  content: ["#fb7a4a", "#ef5a2c"],
  email: ["#4a9bf0", "#2f6fd0"],
  task: ["#28b3a6", "#149088"],
  automation: ["#8a5cf0", "#6a39de"],
};
export const gType = (t) => `linear-gradient(135deg, ${(TYPE_G[t] || TYPE_G.plan)[0]}, ${(TYPE_G[t] || TYPE_G.plan)[1]})`;
/** Soft rgba from a catalog hex, for the tinted glow under a card's art tile. */
function hexA(hex, a) {
  const h = String(hex || "#2e9a78").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
/** Google-style star rating. Fills to the REAL rating (partial via a width clip); render
 *  ONLY when a live rating exists — the caller omits it entirely otherwise (never faked). */
function GStars({ value }) {
  const pct = Math.max(0, Math.min(1, (Number(value) || 0) / 5)) * 100;
  const star = "M7 0.6l1.7 3.9 4.2.4-3.2 2.8 1 4.1L7 9.6 3.3 11.8l1-4.1L1.1 4.9l4.2-.4z";
  const row = (fill) => (
    <svg width="74" height="13" viewBox="0 0 74 13" fill={fill} style={{ display: "block" }}>
      {[0, 15, 30, 45, 60].map((x) => <path key={x} d={star} transform={`translate(${x},0.5)`} />)}
    </svg>
  );
  return (
    <span style={{ position: "relative", display: "inline-block", width: 74, height: 13, lineHeight: 0 }}>
      {row("#e3e6e4")}
      <span style={{ position: "absolute", left: 0, top: 0, width: `${pct}%`, height: "100%", overflow: "hidden" }}>{row("#fbbc04")}</span>
    </span>
  );
}

const ICONS = {
  video: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M10 9l5 3-5 3z" /></>,
  story: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.3" /></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.7" /><path d="M5 17l4.5-4 3 2.5L16 11l3.5 4" /></>,
  store: <><path d="M4 9l1.6-4.5h12.8L20 9" /><path d="M5.2 9v9.5h13.6V9" /><path d="M4 9h16" /></>,
  tag: <><path d="M3.5 11l7.5-7.5H18V11l-7.5 7.5z" /><circle cx="14.3" cy="6.7" r="1.3" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4.5 7.5l7.5 5.5 7.5-5.5" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M4 13h16M12 9v11" /><path d="M8.6 9a2.4 2.4 0 1 1 3.4-2.4A2.4 2.4 0 1 1 15.4 9" /></>,
  chat: <><path d="M5 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8.5l-3.5 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M8.5 9.5h7M8.5 12h4" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h3v3M20 14v6M17 20h3" /></>,
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M3 4.5h2.2l2.4 11.5h10l1.9-8H6.2" /></>,
  ticket: <><rect x="3.5" y="6" width="17" height="12" rx="2.2" /><path d="M9.2 6.3v11.4" strokeDasharray="1.6 1.8" /></>,
  bolt: <><path d="M13 3L5 13.5h5.5L9.5 21 19 10h-6z" /></>,
  funnel: <><path d="M4 5h16l-6 7v6.2l-4-2V12z" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="M8 16l3-4 3 2 4-6" /></>,
  pin: <><path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  heart: <><path d="M12 20s-7-4.7-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.3-7 10-7 10z" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M3.5 19c0-3.3 2.5-5.4 5.5-5.4 1.7 0 3.2.7 4.2 1.9" /><path d="M14 19c.4-2.4 1.9-3.9 4-3.9" /></>,
  moon: <><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></>,
  camera: <><rect x="3.5" y="7" width="17" height="12" rx="2.5" /><circle cx="12" cy="13" r="3.3" /><path d="M8.5 7l1.5-2.5h4L15.5 7" /></>,
};
function IconG({ name, size = 26 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ICONS[name] || ICONS.tag}</svg>;
}

const CADENCE_TAG = { once: "One-time", recurring: "Recurring", auto: "Automatic", setup: "Setup", group: "Multi-step" };
function TagPill({ children, accent }) {
  return <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 600, color: accent ? "#b06a16" : "#7c837e", background: accent ? "#fbf0db" : "#f0f2f0", borderRadius: 6, padding: "2.5px 6px", whiteSpace: "nowrap" }}>{children}</span>;
}

const CATALOG = [
  { id: "reach", type: "plan", icon: "pin", title: "Run local ads", sub: "Ads run and tuned for you, plus a reel and post to start", cad: "recurring" },
  { id: "nights", type: "plan", icon: "moon", title: "Fill your slow nights", sub: "Drive guests on your quiet days", cad: "recurring" },
  { id: "firstvisit", type: "plan", icon: "people", title: "Win first-time visits", sub: "Give new people a reason to come in", cad: "recurring" },
  { id: "regulars", type: "plan", icon: "heart", title: "Turn first-timers into regulars", sub: "Win the all-important second visit", cad: "recurring", hot: true },
  { id: "catering", type: "plan", icon: "people", title: "Promote your catering", sub: "1 styled photo, 1 post, 1 outreach email to nearby offices", cad: "once" },
  { id: "reviewsplan", type: "plan", icon: "chat", title: "Boost reviews and rating", sub: "Review-request system set up, plus the first asks", cad: "setup" },

  { id: "reel", type: "content", icon: "video", title: "A short video", sub: "A reel for Instagram and TikTok", cad: "once", hot: true },
  { id: "story", type: "content", icon: "story", title: "A story", sub: "A quick post to stay top of mind", cad: "once" },
  { id: "graphic", type: "content", icon: "image", title: "A social media post", sub: "A designed post: graphic, carousel, or photo", cad: "once" },
  { id: "dish", type: "content", icon: "image", title: "Feature a dish", sub: "Show off one of your best plates", cad: "once", hot: true },
  { id: "edit", type: "content", icon: "video", title: "Edit my footage", sub: "Send us your clips and photos, we cut and polish them", cad: "once" },
  { id: "gpost", type: "content", icon: "store", title: "A Google Business post", sub: "An update on your listing, seen in Search and Maps", cad: "once" },
  { id: "promoevent", type: "content", icon: "ticket", title: "Promote an event", sub: "Fill seats for a night, a holiday, a tasting", cad: "group" },
  { id: "launch", type: "content", icon: "tag", title: "Launch a special", sub: "Roll out a limited-time or seasonal item", cad: "group", season: true },
  { id: "creator", type: "content", icon: "people", title: "Work with a creator", sub: "A local food creator visits and posts to their audience", cad: "once" },

  { id: "welcome", type: "email", icon: "mail", title: "Welcome new subscribers", sub: "Greets every signup automatically, ends with a come-back nudge", cad: "auto" },
  { id: "news", type: "email", icon: "mail", title: "Monthly newsletter", sub: "We write and send one good email every month", cad: "recurring", hot: true },
  { id: "slowoffer", type: "email", icon: "tag", title: "Slow-night offer", sub: "An email and text to fill quiet days", cad: "recurring", hot: true },
  { id: "birthday", type: "email", icon: "gift", title: "Birthday treat", sub: "Set up once, every guest gets a treat automatically", cad: "auto" },
  { id: "earlyaccess", type: "email", icon: "mail", title: "Early access for regulars", sub: "Let your list get first dibs", cad: "once" },

  { id: "shoot", type: "task", icon: "camera", title: "Book a shoot", sub: "A pro comes to you. A photo library plus a reel, yours to keep", cad: "setup" },
  { id: "gbp", type: "task", icon: "store", title: "Polish your Google profile", sub: "Profile fixed top to bottom: photos, hours, menu, info", cad: "setup" },
  { id: "reviewsreply", type: "task", icon: "chat", title: "Reply to reviews", sub: "Every review gets a drafted reply, monthly", cad: "recurring" },
  { id: "qr", type: "task", icon: "qr", title: "Add a table QR", sub: "Design, print files, and a signup page wired to your list", cad: "setup" },
  { id: "friction", type: "task", icon: "cart", title: "Smooth out ordering", sub: "Get the order button working on your Google listing", cad: "setup" },
  { id: "listings", type: "task", icon: "pin", title: "Get listed everywhere", sub: "Yelp, Apple Maps and more: synced and correct", cad: "recurring" },
  { id: "website", type: "task", icon: "store", title: "Fix your website and menu", sub: "Fast, correct, and easy to order from", cad: "setup" },
  { id: "localseo", type: "task", icon: "pin", title: "Show up in local search", sub: "Be the answer when neighbors search food near me", cad: "recurring" },
  { id: "delivery", type: "task", icon: "cart", title: "Tune up your delivery apps", sub: "Photos, menu and hours fixed on your delivery pages", cad: "recurring" },
  { id: "nextdoor", type: "task", icon: "people", title: "Get known on Nextdoor", sub: "Your neighborhood feed, kept active for you", cad: "recurring" },
  { id: "giftcard", type: "task", icon: "gift", title: "Push gift cards", sub: "Sell gift cards for gifts and slow seasons", cad: "once", season: true },
  { id: "ticket", type: "task", icon: "ticket", title: "Run a ticketed event", sub: "Sell spots to a dinner or class", cad: "group" },

  { id: "winback", type: "automation", icon: "heart", title: "Win back quiet guests", sub: "One email and one text to guests you haven't seen lately", cad: "once", hot: true },
  { id: "direct", type: "task", icon: "cart", title: "Get orders direct", sub: "Delivery apps take a cut of every order. Move regulars to direct", cad: "once", hot: true },
];
export const catGet = (id) => CATALOG.find((x) => x.id === id);
// Every card now has its own bespoke builder + price (promoevent got its own
// free-event madlib + playbook). Identity map, kept as a single seam in case a
// future card needs to borrow another's builder.
const buildIdFor = (id) => id;

// Running monthly total across the owner's live plans, surfaced while building so
// recurring commitments never pile up silently (the budget owners' #1 fear). Only
// shows when THIS plan is recurring AND the owner already has live recurring plans;
// otherwise the per-plan price line already says it.
function monthlyTotalLine(itemId, commitment, count, cap = 0) {
  const p = ITEM_PRICES[buildIdFor(itemId)];
  const add = p ? p.perMonth : 0;
  if (add <= 0) return null;
  const total = commitment + add;
  // Soft cap: warn (never block) when this would push the monthly total over the
  // owner's stated budget, even on the first plan.
  if (cap > 0 && total > cap) {
    return { text: `This puts you at $${total}/mo, over your $${cap}/mo budget. You can still add it.`, warn: true };
  }
  if (!commitment || commitment <= 0) return null;
  const plans = count === 1 ? "plan" : "plans";
  return { text: `You're at $${commitment}/mo across ${count} monthly ${plans}. This adds $${add}/mo, for $${total}/mo total.`, warn: false };
}

/* ---- Plan art: detailed scene illustrations (white + accents on the type gradient) ---- */
const STAR = "M0 -5 1.5 -1.6 5 -1.6 2.2 0.7 3.1 4 0 2 -3.1 4 -2.2 0.7 -5 -1.6 -1.5 -1.6Z";
const PIC = {
  reel: (<><rect x="17" y="6" width="22" height="44" rx="6" fill="#fff" /><rect x="20" y="10" width="16" height="30" rx="3" fill="rgba(18,26,24,0.16)" /><circle cx="28" cy="25" r="6.5" fill="#fff" /><path d="M26 21.5l5 3.5-5 3.5z" fill="rgba(18,26,24,0.5)" /><rect x="22" y="43.5" width="12" height="2.4" rx="1.2" fill="rgba(18,26,24,0.16)" /><path d="M41.5 12.6c-1.3-1-2.6-1.8-2.6-3.1a1.5 1.5 0 0 1 2.6-1 1.5 1.5 0 0 1 2.6 1c0 1.3-1.3 2.1-2.6 3.1z" fill="#ff7d7d" /></>),
  story: (<><rect x="17" y="6" width="22" height="44" rx="6" fill="#fff" /><rect x="20" y="15" width="16" height="25" rx="3" fill="rgba(18,26,24,0.16)" /><circle cx="28" cy="11" r="4.4" fill="none" stroke="#ff9166" strokeWidth="2" /><circle cx="28" cy="11" r="1.7" fill="#fff" /><circle cx="28" cy="27" r="4.8" fill="#fff" /><path d="M26.5 24.6l3.6 2.4-3.6 2.4z" fill="rgba(18,26,24,0.42)" /></>),
  carousel: (<><rect x="13" y="13" width="24" height="27" rx="4" fill="rgba(255,255,255,0.45)" transform="rotate(-7 25 26)" /><rect x="19" y="13" width="24" height="27" rx="4" fill="#fff" /><circle cx="26" cy="22" r="2.6" fill="rgba(18,26,24,0.16)" /><path d="M22 36l5-5 3.4 3 4-4 5.6 6z" fill="rgba(18,26,24,0.16)" /><g fill="#fff"><circle cx="25" cy="45.5" r="1.4" /><circle cx="30" cy="45.5" r="1.4" /><circle cx="35" cy="45.5" r="1.4" /></g></>),
  dish: (<><circle cx="28" cy="28" r="17" fill="#fff" /><circle cx="28" cy="28" r="11.5" fill="none" stroke="rgba(18,26,24,0.1)" strokeWidth="1.6" /><circle cx="24.5" cy="26" r="4" fill="#ff9166" /><circle cx="31" cy="25" r="3.2" fill="#6fcf97" /><circle cx="29" cy="31.5" r="3.6" fill="#ffce5b" /><rect x="6" y="19" width="2" height="19" rx="1" fill="#fff" /><rect x="48" y="19" width="2" height="19" rx="1" fill="#fff" /></>),
  listing: (<><path d="M12 22l2.6-7h26.8l2.6 7z" fill="#fff" /><rect x="14" y="22" width="28" height="18" rx="1.5" fill="#fff" /><rect x="24" y="29" width="8" height="11" fill="rgba(18,26,24,0.14)" /><circle cx="39" cy="15" r="7" fill="#6fcf97" /><path d="M39 11.6c-2.1 0-3.7 1.6-3.7 3.7 0 2.6 3.7 6 3.7 6s3.7-3.4 3.7-6c0-2.1-1.6-3.7-3.7-3.7z" fill="#fff" /><circle cx="39" cy="15.3" r="1.7" fill="#6fcf97" /></>),
  offer: (<><rect x="9" y="15" width="38" height="26" rx="5" fill="#fff" /><line x1="28" y1="17" x2="28" y2="39" stroke="rgba(18,26,24,0.14)" strokeWidth="1.6" strokeDasharray="2 2.4" /><text x="18.5" y="34" fontSize="17" fontWeight="800" fill="#ff9166" fontFamily="Inter, sans-serif" textAnchor="middle">%</text><path d={STAR} transform="translate(38,28) scale(.62)" fill="#ffce5b" /></>),
  mail: (<><rect x="6" y="16" width="30" height="22" rx="4" fill="#fff" /><path d="M8 20l13 8.5 13-8.5" fill="none" stroke="rgba(18,26,24,0.18)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M51 13l-15 6.5 5.5 2 1 5.5z" fill="#8cc0ff" /><path d="M51 13l-9 8.4" stroke="rgba(255,255,255,0.65)" strokeWidth="1.4" /></>),
  birthday: (<><rect x="16" y="27" width="24" height="15" rx="3" fill="#fff" /><path d="M16 32.5c2.5 0 2.5 2.4 5 2.4s2.5-2.4 5-2.4 2.5 2.4 5 2.4 2.5-2.4 5-2.4" fill="none" stroke="rgba(18,26,24,0.14)" strokeWidth="1.6" /><rect x="27" y="17" width="2" height="9" rx="1" fill="#ff9166" /><path d="M28 11.5c1.7 1.3 1.7 3.6 0 4.7-1.7-1.1-1.7-3.4 0-4.7z" fill="#ffce5b" /><circle cx="20" cy="21" r="1.5" fill="#8cc0ff" /><circle cx="37" cy="23" r="1.5" fill="#6fcf97" /></>),
  reviews: (<><path d="M11 13h34a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H25l-7 6v-6h-7a3 3 0 0 1-3-3V16a3 3 0 0 1 3-3z" fill="#fff" /><g fill="#ffce5b"><path d={STAR} transform="translate(17,23) scale(.6)" /><path d={STAR} transform="translate(22.7,23) scale(.6)" /><path d={STAR} transform="translate(28.4,23) scale(.6)" /><path d={STAR} transform="translate(34.1,23) scale(.6)" /><path d={STAR} transform="translate(39.8,23) scale(.6)" /></g></>),
  qr: (<><rect x="14" y="8" width="28" height="40" rx="5" fill="#fff" /><rect x="19" y="14" width="7" height="7" rx="1.4" fill="rgba(18,26,24,0.6)" /><rect x="30" y="14" width="7" height="7" rx="1.4" fill="rgba(18,26,24,0.6)" /><rect x="19" y="25" width="7" height="7" rx="1.4" fill="rgba(18,26,24,0.6)" /><rect x="30" y="25" width="3" height="3" fill="rgba(18,26,24,0.6)" /><rect x="34" y="29" width="3" height="3" fill="rgba(18,26,24,0.6)" /><rect x="17" y="38" width="22" height="2.6" rx="1.3" fill="#6fcf97" /></>),
  ordering: (<><rect x="14" y="6" width="28" height="44" rx="6" fill="#fff" /><rect x="18" y="12" width="20" height="5" rx="2.5" fill="rgba(18,26,24,0.1)" /><rect x="18" y="21" width="20" height="5" rx="2.5" fill="rgba(18,26,24,0.1)" /><rect x="18" y="31" width="20" height="7.5" rx="3.75" fill="#6fcf97" /><path d="M25 34.8l2 2 4-4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>),
  ticket: (<><path d="M10 18h36v6.5a3.5 3.5 0 0 0 0 7V38H10v-6.5a3.5 3.5 0 0 0 0-7z" fill="#fff" /><line x1="34" y1="19" x2="34" y2="37" stroke="rgba(18,26,24,0.14)" strokeWidth="1.6" strokeDasharray="2 2.4" /><path d={STAR} transform="translate(20.5,28) scale(.66)" fill="#ffce5b" /></>),
  auto: (<><path d="M28 14a14 14 0 0 1 13 9" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" /><path d="M28 42a14 14 0 0 1-13-9" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" /><path d="M41 17.5v6h-6" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M15 38.5v-6h6" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /><path d={STAR} transform="translate(28,28) scale(.78)" fill="#ffce5b" /></>),
  winback: (<><circle cx="32" cy="20" r="6.5" fill="#fff" /><path d="M20 42c0-7 5.4-11 12-11s12 4 12 11z" fill="#fff" /><path d="M19 25a10 10 0 0 1 9-6.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" /><path d="M19 25l-1.4-5M19 25l5-1.4" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="M14.5 37c-2-1.4-3.4-2.6-3.4-4.2a1.9 1.9 0 0 1 3.4-1.1 1.9 1.9 0 0 1 3.4 1.1c0 1.6-1.4 2.8-3.4 4.2z" fill="#ff7d7d" /></>),
  chart: (<><path d="M11 44V12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /><path d="M11 44h33" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /><rect x="16" y="31" width="6" height="10" rx="2" fill="rgba(255,255,255,0.5)" /><rect x="26" y="25" width="6" height="16" rx="2" fill="rgba(255,255,255,0.72)" /><rect x="36" y="18" width="6" height="23" rx="2" fill="#fff" /><path d="M16 27l9-7 8 4 9-9" fill="none" stroke="#6fcf97" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M42 15v4h-4" stroke="#6fcf97" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>),
  map: (<><circle cx="28" cy="30" r="18" fill="rgba(255,255,255,0.14)" /><circle cx="28" cy="30" r="11" fill="rgba(255,255,255,0.2)" /><path d="M28 13c-5.2 0-9.5 4.2-9.5 9.5C18.5 29.5 28 40 28 40s9.5-10.5 9.5-17.5C37.5 17.2 33.2 13 28 13z" fill="#fff" /><circle cx="28" cy="22.5" r="3.7" fill="#ff9166" /></>),
  night: (<><path d="M33 13a15 15 0 1 0 9.5 26.5A12 12 0 0 1 33 13z" fill="#fff" /><path d={STAR} transform="translate(42,17) scale(.6)" fill="#ffce5b" /><circle cx="20" cy="40" r="1.6" fill="#ffce5b" /></>),
  loyalty: (<><rect x="9" y="16" width="38" height="24" rx="4" fill="#fff" /><path d="M28 25.5c-3-2-5-3.4-5-5.5a2.4 2.4 0 0 1 5-1 2.4 2.4 0 0 1 5 1c0 2.1-2 3.5-5 5.5z" fill="#ff7d7d" /><circle cx="16" cy="34" r="2.2" fill="rgba(18,26,24,0.16)" /><circle cx="23.3" cy="34" r="2.2" fill="rgba(18,26,24,0.16)" /><circle cx="30.6" cy="34" r="2.2" fill="#ff7d7d" /><circle cx="37.9" cy="34" r="2.2" fill="rgba(18,26,24,0.16)" /></>),
  tray: (<><ellipse cx="28" cy="41" rx="20" ry="3.5" fill="rgba(255,255,255,0.3)" /><path d="M10 39a18 10.5 0 0 1 36 0z" fill="#fff" /><rect x="26" y="12" width="4" height="5" rx="2" fill="#fff" /><circle cx="28" cy="11.5" r="2.4" fill="#fff" /><path d="M16.5 33.5a12 7 0 0 1 23 0" fill="none" stroke="rgba(18,26,24,0.1)" strokeWidth="1.6" /></>),
  people: (<><circle cx="26" cy="19" r="8" fill="#fff" /><path d="M12 42c0-8 6.4-13 14-13s14 5 14 13z" fill="#fff" /><circle cx="40" cy="16" r="6.5" fill="#6fcf97" /><path d="M40 12.6v6.8M36.6 16h6.8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></>),
  camera: (<><rect x="8" y="18" width="40" height="24" rx="5" fill="#fff" /><rect x="20" y="12" width="14" height="7" rx="2" fill="#fff" /><circle cx="28" cy="30" r="7.5" fill="rgba(18,26,24,0.16)" /><circle cx="28" cy="30" r="3.6" fill="rgba(18,26,24,0.42)" /><circle cx="41" cy="24" r="1.9" fill="#ffce5b" /></>),
};
const PICK = {
  reach: "map", nights: "night", firstvisit: "people", creator: "people", regulars: "loyalty", catering: "tray",
  reviewsplan: "reviews", reviewsreply: "reviews", reviewreq: "reviews",
  launch: "offer", slowoffer: "offer", giftcard: "offer",
  reel: "reel", videoplan: "reel", story: "story", carousel: "carousel", dish: "dish",
  gpost: "listing", gbp: "listing", listings: "listing", localseo: "map", website: "ordering", delivery: "ordering", nextdoor: "people",
  welcome: "mail", second: "mail", news: "mail", referral: "mail", earlyaccess: "mail",
  birthday: "birthday", shoot: "camera", qr: "qr", friction: "ordering", ticket: "ticket",
  listgrow: "auto", segment: "auto", utm: "chart", winback: "winback", edit: "reel", direct: "ordering",
  graphic: "carousel", promoevent: "ticket",
};
export function Art({ id, size = 62 }) {
  const key = PICK[id] || "offer";
  return <svg viewBox="0 0 56 56" width={size} height={size} fill="none">{PIC[key]}</svg>;
}



const FEATURED = {
  id: "featured", type: "content", icon: "tag", eyebrow: "Tailored for you",
  hook: "Father's Day is this Sunday",
  title: "Bring in more families",
  sub: "Feature your brunch and fill your tables.",
  cad: "group", season: true,
};

const ROWS = [
  { id: "suggested", title: "Suggested for you", note: "Based on your menu and what's coming up", big: true, ids: ["nights", "reach", "gpost", "reviewsreply", "dish", "winback", "slowoffer"] },
  // TWO LAYERS, ONE SYSTEM: section headers say what the campaigns DO (verb-first,
  // across-the-counter words); the funnel-stage words the Home dashboard teaches
  // (Awareness → Interest → Customer actions → Orders → Retention) live as TAGS on
  // each card (planTags + CREATE_CATALOG.stages). So the shelf sells the action and
  // the card names the exact Home number it moves. Rows still key by stage id — the
  // Home funnel's weak-leg deep link (?lens=) lands on the matching shelf unchanged.
  // The goal shelves hold TOOLS AND FIXES (concrete, one price, one job); the big
  // multi-month programs live on their own "Full campaigns" shelf below, so a $70
  // fix never sits next to an $8k system (the audit's price-cliff finding).
  { id: "aware", title: "Get discovered", note: "Set up your profiles and get seen by new people", ids: ["gbp", "listings", "website", "localseo", "nextdoor", "delivery", "creator", "gpost"] },
  { id: "interest", title: "Create interest", note: "Make people want your food once they see you", ids: ["reel", "dish", "story", "graphic", "shoot", "reviewsplan", "reviewsreply"] },
  { id: "actions", title: "Make it easy to order", note: "Working buttons, right info, easy ways to act", ids: ["friction", "direct", "website", "gbp", "qr"] },
  { id: "orders", title: "Fill your seats", note: "Events, deals, and pushes that ring the register", ids: ["promoevent", "launch", "ticket", "catering", "giftcard", "slowoffer"] },
  { id: "back", title: "Bring guests back", note: "Turn one visit into two, three, ten", ids: ["welcome", "news", "birthday", "earlyaccess", "winback", "direct", "qr"] },
  // The heavy hitters, separated on purpose: multi-month programs we run end to end.
  { id: "programs", title: "Full campaigns", note: "We plan it, make it, and run it for you, month after month", ids: ["firstvisit", "nights", "regulars", "reach"] },
  // Production-only shelf: shoots, edits, and single pieces bought as GOODS, not
  // campaigns — no outcome promise, no tracking, the deliverable is the product.
  { id: "content", title: "Just need content", note: "Shoots, edits, and pieces. No campaign, just the goods", ids: ["shoot", "edit", "reel", "story", "graphic", "dish", "gpost"] },
];

// Lenses mirror the rows: filter by what the owner wants done. "all" is the full browse.
const LENS_CHIPS = [
  { id: "all", label: "All" },
  { id: "aware", label: "Get discovered" },
  { id: "interest", label: "Create interest" },
  { id: "actions", label: "Easy to order" },
  { id: "orders", label: "Fill seats" },
  { id: "back", label: "Bring back" },
  { id: "programs", label: "Full campaigns" },
  { id: "content", label: "Just content" },
];

// Which funnel legs each item genuinely moves (audited per real composed lines) —
// from the single-source catalog, shown as tags in Home's own stage words so a
// card answers "which of my numbers does this move" at a glance.
const ITEM_STAGES = Object.fromEntries(CREATE_CATALOG.map((c) => [c.id, c.stages || []]));

function planTags(p) {
  const t = [];
  // Price split into plain parts instead of one dense "$X + $Y/mo" string (the owner's
  // "hard to understand" flag): what you pay once reads "Setup $X", what repeats reads
  // "$Y/mo". Creative work scales with scope, so its price is a floor: "Starting $X".
  const pr = ITEM_PRICES[buildIdFor(p.id)];
  const creative = p.type === "content" || p.id === "shoot";
  let priceSaysCadence = false;
  if (pr && (pr.oneTime > 0 || pr.perMonth > 0)) {
    if (pr.oneTime > 0 && pr.perMonth > 0) {
      t.push({ label: `Setup $${pr.oneTime.toLocaleString()}`, accent: true });
      t.push({ label: `$${pr.perMonth.toLocaleString()}/mo`, accent: true });
      priceSaysCadence = p.cad === "recurring";
    } else if (pr.perMonth > 0) {
      t.push({ label: `$${pr.perMonth.toLocaleString()}/mo`, accent: true });
      priceSaysCadence = p.cad === "recurring";
    } else {
      t.push({ label: creative ? `Starting $${pr.oneTime.toLocaleString()}` : `$${pr.oneTime.toLocaleString()} one time`, accent: true });
      priceSaysCadence = p.cad === "once";
    }
  }
  // Skip the cadence chip when the price chip already says it ("$165/mo" + "Recurring"
  // was double-telling); keep it for the cadences a price can't express (auto/setup/group).
  if (!priceSaysCadence) t.push({ label: CADENCE_TAG[p.cad] || "Plan" });
  for (const s of ITEM_STAGES[p.id] || []) t.push({ label: STAGE_TAG_LABEL[s] || s });
  if (p.season) t.push({ label: "Seasonal", accent: true });
  return t;
}

function PlanCardV({ p, onOpen, full }) {
  return (
    <button onClick={() => onOpen(p.id)} style={{ flexShrink: full ? undefined : 0, width: full ? "100%" : 156, textAlign: "left", background: "#fff", border: "none", borderRadius: 16, cursor: "pointer", WebkitTapHighlightColor: "transparent", padding: 0, boxShadow: "0 1px 3px rgba(20,30,26,0.06), 0 0 0 1px rgba(20,30,26,0.05)" }}>
      <div style={{ position: "relative", height: 90, background: gType(p.type), display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
        <div style={{ position: "absolute", width: 110, height: 110, borderRadius: 55, background: "rgba(255,255,255,0.12)", bottom: -36, right: -24 }} />
        <div style={{ position: "absolute", width: 60, height: 60, borderRadius: 30, background: "rgba(0,0,0,0.05)", bottom: -22, left: -16 }} />
        <div style={{ position: "relative", display: "flex" }}><Art id={p.id} size={62} /></div>
      </div>
      <div style={{ padding: "10px 11px 12px" }}>
        {/* Fixed 2-line blocks + a fixed tag band = every card in a row lands the same height. */}
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 13.5, fontWeight: 600, color: TOKENS.ink, lineHeight: 1.2, marginBottom: 3, height: 33, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.title}</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: TOKENS.sub, lineHeight: 1.35, marginBottom: 8, height: 30, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.sub}</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignContent: "flex-start", height: 44, overflow: "hidden" }}>{planTags(p).map((t, i) => <TagPill key={i} accent={t.accent}>{t.label}</TagPill>)}</div>
      </div>
    </button>
  );
}

function PlanCardH({ p, onOpen }) {
  return (
    <button onClick={() => onOpen(p.id)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13, background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 15, padding: "11px 13px", cursor: "pointer", WebkitTapHighlightColor: "transparent", boxShadow: "0 1px 2px rgba(20,30,26,0.03)" }}>
      <div style={{ width: 50, height: 50, borderRadius: 13, background: gType(p.type), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Art id={p.id} size={34} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14.5, fontWeight: 600, color: TOKENS.ink, marginBottom: 2 }}>{p.title}</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.sub}</div>
        <div style={{ display: "flex", gap: 5 }}>{planTags(p).map((t, i) => <TagPill key={i} accent={t.accent}>{t.label}</TagPill>)}</div>
      </div>
    </button>
  );
}

function PlanCardBig({ p, onOpen, full }) {
  // Sized so TWO suggested cards fit a 375px phone fully (2×160 + 12 gap + 40 padding =
  // 372): the "Suggested for you" row must read as a choice, not a single verdict.
  // Title/sub are clamped to fixed 2-line blocks and the tag area to a fixed band so
  // every card in the row lands at the same height regardless of copy length.
  const clamp2 = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };
  return (
    <button onClick={() => onOpen(p.id)} style={{ flexShrink: full ? undefined : 0, width: full ? "100%" : 160, textAlign: "left", background: "#fff", border: "none", borderRadius: 18, cursor: "pointer", WebkitTapHighlightColor: "transparent", padding: 0, boxShadow: "0 3px 10px rgba(20,30,26,0.07), 0 0 0 1px rgba(20,30,26,0.05)" }}>
      <div style={{ position: "relative", height: 96, background: gType(p.type), display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderTopLeftRadius: 18, borderTopRightRadius: 18 }}>
        <div style={{ position: "absolute", width: 120, height: 120, borderRadius: 60, background: "rgba(255,255,255,0.12)", bottom: -40, right: -26 }} />
        <div style={{ position: "absolute", width: 70, height: 70, borderRadius: 35, background: "rgba(0,0,0,0.05)", bottom: -24, left: -18 }} />
        <div style={{ position: "relative", display: "flex" }}><Art id={p.id} size={64} /></div>
      </div>
      <div style={{ padding: "11px 12px 12px" }}>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14, fontWeight: 600, color: TOKENS.ink, lineHeight: 1.2, marginBottom: 3, height: 34, ...clamp2 }}>{p.title}</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: TOKENS.sub, lineHeight: 1.35, marginBottom: 8, height: 30, ...clamp2 }}>{p.sub}</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignContent: "flex-start", height: 44, overflow: "hidden" }}>{planTags(p).map((t, i) => <TagPill key={i} accent={t.accent}>{t.label}</TagPill>)}</div>
      </div>
    </button>
  );
}

function CategoryRow({ row, onOpen, onSeeAll }) {
  const items = row.ids.map(catGet).filter(Boolean);
  const big = row.big;
  return (
    <div style={{ marginBottom: big ? 26 : 22 }}>
      <button onClick={() => onSeeAll(row.id)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "0 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", WebkitTapHighlightColor: "transparent" }}>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: big ? 21 : 18.5, fontWeight: 600, color: TOKENS.ink, letterSpacing: -0.3 }}>{row.title}</div>
          {row.note && <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: TOKENS.faint, marginTop: 1 }}>{row.note}</div>}
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.sub} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      <div className="apnosh-row" style={{ display: "flex", gap: 12, overflowX: "auto", padding: "2px 20px", scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
        {items.map((p) => big ? <PlanCardBig key={p.id} p={p} onOpen={onOpen} /> : <PlanCardV key={p.id} p={p} onOpen={onOpen} />)}
        <button onClick={() => onSeeAll(row.id)} style={{ flexShrink: 0, width: big ? 110 : 92, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent" }}>
          <div style={{ width: 46, height: 46, borderRadius: 23, background: "#eef1ef", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </div>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: TOKENS.ink }}>View all</span>
        </button>
      </div>
    </div>
  );
}

function RecFeatured({ item, reason, onOpen, onDismiss }) {
  const GRAD = "linear-gradient(135deg, #25c2a0, #2f72d6)";
  const INK = "#2660c4";
  if (!item) return null;
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: GRAD, boxShadow: "0 10px 24px rgba(47,114,214,0.3)" }}>
        <button onClick={onDismiss} aria-label="Dismiss" style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 14, border: "none", background: "rgba(255,255,255,0.22)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, WebkitTapHighlightColor: "transparent" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <button onClick={() => onOpen(item.id)} style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", padding: "15px 16px 16px", background: "none", WebkitTapHighlightColor: "transparent" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" /></svg>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>Recommended for you</span>
          </div>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 21, fontWeight: 600, color: "#fff", lineHeight: 1.15, marginBottom: 6, paddingRight: 24 }}>{item.title}</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.92)", lineHeight: 1.4, marginBottom: 14 }}>{reason || item.sub}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: 19, background: "#fff", color: INK, fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14.5, fontWeight: 600 }}>
            Start this
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </div>
        </button>
      </div>
    </div>
  );
}

function FeaturedCard({ onOpen, onDismiss }) {
  const GRAD = "linear-gradient(135deg, #25c2a0, #2f72d6)";
  const INK = "#2660c4";
  // Drive off the real calendar so it never shows a holiday that already passed.
  const moment = getMarketingCalendar(new Date(), 75).find((m) => daysUntil(m.date) >= 0 && m.weight >= 3);
  const days = moment ? daysUntil(moment.date) : 0;
  const hook = moment ? (days <= 1 ? `${moment.label} is here` : `${moment.label} is in ${days} days`) : "A timely idea for you";
  const title = moment ? `Make the most of ${moment.label}` : "Promote your next big moment";
  const sub = moment ? moment.hook : "Fill seats for a night, a holiday, or a tasting.";
  const cta = moment ? `Plan for ${moment.label}` : "Plan an event";
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: GRAD, boxShadow: "0 10px 24px rgba(47,114,214,0.3)" }}>
        <button onClick={onDismiss} aria-label="Dismiss" style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 14, border: "none", background: "rgba(255,255,255,0.22)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, WebkitTapHighlightColor: "transparent" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <button onClick={() => onOpen("promoevent")} style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", padding: "15px 16px 16px", background: "none", WebkitTapHighlightColor: "transparent" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: "#fff" }}>{hook}</span>
          </div>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 21, fontWeight: 600, color: "#fff", lineHeight: 1.15, marginBottom: 6, paddingRight: 24 }}>{title}</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.92)", lineHeight: 1.4, marginBottom: 14 }}>{sub}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: 19, background: "#fff", color: INK, fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14.5, fontWeight: 600 }}>
            {cta}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </div>
        </button>
      </div>
    </div>
  );
}

function SearchBar({ value, onChange }) {
  return (
    <div style={{ padding: "0 20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 46, borderRadius: 14, background: "#f1f3f2", padding: "0 14px" }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={TOKENS.sub} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" /></svg>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search plans, like reel or win back" style={{ flex: 1, border: "none", background: "none", outline: "none", fontFamily: "Inter, sans-serif", fontSize: 14.5, color: TOKENS.ink }} />
        {value && <button onClick={() => onChange("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={TOKENS.faint} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
      </div>
    </div>
  );
}

function PlanBrowse({ restaurant, onOpen, onSeeAll, recommended, recsLoading, initialLens }) {
  const [q, setQ] = useState("");
  const [featHidden, setFeatHidden] = useState(false);
  // A funnel-stage deep link (Home's weak-leg tap) lands with its shelf pre-filtered.
  const [lens, setLens] = useState(() => (initialLens && LENS_CHIPS.some((c) => c.id === initialLens) ? initialLens : "all"));
  const query = q.trim().toLowerCase();
  const results = query ? CATALOG.filter((p) => (p.title + " " + p.sub + " " + p.type + " " + (CADENCE_TAG[p.cad] || "")).toLowerCase().includes(query)) : [];
  // AI recommendations (fetched by the wrapper): drive the featured card + the
  // "Suggested for you" row when present; otherwise the static defaults show.
  const recList = (recommended || []).filter((r) => r && catGet(r.id));
  const recFeatured = recList[0] ? { item: catGet(recList[0].id), reason: recList[0].reason } : null;
  const recRowIds = recList.slice(recFeatured ? 1 : 0).map((r) => r.id);
  const rows = recRowIds.length
    ? ROWS.map((row) => (row.id === "suggested" ? { ...row, ids: recRowIds, note: "Picked for your goals and reviews" } : row))
    : ROWS;
  return (
    <div style={{ paddingBottom: 26 }}>
      <style>{`.apnosh-row::-webkit-scrollbar{display:none}`}</style>
      <div style={{ paddingTop: 6 }}><SearchBar value={q} onChange={setQ} /></div>
      <div style={{ padding: "0 20px 14px" }}><div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.faint, lineHeight: 1.4 }}>Prices are estimates. You approve before anything runs, and you only pay when each piece ships.</div></div>
      {!query && recsLoading && !recFeatured && (
        <div style={{ padding: "0 20px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: TOKENS.mintTint, border: `1px solid ${TOKENS.line}`, borderRadius: 12, padding: "9px 13px" }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, border: `2px solid rgba(0,0,0,0.12)`, borderTopColor: TOKENS.mintDark, animation: "aspin 0.8s linear infinite", flexShrink: 0 }} />
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub }}>Finding your best picks from your goals and reviews</span>
          </div>
        </div>
      )}
      {query ? (
        <div style={{ padding: "0 20px" }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, marginBottom: 12 }}>{results.length} {results.length === 1 ? "plan" : "plans"} for "{q}"</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {results.map((p) => <PlanCardV key={p.id} p={p} onOpen={onOpen} full />)}
          </div>
          {results.length === 0 && <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.faint, padding: "10px 0" }}>Nothing matches yet. Try a word like video, email, or reviews, or describe it with Something else.</div>}
        </div>
      ) : (
        <>
          <div className="apnosh-row" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 20px 16px" }}>
            {LENS_CHIPS.map((c) => { const on = lens === c.id; return (
              <button key={c.id} onClick={() => setLens(c.id)} style={{ flexShrink: 0, height: 34, padding: "0 14px", borderRadius: 17, border: on ? "none" : `1px solid ${TOKENS.line}`, background: on ? TOKENS.ink : "#fff", color: on ? "#fff" : TOKENS.sub, fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>{c.label}</button>
            ); })}
          </div>
          {lens === "all" ? (
            <>
              {!featHidden && (recFeatured
                ? <RecFeatured item={recFeatured.item} reason={recFeatured.reason} onOpen={onOpen} onDismiss={() => setFeatHidden(true)} />
                : <FeaturedCard onOpen={onOpen} onDismiss={() => setFeatHidden(true)} />)}
              {rows.map((row) => <CategoryRow key={row.id} row={row} onOpen={onOpen} onSeeAll={onSeeAll} />)}
            </>
          ) : (() => {
            const row = ROWS.find((r) => r.id === lens);
            const items = row ? row.ids.map(catGet).filter(Boolean) : [];
            return (
              <div style={{ padding: "0 20px 6px" }}>
                <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, color: TOKENS.ink, marginBottom: 3 }}>{row ? row.title : ""}</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, marginBottom: 14 }}>{items.length} {items.length === 1 ? "play" : "plays"} for this goal</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {items.map((p) => <PlanCardV key={p.id} p={p} onOpen={onOpen} full />)}
                </div>
              </div>
            );
          })()}
          <div style={{ padding: "4px 20px 0" }}>
            <button onClick={() => onOpen("__else")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, cursor: "pointer", background: "#fff", border: `1.5px dashed ${TOKENS.dash}`, borderRadius: 14, padding: "14px 15px", WebkitTapHighlightColor: "transparent" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TOKENS.sub} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: TOKENS.ink }}>Don't see it? Describe your own</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: TOKENS.sub, marginTop: 1 }}>Tell us in your words and we'll draft it</div>
              </div>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOKENS.faint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CategoryAll({ rowId, onBack, onOpen }) {
  const row = ROWS.find((r) => r.id === rowId) || { title: "Plans", ids: [] };
  const items = row.ids.map(catGet).filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 18 }}>
          <CircleBtn onClick={onBack}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 19, fontWeight: 600, color: TOKENS.ink }}>{row.title}</div>
        </div>
        {/* Every see-all view is the same two-up grid — including Suggested, which
            used to stack full-width cards (one per row read as a verdict, not a browse). */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {items.map((p) => <PlanCardV key={p.id} p={p} onOpen={onOpen} full />)}
        </div>
      </div>
    </div>
  );
}

const DETAIL_HOW = {
  plan: "A few pieces working together, made and scheduled each week. You approve what goes out.",
  content: "We write it, design it, and schedule it. You approve before anything posts.",
  email: "We write it and send it to the right people. You always approve first.",
  task: "We set it up for you and check with you before anything changes.",
  automation: "We set it up once. After that it runs on its own, and you can pause anytime.",
};
const DETAIL_GET = {
  plan: ["A few pieces every week", "Made, scheduled, and tracked", "Your okay before anything goes out"],
  content: ["The content made for you", "Caption and a posting time", "Your okay before it posts"],
  email: ["The message written for you", "Sent to the right people", "Your okay before it sends"],
  task: ["We handle the setup", "A quick check with you", "Done without the hassle"],
  automation: ["Set up once, runs itself", "Works in the background", "Pause or change it anytime"],
};

function PlanDetail({ itemId, onBack, onAdd, onMarketer }) {
  const p = itemId === "featured" ? FEATURED : (catGet(itemId) || CATALOG[0]);
  const how = DETAIL_HOW[p.type] || DETAIL_HOW.plan;
  const get = DETAIL_GET[p.type] || DETAIL_GET.plan;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative", background: gType(p.type), padding: "16px 20px 26px" }}>
          <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 18, border: "none", background: "rgba(255,255,255,0.25)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div style={{ marginTop: 16, width: 56, height: 56, borderRadius: 16, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><Art id={p.id} size={40} /></div>
          {p.hook && <div style={{ marginTop: 14, fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{p.hook}</div>}
          <div style={{ marginTop: p.hook ? 3 : 14, fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 25, fontWeight: 600, color: "#fff", lineHeight: 1.12 }}>{p.title}</div>
          <div style={{ marginTop: 7, fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "rgba(255,255,255,0.92)", lineHeight: 1.45 }}>{p.sub}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 13 }}>{planTags(p).map((t, i) => <span key={i} style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.22)", borderRadius: 7, padding: "3px 8px" }}>{t.label}</span>)}</div>
        </div>
        <div style={{ padding: "20px 20px 10px" }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: TOKENS.ink, marginBottom: 8 }}>How it works</div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.sub, lineHeight: 1.5, margin: "0 0 22px" }}>{how}</p>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: TOKENS.ink, marginBottom: 11 }}>What you get</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {get.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, background: TOKENS.mintTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink }}>{g}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: "12px 20px 22px", borderTop: `1px solid ${TOKENS.line}`, background: "#fff" }}>
        <button onClick={onAdd} style={{ width: "100%", height: 52, borderRadius: 26, border: "none", cursor: "pointer", background: TOKENS.mint, color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>Add this plan</button>
        <button onClick={onMarketer} style={{ width: "100%", height: 48, marginTop: 9, borderRadius: 24, border: `1.5px solid ${TOKENS.line}`, cursor: "pointer", background: "#fff", color: TOKENS.ink, fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14.5, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>Hand it to a marketer</button>
      </div>
    </div>
  );
}
function FeaturedDetail({ onClose, onEvent, onDeal, onPost }) {
  const opt = (paths, title, sub, onClick) => (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 15, padding: "13px 15px", cursor: "pointer", textAlign: "left", marginBottom: 11, WebkitTapHighlightColor: "transparent", boxShadow: "0 1px 2px rgba(20,30,26,0.03)" }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: TOKENS.mintTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15.5, fontWeight: 600, color: TOKENS.ink, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, marginTop: 2 }}>{sub}</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.faint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 28px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 2, marginBottom: 6 }}>
          <button onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 18, border: "none", background: "#eef1ef", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div style={{ display: "flex", gap: 15, alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ width: 62, borderRadius: 14, background: "#fff", border: `1px solid ${TOKENS.line}`, overflow: "hidden", flexShrink: 0, textAlign: "center" }}>
            <div style={{ background: gType("plan"), color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, padding: "4px 0" }}>JUN</div>
            <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 27, fontWeight: 600, color: TOKENS.ink, lineHeight: 1.5 }}>21</div>
          </div>
          <div style={{ flex: 1, paddingTop: 2 }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: TOKENS.mintDark, marginBottom: 2 }}>This Sunday</div>
            <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 24, fontWeight: 600, color: TOKENS.ink, lineHeight: 1.1 }}>Father's Day</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.sub, marginTop: 3 }}>Sunday, Jun 21</div>
          </div>
        </div>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.sub, lineHeight: 1.5, margin: "0 0 20px" }}>Dads get taken out, and brunch fills up. Decide if you want to make a thing of it, or just say hello.</p>
        {opt(<><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 9h16M9 3v4M15 3v4" /></>, "Plan a Father's Day brunch", "We fill the seats. A full plan.", onEvent)}
        {opt(<><path d="M3.5 11l7.5-7.5H18V11l-7.5 7.5z" /><circle cx="14.3" cy="6.7" r="1.3" /></>, "Run a Father's Day special", "A limited-time offer. A full plan.", onDeal)}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "3px 0 14px" }}>
          <div style={{ flex: 1, height: 1, background: TOKENS.line }} />
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.faint }}>or keep it simple</span>
          <div style={{ flex: 1, height: 1, background: TOKENS.line }} />
        </div>
        {opt(<><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.7" /><path d="M5 17l4.5-4 3 2.5L16 11l3.5 4" /></>, "Just post a graphic", "One post for the day. No campaign.", onPost)}
      </div>
    </div>
  );
}
/* ============================================================
   Product page (the sell) — between tapping a card and the madlib.
   One template for all 34 cards: art band, stage + cadence chips,
   promise, a personalized "why this, for you" (real signals via
   whyFor, authored fallback otherwise), what-you-get rows DERIVED
   from the item's real composition (whatYouGet), a who-does-it
   picker for versioned items (today: gbp's doer slot — the choice
   flows into the madlib so it is never asked twice), an honest
   expectation line, and a Continue CTA with the existing price.
   ============================================================ */

/** An item "has versions" when its madlib carries a doer slot (who does the work).
 *  Derived from QL so a future versioned item renders the picker automatically. */
const doerSlotFor = (itemId) => (QL[itemId] && QL[itemId].slots && QL[itemId].slots.doer) || null;

/** The gbp lane a doer option string encodes. MUST match gbpLaneFromDoer in the adapter
 *  (that is the source of truth for what each lane MEANS; this only mirrors the decode so
 *  the UI can label + gate the same three strings). */
function gbpLaneOf(opt) {
  const s = String(opt || "").toLowerCase();
  if (/apnosh ai|with ai\b/.test(s)) return "ai";
  if (/myself|yourself|by you\b|step by step/.test(s)) return "diy";
  return "team";
}

/** Pretty display for a doer option string. The three gbp lanes get plain, tier-aware copy;
 *  the AI lane carries a PRO badge and, for non-Pro owners, an "Included in Pro" sub + no price
 *  (the row still selects — the Continue CTA becomes Upgrade to Pro). Falls back to the raw string. */
function doerDisplay(opt, tier) {
  const lane = gbpLaneOf(opt);
  if (lane === "diy") return { lane, title: "I'll do it myself", sub: "Free. We show you what to fix.", price: "Free", pro: false };
  if (lane === "ai") {
    const pro = isProTier(tier);
    return { lane, title: "Do it with Apnosh AI", sub: pro ? "Free on your plan. AI writes each fix." : "Included in Pro.", price: pro ? "Free" : null, pro: true };
  }
  const m = String(opt).match(/\$\s?([\d,]+)/);
  return { lane, title: "Apnosh does it", sub: "We fix it all for you.", price: m ? `$${m[1]}` : null, pro: false };
}

/** Compact presentation of a doer option for the SEGMENTED (tab) version picker: a SHORT name and
 *  a comparable price (all three read at a glance), the PRO flag for the AI tab, and a plain detail
 *  line shown for the SELECTED tab only. Same three lanes + Pro gate as doerDisplay — this only
 *  reshapes the copy for a tab. Sentence case, 5th-grade plain, no em dashes. */
function doerTab(opt, tier) {
  const lane = gbpLaneOf(opt);
  if (lane === "diy") return { lane, short: "I'll do it", price: "Free", pro: false, detail: "You do it yourself. We show you what to fix." };
  if (lane === "ai") {
    const pro = isProTier(tier);
    return { lane, short: "Apnosh AI", price: "Free", pro: true, detail: pro ? "Apnosh AI writes each fix for you." : "Included in the Pro plan." };
  }
  const m = String(opt).match(/\$\s?([\d,]+)/);
  return { lane, short: "Apnosh", price: m ? `$${m[1]}` : null, pro: false, detail: "We fix it all for you." };
}

/** The CTA's price label. Reuses ITEM_PRICES/priceLabel; the only extra rule mirrors
 *  planTags exactly: creative work prices as a floor ("Starting $X"). Either owner-run gbp
 *  lane (diy or ai) reads Free, matching the madlib's own free line. */
function pdpPrice(p, doer) {
  const lane = doer ? gbpLaneOf(doer) : null;
  if (lane === "diy" || lane === "ai") return "Free";
  const pr = ITEM_PRICES[buildIdFor(p.id)];
  const creative = p.type === "content" || p.id === "shoot";
  if (creative && pr && pr.oneTime > 0 && !(pr.perMonth > 0)) return `Starting $${pr.oneTime.toLocaleString()}`;
  return priceLabel(buildIdFor(p.id));
}

/* ---- gbp DIAGNOSIS-led product page (gbp card only) ----
   The gbp PDP swaps its generic "why this" + "what you get" for the owner's
   REAL Google-profile status, read from /api/dashboard/gbp-diagnosis. Three
   states (decideGbpState): A = real gaps, B = all good, C = honest fallback
   (render today's generic template — never fake a gap or an all-good). */
const GBP_AMBER = { ink: "#854f0b", bg: "#fdf6e9", line: "#f0dfb8", body: "#5c4a2a", soft: "#7a6534", chip: "#f6e8c9" };
const GBP_GREEN = { line: "#cdeae0", body: "#3f7d6a", chip: "#d3efe6" };

/** Short, plain gap phrase for one problem section, keyed by (key, status). Every phrase is
 *  traceable to a real section that graded 'missing' or 'needs-work' in the live payload — we
 *  never invent a gap. Unknown keys fall back to the section's own honest label so a new
 *  diagnosis section can never crash or fabricate copy. */
const GBP_GAP_PHRASE = {
  hours: { missing: "Your hours are not on Google", "needs-work": "Some days are missing hours" },
  categories: { missing: "Your main category is not set", "needs-work": "Add more categories to be found" },
  description: { missing: "You have no description yet", "needs-work": "Your description is too short" },
  photos: { missing: "You have no photos on Google", "needs-work": "Your photos need a refresh" },
  menu: { missing: "Your menu is not on Google", "needs-work": "Your menu needs work" },
  links: { missing: "No website or phone on Google", "needs-work": "Your website or phone is missing" },
};
function gbpGapPhrase(section) {
  const byKey = GBP_GAP_PHRASE[section && section.key];
  const phrase = byKey && byKey[section.status];
  if (phrase) return phrase;
  return `${(section && section.label) || "This part"} needs work`;
}

/** Decide the gbp PDP state from the live diagnosis payload. HONEST BY CONSTRUCTION:
 *  A only from real problem sections for THIS client, B only when the read genuinely
 *  succeeded and EVERY section is 'good', everything else (loading, not connected,
 *  readFailed, partial read with no conclusive problems, error) → C fallback. */
function decideGbpState(itemId, diag) {
  if (itemId !== "gbp" || !diag || diag.error) return { state: "C", problems: [], sectionCount: 0 };
  const connected = diag.connected === true && diag.readFailed !== true;
  const sections = Array.isArray(diag.sections) ? diag.sections : [];
  if (!connected || sections.length === 0) return { state: "C", problems: [], sectionCount: 0 };
  const problems = sections.filter((s) => s && (s.status === "needs-work" || s.status === "missing"));
  if (problems.length >= 1) return { state: "A", problems, sectionCount: sections.length };
  // No problems: only claim "all good" when the read is COMPLETE (every section 'good').
  // A partial read (some 'unknown') with no problems cannot claim completeness → fallback.
  if (sections.every((s) => s && s.status === "good")) return { state: "B", problems: [], sectionCount: sections.length };
  return { state: "C", problems: [], sectionCount: sections.length };
}

/* ============================================================
   Section 1 — the product page as an Amazon+Fiverr shop: sell → pick a version →
   add priced options → see when you'll have it → cross-sell + a buy box. Every
   option, price, deliverable, and time traces to REAL catalog/pricing data. No
   invented options, prices, deliverables, or numbers.
   ============================================================ */

/** REAL, curated add-on services per card. Every id is a real catalog serviceId — the option row
 *  reads its label, price, and deliverables straight from the catalog (serviceById), so we never
 *  invent an option, a price, or a deliverable. A card not listed here honestly shows NO options.
 *  Each id is a genuine ADJACENT service, never the card's own already-included service. */
const CARD_OPTIONS = {
  gbp: ["gbp-posts", "review-responses"],
  gpost: ["gbp-posts"],
  reviewsplan: ["review-responses"],
};

/** cadence-aware price-delta label for one option row (e.g. "+$85/mo", "+$120"). */
function optionDelta(s) {
  const { price, cadence } = cadenceOf(s);
  if (cadence.kind === "recurring") return `+$${price.toLocaleString()}/mo`;
  if (cadence.kind === "per-occurrence") return `+$${price.toLocaleString()} each`;
  return `+$${price.toLocaleString()}`;
}
function optionIsRecurring(s) { return cadenceOf(s).cadence.kind === "recurring"; }

/** Sum selected options into {oneTime, perMonth} from each service's REAL catalog price. */
function optionsMoney(ids) {
  let oneTime = 0, perMonth = 0;
  for (const id of ids) {
    const s = serviceById(id); if (!s) continue;
    const { price, cadence } = cadenceOf(s);
    if (cadence.kind === "recurring") perMonth += price; else oneTime += price;
  }
  return { oneTime, perMonth };
}

/** Plain money label for a {oneTime, perMonth} pair ("$365 + $250/mo", "$250/mo", "Free"). */
function moneyLabel(oneTime, perMonth) {
  const parts = [];
  if (oneTime > 0) parts.push(`$${oneTime.toLocaleString()}`);
  if (perMonth > 0) parts.push(`$${perMonth.toLocaleString()}/mo`);
  return parts.length ? parts.join(" + ") : "Free";
}

/* Minimal local plan-draft store (Section 1). COLLECT-ONLY: it saves the owner's picks to
   localStorage so nothing is lost, but ships and bills NOTHING. Section 2 formalizes the cart. */
const PLAN_DRAFT_KEY = "apnosh-plan-draft-v1";
function addToPlanDraft(entry) {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_DRAFT_KEY) || "[]");
    const list = Array.isArray(raw) ? raw : [];
    list.push(entry);
    localStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(list));
    return true;
  } catch { return false; }
}

/** An honest, clearly-labeled delivery estimate for the selected config. Uses the REAL
 *  service-turnaround data where we have it (gbp's setup window + Google's own review gate),
 *  else a plain range from the card's cadence. Owner-run gbp lanes have no work order. */
function configTimeline(p, gbpLane, optionIds) {
  const lines = [];
  if (gbpLane === "diy" || gbpLane === "ai") {
    lines.push("You can start today and go at your own pace.");
  } else if (p.id === "gbp") {
    const t = SERVICE_TURNAROUND["gbp-setup"];
    lines.push(`Most of your profile is fixed in about ${etaLabelFor("gbp-setup")} after you approve.`);
    if (t && t.gate && t.gate.note) lines.push(t.gate.note);
  } else {
    const byCad = {
      setup: "About 1 to 2 weeks after you approve.",
      once: "About 3 to 7 days after you approve.",
      group: "Built around the date you pick.",
      recurring: "Starts within about a week, then runs on its own.",
      auto: "Set up in a few days, then runs on its own.",
    };
    lines.push(byCad[p.cad] || "About 1 week after you approve.");
  }
  for (const id of optionIds) {
    const s = serviceById(id); if (!s || !optionIsRecurring(s)) continue;
    const t = SERVICE_TURNAROUND[id];
    if (t && t.class === "recurring") lines.push(`${plainNameOf(s)} starts within ${t.startsWithin.min} to ${t.startsWithin.max} days, then runs every month.`);
  }
  return lines;
}

/** 2-3 related cards for cross-sell, chosen by a shared funnel stage (real adjacency from
 *  ITEM_STAGES); falls back to the same card type when no stage overlaps. Excludes the current card. */
function similarCards(itemId) {
  const mine = ITEM_STAGES[itemId] || [];
  const self = catGet(itemId);
  return CATALOG
    .filter((c) => c.id !== itemId)
    .map((c) => {
      const stages = ITEM_STAGES[c.id] || [];
      const shared = stages.filter((s) => mine.includes(s)).length;
      return { c, shared, sameType: !!(self && c.type === self.type) };
    })
    .filter((x) => x.shared > 0 || x.sameType)
    .sort((a, b) => (b.shared - a.shared) || (Number(b.sameType) - Number(a.sameType)))
    .slice(0, 3)
    .map((x) => x.c);
}

/** A guided-form step header: a small filled-green numbered circle + a bold label, with an
 *  optional quiet hint on the right. The number renumbers from the caller so the flow stays
 *  1,2,3 (or 1,2 when the options step is absent). */
// A plain, light section label — no numbered step circle. Optional right-aligned hint
// (used for "Optional" on the extras block). Keeps the page reading as natural groupings.
function BlockLabel({ label, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
      <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, color: TOKENS.ink, letterSpacing: -0.2 }}>{label}</span>
      {hint && <span style={{ marginLeft: "auto", fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: TOKENS.faint }}>{hint}</span>}
    </div>
  );
}

function ProductPage({ itemId, signals, tier, clientId, restaurant, initialDoer, initialOptions, onBack, onContinue, onOpenCard }) {
  const p = catGet(itemId) || CATALOG[0];
  const copy = pdpCopy(itemId) || { promise: p.sub, why: p.sub, expect: "" };
  const doerCfg = doerSlotFor(itemId);
  const [doer, setDoer] = useState(initialDoer || (doerCfg ? doerCfg.v : null));
  // Personalized only from THIS client's real signals; otherwise the authored fallback.
  const personalWhy = whyFor(itemId, signals);
  const why = personalWhy || copy.why;
  const price = pdpPrice(p, doerCfg ? doer : null);
  // The AI lane is Pro-only. A non-Pro owner may still SELECT it (the row highlights), but
  // Continue turns into "Upgrade to Pro" → billing instead of shipping. Lanes ① and ③ ship as usual.
  const upsellAi = doerCfg && gbpLaneOf(doer) === "ai" && !isProTier(tier);
  const sectionLabel = { fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: TOKENS.faint, textTransform: "uppercase", marginBottom: 10 };

  // gbp only: read the owner's real Google-profile diagnosis. RENDER-FIRST — the page shows the
  // generic fallback (State C) instantly and swaps to A/B only when a conclusive read lands. Cached
  // in localStorage with the same stale-while-revalidate idiom as the why-signals cache; keyed by
  // clientId so a client switch never shows another client's gaps. ~30 min TTL.
  const [gbpDiag, setGbpDiag] = useState(null);
  useEffect(() => {
    if (itemId !== "gbp" || !clientId) return;
    let cancelled = false;
    const cacheKey = `apnosh-gbpdiag-v1-${clientId}`;
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch { cached = null; }
    if (cached && cached.diag) setGbpDiag(cached.diag);
    const fresh = cached && typeof cached.ts === "number" && Date.now() - cached.ts < 30 * 60 * 1000;
    if (fresh) return;
    fetch(`/api/dashboard/gbp-diagnosis?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        // An {error} body or a non-object leaves the state as-is → fallback stays honest.
        if (cancelled || !j || typeof j !== "object" || j.error) return;
        setGbpDiag(j);
        try { localStorage.setItem(cacheKey, JSON.stringify({ diag: j, ts: Date.now() })); } catch { /* storage full/private — fine */ }
      })
      .catch(() => { /* fallback (State C) shows; nothing is ever faked */ });
    return () => { cancelled = true; };
  }, [itemId, clientId]);
  const { state: gbpState, problems: gbpProblems, sectionCount: gbpSections } = decideGbpState(itemId, gbpDiag);
  const views30d = signals && typeof signals.views30d === "number" && signals.views30d > 0 ? signals.views30d : null;
  // Real rating pair — BOTH the live rating and its count must exist, else the listing card
  // shows no stars at all (never a faked or half rating). The business name is the real client name.
  const ratingPair = signals && typeof signals.rating === "number" && signals.rating > 0 && typeof signals.ratingCount === "number" && signals.ratingCount > 0
    ? { rating: signals.rating, count: signals.ratingCount } : null;
  const bizName = (typeof restaurant === "string" && restaurant.trim()) ? restaurant.trim() : null;
  // The bold outcome headline: uses the owner's REAL monthly views when the card's job is about
  // being found, else a confident non-numeric line. Aspirational, never a guaranteed result.
  const isGbp = p.id === "gbp";
  // The headline AGREES with the live diagnosis state so it never claims gaps when the profile
  // is all-good (or the reverse): A = fix framing, B = maintain framing, C = neutral aspiration.
  // The real monthly-views number lives HERE (the zone-2 line no longer repeats it). Never a
  // guaranteed result or an invented percentage.
  const heroHeadline = (() => {
    const v = views30d ? views30d.toLocaleString("en-US") : null;
    if (isGbp) {
      if (gbpState === "A") return v ? `Fix what's missing so more of the ${v} who find you walk in.` : "Fix what's missing so more people walk in.";
      if (gbpState === "B") return v ? `Keep showing up for the ${v} who already find you.` : "Keep showing up for the people who already find you.";
      return v ? `Help more of the ${v} who find you each month walk in.` : "Be the easy yes when neighbors search you.";
    }
    const seen = (ITEM_STAGES[p.id] || []).includes("aware");
    if (seen && v) return `Get in front of more of the ${v} who find you each month.`;
    return copy.promise || p.sub;
  })();

  // ── ZONE 4 options: this card's REAL add-on services (validated against the live catalog). ──
  const optServices = (CARD_OPTIONS[itemId] || []).map((id) => serviceById(id)).filter(Boolean);
  const [selected, setSelected] = useState(() => {
    const seed = Array.isArray(initialOptions) ? initialOptions : [];
    return seed.filter((id) => optServices.some((s) => s.id === id));
  });
  const [openOpt, setOpenOpt] = useState(null);
  const toggleOpt = (id) => setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const pro = isProTier(tier);
  // The gbp AI lane, if this card has one — the zone-4 "Add Apnosh AI" row selects THIS version so
  // the account upgrade and the picked version stay one state (never two conflicting truths).
  const aiOpt = doerCfg ? doerCfg.o.find((o) => gbpLaneOf(o) === "ai") : null;
  const teamOpt = doerCfg ? doerCfg.o.find((o) => gbpLaneOf(o) === "team") : null;
  const gbpLane = doerCfg ? gbpLaneOf(doer) : "team";
  // "What you get" recomposes LIVE from the chosen version + the toggled options — the same
  // state that drives the price — so switching lane or adding an option updates it at once.
  // A base group (framed by version for gbp) + one titled group per selected add-on service.
  const getSections = (() => {
    const secs = whatYouGet(itemId, { version: doerCfg ? gbpLane : null, optionServiceIds: selected });
    // Honest fallback: a card that derives no base rows keeps a plain by-type promise so the
    // sell page is never empty (the option groups, if any, still carry real bullets).
    if (secs[0] && secs[0].rows.length === 0) secs[0] = { ...secs[0], rows: DETAIL_GET[p.type] || DETAIL_GET.plan };
    return secs;
  })();

  // ── Live buy-box math. Base comes from the selected VERSION (owner-run gbp lanes are Free);
  //    options add their REAL catalog price (recurring vs one-time kept separate). ──
  const laneFree = doerCfg && (gbpLane === "diy" || gbpLane === "ai");
  const baseP = ITEM_PRICES[buildIdFor(p.id)] || { oneTime: 0, perMonth: 0 };
  const base = laneFree ? { oneTime: 0, perMonth: 0 } : baseP;
  const optM = optionsMoney(selected);
  const totalOneTime = base.oneTime + optM.oneTime;
  const totalPerMonth = base.perMonth + optM.perMonth;
  const creative = p.type === "content" || p.id === "shoot";
  const totalLabel = (totalOneTime === 0 && totalPerMonth === 0) ? "Free" : `${creative && totalOneTime > 0 ? "From " : ""}${moneyLabel(totalOneTime, totalPerMonth)}`;

  const [added, setAdded] = useState(false);
  const [rushOpen, setRushOpen] = useState(false);
  // Section 1 handoffs: version + options ride into the passthrough exactly as `doer` does today.
  const buildPreset = () => {
    const pr = {};
    if (doerCfg && doer) pr.doer = doer;
    if (selected.length) pr.options = selected;
    return Object.keys(pr).length ? pr : null;
  };
  const onAddToPlan = () => {
    addToPlanDraft({ itemId, version: doerCfg ? doer : null, options: selected, at: Date.now() });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };
  const timeline = configTimeline(p, gbpLane, selected);
  const similar = similarCards(itemId);
  // The "Add extras" block at the bottom only exists when this card has REAL add-ons or a
  // Pro AI row to offer. When it has neither, the whole block is hidden (renders nothing).
  const hasExtras = optServices.length > 0 || (doerCfg && !!aiOpt);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
        {/* ── HERO — premium, warm, light. gbp shows the owner's REAL Google listing as the product
              shot; every other card lifts its own art. One bold outcome headline + a confident price,
              with a single decisive green accent. Rises gently on load (respects reduced-motion). ── */}
        <div style={{ position: "relative", background: "linear-gradient(168deg, #fbfaf4 0%, #f2f8f4 54%, #e7f3ed 100%)", padding: "14px 20px 26px", overflow: "hidden" }}>
          <div aria-hidden style={{ position: "absolute", top: -80, right: -60, width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(74,189,152,0.22), rgba(74,189,152,0))", pointerEvents: "none" }} />
          <button onClick={onBack} aria-label="Back" className="apnpress" style={{ position: "relative", width: 36, height: 36, borderRadius: 18, border: "none", background: "rgba(20,35,28,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div className="apnrise" style={{ position: "relative", marginTop: 14 }}>
            {/* Chips: the funnel stage(s) this moves + the cadence. */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {(ITEM_STAGES[p.id] || []).map((s) => (
                <span key={s} style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: TOKENS.mintDark, background: "rgba(74,189,152,0.14)", borderRadius: 8, padding: "4px 9px" }}>{STAGE_TAG_LABEL[s] || s}</span>
              ))}
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: "#7c837e", background: "rgba(20,30,26,0.05)", borderRadius: 8, padding: "4px 9px" }}>{CADENCE_TAG[p.cad] || "Plan"}</span>
            </div>
            {/* Product name eyebrow, then the BIG bold outcome headline. */}
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: TOKENS.mintDark, marginBottom: 6 }}>{p.title}</div>
            <h1 style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 26, fontWeight: 700, color: TOKENS.ink, lineHeight: 1.16, letterSpacing: -0.5, margin: 0, textWrap: "balance" }}>{heroHeadline}</h1>
            {/* Confident price moment, live from the selected version. */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}>
              <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 27, fontWeight: 700, color: TOKENS.ink, letterSpacing: -0.5 }}>{price || "Free"}</span>
              {(!price || price === "Free")
                ? (moneyLabel(baseP.oneTime, baseP.perMonth) !== "Free" && <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.sub }}>or {moneyLabel(baseP.oneTime, baseP.perMonth)} done for you</span>)
                : <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.sub }}>to start</span>}
            </div>
            {/* Product shot: the REAL Google listing (gbp only) or the lifted card art. */}
            {isGbp ? (
              <div className="apnrise2" style={{ marginTop: 20, background: "#fff", borderRadius: 18, padding: "15px 16px 14px", boxShadow: "0 14px 34px rgba(20,45,33,0.14), 0 2px 6px rgba(20,45,33,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" /></svg>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: TOKENS.faint, letterSpacing: 0.2 }}>Your Google listing</span>
                </div>
                <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 18, fontWeight: 700, color: TOKENS.ink, lineHeight: 1.2 }}>{bizName || "Your business"}</div>
                {ratingPair && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 700, color: "#a5670a" }}>{ratingPair.rating.toFixed(1)}</span>
                    <GStars value={ratingPair.rating} />
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub }}>({ratingPair.count.toLocaleString("en-US")})</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
                  {[
                    { l: "Directions", d: "M21.4 10.6 13.4 2.6a2 2 0 0 0-2.8 0l-8 8a2 2 0 0 0 0 2.8l8 8a2 2 0 0 0 2.8 0l8-8a2 2 0 0 0 0-2.8zM12 8v3h4v3" },
                    { l: "Call", d: "M21 15.5a8.4 8.4 0 0 1-4 1 8.4 8.4 0 0 1-8.4-8.4 8.4 8.4 0 0 1 1-4L12 6l-2 2a10 10 0 0 0 4 4l2-2z" },
                    { l: "Website", d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18z" },
                  ].map((a) => (
                    <span key={a.l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "#f4f7fb", borderRadius: 12, padding: "9px 4px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a7fd0" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={a.d} /></svg>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 600, color: "#4a7fd0" }}>{a.l}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="apnrise2" style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
                <div style={{ width: 128, height: 128, borderRadius: 30, background: gType(p.type), display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 16px 34px ${hexA((TYPE_G[p.type] || TYPE_G.plan)[1], 0.34)}, 0 3px 8px rgba(20,40,30,0.12)` }}>
                  <Art id={p.id} size={76} />
                </div>
              </div>
            )}
          </div>
        </div>
        {/* ── SELL — a COMPACT diagnosis/why right under the hero (cause sits close to the choices
              below). gbp gaps: a short count + the real gap items; gbp all-good: one strong line;
              other cards: the personalized why in a line or two. Honesty guards unchanged. ── */}
        {gbpState === "A" ? (
          /* STATE A — real gaps: compact amber note with the honest count + up to 4 traceable rows. */
          <div style={{ padding: "12px 20px 0" }}>
            <div style={{ background: GBP_AMBER.bg, border: `1px solid ${GBP_AMBER.line}`, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                <span style={{ width: 20, height: 20, borderRadius: 10, background: GBP_AMBER.chip, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={GBP_AMBER.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                </span>
                <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14, fontWeight: 600, color: GBP_AMBER.ink, lineHeight: 1.25 }}>{gbpProblems.length} {gbpProblems.length === 1 ? "thing needs" : "things need"} fixing on your profile.</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {gbpProblems.slice(0, 4).map((s, i) => (
                  <div key={s.key || i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 3, background: GBP_AMBER.ink, flexShrink: 0, marginTop: 7 }} />
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: GBP_AMBER.body, lineHeight: 1.4 }}>{gbpGapPhrase(s)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : gbpState === "B" ? (
          /* STATE B — all good: one compact green line, no manufactured urgency. */
          <div style={{ padding: "12px 20px 0" }}>
            <div style={{ background: TOKENS.mintTint, border: `1px solid ${GBP_GREEN.line}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, background: GBP_GREEN.chip, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14, fontWeight: 600, color: TOKENS.mintDark, lineHeight: 1.25 }}>Your profile looks strong. All {gbpSections} parts are set.</div>
            </div>
          </div>
        ) : (
          /* State C — the personalized "why this, for you", kept to a line or two. */
          <div style={{ padding: "12px 20px 0" }}>
            <div style={{ background: TOKENS.mintTint, borderRadius: 14, padding: "12px 14px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.ink, lineHeight: 1.5 }}>{why}</div>
          </div>
        )}
        {/* ── THE PRODUCT (grouping one) — the version pick and "what you get" flow as ONE
              continuous block, no numbered steps. First: choose how it's done (3-lane doer for gbp
              with Pro gate + passthrough); non-versioned cards show the quiet "the Apnosh team does
              this" line. ── */}
        <div style={{ padding: "22px 20px 0" }}>
          <BlockLabel label={doerCfg ? "Choose how it's done" : "How it's done"} />
          {doerCfg ? (
            <>
              {/* A 3-segment TAB / segmented control — one equal-thirds tab per lane. Each tab shows
                  a short name + its price so all three prices compare at a glance; the AI tab carries
                  the PRO badge. The selected tab is filled green with white text; the others stay
                  quiet. Tapping a tab calls the SAME setDoer(opt) as the old cards, so the price,
                  "What you get", the buy box, and the Pro gate all update exactly as before. */}
              <div style={{ display: "flex", gap: 7 }}>
                {doerCfg.o.map((opt) => {
                  const t = doerTab(opt, tier);
                  const on = doer === opt;
                  return (
                    <button key={opt} onClick={() => setDoer(opt)} className="apnpress" aria-pressed={on} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textAlign: "center", background: on ? TOKENS.mint : "#fff", border: on ? `1.5px solid ${TOKENS.mint}` : `1.5px solid ${TOKENS.line}`, borderRadius: 14, padding: "11px 6px", cursor: "pointer", boxShadow: on ? "0 4px 14px rgba(74,189,152,0.30)" : "0 1px 2px rgba(20,40,30,0.03)", WebkitTapHighlightColor: "transparent" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 13, fontWeight: 600, color: on ? "#fff" : TOKENS.ink, whiteSpace: "nowrap" }}>{t.short}</span>
                        {t.pro && (
                          <span style={{ display: "inline-flex", alignItems: "center", background: on ? "rgba(255,255,255,0.24)" : "#eaf7f3", color: on ? "#fff" : "#2e9a78", fontFamily: "Inter, sans-serif", fontSize: 8.5, fontWeight: 800, letterSpacing: 0.4, borderRadius: 5, padding: "1.5px 4px" }}>PRO</span>
                        )}
                      </span>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: on ? "rgba(255,255,255,0.92)" : TOKENS.mintDark }}>{t.price || "Free"}</span>
                    </button>
                  );
                })}
              </div>
              {/* Plain detail line for the SELECTED version only. */}
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, lineHeight: 1.45, marginTop: 10 }}>{doerTab(doer, tier).detail}</div>
            </>
          ) : (
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub }}>The Apnosh team does this for you.</div>
          )}
        </div>
        {/* What you get — flows directly under the version pick as part of the SAME product block
              (minimal separation, no numbered step). Recomposes LIVE from the chosen version +
              toggled options (the same state that drives the price, and that the extras block below
              also feeds). Base group first, then one titled sub-group per selected add-on with its
              REAL catalog bullets. The honest delivery estimate folds in at the end — rush is a
              click, never an invented price. ── */}
        <div style={{ padding: "18px 20px 0" }}>
          <BlockLabel label="What you get" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(getSections[0] ? getSections[0].rows : []).map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, background: TOKENS.mintTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink, lineHeight: 1.45 }}>{g}</span>
              </div>
            ))}
          </div>
          {getSections.slice(1).map((sec, si) => (
            <div key={si} style={{ marginTop: 15, background: TOKENS.mintTint, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
                <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 13.5, fontWeight: 600, color: TOKENS.mintDark }}>{sec.title}</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, color: TOKENS.mintDark, textTransform: "uppercase" }}>{sec.recurring ? "Added /mo" : "Added"}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {sec.rows.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOKENS.mintDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}><path d="M20 6L9 17l-5-5" /></svg>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.ink, lineHeight: 1.45 }}>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Honest delivery estimate, folded in. Rush is a click, not an invented price. */}
          <div style={{ marginTop: 16, background: "#f7f9f8", borderRadius: 14, padding: "12px 14px" }}>
            {timeline.map((t, i) => (
              <div key={i} style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: i === 0 ? TOKENS.ink : TOKENS.sub, lineHeight: 1.5, marginTop: i === 0 ? 0 : 5 }}>{t}</div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: TOKENS.faint }}>This is an estimate.</span>
              <span style={{ color: TOKENS.dash }}>·</span>
              <button onClick={() => setRushOpen((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: TOKENS.mintDark, WebkitTapHighlightColor: "transparent" }}>Need it faster?</button>
            </div>
            {rushOpen && (
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub, lineHeight: 1.5, marginTop: 8 }}>Rush timing depends on the work. Add it to your plan or buy now, then tell your team you need it sooner and they will confirm what is possible.</div>
            )}
          </div>
        </div>

        {/* ── ADD EXTRAS (grouping two) — a distinct OPTIONAL block at the BOTTOM, above the buy box.
              Real add-on services + the Pro AI row, each keeps its "See what's included" expander so
              its deliverables show inline here. Toggling one genuinely adds/removes its serviceId
              from the composed draft (svcLines), so the live total AND the "What you get" list above
              both update. Hidden entirely when there are no real options and no AI row. ── */}
        {hasExtras && (
          <div style={{ padding: "28px 20px 0" }}>
            <BlockLabel label="Add extras" hint="Optional" />
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {optServices.map((s) => {
                const on = selected.includes(s.id);
                const open = openOpt === s.id;
                const del = s.deliverables && Array.isArray(s.deliverables.included) ? s.deliverables.included : [];
                return (
                  <div key={s.id} style={{ border: on ? `1.5px solid ${TOKENS.mint}` : `1.5px solid ${TOKENS.line}`, borderRadius: 16, background: on ? TOKENS.mintTint : "#fff", overflow: "hidden", boxShadow: on ? "0 4px 16px rgba(74,189,152,0.16)" : "0 1px 2px rgba(20,40,30,0.03)" }}>
                    <button onClick={() => { toggleOpt(s.id); setOpenOpt(open && on ? null : s.id); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "transparent", border: "none", padding: "13px 14px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                      <span style={{ width: 20, height: 20, borderRadius: 6, border: on ? "none" : `1.5px solid ${TOKENS.dash}`, background: on ? TOKENS.mint : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14.5, fontWeight: 600, color: TOKENS.ink }}>{plainNameOf(s)}</span>
                        {s.deliverables && s.deliverables.summary && <span style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginTop: 1, lineHeight: 1.4 }}>{s.deliverables.summary}</span>}
                      </span>
                      <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 13.5, fontWeight: 600, color: on ? TOKENS.mintDark : TOKENS.ink, flexShrink: 0 }}>{optionDelta(s)}</span>
                    </button>
                    <button onClick={() => setOpenOpt(open ? null : s.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: "transparent", border: "none", borderTop: `1px solid ${on ? "rgba(74,189,152,0.25)" : TOKENS.line}`, padding: "8px 14px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: TOKENS.sub, WebkitTapHighlightColor: "transparent" }}>
                      {open ? "Hide what's included" : "See what's included"}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOKENS.sub} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {open && (
                      <div className="apnexpand" style={{ padding: "4px 16px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {del.map((d, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                              <span style={{ width: 5, height: 5, borderRadius: 3, background: TOKENS.mint, flexShrink: 0, marginTop: 7 }} />
                              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.ink, lineHeight: 1.45 }}>{d}</span>
                            </div>
                          ))}
                        </div>
                        {optionIsRecurring(s) && <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: TOKENS.faint, marginTop: 9 }}>Runs every month. Stop anytime.</div>}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* AI Pro — an ACCOUNT upgrade, not a per-campaign line. It ties to the real Pro
                  entitlement: for a Pro/Internal client it is already included; otherwise it selects
                  the AI version and points to billing. No fabricated monthly price (none is modeled). */}
              {doerCfg && aiOpt && (
                pro ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1.5px solid ${TOKENS.line}`, borderRadius: 16, background: "#fff", padding: "13px 14px" }}>
                    <span style={{ width: 20, height: 20, borderRadius: 10, background: TOKENS.mint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14.5, fontWeight: 600, color: TOKENS.ink }}>Apnosh AI</span>
                      <span style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginTop: 1 }}>Included in your plan.</span>
                    </span>
                  </div>
                ) : (
                  <button onClick={() => setDoer(gbpLane === "ai" ? (teamOpt || doerCfg.v) : aiOpt)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", border: gbpLane === "ai" ? `1.5px solid ${TOKENS.mint}` : `1.5px solid ${TOKENS.line}`, borderRadius: 16, background: gbpLane === "ai" ? TOKENS.mintTint : "#fff", padding: "13px 14px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, border: gbpLane === "ai" ? "none" : `1.5px solid ${TOKENS.dash}`, background: gbpLane === "ai" ? TOKENS.mint : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {gbpLane === "ai" && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14.5, fontWeight: 600, color: TOKENS.ink }}>Add Apnosh AI to your plan</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#eaf7f3", color: "#2e9a78", fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: 0.5, borderRadius: 6, padding: "2px 6px" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="#2e9a78"><path d="M12 2l2.4 6.9L21.6 9l-5.8 4.4 2.2 7-6-4.3-6 4.3 2.2-7L2.4 9l7.2-.1z" /></svg>
                          PRO
                        </span>
                      </span>
                      <span style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginTop: 1, lineHeight: 1.4 }}>Unlocks AI on this and every campaign. AI writes each fix, free.</span>
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* ── BUY — INLINE at the END of the flow (NOT sticky/floating, so nothing overlaps the
              content). Live total, then "Add to plan" as the bold filled PRIMARY (collect-only to a
              local draft; ships and bills nothing) and "Buy now instead" as the quiet secondary link
              that carries the version + options into today's Continue flow. AI-lane keeps its Pro path. ── */}
        <div style={{ padding: "24px 20px 4px" }}>
          <div style={{ background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 20, padding: "16px 16px 18px", boxShadow: "0 10px 26px rgba(20,40,30,0.06)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: TOKENS.sub }}>Your total</span>
              <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 22, fontWeight: 700, color: TOKENS.ink, letterSpacing: -0.4 }}>{totalLabel}</span>
            </div>
            <button onClick={onAddToPlan} className="apnpress" style={{ width: "100%", height: 54, borderRadius: 27, border: "none", cursor: "pointer", background: added ? TOKENS.mintDark : TOKENS.mint, color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 8px 22px rgba(74,189,152,0.42)", WebkitTapHighlightColor: "transparent" }}>
              {added ? (
                <><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Added to your plan</>
              ) : (
                <><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>Add to plan</>
              )}
            </button>
            {upsellAi ? (
              <a href="/dashboard/billing" className="apnpress" style={{ display: "block", textAlign: "center", textDecoration: "none", fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 700, color: TOKENS.mintDark, marginTop: 13 }}>Upgrade to Pro to use Apnosh AI</a>
            ) : (
              <button onClick={() => onContinue(buildPreset())} className="apnpress" style={{ display: "block", width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: "#7c837e", marginTop: 13, WebkitTapHighlightColor: "transparent" }}>Buy now instead</button>
            )}
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: TOKENS.faint, textAlign: "center", marginTop: 10 }}>
              {upsellAi ? "Apnosh AI is on the Pro plan. Or pick one of the other two." : "Nothing ships or bills until you say so."}
            </div>
          </div>
        </div>

        {/* ── YOU MIGHT ALSO ADD — real adjacency (shared funnel stage) as cross-sell AFTER the buy
              box; each deep-links to its own product page. ── */}
        {similar.length > 0 && (
          <div style={{ padding: "22px 20px 26px" }}>
            <div style={sectionLabel}>You might also add</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {similar.map((c) => (
                <button key={c.id} onClick={() => onOpenCard && onOpenCard(c.id)} className="apnpress" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "#fff", border: `1.5px solid ${TOKENS.line}`, borderRadius: 16, padding: "11px 13px", cursor: "pointer", boxShadow: "0 2px 8px rgba(20,40,30,0.04)", WebkitTapHighlightColor: "transparent" }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: gType(c.type), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 4px 10px ${hexA((TYPE_G[c.type] || TYPE_G.plan)[1], 0.28)}` }}><Art id={c.id} size={30} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14, fontWeight: 600, color: TOKENS.ink }}>{c.title}</span>
                    <span style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.sub, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{priceLabel(c.id) || "Free"}</span>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.faint} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Pre-filled mad-libs per plan ---- */
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
function joinList(a) { return a.length <= 1 ? (a[0] || "") : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`; }

const MENU = [
  { l: "Spicy Chicken Sandwich", p: "$14" },
  { l: "Honey Butter Biscuit", p: "$5" },
  { l: "Market Bowl", p: "$13" },
  { l: "Breakfast Burrito", p: "$11" },
  { l: "Avocado Toast", p: "$10" },
  { l: "Seasonal Quiche", p: "$13" },
  { l: "Cold Brew", p: "$5" },
  { l: "Lemon Olive Oil Cake", p: "$7" },
];
// The gbp card's THREE "Who does it" lanes, priced right on the option so the choice is a real
// decision. The Apnosh price reads from ITEM_PRICES so it can never drift from the real bill.
// The exact phrasing is load-bearing: the adapter (gbpLaneFromDoer) keys on it to map each lane
// to (producer, price, ownerMode). "yourself" => diy checklist, "Apnosh AI" => ai drafts (Pro),
// plain "Apnosh" => the $365 done-for-you team lane. Keep the tokens when editing copy.
const GBP_DOER_SELF = "done by you yourself, step by step, free";
const GBP_DOER_AI = "done with Apnosh AI, step by step, free";
const GBP_DOER_APNOSH = `done for you by Apnosh, $${(ITEM_PRICES.gbp && ITEM_PRICES.gbp.oneTime) || 365}`;

const QL = {
  reach: { lead: "Help new locals within {radius} discover you.", slots: { radius: { k: "slider", v: 5, min: 1, max: 50, unit: "mile" } }, extras: [{ id: "paidreach", k: "pick", label: "Paid reach", o: ["yes, run paid ads", "no, keep it organic"], clause: (v) => (v.startsWith("no") ? ", organic only" : ", with paid ads") }] },
  nights: { lead: "Bring guests in on your {days}, with {offer}, {list}, on {budget}.", slots: { days: { k: "days", v: ["Monday", "Tuesday"] }, offer: { k: "pick", v: "a small deal", o: ["a small deal", "a featured dish", "a happy hour", "a free side with any entree"], custom: true }, list: { k: "pick", v: "reaching your email + text list", o: ["reaching your email + text list", "social only"] }, budget: { k: "pick", v: "the full plan", o: ["a lean start", "the full plan", "an all-in push"] } }, extras: [{ id: "limits", k: "text", label: "Add any limits", ph: "dine-in only, those nights only", clause: (v) => `, ${v}` }] },
  firstvisit: { lead: "Bring new people in for {dish} with {offer}, shown to {who}, on {budget}.", slots: { dish: { k: "menu", v: "Spicy Chicken Sandwich" }, offer: { k: "pick", v: "a free side with any entree", o: ["a free side with any entree", "a free drink", "a small discount", "a free item", "a first-visit deal"], custom: true }, who: { k: "pick", v: "people nearby", o: ["people nearby", "families nearby", "couples for date night", "nearby offices", "everyone nearby"], custom: true }, budget: { k: "pick", v: "the full plan", o: ["a lean start", "the full plan", "an all-in push"] } }, extras: [{ id: "redeem", k: "pick", label: "How they claim it", o: ["show this post at the counter", "mention it when ordering"], clause: (v) => `, ${v}` }, { id: "limits", k: "text", label: "Add any limits", ph: "one per person, first visit only", clause: (v) => `, ${v}` }] },
  regulars: { lead: "Bring guests back more often with {reward}, {list}, on {budget}.", slots: { reward: { k: "pick", v: "a points reward", o: ["a points reward", "a free item", "a birthday treat", "a thank-you offer"], custom: true }, list: { k: "pick", v: "reaching your email + text list", o: ["reaching your email + text list", "social only"] }, budget: { k: "pick", v: "the full plan", o: ["a lean start", "the full plan", "an all-in push"] } } },
  catering: { lead: "Grow catering orders from {audience}.", slots: { audience: { k: "multi", v: ["offices nearby"], o: ["offices nearby", "event planners", "families", "past big orders", "schools"], custom: true } }, extras: [{ id: "min", k: "text", label: "Add a minimum order", ph: "like $200 or 10 people", clause: (v) => `, with a ${v} minimum` }, { id: "bigdeal", k: "text", label: "Add a deal for big orders", ph: "like 10% off orders over $300", clause: (v) => `, plus ${v}` }] },
  reviewsplan: { lead: "Get more reviews by {how}, and reply to {which}, on {budget}.", slots: { how: { k: "multi", v: ["ask at checkout", "a table card or QR"], o: ["ask at checkout", "a table card or QR", "a follow-up text or email", "a small thank-you for reviewing"], custom: true }, which: { k: "pick", v: "every review", o: ["every review", "just critical ones"] }, budget: { k: "pick", v: "the full plan", o: ["a lean start", "the full plan", "an all-in push"] } } },
  reel: { lead: "Make a short video featuring {subject}.", slots: { subject: { k: "menu", v: "Spicy Chicken Sandwich" } }, extras: [{ id: "boost", k: "pick", label: "Boost it", o: ["yes, boost it to nearby people", "no thanks"], clause: (v) => (v.startsWith("yes") ? ", boosted to nearby people" : "") }] },
  story: { lead: "Post a story about {subject}.", slots: { subject: { k: "menu", v: "Seasonal Quiche" } }, extras: [{ id: "boost", k: "pick", label: "Boost it", o: ["yes, boost it to nearby people", "no thanks"], clause: (v) => (v.startsWith("yes") ? ", boosted to nearby people" : "") }] },
  carousel: { lead: "Make a carousel of {subject}, as {format}.", slots: { subject: { k: "menu", v: "Market Bowl" }, format: { k: "pick", v: "photos", o: ["photos", "photos with text", "graphics"] } }, extras: [{ id: "boost", k: "pick", label: "Boost it", o: ["yes, boost it to nearby people", "no thanks"], clause: (v) => (v.startsWith("yes") ? ", boosted to nearby people" : "") }] },
  graphic: { lead: "Design a graphic for {purpose} that says {headline}, sized for {where}.", slots: { purpose: { k: "pick", v: "a promotion", o: ["a promotion", "an announcement", "an event", "a new menu item", "a holiday", "we're hiring"], custom: true }, headline: { k: "text", v: "", ph: "your main message, like Father's Day Brunch" }, where: { k: "pick", v: "an Instagram post", o: ["an Instagram post", "a story", "a flyer to print", "a menu board"] } }, extras: [{ id: "details", k: "text", label: "Add details to include", ph: "date, price, an offer, a hashtag", clause: (v) => `, plus ${v}` }] },
  dish: { lead: "Feature {subject} as {format}.", slots: { subject: { k: "menu", v: "Spicy Chicken Sandwich" }, format: { k: "multi", v: ["a photo"], o: ["a photo", "a short video", "a graphic", "a carousel"], custom: true } }, extras: [{ id: "boost", k: "pick", label: "Boost it", o: ["yes, boost it to nearby people", "no thanks"], clause: (v) => (v.startsWith("yes") ? ", boosted to nearby people" : "") }] },
  gpost: { lead: "Post about {subject} on your Google listing.", slots: { subject: { k: "menu", v: "Lemon Olive Oil Cake" } } },
  launch: { lead: "Launch {subject} with {special} on {date}, {list}, on {budget}.", slots: { subject: { k: "menu", v: "Avocado Toast" }, special: { k: "pick", v: "20% off", o: ["20% off", "$5 off the new item", "a free side with it", "buy one, get one", "just introduce it, no discount"], custom: true }, date: { k: "date", v: 21 }, list: { k: "pick", v: "reaching your email + text list", o: ["reaching your email + text list", "social only"] }, budget: { k: "pick", v: "the full plan", o: ["a lean start", "the full plan", "an all-in push"] } }, extras: [{ id: "intensity", k: "pick", label: "Make it a big launch", o: ["a soft launch", "a big launch"], clause: (v) => `, as ${v}` }, { id: "boost", k: "pick", label: "Add paid reach", o: ["yes, add paid ads", "no thanks"], clause: (v) => (v.startsWith("yes") ? ", with paid ads to reach new people" : "") }, { id: "limits", k: "text", label: "Add any limits", ph: "dine-in only, one per person", clause: (v) => `, ${v}` }, { id: "code", k: "text", label: "Add a code", ph: "like NEW20", clause: (v) => `, code ${v}` }] },
  promoevent: { lead: "Promote {event} on {date}, {list}, on {budget}.", slots: { event: { k: "text", v: "", ph: "the event name, like Jazz Trivia Thursday" }, date: { k: "date", v: 14 }, list: { k: "pick", v: "reaching your email + text list", o: ["reaching your email + text list", "social only"] }, budget: { k: "pick", v: "the full plan", o: ["a lean start", "the full plan", "an all-in push"] } }, extras: [{ id: "intensity", k: "pick", label: "Make it a big push", o: ["a soft push", "a big push"], clause: (v) => `, as ${v}` }, { id: "boost", k: "pick", label: "Add paid reach", o: ["yes, add paid ads", "no thanks"], clause: (v) => (v.startsWith("yes") ? ", with paid ads to reach new people" : "") }, { id: "details", k: "text", label: "Add details", ph: "who's hosting, what's included", clause: (v) => `, plus ${v}` }] },
  creator: { lead: "Partner with {tier} to feature {subject}.", slots: { tier: { k: "pick", v: "a micro creator (10k-50k)", o: ["a nano creator (1k-10k)", "a micro creator (10k-50k)", "a mid-tier creator (50k-200k)", "any size, no preference"] }, subject: { k: "menu", v: "Spicy Chicken Sandwich" } }, extras: [{ id: "boost", k: "pick", label: "Boost their post", o: ["yes, put spend behind it", "no thanks"], clause: (v) => (v.startsWith("yes") ? ", boosting their post to new people" : "") }, { id: "budget", k: "text", label: "Add a budget", ph: "like $200 or a free meal", clause: (v) => `, budget ${v}` }] },
  welcome: { lead: "Send new subscribers a welcome with {message}.", slots: { message: { k: "multi", v: ["a warm hello"], o: ["a warm hello", "your story", "your best dishes", "a first-order treat"] } } },
  second: { lead: "Email first-timers {offer} to come back.", slots: { offer: { k: "pick", v: "a small reward", o: ["a small reward", "a discount", "a free item", "free delivery"], custom: true } }, extras: [{ id: "limits", k: "text", label: "Add any limits", ph: "one per person, dine-in only", clause: (v) => `, ${v}` }, { id: "code", k: "text", label: "Add a code", ph: "like BACK10", clause: (v) => `, code ${v}` }] },
  news: { lead: "Send a newsletter {cadence}, sharing {content}.", slots: { cadence: { k: "pick", v: "monthly", o: ["monthly", "twice a month", "weekly"] }, content: { k: "multi", v: ["news", "a special"], o: ["news", "a special", "new items", "upcoming events", "a recipe"] } } },
  slowoffer: { lead: "Send {offer} by {channel}, good on your {days}.", slots: { offer: { k: "pick", v: "20% off", o: ["20% off", "a free side", "a happy hour", "$5 off", "buy one, get one"], custom: true }, channel: { k: "multi", v: ["email", "text"], o: ["email", "text", "a social post"] }, days: { k: "days", v: ["Monday", "Tuesday"] } }, extras: [{ id: "limits", k: "text", label: "Add any limits", ph: "dine-in only, one per person", clause: (v) => `, ${v}` }, { id: "code", k: "text", label: "Add a code", ph: "like SAVE10", clause: (v) => `, code ${v}` }] },
  birthday: { lead: "Send {treat} on a guest's birthday, by {channel}.", slots: { treat: { k: "pick", v: "a free dessert", o: ["a free dessert", "a free drink", "a free appetizer", "10% off the table", "a free birthday combo"], custom: true }, channel: { k: "multi", v: ["email", "text"], o: ["email", "text"] } }, extras: [{ id: "limits", k: "text", label: "Add any limits", ph: "dine-in only, valid that week", clause: (v) => `, ${v}` }, { id: "code", k: "text", label: "Add a code", ph: "like BDAY", clause: (v) => `, code ${v}` }] },
  earlyaccess: { lead: "Give subscribers early access to {what}, {timing} before everyone.", slots: { what: { k: "multi", v: ["new menu items"], o: ["new menu items", "events", "specials", "reservations"] }, timing: { k: "pick", v: "a few days", o: ["a day", "a few days", "a week"] } } },
  shoot: { lead: "Book a {kind} shoot of {what}, on {date}.", slots: { kind: { k: "pick", v: "photo and video", o: ["photo", "video", "photo and video"] }, what: { k: "pick", v: "a few key dishes", o: ["your whole menu", "a few key dishes", "one dish", "your space inside", "your storefront", "your team"], custom: true }, date: { k: "date", v: 14 } }, extras: [{ id: "notes", k: "text", label: "Add a note", ph: "must-have shots, the vibe, props, parking", clause: (v) => `, plus ${v}` }] },
  gbp: { lead: "Update your Google profile: {what}, {doer}.", slots: { what: { k: "multi", v: ["hours", "photos", "menu"], o: ["hours", "photos", "menu", "description", "attributes"] }, doer: { k: "pick", label: "Who does it", v: GBP_DOER_APNOSH, o: [GBP_DOER_SELF, GBP_DOER_AI, GBP_DOER_APNOSH] } } },
  reviewsreply: { lead: "Reply to {which} reviews.", slots: { which: { k: "pick", v: "all", o: ["all", "just critical ones", "4 stars and below", "unanswered ones"] } } },
  qr: { lead: "Add a table QR that {action}.", slots: { action: { k: "pick", v: "grows your list", o: ["grows your list", "collects reviews", "links your menu", "links your socials", "takes orders"] } } },
  friction: { lead: "Make {channel} easier for guests.", slots: { channel: { k: "pick", v: "online ordering", o: ["online ordering", "booking a table", "finding your menu", "joining your list"] } } },
  listings: { lead: "Get {where} listed and synced.", slots: { where: { k: "multi", v: ["Yelp", "Apple Maps"], o: ["Yelp", "Apple Maps", "Bing", "TripAdvisor", "Facebook"] } } },
  website: { lead: "Fix {what} on your site.", slots: { what: { k: "multi", v: ["the menu", "speed"], o: ["the menu", "speed", "buttons and links", "photos", "hours"] } } },
  localseo: { lead: "Show up when neighbors search {term}.", slots: { term: { k: "text", v: "food near me", ph: "e.g. korean bbq near me" } } },
  delivery: { lead: "Tune up {apps}.", slots: { apps: { k: "multi", v: ["DoorDash"], o: ["DoorDash", "Uber Eats", "Grubhub", "your own site"] } } },
  nextdoor: { lead: "Get known on Nextdoor for {vibe}.", slots: { vibe: { k: "text", v: "your specials", ph: "e.g. best happy hour nearby" } } },
  edit: { lead: "Edit my {what}.", slots: { what: { k: "multi", v: ["videos"], o: ["videos", "photos", "menu shots", "old footage"] } } },
  direct: { lead: "Move {who} to direct orders with {perk}.", slots: { who: { k: "pick", v: "your regulars", o: ["your regulars", "delivery-app customers", "everyone"] }, perk: { k: "text", v: "10% off direct orders", ph: "e.g. free drink when you order direct" } } },
  giftcard: { lead: "Promote {kind} gift cards for {occasion}, in {amounts}, order by {date}, {list}.", slots: { kind: { k: "pick", v: "digital", o: ["digital", "physical", "digital and physical"] }, occasion: { k: "pick", v: "the holidays", o: ["the holidays", "Mother's Day", "Father's Day", "the season", "slow months", "graduation"], custom: true }, amounts: { k: "pick", v: "set amounts ($25, $50, $100)", o: ["set amounts ($25, $50, $100)", "any amount"] }, date: { k: "date", v: 21 }, list: { k: "pick", v: "reaching your email + text list", o: ["reaching your email + text list", "social only"] } }, extras: [{ id: "offer", k: "text", label: "Add a bonus", ph: "like $10 bonus on $50", clause: (v) => `, with ${v}` }, { id: "intensity", k: "pick", label: "Make it a big push", o: ["a soft push", "a big push"], clause: (v) => `, as ${v}` }, { id: "boost", k: "pick", label: "Add paid reach", o: ["yes, add paid ads", "no thanks"], clause: (v) => (v.startsWith("yes") ? ", with paid ads" : "") }] },
  ticket: { lead: "Sell tickets to {event} for {price}, on {date} at {time}, {list}.", slots: { event: { k: "text", v: "", ph: "the event name, like Wine Pairing Dinner" }, price: { k: "num", v: "" }, date: { k: "date", v: 30 }, time: { k: "time", v: { h: 7, m: "00", ap: "pm" } }, list: { k: "pick", v: "reaching your email + text list", o: ["reaching your email + text list", "social only"] } }, extras: [{ id: "intensity", k: "pick", label: "Make it a big push", o: ["a soft push", "a big push"], clause: (v) => `, as ${v}` }, { id: "boost", k: "pick", label: "Add paid reach", o: ["yes, add paid ads", "no thanks"], clause: (v) => (v.startsWith("yes") ? ", with paid ads to fill seats" : "") }, { id: "cap", k: "text", label: "Add capacity", ph: "a number, like 40", clause: (v) => `, room for ${v}` }, { id: "details", k: "text", label: "Add details", ph: "who's hosting, 21+, includes a drink", clause: (v) => `, plus ${v}` }] },
  winback: { lead: "When a guest hasn't visited in {time}, send {offer}.", slots: { time: { k: "pick", v: "30 days", o: ["30 days", "45 days", "60 days", "90 days"], custom: true }, offer: { k: "pick", v: "a come-back deal", o: ["a come-back deal", "a free item", "a discount", "a we-miss-you note"], custom: true } }, extras: [{ id: "limits", k: "text", label: "Add any limits", ph: "one per person, dine-in only", clause: (v) => `, ${v}` }, { id: "code", k: "text", label: "Add a code", ph: "like MISSYOU", clause: (v) => `, code ${v}` }] },
};

/* ---- schedule model ---- */
const SCHED_MODES = [
  { m: "week", label: "Times a week" },
  { m: "days", label: "Set days" },
  { m: "alt", label: "Every other day" },
  { m: "month", label: "Times a month" },
  { m: "once", label: "Just once" },
];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtSched(v) {
  if (!v || !v.mode) return "on a schedule";
  if (v.mode === "week") return (v.n || 2) >= 7 ? "every day" : (v.n || 2) === 1 ? "once a week" : (v.n || 2) === 2 ? "twice a week" : `${v.n} times a week`;
  if (v.mode === "days") { const d = (v.days || []).map((x) => DAY_SHORT[DAYS_FULL.indexOf(x)]); if (d.length === 0) return "on set days"; if (d.length === 7) return "every day"; return `every ${joinList(d)}`; }
  if (v.mode === "alt") return "every other day";
  if (v.mode === "month") return (v.n || 2) === 1 ? "once a month" : (v.n || 2) === 2 ? "twice a month" : `${v.n} times a month`;
  if (v.mode === "once") return "one time";
  return "on a schedule";
}

/* ---- shared input styles ---- */
const pillStyle = (sel, c1) => ({ display: "inline-flex", alignItems: "center", padding: "9px 14px", borderRadius: 20, border: sel ? `1.5px solid ${c1}` : `1.5px solid ${TOKENS.line}`, background: sel ? `${c1}12` : "#fff", color: sel ? c1 : TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, cursor: "pointer", WebkitTapHighlightColor: "transparent" });
const dayStyle = (on, c1) => ({ flex: 1, height: 44, borderRadius: 12, border: on ? "none" : `1.5px solid ${TOKENS.line}`, background: on ? c1 : "#fff", color: on ? "#fff" : TOKENS.sub, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", WebkitTapHighlightColor: "transparent" });
const roundBtn = { width: 46, height: 46, borderRadius: 23, border: `1.5px solid ${TOKENS.line}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent" };
const tickStyle = { fontFamily: "Inter, sans-serif", fontSize: 11, color: TOKENS.faint };
const iconBtn = { width: 30, height: 30, borderRadius: 9, border: "none", background: "#f5f6f5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent" };
const customInput = { flex: 1, border: `1.5px solid ${TOKENS.line}`, borderRadius: 11, padding: "9px 12px", fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink, outline: "none", boxSizing: "border-box", minWidth: 0 };
const addBtn = (c1) => ({ border: "none", background: c1, color: "#fff", borderRadius: 11, padding: "0 16px", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent" });
const noteStyle = { fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub, textAlign: "center", padding: "12px 0 2px", lineHeight: 1.5 };
const MINUS = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>;
const PLUS = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const CHK = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><path d="M20 6L9 17l-5-5" /></svg>;

function MiniCal({ value, onPick, accent }) {
  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const base = value || today;
  const [month, setMonth] = useState(() => new Date(base.getFullYear(), base.getMonth(), 1));
  const y = month.getFullYear(), m = month.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const atFloor = y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth());
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button disabled={atFloor} onClick={() => setMonth(new Date(y, m - 1, 1))} style={{ width: 30, height: 30, borderRadius: 15, border: "none", background: atFloor ? "transparent" : "#f3f4f3", cursor: atFloor ? "default" : "pointer", opacity: atFloor ? 0.3 : 1 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "auto" }}><path d="M15 5l-7 7 7 7" /></svg></button>
        <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: TOKENS.ink }}>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button onClick={() => setMonth(new Date(y, m + 1, 1))} style={{ width: 30, height: 30, borderRadius: 15, border: "none", background: "#f3f4f3", cursor: "pointer" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOKENS.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "auto" }}><path d="M9 5l7 7-7 7" /></svg></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 10.5, fontWeight: 600, color: TOKENS.faint, padding: "2px 0" }}>{d}</div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const d = new Date(y, m, day), past = d < today, sel = value && d.toDateString() === value.toDateString();
          return <button key={i} disabled={past} onClick={() => onPick(d)} style={{ height: 36, borderRadius: 10, border: "none", cursor: past ? "default" : "pointer", background: sel ? accent : "transparent", color: sel ? "#fff" : past ? "#cfd3d0" : TOKENS.ink, fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: sel ? 700 : 500, WebkitTapHighlightColor: "transparent" }}>{day}</button>;
        })}
      </div>
    </div>
  );
}

function TimePick({ value, onChange, accent }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const stepH = (d) => { let h = value.h + d; if (h > 12) h = 1; if (h < 1) h = 12; set({ h }); };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginBottom: 16 }}>
        <button onClick={() => stepH(-1)} style={roundBtn}>{MINUS}</button>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 36, fontWeight: 600, color: TOKENS.ink, minWidth: 48, textAlign: "center" }}>{value.h}</div>
        <button onClick={() => stepH(1)} style={roundBtn}>{PLUS}</button>
      </div>
      <div style={{ display: "flex", gap: 7, marginBottom: 9 }}>
        {["00", "15", "30", "45"].map((mm) => { const on = value.m === mm; return <button key={mm} onClick={() => set({ m: mm })} style={{ flex: 1, height: 40, borderRadius: 11, border: on ? "none" : `1.5px solid ${TOKENS.line}`, background: on ? accent : "#fff", color: on ? "#fff" : TOKENS.sub, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>:{mm}</button>; })}
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        {["am", "pm"].map((ap) => { const on = value.ap === ap; return <button key={ap} onClick={() => set({ ap })} style={{ flex: 1, height: 40, borderRadius: 11, border: on ? "none" : `1.5px solid ${TOKENS.line}`, background: on ? accent : "#fff", color: on ? "#fff" : TOKENS.sub, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", WebkitTapHighlightColor: "transparent" }}>{ap}</button>; })}
      </div>
    </div>
  );
}

// Pre-fill madlib slots from the owner's real account profile, so the builder arrives knowing who
// they are instead of showing placeholders. Maps by slot KEY so it applies across campaigns; only
// fills what the profile actually has — the static slot default stands in otherwise. (Menu/dish
// slots are handled separately in the vals init, which prefers the owner's featured dish.)
function profileDefaults(profile, cfg) {
  if (!profile) return {};
  const slots = (cfg && cfg.slots) || {};
  const o = {};
  for (const k in slots) {
    if (k === "who" && profile.targetAudience) o[k] = profile.targetAudience;
    if (k === "offer" && profile.currentSpecial) o[k] = profile.currentSpecial;
    // the days the owner marked SLOW in onboarding beat the static Monday+Tuesday default
    if (k === "days" && Array.isArray(profile.slowDays) && profile.slowDays.length) o[k] = profile.slowDays;
  }
  return o;
}
/** Slots already answered upstream (the product page's who-does-it) are hidden from the
 *  madlib so the owner is never asked twice: the slot leaves cfg + its {token} leaves the
 *  lead (with the joining comma), while the preset VALUE still rides in vals so the
 *  composed draft receives it exactly as if the slot had been tapped here. */
function hidePresetSlots(cfg, preset) {
  const keys = Object.keys(preset || {}).filter((k) => cfg.slots && cfg.slots[k]);
  if (!keys.length) return cfg;
  const slots = { ...cfg.slots };
  let lead = cfg.lead;
  for (const k of keys) {
    delete slots[k];
    lead = lead.replace(new RegExp(`(,\\s*)?\\{${k}\\}`), "").replace(/\s+([.,])/g, "$1");
  }
  return { ...cfg, lead, slots };
}

function Builder({ itemId, menu, monthlyCommitment = 0, liveCount = 0, monthlyCap = 0, hasList, profile, preset, onBack, onGenerate }) {
  const p = catGet(itemId) || CATALOG[0];
  const baseCfg = QL[itemId] || { lead: "Set up {thing}.", slots: { thing: { k: "text", v: p.title.toLowerCase() } } };
  const rawCfg = preset ? hidePresetSlots(baseCfg, preset) : baseCfg;
  // Any campaign with a "list" slot (launch, promoevent, ticket, giftcard) only offers
  // the "email + text list" option when the owner actually has a connected list. When we
  // know there is none, lock that slot to social-only so the plan never promises a send
  // to a list that does not exist.
  const listLocked = hasList === false && rawCfg.slots && rawCfg.slots.list;
  const cfg = listLocked
    ? { ...rawCfg, slots: { ...rawCfg.slots, list: { k: "pick", v: "social only", o: ["social only"] } } }
    : rawCfg;
  const c1 = (TYPE_G[p.type] || TYPE_G.plan)[1];
  const [vals, setVals] = useState(() => {
    // A dish/menu slot defaults to the owner's FEATURED dish (their signature) when they marked one,
    // else the first menu item — their real menu, never a placeholder.
    const heroDish = (menu && menu.length) ? (menu.find((m) => m.f) || menu[0]).l : null;
    const o = {};
    for (const k in cfg.slots) { const s = cfg.slots[k]; if (s.k === "date") { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (s.v || 7)); o[k] = d; } else if (s.k === "menu" && heroDish) { o[k] = heroDish; } else o[k] = s.v; }
    (cfg.extras || []).forEach((e) => { o[e.id] = (e.k === "multi" || e.k === "days") ? [] : ""; });
    // Pre-fill the rest from the real account profile (their audience, their current special) over the static defaults.
    const pd = profileDefaults(profile, cfg);
    for (const k in pd) if (pd[k] && cfg.slots[k]) o[k] = pd[k];
    // Upstream answers (the product page's doer pick) ride along even though their slot
    // is hidden here — onGenerate(vals) carries them into the composed draft unchanged.
    for (const k in (preset || {})) o[k] = preset[k];
    return o;
  });
  const [editing, setEditing] = useState(null);
  const [mq, setMq] = useState("");
  const [cq, setCq] = useState("");
  const addPillStyle = { display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", borderRadius: 22, padding: "9px 14px", border: "1.5px dashed rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.08)", color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, WebkitTapHighlightColor: "transparent" };
  const removeBtn = { marginTop: 10, height: 40, width: "100%", borderRadius: 20, border: `1.5px solid ${TOKENS.line}`, background: "#fff", color: TOKENS.sub, fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 13.5, fontWeight: 600, cursor: "pointer", WebkitTapHighlightColor: "transparent" };
  const getField = (k) => cfg.slots[k] || (cfg.extras && cfg.extras.find((e) => e.id === k)) || null;
  const has = (k) => { const v = vals[k]; return Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && v.toString().trim().length > 0); };
  const fmt = (k) => {
    const s = cfg.slots[k], v = vals[k];
    if (s.k === "days") return v.length ? joinList(v) : "pick days";
    if (s.k === "date") return v ? v.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "pick a date";
    if (s.k === "time") return `${v.h}:${v.m} ${v.ap.toUpperCase()}`;
    if (s.k === "slider") return `${v}${v >= s.max ? "+" : ""} ${s.unit}${v === 1 ? "" : "s"}`;
    if (s.k === "schedule") return fmtSched(v);
    if (s.k === "multi") return v && v.length ? joinList(v) : "pick a few";
    return (v === "" || v == null) ? (s.ph || "tap to add") : v;
  };
  const filled = (k) => { const s = cfg.slots[k], v = vals[k]; if (s.k === "days") return v.length > 0; if (s.k === "multi") return v && v.length > 0; if (s.k === "schedule") return !!v; if (s.k === "date" || s.k === "time") return !!v; if (s.k === "slider") return v != null; return v && v.toString().trim().length > 0; };
  const ready = Object.keys(cfg.slots).every(filled);
  const leadBody = cfg.lead.replace(/\.\s*$/, "");
  const parts = leadBody.split(/(\{[a-z]+\})/g);
  const activeExtras = (cfg.extras || []).filter((e) => has(e.id));
  const pendingExtras = (cfg.extras || []).filter((e) => !has(e.id) && editing !== e.id);
  const toggleDay = (name) => setVals((o) => { const cur = o[editing] || []; const next = cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]; next.sort((a, b) => DAYS_FULL.indexOf(a) - DAYS_FULL.indexOf(b)); return { ...o, [editing]: next }; });
  const setV = (v) => setVals((o) => ({ ...o, [editing]: v }));
  const close = () => { setEditing(null); setMq(""); setCq(""); };
  const s = editing ? getField(editing) : null;
  const isExtra = !!(editing && cfg.extras && cfg.extras.some((e) => e.id === editing));
  const doneBtn = (<button onClick={close} style={{ marginTop: 14, height: 44, width: "100%", borderRadius: 22, border: "none", cursor: "pointer", background: c1, color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14.5, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>Done</button>);

  const editor = () => {
    if (!s) return null;
    if (s.k === "pick") {
      const cur = vals[editing];
      const allOpts = [...s.o, ...(cur && !s.o.includes(cur) ? [cur] : [])];
      const addCustom = () => { const t = cq.trim(); if (t) { setV(t); close(); } };
      return <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{allOpts.map((opt) => { const sel = cur === opt; return <button key={opt} onClick={() => { setV(opt); close(); }} style={pillStyle(sel, c1)}>{opt}</button>; })}</div>
        {s.custom && <div style={{ display: "flex", gap: 8, marginTop: 10 }}><input value={cq} onChange={(e) => setCq(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} placeholder="Or type your own" style={customInput} />{cq.trim() && <button onClick={addCustom} style={addBtn(c1)}>Add</button>}</div>}
      </>;
    }
    if (s.k === "multi") {
      const sel = vals[editing] || [];
      const allOpts = [...s.o, ...sel.filter((x) => !s.o.includes(x))];
      const toggle = (opt) => setV(sel.includes(opt) ? sel.filter((x) => x !== opt) : [...sel, opt]);
      const addCustom = () => { const t = cq.trim(); if (t && !sel.includes(t)) setV([...sel, t]); setCq(""); };
      return <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{allOpts.map((opt) => { const on = sel.includes(opt); return <button key={opt} onClick={() => toggle(opt)} style={pillStyle(on, c1)}>{on && <span style={{ color: c1, display: "inline-flex" }}>{CHK}</span>}{opt}</button>; })}</div>
        {s.custom && <div style={{ display: "flex", gap: 8, marginTop: 10 }}><input value={cq} onChange={(e) => setCq(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} placeholder="Add your own" style={customInput} />{cq.trim() && <button onClick={addCustom} style={addBtn(c1)}>Add</button>}</div>}
        {doneBtn}
      </>;
    }
    if (s.k === "days") return <>
      <div style={{ display: "flex", gap: 7 }}>{DAY_LETTER.map((L, idx) => { const name = DAYS_FULL[idx], on = (vals[editing] || []).includes(name); return <button key={idx} onClick={() => toggleDay(name)} style={dayStyle(on, c1)}>{L}</button>; })}</div>
      {doneBtn}
    </>;
    if (s.k === "schedule") {
      const v = vals[editing];
      const setSched = (patch) => setV({ ...v, ...patch });
      const setMode = (m) => setV({ mode: m, n: v.n || 2, days: v.days || [] });
      const toggleSDay = (name) => { const cur = v.days || []; const next = cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]; next.sort((a, b) => DAYS_FULL.indexOf(a) - DAYS_FULL.indexOf(b)); setSched({ days: next }); };
      const stepN = (min, max, one, many) => (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, margin: "4px 0 2px" }}>
          <button onClick={() => setSched({ n: Math.max(min, (v.n || 2) - 1) })} style={roundBtn}>{MINUS}</button>
          <div style={{ textAlign: "center", minWidth: 100 }}>
            {v.mode === "week" && (v.n || 2) >= 7
              ? <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 28, fontWeight: 600, color: TOKENS.ink }}>Every day</div>
              : <><div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 32, fontWeight: 600, color: TOKENS.ink }}>{v.n || 2}</div><div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: TOKENS.sub }}>{(v.n || 2) === 1 ? one : many}</div></>}
          </div>
          <button onClick={() => setSched({ n: Math.min(max, (v.n || 2) + 1) })} style={roundBtn}>{PLUS}</button>
        </div>
      );
      return <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>{SCHED_MODES.map((md) => { const on = v.mode === md.m; return <button key={md.m} onClick={() => setMode(md.m)} style={pillStyle(on, c1)}>{md.label}</button>; })}</div>
        {v.mode === "week" && stepN(1, 7, "time a week", "times a week")}
        {v.mode === "month" && stepN(1, 8, "time a month", "times a month")}
        {v.mode === "days" && <div style={{ display: "flex", gap: 7 }}>{DAY_LETTER.map((L, idx) => { const name = DAYS_FULL[idx], on = (v.days || []).includes(name); return <button key={idx} onClick={() => toggleSDay(name)} style={dayStyle(on, c1)}>{L}</button>; })}</div>}
        {v.mode === "alt" && <div style={noteStyle}>Posts every other day, automatically.</div>}
        {v.mode === "once" && <div style={noteStyle}>A single post, one time.</div>}
        {doneBtn}
      </>;
    }
    if (s.k === "slider") return <><div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, marginBottom: 16 }}><span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 36, fontWeight: 600, color: TOKENS.ink }}>{vals[editing]}{vals[editing] >= s.max ? "+" : ""}</span><span style={{ fontFamily: "Inter, sans-serif", fontSize: 15, color: TOKENS.sub }}>{s.unit}{vals[editing] === 1 ? "" : "s"}</span></div><input type="range" min={s.min} max={s.max} step={1} value={vals[editing]} onChange={(e) => setV(parseInt(e.target.value))} style={{ width: "100%", accentColor: c1, height: 6 }} /><div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}><span style={tickStyle}>{s.min} {s.unit}</span><span style={tickStyle}>{s.max}+ {s.unit}s</span></div>{doneBtn}</>;
    if (s.k === "date") return <MiniCal value={vals[editing]} accent={c1} onPick={(d) => { setV(d); close(); }} />;
    if (s.k === "time") return <><TimePick value={vals[editing]} accent={c1} onChange={(v) => setV(v)} />{doneBtn}</>;
    if (s.k === "num") return <><div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${TOKENS.line}`, borderRadius: 12, padding: "0 14px", height: 52 }}><span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 20, color: TOKENS.sub, marginRight: 2 }}>$</span><input value={(vals[editing] || "").replace(/^\$/, "")} onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ""); setV(n ? "$" + n : ""); }} inputMode="numeric" autoFocus placeholder="0" style={{ flex: 1, border: "none", outline: "none", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 20, color: TOKENS.ink, background: "transparent" }} /></div>{doneBtn}</>;
    if (s.k === "menu") {
      const src = (menu && menu.length) ? menu : MENU;
      const list = src.filter((it) => it.l.toLowerCase().includes(mq.toLowerCase()));
      const custom = mq.trim() && !src.some((it) => it.l.toLowerCase() === mq.trim().toLowerCase());
      return <>
        <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1.5px solid ${TOKENS.line}`, borderRadius: 12, padding: "0 12px", height: 46, marginBottom: 8 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#aab0ac" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input value={mq} onChange={(e) => setMq(e.target.value)} placeholder="Search your menu, or type your own" autoFocus style={{ flex: 1, border: "none", outline: "none", fontFamily: "Inter, sans-serif", fontSize: 14.5, color: TOKENS.ink, background: "transparent" }} />
        </div>
        <div style={{ maxHeight: 188, overflowY: "auto" }}>
          {list.map((it) => (<button key={it.l} onClick={() => { setV(it.l); close(); }} style={{ width: "100%", display: "flex", alignItems: "center", background: "none", border: "none", borderTop: `1px solid ${TOKENS.line}`, padding: "11px 2px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}><span style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink }}>{it.l}</span></button>))}
          {custom && (<button onClick={() => { setV(mq.trim()); close(); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", borderTop: `1px solid ${TOKENS.line}`, padding: "11px 2px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c1} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg><span style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: c1, fontWeight: 600 }}>Use "{mq.trim()}"</span></button>)}
        </div>
      </>;
    }
    if (s.k === "text") return <><input value={vals[editing]} onChange={(e) => setV(e.target.value)} autoFocus placeholder={s.ph || ""} style={{ width: "100%", border: `1.5px solid ${TOKENS.line}`, borderRadius: 12, padding: "12px 14px", fontFamily: "Inter, sans-serif", fontSize: 15, color: TOKENS.ink, outline: "none", boxSizing: "border-box" }} />{doneBtn}</>;
    return null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: gType(p.type), position: "relative" }}>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 22px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, marginBottom: 24 }}>
          <CircleBtn onClick={onBack} dark>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </CircleBtn>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 18, fontWeight: 600, color: "#fff" }}>{p.title}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" /></svg>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, letterSpacing: 1.4, color: "rgba(255,255,255,0.92)", textTransform: "uppercase" }}>Here's a starting point</span>
        </div>
        <div style={{ fontFamily: "'Cal Sans', Poppins, system-ui, sans-serif", fontWeight: 600, fontSize: 25, lineHeight: 1.42, letterSpacing: -0.3 }}>
          {parts.map((part, i) => {
            const m = part.match(/^\{([a-z]+)\}$/);
            if (!m) return <span key={i} style={{ color: editing ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.92)", transition: "color 200ms ease" }}>{part}</span>;
            const k = m[1], isActive = editing === k, isFilled = filled(k);
            return (
              <span key={i} onClick={() => setEditing(isActive ? null : k)} style={{
                cursor: "pointer", color: isActive ? "#fff" : editing ? "rgba(255,255,255,0.5)" : "#fff",
                textDecoration: "underline", textDecorationStyle: isFilled ? "solid" : "dashed", textDecorationThickness: 2, textUnderlineOffset: 4,
                textDecorationColor: isActive ? "#fff" : "rgba(255,255,255,0.7)", transition: "color 200ms ease",
              }}>{fmt(k)}</span>
            );
          })}
          {activeExtras.map((e) => (
            <span key={e.id} onClick={() => setEditing(e.id)} style={{
              cursor: "pointer", color: editing === e.id ? "#fff" : editing ? "rgba(255,255,255,0.5)" : "#fff",
              textDecoration: "underline", textDecorationStyle: "solid", textDecorationThickness: 2, textUnderlineOffset: 4,
              textDecorationColor: editing === e.id ? "#fff" : "rgba(255,255,255,0.7)", transition: "color 200ms ease",
            }}>{e.clause(vals[e.id])}</span>
          ))}
          <span style={{ color: editing ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.92)", transition: "color 200ms ease" }}>.</span>
        </div>
        {s ? (
          <div style={{ marginTop: 20, background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, color: TOKENS.faint, textTransform: "uppercase", marginBottom: 12 }}>{s.label ? s.label : s.k === "multi" ? "Pick any that fit" : "Change this"}</div>
            {editor()}
            {isExtra && <button onClick={() => { setV(Array.isArray(vals[editing]) ? [] : ""); close(); }} style={removeBtn}>Remove</button>}
          </div>
        ) : (
          <>
            {pendingExtras.length > 0 && (
              <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 9 }}>
                {pendingExtras.map((e) => (
                  <button key={e.id} onClick={() => setEditing(e.id)} style={addPillStyle}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>{e.label}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "rgba(255,255,255,0.8)", marginTop: 14 }}>Tap anything underlined to change it.</div>
            {listLocked && <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>Connect your email list to add email and text.</div>}
          </>
        )}
      </div>
      <div style={{ flexShrink: 0, padding: "12px 22px 20px" }}>
        {itemId === "gbp" && (gbpLaneOf(vals.doer) === "diy" || gbpLaneOf(vals.doer) === "ai")
          ? <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "rgba(255,255,255,0.92)", textAlign: "center", marginBottom: 10 }}>Free. You do the work yourself, and we guide you step by step.</div>
          : priceLabel(itemId) && <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "rgba(255,255,255,0.92)", textAlign: "center", marginBottom: 10 }}>About {priceLabel(itemId)}. You approve before anything runs, and only pay when each piece ships.</div>}
        {(() => { const m = monthlyTotalLine(itemId, monthlyCommitment, liveCount, monthlyCap); if (!m) return null;
          return m.warn
            ? <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "8px 12px", textAlign: "center", marginBottom: 10 }}>{m.text}</div>
            : <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.85)", textAlign: "center", marginBottom: 10 }}>{m.text}</div>;
        })()}
        <button onClick={() => ready && onGenerate(vals)} disabled={!ready} style={{ width: "100%", height: 54, borderRadius: 27, border: "none", cursor: ready ? "pointer" : "default", background: ready ? "#fff" : "rgba(255,255,255,0.45)", color: ready ? c1 : "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontWeight: 600, fontSize: 16.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent", transition: "background 150ms ease" }}>
          Build my plan
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ready ? c1 : "#fff"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

function Generating({ itemId, onDone }) {
  const p = catGet(itemId) || CATALOG[0];
  const lines = ["Looking at your menu", "Choosing the right pieces", "Drafting your plan", "Setting the schedule"];
  const [li, setLi] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setLi((x) => Math.min(x + 1, lines.length - 1)), 460);
    const t = setTimeout(onDone, 2050);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: gType(p.type) }}>
      <style>{`@keyframes aspin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
        <div style={{ width: 58, height: 58, borderRadius: 29, border: "4px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "aspin 0.8s linear infinite", marginBottom: 26 }} />
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 22, fontWeight: 600, color: "#fff", marginBottom: 10, textAlign: "center" }}>Building your plan</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, color: "rgba(255,255,255,0.9)", textAlign: "center", minHeight: 20 }}>{lines[li]}</div>
      </div>
    </div>
  );
}

function readSlot(s, v) {
  if (s.k === "days") return v.length ? joinList(v) : "those days";
  if (s.k === "date") return v ? v.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "the date";
  if (s.k === "time") return `${v.h}:${v.m} ${v.ap.toUpperCase()}`;
  if (s.k === "slider") return `${v}${v >= s.max ? "+" : ""} ${s.unit}${v === 1 ? "" : "s"}`;
  if (s.k === "schedule") return fmtSched(v);
  if (s.k === "multi") return v && v.length ? joinList(v) : "a few things";
  return v;
}
const PLAYBOOK = {
  reach: (r) => [
    { tag: "Get found", what: "Tune up your Google profile so you show up in nearby searches" },
    { tag: "Post", what: `Share local posts and a short video to people within ${r("radius")}` },
    { tag: "Boost", what: "Put a small paid boost behind the best post to reach more nearby" },
    { tag: "Reply", what: "Reply to every new review to build trust with new guests" },
  ],
  nights: (r) => [
    { tag: "Offer", what: `Set up ${r("offer")} for your slow nights` },
    { tag: "Post", what: `Post a reminder the day before, every ${r("days")}` },
    { tag: "Text", what: "Text your nearby regulars a heads-up" },
    { tag: "Reply", what: "Auto-reply to questions about the offer" },
  ],
  firstvisit: (r) => [
    { tag: "Offer", what: `Set up ${r("offer")} for first-time guests` },
    { tag: "Reach", what: "Show it to nearby people who haven't visited yet" },
    { tag: "Track", what: "Track how many redeem it and come in" },
  ],
  regulars: (r) => [
    { tag: "Set up", what: `Set up ${r("reward")} to bring guests back` },
    { tag: "Text", what: "Send a thank-you and the reward to past guests" },
    { tag: "Remind", what: "Nudge guests who haven't been in a while" },
  ],
  catering: (r) => [
    { tag: "Reach", what: `Promote catering to ${r("audience")}` },
    { tag: "Make", what: "Create a simple catering post and an easy quote link" },
    { tag: "Follow up", what: "Follow up with anyone who asks for a quote" },
  ],
  reviewsplan: (r) => [
    { tag: "Ask", what: `Ask happy guests for a review, ${r("how")}` },
    { tag: "Reply", what: `Reply to ${r("which")}, you approve each one` },
    { tag: "Track", what: "Watch your rating and review count climb" },
  ],
  reel: (r) => [
    { tag: "Film", what: `Shoot and edit a short video of ${r("subject")}` },
    { tag: "Caption", what: "Write a caption and hashtags in your voice" },
    { tag: "Post", what: "Post it once, after you approve it" },
  ],
  story: (r) => [
    { tag: "Make", what: `Create a story about ${r("subject")}` },
    { tag: "Post", what: "Post it once, after you approve" },
  ],
  carousel: (r) => [
    { tag: "Design", what: `Build a carousel of ${r("subject")} as ${r("format")}` },
    { tag: "Caption", what: "Write a caption in your voice" },
    { tag: "Post", what: "Post it once, after you approve" },
  ],
  graphic: (r) => [
    { tag: "Design", what: `Design a graphic for ${r("purpose")}${r("headline") ? ` that reads "${r("headline")}"` : ""}` },
    { tag: "Size", what: `Set it up for ${r("where")}` },
    { tag: "Review", what: "Send you a draft to approve, with one round of changes" },
  ],
  dish: (r) => [
    { tag: "Create", what: `Make ${r("format")} of ${r("subject")}` },
    { tag: "Caption", what: "Write a caption in your voice" },
    { tag: "Post", what: "Post it once, after you approve" },
  ],
  gpost: (r) => [
    { tag: "Write", what: `Write a Google post about ${r("subject")}` },
    { tag: "Publish", what: "Publish it to your Google listing after you approve" },
  ],
  promoevent: (r) => [
    { tag: "Tease", what: `Build interest in ${r("event")} before the night` },
    { tag: "Remind", what: "Give your list a heads-up, then a push on the day" },
    { tag: "Recap", what: "Share how the night went after" },
  ],
  launch: (r) => [
    { tag: "Tease", what: `Tease ${r("subject")} a few days before ${r("date")}` },
    { tag: "Launch", what: `Announce it with ${r("special")} on ${r("date")}, across posts and stories` },
    { tag: "Email", what: "Email and text your list the day it drops" },
    { tag: "Follow up", what: "Post a follow-up mid-week to keep it going" },
  ],
  creator: (r) => [
    { tag: "Find", what: `Find ${r("tier")} who fits your spot` },
    { tag: "Brief", what: `Brief them to feature ${r("subject")}` },
    { tag: "Share", what: "Reshare their post to your followers" },
  ],
  welcome: (r) => [
    { tag: "Write", what: `Write a welcome email with ${r("message")}` },
    { tag: "Automate", what: "Send it automatically when someone joins" },
  ],
  second: (r) => [
    { tag: "Write", what: `Write a come-back email with ${r("offer")}` },
    { tag: "Automate", what: "Send it a few days after a first visit" },
  ],
  news: (r) => [
    { tag: "Write", what: `Write the newsletter (${r("cadence")}), sharing ${r("content")}` },
    { tag: "Design", what: "Lay it out to match your brand" },
    { tag: "Send", what: "Send it and track who opens and clicks" },
  ],
  slowoffer: (r) => [
    { tag: "Make", what: `Set up ${r("offer")}, good on ${r("days")}` },
    { tag: "Send", what: `Send it by ${r("channel")} before those days` },
  ],
  birthday: (r) => [
    { tag: "Set up", what: `Set up ${r("treat")} for birthdays` },
    { tag: "Automate", what: `Send it by ${r("channel")} the morning of their birthday` },
  ],
  earlyaccess: (r) => [
    { tag: "Set up", what: `Give subscribers early access to ${r("what")}` },
    { tag: "Send", what: `Email your list ${r("timing")} before everyone else` },
  ],
  shoot: (r) => [
    { tag: "Plan", what: `Plan a ${r("kind")} shoot of ${r("what")} for ${r("date")}` },
    { tag: "Shoot", what: "Capture everything in one session" },
    { tag: "Deliver", what: "Edit and hand over the final files for you to use" },
  ],
  gbp: (r) => [
    { tag: "Review", what: `Review your Google profile: ${r("what")}` },
    { tag: "Update", what: "Fix and update each one" },
    { tag: "Check", what: "Make sure it looks right on search and maps" },
  ],
  reviewsreply: (r) => [
    { tag: "Draft", what: `Draft replies to ${r("which")} reviews` },
    { tag: "Approve", what: "You approve each reply before it posts" },
  ],
  qr: (r) => [
    { tag: "Make", what: `Create a QR and a page that ${r("action")}` },
    { tag: "Print", what: "Give you a table sign to print" },
  ],
  friction: (r) => [
    { tag: "Review", what: `Walk through ${r("channel")} as a guest would` },
    { tag: "Fix", what: "Cut the steps that lose people" },
    { tag: "Test", what: "Test it and confirm it's faster" },
  ],
  giftcard: (r) => [
    { tag: "Set up", what: `Set up ${r("kind")} gift cards in ${r("amounts")}${r("offer") ? `, with ${r("offer")}` : ""}` },
    { tag: "Make", what: `Create a post and buy link for ${r("occasion")}` },
    { tag: "Send", what: "Share it with your list and on social" },
  ],
  ticket: (r) => [
    { tag: "Set up", what: `Set up ticket sales for ${r("event")} at ${r("price")}${r("cap") ? `, room for ${r("cap")}` : ""}` },
    { tag: "Promote", what: `Promote it for ${r("date")} at ${r("time")}, across posts and email` },
    { tag: "Remind", what: "Send a reminder the day before" },
  ],
  winback: (r) => [
    { tag: "Watch", what: `Spot guests who haven't visited in ${r("time")}` },
    { tag: "Send", what: `Automatically send ${r("offer")}` },
  ],
};
function genSteps(p, cfg, vals) {
  const read = (k) => { const f = cfg.slots[k] || (cfg.extras && cfg.extras.find((e) => e.id === k)); return f ? readSlot(f, vals[k]) : ""; };
  const fn = PLAYBOOK[p.id];
  if (fn) return fn(read);
  return [
    { tag: "Set up", what: `Set up ${p.title.toLowerCase()}` },
    { tag: "Review", what: "Get it ready for you to check" },
    { tag: "Go live", what: "Put it live once you approve" },
  ];
}

/* ============================================================
   Quick check — the AI-led clarifier. A few straightforward,
   pre-answered questions (objective, budget, timing, who, offer)
   the owner can tap OR type, plus an open box the AI reads. The
   answers feed the plan build. Replaces the per-piece Mad Libs.
   ============================================================ */
const QC_GOALS = [
  { id: "new", label: "More new faces" },
  { id: "regulars", label: "Bring regulars back" },
  { id: "slow", label: "Fill slow nights" },
  { id: "reviews", label: "More reviews" },
  { id: "event", label: "Promote an event" },
  { id: "catering", label: "Grow catering" },
  { id: "online", label: "More online orders" },
  { id: "brand", label: "Get our name out" },
];
const QC_PLAY_GOAL = { reach: "new", firstvisit: "new", nights: "slow", slowoffer: "slow", regulars: "regulars", second: "regulars", winback: "regulars", welcome: "regulars", birthday: "regulars", earlyaccess: "regulars", news: "regulars", reviewsplan: "reviews", reviewsreply: "reviews", promoevent: "event", launch: "event", ticket: "event", catering: "catering", friction: "online", qr: "online", gbp: "online", giftcard: "brand", shoot: "brand", creator: "brand", reel: "brand", dish: "brand", story: "brand", carousel: "brand", graphic: "brand", gpost: "brand" };
const QC_AUD = {
  new: ["People nearby", "Folks searching for us"],
  slow: ["People nearby", "Guests who came before"],
  regulars: ["Guests who came before", "Came once, never back"],
  event: ["People nearby", "Our regulars"],
  catering: ["Offices nearby", "Event planners", "Past big orders"],
  online: ["People nearby", "Past online orders"],
  reviews: [],
  brand: [],
};

function QcSection({ q, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9 }}>
        <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: TOKENS.ink }}>{q}</span>
        {hint && <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: TOKENS.faint }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function QuickCheck({ itemId, restaurant, menu, budgetDefault = 0, onBuild, onBack }) {
  const c1 = TOKENS.mintDark;
  const [goal, setGoal] = useState(() => QC_PLAY_GOAL[itemId] || "new");
  const [goalText, setGoalText] = useState("");
  const [showGoalText, setShowGoalText] = useState(false);
  const [budget, setBudget] = useState(() => (budgetDefault > 0 ? "$" + budgetDefault : ""));
  const [timing, setTiming] = useState("Start this week");
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 14); return d; });
  const audOpts = QC_AUD[goal] || [];
  const [audience, setAudience] = useState(audOpts[0] || "");
  const [offer, setOffer] = useState(() => (["reviews", "brand"].includes(goal) ? "No offer" : "A small deal, you pick"));
  const [offerText, setOfferText] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const o = QC_AUD[goal] || [];
    setAudience(o[0] || "");
    setOffer(["reviews", "brand"].includes(goal) ? "No offer" : "A small deal, you pick");
  }, [goal]);

  const build = () => onBuild({
    goal, goalLabel: QC_GOALS.find((g) => g.id === goal)?.label, goalText: goalText.trim(),
    budget: budget.trim(), timing, date: timing === "Around a date" ? date : null,
    audience: audOpts.length ? audience : "", offer, offerText: offerText.trim(), notes: notes.trim(),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fbfcfb" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 16px" }}>
        <div style={{ paddingTop: 4, marginBottom: 2 }}>
          <CircleBtn onClick={onBack}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg></CircleBtn>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "12px 0 6px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill={TOKENS.mintDark}><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" /></svg>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: TOKENS.mintDark, textTransform: "uppercase" }}>Quick check</span>
        </div>
        <h2 style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 22, fontWeight: 600, color: TOKENS.ink, lineHeight: 1.2, margin: "0 0 6px", letterSpacing: -0.3 }}>A few quick taps</h2>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: TOKENS.sub, lineHeight: 1.5, margin: "0 0 14px" }}>So our AI builds the right plan. Most is set from your account. Tap to change, or type your own.</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 22 }}>
          {[restaurant, (menu && menu.length ? `${menu.length} menu items` : null), (budgetDefault > 0 ? `$${budgetDefault}/mo budget` : null)].filter(Boolean).map((t, i) => (
            <span key={i} style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, padding: "5px 10px", borderRadius: 999, background: "#eef1ef", color: TOKENS.sub }}>{t}</span>
          ))}
        </div>

        <QcSection q="What do you want this to do?" hint="from your account">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QC_GOALS.map((g) => <button key={g.id} onClick={() => { setGoal(g.id); setShowGoalText(false); }} style={pillStyle(goal === g.id && !showGoalText, c1)}>{g.label}</button>)}
            <button onClick={() => setShowGoalText((s) => !s)} style={pillStyle(showGoalText, c1)}>Tell us in your words</button>
          </div>
          {showGoalText && <div style={{ marginTop: 10 }}><input value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="Like: I want my Tuesdays full again" style={customInput} /></div>}
        </QcSection>

        <QcSection q="What can you spend a month?" hint="you only pay as pieces ship">
          <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${TOKENS.line}`, borderRadius: 12, padding: "0 14px", height: 50, background: "#fff", marginBottom: 9 }}>
            <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 19, color: TOKENS.sub, marginRight: 2 }}>$</span>
            <input value={budget.replace(/^\$/, "")} onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ""); setBudget(n ? "$" + n : ""); }} inputMode="numeric" placeholder="0" style={{ flex: 1, border: "none", outline: "none", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 19, color: TOKENS.ink, background: "transparent" }} />
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: TOKENS.faint }}>/ month</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>{["$150", "$300", "$500"].map((a) => <button key={a} onClick={() => setBudget(a)} style={pillStyle(budget === a, c1)}>{a}</button>)}</div>
        </QcSection>

        <QcSection q="When should this run?">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{["Start this week", "Around a date", "No rush"].map((t) => <button key={t} onClick={() => setTiming(t)} style={pillStyle(timing === t, c1)}>{t}</button>)}</div>
          {timing === "Around a date" && <div style={{ marginTop: 12, background: "#fff", border: `1px solid ${TOKENS.line}`, borderRadius: 14, padding: 12 }}><MiniCal value={date} accent={c1} onPick={(d) => setDate(d)} /></div>}
        </QcSection>

        {audOpts.length > 0 && (
          <QcSection q="Who is this for?">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{audOpts.map((a) => <button key={a} onClick={() => setAudience(a)} style={pillStyle(audience === a, c1)}>{a}</button>)}</div>
          </QcSection>
        )}

        <QcSection q="Want an offer behind this?">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{["A small deal, you pick", "No offer", "I have one"].map((o) => <button key={o} onClick={() => setOffer(o)} style={pillStyle(offer === o, c1)}>{o}</button>)}</div>
          {offer === "I have one" && <div style={{ marginTop: 10 }}><input value={offerText} onChange={(e) => setOfferText(e.target.value)} placeholder="Like: free side with any entree" style={customInput} /></div>}
        </QcSection>

        <QcSection q="Anything else we should know?" hint="optional">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Tell our AI anything: what makes you special, or what to avoid" style={{ width: "100%", border: `1.5px solid ${TOKENS.line}`, borderRadius: 12, padding: "11px 13px", fontFamily: "Inter, sans-serif", fontSize: 14, color: TOKENS.ink, outline: "none", boxSizing: "border-box", resize: "none", lineHeight: 1.45 }} />
        </QcSection>
      </div>
      <div style={{ flexShrink: 0, padding: "12px 20px 20px", borderTop: `1px solid ${TOKENS.line}`, background: "#fff" }}>
        <button onClick={build} style={{ width: "100%", height: 52, borderRadius: 26, border: "none", cursor: "pointer", background: TOKENS.mint, color: "#fff", fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent" }}>
          Build my plan
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
        </button>
        <div onClick={build} style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: TOKENS.faint, textAlign: "center", marginTop: 11, cursor: "pointer" }}>Skip, just build it</div>
      </div>
    </div>
  );
}

function Phone({ children }) {
  return (
    <div style={{
      width: 384, height: 812, background: "#0c0d0e", borderRadius: 56, padding: 11,
      boxShadow: "0 50px 90px -20px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.04)", flexShrink: 0,
    }}>
      <div style={{ width: "100%", height: "100%", background: "#fff", borderRadius: 46, overflow: "hidden", position: "relative" }}>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   Create-only controller (portal). Renders the canonical new
   builder flow full-screen (no phone frame, no home/campaigns/nav,
   no legacy intake path). Props:
     restaurant : business name (string)
     menu       : real menu items [{name, price}] (optional; falls back to seed)
     onCreate   : ({ itemId, status, vals }) => void  — persist hook
     onClose    : () => void                           — exit the builder
   ============================================================ */
export default function ApnoshCampaign({ restaurant = "Yellowbee Market & Cafe", menu, initialItem, recommended, recsLoading, initialLens, monthlyCommitment = 0, liveCount = 0, monthlyCap = 0, hasList, profile, whySignals, tier = null, clientId = null, onCreate, onClose, onPlan } = {}) {
  // Deep links (Home suggestions, ?template=) land on the PRODUCT PAGE too, never the bare madlib.
  const [route, setRoute] = useState(() => (initialItem ? { name: "pdp", itemId: buildIdFor(initialItem) } : { name: "browse" }));

  const exit = () => { if (onClose) onClose(); };

  // Catalog card -> PRODUCT PAGE (the sell) -> Continue -> Builder (the madlib). Every
  // open path (shelf tap, see-all grid, suggested/featured cards, deep links) funnels
  // through here. Non-catalog pseudo-items ("__else") keep going straight to the builder.
  const openCard = (id, from, rowId) => {
    if (catGet(id)) setRoute({ name: "pdp", itemId: id, from, rowId });
    else setRoute({ name: "build", itemId: buildIdFor(id), from, rowId });
  };
  const backToBrowse = () => setRoute({ name: "browse" });
  const backToSource = () => (route.from === "catall" ? setRoute({ name: "catall", rowId: route.rowId }) : backToBrowse());

  // Save for real, then route on the outcome: confirm on success, a retry
  // screen on failure. The old code showed "added" before the write landed,
  // so a failed save still read as success and nothing was actually saved.
  const [saving, setSaving] = useState(false);
  const runSave = async (ctx, success) => {
    if (saving) return;
    setSaving(true);
    setRoute({ name: "saving" });
    let ok = true;
    try {
      if (onCreate) ok = await onCreate({ itemId: ctx.itemId, status: ctx.status, vals: ctx.vals || {} });
    } catch {
      ok = false;
    }
    setSaving(false);
    if (ok === false) setRoute({ name: "saveerror", ctx, success });
    // On success, onCreate navigates to the campaign's detail page; the saving
    // screen stays until that route change unmounts the builder.
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#f0f0f3", display: "flex", justifyContent: "center" }}>
      <div className="apncreate" style={{ width: "100%", maxWidth: 480, height: "100dvh", background: "#fff", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 0 40px rgba(0,0,0,0.06)" }}>
        <style>{`
          .apncreate, .apncreate * { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
          .apncreate ::-webkit-scrollbar { width: 0; height: 0; }
          .apncreate textarea::placeholder { color: #b7bdb9; }
          @keyframes apndot { 0%, 100% { opacity: 0.35; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
          @keyframes aspin { to { transform: rotate(360deg); } }
          @keyframes apnrise { from { opacity: 0; transform: translateY(11px); } to { opacity: 1; transform: none; } }
          @keyframes apnexpand { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
          .apnrise { animation: apnrise 500ms cubic-bezier(.2,.7,.2,1) both; }
          .apnrise2 { animation: apnrise 620ms cubic-bezier(.2,.7,.2,1) both; }
          .apnexpand { animation: apnexpand 200ms ease both; }
          .apnpress { transition: transform 120ms ease, box-shadow 160ms ease; }
          .apnpress:active { transform: scale(0.975); }
          @media (prefers-reduced-motion: reduce) { .apnrise, .apnrise2, .apnexpand { animation: none; } .apnpress:active { transform: none; } }
        `}</style>

        {/* Screen content sits above the persistent bottom nav, so the create
            flow keeps the same chrome as the rest of the owner app (uniform).
            Each screen renders its own contextual top bar; the browse landing
            uses the standard AppHeader so it reads like a tab-level screen. */}
        <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
          {route.name === "browse" && (
            <>
              <AppHeader />
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                <PlanBrowse restaurant={restaurant} recommended={recommended} recsLoading={recsLoading} initialLens={initialLens} onOpen={(id) => openCard(id, "browse")} onSeeAll={(rowId) => setRoute({ name: "catall", rowId })} />
              </div>
            </>
          )}

          {route.name === "catall" && (
            <CategoryAll rowId={route.rowId} onBack={backToBrowse} onOpen={(id) => openCard(id, "catall", route.rowId)} />
          )}

          {route.name === "pdp" && (
            <ProductPage
              itemId={route.itemId}
              signals={whySignals}
              tier={tier}
              clientId={clientId}
              restaurant={restaurant}
              initialDoer={route.preset && route.preset.doer}
              initialOptions={route.preset && route.preset.options}
              onBack={backToSource}
              onOpenCard={(id) => setRoute({ name: "pdp", itemId: id, from: route.from, rowId: route.rowId })}
              onContinue={(preset) => setRoute({ name: "build", itemId: buildIdFor(route.itemId), from: route.from, rowId: route.rowId, preset: preset || undefined, fromPdp: true })}
            />
          )}

          {route.name === "build" && (
            <Builder itemId={route.itemId} menu={menu} monthlyCommitment={monthlyCommitment} liveCount={liveCount} monthlyCap={monthlyCap} hasList={hasList} profile={profile} preset={route.preset} onBack={route.fromPdp ? () => setRoute({ name: "pdp", itemId: route.itemId, from: route.from, rowId: route.rowId, preset: route.preset }) : backToSource} onGenerate={(vals) => (onPlan ? onPlan({ itemId: route.itemId, vals }) : setRoute({ name: "generating", itemId: route.itemId, vals, from: route.from, rowId: route.rowId }))} />
          )}

          {route.name === "generating" && (
            <Generating itemId={route.itemId} onDone={() => runSave({ itemId: route.itemId, status: "approve", vals: route.vals, from: route.from, rowId: route.rowId }, {})} />
          )}

          {route.name === "saving" && <SavingScreen />}

          {route.name === "saveerror" && (
            <SaveError
              onRetry={() => runSave(route.ctx, route.success)}
              onBack={() => setRoute({ name: "build", itemId: route.ctx.itemId, from: route.ctx.from, rowId: route.ctx.rowId })}
            />
          )}

        </div>

        <BottomNav active="campaigns" />
      </div>
    </div>
  );
}
