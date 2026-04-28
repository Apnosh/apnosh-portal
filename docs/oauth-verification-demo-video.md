# OAuth Verification Demo Video — Recording Guide

A ~90-second screen recording is the **single biggest signal** that improves first-pass approval odds for OAuth verification of sensitive scopes. This guide gives you the exact script, what to capture, and how to upload.

---

## What you need

- **QuickTime Player** (built into macOS) or any screen recorder
- **A YouTube account** (the apnosh@gmail.com one is fine)
- **portal.apnosh.com open in Chrome**, signed in as the admin
- **15 minutes total** including a couple of recording attempts

---

## Pre-flight checklist (do this once before hitting record)

1. **Sign in as admin** at `portal.apnosh.com`
2. **Pick a client with real-looking data** — Anchovies and Salt is a good demo target since it has the most impressions
3. **Open three browser tabs** in this order so you can flip between them on screen:
   - Tab 1: client list page (`/admin/clients`)
   - Tab 2: Anchovies and Salt client detail → Performance → Local SEO sub-tab
   - Tab 3: `/admin/integrations`
4. **Hide other distractions** — quit Slack notifications, hide the dock, full-screen Chrome
5. **Test your microphone** — say "testing" and play it back. Voice-over is critical; reviewers watch with sound on

---

## The script (read this aloud while recording)

Total target: 75–90 seconds. Don't rush, but don't pad.

```
[Tab 1 — admin client list]
"This is portal.apnosh.com — the Apnosh client portal.
Apnosh is a Seattle marketing agency that operates this portal
for our 11 active restaurant clients. We manage 21 verified
Google Business Profile locations under our agency Google account.

[Click into Anchovies and Salt → Performance tab → Local SEO sub-tab]

When a client logs in, this is what they see — their own
private dashboard. Here on the Local SEO tab, the data we
get from the Google Business Profile API: impressions split
by Google Search and Google Maps, mobile and desktop, plus
customer actions — phone calls, direction requests, website
clicks. We also surface the top search queries that brought
people to their listing.

[Hover briefly over the trend chart and the top-queries panel]

We use the business.manage scope only to read these metrics.
We never write, modify, or delete any Business Profile content
through the API. Edits stay manual through Business Profile Manager.

[Switch to Tab 3 — /admin/integrations]

The admin connects once via this Integrations page. The Apnosh
agency Google account holds Manager access on each client's
listing — that's what authorizes our read access. From here a
daily Vercel cron at /api/cron/gbp-api-sync pulls yesterday's
metrics for every location.

Each restaurant operator sees only their own location's data
through row-level security in our database. We never aggregate
across clients, never sell data, never use it for advertising.
Full data-handling details at portal.apnosh.com/about/local-seo.

Thanks."
```

**Practice once before recording.** The first take always sounds nervous. Second take is usually the keeper.

---

## Recording steps (QuickTime)

1. Open QuickTime Player → File → New Screen Recording
2. Click the small ▾ next to the record button → set Microphone to your Mac's built-in mic (or external if better quality)
3. Click record. Drag a box around just the Chrome window (not the whole screen — keeps file size and focus tight)
4. Read the script while clicking through the tabs as written
5. Stop recording with Cmd+Ctrl+Esc or the menu bar
6. Save to Desktop as `apnosh-oauth-demo.mov`

**Quality bar:** if you watch it back and can hear your voice clearly + see the UI elements clearly, it's good enough. Don't over-polish.

---

## Upload to YouTube

1. Sign in to youtube.com as `apnosh@gmail.com`
2. Click the camera icon top-right → "Upload video"
3. Drag in `apnosh-oauth-demo.mov`
4. Title: `Apnosh Portal — OAuth scope demo (business.manage)`
5. Description: paste this:
   ```
   Demo video for Google OAuth verification of the Apnosh Portal
   application (project apnosh-portal, project number 922204404585).
   Shows the user-facing Local SEO dashboard where the
   business.manage scope is used in read-only mode.

   Privacy: https://portal.apnosh.com/privacy
   Terms: https://portal.apnosh.com/terms
   About this integration: https://portal.apnosh.com/about/local-seo
   ```
6. **Visibility: Unlisted** (NOT Private — Google reviewers need link access without sign-in)
7. Audience: "No, it's not made for kids"
8. Skip ads, skip monetization
9. Publish → copy the Unlisted link (looks like `https://youtu.be/xxxxx`)

Save that link. You'll paste it into the OAuth verification form tomorrow.

---

## What if the video has a small mistake?

If you mis-spoke a word but everything else is fine, **leave it.** Reviewers care about the substance, not polish. Re-recording introduces hours of friction for marginal gain.

If something is genuinely wrong (you said "write" instead of "read", you accidentally showed another client's data, etc.), re-record. Otherwise ship.

---

## Common pitfalls

- ❌ **Recording the whole screen** — distracting; reviewers get confused
- ❌ **Background music** — never. Voice-over only
- ❌ **Faceless screen-only with subtitles** — voice-over is required for sensitive scopes
- ❌ **Showing real client PII** — if you happen to scroll past a phone number, it's fine, but don't zoom in on it
- ❌ **Visibility set to Private** — Google reviewers need the Unlisted link to play
- ❌ **Going over 2 minutes** — they stop watching past 90 seconds
- ❌ **Skipping the explicit "we never write" statement** — reviewers look for this exact phrasing for sensitive scopes

---

## After upload

Reply with the YouTube Unlisted link. We'll paste it into the OAuth verification form tomorrow morning along with the per-scope justification text.
